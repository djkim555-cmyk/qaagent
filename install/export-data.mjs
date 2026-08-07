#!/usr/bin/env node
/**
 * QA 에이전트팀 — 기존 PC 데이터 내보내기 (비파괴)
 * ---------------------------------------------------------------------------
 * 원본을 **읽기만** 한다. 지우거나 옮기지 않는다(copy → verify, move 없음).
 *
 * 기본 동작
 *   1) 서버가 떠 있지 않은지 확인(.env 의 PORT). 떠 있으면 중단 — WAL 모드 DB 는 기동 중 복사가 위험.
 *   2) webapp/data 의 `qa.db` + `qa.db-wal` + `qa.db-shm` **3파일을 함께** 복사.
 *      (WAL 모드에서 qa.db 만 가져가면 최근 커밋이 통째로 빠진다.)
 *   3) 원본 ↔ 사본 **행 수 전후 대조**(projects/runs/persona_runs/issues + 회원/트리아지).
 *
 * 옵션
 *   --out=<dir>          내보낼 폴더 (필수)
 *   --checkpoint         opt-in. 복사 전에 원본에 WAL 체크포인트를 시도한다(원본 파일을 만지므로 기본 아님)
 *   --include-reports    reports/runs/ 도 함께 복사(원본 리포트·스크린샷, 용량 큼)
 *   --dry-run            무엇을 복사할지만 보여주고 아무것도 쓰지 않음
 *
 * 보안: qa.db 에는 **회원 비밀번호 해시**가 들어 있다. 이 산출물은 전달 zip 에 넣지 말고
 *      반드시 별도 안전 채널로 옮긴다. 수신 PC 에서는 QA_PASSWORD 를 즉시 변경할 것.
 */
import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync } from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { WEBAPP, ROOT, envPort } from './install.mjs'

const args = Object.fromEntries(process.argv.slice(2).map((t) => {
  const m = t.match(/^--([^=]+)(?:=(.*))?$/)
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [t, true]
}))

const fail = (msg, hint) => { console.error(`[export] ${msg}`); if (hint) console.error(`[export] → ${hint}`); process.exit(1) }

if (!args.out) fail('--out=<폴더> 를 지정하세요.', '예: node install/export-data.mjs --out="D:\\qa-data-백업"')
const OUT = path.resolve(String(args.out))
const SRC = path.join(WEBAPP, 'data')
const DRY = !!args['dry-run']

if (!existsSync(path.join(SRC, 'qa.db'))) fail(`원본이 없습니다: ${path.join(SRC, 'qa.db')}`, '이 PC 에서 서버를 한 번이라도 띄웠어야 DB 가 생깁니다.')

/* 1) 서버 미기동 확인 */
const probe = (host, port) => new Promise((res) => {
  const s = net.connect({ host, port })
  const done = (v) => { try { s.destroy() } catch { /* noop */ } res(v) }
  s.setTimeout(900); s.on('connect', () => done(true)); s.on('timeout', () => done(false)); s.on('error', () => done(false))
})
const port = envPort()
if ((await probe('127.0.0.1', port)) || (await probe('::1', port))) {
  fail(`포트 ${port} 에 서버가 실행 중입니다.`, '서버 창에서 Ctrl+C 로 종료한 뒤 다시 실행하세요(WAL 모드 DB 는 기동 중 복사가 불안전합니다).')
}

/* 2) (opt-in) WAL 체크포인트 */
if (args.checkpoint) {
  const { DatabaseSync } = await import('node:sqlite')
  if (DRY) console.log('[export] (dry-run) WAL 체크포인트 생략')
  else {
    const db = new DatabaseSync(path.join(SRC, 'qa.db'))
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      console.log('[export] WAL 체크포인트 완료(원본 -wal 축소).')
    } finally { db.close() }
  }
}

/* 3) 3파일 동시 복사 */
const NAMES = ['qa.db', 'qa.db-wal', 'qa.db-shm']
const present = NAMES.filter((n) => existsSync(path.join(SRC, n)))
const dstData = path.join(OUT, 'webapp', 'data')
console.log(`[export] 원본: ${SRC}`)
console.log(`[export] 대상: ${dstData}`)
console.log(`[export] 복사 대상 ${present.length}/3 — ${present.map((n) => `${n}(${statSync(path.join(SRC, n)).size}B)`).join(', ')}`)
if (present.length < 3) console.log('[export] (참고) -wal/-shm 은 서버가 깨끗히 종료되면 없을 수 있습니다. 있는 것만 가져가면 됩니다.')

if (!DRY) {
  mkdirSync(dstData, { recursive: true })
  for (const n of present) copyFileSync(path.join(SRC, n), path.join(dstData, n))
}

/* 4) 전후 건수 대조 */
if (!DRY) {
  const { DatabaseSync } = await import('node:sqlite')
  const TABLES = ['projects', 'runs', 'persona_runs', 'issues', 'developers', 'members', 'project_members']
  const read = (p) => {
    const db = new DatabaseSync(p, { readOnly: true })
    const o = {}
    for (const t of TABLES) { try { o[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c } catch { o[t] = null } }
    db.close(); return o
  }
  const a = read(path.join(SRC, 'qa.db'))
  const b = read(path.join(dstData, 'qa.db'))
  let ok = true
  console.log('[export] 건수 대조 (원본 → 사본)')
  for (const t of TABLES) {
    if (a[t] === null && b[t] === null) continue
    const same = a[t] === b[t]
    if (!same) ok = false
    console.log(`   ${same ? 'OK  ' : 'DIFF'} ${t}: ${a[t]} → ${b[t]}`)
  }
  if (!ok) fail('건수가 일치하지 않습니다.', '원본은 그대로 있습니다(비파괴). 서버 종료를 확인하고 다시 실행하세요.')
}

/* 5) (opt-in) reports/runs */
if (args['include-reports']) {
  const rSrc = path.join(ROOT, 'reports', 'runs')
  if (!existsSync(rSrc)) console.log('[export] reports/runs 없음 — 생략')
  else {
    const dst = path.join(OUT, 'reports', 'runs')
    const runs = readdirSync(rSrc, { withFileTypes: true }).filter((d) => d.isDirectory())
    console.log(`[export] reports/runs — ${runs.length}개 run 폴더 복사${DRY ? ' (dry-run 생략)' : ''}`)
    if (!DRY) {
      mkdirSync(dst, { recursive: true })
      // node_modules 가 섞여 들어간 run 폴더가 실제로 있었다 → 제외한다.
      const { cpSync } = await import('node:fs')
      cpSync(rSrc, dst, { recursive: true, filter: (s) => !/[\\/]node_modules([\\/]|$)/.test(s) })
    }
  }
}

console.log('')
console.log(`[export] ${DRY ? '(dry-run) 계획 표시 완료 — 아무것도 쓰지 않았습니다.' : '완료 — 원본은 변경하지 않았습니다.'}`)
console.log('[export] ⚠ 이 폴더에는 회원 비밀번호 해시가 포함됩니다. 전달 zip 에 넣지 말고 안전한 채널로만 옮기세요.')
console.log('[export] 수신 PC: 이 폴더를 그대로 두고 `node install/install.mjs --with-data="<이 폴더>/webapp/data"` 로 넣으면 됩니다.')
