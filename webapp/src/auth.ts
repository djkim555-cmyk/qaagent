import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import * as repo from './repo.js'

// ID/PW 로그인. 신원 판정:
//  - login_id === SUPER_ID(기본 'admin') 이고 비밀번호가 QA_PASSWORD 와 일치 → 슈퍼관리자(super)
//  - login_id 로 찾은 회원이 승인(approved)·활성 상태이고 password_hash 일치 → 회원(manager)
// 보안: 시크릿에 기본값을 제공하지 않는다(fail-closed).
//  - 미설정이면 서버를 기동하지 않는다(import 시점에 throw).
//  - 과거 소스/예시에 박혀 있던 공개 기본값도 거부한다(이미 노출된 자격증명이므로).
const PUBLIC_DEFAULTS: Record<string, string[]> = {
  QA_PASSWORD: ['malgnqa'],
  QA_SESSION_SECRET: ['change-me', 'qa-agent-team-internal-secret-v1'],
}
function requireSecret(name: 'QA_PASSWORD' | 'QA_SESSION_SECRET'): string {
  const v = (process.env[name] || '').trim()
  if (!v) {
    throw new Error(`[auth] 필수 환경변수 ${name} 가 설정되지 않았습니다. webapp/.env 또는 시크릿에 설정하세요(보안상 기본값을 제공하지 않습니다).`)
  }
  if (PUBLIC_DEFAULTS[name].includes(v)) {
    throw new Error(`[auth] ${name} 가 공개된 기본값(${v})으로 설정되어 있습니다. 고유한 값으로 변경하세요.`)
  }
  return v
}

const SUPER_PASSWORD = requireSecret('QA_PASSWORD')
// 슈퍼관리자 전용 로그인 아이디. 회원가입 시 이 아이디는 사용 금지. (비밀이 아니므로 기본값 'admin' 허용)
export const SUPER_ID = (process.env.QA_ADMIN_ID || 'admin').trim().toLowerCase()
const SECRET = requireSecret('QA_SESSION_SECRET')
const COOKIE = 'qa_session'
const MAX_AGE = 1000 * 60 * 60 * 24 * 7 // 7일

export type Identity = { role: 'super' | 'manager'; managerId: number | null }
// 로그인 결과: identity 가 있으면 성공. pending=true 면 미승인(친절한 메시지용).
export type AuthResult = { identity: Identity | null; pending?: boolean }

// 비밀번호 → HMAC 해시. DB 에는 평문이 아니라 이 해시만 저장.
export function hashPassword(pw: string): string {
  return crypto.createHmac('sha256', SECRET).update('pw:' + String(pw ?? '')).digest('hex')
}

const SUPER_HASH = hashPassword(SUPER_PASSWORD)
const eq = (x: string, y: string) => {
  const a = Buffer.from(x), b = Buffer.from(y)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// 입력 아이디+비밀번호로 신원 판정.
export function authenticate(loginId: string, pw: string): AuthResult {
  const id = String(loginId ?? '').trim().toLowerCase()
  // 슈퍼관리자: 전용 아이디 + 마스터 비밀번호
  if (id === SUPER_ID && eq(hashPassword(pw), SUPER_HASH)) return { identity: { role: 'super', managerId: null } }
  const m = repo.getMemberByLoginId(id)
  if (!m || !eq(hashPassword(pw), String(m.password_hash))) return { identity: null }
  if (m.status !== 'approved') return { identity: null, pending: true }
  return { identity: { role: 'manager', managerId: Number(m.id) } }
}

// 회원가입 아이디가 슈퍼관리자 전용 아이디와 충돌하는지
export function isReservedLoginId(loginId: string): boolean {
  return String(loginId ?? '').trim().toLowerCase() === SUPER_ID
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
  // 회원 계정이 삭제(탈퇴)·미승인되면 즉시 무효화
  if (id.role === 'manager') {
    if (id.managerId == null) return null
    const m = repo.getManager(id.managerId)
    if (!m || m.status !== 'approved') return null
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
