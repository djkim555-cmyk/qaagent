#!/usr/bin/env node
/**
 * QA 에이전트팀 — 전달 zip 생성기 (3중 게이트)
 * ---------------------------------------------------------------------------
 * ① allowlist  : `git ls-files`(추적물) = 포함 후보. 디스크에 없는 항목은 조용히 skip(로그).
 *                + 반드시 넣어야 하는 untracked 명시 추가목록(_r06 증거·install/** 등).
 * ② denylist   : allowlist 통과분에 **한 번 더** 제외 규칙을 적용(미래에 시크릿이 실수로
 *                커밋되어도 전달물에는 나가지 않게 하는 2차 방어).
 * ③ 내용 스캔  : 스테이징된 텍스트 파일 전문을 훑어 시크릿 패턴이 1건이라도 걸리면
 *                **zip 을 만들지 않고 중단**한다(만들었으면 즉시 삭제).
 *
 * 압축은 **bsdtar**(C:\Windows\System32\tar.exe)만 쓴다.
 *   PowerShell Compress-Archive / .NET ZipFile 은 엔트리 경로에 백슬래시를 넣어
 *   mac·Linux 에서 해제하면 경로가 붕괴한다(사내 LEARNED 등재 함정).
 *   생성 후 엔트리 목록을 뽑아 백슬래시 0건을 수치로 검증한다.
 *
 * 실행:
 *   node install/pack.mjs                # 기본(작업자산 포함 — 본인 PC 포팅용)
 *   node install/pack.mjs --slim         # 사외 전달용: cloud/ · data/solsol_brand/ 제외
 *   node install/pack.mjs --dry-run      # 게이트만 돌리고 zip 을 만들지 않음
 *   node install/pack.mjs --keep-old     # 구 zip 을 삭제하지 않음
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, statSync, rmSync, readdirSync, openSync, readSync, closeSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const TAR = 'C:\\Windows\\System32\\tar.exe'

const args = Object.fromEntries(process.argv.slice(2).map((t) => {
  const m = t.match(/^--([^=]+)(?:=(.*))?$/)
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [t, true]
}))
const SLIM = !!args.slim
const DRY = !!args['dry-run']

const log = (s = '') => console.log(s)
const die = (msg, hint) => { console.error(`\n[pack] 중단: ${msg}`); if (hint) console.error(`[pack] → ${hint}`); process.exit(1) }

/* ───────────────────────── ② denylist ───────────────────────── */
/** 경로는 항상 슬래시 정규화된 저장소 상대경로로 판정한다. */
const DENY = [
  // 시크릿·자격증명
  { re: /(^|\/)\.env$/, why: '실제 .env' },
  { re: /(^|\/)\.env\.[^/]+$/, why: '.env 파생', allowIf: (p) => /(^|\/)\.env\.example$/.test(p) },
  { re: /(^|\/)\.dev\.vars/, why: 'wrangler 로컬 시크릿' },
  { re: /secret.*\.json$/i, why: 'secret json' },
  { re: /credential/i, why: 'credential' },
  { re: /\.(pem|key|p12|pfx)$/i, why: '키/인증서' },
  { re: /(^|\/)id_rsa/, why: 'SSH 키' },
  { re: /(^|\/)target\.json$/, why: '대상 서비스 설정(자격증명 포함 가능)' },
  { re: /(^|\/)config-target[^/]*\.json$/, why: '대상 서비스 설정 사본' },
  { re: /(^|\/)\.auth\//, why: '브라우저 저장 세션' },
  { re: /(^|\/)storageState[^/]*\.json$/, why: '브라우저 저장 세션' },
  // 로컬 상태·DB
  { re: /\.(db|sqlite|sqlite3)$/i, why: '로컬 DB' },
  { re: /\.db-(wal|shm)$/i, why: '로컬 DB(WAL)' },
  { re: /^webapp\/data\//, why: '로컬 DB 폴더' },
  { re: /^cloud\/\.wrangler\//, why: 'wrangler 로컬 상태' },
  { re: /^reports\/runs\//, why: '실행 결과(비번·캡처 포함 가능)' },
  { re: /(^|\/)\.playwright-mcp\//, why: 'MCP 임시 산출물' },
  { re: /^output\//, why: '전달 산출물(zip 등)' },
  { re: /^scenarios\/_trash\//, why: '소프트 삭제 보관함' },
  { re: /(^|\/)_r06-evidence\//, why: '검증 증거(기본 제외)', soft: true },
  // 로그·임시 (soft = 명시 추가목록에 든 경로는 예외 허용)
  { re: /\.(log|err)$/i, why: '로그', soft: true },
  { re: /\.log\.err$/i, why: '로그', soft: true },
  { re: /^qa[-_]p[^/]*\.(cjs|js|mjs)$/, why: '루트 일회성 QA 스크립트(평문 비번 포함 사례)' },
  { re: /(^|\/)node_modules\//, why: '플랫폼 종속 의존성(npm ci 로 복원)' },
  { re: /^fixtures\//, why: '더미 대용량(설치 시 재생성)', soft: false },
  { re: /(^|\/)\.git\//, why: 'git 내부' },
  { re: /(^|\/)(dist|\.turbo|\.cache)\//, why: '빌드 산출물' },
  { re: /(^|\/)\.claude\/settings\.local\.json$/, why: '개인 로컬 설정' },
  { re: /(^|\/)(\.DS_Store|Thumbs\.db)$/, why: 'OS 부산물' },
  { re: /^install\/last-install-report\.txt$/, why: '설치 리포트(설치 시 생성)' },
]
const SLIM_DENY = [
  { re: /^cloud\//, why: '--slim: 클라우드 뷰어 제외' },
  { re: /^data\/solsol_brand\//, why: '--slim: 고객 작업자산 제외' },
]

/** untracked 지만 반드시 포함해야 하는 것 (_ledger.md 가 명시 참조 / 이번에 새로 만든 설치기) */
const EXPLICIT_ADD_PREFIX = [
  'data/solsol_brand/dev-validation/spike/_r06-evidence/',
  'install/',
]
const EXPLICIT_ADD_FILES = [
  'data/solsol_brand/dev-validation/spike/br01-r06.md',
  '설치.bat',
  'install.sh',
]

/** 명시 추가목록에 든 경로인가 (soft 규칙을 면제받는다 — 시크릿 계열 규칙은 면제 없음) */
function isExplicit(rel) {
  return EXPLICIT_ADD_FILES.includes(rel) || EXPLICIT_ADD_PREFIX.some((x) => rel.startsWith(x))
}

function denyReason(rel) {
  // --slim 제외는 면제 없음(사외 전달에서 작업자산이 새어나가면 안 된다)
  const rules = SLIM ? [...SLIM_DENY, ...DENY] : DENY
  const explicit = isExplicit(rel)
  for (const r of rules) {
    if (!r.re.test(rel)) continue
    if (r.allowIf && r.allowIf(rel)) continue
    if (r.soft && explicit && !SLIM_DENY.includes(r)) continue
    return r.why
  }
  return null
}

/* ───────────────────────── ③ 내용 스캔 규칙 ───────────────────────── */
const PLACEHOLDER = /\.\.\.|…|\$\{|<[^>]*>|TODO|change-me|dev-token|여기에|발급받은|x{6,}|X{6,}/
const FAIL_RULES = [
  { id: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{16,}/g, skip: (m) => PLACEHOLDER.test(m) },
  { id: 'aws-akia', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./g },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { id: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  {
    id: 'key-with-value',
    re: /(QA_PASSWORD|QA_SESSION_SECRET|QA_PW_PEPPER|SYNC_TOKEN|PW_HASH_SECRET|MCP_TOKEN_SECRET|ANTHROPIC_API_KEY)\s*[:=]\s*["']?[^\s"',;}]{8,}/g,
    skip: (m) => PLACEHOLDER.test(m) || /[가-힣]/.test(m.split(/[:=]/).slice(1).join('=')),
  },
  {
    id: 'hex64',
    re: /\b[0-9a-f]{64}\b/g,
    skipFile: (rel) => /(^|\/)package-lock\.json$/.test(rel) || /\.map$/.test(rel) || /(^|\/)node_modules\//.test(rel),
    skipLine: (line) => /Checksum|Version|integrity|sha512-|sha256:/i.test(line),
  },
  { id: 'bcrypt', re: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g },
  { id: 'trycloudflare', re: /[A-Za-z0-9-]+\.trycloudflare\.com/g },
]
const WARN_RULES = [
  { id: 'cf-host', re: /[A-Za-z0-9-]+\.(workers|pages)\.dev/g },
  { id: 'cf-uuid', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g },
  { id: 'public-default-pw', re: /\bmalgnqa\b/g },
  { id: 'real-email-domain', re: /@(malgnsoft\.com|solsol\.so|gmail\.com|chunhyang\.co\.kr)/g },
]

const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bin', '.zip', '.gz', '.pdf', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.db', '.xlsx', '.pptx', '.docx'])
const SCAN_CAP = 2 * 1024 * 1024

function looksBinary(abs) {
  try {
    const fd = openSync(abs, 'r')
    const buf = Buffer.alloc(512)
    const n = readSync(fd, buf, 0, 512, 0)
    closeSync(fd)
    return buf.subarray(0, n).includes(0)
  } catch { return true }
}

function scanFile(rel, abs) {
  if (BINARY_EXT.has(path.extname(rel).toLowerCase())) return { findings: [], truncated: false, skipped: 'ext' }
  const size = statSync(abs).size
  if (looksBinary(abs)) return { findings: [], truncated: false, skipped: 'binary' }
  const truncated = size > SCAN_CAP
  let text = readFileSync(abs, 'utf8')
  if (truncated) text = text.slice(0, SCAN_CAP)
  return { findings: scanTextContent(rel, text), truncated, skipped: null }
}

function scanTextContent(rel, text) {
  const findings = []
  const lines = text.split(/\r?\n/)
  const apply = (rules, level) => {
    for (const rule of rules) {
      if (rule.skipFile && rule.skipFile(rel)) continue
      lines.forEach((line, i) => {
        if (rule.skipLine && rule.skipLine(line)) return
        const ms = line.match(rule.re)
        if (!ms) return
        for (const m of ms) {
          if (rule.skip && rule.skip(m)) continue
          findings.push({ level, rule: rule.id, file: rel, line: i + 1, sample: mask(m) })
        }
      })
    }
  }
  apply(FAIL_RULES, 'FAIL')
  apply(WARN_RULES, 'WARN')
  return findings
}

/** 매치 원문을 그대로 출력하면 그 자체가 유출 → 앞 6자만 남기고 마스킹 */
const mask = (s) => (s.length <= 8 ? s : `${s.slice(0, 6)}…(${s.length}자)`)

/* ── 게이트 자기시험 (--self-test) ─────────────────────────────────────────
 * "FAIL 0건"이 게이트가 잘 도는 증거인지, 아예 안 도는 빈 깡통인지 구분하기 위한 시험.
 * ★ 샘플 문자열은 반드시 문자열 결합으로 만든다 — 소스에 패턴 원형이 그대로 있으면
 *   이 파일 자신이 스캔에 걸려 zip 이 영구히 만들어지지 않는다.
 */
function selfTest() {
  const POS = [
    ['anthropic-key', 'ANTHROPIC_API_KEY=' + 'sk-ant-' + 'A1b2C3d4E5f6G7h8i9j0k1'],
    ['aws-akia', 'aws=' + 'AKIA' + 'IOSFODNN7EXAMPLE'],
    ['private-key', '-----BEGIN RSA ' + 'PRIVATE KEY-----'],
    ['jwt', 'token=' + 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.' + 'eyJzdWIiOiIxMjM0NTY3ODkw' + '.abcdef'],
    ['github-token', 'ghp' + '_0123456789abcdefghijkl'],
    ['slack-token', 'xoxb' + '-1234567890-abcdefghij'],
    ['key-with-value', 'QA_SESSION_SECRET=' + 'Sup3rSecretValue123'],
    ['hex64', 'hash ' + 'a'.repeat(64)],
    ['bcrypt', 'hash=' + '$2b' + '$10$' + 'A'.repeat(53)],
    ['trycloudflare', 'url=https://red-fox-1' + '.trycloudflare' + '.com/x'],
  ]
  const NEG = [
    'ANTHROPIC_API_KEY=' + 'sk-ant-...',
    'QA_PASSWORD=' + '<강한-비밀번호로-변경>',
    'QA_SESSION_SECRET=' + '${QA_SESSION_SECRET}',
    'QA_PASSWORD=',
    'QA_PW_PEPPER=' + 'change-me',
    'QA_PASSWORD: [' + "'malgnqa'" + '],',
    '"integrity": "sha512-' + 'b'.repeat(64) + '"',
  ]
  let bad = 0
  log('\n[self-test] 하드 FAIL 규칙 검출 시험')
  for (const [rule, sample] of POS) {
    const hit = scanTextContent('selftest.md', sample).some((f) => f.level === 'FAIL' && f.rule === rule)
    if (!hit) bad++
    log(`   ${hit ? 'OK  ' : 'MISS'} ${rule}`)
  }
  log('[self-test] 오탐(플레이스홀더) 비검출 시험')
  for (const sample of NEG) {
    const hits = scanTextContent('selftest.md', sample).filter((f) => f.level === 'FAIL')
    if (hits.length) bad++
    log(`   ${hits.length ? `FALSE-POSITIVE(${hits.map((h) => h.rule).join(',')})` : 'OK  '} ${sample.slice(0, 44)}`)
  }
  log(`[self-test] ${bad === 0 ? '통과 — 게이트가 실제로 동작합니다.' : `실패 ${bad}건 — 규칙을 고치세요.`}`)
  process.exit(bad === 0 ? 0 : 1)
}
if (args['self-test']) selfTest()

/* ───────────────────────── ① allowlist 수집 ───────────────────────── */
function gitList() {
  const r = spawnSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) die('git ls-files 실패 — 저장소가 아닌 폴더인가요?', r.stderr)
  return r.stdout.split('\0').filter(Boolean)
}
function gitHead() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : '(unknown)'
}
function gitStatus() {
  const r = spawnSync('git', ['-c', 'core.quotepath=off', 'status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  return r.status === 0 ? r.stdout.split(/\r?\n/).filter(Boolean) : []
}
function walk(dir, base = dir, acc = []) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, d.name)
    if (d.isDirectory()) walk(abs, base, acc)
    else acc.push(path.relative(ROOT, abs).split(path.sep).join('/'))
  }
  return acc
}

log('='.repeat(70))
log(`  QA 에이전트팀 — 전달 zip 패키징${SLIM ? ' [--slim: 사외 전달용]' : ''}${DRY ? ' [--dry-run]' : ''}`)
log('='.repeat(70))

const tracked = gitList()
const explicit = []
for (const f of EXPLICIT_ADD_FILES) if (existsSync(path.join(ROOT, f))) explicit.push(f)
for (const pre of EXPLICIT_ADD_PREFIX) {
  const abs = path.join(ROOT, pre)
  if (existsSync(abs)) explicit.push(...walk(abs))
}
const missingExplicit = [...EXPLICIT_ADD_FILES, ...EXPLICIT_ADD_PREFIX].filter((f) => !existsSync(path.join(ROOT, f)))

const candidates = [...new Set([...tracked, ...explicit])]

const skippedMissing = []
const denied = []
const include = []
for (const rel of candidates) {
  const abs = path.join(ROOT, rel)
  if (!existsSync(abs)) { skippedMissing.push(rel); continue } // 삭제 상태의 추적물(예: scenarios/00_index-…)
  if (statSync(abs).isDirectory()) continue
  const why = denyReason(rel)
  if (why) { denied.push({ rel, why }); continue }
  include.push(rel)
}

log(`\n[①] allowlist: git 추적 ${tracked.length}건 + 명시추가 ${explicit.length}건 → 후보 ${candidates.length}건`)
log(`     디스크에 없어 skip: ${skippedMissing.length}건${skippedMissing.length ? ` (${skippedMissing.slice(0, 3).join(', ')}${skippedMissing.length > 3 ? ' …' : ''})` : ''}`)
if (missingExplicit.length) log(`     [주의] 명시추가 대상이 없습니다: ${missingExplicit.join(', ')}`)
log(`[②] denylist 차단: ${denied.length}건`)
const denyByWhy = {}
for (const d of denied) denyByWhy[d.why] = (denyByWhy[d.why] || 0) + 1
for (const [why, n] of Object.entries(denyByWhy).sort((a, b) => b[1] - a[1])) log(`     - ${why}: ${n}건`)
log(`     최종 포함: ${include.length}건`)

/* ───────────────────────── 스테이징 ───────────────────────── */
const stamp = new Date()
const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}`
const STAGE_ROOT = path.join(process.env.TEMP || os.tmpdir(), `qa-pack-${process.pid}`)
const STAGE = path.join(STAGE_ROOT, 'QA_agent_team')
rmSync(STAGE_ROOT, { recursive: true, force: true })
mkdirSync(STAGE, { recursive: true })

let totalBytes = 0
for (const rel of include) {
  const from = path.join(ROOT, rel)
  const to = path.join(STAGE, rel)
  mkdirSync(path.dirname(to), { recursive: true })
  copyFileSync(from, to)
  totalBytes += statSync(to).size
}
log(`\n[스테이징] ${STAGE}  (${include.length}파일 / ${totalBytes.toLocaleString()}B)`)

/* ───────────────────────── ③ 내용 스캔 게이트 ───────────────────────── */
const findings = []
let scanned = 0
let truncatedCount = 0
for (const rel of include) {
  const res = scanFile(rel, path.join(STAGE, rel))
  if (res.skipped) continue
  scanned++
  if (res.truncated) truncatedCount++
  findings.push(...res.findings)
}
const hardFails = findings.filter((f) => f.level === 'FAIL')
const warns = findings.filter((f) => f.level === 'WARN')

log(`[③] 내용 스캔: 텍스트 ${scanned}파일 검사${truncatedCount ? ` (${truncatedCount}건은 2MB 까지만)` : ''} → FAIL ${hardFails.length}건 · WARN ${warns.length}건`)
for (const f of hardFails) log(`     [FAIL] ${f.rule}  ${f.file}:${f.line}  ${f.sample}`)
const warnByRule = {}
for (const w of warns) (warnByRule[w.rule] ||= []).push(w)
for (const [rule, arr] of Object.entries(warnByRule)) {
  const files = [...new Set(arr.map((a) => a.file))]
  log(`     [WARN] ${rule}: ${arr.length}건 / ${files.length}파일 — ${files.slice(0, 4).join(', ')}${files.length > 4 ? ' …' : ''}`)
}

if (hardFails.length) {
  rmSync(STAGE_ROOT, { recursive: true, force: true })
  die(`시크릿 패턴 ${hardFails.length}건이 걸렸습니다 — zip 을 만들지 않았습니다(스테이징도 삭제).`,
    '위 파일에서 값을 제거하거나 install/pack.mjs 의 denylist 에 추가한 뒤 다시 실행하세요. 오탐이면 FAIL_RULES 의 skip 예외를 보강하세요(임계값을 사람이 매번 걸러내지 않게).')
}

/* ───────────────────────── MANIFEST ───────────────────────── */
const statusLines = gitStatus()
const modifiedIncluded = statusLines.filter((l) => /^ ?M/.test(l)).map((l) => l.slice(3))
const untrackedIncluded = explicit.filter((f) => !tracked.includes(f))
const zipName = `QA_agent_team_transfer_${ymd}${SLIM ? '_slim' : ''}.zip`
const outDir = path.join(ROOT, 'output', 'transfer to others')
const outZip = path.join(outDir, zipName)

const manifest = [
  'QA 에이전트팀 — 전달 패키지 MANIFEST',
  '='.repeat(60),
  `생성일시        : ${stamp.toISOString()} (로컬 ${stamp.toLocaleString('ko-KR')})`,
  `HEAD 커밋       : ${gitHead()}`,
  `패키지 종류     : ${SLIM ? 'slim (사외 전달 — cloud/ · data/solsol_brand/ 제외)' : 'full (본인 PC 포팅 — 작업자산 포함)'}`,
  `포함 파일 수    : ${include.length}`,
  `포함 총 바이트  : ${totalBytes.toLocaleString()} B`,
  `zip SHA256      : 이 파일 안에는 넣을 수 없습니다(자기참조) → zip 과 같은 폴더의 "${zipName}.sha256.txt" 참조`,
  '',
  '[포함]',
  '  - git 추적물 전량(디스크에 실재하는 것) + 아래 명시 추가분',
  ...untrackedIncluded.slice(0, 40).map((f) => `      + ${f}`),
  untrackedIncluded.length > 40 ? `      + … 외 ${untrackedIncluded.length - 40}건` : '',
  '',
  '[제외 요약] (2차 denylist — 총 ' + denied.length + '건)',
  ...Object.entries(denyByWhy).sort((a, b) => b[1] - a[1]).map(([w, n]) => `  - ${w}: ${n}건`),
  '  ※ node_modules 는 `npm ci` 로, fixtures/ 는 `install/make-fixtures.mjs` 로 설치 시 복원됩니다.',
  '  ※ DB·실행결과·실제 .env 는 의도적으로 제외 — 회원 비밀번호 해시가 들어 있어 별도 안전채널로만 전달합니다.',
  '',
  '[미커밋 변경 포함 내역] — 이 zip 은 작업트리(디스크) 내용을 담습니다',
  ...(modifiedIncluded.length ? modifiedIncluded.map((f) => `  M  ${f}`) : ['  (수정된 추적 파일 없음)']),
  ...(skippedMissing.length ? ['', '[추적물이지만 디스크에 없어 제외됨]', ...skippedMissing.map((f) => `  D  ${f}`)] : []),
  '',
  '[내용 스캔 결과]',
  `  하드 FAIL : 0건 (1건이라도 있으면 zip 이 생성되지 않습니다)`,
  `  WARN      : ${warns.length}건 — ${Object.entries(warnByRule).map(([r, a]) => `${r} ${a.length}`).join(', ') || '없음'}`,
  '  WARN 판정 : 아래는 검사기가 걸었지만 결함이 아닙니다(오탐) — 다시 조사하지 마세요.',
  '    · public-default-pw(malgnqa) : 공개 기본값을 "거부 목록"으로 적어둔 코드/문서입니다(사용값이 아님).',
  '    · real-email-domain          : 문서 예시·연락처 표기입니다(비밀 아님).',
  '    · cf-host / cf-uuid          : 배포 대상 호스트·리소스 식별자로 비밀이 아니지만, 사외 전달 시 노출 여부를 검토하세요.',
  '',
  '[설치 방법]',
  '  1) 압축을 풀고 Node.js 24 이상을 설치한다 (https://nodejs.org)',
  '  2) Windows: 루트의 "설치.bat" 더블클릭  /  macOS·Linux: sh install.sh',
  '     (한글 파일명이 깨졌으면: node install/install.mjs)',
  '  3) 안내대로 관리자 비밀번호를 정하면 서버 기동 준비 완료 — 상세는 SETUP-NEW-PC.md',
  '  ※ 설치 성공 ≠ QA 실행 가능: 새 QA 실행에는 Claude 인증(claude login 또는 API 키)이 따로 필요합니다.',
].filter((l) => l !== '').join('\n') + '\n'

if (!DRY) writeFileSync(path.join(STAGE, 'MANIFEST.txt'), manifest)

/* ───────────────────────── 압축(bsdtar) + 검증 ───────────────────────── */
if (DRY) {
  log('\n[dry-run] zip 을 만들지 않았습니다. 게이트는 모두 통과했습니다.')
  log(`[dry-run] 스테이징 정리: ${STAGE_ROOT}`)
  rmSync(STAGE_ROOT, { recursive: true, force: true })
  log('[dry-run] 완료')
  process.exit(0)
}

if (!existsSync(TAR)) die(`bsdtar 를 찾을 수 없습니다: ${TAR}`, 'Windows 10 1803+ 에는 기본 포함입니다. PowerShell Compress-Archive 는 경로가 깨지므로 대체하지 마세요.')
mkdirSync(outDir, { recursive: true })
rmSync(outZip, { force: true })

// -C STAGE 아래의 최상위 항목들을 이름으로 넘긴다("." 을 넘기면 엔트리가 "./" 접두로 붙는다)
const topLevel = readdirSync(STAGE)
const tarRes = spawnSync(TAR, ['-a', '-c', '-f', outZip, '-C', STAGE, ...topLevel], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
if (tarRes.status !== 0) {
  rmSync(outZip, { force: true })
  rmSync(STAGE_ROOT, { recursive: true, force: true })
  die(`bsdtar 압축 실패 (exit ${tarRes.status})`, tarRes.stderr || '경로 길이·권한을 확인하세요.')
}

const listRes = spawnSync(TAR, ['-tf', outZip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const entries = (listRes.stdout || '').split(/\r?\n/).filter(Boolean)
const backslash = entries.filter((e) => e.includes('\\'))
const nonAscii = entries.filter((e) => /[^\x00-\x7F]/.test(e))
const nfd = nonAscii.filter((e) => e !== e.normalize('NFC'))
const zipSize = statSync(outZip).size
const sha = createHash('sha256').update(readFileSync(outZip)).digest('hex')
writeFileSync(`${outZip}.sha256.txt`, `${sha}  ${zipName}\n`)

log('')
log('-'.repeat(70))
log(`  zip           : ${outZip}`)
log(`  zip 크기      : ${zipSize.toLocaleString()} B (${(zipSize / 1024 / 1024).toFixed(2)} MB)`)
log(`  zip SHA256    : ${sha}`)
log(`  엔트리 수     : ${entries.length} (파일 ${include.length} + MANIFEST.txt + 디렉터리)`)
log(`  백슬래시 엔트리: ${backslash.length}건  ${backslash.length === 0 ? '← 0건 정상(mac/Linux 해제 안전)' : '← 비정상!'}`)
log(`  비ASCII 엔트리 : ${nonAscii.length}건 (NFC 아님 ${nfd.length}건)`)
log('-'.repeat(70))

if (backslash.length) {
  rmSync(outZip, { force: true })
  rmSync(`${outZip}.sha256.txt`, { force: true })
  rmSync(STAGE_ROOT, { recursive: true, force: true })
  die('엔트리 경로에 백슬래시가 있습니다 — mac/Linux 해제 시 경로가 붕괴합니다. zip 을 삭제했습니다.',
    'bsdtar(C:\\Windows\\System32\\tar.exe)로만 압축하세요.')
}

/* 구 zip 정리 — 게이트 전부 통과 후에만(폴더에 최신 1개 유지) */
const olds = readdirSync(outDir).filter((f) => /^QA_agent_team_transfer_.*\.zip$/.test(f) && f !== zipName)
if (args['keep-old']) {
  log(`  구 zip ${olds.length}건 유지 (--keep-old)`)
} else {
  for (const f of olds) { rmSync(path.join(outDir, f), { force: true }); rmSync(path.join(outDir, `${f}.sha256.txt`), { force: true }) }
  log(`  구 zip 삭제: ${olds.length}건${olds.length ? ` (${olds.join(', ')})` : ''} — 폴더에 최신 1개만 유지`)
}

rmSync(STAGE_ROOT, { recursive: true, force: true })
log(`  스테이징 정리 : ${existsSync(STAGE_ROOT) ? '실패(잔여 있음)' : '완료(잔여 0)'}`)
log('')
log('[pack] 완료. 이 zip 1개만 전달하면 설치 안내·설치기까지 모두 들어 있습니다.')
