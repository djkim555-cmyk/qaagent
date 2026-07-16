// webapp/.env 안전 초기화·보정기 (멱등) — 비전문가용 원클릭 셋업의 핵심.
// - 필수 시크릿(QA_SESSION_SECRET, QA_PW_PEPPER)이 없거나 공개기본값이면 랜덤 생성.
// - QA_PASSWORD(admin 로그인 비번)는 --admin= 인자(또는 환경 ADMIN_PW)로 받고,
//   비어 있으면 안전한 값을 자동 생성해 화면에 1회 출력(운영자가 기록).
// - ANTHROPIC_API_KEY는 --apikey=(또는 환경 API_KEY)로 받으면 기록.
// - 기존 .env의 다른 값은 보존한다(재실행해도 안전).
// 실행: node scripts/setup-env.mjs --admin="..." --apikey="..."
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))
// auth.ts 가 거부하는 공개 기본값 — 이 값이면 새로 생성한다.
const BAD = new Set(['', 'change-me', 'qa-agent-team-internal-secret-v1', 'malgnqa'])

const parse = (text) => {
  const m = {}
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    m[t.slice(0, i).trim()] = t.slice(i + 1)
  }
  return m
}
const cur = existsSync(envPath) ? parse(readFileSync(envPath, 'utf8')) : {}
const gen = () => randomBytes(32).toString('hex')
const need = (k) => !cur[k] || BAD.has(cur[k])

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/)
    return m ? [m[1], m[2]] : [a, '']
  }),
)
const adminIn = (args.admin ?? process.env.ADMIN_PW ?? '').trim()
const apiIn = (args.apikey ?? process.env.API_KEY ?? '').trim()

// 관리자 로그인 비밀번호
let generatedAdmin = null
if (need('QA_PASSWORD')) {
  if (adminIn && !BAD.has(adminIn)) cur.QA_PASSWORD = adminIn
  else { cur.QA_PASSWORD = 'qa-' + randomBytes(4).toString('hex'); generatedAdmin = cur.QA_PASSWORD }
} else if (adminIn && !BAD.has(adminIn)) {
  cur.QA_PASSWORD = adminIn // 운영자가 새 비번을 지정하면 갱신
}
// 서버 전용 시크릿 — 운영자가 몰라도 됨
if (need('QA_SESSION_SECRET')) cur.QA_SESSION_SECRET = gen()
if (need('QA_PW_PEPPER')) cur.QA_PW_PEPPER = gen()
// API 키(선택)
if (apiIn) cur.ANTHROPIC_API_KEY = apiIn

// 나머지 기본값(있으면 보존)
const defaults = {
  ANTHROPIC_API_KEY: '', QA_ADMIN_ID: 'admin', PORT: '5510',
  QA_CONCURRENCY: '3', QA_MODEL: 'sonnet', QA_ENABLE_PLAYWRIGHT: 'true',
  QA_TEST_EMAIL: '', QA_TEST_PASSWORD: '',
}
for (const [k, v] of Object.entries(defaults)) if (cur[k] === undefined) cur[k] = v

const order = ['ANTHROPIC_API_KEY', 'QA_PASSWORD', 'QA_SESSION_SECRET', 'QA_PW_PEPPER',
  'QA_ADMIN_ID', 'PORT', 'QA_CONCURRENCY', 'QA_MODEL', 'QA_ENABLE_PLAYWRIGHT',
  'QA_TEST_EMAIL', 'QA_TEST_PASSWORD']
const out = ['# setup-env.mjs 가 생성/보정한 파일입니다. 시크릿 포함 — 공유·커밋 금지.']
for (const k of order) out.push(`${k}=${cur[k] ?? ''}`)
// order 밖 키도 보존
for (const k of Object.keys(cur)) if (!order.includes(k)) out.push(`${k}=${cur[k]}`)
writeFileSync(envPath, out.join('\n') + '\n')

console.log('[setup] .env 준비 완료.')
console.log('[setup] 로그인 아이디 = ' + (cur.QA_ADMIN_ID || 'admin'))
if (generatedAdmin) console.log('[setup] 관리자 비밀번호(자동생성) = ' + generatedAdmin + '   ← 로그인에 사용, 꼭 기록하세요!')
else console.log('[setup] 관리자 비밀번호 = (직접 정한 값)')
