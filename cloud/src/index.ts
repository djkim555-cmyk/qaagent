// QA 클라우드 뷰어 Worker — Hono on Cloudflare Workers + D1 + R2.
// 06_API계약서 구현. 배포는 M1(D1/R2/Access 셋업) 이후. 미테스트 골격.
//
// 인증 표면:
//   S1 /sync/*   → Bearer SYNC_TOKEN (로컬 동기화기, 머신)
//   S2 조회 /api/* (GET)  → Cloudflare Access (Cf-Access-Authenticated-User-Email)
//   S3 트리아지 /api/issues/:id/triage (PATCH) → Access 이메일 = updated_by
import { Hono } from 'hono'

export interface Env {
  DB: D1Database
  ASSETS: R2Bucket
  SYNC_TOKEN: string
  DEV_ALLOW_NO_ACCESS?: string
}

const app = new Hono<{ Bindings: Env; Variables: { email: string } }>()

const json = (c: any, body: unknown, status = 200) => c.json(body as any, status)

/* ───────────────── 인증 미들웨어 ───────────────── */
// S1: 동기화기 토큰
app.use('/sync/*', async (c, next) => {
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!c.env.SYNC_TOKEN || token !== c.env.SYNC_TOKEN) return json(c, { error: 'unauthorized' }, 401)
  await next()
})
// S2/S3: Access 이메일(=신원). Access 가 앞단에서 검증 후 헤더 주입.
app.use('/api/*', async (c, next) => {
  let email = c.req.header('Cf-Access-Authenticated-User-Email') || ''
  if (!email && c.env.DEV_ALLOW_NO_ACCESS === 'true') email = 'dev@local' // 로컬 dev 전용
  if (!email) return json(c, { error: 'unauthorized', message: 'Cloudflare Access 인증 필요' }, 401)
  c.set('email', email)
  await next()
})

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

/* ───────────────── S2: 뷰어 조회 ───────────────── */
app.get('/api/projects', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM projects WHERE deleted=0 AND hidden=0 ORDER BY created_at DESC`).all()
  return json(c, { projects: r.results })
})
app.get('/api/projects/:id/runs', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM runs WHERE project_id=? ORDER BY started_at DESC`).bind(c.req.param('id')).all()
  return json(c, { runs: r.results })
})
app.get('/api/runs/:id', async (c) => {
  const run = await c.env.DB.prepare(`SELECT * FROM runs WHERE id=?`).bind(c.req.param('id')).first()
  if (!run) return json(c, { error: 'not found' }, 404)
  const personas = (await c.env.DB.prepare(`SELECT * FROM persona_runs WHERE run_id=? ORDER BY persona_id`).bind(c.req.param('id')).all()).results
  return json(c, { run, persona_runs: personas })
})
app.get('/api/runs/:id/issues', async (c) => {
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
  ).bind(c.req.param('id')).first()
  if (!it) return json(c, { error: 'not found' }, 404)
  return json(c, it)
})
app.get('/api/developers', async (c) => {
  const r = await c.env.DB.prepare(`SELECT id, name, email FROM developers WHERE active=1 AND deleted=0 ORDER BY name`).all()
  return json(c, { developers: r.results })
})

// 리포트(마크다운)·스크린샷 등 R2 자산 — 키는 DB 의 *_path / evidence 값과 동일(runs/{runId}/...)
app.get('/api/assets/*', async (c) => {
  const key = c.req.path.replace(/^\/api\/assets\//, '')
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
  const cur = await c.env.DB.prepare(`SELECT category, assignee_id, status, memo FROM issues WHERE id=?`).bind(id).first<any>()
  if (!cur) return json(c, { error: 'not found' }, 404)
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
app.notFound((c) => json(c, { error: 'not found' }, 404))

export default app
