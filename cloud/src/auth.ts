// QA 에이전트팀 로그인 체계(ID/PW)를 뷰어로 이식.
//  - 슈퍼관리자: login_id === SUPER_ID(기본 'admin') + 비밀번호 === SUPER_PASSWORD(env). DB에 없음.
//  - 회원: managers(login_id 로 조회) + HMAC(PW_HASH_SECRET,'pw:'+pw) === password_hash + status='approved' + active=1.
//    회원/매칭은 로컬 웹앱에서 /sync/members 로 단방향 복제된다(가입·승인은 웹앱에서만).
//
// 필요한 환경값:
//   SUPER_PASSWORD (secret) — 슈퍼관리자 마스터 비밀번호(웹앱 QA_PASSWORD 와 동일 값)
//   PW_HASH_SECRET (secret) — 회원 비밀번호 해시 검증용(웹앱 QA_SESSION_SECRET 와 동일 값)
//   SESSION_SECRET (secret) — 세션 쿠키 서명용 랜덤(뷰어 자체)
//   SUPER_ID       (var, 선택) — 슈퍼관리자 아이디(기본 'admin')
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'

const SESS = 'qa_sess'
const MAX_AGE = 60 * 60 * 24 * 7 // 7일(초)
const enc = (s: string) => new TextEncoder().encode(s)

// 신원: 세션 쿠키에 담기는 최소 정보. memberId 로 프로젝트 접근을 격리한다.
export type Identity = { role: 'super' | 'manager'; memberId: number | null; label: string }

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
async function importKey(secret: string) {
  return crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}
// 세션 서명용(base64url) — 쿠키 위변조 방지
async function hmacB64(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await importKey(secret), enc(data))
  return b64urlFromBytes(new Uint8Array(sig))
}
// 비밀번호 해시용(hex) — 웹앱 auth.ts hashPassword(HMAC-SHA256 hex)와 바이트 단위로 동일해야 함
async function hmacHex(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await importKey(secret), enc(data))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function issueSession(c: Context, id: Identity) {
  const body = b64url(JSON.stringify({ r: id.role, m: id.memberId, u: id.label, exp: Math.floor(Date.now() / 1000) + MAX_AGE }))
  const sig = await hmacB64(c.env.SESSION_SECRET, body)
  setCookie(c, SESS, `${body}.${sig}`, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: MAX_AGE })
}

// 유효 세션의 신원 또는 null.
export async function sessionUser(c: Context): Promise<Identity | null> {
  const raw = getCookie(c, SESS)
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot < 1) return null
  const body = raw.slice(0, dot), sig = raw.slice(dot + 1)
  if (!safeEq(sig, await hmacB64(c.env.SESSION_SECRET, body))) return null
  try {
    const o = JSON.parse(b64urlDecode(body))
    if (!o.exp || o.exp < Math.floor(Date.now() / 1000)) return null
    if (o.r !== 'super' && o.r !== 'manager') return null
    return { role: o.r, memberId: o.m == null ? null : Number(o.m), label: String(o.u || (o.r === 'super' ? 'admin' : 'member')) }
  } catch { return null }
}

// 아이디/비밀번호 검증 → 세션 발급. POST /auth/login (form: loginId, password)
export async function handleLogin(c: Context): Promise<Response> {
  const form = await c.req.parseBody()
  const loginId = String(form.loginId || '').trim().toLowerCase()
  const pw = String(form.password || '')
  if (!loginId || !pw) return c.html(loginPageHtml('아이디와 비밀번호를 입력하세요.', loginId), 400)

  const superId = String(c.env.SUPER_ID || 'admin').trim().toLowerCase()
  // 슈퍼관리자: 전용 아이디 + 마스터 비밀번호
  if (loginId === superId) {
    if (c.env.SUPER_PASSWORD && safeEq(pw, String(c.env.SUPER_PASSWORD))) {
      await issueSession(c, { role: 'super', memberId: null, label: 'admin' })
      return c.redirect('/')
    }
    return c.html(loginPageHtml('아이디 또는 비밀번호가 올바르지 않습니다.', loginId), 401)
  }

  // 회원: DB 조회 + 해시 검증 + 승인·활성 확인
  if (!c.env.PW_HASH_SECRET) return c.html(loginPageHtml('서버 인증 설정 오류(PW_HASH_SECRET).', loginId), 503)
  const m: any = await c.env.DB.prepare(
    `SELECT id, password_hash, status, active FROM managers WHERE login_id = ?`,
  ).bind(loginId).first()
  if (m && Number(m.active) === 1 && m.password_hash) {
    const calc = await hmacHex(c.env.PW_HASH_SECRET, 'pw:' + pw)
    if (safeEq(calc, String(m.password_hash))) {
      if (m.status !== 'approved') return c.html(loginPageHtml('가입 승인 대기 중입니다. 관리자 승인 후 로그인할 수 있습니다.', loginId), 403)
      await issueSession(c, { role: 'manager', memberId: Number(m.id), label: loginId })
      return c.redirect('/')
    }
  }
  return c.html(loginPageHtml('아이디 또는 비밀번호가 올바르지 않습니다.', loginId), 401)
}

export function logout(c: Context): Response {
  deleteCookie(c, SESS, { path: '/' })
  return c.redirect('/login')
}

// 로그인 페이지 — QA 에이전트팀 콘솔과 동일한 룩(로그인 전용). 디자인 토큰: Primary #2B7FFF, DM Sans + Pretendard.
export function loginPageHtml(error = '', loginId = ''): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string))
  const err = error
    ? `<div class="text-red-600 text-sm">${esc(error)}</div>`
    : ''
  return `<!doctype html><html lang="ko"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>QA 에이전트팀 · 로그인</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<script src="https://cdn.tailwindcss.com?plugins=forms"></script>
<script>
tailwind.config = { theme: { extend: {
  colors: { primary: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#2B7FFF',600:'#2563eb',700:'#1d4ed8' } },
  fontFamily: { sans: ['DM Sans','Pretendard','system-ui','sans-serif'] },
} } }
</script>
<style type="text/tailwindcss">
  body { letter-spacing: -0.01em; }
  .card { @apply bg-white rounded-md ring-1 ring-inset ring-slate-200; }
  .label { @apply block text-sm font-medium text-slate-700 mb-1; }
  .input { @apply w-full rounded-md ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-primary-500 border-0 text-sm h-11 px-3; }
  .btn-primary { @apply inline-flex items-center justify-center w-full h-11 rounded-md bg-primary-500 text-white font-semibold text-sm hover:bg-primary-600 transition; }
</style>
</head>
<body class="text-slate-800 text-sm">
<div class="min-h-screen grid place-items-center px-4" style="background:radial-gradient(1200px 600px at 50% -10%, #eff6ff, #f8fafc)">
  <div class="card shadow-2xl w-[380px]">
    <div class="p-7">
      <div class="text-center">
        <span class="inline-flex items-center justify-center size-11 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white text-base font-extrabold shadow-sm shadow-primary-500/30">QA</span>
        <h1 class="text-lg font-bold tracking-tight mt-3 mb-1">QA 에이전트팀</h1>
        <p class="text-slate-500 text-sm mb-5">사내 QA 에이전트 콘솔</p>
      </div>
      <form method="post" action="/auth/login" class="space-y-3">
        <div>
          <label class="label" for="loginId">아이디</label>
          <input id="loginId" name="loginId" type="text" class="input" placeholder="아이디" autocomplete="username" autofocus value="${esc(loginId)}" />
        </div>
        <div>
          <label class="label" for="password">비밀번호</label>
          <input id="password" name="password" type="password" class="input" placeholder="비밀번호" autocomplete="current-password" />
        </div>
        ${err}
        <button class="btn-primary" type="submit">로그인</button>
        <p class="text-slate-500 text-sm text-center pt-1">슈퍼관리자는 전용 아이디(<code class="text-xs bg-slate-100 rounded px-1">admin</code>)와 마스터 비밀번호로 로그인합니다.</p>
      </form>
    </div>
  </div>
</div>
</body></html>`
}
