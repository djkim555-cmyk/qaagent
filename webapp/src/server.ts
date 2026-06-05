import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import type { Request, Response } from 'express'
import { PORT, PROJECT_ROOT, WEBAPP_ROOT, CONCURRENCY, MODEL, ENABLE_PLAYWRIGHT, authStatus } from './config.js'
import * as live from './runStore.js'
import * as repo from './repo.js'
import { startRun } from './orchestrator.js'
import { authenticate, isSuperPassword, hashPassword, issueCookie, clearAuthCookie, requireApi, requireSuper, type Identity } from './auth.js'
import { generatePersonas, chatPersona, chatScenario, saveScenarioFile, readScenarioFile } from './llm.js'
import * as pool from './personaPool.js'

const app = express()
const PUBLIC_DIR = path.join(WEBAPP_ROOT, 'public')
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
// 정적 SPA (Vue 3 + ViewLogic Router) — index.html, css/, src/views·logic·layouts
app.use(express.static(PUBLIC_DIR, { index: false }))

const envInfo = () => {
  const auth = authStatus()
  // hasApiKey 는 구버전 UI 호환용 별칭(인증 가능 여부). authMode 로 키/세션 구분.
  return { hasAuth: auth.ok, authMode: auth.mode, hasApiKey: auth.ok, concurrency: CONCURRENCY, model: MODEL, playwright: ENABLE_PLAYWRIGHT }
}
const listScenarioFiles = () =>
  fs.readdirSync(path.join(PROJECT_ROOT, 'scenarios')).filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => `scenarios/${f}`)

// 페르소나 리포트 폴더의 스크린샷 파일명 목록 (reports/runs/{runId}/{personaId}/*)
const listShots = (runId: string, personaId: string): string[] => {
  try {
    const dir = path.join(PROJECT_ROOT, 'reports', 'runs', runId, personaId)
    return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)).sort()
  } catch { return [] }
}

// $api(ViewLogic) 는 에러 본문의 message 필드를 읽는다 → error/message 동시 제공
const fail = (res: Response, status: number, msg: string) => res.status(status).json({ error: msg, message: msg })

// 프로젝트 필수 입력(서비스명·대상 URL) 검증. trim 후 빈값·잘못된 URL 형식을 차단한다.
// 통과 시 정규화된 값을 반환, 실패 시 사용자에게 보여줄 메시지를 반환.
function validateProjectInput(body: any): { name: string; baseUrl: string } | { error: string } {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const baseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() : ''
  if (!name) return { error: '서비스명은 필수 항목입니다.' }
  if (!baseUrl) return { error: '대상 URL은 필수 항목입니다.' }
  // http(s):// 로 시작하고 호스트가 있는지 확인
  let u: URL
  try { u = new URL(baseUrl) } catch { return { error: '유효한 URL을 입력해주세요. (예: https://example.com)' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'URL은 http:// 또는 https:// 로 시작해야 합니다.' }
  // 호스트는 도메인(점 포함) · localhost · IP 만 허용 (예: notaurl 같은 한 토큰 차단, 단 localhost 스테이징은 허용)
  const host = u.hostname
  const ok = !!host && (host.includes('.') || host === 'localhost' || host.startsWith('['))
  if (!ok) return { error: '유효한 URL을 입력해주세요. (예: https://example.com)' }
  return { name, baseUrl }
}

/* ───────────────── 인증 (게이트 앞단) ───────────────── */
app.post('/api/login', (req, res) => {
  const id = authenticate(req.body?.password)
  if (!id) return fail(res, 401, '비밀번호가 올바르지 않습니다.')
  issueCookie(res, id)
  res.json({ ok: true, role: id.role })
})
app.post('/api/logout', (_req, res) => { clearAuthCookie(res); res.json({ ok: true }) })

// 이후 모든 /api/* 는 인증 필요 (미인증 → 401). 통과 시 req.identity 부착.
app.use('/api', (req, res, next) => requireApi(req, res, next))

// 로그인 상태 확인 (ViewLogic checkAuthFunction 용) — 게이트 통과 = 인증됨
app.get('/api/auth/check', (req, res) => res.json({ authed: true, role: ident(req).role }))

/* helper */
const ident = (req: Request): Identity => (req as any).identity as Identity
// 관리자는 자기 소유 프로젝트만 접근. 최고관리자는 전부.
const canSeeProject = (id: Identity, project: any) => id.role === 'super' || Number(project?.manager_id) === id.managerId

// 로그인한 관리자가 등록한 시나리오만(최고관리자는 전부). 미등록/레거시 파일은 최고관리자만 본다.
const scenariosFor = (id: Identity): string[] => {
  const all = listScenarioFiles()
  if (id.role === 'super') return all
  const owners = repo.scenarioOwnerMap()
  return all.filter((p) => owners[p] === id.managerId)
}
// 시나리오 접근(읽기/실행) 권한: 최고관리자 전부, 관리자는 자신이 등록한 것만
const canSeeScenario = (id: Identity, p: string): boolean =>
  id.role === 'super' || repo.scenarioOwnerMap()[p] === id.managerId

function loadProject(req: Request, res: Response) {
  const p = repo.getProject(Number(req.params.id))
  if (!p) { fail(res, 404, '프로젝트를 찾을 수 없습니다.'); return null }
  if (!canSeeProject(ident(req), p)) { fail(res, 403, '이 프로젝트에 접근할 권한이 없습니다.'); return null }
  return p
}
// 실행(run) 접근: 그 실행이 속한 프로젝트의 소유 여부로 판정
function loadRunRow(req: Request, res: Response) {
  const row = repo.getRunRow(req.params.id)
  if (!row) { fail(res, 404, '실행을 찾을 수 없습니다.'); return null }
  const id = ident(req)
  if (id.role !== 'super') {
    const p = row.project_id ? repo.getProject(Number(row.project_id)) : null
    if (!p || !canSeeProject(id, p)) { fail(res, 403, '이 실행에 접근할 권한이 없습니다.'); return null }
  }
  return row
}

/* ───────────────── 페이지 데이터 API ───────────────── */
app.get('/api/env', (req, res) => res.json({ ...envInfo(), role: ident(req).role }))

app.get('/api/dashboard', (req, res) => {
  const weekCutoff = Date.now() - 7 * 86400 * 1000
  const id = ident(req)
  const mid = id.role === 'super' ? null : id.managerId
  res.json({ stats: repo.dashboardStats(weekCutoff, mid), projects: repo.managerProjectsOverview(mid), role: id.role })
})

// 전역 페르소나 시드 풀 (한국 인구통계 기반)
app.get('/api/personas/seed', (_req, res) => {
  const seedPath = path.join(PROJECT_ROOT, 'personas', 'persona-seed-500.json')
  const file = fs.existsSync(seedPath) ? seedPath : path.join(PROJECT_ROOT, 'personas', 'persona-seed.json')
  const seed = JSON.parse(fs.readFileSync(file, 'utf8'))
  res.json({ personas: seed.personas || [], dist: seed.distributionSummary || {}, meta: { description: seed.description, calibration: seed.calibration } })
})

// AI 대화형 페르소나 생성 (최고관리자 전용) — 대화 → (응답, 페르소나 초안)
app.post('/api/personas/chat', requireSuper, async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : []
    res.json(await chatPersona(messages))
  } catch (e: any) { fail(res, 500, e?.message || '대화 실패') }
})

// 시드 풀에 페르소나 1명 추가 (최고관리자 전용) — appendToPool 이 확정 ID 부여
app.post('/api/personas/seed', requireSuper, (req, res) => {
  const b = req.body ?? {}
  const name = String(b.name ?? '').trim()
  const age = Number(b.age)
  if (!name) return fail(res, 400, '이름을 입력하세요.')
  if (!Number.isFinite(age) || age < 1 || age > 120) return fail(res, 400, '나이는 1~120 사이로 입력하세요.')
  const ageBand = age >= 60 ? '60대+' : `${Math.floor(age / 10) * 10}대`
  const acc = Array.isArray(b.accessibility) ? b.accessibility.filter((a: any) => typeof a === 'string' && a) : []
  const arr = (v: any) => Array.isArray(v) ? v.filter((x: any) => typeof x === 'string' && x) : []
  const persona = {
    name,
    age,
    ageBand: ['10대', '20대', '30대', '40대', '50대', '60대+'].includes(b.ageBand) ? b.ageBand : ageBand,
    gender: b.gender === '여' ? '여' : '남',
    region: b.region === '비수도권' ? '비수도권' : '수도권',
    city: String(b.city ?? '').trim(),
    occupation: String(b.occupation ?? '').trim(),
    digitalLiteracy: ['상', '중', '하'].includes(b.digitalLiteracy) ? b.digitalLiteracy : '중',
    primaryDevice: ['모바일', 'PC', '둘다'].includes(b.primaryDevice) ? b.primaryDevice : '모바일',
    accessibility: acc,
    goals: String(b.goals ?? '').trim(),
    personality: String(b.personality ?? '').trim(),
    techBehavior: String(b.techBehavior ?? '').trim(),
    frustrationTriggers: arr(b.frustrationTriggers),
    quote: String(b.quote ?? '').trim(),
  }
  try {
    const added = pool.appendToPool([persona])
    res.json({ persona: added[0], poolSize: pool.poolSize() })
  } catch (e: any) { fail(res, 500, e?.message || '추가 실패') }
})

app.get('/api/projects', (req, res) => {
  const id = ident(req)
  res.json({ projects: id.role === 'super' ? repo.listProjects() : repo.listProjectsByManager(id.managerId as number) })
})
app.post('/api/projects', (req, res) => {
  const id = ident(req)
  const { platform, description } = req.body ?? {}
  const v = validateProjectInput(req.body)
  if ('error' in v) return fail(res, 400, v.error)
  const { name, baseUrl } = v
  // 관리자가 만들면 자기 소유로 고정. 최고관리자는 body.managerId 로 지정(없으면 미배정).
  let managerId: number | null
  if (id.role === 'manager') managerId = id.managerId
  else {
    const raw = req.body?.managerId
    managerId = raw === '' || raw == null ? null : Number(raw)
    if (managerId != null && !repo.getManager(managerId)) return fail(res, 400, '지정한 관리자를 찾을 수 없습니다.')
  }
  const newId = repo.createProject({ name, baseUrl, platform, description, managerId, createdAt: Date.now() })
  res.json({ id: newId })
})

// 프로젝트 목록 숨김/해제 토글 (소프트 숨김 — 데이터 보존, 접근 권한 있는 사용자만)
app.patch('/api/projects/:id/hidden', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  repo.setProjectHidden(project.id, Boolean(req.body?.hidden))
  res.json({ ok: true })
})

app.get('/api/projects/:id', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  res.json({ project, stats: repo.projectStats(project.id), segByLit: repo.segmentCompletion(project.id, 'digital_literacy') })
})

app.get('/api/projects/:id/personas', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  res.json({ project, saved: repo.listProjectPersonas(project.id), poolSize: pool.poolSize() })
})

app.get('/api/projects/:id/scenarios', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  res.json({ project, scenarios: scenariosFor(ident(req)) })
})

app.get('/api/projects/:id/runs', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  res.json({ project, scenarios: scenariosFor(ident(req)), runs: repo.listRunsByProject(project.id), env: envInfo() })
})

app.get('/api/projects/:id/runs/:runId', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  const row = repo.getRunRow(req.params.runId)
  if (!row) return fail(res, 404, '실행을 찾을 수 없습니다.')
  res.json({ project, run: repo.runView(row) })
})

app.get('/api/projects/:id/qa', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  res.json({
    project,
    issues: repo.listProjectIssues(project.id),
    runs: repo.listRunsByProject(project.id),
    developers: repo.listDevelopers(),
    categories: repo.CATEGORIES,
    statuses: repo.STATUSES,
  })
})

// 프로젝트 담당자 CRUD (Stage A: 전역 developers 테이블 위임 — Stage B 에서 프로젝트 스코프로 전환)
app.get('/api/projects/:id/developers', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  res.json({ developers: repo.listDevelopers() })
})
app.post('/api/projects/:id/developers', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  const name = String(req.body?.name ?? '').trim()
  if (!name) return fail(res, 400, '이름을 입력하세요.')
  repo.addDeveloper(name, req.body?.email)
  res.json({ ok: true, developers: repo.listDevelopers() })
})
app.delete('/api/projects/:id/developers/:devId', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  repo.removeDeveloper(Number(req.params.devId))
  res.json({ ok: true })
})

app.get('/api/projects/:id/settings', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  const id = ident(req)
  // 최고관리자는 관리자 지정 드롭다운을 위해 관리자 목록을 함께 받는다.
  res.json({ project, role: id.role, managers: id.role === 'super' ? repo.listManagers() : [] })
})
app.post('/api/projects/:id/settings', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  const { platform, description, guards } = req.body ?? {}
  // 필수 필드는 trim 후 빈값·잘못된 URL 형식 차단
  const v = validateProjectInput(req.body)
  if ('error' in v) return fail(res, 400, v.error)
  repo.updateProject(project.id, { name: v.name, baseUrl: v.baseUrl, platform, description, guards })
  // 프로젝트→관리자 지정은 최고관리자만
  if (ident(req).role === 'super' && 'managerId' in (req.body ?? {})) {
    const raw = req.body.managerId
    const mid = raw === '' || raw == null ? null : Number(raw)
    if (mid != null && !repo.getManager(mid)) return fail(res, 400, '지정한 관리자를 찾을 수 없습니다.')
    repo.setProjectManager(project.id, mid)
  }
  res.json({ ok: true })
})

app.get('/api/settings', (req, res) => res.json({ developers: repo.listDevelopers(), env: { ...envInfo(), role: ident(req).role } }))

/* ───────────────── 접속자(프로젝트 관리자) 관리 — 최고관리자 전용 ───────────────── */
app.get('/api/managers', requireSuper, (_req, res) => res.json({ managers: repo.listManagers() }))
app.post('/api/managers', requireSuper, (req, res) => {
  const name = String(req.body?.name ?? '').trim()
  const password = String(req.body?.password ?? '')
  const contact = String(req.body?.contact ?? '').trim()
  if (!name) return fail(res, 400, '이름(프로젝트명)을 입력하세요.')
  if (password.length < 4) return fail(res, 400, '비밀번호는 4자 이상이어야 합니다.')
  if (isSuperPassword(password)) return fail(res, 400, '최고관리자 비밀번호와 동일하게 설정할 수 없습니다.')
  const hash = hashPassword(password)
  if (repo.passwordHashExists(hash)) return fail(res, 409, '이미 사용 중인 비밀번호입니다. 다른 비밀번호를 사용하세요.')
  const id = repo.addManager(name, hash, contact || undefined)
  res.json({ id })
})
app.patch('/api/managers/:id', requireSuper, (req, res) => {
  const m = repo.getManager(Number(req.params.id))
  if (!m) return fail(res, 404, '관리자를 찾을 수 없습니다.')
  const password = req.body?.password
  if (password != null && password !== '') {
    if (String(password).length < 4) return fail(res, 400, '비밀번호는 4자 이상이어야 합니다.')
    if (isSuperPassword(String(password))) return fail(res, 400, '최고관리자 비밀번호와 동일하게 설정할 수 없습니다.')
    const hash = hashPassword(String(password))
    const owner = repo.getManagerByPasswordHash(hash)
    if (owner && Number(owner.id) !== m.id) return fail(res, 409, '이미 사용 중인 비밀번호입니다.')
    repo.setManagerPassword(m.id, hash)
  }
  // 연락처(이메일/슬랙) 변경 — 필드가 오면 반영(빈 문자열이면 해제)
  if ('contact' in (req.body ?? {})) repo.setManagerContact(m.id, String(req.body.contact ?? '').trim() || undefined)
  res.json({ ok: true })
})
// 관리자의 담당 프로젝트 일괄 지정(복수 선택) — 목록에 없는 기존 담당분은 미배정 처리
app.put('/api/managers/:id/projects', requireSuper, (req, res) => {
  const m = repo.getManager(Number(req.params.id))
  if (!m) return fail(res, 404, '관리자를 찾을 수 없습니다.')
  const raw = Array.isArray(req.body?.projectIds) ? req.body.projectIds : []
  const ids = raw.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x) && x > 0)
  repo.setManagerProjects(m.id, ids)
  res.json({ ok: true })
})
app.delete('/api/managers/:id', requireSuper, (req, res) => { repo.removeManager(Number(req.params.id)); res.json({ ok: true }) })

/* ───────────────── 실행(run) API ───────────────── */
app.post('/api/runs', (req, res) => {
  const { projectId, scenario, personaCount } = req.body ?? {}
  const project = repo.getProject(Number(projectId))
  if (!project) return fail(res, 400, '프로젝트 없음')
  if (!canSeeProject(ident(req), project)) return fail(res, 403, '이 프로젝트를 실행할 권한이 없습니다.')
  if (!scenario || !fs.existsSync(path.join(PROJECT_ROOT, scenario))) return fail(res, 400, `시나리오 없음: ${scenario}`)
  if (!canSeeScenario(ident(req), String(scenario))) return fail(res, 403, '이 시나리오를 실행할 권한이 없습니다.')
  const n = Math.max(1, Math.min(20, Number(personaCount) || 5))
  const base = path.basename(scenario).replace(/\.md$/, '')
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const runId = `${base}-${stamp}`
  const run = live.createRun({ runId, projectId: project.id, scenario, baseUrl: project.base_url, personaCount: n })
  repo.insertRun({ runId, projectId: project.id, scenario, baseUrl: project.base_url, personaCount: n, status: 'pending', startedAt: run.startedAt })
  void startRun(run)
  res.json({ runId })
})

app.get('/api/runs/:id', (req, res) => {
  const row = loadRunRow(req, res); if (!row) return
  res.json({ ...repo.runView(row), personaRuns: repo.getPersonaRuns(req.params.id), issueCount: repo.getIssues(req.params.id).length })
})

// 실행 중단 + 완전 삭제 — '없는 것으로 처리'. 진행 중이면 에이전트 query 를 취소한 뒤
// DB(실행·페르소나·이슈)와 reports/runs/{runId} 산출물을 모두 제거한다.
app.delete('/api/runs/:id', (req, res) => {
  const row = loadRunRow(req, res); if (!row) return
  const run = live.getRun(req.params.id)
  if (run) {
    live.abortRun(run)        // 진행 중인 에이전트 취소
    live.removeRun(req.params.id)
  }
  try { repo.deleteRun(req.params.id) } catch (e: any) { return fail(res, 500, e?.message || '삭제 실패') }
  // 산출물 폴더 삭제(reports/runs 하위만 — 경로 탈출 방지)
  try {
    const dir = path.resolve(PROJECT_ROOT, 'reports', 'runs', req.params.id)
    const safeRoot = path.join(PROJECT_ROOT, 'reports', 'runs')
    if (dir.startsWith(safeRoot + path.sep) && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  } catch { /* 산출물 삭제 실패는 무시 */ }
  res.json({ ok: true })
})
app.get('/api/runs/:id/issues', (req, res) => {
  const row = loadRunRow(req, res); if (!row) return
  res.json({ issues: repo.getIssues(req.params.id) })
})

app.get('/api/runs/:id/events', (req, res) => {
  const row = loadRunRow(req, res); if (!row) return
  const run = live.getRun(req.params.id)
  if (!run) return res.status(404).end()
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  ;(res as any).flushHeaders?.()
  for (const e of run.events) res.write(`data: ${JSON.stringify(e)}\n\n`)
  const maybeEnd = () => {
    if (run.status === 'done' || run.status === 'error' || run.status === 'cancelled') { res.write(`event: end\ndata: ${JSON.stringify(live.publicView(run))}\n\n`); res.end(); return true }
    return false
  }
  if (maybeEnd()) return
  const unsub = live.subscribe(run, (e) => { res.write(`data: ${JSON.stringify(e)}\n\n`); maybeEnd() })
  req.on('close', unsub)
})

app.get('/api/runs/:id/report', (req, res) => {
  const row = loadRunRow(req, res); if (!row) return
  if (!row?.integrated_report_path) return fail(res, 404, 'no report')
  const abs = path.resolve(PROJECT_ROOT, row.integrated_report_path)
  const safeRoot = path.join(PROJECT_ROOT, 'reports', 'runs')
  if (!abs.startsWith(safeRoot) || !fs.existsSync(abs)) return fail(res, 404, 'report file not found')
  res.type('text/markdown').send(fs.readFileSync(abs, 'utf8'))
})

// 이슈 상세 (상세 페이지) — 실행/페르소나 메타 + 스크린샷 목록
app.get('/api/issues/:id', (req, res) => {
  const issue = repo.getIssue(Number(req.params.id))
  if (!issue) return fail(res, 404, '이슈를 찾을 수 없습니다.')
  const id = ident(req)
  if (id.role !== 'super') {
    const p = issue.project_id ? repo.getProject(Number(issue.project_id)) : null
    if (!p || !canSeeProject(id, p)) return fail(res, 403, '이 이슈에 접근할 권한이 없습니다.')
  }
  const shots = (issue.run_id && issue.persona_id ? listShots(issue.run_id, issue.persona_id) : []).map((f) => ({
    file: f,
    url: `/api/runs/${encodeURIComponent(issue.run_id)}/shots/${encodeURIComponent(issue.persona_id)}/${encodeURIComponent(f)}`,
  }))
  res.json({ issue, shots, developers: repo.listDevelopers(), categories: repo.CATEGORIES, statuses: repo.STATUSES })
})

// 스크린샷 이미지 서빙 (reports/runs 하위만 — 경로 탈출 방지)
app.get('/api/runs/:runId/shots/:persona/:file', (req, res) => {
  const row = repo.getRunRow(req.params.runId)
  if (!row) return fail(res, 404, 'not found')
  const id = ident(req)
  if (id.role !== 'super') {
    const p = row.project_id ? repo.getProject(Number(row.project_id)) : null
    if (!p || !canSeeProject(id, p)) return fail(res, 403, 'forbidden')
  }
  const abs = path.resolve(PROJECT_ROOT, 'reports', 'runs', req.params.runId, req.params.persona, req.params.file)
  const safeRoot = path.join(PROJECT_ROOT, 'reports', 'runs')
  if (!abs.startsWith(safeRoot) || !fs.existsSync(abs)) return fail(res, 404, 'not found')
  res.sendFile(abs)
})

// QA 트리아지: 구분/담당자/상태 변경
app.patch('/api/issues/:id', (req, res) => {
  const id = ident(req)
  if (id.role !== 'super') {
    const pid = repo.issueProjectId(Number(req.params.id))
    const p = pid ? repo.getProject(pid) : null
    if (!p || !canSeeProject(id, p)) return fail(res, 403, '이 이슈에 접근할 권한이 없습니다.')
  }
  const ok = repo.updateIssueTriage(Number(req.params.id), req.body ?? {})
  if (!ok) return fail(res, 404, 'issue not found')
  res.json({ ok: true })
})

// 개발담당자
app.get('/api/developers', (_req, res) => res.json({ developers: repo.listDevelopers() }))
app.post('/api/developers', (req, res) => {
  const name = String(req.body?.name ?? '').trim()
  if (!name) return fail(res, 400, '이름 필요')
  repo.addDeveloper(name, req.body?.email)
  res.json({ ok: true })
})
app.delete('/api/developers/:id', (req, res) => { repo.removeDeveloper(Number(req.params.id)); res.json({ ok: true }) })

// 타깃 고객층 → 인력풀(기본 시드)에서 추출
app.post('/api/projects/:id/personas/select', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  const count = Math.max(1, Math.min(50, Number(req.body?.count) || 12))
  res.json(pool.selectFromPool(String(req.body?.audience ?? ''), count))
})

// 추가 페르소나 생성 (적합 인력 부족 시) — LLM, 풀에는 저장 시점에 합류
app.post('/api/personas/generate', async (req, res) => {
  try {
    const personas = await generatePersonas(String(req.body?.audience ?? ''), Math.max(1, Math.min(20, Number(req.body?.count) || 12)))
    res.json({ personas: personas.map((p: any) => ({ ...p, _source: 'new' })) })
  } catch (e: any) { fail(res, 500, e?.message || '생성 실패') }
})

// 저장: 신규 페르소나는 인력풀에 합류 후, 선택분을 프로젝트에 배정
app.post('/api/projects/:id/personas', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  const incoming = Array.isArray(req.body?.personas) ? req.body.personas : []
  if (!incoming.length) return fail(res, 400, '저장할 페르소나가 없습니다')

  // 신규(_source==='new' 또는 id 없음)는 풀에 append하며 확정 ID 부여
  const fresh = incoming.filter((p: any) => p?._source === 'new' || !p?.id)
  const added = pool.appendToPool(fresh)
  let ai = 0
  const resolved = incoming.map((p: any) => (p?._source === 'new' || !p?.id) ? added[ai++] : p)

  let saved = 0
  for (const p of resolved) {
    if (!p) continue
    const { _source, _new, ...clean } = p
    if (repo.hasProjectPersona(project.id, clean.id)) continue   // 중복 배정 방지
    repo.addProjectPersona(project.id, clean)
    saved++
  }
  res.json({ saved, addedToPool: added.length, personas: repo.listProjectPersonas(project.id), poolSize: pool.poolSize() })
})

// 프로젝트 배정 페르소나 제거
app.delete('/api/projects/:id/personas/:rowId', (req, res) => {
  const project = loadProject(req, res); if (!project) return
  repo.removeProjectPersona(project.id, Number(req.params.rowId))
  res.json({ ok: true })
})

// 대화형 시나리오 작성
app.post('/api/scenarios/chat', async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : []
    const out = await chatScenario(messages, req.body?.serviceContext)
    res.json(out)
  } catch (e: any) { fail(res, 500, e?.message || '대화 실패') }
})
app.post('/api/scenarios/save', (req, res) => {
  try {
    if (!req.body?.markdown) return fail(res, 400, '저장할 내용이 없습니다')
    const out = saveScenarioFile(String(req.body?.name ?? 'scenario'), String(req.body.markdown))
    // 소유권 기록 — 관리자는 본인, 최고관리자는 (projectId 있으면) 그 프로젝트의 관리자
    const idy = ident(req)
    const projectId = req.body?.projectId ? Number(req.body.projectId) : null
    let managerId: number | null = null
    if (idy.role === 'manager') managerId = idy.managerId
    else if (projectId) { const p = repo.getProject(projectId); managerId = p?.manager_id ?? null }
    repo.setScenarioOwner(out.file, managerId, projectId)
    res.json(out)
  } catch (e: any) { fail(res, 500, e?.message || '저장 실패') }
})
app.get('/api/scenarios/file', (req, res) => {
  const p = String(req.query.path ?? '')
  if (!canSeeScenario(ident(req), p)) return fail(res, 403, '이 시나리오에 접근할 권한이 없습니다.')
  try { res.json({ markdown: readScenarioFile(p) }) }
  catch (e: any) { fail(res, 404, e?.message || 'not found') }
})

// 알 수 없는 API → 404 JSON
app.use('/api', (_req, res) => fail(res, 404, 'not found'))

/* ───────────────── SPA 폴백 (해시 라우팅) ───────────────── */
// /src/* 정적 자원(뷰·로직·레이아웃)이 없으면 404 — index.html 폴백 시 모듈 MIME 오류 방지
app.use('/src', (_req, res) => res.status(404).end())
// API·정적파일이 아닌 모든 경로 → index.html (클라이언트가 인증/라우팅 처리)
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')))

app.listen(PORT, () => {
  console.log(`\n  QA 에이전트팀 webapp  →  http://localhost:${PORT}`)
  console.log(`  model=${MODEL}  concurrency=${CONCURRENCY}  playwright=${ENABLE_PLAYWRIGHT}`)
  const auth = authStatus()
  if (auth.mode === 'apikey') console.log('  인증: ANTHROPIC_API_KEY 사용\n')
  else if (auth.mode === 'session') console.log('  인증: Claude 로그인 세션 사용 (API 키 없이 동작)\n')
  else console.log('  ⚠  인증 없음 — API 키 미설정 + Claude 로그인 세션 없음. QA 실행/LLM 생성이 실패합니다.\n     → 이 머신에서 `claude login` 으로 로그인하거나 .env 에 ANTHROPIC_API_KEY 를 넣으세요.\n')
})
