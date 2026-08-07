#!/usr/bin/env node
/**
 * QA 에이전트팀 — 업로드 테스트용 더미 파일 생성기 (멱등)
 * ---------------------------------------------------------------------------
 * fixtures/ 는 전달 zip 에서 제외한다(약 17MB, 내용이 무의미한 더미).
 * 대신 설치 시 이 스크립트가 **같은 이름·같은 바이트 크기**로 재생성한다.
 *  - dummy-11mb.bin      11,534,336 B (11 MiB) — 용량 초과 거부 테스트용
 *  - dummy-1mb-01..06.bin 1,048,576 B (1 MiB)  — 다중 첨부 테스트용
 *
 * 주의: 파일 크기가 검증 기준이므로 임의로 형식(.png 등)이나 크기를 바꾸지 않는다.
 *       (scenarios/04_*.md 는 .png 로 기술하지만 실물은 .bin — 현 상태를 그대로 재현한다.)
 *
 * 실행: node install/make-fixtures.mjs [--force]
 */
import { existsSync, mkdirSync, statSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { FIXTURES } from './install.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(path.resolve(HERE, '..'), 'fixtures')
const force = process.argv.includes('--force')

mkdirSync(DIR, { recursive: true })

const CHUNK = 1024 * 1024 // 1 MiB 씩 써서 메모리를 잡지 않는다
const buf = Buffer.alloc(CHUNK, 0)

let made = 0
let kept = 0
for (const [name, size] of FIXTURES) {
  const f = path.join(DIR, name)
  if (existsSync(f) && !force) {
    const got = statSync(f).size
    if (got === size) { kept++; continue }
    console.log(`[fixtures] 크기 불일치 → 재생성: ${name} (${got}B ≠ ${size}B)`)
  }
  const fd = openSync(f, 'w')
  try {
    let left = size
    while (left > 0) {
      const n = Math.min(left, CHUNK)
      writeSync(fd, buf, 0, n)
      left -= n
    }
  } finally { closeSync(fd) }
  const got = statSync(f).size
  if (got !== size) {
    console.error(`[fixtures] 생성 검증 실패: ${name} — ${got}B (기대 ${size}B)`)
    process.exit(1)
  }
  made++
}

// 무엇을 위한 폴더인지 남긴다(빈 더미만 있으면 다음 사람이 지운다)
const readme = path.join(DIR, 'README.txt')
if (!existsSync(readme)) {
  writeFileSync(readme,
    'QA 업로드 테스트용 더미 파일 폴더입니다.\r\n'
    + '전달 zip 에는 포함하지 않고, install/make-fixtures.mjs 가 설치 시 같은 크기로 재생성합니다.\r\n'
    + '내용은 전부 0 바이트 패턴이며 의미가 없습니다. 지워도 재생성됩니다.\r\n')
}

console.log(`[fixtures] 완료 — 생성 ${made}건 / 유지 ${kept}건 (${DIR})`)
