// redactSecrets 회귀 테스트.
//
// 실행: webapp/ 에서
//   node --import tsx --test src/redact.test.ts
// (테스트 러너 없이 node 내장 test + tsx 트랜스파일로 빌드 없이 동작.)
//
// 단언 원칙(차보안 게이트): 평문 토큰이 결과에 "남지 않음"만 검증한다.
//   토큰 원문을 테스트 상수로 두되, 단언은 항상 includes(token) === false 형태.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { redactSecrets } from './redact.js'

// 이 토큰들은 "평문 비번"을 흉내 낸 더미다. 단언은 "결과에 없음"으로만 한다.
const PW = 'SuperSecret123'
const PW_MULTILINE = 'line1\nline2val'
const PW_KOR = 'MyPass1234'
const PW_TABLE = 'realpw99'

function isRedacted(input: string, token: string) {
  const { redacted, hits } = redactSecrets(input)
  assert.ok(!redacted.includes(token), `토큰이 결과에 남음:\n  입력: ${JSON.stringify(input)}\n  결과: ${JSON.stringify(redacted)}`)
  assert.ok(hits >= 1, `hits 가 0 (치환 안 됨): ${JSON.stringify(input)}`)
}

// ── 차보안 PoC 6종 — 전부 redact 되어야 함 ──────────────────────────────────

test('PoC1: JSON 라벨-콜론 사이 닫는 따옴표', () => {
  isRedacted(`{"password":"${PW}"}`, PW)
})

test('PoC2: JSON spaced', () => {
  isRedacted(`"password": "${PW}"`, PW)
})

test('PoC3: 콜론 뒤 개행', () => {
  isRedacted(`password:\n${PW}`, PW)
})

test('PoC4: 따옴표 안 개행 포함 값', () => {
  isRedacted(`password: "${PW_MULTILINE}"`, PW_MULTILINE)
  // 부분 토큰(line2val)도 남으면 안 된다.
  const { redacted } = redactSecrets(`password: "${PW_MULTILINE}"`)
  assert.ok(!redacted.includes('line2val'), '값 일부가 남음')
})

test("PoC5: 라벨 변형 '패스워드'", () => {
  isRedacted(`패스워드: ${PW_KOR}`, PW_KOR)
})

test('PoC6: 마크다운 표 셀', () => {
  isRedacted(`| 비밀번호 | ${PW_TABLE} |`, PW_TABLE)
})

// ── 비-password 자격증명(S4) ────────────────────────────────────────────────

test('S4: token', () => {
  isRedacted(`token: abc123XYZdef`, 'abc123XYZdef')
})

test('S4: api_key JSON', () => {
  isRedacted(`{"api_key":"AKIA0987SECRETKEY"}`, 'AKIA0987SECRETKEY')
})

test('S4: secret =', () => {
  isRedacted(`secret = topsecretvalue`, 'topsecretvalue')
})

test('S4: Authorization Bearer', () => {
  isRedacted(`Authorization: Bearer eyJraExampleTokenXYZ`, 'eyJraExampleTokenXYZ')
})

// ── 과탐 방지(S7) — 설명문은 보존되어야 함 ──────────────────────────────────

test('S7: 한국어 설명문 보존 (password: 정책은 …)', () => {
  const input = 'password: 정책은 다음과 같다'
  const { redacted } = redactSecrets(input)
  assert.equal(redacted, input, `설명문이 오치환됨: ${JSON.stringify(redacted)}`)
})

test('S7: password 정책 설명(공백, 한글) 보존', () => {
  const input = 'password 정책은 8자 이상'
  const { redacted } = redactSecrets(input)
  assert.equal(redacted, input, `설명문이 오치환됨: ${JSON.stringify(redacted)}`)
})

// ── 멱등성 / 안전형태 보존 ──────────────────────────────────────────────────

test('멱등성: 두 번 적용해도 동일', () => {
  const input = `{"password":"${PW}"}\npassword: ${PW_KOR}\n| 비밀번호 | ${PW_TABLE} |`
  const once = redactSecrets(input).redacted
  const twice = redactSecrets(once).redacted
  assert.equal(twice, once, '재적용 시 결과가 바뀜(멱등성 위반)')
  assert.ok(!once.includes(PW) && !once.includes(PW_KOR) && !once.includes(PW_TABLE), '평문 토큰 잔존')
})

test('이미 치환자/마스킹이면 재치환 안 함', () => {
  const input = 'password: ${ENV:QA_TEST_PASSWORD}\ntoken: ***'
  const { redacted, hits } = redactSecrets(input)
  assert.equal(redacted, input)
  assert.equal(hits, 0)
})

// ── 정상 케이스 통합 ────────────────────────────────────────────────────────

test('표 정렬 구분선 행은 건드리지 않음', () => {
  const input = '| 비밀번호 | 값 |\n| --- | --- |'
  const { redacted } = redactSecrets(input)
  assert.ok(redacted.includes('---'), '구분선이 손상됨')
})
