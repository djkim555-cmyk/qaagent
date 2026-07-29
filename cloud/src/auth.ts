// QA 에이전트팀 로그인 체계(ID/PW)를 뷰어로 이식.
//  - 슈퍼관리자: login_id === SUPER_ID(기본 'admin') + 비밀번호 === SUPER_PASSWORD(env). DB에 없음.
//  - 회원: managers(login_id 로 조회) + HMAC(PW_HASH_SECRET,'pw:'+pw) === password_hash + status='approved' + active=1.
//    회원/매칭은 로컬 웹앱에서 /sync/members 로 단방향 복제된다(승인은 웹앱에서만).
//    가입 신청은 여기(/auth/signup)서 signup_requests 에 접수 → 로컬이 /sync/signups 로 회수 → 웹앱에서 승인.
//
// 필요한 환경값:
//   SUPER_PASSWORD (secret) — 슈퍼관리자 마스터 비밀번호(웹앱 QA_PASSWORD 와 동일 값)
//   PW_HASH_SECRET (secret) — 회원 비밀번호 해시 검증·생성용. 반드시 웹앱 **QA_PW_PEPPER** 와 같은 값이어야 한다.
//     (QA_SESSION_SECRET 이 아니다 — 웹앱 auth.ts hashPassword 가 쓰는 키는 QA_PW_PEPPER.
//      어긋나면 클라우드 가입자가 로컬에서, 로컬 회원이 클라우드에서 "조용히" 로그인 실패한다.)
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
// 시크릿 fail-closed — 미설정 시 enc(undefined) 가 문자열 "undefined" 를 키로 써서
// **누구나 {r:'super'} 쿠키를 위조**할 수 있게 된다(로컬 웹앱은 requireSecret 로 이미 막고 있다).
// 공개된 기본값도 거부한다(이미 노출된 자격증명이므로).
const PUBLIC_DEFAULTS = ['change-me', 'qa-agent-team-internal-secret-v1', 'malgnqa']
class SecretMissing extends Error {}
function requireSecret(name: string, v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s || PUBLIC_DEFAULTS.includes(s)) throw new SecretMissing(`[auth] 필수 시크릿 ${name} 가 설정되지 않았거나 공개 기본값입니다.`)
  return s
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
  const sig = await hmacB64(requireSecret('SESSION_SECRET', c.env.SESSION_SECRET), body)
  setCookie(c, SESS, `${body}.${sig}`, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: MAX_AGE })
}

// 유효 세션의 신원 또는 null.
export async function sessionUser(c: Context): Promise<Identity | null> {
  const raw = getCookie(c, SESS)
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot < 1) return null
  const body = raw.slice(0, dot), sig = raw.slice(dot + 1)
  let secret: string
  try { secret = requireSecret('SESSION_SECRET', c.env.SESSION_SECRET) } catch { return null } // fail-closed
  if (!safeEq(sig, await hmacB64(secret, body))) return null
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

  try { requireSecret('SESSION_SECRET', c.env.SESSION_SECRET) } catch {
    return c.html(loginPageHtml('서버 인증 설정 오류(SESSION_SECRET). 관리자에게 알려주세요.', loginId), 503)
  }
  const superId = String(c.env.SUPER_ID || 'admin').trim().toLowerCase()
  // 슈퍼관리자: 전용 아이디 + 마스터 비밀번호
  if (loginId === superId) {
    // 슈퍼 비밀번호도 fail-closed — 미설정이거나 문서에 공개된 기본값(malgnqa 등)이면 로그인 자체를 막는다.
    // 슈퍼 계정은 MCP 토큰 발급 권한까지 가지므로 탈취 시 피해가 "조회"에서 "지속적 자격 발급"으로 커진다.
    let superPw: string
    try { superPw = requireSecret('SUPER_PASSWORD', c.env.SUPER_PASSWORD) } catch {
      return c.html(loginPageHtml('서버 인증 설정 오류(SUPER_PASSWORD). 관리자에게 알려주세요.', loginId), 503)
    }
    if (safeEq(pw, superPw)) {
      await issueSession(c, { role: 'super', memberId: null, label: 'admin' })
      return c.redirect('/')
    }
    return c.html(loginPageHtml('아이디 또는 비밀번호가 올바르지 않습니다.', loginId), 401)
  }

  // 회원: DB 조회 + 해시 검증 + 승인·활성 확인
  // ⚠ 시크릿은 반드시 가입(handleSignup)과 **같은 방식(requireSecret = trim)** 으로 읽는다.
  //   실사고: wrangler secret 을 파이프로 넣어 값 끝에 개행이 붙자, 가입은 trim 된 값으로 해시하고
  //   로그인은 원본(개행 포함)으로 해시해 같은 비밀번호가 조용히 401 이 났다. 읽는 방식이 갈리면 안 된다.
  let pepper: string
  try { pepper = requireSecret('PW_HASH_SECRET', c.env.PW_HASH_SECRET) } catch {
    return c.html(loginPageHtml('서버 인증 설정 오류(PW_HASH_SECRET). 관리자에게 알려주세요.', loginId), 503)
  }
  const m: any = await c.env.DB.prepare(
    `SELECT id, password_hash, status, active FROM managers WHERE login_id = ?`,
  ).bind(loginId).first()
  if (m && Number(m.active) === 1 && m.password_hash) {
    const calc = await hmacHex(pepper, 'pw:' + pw)
    if (safeEq(calc, String(m.password_hash))) {
      if (m.status !== 'approved') return c.html(loginPageHtml('가입 승인 대기 중입니다. 관리자 승인 후 로그인할 수 있습니다.', loginId), 403)
      await issueSession(c, { role: 'manager', memberId: Number(m.id), label: loginId })
      return c.redirect('/')
    }
  }
  return c.html(loginPageHtml('아이디 또는 비밀번호가 올바르지 않습니다.', loginId), 401)
}

/* ───────────────── 회원가입 신청 접수 (공개 엔드포인트) ─────────────────
   managers 에 직접 쓰지 않고 signup_requests 에 접수만 한다(로컬 id 채번 충돌 방지 — 0004 마이그레이션 주석).
   검증 규칙은 로컬 웹앱 webapp/src/server.ts validateSignup 과 **동일**해야 한다
   (여기서 통과한 신청이 로컬 승인 단계에서 다시 반려되면 사용자가 이유를 알 수 없다). */
const LOGIN_ID_RE = /^[A-Za-z0-9._-]{4,20}$/
const SIGNUP_BODY_MAX = 4096        // 폼 본문 상한(바이트/문자) — 공개 표면이라 대용량 POST 를 즉시 거절
const SIGNUP_QUEUE_MAX = 200        // 미회수 신청 누적 상한 — 초과 시 신규 접수 거부(무한 적재 방지)
const SIGNUP_PW_MAX = 200           // 해시 입력 상한. 잘라내지 않고 거절한다(자르면 로그인 때 해시가 어긋난다)

// 접수 결과 화면(성공/실패 모두 회원가입 탭을 유지한 채 다시 그린다)
const signupPage = (c: Context, status: 400 | 409 | 413 | 503, message: string, keep: { name?: string; loginId?: string; contact?: string }) =>
  c.html(loginPageHtml('', '', { tab: 'signup', signupError: message, signup: keep }), status)

// POST /auth/signup (form: name, loginId, password, contact)
export async function handleSignup(c: Context): Promise<Response> {
  // ① 본문 크기 제한 — parseBody 전에 헤더로 먼저 거르고, 헤더가 없으면 실제 길이로 다시 검사.
  const declared = Number(c.req.header('content-length') || 0)
  if (declared > SIGNUP_BODY_MAX) return signupPage(c, 413, '입력이 너무 깁니다.', {})
  const raw = await c.req.text()
  if (raw.length > SIGNUP_BODY_MAX) return signupPage(c, 413, '입력이 너무 깁니다.', {})
  const form = new URLSearchParams(raw)

  const loginIdRaw = String(form.get('loginId') ?? '').trim()
  const loginId = loginIdRaw.toLowerCase()
  const name = String(form.get('name') ?? '').trim().slice(0, 60)
  const password = String(form.get('password') ?? '')
  const contact = String(form.get('contact') ?? '').trim().slice(0, 120)
  const keep = { name, loginId: loginIdRaw, contact }

  // ② 형식 검증 — 순서·문구를 웹앱 validateSignup 과 일치시킨다.
  if (!name) return signupPage(c, 400, '이름을 입력하세요.', keep)
  if (!LOGIN_ID_RE.test(loginIdRaw)) return signupPage(c, 400, '아이디는 영문/숫자/._- 조합 4~20자로 입력하세요.', keep)
  const superId = String(c.env.SUPER_ID || 'admin').trim().toLowerCase()
  if (loginId === superId) return signupPage(c, 400, '사용할 수 없는 아이디입니다.', keep)
  if (password.length < 4) return signupPage(c, 400, '비밀번호는 4자 이상이어야 합니다.', keep)
  if (password.length > SIGNUP_PW_MAX) return signupPage(c, 400, `비밀번호는 ${SIGNUP_PW_MAX}자 이하로 입력하세요.`, keep)

  // ③ 해시 시크릿 fail-closed — 없으면 접수 자체를 막는다(평문 저장으로 우회하지 않는다).
  let pepper: string
  try { pepper = requireSecret('PW_HASH_SECRET', c.env.PW_HASH_SECRET) } catch {
    return signupPage(c, 503, '서버 인증 설정 오류(PW_HASH_SECRET). 관리자에게 알려주세요.', keep)
  }

  // ④ 중복: 이미 있는 회원 + 접수 대기 중인 신청 양쪽을 본다.
  const dupMember: any = await c.env.DB.prepare(`SELECT 1 AS x FROM managers WHERE login_id = ?`).bind(loginId).first()
  const dupReq: any = dupMember ? null : await c.env.DB.prepare(`SELECT 1 AS x FROM signup_requests WHERE login_id = ?`).bind(loginId).first()
  if (dupMember || dupReq) return signupPage(c, 409, '이미 사용 중인 아이디입니다.', keep)

  // ⑤ 접수함 상한 — 회수되지 않은 신청이 쌓이면 신규 접수를 멈춘다(공개 표면 남용 방지).
  const cnt: any = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM signup_requests`).first()
  if (Number(cnt?.n || 0) >= SIGNUP_QUEUE_MAX) {
    return signupPage(c, 503, '가입 신청이 많아 접수를 잠시 중단했습니다. 관리자에게 문의해 주세요.', keep)
  }

  // ⑥ 저장 — 평문 비밀번호는 저장·로그 어디에도 남기지 않는다.
  const hash = await hmacHex(pepper, 'pw:' + password)
  try {
    await c.env.DB.prepare(
      `INSERT INTO signup_requests (login_id, name, contact, password_hash, created_at) VALUES (?,?,?,?,?)`,
    ).bind(loginId, name, contact || null, hash, Date.now()).run()
  } catch {
    // UNIQUE 경합(동시 신청) 등 — 사용자에겐 중복과 같은 문구로 응답한다.
    return signupPage(c, 409, '이미 사용 중인 아이디입니다.', keep)
  }
  return c.html(loginPageHtml('', '', { tab: 'signup', signupDone: true }))
}

export function logout(c: Context): Response {
  deleteCookie(c, SESS, { path: '/' })
  return c.redirect('/login')
}

// 로그인/회원가입 페이지의 탭 상태·입력 유지용 옵션.
// 자바스크립트 없이(서버 렌더) 동작하므로 탭은 ?tab=signup 쿼리로 표현하고,
// 실패 시 입력값·오류 문구를 서버가 다시 그려 준다.
export type LoginPageOpts = {
  tab?: 'login' | 'signup'
  signupError?: string
  signup?: { name?: string; loginId?: string; contact?: string }
  signupDone?: boolean
}

// 로그인 페이지 — QA 에이전트팀 콘솔과 동일한 룩. 디자인 토큰: Primary #2B7FFF, DM Sans + Pretendard.
// 로컬 웹앱 login.html 과 같은 UX([로그인][회원가입] 탭)를 서버 렌더로 재현한다.
export function loginPageHtml(error = '', loginId = '', opts: LoginPageOpts = {}): string {
  const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string))
  const err = error
    ? `<div class="text-red-600 text-sm">${esc(error)}</div>`
    : ''
  const tab: 'login' | 'signup' = opts.tab === 'signup' ? 'signup' : 'login'
  const su = opts.signup || {}
  const suErr = opts.signupError ? `<div class="text-red-600 text-sm">${esc(opts.signupError)}</div>` : ''
  const tabCls = (on: boolean) =>
    on
      ? 'flex-1 h-8 inline-flex items-center justify-center rounded-md text-sm font-semibold bg-white text-primary-700 shadow-sm'
      : 'flex-1 h-8 inline-flex items-center justify-center rounded-md text-sm font-semibold text-slate-500 hover:text-slate-700'

  const tabs = `
      <div class="flex gap-1 p-1 bg-slate-100 rounded-lg mb-4">
        <a href="/login" class="${tabCls(tab === 'login')}">로그인</a>
        <a href="/login?tab=signup" class="${tabCls(tab === 'signup')}">회원가입</a>
      </div>`

  const loginForm = `
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
      </form>`

  const signupDone = `
      <div class="space-y-3">
        <div class="rounded-md bg-emerald-50 ring-1 ring-inset ring-emerald-500/20 px-3 py-2.5 text-sm text-emerald-700">
          가입 신청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.
        </div>
        <a href="/login" class="inline-flex items-center justify-center w-full h-11 rounded-md ring-1 ring-inset ring-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition">로그인으로</a>
      </div>`

  const signupForm = `
      <form method="post" action="/auth/signup" class="space-y-3">
        <div>
          <label class="label" for="suName">이름</label>
          <input id="suName" name="name" type="text" class="input" placeholder="홍길동" autocomplete="name" autofocus value="${esc(su.name || '')}" />
        </div>
        <div>
          <label class="label" for="suLoginId">아이디</label>
          <input id="suLoginId" name="loginId" type="text" class="input" placeholder="영문/숫자/._- 4~20자" autocomplete="username" value="${esc(su.loginId || '')}" />
        </div>
        <div>
          <label class="label" for="suPassword">비밀번호</label>
          <input id="suPassword" name="password" type="password" class="input" placeholder="4자 이상" autocomplete="new-password" />
        </div>
        <div>
          <label class="label" for="suContact">연락처 <span class="text-slate-400 font-normal">(선택)</span></label>
          <input id="suContact" name="contact" type="text" class="input" placeholder="이메일 또는 슬랙" autocomplete="off" value="${esc(su.contact || '')}" />
        </div>
        ${suErr}
        <button class="btn-primary" type="submit">회원가입 신청</button>
        <p class="text-slate-500 text-sm text-center pt-1">가입 후 관리자 승인을 받으면 로그인할 수 있습니다.</p>
      </form>`

  const panel = tab === 'signup' ? (opts.signupDone ? signupDone : signupForm) : loginForm
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
        <p class="text-slate-500 text-sm mb-4">사내 QA 에이전트 콘솔</p>
      </div>
${tabs}
${panel}
    </div>
  </div>
</div>
</body></html>`
}
