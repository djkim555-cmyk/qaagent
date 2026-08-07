#!/usr/bin/env node
/**
 * QA 에이전트팀 — 자기진단(doctor)
 * ---------------------------------------------------------------------------
 * install.mjs 의 **검사 함수만** 재사용한다(설치·파일 변경 행위 0 — 순수 읽기).
 * 검사 로직을 여기에 다시 쓰지 않는다: 판정이 두 곳에 있으면 반드시 어긋난다.
 *
 * 실행: node install/doctor.mjs            (사람이 읽는 표)
 *       node install/doctor.mjs --json     (기계 판독용 JSON)
 */
import {
  ROOT, WEBAPP, readQaConfig, renderTable,
  checkNode, checkNpm, checkWorkspace, checkDeps, checkBrowsers,
  checkMcp, checkEnv, checkAuth, checkFixtures, checkDb, checkPort, checkCdn,
  envPort,
} from './install.mjs'

const asJson = process.argv.includes('--json')

const cfg = readQaConfig()
const results = [
  checkNode({ cfg }),
  checkNpm(),
  checkWorkspace(),
  checkDeps(),
  checkBrowsers(),
  checkMcp(cfg),
  checkEnv(),
  checkAuth(),
  checkFixtures(),
  await checkDb(),
  await checkPort(),
  checkCdn(),
]

const tally = (s) => results.filter((r) => r.status === s).length
const fails = tally('FAIL')

if (asJson) {
  console.log(JSON.stringify({
    root: ROOT,
    node: process.versions.node,
    platform: `${process.platform}/${process.arch}`,
    port: envPort(),
    pins: { source: cfg.source, nodeMajorMin: cfg.nodeMajorMin, playwrightMcpSpec: cfg.playwrightMcpSpec, playwrightForBrowsers: cfg.playwrightForBrowsers || null },
    summary: { pass: tally('PASS'), warn: tally('WARN'), fail: fails, skip: tally('SKIP') },
    results,
  }, null, 2))
} else {
  console.log('='.repeat(64))
  console.log('  QA 에이전트팀 — 자기진단 (아무것도 변경하지 않습니다)')
  console.log('='.repeat(64))
  console.log(`  루트: ${ROOT}`)
  console.log(`  webapp: ${WEBAPP}`)
  console.log(`  버전 핀 출처: ${cfg.source}${cfg.warn ? ` — ${cfg.warn}` : ''}`)
  console.log('-'.repeat(64))
  for (const l of renderTable(results)) console.log(l)
  console.log('-'.repeat(64))
  console.log(`  PASS ${tally('PASS')} · WARN ${tally('WARN')} · FAIL ${fails} · SKIP ${tally('SKIP')}`)
  console.log(fails
    ? '  → FAIL 이 있습니다. 고치려면 `node install/install.mjs` 를 실행하세요(진단은 고치지 않습니다).'
    : '  → 이상 없습니다.')
  console.log('='.repeat(64))
}

process.exit(fails ? 1 : 0)
