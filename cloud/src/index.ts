// QA 클라우드 뷰어 Worker — Hono on Cloudflare Workers + D1 + R2.
// 06_API계약서 구현. 배포는 M1(D1/R2/Access 셋업) 이후. 미테스트 골격.
//
// 인증 표면:
//   S1 /sync/*   → Bearer SYNC_TOKEN (로컬 동기화기, 머신)
//   S2 조회 /api/* (GET)  → ID/PW 세션 쿠키
//   S3 트리아지 /api/issues/:id/triage (PATCH) → 세션 신원 = updated_by
//   S4 /mcp      → Bearer MCP PAT (외부 PC 개발자, 읽기 전용) — mcp.ts
import { Hono } from 'hono'
import { VIEWER_HTML } from './viewer'
import { handleLogin, logout, sessionUser, loginPageHtml, type Identity } from './auth'
import { accessibleProjectIds, canSee, canSeeProject, runProjectId } from './access'
import * as data from './data'
import { handleMcp } from './mcp'
import { mintPat, maskPat, type PatRow } from './mcp-auth'

export interface Env {
  DB: D1Database
  ASSETS?: R2Bucket // R2 활성화 후 바인딩(미활성 시 /api/assets 만 비활성)
  SYNC_TOKEN: string
  DEV_ALLOW_NO_ACCESS?: string
  // ── QA 에이전트팀 ID/PW 로그인 (auth.ts) ──
  SESSION_SECRET: string   // 세션 쿠키 서명
  SUPER_PASSWORD: string   // 슈퍼관리자 마스터 비밀번호(웹앱 QA_PASSWORD 와 동일)
  PW_HASH_SECRET: string   // 회원 비밀번호 해시 검증(웹앱 QA_PW_PEPPER 와 동일)
  SUPER_ID?: string        // 슈퍼관리자 아이디(기본 'admin')
  VIEW_PASSWORD?: string   // (구) 공유 비밀번호 — 미사용(하위호환 위해 남김)
  // ── MCP 원격 접속 (mcp-auth.ts) ──
  MCP_TOKEN_SECRET?: string   // MCP PAT 해시 pepper. 미설정이면 /mcp 는 전건 401(fail-closed)
  MCP_ALLOWED_ORIGINS?: string // (선택) 브라우저 Origin 허용목록. 기본: Origin 있으면 거부
}

const app = new Hono<{ Bindings: Env; Variables: { email: string; identity: Identity } }>()

const json = (c: any, body: unknown, status = 200) => c.json(body as any, status)

/* ───────────────── 보안 헤더(전역) ───────────────── */
app.use('*', async (c, next) => {
  await next()
  c.header('x-content-type-options', 'nosniff')
  c.header('referrer-policy', 'no-referrer')
})

/* ───────────────── S4: MCP (다른 인증 표면 — 세션·SYNC_TOKEN 과 무관) ─────────────────
   반드시 catch-all(app.get('*')) 보다 **먼저** 등록해야 한다. 뒤에 두면 GET /mcp 가
   뷰어 HTML(200) 또는 /login(302)로 응답해, MCP 클라이언트가 원인 불명 파싱 에러만 보게 된다. */
app.all('/mcp', (c) => handleMcp(c.req.raw, c.env))
// MCP 클라이언트가 401 을 받고 OAuth 디스커버리를 프로빙할 때 HTML·302 대신 명확한 404 를 준다.
app.all('/.well-known/*', (c) => json(c, { error: 'not found' }, 404))

/* ───────────────── 인증 미들웨어 ───────────────── */
// S1: 동기화기 토큰
app.use('/sync/*', async (c, next) => {
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  // MCP PAT 을 sync 표면에 제시하는 것은 즉시 거부(표면 혼용 차단 — 양방향).
  if (token.startsWith('qamcp_')) return json(c, { error: 'unauthorized' }, 401)
  if (!c.env.SYNC_TOKEN || !safeEqStr(token, c.env.SYNC_TOKEN)) return json(c, { error: 'unauthorized' }, 401)
  await next()
})
// S2/S3: ID/PW 세션. 미로그인 → 401. 신원(역할·회원ID)을 컨텍스트에 부착.
app.use('/api/*', async (c, next) => {
  let id = await sessionUser(c)
  // 회원 세션은 매 요청 승인·활성 상태를 재확인한다(탈퇴·승인철회가 최대 7일 유효하던 구멍 봉합).
  if (id && id.role === 'manager') {
    const live: any = await c.env.DB.prepare(
      `SELECT id FROM managers WHERE id = ? AND active = 1 AND status = 'approved'`,
    ).bind(id.memberId).first()
    if (!live) id = null
  }
  if (!id && c.env.DEV_ALLOW_NO_ACCESS === 'true') id = { role: 'super', memberId: null, label: 'dev@local' }
  if (!id) return json(c, { error: 'unauthorized', message: '로그인이 필요합니다.' }, 401)
  // 개발 우회 신원으로는 **자격 발급**을 할 수 없다. /mcp 가 이 플래그를 무시해도,
  // 발급 표면이 열려 있으면 플래그가 켜진 순간 익명이 임의 회원 명의 PAT 을 만들 수 있고
  // 플래그를 되돌려도 그 토큰은 살아남는다(비가역). 발급 경로만 fail-closed 로 잠근다.
  if (c.env.DEV_ALLOW_NO_ACCESS === 'true' && c.req.path.startsWith('/api/mcp-tokens')) {
    return json(c, { error: 'forbidden', message: '개발 우회 모드에서는 MCP 토큰을 발급·조회할 수 없습니다.' }, 503)
  }
  c.set('identity', id)
  c.set('email', id.label) // 트리아지 updated_by 로 사용
  await next()
})

/* ───────────────── 접근 격리 ─────────────────
   판정 로직은 access.ts 가 SoT — 여기서 복제하지 않는다(세션·MCP 가 같은 함수를 쓴다). */
const allowFor = (c: any) => accessibleProjectIds(c.env.DB, c.get('identity') as Identity)

// 상수시간 문자열 비교(토큰 대조용)
function safeEqStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// 로그인 라우트(공유 비밀번호)
app.get('/login', (c) => c.html(loginPageHtml()))
app.post('/auth/login', (c) => handleLogin(c))
app.get('/auth/logout', (c) => logout(c))

/* ───────────────── S1: A 데이터 ingest (단방향 복제) ───────────────── */
app.post('/sync/ingest/run', async (c) => {
  const b = await c.req.json<any>()
  const { project, run, persona_runs = [], issues = [] } = b || {}
  if (!run?.id) return json(c, { error: 'bad request', message: 'run.id 필수' }, 400)
  const stmts: D1PreparedStatement[] = []

  if (project?.id != null) {
    // 프로젝트: A 필드만 upsert. hidden(B)·동기화메타는 건드리지 않음(클라우드 트리아지 보호).
    stmts.push(c.env.DB.prepare(
      `INSERT INTO projects (id, name, base_url, platform, description, guards, manager_id, created_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, base_url=excluded.base_url, platform=excluded.platform,
         description=excluded.description, guards=excluded.guards, manager_id=excluded.manager_id`,
    ).bind(project.id, project.name, project.base_url, project.platform, project.description, project.guards, project.manager_id ?? null, project.created_at ?? null))
  }

  stmts.push(c.env.DB.prepare(
    `INSERT INTO runs (id, project_id, scenario, base_url, persona_count, status, launch_recommendation, p1_count, summary, integrated_report_path, error, started_at, finished_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, scenario=excluded.scenario, base_url=excluded.base_url,
       persona_count=excluded.persona_count, status=excluded.status, launch_recommendation=excluded.launch_recommendation,
       p1_count=excluded.p1_count, summary=excluded.summary, integrated_report_path=excluded.integrated_report_path,
       error=excluded.error, started_at=excluded.started_at, finished_at=excluded.finished_at`,
  ).bind(run.id, run.project_id ?? null, run.scenario, run.base_url, run.persona_count ?? null, run.status,
    run.launch_recommendation ?? null, run.p1_count ?? null, run.summary ?? null, run.integrated_report_path ?? null,
    run.error ?? null, run.started_at ?? null, run.finished_at ?? null))

  // persona_runs 는 run 단위 재발행 시 통째 교체(중복 방지)
  stmts.push(c.env.DB.prepare(`DELETE FROM persona_runs WHERE run_id = ?`).bind(run.id))
  for (const p of persona_runs) {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO persona_runs (id, run_id, persona_id, persona_name, age_band, digital_literacy, primary_device, accessibility, completed, total, dropped_out, report_path, one_line_summary)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(p.id, run.id, p.persona_id, p.persona_name ?? null, p.age_band ?? null, p.digital_literacy ?? null,
      p.primary_device ?? null, p.accessibility ?? null, p.completed ?? null, p.total ?? null, p.dropped_out ?? null,
      p.report_path ?? null, p.one_line_summary ?? null))
  }

  // issues: A 본문은 upsert, B(트리아지)는 *초기 insert 시에만* 적용 → 클라우드 최신 트리아지 미덮어씀.
  for (const it of issues) {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO issues (id, run_id, persona_id, title, severity, type, task, symptom, repro, expected, actual, impact, suggestion, evidence, confidence, category, assignee_id, status, memo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET run_id=excluded.run_id, persona_id=excluded.persona_id, title=excluded.title,
         severity=excluded.severity, type=excluded.type, task=excluded.task, symptom=excluded.symptom, repro=excluded.repro,
         expected=excluded.expected, actual=excluded.actual, impact=excluded.impact, suggestion=excluded.suggestion,
         evidence=excluded.evidence, confidence=excluded.confidence`,
    ).bind(it.id, run.id, it.persona_id ?? null, it.title ?? null, it.severity ?? null, it.type ?? null, it.task ?? null,
      it.symptom ?? null, it.repro ?? null, it.expected ?? null, it.actual ?? null, it.impact ?? null, it.suggestion ?? null,
      it.evidence ?? null, it.confidence ?? null, it.category ?? null, it.assignee_id ?? null, it.status ?? '열림', it.memo ?? null))
  }

  await c.env.DB.batch(stmts)
  return json(c, { ok: true, run_id: run.id, upserted: { projects: project ? 1 : 0, runs: 1, persona_runs: persona_runs.length, issues: issues.length } })
})

/* ───────────────── S1: B 트리아지 push (로컬→클라우드, LWW) ───────────────── */
app.post('/sync/triage', async (c) => {
  const b = await c.req.json<any>()
  const applied = { issues: [] as number[], projects: [] as number[] }
  const rejected_stale = { issues: [] as number[], projects: [] as number[] }
  for (const it of b.issues ?? []) {
    const r = await c.env.DB.prepare(
      `UPDATE issues SET category=?, assignee_id=?, status=?, memo=?, updated_at=?, updated_by=?, deleted=?
       WHERE id=? AND (updated_at IS NULL OR updated_at < ?)`,
    ).bind(it.category ?? null, it.assignee_id ?? null, it.status ?? null, it.memo ?? null, it.updated_at, it.updated_by ?? null, it.deleted ? 1 : 0, it.id, it.updated_at).run()
    ;(r.meta.changes ? applied.issues : rejected_stale.issues).push(it.id)
  }
  for (const p of b.projects ?? []) {
    const r = await c.env.DB.prepare(
      `UPDATE projects SET hidden=?, updated_at=?, updated_by=?, deleted=? WHERE id=? AND (updated_at IS NULL OR updated_at < ?)`,
    ).bind(p.hidden ? 1 : 0, p.updated_at, p.updated_by ?? null, p.deleted ? 1 : 0, p.id, p.updated_at).run()
    ;(r.meta.changes ? applied.projects : rejected_stale.projects).push(p.id)
  }
  return json(c, { ok: true, applied, rejected_stale })
})

/* ───────────────── S1: B 트리아지 pull (클라우드→로컬) ───────────────── */
app.get('/sync/triage', async (c) => {
  const since = Number(c.req.query('since') || 0)
  const issues = (await c.env.DB.prepare(
    `SELECT id, category, assignee_id, status, memo, updated_at, updated_by, deleted FROM issues WHERE updated_at IS NOT NULL AND updated_at > ?`,
  ).bind(since).all()).results
  const projects = (await c.env.DB.prepare(
    `SELECT id, hidden, updated_at, updated_by, deleted FROM projects WHERE updated_at IS NOT NULL AND updated_at > ?`,
  ).bind(since).all()).results
  return json(c, { now: Date.now(), issues, projects })
})

/* ───────────────── S1: 회원·매칭 복제 (로컬→클라우드 단방향) ───────────────── */
// 로그인 주체(managers)와 프로젝트 접근권(project_members)을 받아 그대로 반영한다.
// members 는 id 기준 upsert, memberships 는 통째 교체(로컬이 원천 = single source of truth).
app.post('/sync/members', async (c) => {
  const b = await c.req.json<any>()
  const members = (b?.members ?? []) as any[]
  const memberships = (b?.memberships ?? []) as any[]
  const stmts: D1PreparedStatement[] = []
  for (const m of members) {
    if (m?.id == null) continue
    stmts.push(c.env.DB.prepare(
      `INSERT INTO managers (id, login_id, name, contact, password_hash, status, active)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET login_id=excluded.login_id, name=excluded.name, contact=excluded.contact,
         password_hash=excluded.password_hash, status=excluded.status, active=excluded.active`,
    ).bind(m.id, m.login_id ?? null, m.name ?? null, m.contact ?? null, m.password_hash ?? null,
      m.status ?? 'pending', m.active == null ? 1 : (m.active ? 1 : 0)))
  }
  // 멤버십 전량 교체(탈퇴·매칭해제 반영). project_members 는 클라우드 트리아지 대상이 아니므로 안전.
  stmts.push(c.env.DB.prepare(`DELETE FROM project_members`))
  for (const pm of memberships) {
    if (pm?.project_id == null || pm?.member_id == null) continue
    stmts.push(c.env.DB.prepare(
      `INSERT OR IGNORE INTO project_members (project_id, member_id, created_at) VALUES (?,?,?)`,
    ).bind(pm.project_id, pm.member_id, pm.created_at ?? null))
  }
  await c.env.DB.batch(stmts)
  return json(c, { ok: true, upserted: { members: members.length, memberships: memberships.length } })
})

/* ───────────────── S2: 뷰어 조회 (신원 기준 격리) ─────────────────
   SQL 은 data.ts 가 SoT — 모든 조회 함수가 allow 를 필수 인자로 받아, 권한 필터를 빼먹으면
   컴파일 에러가 난다. MCP 툴도 같은 함수를 쓴다(인가 이원화 방지). */
app.get('/api/projects', async (c) => json(c, { projects: await data.listProjects(c.env.DB, await allowFor(c)) }))

app.get('/api/projects/:id/runs', async (c) => {
  const allow = await allowFor(c)
  const pid = Number(c.req.param('id'))
  if (!(await canSeeProject(c.env.DB, allow, pid))) return json(c, { error: 'forbidden', message: '접근 권한이 없는 프로젝트입니다.' }, 403)
  return json(c, { runs: await data.listRuns(c.env.DB, allow, { projectId: pid, limit: 50 }) })
})
// 담당자 후보 = 이 프로젝트에 매칭된 승인·활성 회원 (로컬 listProjectMembers 와 동일)
app.get('/api/projects/:id/members', async (c) => {
  const allow = await allowFor(c)
  const pid = Number(c.req.param('id'))
  if (!(await canSeeProject(c.env.DB, allow, pid))) return json(c, { error: 'forbidden', message: '접근 권한이 없는 프로젝트입니다.' }, 403)
  return json(c, { members: await data.listProjectMembers(c.env.DB, allow, pid) })
})
app.get('/api/runs/:id', async (c) => {
  const got = await data.getRun(c.env.DB, await allowFor(c), c.req.param('id'))
  if (!got) return json(c, { error: 'not found', message: '해당 실행을 찾을 수 없습니다.' }, 404)
  return json(c, { run: got.run, persona_runs: got.persona_runs, issue_counts: got.issue_counts })
})
app.get('/api/runs/:id/issues', async (c) => {
  const allow = await allowFor(c)
  const pid = await runProjectId(c.env.DB, c.req.param('id'))
  if (!(await canSeeProject(c.env.DB, allow, pid))) return json(c, { error: 'forbidden', message: '접근 권한이 없는 실행입니다.' }, 403)
  const r = await data.searchIssues(c.env.DB, allow, { runId: c.req.param('id'), limit: 100 })
  return json(c, { issues: r.items, total: r.total })
})
app.get('/api/issues/:id', async (c) => {
  const it = await data.getIssue(c.env.DB, await allowFor(c), Number(c.req.param('id')))
  if (!it) return json(c, { error: 'not found', message: '해당 이슈를 찾을 수 없습니다.' }, 404)
  return json(c, it)
})
// (제거됨) /api/developers — 인가 게이트가 없어 매칭 0건 회원도 개발자 전원의 이름·이메일을
// 받을 수 있었다(차보안 감사 A-1). 뷰어는 이 엔드포인트를 쓰지 않고(담당자 후보는
// /api/projects/:id/members), 프로덕션 developers 테이블도 0행이라 표면 자체를 없앴다.
// 필요해지면 프로젝트 스코프(project_members 조인) 안에서 다시 연다.

/* ───────────────── MCP 토큰 관리 (회원 본인 발급 · 슈퍼는 대행/전량 관리) ─────────────────
   소유자는 항상 회원이다. super 자신의 토큰(=전 프로젝트 열람)은 발급 경로가 없다. */
// 슈퍼가 대상 회원을 고를 때 쓰는 후보 목록(승인·활성 회원 + 매칭 프로젝트 수)
app.get('/api/mcp-tokens/members', async (c) => {
  const id = c.get('identity') as Identity
  if (id.role !== 'super') return json(c, { error: 'not found' }, 404)
  const r = await c.env.DB.prepare(
    `SELECT m.id, m.login_id, m.name,
            (SELECT COUNT(*) FROM project_members pm JOIN projects p ON p.id=pm.project_id
              WHERE pm.member_id=m.id AND COALESCE(pm.deleted,0)=0 AND COALESCE(p.deleted,0)=0 AND COALESCE(p.hidden,0)=0) AS project_count
       FROM managers m WHERE m.active=1 AND m.status='approved' ORDER BY m.name`,
  ).all()
  return json(c, { members: r.results })
})
app.get('/api/mcp-tokens', async (c) => {
  const id = c.get('identity') as Identity
  const rows = id.role === 'super'
    ? (await c.env.DB.prepare(
        `SELECT t.*, m.login_id AS member_login FROM mcp_tokens t LEFT JOIN managers m ON m.id=t.member_id ORDER BY t.id DESC`,
      ).all()).results as any[]
    : (await c.env.DB.prepare(`SELECT * FROM mcp_tokens WHERE member_id=? ORDER BY id DESC`).bind(id.memberId).all()).results as any[]
  return json(c, { tokens: rows.map((r) => ({ ...maskPat(r as PatRow), member_login: r.member_login })), can_mint_for_others: id.role === 'super' })
})
app.post('/api/mcp-tokens', async (c) => {
  if (!c.env.MCP_TOKEN_SECRET) return json(c, { error: 'not_configured', message: 'MCP_TOKEN_SECRET 시크릿이 설정되지 않아 발급할 수 없습니다.' }, 503)
  const id = c.get('identity') as Identity
  const b = await c.req.json<any>().catch(() => ({}))
  // 회원은 본인에게만. 슈퍼는 대상 회원을 지정해야 한다(super 소유 토큰은 만들 수 없음).
  const memberId = id.role === 'super' ? Number(b?.memberId) : Number(id.memberId)
  if (!Number.isFinite(memberId) || memberId <= 0) {
    return json(c, { error: 'bad request', message: '토큰 소유자(회원)를 지정하세요. 슈퍼관리자 본인 토큰은 발급할 수 없습니다.' }, 400)
  }
  const label = String(b?.label ?? '').trim().slice(0, 60)
  if (!label) return json(c, { error: 'bad request', message: '토큰 라벨(사용할 PC·용도)을 입력하세요.' }, 400)
  const projectIds = Array.isArray(b?.projectIds) ? b.projectIds.map(Number).filter(Number.isFinite) : null
  try {
    const { token, row } = await mintPat(c.env.DB, c.env.MCP_TOKEN_SECRET, {
      memberId, label, days: b?.days, projectIds, createdBy: id.label,
    })
    // token 은 이 응답에서 단 한 번만 존재한다(DB엔 해시만 저장).
    return json(c, { token, meta: maskPat(row) }, 201)
  } catch (e: any) {
    return json(c, { error: 'mint_failed', message: e?.message || '발급 실패' }, 400)
  }
})
app.delete('/api/mcp-tokens/:id', async (c) => {
  const id = c.get('identity') as Identity
  const tid = Number(c.req.param('id'))
  const row: any = await c.env.DB.prepare(`SELECT id, member_id FROM mcp_tokens WHERE id=?`).bind(tid).first()
  if (!row) return json(c, { error: 'not found' }, 404)
  if (id.role !== 'super' && Number(row.member_id) !== Number(id.memberId)) return json(c, { error: 'not found' }, 404)
  await c.env.DB.prepare(`UPDATE mcp_tokens SET revoked_at=?, revoked_by=? WHERE id=? AND revoked_at IS NULL`)
    .bind(Date.now(), id.label, tid).run()
  return json(c, { ok: true })
})

// 리포트(마크다운)·스크린샷 등 R2 자산 — 키는 DB 의 *_path / evidence 값과 동일(runs/{runId}/...)
app.get('/api/assets/*', async (c) => {
  if (!c.env.ASSETS) return json(c, { error: 'r2_disabled', message: 'R2 미구성 — 리포트·스크린샷 조회는 R2 활성화 후 가능' }, 503)
  // 키는 **한 번 정규화한 뒤 그 값으로** 판정·조회한다(판정 대상과 조회 대상이 달라지는 틈 제거).
  const key = decodeURIComponent(c.req.path.replace(/^\/api\/assets\//, ''))
  // 자산은 runs/{runId}/... 만 허용 — super 도 이 프리픽스를 벗어난 임의 키를 읽지 못한다.
  const mk = key.match(/^runs\/([^/]+)\/[^?]*$/)
  if (!mk || key.includes('..')) return json(c, { error: 'not found' }, 404)
  const allow = await allowFor(c)
  if (!(await canSeeProject(c.env.DB, allow, await runProjectId(c.env.DB, mk[1])))) {
    return json(c, { error: 'not found' }, 404)
  }
  const obj = await c.env.ASSETS.get(key)
  if (!obj) return json(c, { error: 'not found' }, 404)
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  // 저장된 Content-Type 을 그대로 실행시키지 않는다(동일 오리진 저장형 XSS → 세션 탈취 방지).
  headers.set('x-content-type-options', 'nosniff')
  headers.set('content-disposition', 'attachment')
  return new Response(obj.body, { headers })
})

/* ───────────────── S3: 트리아지 쓰기(클라우드 편집) ───────────────── */
const TRIAGE_CATEGORIES = ['문의', '오류', '기능개선', '제안', '성공']
const TRIAGE_STATUSES = ['열림', '진행중', '완료', '보류']

app.patch('/api/issues/:id/triage', async (c) => {
  const id = Number(c.req.param('id'))
  const t = await c.req.json<any>().catch(() => ({}))
  const email = c.get('email')
  const cur = await c.env.DB.prepare(`SELECT i.category, i.assignee_id, i.status, i.memo, r.project_id AS project_id
                                        FROM issues i JOIN runs r ON r.id=i.run_id
                                       WHERE i.id=? AND COALESCE(i.deleted,0)=0`).bind(id).first<any>()
  if (!cur) return json(c, { error: 'not found' }, 404)
  const allow = await allowFor(c)
  if (!(await canSeeProject(c.env.DB, allow, cur.project_id))) return json(c, { error: 'forbidden', message: '접근 권한이 없는 이슈입니다.' }, 403)

  // 값 검증: 열거형 화이트리스트 + 담당자는 그 프로젝트에 매칭된 회원만 + 메모 길이 상한.
  if (t.category !== undefined && t.category !== null && !TRIAGE_CATEGORIES.includes(String(t.category))) {
    return json(c, { error: 'bad request', message: '허용되지 않은 구분 값입니다.' }, 400)
  }
  if (t.status !== undefined && t.status !== null && !TRIAGE_STATUSES.includes(String(t.status))) {
    return json(c, { error: 'bad request', message: '허용되지 않은 상태 값입니다.' }, 400)
  }
  if (t.assignee_id !== undefined && t.assignee_id !== null) {
    const ok: any = await c.env.DB.prepare(
      `SELECT 1 AS x FROM project_members pm JOIN managers m ON m.id=pm.member_id
        WHERE pm.project_id=? AND pm.member_id=? AND COALESCE(pm.deleted,0)=0 AND m.active=1 AND m.status='approved'`,
    ).bind(cur.project_id, Number(t.assignee_id)).first()
    if (!ok) return json(c, { error: 'bad request', message: '이 프로젝트에 매칭된 담당자만 지정할 수 있습니다.' }, 400)
  }
  const memo = t.memo === undefined ? cur.memo : (t.memo == null ? null : String(t.memo).slice(0, 4000))

  await c.env.DB.prepare(
    `UPDATE issues SET category=?, assignee_id=?, status=?, memo=?, updated_at=?, updated_by=? WHERE id=?`,
  ).bind(
    t.category === undefined ? cur.category : t.category,
    t.assignee_id === undefined ? cur.assignee_id : t.assignee_id,
    t.status === undefined ? cur.status : t.status,
    memo,
    Date.now(), email, id,
  ).run()
  const updated = await c.env.DB.prepare(`SELECT * FROM issues WHERE id=?`).bind(id).first()
  return json(c, updated)
})

app.get('/health', (c) => json(c, { ok: true }))

// 뷰어 SPA — /api·/sync·/health 외 모든 GET 은 단일 페이지(해시 라우팅)를 서빙.
// (Access 가 켜지면 이 페이지 로드 자체도 Access 로그인 뒤에 도달한다.)
app.get('*', async (c) => {
  const p = c.req.path
  if (p.startsWith('/api') || p.startsWith('/sync') || p.startsWith('/mcp') || p.startsWith('/.well-known')) {
    return json(c, { error: 'not found' }, 404)
  }
  const user = await sessionUser(c)
  if (!user && c.env.DEV_ALLOW_NO_ACCESS !== 'true') return c.redirect('/login')
  return c.html(VIEWER_HTML)
})
app.notFound((c) => json(c, { error: 'not found' }, 404))

export default app
