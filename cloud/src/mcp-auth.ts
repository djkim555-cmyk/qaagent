// MCP 개인 액세스 토큰(PAT) — 외부 PC 개발자가 /mcp 에 붙을 때 쓰는 자격.
//
// 설계 결정(차보안 감사 반영):
//  · 토큰 평문은 **어디에도 저장하지 않는다.** D1 에는 조회키(token_id)와 HMAC 해시만.
//    → 즉시 폐기(revoke)가 요건이므로 stateless HMAC 파생은 탈락. D1 저장이 유일한 답.
//  · pepper 는 **신규 MCP_TOKEN_SECRET 단독.** SESSION_SECRET·PW_HASH_SECRET·SYNC_TOKEN 재사용 금지
//    (회전 독립성 + 피해 반경 분리. PW_HASH_SECRET 은 로컬 웹앱과 공유되는 값이라 더 얹지 않는다).
//  · **소유자는 항상 회원(member).** role='super' PAT 은 발급 경로 자체가 없다 —
//    평문으로 개발자 PC 에 사는 자격이 전 프로젝트를 열람하는 피해 반경은 허용 불가.
//  · 매 요청 소유자를 **라이브 재검증**(active=1 AND status='approved'). /sync/members 는
//    managers 를 upsert 만 하고 삭제하지 않으므로, 이 재검증이 없으면 탈퇴자 토큰이 계속 통과한다.
//  · 토큰은 권한을 **담지 않는다** — 소유자만 가리키고, 권한은 매 요청 accessibleProjectIds 로 계산한다
//    (멤버십 해제가 즉시 반영되는 구조. 토큰에 project_id 를 굳히면 stale grant 가 된다).
import type { Identity } from './auth'

export const PAT_PREFIX = 'qamcp_v1_'
const MAX_DAYS = 90
const DEFAULT_DAYS = 30
const MAX_PER_MEMBER = 5
// last_used_at 을 매 요청 UPDATE 하면 D1 write 가 폭증 → 5분 스로틀.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000

const enc = (s: string) => new TextEncoder().encode(s)

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
// 소문자 base32(충돌·오독 적은 조회키용)
function base32(bytes: Uint8Array): string {
  const A = 'abcdefghijklmnopqrstuvwxyz234567'
  let bits = 0, val = 0, out = ''
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8
    while (bits >= 5) { out += A[(val >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += A[(val << (5 - bits)) & 31]
  return out
}
async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc(data))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export type PatRow = {
  id: number
  token_id: string
  member_id: number
  label: string | null
  scope_project_ids: string | null
  created_at: number
  created_by: string | null
  expires_at: number
  last_used_at: number | null
  use_count: number | null
  revoked_at: number | null
}
// 해시는 별도 타입에만 둔다 — PatRow 를 그대로 응답에 실어도 해시가 새어나가지 않게(타입으로 방지).
type PatRowInternal = PatRow & { token_hash: string }

/** 목록 표시용 — 비밀은 절대 나가지 않고 앞자리 지문만. */
export const maskPat = (r: PatRow) => ({
  id: r.id,
  label: r.label,
  member_id: r.member_id,
  fingerprint: `${PAT_PREFIX}${r.token_id}…`,
  scope_project_ids: r.scope_project_ids ? (JSON.parse(r.scope_project_ids) as number[]) : null,
  created_at: r.created_at,
  created_by: r.created_by,
  expires_at: r.expires_at,
  expired: r.expires_at <= Date.now(),
  last_used_at: r.last_used_at,
  use_count: r.use_count ?? 0,
  revoked_at: r.revoked_at,
  active: !r.revoked_at && r.expires_at > Date.now(),
})

/**
 * 토큰 발급. 반환된 `token` 은 **이 응답에서 단 한 번만** 존재한다(DB엔 해시만).
 * memberId 는 필수 — 소유자 없는(=super) 토큰은 만들 수 없다.
 */
export async function mintPat(
  db: D1Database,
  pepper: string,
  opts: { memberId: number; label: string; days?: number; projectIds?: number[] | null; createdBy: string },
): Promise<{ token: string; row: PatRow }> {
  const live: any = await db.prepare(
    `SELECT id FROM managers WHERE id = ? AND active = 1 AND status = 'approved'`,
  ).bind(opts.memberId).first()
  if (!live) throw new Error('승인·활성 상태의 회원에게만 발급할 수 있습니다.')

  const cnt: any = await db.prepare(
    `SELECT COUNT(*) AS n FROM mcp_tokens WHERE member_id = ? AND revoked_at IS NULL AND expires_at > ?`,
  ).bind(opts.memberId, Date.now()).first()
  if (Number(cnt?.n || 0) >= MAX_PER_MEMBER) throw new Error(`한 회원의 유효 토큰은 최대 ${MAX_PER_MEMBER}개입니다. 기존 토큰을 폐기하세요.`)

  const days = Math.min(Math.max(Number(opts.days ?? DEFAULT_DAYS) || DEFAULT_DAYS, 1), MAX_DAYS)
  const tokenId = base32(crypto.getRandomValues(new Uint8Array(7))).slice(0, 10) // 조회키(비밀 아님)
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)))             // 256bit CSPRNG
  const token = `${PAT_PREFIX}${tokenId}_${secret}`
  const now = Date.now()
  const scope = opts.projectIds && opts.projectIds.length ? JSON.stringify(opts.projectIds.map(Number)) : null

  await db.prepare(
    `INSERT INTO mcp_tokens (token_id, token_hash, member_id, label, scope_project_ids, created_at, created_by, expires_at, use_count)
     VALUES (?,?,?,?,?,?,?,?,0)`,
  ).bind(tokenId, await hmacHex(pepper, 'mcp:' + secret), opts.memberId, opts.label || null, scope, now, opts.createdBy, now + days * 86400000).run()

  const row = await db.prepare(`SELECT * FROM mcp_tokens WHERE token_id = ?`).bind(tokenId).first<PatRow>()
  return { token, row: row as PatRow }
}

export type PatAuth = { identity: Identity; row: PatRow; scope: number[] | null }

/**
 * Authorization 헤더 → 신원. 실패는 전부 null 하나로 수렴한다(사유를 외부에 구분 노출하지 않음).
 * 순서가 곧 보안이다: 프리픽스 → 조회 → 폐기/만료 → 해시 → 소유자 라이브 재검증.
 */
export async function verifyPat(db: D1Database, pepper: string, authHeader: string | undefined): Promise<PatAuth | null> {
  if (!pepper) return null // 시크릿 미설정 → fail-closed
  const raw = (authHeader || '').startsWith('Bearer ') ? (authHeader as string).slice(7).trim() : ''
  // 1) 프리픽스 강제 — SYNC_TOKEN 등 다른 표면의 자격은 여기서 즉시 거부(표면 혼용 차단)
  if (!raw.startsWith(PAT_PREFIX)) return null
  const rest = raw.slice(PAT_PREFIX.length)
  const us = rest.indexOf('_')
  if (us < 1) return null
  const tokenId = rest.slice(0, us)
  const secret = rest.slice(us + 1)
  if (!/^[a-z2-7]{4,32}$/.test(tokenId) || secret.length < 20) return null

  // 2) 조회 + 폐기/만료
  const row = await db.prepare(`SELECT * FROM mcp_tokens WHERE token_id = ?`).bind(tokenId).first<PatRowInternal>()
  if (!row || row.revoked_at || Number(row.expires_at) <= Date.now()) return null

  // 3) 해시 상수시간 비교
  if (!safeEq(await hmacHex(pepper, 'mcp:' + secret), String(row.token_hash))) return null

  // 4) 소유자 라이브 재검증 — 탈퇴·승인철회 즉시 무효. 실패 시 고아 토큰 자동 폐기.
  const m: any = await db.prepare(
    `SELECT id, login_id FROM managers WHERE id = ? AND active = 1 AND status = 'approved'`,
  ).bind(row.member_id).first()
  if (!m) {
    await db.prepare(`UPDATE mcp_tokens SET revoked_at = ?, revoked_by = 'auto:owner-inactive' WHERE id = ? AND revoked_at IS NULL`)
      .bind(Date.now(), row.id).run()
    return null
  }

  return {
    identity: { role: 'manager', memberId: Number(row.member_id), label: `mcp:${m.login_id ?? row.member_id}` },
    row,
    scope: row.scope_project_ids ? (JSON.parse(row.scope_project_ids) as number[]).map(Number) : null,
  }
}

/** 사용 기록 — 5분 스로틀(D1 write 절약). 토큰 원문은 기록하지 않는다. */
export async function touchPat(db: D1Database, row: PatRow): Promise<void> {
  const now = Date.now()
  if (row.last_used_at && now - Number(row.last_used_at) < TOUCH_INTERVAL_MS) return
  await db.prepare(`UPDATE mcp_tokens SET last_used_at = ?, use_count = COALESCE(use_count,0) + 1 WHERE id = ?`)
    .bind(now, row.id).run()
}

/** PAT 의 최종 허용 프로젝트 = 소유자 권한 ∩ 토큰 스코프. 교집합이라 권한 상승이 불가능하다. */
export function intersectScope(allow: Set<number> | null, scope: number[] | null): Set<number> {
  // PAT 은 언제나 manager 신원이므로 allow 는 Set(null 이 올 수 없다) — 방어적으로 처리.
  const base = allow === null ? null : allow
  if (base === null) return new Set(scope ?? [])
  if (!scope) return base
  return new Set([...base].filter((id) => scope.includes(id)))
}
