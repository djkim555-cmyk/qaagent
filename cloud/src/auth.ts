// 공유 비밀번호 게이트 + 서명 세션 쿠키. (Cloudflare Access 불가 환경의 간단 인증)
// 비밀번호 1개로 잠그고, 통과 시 HMAC 서명 세션 쿠키 발급. 개인 식별은 없음(공용).
//
// 필요한 환경값:
//   VIEW_PASSWORD  (secret) — 공유 열람 비밀번호
//   SESSION_SECRET (secret) — 세션 쿠키 서명용 랜덤
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'

const SESS = 'qa_sess'
const MAX_AGE = 60 * 60 * 24 * 7 // 7일(초)
const enc = (s: string) => new TextEncoder().encode(s)

function b64urlFromBytes(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function b64urlDecode(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return decodeURIComponent(escape(atob(s)))
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

async function issueSession(c: Context, user: string) {
  const body = b64url(JSON.stringify({ u: user, exp: Math.floor(Date.now() / 1000) + MAX_AGE }))
  const sig = await hmac(c.env.SESSION_SECRET, body)
  setCookie(c, SESS, `${body}.${sig}`, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: MAX_AGE })
}

// 유효 세션의 사용자 식별자('shared') 또는 null. (트리아지 updated_by 로도 쓰임)
export async function sessionUser(c: Context): Promise<string | null> {
  const raw = getCookie(c, SESS)
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot < 1) return null
  const body = raw.slice(0, dot), sig = raw.slice(dot + 1)
  if (!safeEq(sig, await hmac(c.env.SESSION_SECRET, body))) return null
  try {
    const o = JSON.parse(b64urlDecode(body))
    if (!o.u || !o.exp || o.exp < Math.floor(Date.now() / 1000)) return null
    return String(o.u)
  } catch { return null }
}

// 비밀번호 검증 → 세션 발급. POST /auth/login (form: password)
export async function handleLogin(c: Context): Promise<Response> {
  const form = await c.req.parseBody()
  const pw = String(form.password || '')
  if (!c.env.VIEW_PASSWORD) return c.html(loginPageHtml('비밀번호가 서버에 설정되지 않았습니다(VIEW_PASSWORD).'), 503)
  if (!pw || !safeEq(pw, String(c.env.VIEW_PASSWORD))) return c.html(loginPageHtml('비밀번호가 올바르지 않습니다.'), 401)
  await issueSession(c, 'shared')
  return c.redirect('/')
}

export function logout(c: Context): Response {
  deleteCookie(c, SESS, { path: '/' })
  return c.redirect('/login')
}

// 비밀번호 로그인 페이지(디자인 토큰: Primary #2B7FFF, DM Sans)
export function loginPageHtml(error = ''): string {
  const err = error ? `<div style="color:#dc2626;font-size:13px;margin-bottom:12px">${error}</div>` : ''
  return `<!doctype html><html lang=ko><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
  <title>QA 결과 뷰어 · 로그인</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel=stylesheet>
  <body style="font-family:'DM Sans',system-ui;background:#f8fafc;color:#1e293b;display:grid;place-items:center;height:100vh;margin:0">
    <form method="post" action="/auth/login" style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:40px;max-width:360px;width:100%;box-sizing:border-box">
      <div style="font-size:20px;font-weight:700;letter-spacing:-.02em;margin-bottom:6px">QA 결과 뷰어</div>
      <div style="color:#64748b;font-size:14px;margin-bottom:20px">열람 비밀번호를 입력하세요.</div>
      ${err}
      <input type="password" name="password" placeholder="비밀번호" autofocus
        style="width:100%;box-sizing:border-box;height:44px;padding:0 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;margin-bottom:12px" />
      <button type="submit"
        style="width:100%;height:44px;background:#2B7FFF;color:#fff;border:0;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer">로그인</button>
    </form>
  </body></html>`
}
