// 접근 권한 SoT(Single Source of Truth) — 인증 수단(세션 쿠키 / MCP PAT)이 여러 개여도
// **인가 경로는 이 파일 하나**다. Hono Context 에 의존하지 않는 순수 함수로 두어
// /api/*(웹 뷰어)와 /mcp(외부 개발자) 양쪽이 같은 판정을 쓰게 강제한다.
//
// 설계 결정(2026-07-28, 차보안 감사 A-2 반영):
//   canSeeProject 는 "멤버십"만 보지 않고 **hidden=0 · deleted=0 까지 함께** 판정한다.
//   이전에는 /api/projects(목록)만 hidden/deleted 를 걸러, ID 를 직접 지정하는 경로
//   (/api/runs/:id, /api/issues/:id …)로는 숨김·삭제 프로젝트의 데이터가 계속 보였다.
//   로컬 웹앱(SoT)은 회원 조회에 hidden=0 을 강제하므로 "클라우드 권한 > 뷰어 권한"이
//   되어 "본인이 볼 수 있는 것만" 요건이 깨져 있었다.
import type { Identity } from './auth'

// D1 은 쿼리 1건당 바인딩 파라미터 100개 상한 → IN (...) 은 이 크기로 쪼갠다.
export const PARAM_CHUNK = 90

export function chunk<T>(arr: T[], size = PARAM_CHUNK): T[][] {
  if (arr.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * 이 신원이 접근 가능한 프로젝트 id 집합.
 *  - super  → null (전체 허용)
 *  - manager→ project_members 매칭 ∩ (hidden=0 AND deleted=0)
 * 반환이 빈 Set 이면 "볼 수 있는 게 없음"이다(에러가 아니라 빈 결과로 다뤄야 열거를 막는다).
 */
export async function accessibleProjectIds(db: D1Database, id: Identity): Promise<Set<number> | null> {
  if (id.role === 'super') return null
  if (id.memberId == null) return new Set()
  const r = await db.prepare(
    `SELECT pm.project_id AS pid
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
      WHERE pm.member_id = ?
        AND COALESCE(pm.deleted, 0) = 0
        AND COALESCE(p.deleted, 0) = 0
        AND COALESCE(p.hidden, 0) = 0`,
  ).bind(id.memberId).all()
  return new Set((r.results as any[]).map((x) => Number(x.pid)))
}

/** allow(null=전체) 기준으로 이 프로젝트를 볼 수 있는가. projectId 가 null/NaN 이면 항상 false. */
export function canSee(allow: Set<number> | null, projectId: unknown): boolean {
  if (projectId == null) return false
  const n = Number(projectId)
  if (!Number.isFinite(n)) return false
  return allow === null || allow.has(n)
}

/**
 * super 도 삭제 프로젝트는 보지 않는다(hidden 은 super 에게 보임 — 웹 뷰어 운영상 필요).
 * ID 직접 지정 경로에서 쓰는 최종 게이트.
 */
export async function canSeeProject(db: D1Database, allow: Set<number> | null, projectId: unknown): Promise<boolean> {
  if (!canSee(allow, projectId)) return false
  if (allow !== null) return true // manager 는 accessibleProjectIds 에서 이미 hidden/deleted 필터됨
  const p: any = await db.prepare(`SELECT COALESCE(deleted,0) AS d FROM projects WHERE id = ?`).bind(Number(projectId)).first()
  return !!p && Number(p.d) === 0
}

/** run → project_id (접근 판정용). 없는 run 이면 null. */
export async function runProjectId(db: D1Database, runId: string): Promise<number | null> {
  const r: any = await db.prepare(`SELECT project_id FROM runs WHERE id = ?`).bind(runId).first()
  return r && r.project_id != null ? Number(r.project_id) : null
}

/** issue → project_id (접근 판정용). 없는/삭제된 issue 면 null. */
export async function issueProjectId(db: D1Database, issueId: number): Promise<number | null> {
  const r: any = await db.prepare(
    `SELECT r.project_id AS pid FROM issues i JOIN runs r ON r.id = i.run_id
      WHERE i.id = ? AND COALESCE(i.deleted,0) = 0`,
  ).bind(issueId).first()
  return r && r.pid != null ? Number(r.pid) : null
}
