import { db } from './db.js'

// node:sqlite 는 null/number/bigint/string/Uint8Array 만 바인딩 가능 → 헬퍼로 정리
const s = (v: any): string | null => (v === undefined || v === null ? null : String(v))
const ni = (v: any): number | null => (v === undefined || v === null || v === '' ? null : Number(v))
const n = (v: any): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

const SEV_ORDER = `CASE severity WHEN 'Blocker' THEN 0 WHEN 'Major' THEN 1 WHEN 'Minor' THEN 2 ELSE 3 END`

// 구분 코드(요청) / 상태 enum
export const CATEGORIES = ['문의', '오류', '기능개선', '제안']
export const STATUSES = ['열림', '진행중', '완료', '보류']

// 이슈 유형 → 구분 자동 분류 기준(추천). 관리자는 이후 드롭다운으로 변경 가능.
//  기능버그 → 오류 · 콘텐츠 → 제안 · 사용성/접근성/성능/신뢰UX → 기능개선 · 그 외 → 문의
export function categorizeType(type?: string): string {
  switch (type) {
    case '기능버그': return '오류'
    case '콘텐츠': return '제안'
    case '사용성':
    case '접근성':
    case '성능':
    case '신뢰UX': return '기능개선'
    default: return '문의'
  }
}

/* ───────────────────────── managers (프로젝트 관리자 / 접속자) ───────────────────────── */
export const listManagers = () =>
  db.prepare(
    `SELECT m.id, m.name, m.contact, m.active, m.created_at,
            (SELECT COUNT(*) FROM projects p WHERE p.manager_id = m.id) AS project_count
       FROM managers m WHERE m.active = 1 ORDER BY m.created_at DESC`,
  ).all() as any[]
export const getManager = (id: number) => db.prepare(`SELECT * FROM managers WHERE id = ? AND active = 1`).get(id) as any
export const getManagerByPasswordHash = (hash: string) =>
  db.prepare(`SELECT * FROM managers WHERE password_hash = ? AND active = 1`).get(hash) as any
export const passwordHashExists = (hash: string): boolean =>
  Boolean(db.prepare(`SELECT 1 FROM managers WHERE password_hash = ? AND active = 1`).get(hash))
export function addManager(name: string, passwordHash: string, contact?: string): number {
  const info = db.prepare(`INSERT INTO managers (name, contact, password_hash, created_at) VALUES (?, ?, ?, ?)`).run(name, s(contact), passwordHash, n(Date.now()))
  return Number(info.lastInsertRowid)
}
export function setManagerPassword(id: number, passwordHash: string) {
  db.prepare(`UPDATE managers SET password_hash = ? WHERE id = ?`).run(passwordHash, id)
}
export function setManagerContact(id: number, contact?: string) {
  db.prepare(`UPDATE managers SET contact = ? WHERE id = ?`).run(s(contact), id)
}
// 비활성화 + 보유 프로젝트는 미배정(NULL)으로 풀어 최고관리자에게만 보이도록
export function removeManager(id: number) {
  db.prepare(`UPDATE projects SET manager_id = NULL WHERE manager_id = ?`).run(id)
  db.prepare(`UPDATE managers SET active = 0 WHERE id = ?`).run(id)
}

/* ───────────────────────── projects ───────────────────────── */
const insertProjectStmt = db.prepare(
  `INSERT INTO projects (name, base_url, platform, description, guards, manager_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
)
export function createProject(p: { name: string; baseUrl: string; platform?: string; description?: string; guards?: string; managerId?: number | null; createdAt: number }) {
  const info = insertProjectStmt.run(p.name, p.baseUrl, s(p.platform), s(p.description), s(p.guards), ni(p.managerId), n(p.createdAt))
  return Number(info.lastInsertRowid)
}
const updateProjectStmt = db.prepare(`UPDATE projects SET name = ?, base_url = ?, platform = ?, description = ?, guards = ? WHERE id = ?`)
export function updateProject(id: number, p: { name: string; baseUrl: string; platform?: string; description?: string; guards?: string }) {
  updateProjectStmt.run(p.name, p.baseUrl, s(p.platform), s(p.description), s(p.guards), id)
}
// 프로젝트 목록 숨김 토글(소프트 숨김 — 데이터·실행 결과는 보존)
export function setProjectHidden(id: number, hidden: boolean) {
  db.prepare(`UPDATE projects SET hidden = ? WHERE id = ?`).run(hidden ? 1 : 0, id)
}
// 최고관리자 전용: 프로젝트를 특정 관리자에게 지정(또는 NULL 해제)
export function setProjectManager(id: number, managerId: number | null) {
  db.prepare(`UPDATE projects SET manager_id = ? WHERE id = ?`).run(ni(managerId), id)
}
// 최고관리자 전용: 특정 관리자의 담당 프로젝트 집합을 주어진 목록으로 교체.
// 기존 담당이지만 목록에 없는 프로젝트는 미배정(NULL)으로 풀고, 목록의 프로젝트는 이 관리자로 재지정.
export function setManagerProjects(managerId: number, projectIds: number[]) {
  const ids = Array.from(new Set(projectIds.map((x) => n(x)).filter((x) => x > 0)))
  db.exec('BEGIN')
  try {
    db.prepare(`UPDATE projects SET manager_id = NULL WHERE manager_id = ?`).run(managerId)
    const assign = db.prepare(`UPDATE projects SET manager_id = ? WHERE id = ?`)
    for (const pid of ids) assign.run(managerId, pid)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
const PROJECT_SELECT = `SELECT p.*, m.name AS manager_name FROM projects p LEFT JOIN managers m ON m.id = p.manager_id`
export const listProjects = () => db.prepare(`${PROJECT_SELECT} ORDER BY p.created_at DESC`).all() as any[]
export const listProjectsByManager = (managerId: number) =>
  db.prepare(`${PROJECT_SELECT} WHERE p.manager_id = ? ORDER BY p.created_at DESC`).all(managerId) as any[]
export const getProject = (id: number) => db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id) as any

/* ─────────────────── project_personas (QA 인력 배정) ─────────────────── */
const insertProjectPersonaStmt = db.prepare(
  `INSERT INTO project_personas (project_id, persona_id, data, created_at) VALUES (?, ?, ?, ?)`,
)
export function addProjectPersona(projectId: number, persona: any) {
  insertProjectPersonaStmt.run(projectId, s(persona?.id) ?? '?', JSON.stringify(persona), n(Date.now()))
}
export function listProjectPersonas(projectId: number): any[] {
  const rows = db.prepare(`SELECT id, persona_id, data FROM project_personas WHERE project_id = ? ORDER BY id`).all(projectId) as any[]
  return rows.map((r) => { try { return { rowId: r.id, ...JSON.parse(r.data) } } catch { return { rowId: r.id, id: r.persona_id } } })
}
export const removeProjectPersona = (projectId: number, rowId: number) =>
  db.prepare(`DELETE FROM project_personas WHERE id = ? AND project_id = ?`).run(rowId, projectId)
export function hasProjectPersona(projectId: number, personaId: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM project_personas WHERE project_id = ? AND persona_id = ?`).get(projectId, personaId))
}

/* ─────────────────── scenario_owners (시나리오 가시성) ─────────────────── */
const setScenarioOwnerStmt = db.prepare(
  `INSERT INTO scenario_owners (path, manager_id, project_id, created_at) VALUES (?, ?, ?, ?)
   ON CONFLICT(path) DO UPDATE SET manager_id = excluded.manager_id, project_id = excluded.project_id`,
)
export function setScenarioOwner(path: string, managerId: number | null, projectId: number | null) {
  setScenarioOwnerStmt.run(s(path), ni(managerId), ni(projectId), n(Date.now()))
}
// path → manager_id (없는 path 는 키 없음 = 미등록/레거시)
export function scenarioOwnerMap(): Record<string, number | null> {
  const rows = db.prepare(`SELECT path, manager_id FROM scenario_owners`).all() as any[]
  const m: Record<string, number | null> = {}
  for (const r of rows) m[r.path] = r.manager_id == null ? null : Number(r.manager_id)
  return m
}

/* ──────────────────────── developers ──────────────────────── */
export const listDevelopers = () => db.prepare(`SELECT * FROM developers WHERE active = 1 ORDER BY name`).all() as any[]
export function addDeveloper(name: string, email?: string) {
  db.prepare(`INSERT INTO developers (name, email) VALUES (?, ?)`).run(name, s(email))
}
export function removeDeveloper(id: number) {
  db.prepare(`UPDATE developers SET active = 0 WHERE id = ?`).run(id)
}

/* ─────────────────────────── runs ─────────────────────────── */
const insertRunStmt = db.prepare(
  `INSERT INTO runs (id, project_id, scenario, base_url, persona_count, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
)
export function insertRun(r: { runId: string; projectId?: number; scenario: string; baseUrl: string; personaCount: number; status: string; startedAt: number }) {
  insertRunStmt.run(r.runId, ni(r.projectId), r.scenario, r.baseUrl, n(r.personaCount), r.status, n(r.startedAt))
}

const setStatusStmt = db.prepare(`UPDATE runs SET status = ? WHERE id = ?`)
export const setStatus = (id: string, status: string) => setStatusStmt.run(status, id)

const finishRunStmt = db.prepare(
  `UPDATE runs SET status = ?, launch_recommendation = ?, p1_count = ?, summary = ?, integrated_report_path = ?, error = ?, finished_at = ? WHERE id = ?`,
)
export function finishRun(id: string, f: { status: string; launchRecommendation?: any; p1Count?: any; summary?: any; integratedReportPath?: any; error?: any; finishedAt: number }) {
  finishRunStmt.run(f.status, s(f.launchRecommendation), ni(f.p1Count), s(f.summary), s(f.integratedReportPath), s(f.error), n(f.finishedAt), id)
}

// 실행 1건 완전 삭제 — '없는 것으로 처리'(중단). 이슈·페르소나 결과·실행 행을 함께 제거.
export function deleteRun(id: string) {
  db.exec('BEGIN')
  try {
    db.prepare(`DELETE FROM issues WHERE run_id = ?`).run(id)
    db.prepare(`DELETE FROM persona_runs WHERE run_id = ?`).run(id)
    db.prepare(`DELETE FROM runs WHERE id = ?`).run(id)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/* ─────────────────── persona_runs + issues ─────────────────── */
const insertPersonaRunStmt = db.prepare(
  `INSERT INTO persona_runs (run_id, persona_id, persona_name, age_band, digital_literacy, primary_device, accessibility, completed, total, dropped_out, report_path, one_line_summary)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
)
const insertIssueStmt = db.prepare(
  `INSERT INTO issues (run_id, persona_id, title, severity, type, task, symptom, repro, expected, actual, impact, suggestion, evidence, confidence, category)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
)
// 에이전트가 재현단계를 배열/문자열 어느 쪽으로 주든 줄바꿈 구분 텍스트로 정규화
const lines = (v: any): string | null => {
  if (v === undefined || v === null || v === '') return null
  if (Array.isArray(v)) {
    const arr = v.map((x) => String(x).trim()).filter(Boolean)
    return arr.length ? arr.map((x, i) => (/^\s*\d+[.)]/.test(x) ? x : `${i + 1}. ${x}`)).join('\n') : null
  }
  return String(v)
}
export function savePersonaResult(runId: string, persona: any, parsed: any) {
  const access = Array.isArray(persona?.accessibility) ? persona.accessibility.join(',') : persona?.accessibility
  insertPersonaRunStmt.run(
    runId, persona?.id ?? '?', s(persona?.name), s(persona?.ageBand), s(persona?.digitalLiteracy), s(persona?.primaryDevice), s(access),
    n(parsed?.completed), n(parsed?.total), parsed?.droppedOut ? 1 : 0, s(parsed?.reportPath), s(parsed?.oneLineSummary),
  )
  const issues = Array.isArray(parsed?.issues) ? parsed.issues : []
  for (const it of issues) {
    // 실행 시점에 구분 자동 분류(에이전트가 category 를 직접 주면 그 값 우선)
    const category = it?.category ? String(it.category) : categorizeType(it?.type)
    insertIssueStmt.run(
      runId, persona?.id ?? '?', s(it?.title), s(it?.severity), s(it?.type), s(it?.task),
      // 구조화 본문: symptom 미제공 시 evidence 외 서술 필드로 폴백하지 않고 그대로 비움(상세 화면이 evidence 폴백 처리)
      s(it?.symptom), lines(it?.repro), s(it?.expected), s(it?.actual), s(it?.impact), s(it?.suggestion),
      s(it?.evidence), s(it?.confidence), s(category),
    )
  }
}

/* ─────────────────────────── 조회 ─────────────────────────── */
const listRunsStmt = db.prepare(`SELECT r.*, p.name AS project_name FROM runs r LEFT JOIN projects p ON p.id = r.project_id ORDER BY r.started_at DESC`)
const listRunsByProjectStmt = db.prepare(`SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC`)
const getRunStmt = db.prepare(`SELECT * FROM runs WHERE id = ?`)
const personaRunsStmt = db.prepare(`SELECT * FROM persona_runs WHERE run_id = ? ORDER BY persona_id`)
const issuesStmt = db.prepare(`SELECT * FROM issues WHERE run_id = ? ORDER BY ${SEV_ORDER}`)

export const listRuns = () => listRunsStmt.all() as any[]
const listRunsByManagerStmt = db.prepare(
  `SELECT r.*, p.name AS project_name FROM runs r JOIN projects p ON p.id = r.project_id WHERE p.manager_id = ? ORDER BY r.started_at DESC`,
)
export const listRunsByManager = (managerId: number) => listRunsByManagerStmt.all(managerId) as any[]
// 대시보드 최근 실행용 — 숨긴 프로젝트의 실행은 제외(JOIN 으로 숨김 외 프로젝트만).
const listRunsVisibleStmt = db.prepare(
  `SELECT r.*, p.name AS project_name FROM runs r JOIN projects p ON p.id = r.project_id WHERE p.hidden = 0 ORDER BY r.started_at DESC`,
)
export const listRunsVisible = () => listRunsVisibleStmt.all() as any[]
const listRunsByManagerVisibleStmt = db.prepare(
  `SELECT r.*, p.name AS project_name FROM runs r JOIN projects p ON p.id = r.project_id WHERE p.manager_id = ? AND p.hidden = 0 ORDER BY r.started_at DESC`,
)
export const listRunsByManagerVisible = (managerId: number) => listRunsByManagerVisibleStmt.all(managerId) as any[]
export const listRunsByProject = (projectId: number) => listRunsByProjectStmt.all(projectId) as any[]
export const getRunRow = (id: string) => getRunStmt.get(id) as any
export const getPersonaRuns = (runId: string) => personaRunsStmt.all(runId) as any[]
export const getIssues = (runId: string) => issuesStmt.all(runId) as any[]

// 프로젝트 전체 QA 이슈 (구분/담당자 트리아지 리스트용)
const projectIssuesStmt = db.prepare(
  `SELECT i.*, r.scenario AS scenario, r.project_id AS project_id, r.started_at AS started_at, d.name AS assignee_name,
          pr.persona_name AS persona_name
   FROM issues i
   JOIN runs r ON r.id = i.run_id
   LEFT JOIN developers d ON d.id = i.assignee_id
   LEFT JOIN persona_runs pr ON pr.run_id = i.run_id AND pr.persona_id = i.persona_id
   WHERE r.project_id = ?
   ORDER BY ${SEV_ORDER}, i.id DESC`,
)
export const listProjectIssues = (projectId: number) => projectIssuesStmt.all(projectId) as any[]

// 이슈 상세 — 실행/시나리오/페르소나 메타 동봉 (상세 페이지용)
const getIssueStmt = db.prepare(
  `SELECT i.*, r.scenario AS scenario, r.id AS run_id, r.project_id AS project_id, r.base_url AS base_url, r.started_at AS started_at,
          d.name AS assignee_name,
          pr.persona_name AS persona_name, pr.age_band AS age_band, pr.digital_literacy AS digital_literacy,
          pr.primary_device AS primary_device, pr.accessibility AS accessibility, pr.report_path AS report_path,
          pr.one_line_summary AS one_line_summary
     FROM issues i
     JOIN runs r ON r.id = i.run_id
     LEFT JOIN developers d ON d.id = i.assignee_id
     LEFT JOIN persona_runs pr ON pr.run_id = i.run_id AND pr.persona_id = i.persona_id
    WHERE i.id = ?`,
)
export const getIssue = (id: number) => getIssueStmt.get(id) as any

// 이슈가 속한 프로젝트 id (권한 범위 확인용) — 없으면 null
export const issueProjectId = (id: number): number | null => {
  const r = db.prepare(`SELECT r.project_id AS pid FROM issues i JOIN runs r ON r.id = i.run_id WHERE i.id = ?`).get(id) as any
  return r && r.pid != null ? Number(r.pid) : null
}

const updateTriageStmt = db.prepare(`UPDATE issues SET category = ?, assignee_id = ?, status = ?, memo = ? WHERE id = ?`)
export function updateIssueTriage(id: number, t: { category?: any; assigneeId?: any; status?: any; memo?: any }) {
  const cur = db.prepare(`SELECT category, assignee_id, status, memo FROM issues WHERE id = ?`).get(id) as any
  if (!cur) return false
  updateTriageStmt.run(
    t.category === undefined ? cur.category : s(t.category),
    t.assigneeId === undefined ? cur.assignee_id : ni(t.assigneeId),
    t.status === undefined ? cur.status : s(t.status),
    t.memo === undefined ? cur.memo : s(t.memo),
    id,
  )
  return true
}

/* ───────────────────── 인사이트 / 통계 ───────────────────── */
export function segmentCompletion(projectId: number, column: 'age_band' | 'digital_literacy') {
  return db.prepare(
    `SELECT pr.${column} AS seg, SUM(pr.completed) AS completed, SUM(pr.total) AS total, COUNT(*) AS personas
     FROM persona_runs pr JOIN runs r ON r.id = pr.run_id
     WHERE r.project_id = ? AND pr.${column} IS NOT NULL AND pr.total > 0
     GROUP BY pr.${column} ORDER BY (SUM(pr.completed)*1.0 / SUM(pr.total)) ASC`,
  ).all(projectId) as any[]
}

export function projectStats(projectId: number) {
  const runs = (db.prepare(`SELECT COUNT(*) c FROM runs WHERE project_id = ?`).get(projectId) as any).c
  const issuesBySev = db.prepare(`SELECT severity, COUNT(*) c FROM issues i JOIN runs r ON r.id = i.run_id WHERE r.project_id = ? GROUP BY severity`).all(projectId) as any[]
  const issuesByCat = db.prepare(`SELECT COALESCE(category,'미분류') category, COUNT(*) c FROM issues i JOIN runs r ON r.id = i.run_id WHERE r.project_id = ? GROUP BY COALESCE(category,'미분류')`).all(projectId) as any[]
  const openIssues = (db.prepare(`SELECT COUNT(*) c FROM issues i JOIN runs r ON r.id = i.run_id WHERE r.project_id = ? AND COALESCE(i.status,'열림') != '완료'`).get(projectId) as any).c
  const latest = db.prepare(`SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1`).get(projectId) as any
  return { runs, issuesBySev, issuesByCat, openIssues, latest: runView(latest) }
}

// managerId 가 주어지면 그 관리자 소유 프로젝트로만 집계(프로젝트 관리자 대시보드 격리).
export function dashboardStats(weekCutoffMs: number, managerId: number | null = null) {
  // managerId 는 서명된 쿠키에서 온 정수 → n() 으로 정수 보장 후 인라인(node:sqlite 혼합 바인딩 회피)
  // 숨긴 프로젝트는 대시보드 집계·최근 실행에서 모두 제외(보이지 않게 한다).
  const notHidden = ` AND r.project_id NOT IN (SELECT id FROM projects WHERE hidden = 1)`
  const own = (managerId == null ? '' : ` AND r.project_id IN (SELECT id FROM projects WHERE manager_id = ${n(managerId)})`) + notHidden
  const ownP = managerId == null ? ` WHERE hidden = 0` : ` WHERE manager_id = ${n(managerId)} AND hidden = 0`
  const active = (db.prepare(`SELECT COUNT(*) c FROM runs r WHERE r.status IN ('pending','running','synthesizing')${own}`).get() as any).c
  const openP1 = (db.prepare(`SELECT COUNT(*) c FROM issues i JOIN runs r ON r.id = i.run_id WHERE i.severity IN ('Blocker','Major') AND COALESCE(i.status,'열림') != '완료'${own}`).get() as any).c
  const thisWeek = (db.prepare(`SELECT COUNT(*) c FROM runs r WHERE r.started_at >= ?${own}`).get(n(weekCutoffMs)) as any).c
  const projects = (db.prepare(`SELECT COUNT(*) c FROM projects${ownP}`).get() as any).c
  const recent = (managerId == null ? listRunsVisible() : listRunsByManagerVisible(managerId)).slice(0, 10)
  return { active, openP1, thisWeek, projects, recent }
}

// 담당 프로젝트별 요약 카드용. managerId 가 주어지면 그 관리자 소유 프로젝트만,
// null(최고관리자) 이면 전체 프로젝트를 각 프로젝트의 실행수·진행중·미해결 P1·최근 실행과 함께 반환.
const latestRunStmt = db.prepare(
  `SELECT id, scenario, status, launch_recommendation, p1_count, started_at FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1`,
)
export function managerProjectsOverview(managerId: number | null = null) {
  // 숨긴 프로젝트는 대시보드 프로젝트 카드에서도 제외한다.
  const where = managerId == null ? ` WHERE p.hidden = 0` : ` WHERE p.manager_id = ${n(managerId)} AND p.hidden = 0`
  const rows = db.prepare(
    `SELECT p.id, p.name, p.base_url, m.name AS manager_name,
            (SELECT COUNT(*) FROM runs r WHERE r.project_id = p.id) AS runs,
            (SELECT COUNT(*) FROM runs r WHERE r.project_id = p.id AND r.status IN ('pending','running','synthesizing')) AS active_runs,
            (SELECT COUNT(*) FROM issues i JOIN runs r ON r.id = i.run_id
               WHERE r.project_id = p.id AND i.severity IN ('Blocker','Major') AND COALESCE(i.status,'열림') != '완료') AS open_p1
       FROM projects p LEFT JOIN managers m ON m.id = p.manager_id${where}
       ORDER BY p.created_at DESC`,
  ).all() as any[]
  return rows.map((r) => {
    const last = latestRunStmt.get(r.id) as any
    return {
      id: r.id,
      name: r.name,
      baseUrl: r.base_url,
      managerName: r.manager_name,
      runs: r.runs,
      activeRuns: r.active_runs,
      openP1: r.open_p1,
      lastRun: last
        ? { runId: last.id, scenario: last.scenario, status: last.status, launchRecommendation: last.launch_recommendation, p1Count: last.p1_count, startedAt: last.started_at }
        : null,
    }
  })
}

/* ───────────────────── 스네이크→카멜 매핑 ───────────────────── */
export function runView(row: any) {
  if (!row) return null
  return {
    runId: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    scenario: row.scenario,
    baseUrl: row.base_url,
    personaCount: row.persona_count,
    status: row.status,
    launchRecommendation: row.launch_recommendation,
    p1Count: row.p1_count,
    summary: row.summary,
    integratedReportPath: row.integrated_report_path,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}
