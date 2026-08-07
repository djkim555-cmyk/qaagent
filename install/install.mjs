#!/usr/bin/env node
/**
 * QA 에이전트팀 — 다른 PC 포팅 인스톨러 (단일 진실 로직)
 * ---------------------------------------------------------------------------
 * 이 파일이 "설치/점검 로직의 유일한 원본"이다.
 *  - 루트 `설치.bat` / `install.sh` 는 이 파일을 부르는 15줄 얇은 래퍼다.
 *  - `webapp/QA서버-시작.bat` 은 자체 검사 대신 `install.mjs --quick` 을 부른다.
 *  - `install/doctor.mjs` 는 이 파일이 export 하는 check* 함수만 재사용한다(검사 중복 구현 금지).
 * 배치/문서에 같은 판정 로직을 두 번 쓰면 반드시 어긋난다(실제 사고: 런처는 Node>=22,
 * 문서는 24 → 22.x 통과 후 node:sqlite 부재로 런타임 즉사).
 *
 * 10단계: preflight → deps → browser → MCP → env → auth → fixtures → DB → port → verify
 * 각 단계는 detect → act → verify 이며 **모두 멱등**이다(이미 충족이면 no-op).
 *
 * 플래그
 *   --quick               부팅 최소 보정만(무거운 다운로드 스킵). 런처가 부른다.
 *                         ※ env/fixtures/DB 디렉터리는 "없으면 만든다"(멱등) — 이게 새 PC 부팅 실패 1순위 방어다.
 *                            순수 진단(아무것도 바꾸지 않음)이 필요하면 `doctor.mjs` 를 쓴다.
 *   --with-cloud          cloud/ 의존성도 설치
 *   --with-data=<dir>     기존 PC 의 webapp/data 에서 qa.db(+wal,shm) 를 비파괴 복사
 *   --port=<n>            서버 포트 지정(.env 의 PORT 갱신)
 *   --simulate-node=<n>   Node major 를 가정해 게이트만 시험(설치 행위 없음)
 *   --yes                 비대화형(관리자 비번·API 키 자동/생략)
 *   --no-browser          Chromium 설치 단계 스킵
 *   --with-claude-cli     Claude Code CLI 전역 설치까지 수행(기본은 안내만)
 *   --force-deps          node_modules 가 있어도 npm ci 재실행
 *   --force-browser       chromium 이 있어도 재설치
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, copyFileSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import net from 'node:net'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

/* ─────────────────────────── 공통 경로·상수 ─────────────────────────── */
const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(HERE, '..')
export const WEBAPP = path.join(ROOT, 'webapp')
export const CLOUD = path.join(ROOT, 'cloud')
const REPORT_PATH = path.join(HERE, 'last-install-report.txt')

/** qaAgentTeam 필드가 아직 없을 때의 폴백(오백개님 작업 전) */
const FALLBACK = {
  nodeMajorMin: 24,
  playwrightMcpSpec: '@playwright/mcp@latest',
  playwrightForBrowsers: '',
}

/* ─────────────────────────── 출력 헬퍼 ─────────────────────────── */
const lines = []
const say = (s = '') => { lines.push(s); console.log(s) }
const bar = () => say('-'.repeat(64))
const isWin = process.platform === 'win32'
const npmCmd = isWin ? 'npm.cmd' : 'npm'
const npxCmd = isWin ? 'npx.cmd' : 'npx'

/** 단계 결과 1건 */
const R = (id, title, status, detail, hint = '') => ({ id, title, status, detail, hint })

// node:sqlite 는 아직 experimental 이라 import 할 때마다 경고를 뿜는다.
// 비전문가가 보는 화면에 "경고"가 섞이면 실제 오류를 못 알아본다 → 이 한 건만 걸러내고 나머지는 그대로 보여준다.
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return
  if (w.name === 'DeprecationWarning' && /shell option/i.test(w.message)) return
  console.warn(`${w.name}: ${w.message}`)
})

function run(cmd, args, opts = {}) {
  // Windows 는 Node 20+ 부터 .cmd/.bat 을 shell 없이 spawn 하지 못한다(CVE-2024-27980 대응).
  // npm/npx 는 실체가 npm.cmd/npx.cmd 이므로 shell 을 켜야 한다.
  // shell 을 켤 때는 args 배열을 따로 넘기지 않고 한 문자열로 합친다(DEP0190 경고 회피).
  // 여기서 넘기는 인자는 전부 공백 없는 고정 토큰이라 안전하다.
  const useShell = opts.shell ?? false
  const r = spawnSync(useShell ? [cmd, ...args].join(' ') : cmd, useShell ? [] : args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    timeout: opts.timeout ?? 0,
    stdio: opts.inherit ? 'inherit' : 'pipe',
    shell: useShell,
    env: { ...process.env, ...(opts.env || {}) },
  })
  return {
    code: r.status,
    out: (r.stdout || '') + (r.stderr || ''),
    failed: r.status !== 0 || r.error != null,
    error: r.error,
  }
}

/* ─────────────────────────── 설정·env 파싱 ─────────────────────────── */
/** webapp/package.json 의 qaAgentTeam 필드 = 버전 핀의 유일한 출처(SoT) */
export function readQaConfig() {
  const pkgPath = path.join(WEBAPP, 'package.json')
  let raw = null
  try { raw = JSON.parse(readFileSync(pkgPath, 'utf8')) } catch { /* 없거나 깨짐 */ }
  const field = raw?.qaAgentTeam
  if (!field || typeof field !== 'object') {
    return { ...FALLBACK, source: 'fallback', warn: 'webapp/package.json 에 qaAgentTeam 필드가 없습니다 — 폴백값(@latest) 사용. 재현성을 위해 핀 고정이 필요합니다.' }
  }
  return {
    nodeMajorMin: Number(field.nodeMajorMin) || FALLBACK.nodeMajorMin,
    playwrightMcpSpec: String(field.playwrightMcpSpec || FALLBACK.playwrightMcpSpec),
    playwrightForBrowsers: String(field.playwrightForBrowsers || ''),
    source: 'package.json',
    warn: '',
  }
}

export function parseEnvFile(p) {
  const m = {}
  if (!existsSync(p)) return m
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    m[t.slice(0, i).trim()] = t.slice(i + 1)
  }
  return m
}

/** .env 의 한 키만 보존적으로 갱신(다른 값·주석 유지) */
function patchEnvKey(key, value) {
  const p = path.join(WEBAPP, '.env')
  if (!existsSync(p)) return false
  const src = readFileSync(p, 'utf8')
  const re = new RegExp(`^${key}=.*$`, 'm')
  const next = re.test(src) ? src.replace(re, `${key}=${value}`) : src.replace(/\n?$/, `\n${key}=${value}\n`)
  if (next !== src) writeFileSync(p, next)
  return true
}

/** auth.ts 가 거부하는 공개 기본값(= setup-env.mjs 의 BAD 와 동일 집합) */
const PUBLIC_DEFAULTS = new Set(['', 'change-me', 'qa-agent-team-internal-secret-v1', 'malgnqa'])
const REQUIRED_SECRETS = ['QA_PASSWORD', 'QA_SESSION_SECRET', 'QA_PW_PEPPER']

/* ═══════════════════════════ 검사 함수 (doctor.mjs 가 재사용) ═══════════════════════════ */

/** 1. Node/npm/권한/여유공간/경로 */
export function checkNode({ simulateMajor = null, cfg = readQaConfig() } = {}) {
  const real = process.versions.node
  const major = simulateMajor ?? Number(real.split('.')[0])
  const min = cfg.nodeMajorMin
  if (!Number.isFinite(major)) {
    return R('1a', 'Node 버전', 'FAIL', `버전 판별 실패(${real})`, 'https://nodejs.org 에서 LTS 를 다시 설치하세요.')
  }
  if (major < min) {
    return R('1a', 'Node 버전', 'FAIL',
      `v${simulateMajor ? major + '.x (가정)' : real} — 최소 요구 major ${min}`,
      `이 앱의 DB 는 Node 내장 모듈 node:sqlite 를 씁니다. major ${min} 미만(22·23 포함)에는 그 모듈이 없거나 플래그가 필요해 ` +
      `"게이트는 통과하고 서버는 즉시 죽는" 조용한 실패가 납니다. https://nodejs.org 에서 LTS ${min} 이상을 설치한 뒤 다시 실행하세요.`)
  }
  return R('1a', 'Node 버전', 'PASS', `v${real} (요구 major >= ${min})`)
}

export function checkNpm() {
  const r = run(npmCmd, ['-v'], { timeout: 120000, shell: isWin })
  if (r.failed) return R('1b', 'npm', 'FAIL', 'npm 실행 불가', 'Node.js 를 재설치하면 npm 이 함께 설치됩니다(https://nodejs.org).')
  return R('1b', 'npm', 'PASS', `v${r.out.trim().split(/\s+/)[0]}`)
}

export function checkWorkspace() {
  const notes = []
  // 쓰기 권한
  try {
    const probe = path.join(WEBAPP, `.write-probe-${process.pid}`)
    mkdirSync(WEBAPP, { recursive: true })
    writeFileSync(probe, 'ok')
    rmSync(probe)
  } catch (e) {
    return R('1c', '작업 폴더', 'FAIL', `webapp 쓰기 불가: ${e.code || e.message}`,
      '폴더를 사용자 문서 폴더 등 쓰기 가능한 위치로 옮기거나, Program Files·읽기전용 위치를 피하세요. 압축을 "관리자 전용" 경로에 풀지 마세요.')
  }
  // 여유 공간
  let free = null
  try { const s = fs.statfsSync(ROOT); free = s.bsize * s.bavail } catch { /* 미지원 */ }
  if (free != null) {
    const gb = free / 1024 ** 3
    notes.push(`여유공간 ${gb.toFixed(1)}GB`)
    if (gb < 2) {
      return R('1c', '작업 폴더', 'FAIL', `여유공간 부족(${gb.toFixed(1)}GB)`,
        'node_modules(약 300MB) + Chromium(약 500MB) + 리포트 누적을 위해 2GB 이상을 확보하세요.')
    }
  }
  // 경로 함정
  const warns = []
  if (/[^\x00-\x7F]/.test(ROOT)) warns.push('경로에 한글/비ASCII 포함 — 일부 셸·스케줄러(PowerShell 5.1 cp949)에서 깨질 수 있음')
  if (/\s/.test(ROOT)) warns.push('경로에 공백 포함 — 스크립트에서 반드시 따옴표로 감싸야 함')
  if (warns.length) return R('1c', '작업 폴더', 'WARN', [...notes, ...warns].join(' / '), '동작은 하지만, 문제가 생기면 공백·한글 없는 짧은 경로(예: C:\\qa-agent)로 옮기세요.')
  return R('1c', '작업 폴더', 'PASS', notes.join(' / ') || '쓰기 가능')
}

/** 2. 의존성 */
export function checkDeps() {
  const nm = path.join(WEBAPP, 'node_modules')
  const must = ['express', 'tsx', '@anthropic-ai/claude-agent-sdk']
  if (!existsSync(nm)) return R('2', '의존성(webapp)', 'FAIL', 'node_modules 없음', '`npm ci` 가 필요합니다(설치 프로그램이 자동 수행).')
  const miss = must.filter((m) => !existsSync(path.join(nm, ...m.split('/'))))
  if (miss.length) return R('2', '의존성(webapp)', 'FAIL', `누락: ${miss.join(', ')}`, 'node_modules 를 지우고 `npm ci` 를 다시 실행하세요(부분 설치 상태).')
  return R('2', '의존성(webapp)', 'PASS', 'node_modules + 핵심 패키지 확인')
}

/** 3. Chromium 브라우저 바이너리 */
export function playwrightBrowsersDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH
  if (isWin) return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright')
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
  return path.join(os.homedir(), '.cache', 'ms-playwright')
}

export function checkBrowsers() {
  const dir = playwrightBrowsersDir()
  if (!existsSync(dir)) return R('3', 'Chromium', 'FAIL', `브라우저 캐시 없음 (${dir})`, '`npx -y playwright install chromium` 이 필요합니다(설치 프로그램이 자동 수행). 없으면 시뮬레이션 모드로만 동작하고 기능 판단은 전부 [추정] 입니다.')
  let builds = []
  try { builds = readdirSync(dir).filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d)) } catch { /* noop */ }
  if (!builds.length) return R('3', 'Chromium', 'FAIL', `chromium 빌드 없음 (${dir})`, '`npx -y playwright install chromium` 을 실행하세요.')
  return R('3', 'Chromium', 'PASS', `${builds.length}개 빌드 (${builds.slice(0, 3).join(', ')}${builds.length > 3 ? ' …' : ''})`)
}

/** 4. MCP 설정 — .mcp.json 이 SoT(package.json) 와 일치하는가 */
export function mcpDesired(cfg = readQaConfig()) {
  return { mcpServers: { playwright: { command: 'npx', args: ['-y', cfg.playwrightMcpSpec] } } }
}

export function checkMcp(cfg = readQaConfig()) {
  const p = path.join(ROOT, '.mcp.json')
  if (!existsSync(p)) return R('4', 'MCP 설정', 'FAIL', '.mcp.json 없음', '설치 프로그램이 webapp/package.json 의 playwrightMcpSpec 기준으로 생성합니다.')
  let cur = null
  try { cur = JSON.parse(readFileSync(p, 'utf8')) } catch {
    return R('4', 'MCP 설정', 'FAIL', '.mcp.json JSON 파싱 실패', '파일을 지우고 설치 프로그램을 다시 실행하면 재생성됩니다.')
  }
  const got = cur?.mcpServers?.playwright?.args?.join(' ') || ''
  const want = mcpDesired(cfg).mcpServers.playwright.args.join(' ')
  if (got !== want) return R('4', 'MCP 설정', 'WARN', `spec 불일치 (.mcp.json="${got}" / SoT="${want}")`, '설치 프로그램을 다시 실행하면 SoT 기준으로 갱신됩니다.')
  const extra = cfg.source === 'fallback' ? ' [폴백: @latest]' : ''
  return R('4', 'MCP 설정', 'PASS', `${cfg.playwrightMcpSpec}${extra}`)
}

/** 5. env — 부팅 필수 3종 */
export function checkEnv() {
  const p = path.join(WEBAPP, '.env')
  if (!existsSync(p)) return R('5', '.env 설정', 'FAIL', 'webapp/.env 없음', '`node install/install.mjs` 를 실행하면 setup-env.mjs 로 자동 생성됩니다.')
  const env = parseEnvFile(p)
  const bad = REQUIRED_SECRETS.filter((k) => !env[k] || PUBLIC_DEFAULTS.has(String(env[k]).trim()))
  if (bad.length) {
    return R('5', '.env 설정', 'FAIL', `필수 시크릿 비었거나 공개기본값: ${bad.join(', ')}`,
      '이 상태면 서버가 import 시점에 throw 하며 창이 즉시 닫힙니다(fail-closed). 설치 프로그램을 다시 실행하면 setup-env.mjs 가 값을 복구합니다.')
  }
  return R('5', '.env 설정', 'PASS', `필수 3종 설정됨 (PORT=${env.PORT || 5510}, 아이디=${env.QA_ADMIN_ID || 'admin'})`)
}

/** 6. Claude 인증 — apikey / session / none 3상태 */
export function checkAuth() {
  const env = parseEnvFile(path.join(WEBAPP, '.env'))
  const key = (process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || '').trim()
  if (key.startsWith('sk-')) return R('6', 'Claude 인증', 'PASS', 'API 키 방식 — 새 QA 실행 가능')
  const cred = path.join(os.homedir(), '.claude', '.credentials.json')
  if (existsSync(cred)) return R('6', 'Claude 인증', 'PASS', '로그인 세션(~/.claude/.credentials.json) — 새 QA 실행 가능')
  const cliFound = run(isWin ? 'where' : 'which', ['claude'], { timeout: 20000 }).code === 0
  const macNote = process.platform === 'darwin'
    ? ' (macOS 는 자격증명이 Keychain 에 저장될 수 있어 파일이 없어도 로그인돼 있을 수 있습니다 — `claude` 실행으로 직접 확인하세요)'
    : ''
  return R('6', 'Claude 인증', 'WARN',
    `없음 — 로그인·결과조회·트리아지는 되지만 '새 QA 실행'은 실패합니다${macNote}`,
    cliFound
      ? '이 PC 에서 `claude login` 을 한 번 실행하거나, webapp/.env 의 ANTHROPIC_API_KEY 에 키를 넣으세요.'
      : 'Claude Code CLI 가 없습니다. `npm i -g @anthropic-ai/claude-code` 로 설치한 뒤 `claude login` 하거나(--with-claude-cli 로 자동설치), webapp/.env 의 ANTHROPIC_API_KEY 에 키를 넣으세요. ※설치 성공 ≠ QA 실행 가능.')
}

/** 7. fixtures(업로드 테스트용 더미) */
export const FIXTURES = [
  ['dummy-11mb.bin', 11534336],
  ['dummy-1mb-01.bin', 1048576],
  ['dummy-1mb-02.bin', 1048576],
  ['dummy-1mb-03.bin', 1048576],
  ['dummy-1mb-04.bin', 1048576],
  ['dummy-1mb-05.bin', 1048576],
  ['dummy-1mb-06.bin', 1048576],
]

export function checkFixtures() {
  const dir = path.join(ROOT, 'fixtures')
  const missing = []
  const wrong = []
  for (const [name, size] of FIXTURES) {
    const f = path.join(dir, name)
    if (!existsSync(f)) { missing.push(name); continue }
    const got = statSync(f).size
    if (got !== size) wrong.push(`${name}(${got}B≠${size}B)`)
  }
  if (missing.length || wrong.length) {
    return R('7', 'fixtures', 'FAIL', [missing.length ? `누락 ${missing.length}건` : '', wrong.length ? `크기불일치 ${wrong.join(',')}` : ''].filter(Boolean).join(' / '),
      '`node install/make-fixtures.mjs` 로 생성합니다(zip 용량 때문에 전달물에서 제외되고 설치 시 만듭니다).')
  }
  return R('7', 'fixtures', 'PASS', `${FIXTURES.length}개 파일 크기 일치`)
}

/** 8. DB 전제 — node:sqlite + data 쓰기권한 */
export async function checkDb() {
  try {
    await import('node:sqlite')
  } catch (e) {
    return R('8', 'DB(node:sqlite)', 'FAIL', `node:sqlite 사용 불가 (${e.code || e.message})`,
      `이 Node 에는 내장 SQLite 가 없습니다. Node ${readQaConfig().nodeMajorMin} 이상으로 올리세요(22.x 는 --experimental-sqlite 플래그가 필요하며 22.0~22.4 는 모듈 자체가 없습니다).`)
  }
  const dir = path.join(WEBAPP, 'data')
  try {
    mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.write-probe-${process.pid}`)
    writeFileSync(probe, 'ok'); rmSync(probe)
  } catch (e) {
    return R('8', 'DB(node:sqlite)', 'FAIL', `webapp/data 쓰기 불가 (${e.code || e.message})`, '폴더 권한을 확인하거나 쓰기 가능한 위치로 프로젝트를 옮기세요.')
  }
  const db = path.join(dir, 'qa.db')
  return R('8', 'DB(node:sqlite)', 'PASS', existsSync(db) ? '기존 qa.db 사용' : 'qa.db 는 첫 기동 시 스키마와 함께 자동 생성')
}

/** 9. 포트 */
export function envPort() {
  const env = parseEnvFile(path.join(WEBAPP, '.env'))
  return Number(env.PORT) || 5510
}

function tcpProbe(host, port, timeout = 900) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port })
    const done = (v) => { try { s.destroy() } catch { /* noop */ } resolve(v) }
    s.setTimeout(timeout)
    s.on('connect', () => done(true))
    s.on('timeout', () => done(false))
    s.on('error', () => done(false))
  })
}

function httpTitle(port, timeout = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { body += c; if (body.length > 4096) { req.destroy(); resolve(body) } })
      res.on('end', () => resolve(body))
    })
    req.on('timeout', () => { req.destroy(); resolve('') })
    req.on('error', () => resolve(''))
  })
}

export async function checkPort(port = envPort()) {
  // IPv4/IPv6 둘 다 본다(한쪽만 바인딩된 "반쪽 기동" 함정 회피)
  const busy = (await tcpProbe('127.0.0.1', port)) || (await tcpProbe('::1', port))
  if (!busy) return R('9', `포트 ${port}`, 'PASS', '비어 있음 — 서버 기동 가능')
  const body = await httpTitle(port)
  if (/QA\s*에이전트팀|qa_session|authed/i.test(body)) {
    return R('9', `포트 ${port}`, 'SKIP', '우리 QA 서버가 이미 실행 중', `브라우저에서 http://localhost:${port} 을 열면 됩니다(중복 기동 불필요).`)
  }
  return R('9', `포트 ${port}`, 'FAIL', '다른 프로그램이 점유 중',
    `--port=<다른번호> 로 다시 실행하면 .env 의 PORT 를 갱신하고 런처도 그 값을 씁니다(예: --port=${port + 1}).`)
}

/** 10 보조. 외부 CDN 의존 경고 (오프라인·사내차단 PC) */
export function checkCdn() {
  const p = path.join(WEBAPP, 'public', 'index.html')
  if (!existsSync(p)) return R('10b', '외부 CDN 의존', 'SKIP', 'public/index.html 없음')
  const html = readFileSync(p, 'utf8')
  const hosts = [...new Set((html.match(/https:\/\/[a-z0-9.-]+/gi) || []).map((u) => u.replace('https://', '')))]
  if (!hosts.length) return R('10b', '외부 CDN 의존', 'PASS', '외부 호스트 참조 없음')
  return R('10b', '외부 CDN 의존', 'WARN', `${hosts.length}개 호스트 (${hosts.join(', ')})`,
    '인터넷이 없거나 사내 방화벽이 이 호스트를 막으면 화면 스타일·폰트가 깨집니다(기능은 로컬). 오프라인 PC 라면 자가호스팅이 필요합니다 — 이번 설치 범위 밖.')
}

/* ═══════════════════════════ 설치(act) 단계 ═══════════════════════════ */

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (a) => { rl.close(); resolve(String(a || '').trim()) })
  })
}

async function actDeps(args, results) {
  const need = !existsSync(path.join(WEBAPP, 'node_modules')) || args['force-deps']
  if (!need) {
    const c = checkDeps()
    if (c.status === 'PASS') { results.push(R('2', '의존성(webapp)', 'SKIP', '이미 설치됨 (멱등 no-op)')); return true }
  }
  if (args.quick && !need) { results.push(checkDeps()); return true }
  say('[2/10] webapp 의존성 설치 (npm ci) — 처음 한 번은 몇 분 걸립니다…')
  const r = run(npmCmd, ['ci'], { cwd: WEBAPP, inherit: true, timeout: 20 * 60 * 1000, shell: isWin })
  if (r.failed) {
    const lockIssue = /EUSAGE|can only install packages when your package\.json and package-lock\.json|lock file/i.test(r.out || '')
    results.push(R('2', '의존성(webapp)', 'FAIL',
      lockIssue ? 'package.json ↔ package-lock.json 불일치' : `npm ci 실패(exit ${r.code})`,
      lockIssue
        ? 'npm install 로 자동 우회하지 않습니다(재현성 우선). 저장소 관리자에게 lock 갱신을 요청하거나, 원본 PC 에서 `npm install` 후 갱신된 package-lock.json 을 함께 받으세요.'
        : '인터넷 연결·프록시(사내망 npm registry 차단)를 확인한 뒤 다시 실행하세요. `--omit=optional` 은 쓰지 마세요(Agent SDK 실행파일이 빠져 실패합니다).'))
    return false
  }
  results.push(R('2', '의존성(webapp)', 'PASS', 'npm ci 완료'))
  if (args['with-cloud']) {
    if (!existsSync(path.join(CLOUD, 'package.json'))) {
      results.push(R('2b', '의존성(cloud)', 'SKIP', 'cloud/package.json 없음'))
    } else {
      const c = run(npmCmd, ['ci'], { cwd: CLOUD, inherit: true, timeout: 20 * 60 * 1000, shell: isWin })
      results.push(c.failed
        ? R('2b', '의존성(cloud)', 'FAIL', `npm ci 실패(exit ${c.code})`, 'cloud/ 는 선택 구성입니다. 로컬 QA 만 쓸 거면 --with-cloud 없이 다시 실행하세요.')
        : R('2b', '의존성(cloud)', 'PASS', 'npm ci 완료'))
    }
  }
  return true
}

function actBrowser(args, results, cfg) {
  if (args['no-browser']) { results.push(R('3', 'Chromium', 'SKIP', '--no-browser')); return }
  const have = checkBrowsers()
  if (have.status === 'PASS' && !args['force-browser']) {
    results.push(R('3', 'Chromium', 'SKIP', `${have.detail} — 재설치 안 함 (멱등 no-op)`))
    return
  }
  if (args.quick) { results.push(have); return }
  const spec = cfg.playwrightForBrowsers ? `playwright@${cfg.playwrightForBrowsers}` : 'playwright'
  if (!cfg.playwrightForBrowsers) {
    say('[3/10] (주의) webapp/package.json 에 playwrightForBrowsers 핀이 없어 최신 playwright 로 브라우저를 받습니다 — MCP 핀과 브라우저 빌드가 어긋날 수 있습니다.')
  }
  say(`[3/10] Chromium 설치 (npx -y ${spec} install chromium) — 수백 MB 다운로드…`)
  const r = run(npxCmd, ['-y', spec, 'install', 'chromium'], { inherit: true, timeout: 30 * 60 * 1000, shell: isWin })
  results.push(r.failed
    ? R('3', 'Chromium', 'WARN', `설치 실패(exit ${r.code})`,
      '브라우저 없이도 서버는 뜨지만 실제 구동이 아니라 시뮬레이션 모드가 되고 기능 판단은 전부 [추정] 입니다. 인터넷/프록시 확인 후 `npx -y playwright install chromium` 을 직접 실행하세요.')
    : R('3', 'Chromium', 'PASS', `${spec} install chromium 완료`))
}

function actMcp(args, results, cfg) {
  const desired = mcpDesired(cfg)
  const text = JSON.stringify(desired, null, 2) + '\n'
  const p = path.join(ROOT, '.mcp.json')
  let wrote = false
  const same = existsSync(p) && (() => {
    try { return JSON.stringify(JSON.parse(readFileSync(p, 'utf8'))) === JSON.stringify(desired) } catch { return false }
  })()
  if (!same) { writeFileSync(p, text); wrote = true }

  // 예시 파일도 같은 spec 으로 유지(사람이 두 곳을 손으로 맞추지 않게)
  const ex = path.join(ROOT, '.mcp.example.json')
  if (existsSync(ex)) {
    try {
      const cur = JSON.parse(readFileSync(ex, 'utf8'))
      const next = { ...cur, mcpServers: desired.mcpServers }
      if (JSON.stringify(cur) !== JSON.stringify(next)) writeFileSync(ex, JSON.stringify(next, null, 2) + '\n')
    } catch { /* 예시 파일 파싱 실패는 무시 */ }
  }

  let warm = ''
  if (!args.quick) {
    say(`[4/10] Playwright MCP 캐시 워밍 (npx -y ${cfg.playwrightMcpSpec} --version)…`)
    const r = run(npxCmd, ['-y', cfg.playwrightMcpSpec, '--version'], { timeout: 10 * 60 * 1000, shell: isWin })
    warm = r.failed ? ' / 캐시 워밍 실패(첫 실행이 느려질 수 있음)' : ' / 캐시 워밍 완료'
  }
  results.push(R('4', 'MCP 설정', 'PASS',
    `${wrote ? '.mcp.json 생성/갱신' : '.mcp.json 이미 최신 (멱등 no-op)'} — spec=${cfg.playwrightMcpSpec}${cfg.source === 'fallback' ? ' [폴백]' : ''}${warm}`,
    'Claude Code 에서 이 폴더를 열면 MCP 서버 사용 승인 창이 뜹니다 — 승인해야 실제 브라우저 구동 모드가 됩니다(미승인 시 시뮬레이션 모드).'))
}

async function actEnv(args, results) {
  const envPath = path.join(WEBAPP, '.env')
  const before = parseEnvFile(envPath)
  const healthy = REQUIRED_SECRETS.every((k) => before[k] && !PUBLIC_DEFAULTS.has(String(before[k]).trim()))

  let admin = ''
  let apikey = ''
  // quick 모드에서도 .env 가 불건강하면 묻는다(런처 첫 실행 UX = 기존 .bat 과 동일).
  const interactive = !args.yes && !!process.stdin.isTTY
  if (!healthy && interactive) {
    say('')
    say('처음 설정입니다. 아래 두 가지만 정하면 됩니다(엔터로 건너뛰면 자동 처리).')
    admin = await ask('  (1) 관리자 로그인 비밀번호 (엔터=자동 생성): ')
    say('  (2) QA를 직접 실행하려면 Anthropic API 키가 필요합니다. 없으면 그냥 엔터')
    say('      (이 PC 에서 `claude login` 을 쓰면 키 없이도 실행됩니다. 결과 조회만 할 거면 상관없습니다)')
    apikey = await ask('      API 키(sk-ant-...): ')
    say('')
  }
  // ★ 조건부 스킵 금지: .env 가 "있어도" 항상 실행한다.
  //   setup-env.mjs 는 멱등이며 빈 값·공개기본값만 복구한다 → 두 번 돌려도 기존 값이 바뀌지 않는다.
  //   (건강한 .env 에는 --admin= 을 빈 값으로 넘겨 비번 덮어쓰기를 막는다)
  const argv = ['scripts/setup-env.mjs', `--admin=${healthy ? '' : admin}`, `--apikey=${apikey}`]
  const r = run(process.execPath, argv, { cwd: WEBAPP, inherit: true, timeout: 120000 })
  if (r.failed) {
    results.push(R('5', '.env 설정', 'FAIL', `setup-env.mjs 실패(exit ${r.code})`, 'webapp/.env 파일 권한을 확인하세요. 손상됐다면 파일을 지우고 다시 실행하면 새로 만들어집니다.'))
    return false
  }
  if (args.port) {
    patchEnvKey('PORT', String(args.port))
    say(`[5/10] .env PORT=${args.port} 로 갱신 — 런처(설치.bat / QA서버-시작.bat)도 .env 의 PORT 를 읽습니다.`)
  }
  const after = checkEnv()
  results.push(after.status === 'PASS'
    ? R('5', '.env 설정', 'PASS', `${healthy ? '기존 값 보존(멱등 no-op)' : '생성/보정 완료'} — ${after.detail}`)
    : after)
  return after.status === 'PASS'
}

function actAuth(args, results) {
  const c = checkAuth()
  if (c.status === 'PASS') { results.push(c); return }
  if (args['with-claude-cli']) {
    say('[6/10] Claude Code CLI 전역 설치 (npm i -g @anthropic-ai/claude-code)…')
    const r = run(npmCmd, ['i', '-g', '@anthropic-ai/claude-code'], { inherit: true, timeout: 15 * 60 * 1000, shell: isWin })
    results.push(R('6', 'Claude 인증', 'WARN',
      r.failed ? `CLI 전역 설치 실패(exit ${r.code}) — 인증 없음` : 'CLI 설치 완료 — 아직 로그인 안 됨',
      r.failed ? '권한(관리자 셸)·프록시를 확인하세요. 또는 webapp/.env 의 ANTHROPIC_API_KEY 를 쓰세요.'
        : '이어서 `claude login` 을 한 번 실행하세요. ※설치 성공 ≠ QA 실행 가능 — 인증이 없으면 조회만 됩니다.'))
    return
  }
  results.push(c)
}

function actFixtures(args, results) {
  const before = checkFixtures()
  if (before.status === 'PASS') { results.push(R('7', 'fixtures', 'SKIP', `${before.detail} (멱등 no-op)`)); return }
  const r = run(process.execPath, [path.join(HERE, 'make-fixtures.mjs')], { inherit: true, timeout: 5 * 60 * 1000 })
  const after = checkFixtures()
  results.push(r.failed && after.status !== 'PASS' ? after : R('7', 'fixtures', after.status, after.detail, after.hint))
}

async function actDb(args, results) {
  const base = await checkDb()
  results.push(base)
  if (base.status !== 'PASS' || !args['with-data']) return
  const src = path.resolve(String(args['with-data']))
  const dstDir = path.join(WEBAPP, 'data')
  const port = envPort()
  const busy = (await tcpProbe('127.0.0.1', port)) || (await tcpProbe('::1', port))
  if (busy) {
    results.push(R('8b', '데이터 이관', 'FAIL', `포트 ${port} 에 서버가 떠 있습니다`, 'WAL 모드 DB 를 안전하게 복사하려면 서버를 먼저 종료하세요(창에서 Ctrl+C).'))
    return
  }
  const names = ['qa.db', 'qa.db-wal', 'qa.db-shm']
  const found = names.filter((n) => existsSync(path.join(src, n)))
  if (!found.includes('qa.db')) {
    results.push(R('8b', '데이터 이관', 'FAIL', `${src} 에 qa.db 가 없습니다`, '--with-data 에는 원본 PC 의 webapp/data 폴더 경로를 주세요.'))
    return
  }
  mkdirSync(dstDir, { recursive: true })
  const sizes = []
  for (const n of found) {
    copyFileSync(path.join(src, n), path.join(dstDir, n))
    sizes.push(`${n}=${statSync(path.join(dstDir, n)).size}B`)
  }
  const cmp = await countRows(path.join(src, 'qa.db'), path.join(dstDir, 'qa.db'))
  results.push(R('8b', '데이터 이관', cmp.equal ? 'PASS' : 'WARN',
    `${found.length}/3 파일 복사 (${sizes.join(', ')}) / 건수대조 ${cmp.text}`,
    cmp.equal ? '' : '원본을 지우지 않았습니다(비파괴). 서버 기동 후 화면에서 건수를 다시 확인하세요.'))
}

async function countRows(a, b) {
  try {
    const { DatabaseSync } = await import('node:sqlite')
    const tables = ['projects', 'runs', 'persona_runs', 'issues']
    const read = (p) => {
      const db = new DatabaseSync(p, { readOnly: true })
      const o = {}
      for (const t of tables) {
        try { o[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c } catch { o[t] = null }
      }
      db.close()
      return o
    }
    const x = read(a); const y = read(b)
    const parts = tables.map((t) => `${t} ${x[t]}→${y[t]}`)
    return { equal: tables.every((t) => x[t] === y[t]), text: parts.join(', ') }
  } catch (e) {
    return { equal: false, text: `대조 실패(${e.code || e.message})` }
  }
}

/* ═══════════════════════════ 리포트 ═══════════════════════════ */
const ICON = { PASS: 'PASS', FAIL: 'FAIL', WARN: 'WARN', SKIP: 'SKIP' }

export function renderTable(results) {
  const out = []
  const w = Math.max(...results.map((r) => r.title.length), 8)
  for (const r of results) {
    out.push(`  [${ICON[r.status] || r.status}] ${r.title.padEnd(w)}  ${r.detail}`)
    if (r.hint && r.status !== 'PASS' && r.status !== 'SKIP') out.push(`         → ${r.hint}`)
  }
  return out
}

function writeReport(results, args) {
  // ★ 시크릿·비밀번호는 절대 기록하지 않는다(값이 아니라 "설정됨/미설정"만).
  const body = [
    'QA 에이전트팀 설치 리포트 (시크릿 미포함)',
    `생성: ${new Date().toISOString()}`,
    `플랫폼: ${process.platform} ${process.arch} / Node ${process.versions.node}`,
    `루트: ${ROOT}`,
    `플래그: ${Object.entries(args).filter(([k]) => k !== '_').map(([k, v]) => (v === true ? `--${k}` : `--${k}=${v}`)).join(' ') || '(없음)'}`,
    '',
    ...results.map((r) => `[${r.status}] ${r.id} ${r.title} — ${r.detail}${r.hint && r.status !== 'PASS' ? `\n      → ${r.hint}` : ''}`),
  ].join('\n') + '\n'
  try { writeFileSync(REPORT_PATH, body) } catch { /* 권한 없으면 조용히 생략 */ }
}

/* ═══════════════════════════ main ═══════════════════════════ */
function parseArgs(argv) {
  const a = { _: [] }
  for (const t of argv) {
    const m = t.match(/^--([^=]+)(?:=(.*))?$/)
    if (m) a[m[1]] = m[2] === undefined ? true : m[2]
    else a._.push(t)
  }
  return a
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const cfg = readQaConfig()
  const results = []

  say('='.repeat(64))
  say('  QA 에이전트팀 — 설치/점검 프로그램' + (args.quick ? ' (빠른 점검)' : ''))
  say('='.repeat(64))
  if (cfg.warn) say(`[주의] ${cfg.warn}`)

  /* 1. preflight */
  const simulate = args['simulate-node'] ? Number(args['simulate-node']) : null
  const nodeRes = checkNode({ simulateMajor: simulate, cfg })
  results.push(nodeRes)
  results.push(checkNpm())
  results.push(checkWorkspace())
  if (results.some((r) => r.status === 'FAIL')) {
    say('')
    say('[1/10] 사전 점검 실패 — 아래를 해결한 뒤 다시 실행하세요.')
    for (const l of renderTable(results)) say(l)
    writeReport(results, args)
    return 2
  }
  if (simulate) {
    say(`[게이트 시험] --simulate-node=${simulate} → ${nodeRes.status}. 설치 행위는 수행하지 않습니다.`)
    for (const l of renderTable(results)) say(l)
    writeReport(results, args)
    return 0
  }
  say(`[1/10] 사전 점검 OK — Node v${process.versions.node}`)

  /* 2~9 */
  const depsOk = await actDeps(args, results)
  actBrowser(args, results, cfg)
  actMcp(args, results, cfg)
  const envOk = await actEnv(args, results)
  actAuth(args, results)
  actFixtures(args, results)
  await actDb(args, results)
  results.push(await checkPort(args.port ? Number(args.port) : envPort()))
  results.push(checkCdn())

  /* 10. verify */
  say('')
  bar()
  say('  점검 결과')
  bar()
  for (const l of renderTable(results)) say(l)
  bar()
  const fails = results.filter((r) => r.status === 'FAIL')
  const warns = results.filter((r) => r.status === 'WARN')
  say(`  PASS ${results.filter((r) => r.status === 'PASS').length} · WARN ${warns.length} · FAIL ${fails.length} · SKIP ${results.filter((r) => r.status === 'SKIP').length}`)
  writeReport(results, args)
  say(`  상세 리포트: ${REPORT_PATH}  (시크릿 미포함)`)
  bar()

  if (fails.length) {
    say('')
    say('[결과] 아직 실행할 수 없습니다. 위 FAIL 항목의 "→" 안내를 따라 해결한 뒤 다시 실행하세요.')
    return 1
  }
  say('')
  say(`[결과] 준비 완료. 서버 시작: webapp\\QA서버-시작.bat  (또는 cd webapp && npm start) → http://localhost:${envPort()}`)
  if (warns.some((r) => r.id === '6')) say('[안내] Claude 인증이 없어 "새 QA 실행"은 실패합니다 — 설치 성공 ≠ QA 실행 가능. 로그인·조회·트리아지는 됩니다.')
  return 0
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  main().then((code) => process.exit(code)).catch((e) => {
    console.error('[install] 예상치 못한 오류:', e?.stack || e)
    console.error('[install] 이 메시지 전체를 담당자에게 전달하면 원인을 찾을 수 있습니다.')
    process.exit(3)
  })
}
