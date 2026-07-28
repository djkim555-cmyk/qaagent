// 조회 SQL SoT — 웹 뷰어(/api/*)와 MCP(/mcp)가 **같은 함수**로 데이터를 읽는다.
//
// 격리 강제 방식: 모든 조회 함수가 `allow: Set<number> | null` 을 **필수 첫 인자**로 받는다.
// 인자를 빼먹으면 TypeScript 컴파일 에러가 나므로 "권한 필터를 잊은 새 쿼리"가 구조적으로
// 들어올 수 없다(MCP 툴이 자체 SQL 을 짜면 인가가 이원화되고 감사가 무효가 된다).
import { canSee, canSeeProject, chunk } from './access'

type Allow = Set<number> | null

// 입력 정규화 SoT — 게이트 판정과 SQL 바인딩이 **같은 변환**을 쓰도록 한 곳으로 모은다.
// (MCP 의 inputSchema 는 서버측 강제가 아니라 true·"1"·[1] 같은 값이 그대로 들어온다.
//  판정과 바인딩이 서로 다른 변환을 쓰면 TOCTOU 가 생긴다.)
export function toPid(v: unknown): number | null {
  if (typeof v === 'boolean' || v == null || Array.isArray(v)) return null
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

// allow → SQL 조각. null(super)이면 조건 없음, 빈 Set 이면 호출자가 미리 빈 결과로 끊는다.
function projectInClause(col: string, ids: number[]): string {
  return `${col} IN (${ids.map(() => '?').join(',')})`
}

/* ───────── 프로젝트 ───────── */
export async function listProjects(db: D1Database, allow: Allow) {
  if (allow !== null && allow.size === 0) return []
  const rows = (await db.prepare(
    `SELECT p.*,
            (SELECT COUNT(*) FROM runs r WHERE r.project_id = p.id) AS run_count,
            (SELECT MAX(r.started_at) FROM runs r WHERE r.project_id = p.id) AS last_run_at
       FROM projects p
      WHERE COALESCE(p.deleted,0)=0 AND COALESCE(p.hidden,0)=0
      ORDER BY p.created_at DESC`,
  ).all()).results as any[]
  return allow === null ? rows : rows.filter((p) => allow.has(Number(p.id)))
}

/* ───────── 실행(run) ───────── */
export async function listRuns(
  db: D1Database,
  allow: Allow,
  opts: { projectId?: number | null; status?: string | null; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(Math.max(Number(opts.limit ?? 20) || 20, 1), 50)
  const offset = Math.max(Number(opts.offset ?? 0) || 0, 0)

  // 특정 프로젝트 지정 → 호출자 게이트에 의존하지 않고 **여기서도** 판정한다
  // (게이트를 빠뜨린 새 호출자가 생겨도 조용히 뚫리지 않게).
  if (opts.projectId != null) {
    const pid = toPid(opts.projectId)
    if (pid == null || !(await canSeeProject(db, allow, pid))) return []
    const binds: any[] = [pid]
    let sql = `SELECT * FROM runs WHERE project_id = ?`
    if (opts.status) { sql += ` AND status = ?`; binds.push(opts.status) }
    sql += ` ORDER BY started_at DESC LIMIT ? OFFSET ?`
    binds.push(limit, offset)
    return (await db.prepare(sql).bind(...binds).all()).results as any[]
  }

  // 프로젝트 미지정 → 접근 가능한 전 프로젝트 횡단.
  if (allow !== null && allow.size === 0) return []
  const groups = allow === null ? [null] : chunk([...allow])
  const all: any[] = []
  for (const g of groups) {
    const binds: any[] = []
    let sql = `SELECT r.* FROM runs r JOIN projects p ON p.id = r.project_id
                WHERE COALESCE(p.deleted,0)=0 AND COALESCE(p.hidden,0)=0`
    if (g) { sql += ` AND ${projectInClause('r.project_id', g)}`; binds.push(...g) }
    if (opts.status) { sql += ` AND r.status = ?`; binds.push(opts.status) }
    // 청크가 여러 개면 각 청크에서 offset+limit 만큼 넉넉히 받아 뒤에서 병합·절단한다(누락 방지).
    sql += ` ORDER BY r.started_at DESC LIMIT ?`
    binds.push(offset + limit)
    all.push(...((await db.prepare(sql).bind(...binds).all()).results as any[]))
  }
  all.sort((a, b) => Number(b.started_at || 0) - Number(a.started_at || 0))
  return all.slice(offset, offset + limit)
}

export async function getRun(db: D1Database, allow: Allow, runId: string) {
  const run = await db.prepare(`SELECT * FROM runs WHERE id = ?`).bind(runId).first<any>()
  // canSee(멤버십)가 아니라 canSeeProject 로 판정 — 그래야 super 도 삭제된 프로젝트의 실행을
  // ID 직접지정으로 열지 못하고, 목록 경로(searchIssues)와 판정이 일치한다.
  if (!run || !(await canSeeProject(db, allow, run.project_id))) return null
  const persona_runs = (await db.prepare(
    `SELECT * FROM persona_runs WHERE run_id = ? ORDER BY persona_id`,
  ).bind(runId).all()).results
  const counts = (await db.prepare(
    `SELECT severity, status, COUNT(*) AS n FROM issues
      WHERE run_id = ? AND COALESCE(deleted,0)=0 GROUP BY severity, status`,
  ).bind(runId).all()).results as any[]
  const by_severity: Record<string, number> = {}
  const by_status: Record<string, number> = {}
  for (const c of counts) {
    by_severity[String(c.severity ?? '미지정')] = (by_severity[String(c.severity ?? '미지정')] || 0) + Number(c.n)
    by_status[String(c.status ?? '열림')] = (by_status[String(c.status ?? '열림')] || 0) + Number(c.n)
  }
  return { run, persona_runs, issue_counts: { by_severity, by_status } }
}

/* ───────── 이슈 ───────── */
const SEVERITIES = ['Blocker', 'Major', 'Minor', 'Nitpick', '상', '중', '하']
const STATUSES = ['열림', '진행중', '완료', '보류']
const CATEGORIES = ['문의', '오류', '기능개선', '제안', '성공']

export type IssueSearch = {
  runId?: string | null
  projectId?: number | null
  severity?: string[] | null
  status?: string[] | null
  category?: string[] | null
  personaId?: string | null
  assigneeId?: number | null
  q?: string | null
  updatedSince?: number | null
  limit?: number
  offset?: number
}

// 열거형 화이트리스트 — 문자열을 SQL 로 연결하지 않고, 허용 목록 안의 값만 파라미터로 바인딩한다.
const pick = (vals: string[] | null | undefined, allowed: string[]): string[] =>
  (vals || []).map(String).filter((v) => allowed.includes(v))

export async function searchIssues(db: D1Database, allow: Allow, s: IssueSearch) {
  const limit = Math.min(Math.max(Number(s.limit ?? 30) || 30, 1), 100)
  const offset = Math.max(Number(s.offset ?? 0) || 0, 0)
  if (allow !== null && allow.size === 0) return { total: 0, items: [] as any[] }
  let pid: number | null = null
  if (s.projectId != null) {
    pid = toPid(s.projectId)
    if (pid == null || !(await canSeeProject(db, allow, pid))) return { total: 0, items: [] as any[] }
  }

  const sev = pick(s.severity, SEVERITIES)
  const st = pick(s.status, STATUSES)
  const cat = pick(s.category, CATEGORIES)

  const groups = allow === null ? [null] : chunk([...allow])
  let total = 0
  const items: any[] = []
  for (const g of groups) {
    const w: string[] = ['COALESCE(i.deleted,0)=0', 'COALESCE(p.deleted,0)=0', 'COALESCE(p.hidden,0)=0']
    const b: any[] = []
    if (g) { w.push(projectInClause('r.project_id', g)); b.push(...g) }
    if (pid != null) { w.push('r.project_id = ?'); b.push(pid) }
    if (s.runId) { w.push('i.run_id = ?'); b.push(String(s.runId)) }
    if (s.personaId) { w.push('i.persona_id = ?'); b.push(String(s.personaId)) }
    if (s.assigneeId != null) { w.push('i.assignee_id = ?'); b.push(Number(s.assigneeId)) }
    if (s.updatedSince != null) { w.push('i.updated_at > ?'); b.push(Number(s.updatedSince)) }
    if (sev.length) { w.push(`i.severity IN (${sev.map(() => '?').join(',')})`); b.push(...sev) }
    if (st.length) { w.push(`COALESCE(i.status,'열림') IN (${st.map(() => '?').join(',')})`); b.push(...st) }
    if (cat.length) { w.push(`i.category IN (${cat.map(() => '?').join(',')})`); b.push(...cat) }
    if (s.q) { w.push('(i.title LIKE ? OR i.symptom LIKE ?)'); const like = `%${String(s.q).slice(0, 100)}%`; b.push(like, like) }
    const where = w.join(' AND ')
    const from = `FROM issues i JOIN runs r ON r.id = i.run_id JOIN projects p ON p.id = r.project_id`

    const cnt: any = await db.prepare(`SELECT COUNT(*) AS n ${from} WHERE ${where}`).bind(...b).first()
    total += Number(cnt?.n || 0)
    const rows = (await db.prepare(
      `SELECT i.id, i.run_id, i.persona_id, i.title, i.severity, i.type, i.category, i.status,
              i.assignee_id, i.updated_at, r.project_id, r.scenario,
              d.name AS assignee_name, pr.persona_name
         ${from}
         LEFT JOIN managers d ON d.id = i.assignee_id
         LEFT JOIN persona_runs pr ON pr.run_id = i.run_id AND pr.persona_id = i.persona_id
        WHERE ${where} ORDER BY i.id DESC LIMIT ?`,
    ).bind(...b, offset + limit).all()).results as any[]
    items.push(...rows)
  }
  items.sort((a, b2) => Number(b2.id) - Number(a.id))
  return { total, items: items.slice(offset, offset + limit) }
}

export async function getIssue(db: D1Database, allow: Allow, issueId: number) {
  const it = await db.prepare(
    `SELECT i.*, r.scenario AS scenario, r.project_id AS project_id, r.base_url AS run_base_url,
            d.name AS assignee_name, pr.persona_name
       FROM issues i JOIN runs r ON r.id = i.run_id
       LEFT JOIN managers d ON d.id = i.assignee_id
       LEFT JOIN persona_runs pr ON pr.run_id = i.run_id AND pr.persona_id = i.persona_id
      WHERE i.id = ? AND COALESCE(i.deleted,0) = 0`,
  ).bind(issueId).first<any>()
  if (!it || !(await canSeeProject(db, allow, it.project_id))) return null
  return it
}

/** 담당자 후보 = 그 프로젝트에 매칭된 승인·활성 회원. 호출 전 canSeeProject 게이트 필요. */
export async function listProjectMembers(db: D1Database, allow: Allow, projectId: number) {
  if (!canSee(allow, projectId)) return []
  return (await db.prepare(
    `SELECT m.id, m.name, m.login_id FROM project_members pm JOIN managers m ON m.id = pm.member_id
      WHERE pm.project_id = ? AND COALESCE(pm.deleted,0)=0 AND m.active = 1 AND m.status = 'approved'
      ORDER BY m.name`,
  ).bind(projectId).all()).results
}
