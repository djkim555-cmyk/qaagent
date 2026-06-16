// Worker 내장 Google 로그인(OIDC) + 서명 세션 쿠키 + 이메일 허용목록.
// Cloudflare Access 대체(이 계정은 도메인이 없어 Access 불가). 이메일=신원 → 트리아지 updated_by.
//
// 필요한 환경값(M1 가이드 참조):
//   GOOGLE_CLIENT_ID     (var/secret) — Google OAuth 클라이언트 ID
//   GOOGLE_CLIENT_SECRET (secret)     — 클라이언트 시크릿
//   SESSION_SECRET       (secret)     — 세션 쿠키 서명용 랜덤
//   ALLOWED_EMAILS       (var, 선택)  — 쉼표구분 허용 이메일
//   ALLOWED_DOMAIN       (var, 선택)  — 허용 도메인(예: malgnsoft.com). 이메일/도메인 중 하나라도 맞으면 허용.
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'

const SESS = 'qa_sess'
const STATE = 'qa_oauth_state'
const MAX_AGE = 60 * 60 * 24 * 7 // 7일(초)

const enc = (s: string) => new TextEncoder().encode(s)
function b64urlFromBytes(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function b64urlDecode(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return atob(s)
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc(data))
  return b64urlFromBytes(new Uint8Array(sig))
}
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// 세션 쿠키: base64url(JSON{email,exp}).hmac
async function issueSession(c: Context, email: string) {
  const body = b64url(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + MAX_AGE }))
  const sig = await hmac(c.env.SESSION_SECRET, body)
  setCookie(c, SESS, `${body}.${sig}`, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: MAX_AGE })
}
export async function sessionEmail(c: Context): Promise<string | null> {
  const raw = getCookie(c, SESS)
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot < 1) return null
  const body = raw.slice(0, dot), sig = raw.slice(dot + 1)
  if (!safeEq(sig, await hmac(c.env.SESSION_SECRET, body))) return null
  try {
    const o = JSON.parse(b64urlDecode(body))
    if (!o.email || !o.exp || o.exp < Math.floor(Date.now() / 1000)) return null
    return String(o.email)
  } catch { return null }
}

export function isAllowed(c: Context, email: string): boolean {
  const e = email.trim().toLowerCase()
  const emails = String(c.env.ALLOWED_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
  const domain = String(c.env.ALLOWED_DOMAIN || '').trim().toLowerCase().replace(/^@/, '')
  if (!emails.length && !domain) return false // 허용목록 미설정이면 잠금(아무도 통과 못 함 → 명시 설정 강제)
  if (emails.includes(e)) return true
  if (domain && e.endsWith('@' + domain)) return true
  return false
}

const redirectUri = (c: Context) => new URL(c.req.url).origin + '/auth/callback'

export function loginRedirect(c: Context): Response {
  if (!c.env.GOOGLE_CLIENT_ID) return c.text('GOOGLE_CLIENT_ID 미설정 — 로그인 구성 필요', 503)
  const state = b64urlFromBytes(crypto.getRandomValues(new Uint8Array(16)))
  setCookie(c, STATE, state, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 600 })
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID)
  u.searchParams.set('redirect_uri', redirectUri(c))
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', 'openid email profile')
  u.searchParams.set('state', state)
  u.searchParams.set('prompt', 'select_account')
  return c.redirect(u.toString())
}

export async function callback(c: Context): Promise<Response> {
  const code = c.req.query('code'), state = c.req.query('state')
  if (!code || !state || state !== getCookie(c, STATE)) return c.text('잘못된 로그인 요청(state 불일치)', 400)
  deleteCookie(c, STATE, { path: '/' })
  // code → token 교환
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: c.env.GOOGLE_CLIENT_ID, client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(c), grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) return c.text('토큰 교환 실패', 401)
  const tok = (await res.json()) as any
  // id_token(JWT) 페이로드에서 이메일 추출(구글 토큰 엔드포인트 직접 응답이라 페이로드 신뢰)
  let email = '', verified = false
  try {
    const payload = JSON.parse(b64urlDecode(String(tok.id_token).split('.')[1]))
    email = String(payload.email || '').toLowerCase()
    verified = payload.email_verified === true || payload.email_verified === 'true'
  } catch { return c.text('id_token 파싱 실패', 401) }
  if (!email || !verified) return c.text('이메일 확인 실패', 401)
  if (!isAllowed(c, email)) return c.html(deniedHtml(email), 403)
  await issueSession(c, email)
  return c.redirect('/')
}

export function logout(c: Context): Response {
  deleteCookie(c, SESS, { path: '/' })
  return c.redirect('/login')
}

function deniedHtml(email: string): string {
  return `<!doctype html><meta charset=utf-8><body style="font-family:DM Sans,system-ui;padding:48px;color:#334155">
  <h2 style="color:#dc2626">접근 권한 없음</h2><p><b>${email}</b> 은 허용목록에 없습니다.</p>
  <p style="color:#64748b">관리자에게 허용 요청하거나 <a href="/auth/logout">다른 계정으로 로그인</a>하세요.</p></body>`
}

// 미로그인 시 보여줄 로그인 페이지
export function loginPageHtml(): string {
  return `<!doctype html><html lang=ko><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
  <title>QA 결과 뷰어 · 로그인</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel=stylesheet>
  <body style="font-family:'DM Sans',system-ui;background:#f8fafc;color:#1e293b;display:grid;place-items:center;height:100vh;margin:0">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:40px;text-align:center;max-width:360px">
      <div style="font-size:20px;font-weight:700;letter-spacing:-.02em;margin-bottom:8px">QA 결과 뷰어</div>
      <div style="color:#64748b;font-size:14px;margin-bottom:24px">허용된 구글 계정으로 로그인하세요.</div>
      <a href="/auth/login" style="display:inline-flex;align-items:center;gap:8px;justify-content:center;background:#2B7FFF;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:0 16px;height:44px;border-radius:6px;width:100%">Google로 로그인</a>
    </div>
  </body></html>`
}
