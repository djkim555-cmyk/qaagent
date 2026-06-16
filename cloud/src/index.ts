// QA 클라우드 뷰어 Worker — Hono on Cloudflare Workers + D1 + R2.
// 06_API계약서 구현. 배포는 M1(D1/R2/Access 셋업) 이후. 미테스트 골격.
//
// 인증 표면:
//   S1 /sync/*   → Bearer SYNC_TOKEN (로컬 동기화기, 머신)
//   S2 조회 /api/* (GET)  → Cloudflare Access (Cf-Access-Authenticated-User-Email)
//   S3 트리아지 /api/issues/:id/triage (PATCH) → Access 이메일 = updated_by
import { Hono } from 'hono'
import { VIEWER_HTML } from './viewer'
import { handleLogin, logout, sessionUser, loginPageHtml, type Identity } from './auth'

export interface Env {
  DB: D1Database
  ASSETS?: R2Bucket // R2 활성화 후 바인딩(미활성 시 /api/assets 만 비활성)
  SYNC_TOKEN: string
  DEV_ALLOW_NO_ACCESS?: string
  // ── QA 에이전트팀 ID/PW 로그인 (auth.ts) ──
  SESSION_SECRET: string   // 세션 쿠키 서명
  SUPER_PASSWORD: string   // 슈퍼관리자 마스터 비밀번호(웹앱 QA_PASSWORD 와 동일)
  PW_HASH_SECRET: string   // 회원 비밀번호 해시 검증(웹앱 QA_SESSION_SECRET 와 동일)
  SUPER_ID?: string        // 슈퍼관리자 아이디(기본 'admin')
  VIEW_PASSWORD?: string   // (구) 공유 비밀번호 — 미사용(하위호환 위해 남김)
}

const app = new Hono<{ Bindings: Env; Variables: { email: string; identity: Identity } }>()

const json = (c: any, body: unknown, status = 200) => c.json(body as any, status)

/* ───────────────── 인증 미들웨어 ───────────────── */
// S1: 동기화기 토큰
app.use('/sync/*', async (c, next) => {
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!c.env.SYNC_TOKEN || token !== c.env.SYNC_TOKEN) return json(c, { error: 'unauthorized' }, 401)
  await next()
})
// S2/S3: ID/PW 세션. 미로그인 → 401. 신원(역할·회원ID)을 컨텍스트에 부착.
app.use('/api/*', async (c, next) => {
  let id = await sessionUser(c)
  if (!id && c.env.DEV_ALLOW_NO_ACCESS === 'true') id = { role: 'super', memberId: null, label: 'dev@local' }
  if (!id) return json(c, { error: 'unauthorized', message: '로그인이 필요합니다.' }, 401)
  c.set('identity', id)
  c.set('email', id.label) // 트리아지 updated_by 로 사용
  await next()
})

/* ───────────────── 접근 격리: 슈퍼=전체, 회원=매칭된 프로젝트만 ───────────────── */
// 회원이 접근 가능한 프로젝트 id 집합. 슈퍼관리자(super)는 null = 전체 허용.
async function accessibleProjectIds(c: any): Promise<Set<number> | null> {
  const id = c.get('identity') as Identity
  if (id.role === 'super') return null
  if (id.memberId == null) return new Set()
  const r = await c.env.DB.prepare(
    `SELECT project_id FROM project_members WHERE member_id = ? AND COALESCE(deleted,0) = 0`,
  ).bind(id.memberId).all()
  return new Set((r.results as any[]).map((x) => Number(x.project_id)))
}
const canSee = (allow: Set<number> | null, projectId: any): boolean =>
  allow === null || allow.has(Number(projectId))
// run → project_id 해석(접근 판정용)
async function runProjectId(c: any, runId: string): Promise<number | null> {
  const r: any = await c.env.DB.prepare(`SELECT project_id FROM runs WHERE id = ?`).bind(runId).first()
  return r ? (r.project_id == null ? null : Number(r.project_id)) : null
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

/* ───────────────── S2: 뷰어 조회 (신원 기준 격리) ───────────────── */
app.get('/api/projects', async (c) => {
  const allow = await accessibleProjectIds(c)
  if (allow !== null && allow.size === 0) return json(c, { projects: [] })
  const rows = (await c.env.DB.prepare(`SELECT * FROM projects WHERE deleted=0 AND hidden=0 ORDER BY created_at DESC`).all()).results as any[]
  const projects = allow === null ? rows : rows.filter((p) => allow.has(Number(p.id)))
  return json(c, { projects })
})
app.get('/api/projects/:id/runs', async (c) => {
  const allow = await accessibleProjectIds(c)
  if (!canSee(allow, c.req.param('id'))) return json(c, { error: 'forbidden', message: '접근 권한이 없는 프로젝트입니다.' }, 403)
  const r = await c.env.DB.prepare(`SELECT * FROM runs WHERE project_id=? ORDER BY started_at DESC`).bind(c.req.param('id')).all()
  return json(c, { runs: r.results })
})
// 담당자 후보 = 이 프로젝트에 매칭된 승인·활성 회원 (로컬 listProjectMembers 와 동일)
app.get('/api/projects/:id/members', async (c) => {
  const allow = await accessibleProjectIds(c)
  if (!canSee(allow, c.req.param('id'))) return json(c, { error: 'forbidden', message: '접근 권한이 없는 프로젝트입니다.' }, 403)
  const r = await c.env.DB.prepare(
    `SELECT m.id, m.name, m.login_id FROM project_members pm JOIN managers m ON m.id = pm.member_id
      WHERE pm.project_id = ? AND m.active = 1 AND m.status = 'approved' ORDER BY m.name`,
  ).bind(c.req.param('id')).all()
  return json(c, { members: r.results })
})
app.get('/api/runs/:id', async (c) => {
  const run = await c.env.DB.prepare(`SELECT * FROM runs WHERE id=?`).bind(c.req.param('id')).first<any>()
  if (!run) return json(c, { error: 'not found' }, 404)
  const allow = await accessibleProjectIds(c)
  if (!canSee(allow, run.project_id)) return json(c, { error: 'forbidden', message: '접근 권한이 없는 실행입니다.' }, 403)
  const personas = (await c.env.DB.prepare(`SELECT * FROM persona_runs WHERE run_id=? ORDER BY persona_id`).bind(c.req.param('id')).all()).results
  return json(c, { run, persona_runs: personas })
})
app.get('/api/runs/:id/issues', async (c) => {
  const allow = await accessibleProjectIds(c)
  if (!canSee(allow, await runProjectId(c, c.req.param('id')))) return json(c, { error: 'forbidden', message: '접근 권한이 없는 실행입니다.' }, 403)
  const r = await c.env.DB.prepare(
    `SELECT i.*, d.name AS assignee_name FROM issues i LEFT JOIN managers d ON d.id=i.assignee_id
      WHERE i.run_id=? AND i.deleted=0 ORDER BY i.id DESC`,
  ).bind(c.req.param('id')).all()
  return json(c, { issues: r.results })
})
app.get('/api/issues/:id', async (c) => {
  const it = await c.env.DB.prepare(
    `SELECT i.*, r.scenario AS scenario, r.project_id AS project_id, d.name AS assignee_name,
            pr.persona_name AS persona_name
       FROM issues i JOIN runs r ON r.id=i.run_id
       LEFT JOIN managers d ON d.id=i.assignee_id
       LEFT JOIN persona_runs pr ON pr.run_id=i.run_id AND pr.persona_id=i.persona_id
      WHERE i.id=?`,
  ).bind(c.req.param('id')).first<any>()
  if (!it) return json(c, { error: 'not found' }, 404)
  const allow = await accessibleProjectIds(c)
  if (!canSee(allow, it.project_id)) return json(c, { error: 'forbidden', message: '접근 권한이 없는 이슈입니다.' }, 403)
  return json(c, it)
})
app.get('/api/developers', async (c) => {
  const r = await c.env.DB.prepare(`SELECT id, name, email FROM developers WHERE active=1 AND deleted=0 ORDER BY name`).all()
  return json(c, { developers: r.results })
})

// 리포트(마크다운)·스크린샷 등 R2 자산 — 키는 DB 의 *_path / evidence 값과 동일(runs/{runId}/...)
app.get('/api/assets/*', async (c) => {
  if (!c.env.ASSETS) return json(c, { error: 'r2_disabled', message: 'R2 미구성 — 리포트·스크린샷 조회는 R2 활성화 후 가능' }, 503)
  const key = c.req.path.replace(/^\/api\/assets\//, '')
  // 자산 키는 runs/{runId}/... → 회원은 접근 가능한 실행의 자산만.
  const allow = await accessibleProjectIds(c)
  if (allow !== null) {
    const mk = key.match(/^runs\/([^/]+)\//)
    if (!mk || !canSee(allow, await runProjectId(c, decodeURIComponent(mk[1])))) {
      return json(c, { error: 'forbidden', message: '접근 권한이 없는 자산입니다.' }, 403)
    }
  }
  const obj = await c.env.ASSETS.get(key)
  if (!obj) return json(c, { error: 'not found' }, 404)
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  return new Response(obj.body, { headers })
})

/* ───────────────── S3: 트리아지 쓰기(클라우드 편집) ───────────────── */
app.patch('/api/issues/:id/triage', async (c) => {
  const id = Number(c.req.param('id'))
  const t = await c.req.json<any>()
  const email = c.get('email')
  const cur = await c.env.DB.prepare(`SELECT i.category, i.assignee_id, i.status, i.memo, r.project_id AS project_id
                                        FROM issues i JOIN runs r ON r.id=i.run_id WHERE i.id=?`).bind(id).first<any>()
  if (!cur) return json(c, { error: 'not found' }, 404)
  const allow = await accessibleProjectIds(c)
  if (!canSee(allow, cur.project_id)) return json(c, { error: 'forbidden', message: '접근 권한이 없는 이슈입니다.' }, 403)
  await c.env.DB.prepare(
    `UPDATE issues SET category=?, assignee_id=?, status=?, memo=?, updated_at=?, updated_by=? WHERE id=?`,
  ).bind(
    t.category === undefined ? cur.category : t.category,
    t.assignee_id === undefined ? cur.assignee_id : t.assignee_id,
    t.status === undefined ? cur.status : t.status,
    t.memo === undefined ? cur.memo : t.memo,
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
  if (p.startsWith('/api') || p.startsWith('/sync')) return json(c, { error: 'not found' }, 404)
  const user = await sessionUser(c)
  if (!user && c.env.DEV_ALLOW_NO_ACCESS !== 'true') return c.redirect('/login')
  return c.html(VIEWER_HTML)
})
app.notFound((c) => json(c, { error: 'not found' }, 404))

export default app
