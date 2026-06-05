import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import * as repo from './repo.js'

// 비밀번호 단독 로그인. 입력한 비밀번호가 신원을 결정한다:
//  - QA_PASSWORD(기본 malgnqa) 일치  → 최고관리자(super)
//  - 관리자 password_hash 일치        → 해당 프로젝트 관리자(manager)
const SUPER_PASSWORD = process.env.QA_PASSWORD || 'malgnqa'
const SECRET = process.env.QA_SESSION_SECRET || 'qa-agent-team-internal-secret-v1'
const COOKIE = 'qa_session'
const MAX_AGE = 1000 * 60 * 60 * 24 * 7 // 7일

export type Identity = { role: 'super' | 'manager'; managerId: number | null }

// 비밀번호 → HMAC 해시. DB 에는 평문이 아니라 이 해시만 저장(전체 고유 = 로그인 식별 키).
export function hashPassword(pw: string): string {
  return crypto.createHmac('sha256', SECRET).update('pw:' + String(pw ?? '')).digest('hex')
}

const SUPER_HASH = hashPassword(SUPER_PASSWORD)

// 입력 비밀번호로 신원 판정. 실패 시 null.
export function authenticate(pw: string): Identity | null {
  const hash = hashPassword(pw)
  // 최고관리자 우선 (타이밍 안전 비교)
  const a = Buffer.from(hash), b = Buffer.from(SUPER_HASH)
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { role: 'super', managerId: null }
  const m = repo.getManagerByPasswordHash(hash)
  if (m) return { role: 'manager', managerId: Number(m.id) }
  return null
}

// 관리자 비밀번호가 최고관리자 비밀번호와 충돌하는지(같은 비밀번호 금지)
export function isSuperPassword(pw: string): boolean {
  const a = Buffer.from(hashPassword(pw)), b = Buffer.from(SUPER_HASH)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/* ── 서명 쿠키: base64url(payload).hmac — 신원(role/managerId)을 위변조 없이 담는다 ── */
function sign(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex')
}
function encode(id: Identity): string {
  const body = Buffer.from(JSON.stringify({ r: id.role, m: id.managerId })).toString('base64url')
  return `${body}.${sign(body)}`
}
function decode(raw: string | undefined): Identity | null {
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot < 1) return null
  const body = raw.slice(0, dot), sig = raw.slice(dot + 1)
  const expect = sign(body)
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null
  try {
    const o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (o.r !== 'super' && o.r !== 'manager') return null
    return { role: o.r, managerId: o.m == null ? null : Number(o.m) }
  } catch { return null }
}

export function issueCookie(res: Response, id: Identity) {
  res.cookie(COOKIE, encode(id), { httpOnly: true, sameSite: 'lax', maxAge: MAX_AGE })
}
export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE)
}

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  const h = req.headers.cookie
  if (!h) return out
  for (const part of h.split(';')) {
    const i = part.indexOf('=')
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

// 요청의 신원(쿠키 검증 + 관리자는 계정 활성 확인). 미인증/무효 → null.
export function getIdentity(req: Request): Identity | null {
  const id = decode(parseCookies(req)[COOKIE])
  if (!id) return null
  // 관리자 계정이 삭제/비활성화되면 즉시 무효화
  if (id.role === 'manager') {
    if (id.managerId == null || !repo.getManager(id.managerId)) return null
  }
  return id
}

// 페이지 가드: 미인증 → 로그인으로
export function requirePage(req: Request, res: Response, next: NextFunction) {
  if (getIdentity(req)) return next()
  res.redirect('/login')
}
// API 가드: 신원을 req.identity 에 부착, 미인증 → 401
export function requireApi(req: Request, res: Response, next: NextFunction) {
  const id = getIdentity(req)
  if (!id) return res.status(401).json({ error: 'unauthorized' })
  ;(req as any).identity = id
  next()
}
// 최고관리자 전용 가드
export function requireSuper(req: Request, res: Response, next: NextFunction) {
  const id = (req as any).identity as Identity | undefined
  if (id?.role !== 'super') return res.status(403).json({ error: 'forbidden', message: '최고관리자만 가능합니다.' })
  next()
}
