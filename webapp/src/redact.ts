// 비밀번호/자격증명 redaction 단일 출처(SoT).
//
// 목적: AI 시나리오 작성 흐름에서 사용자가 입력한 평문 비밀번호/자격증명이
//       시나리오 본문(markdown)·대화 응답(reply)·디스크 파일·클라우드 동기화로
//       절대 새지 않도록, 라벨이 붙은 자격증명 토큰을 표준 치환자로 바꾼다.
//
// 설계 원칙:
//   - 보안(미탐 0) 우선: 라벨이 붙은 토큰은 다양한 형태(JSON/YAML 키, 마크다운 표,
//     콜론 뒤 개행, 따옴표 안 개행)를 모두 잡는다. 애매하면 redact 한다.
//   - 멱등성: 이미 치환자(${ENV:...})·마스킹(***) 형태인 토큰은 다시 치환하지 않는다.
//     → redactSecrets 를 N번 적용해도 결과 동일.
//   - 의미 보존: 라벨과 구분자는 남기고 토큰만 치환자로 바꾼다(예: `password: ${ENV:QA_TEST_PASSWORD}`).
//   - 원본 비번/시크릿은 함수 밖으로 어떤 형태로도 반환/로그하지 않는다(hits 카운트만 노출).
//
// 토큰 클래스 구분:
//   - 비밀번호 계열(password/비밀번호/암호 …) → ${ENV:QA_TEST_PASSWORD}
//   - 그 외 자격증명(token/secret/api_key/Authorization Bearer …) → ${ENV:SECRET}
//     (의미상 비번 치환자와 구분하는 편이 더 정확함)

// 표준 치환자.
const PW_PLACEHOLDER = '${ENV:QA_TEST_PASSWORD}' // config/target.json 치환 규약과 일치.
const SECRET_PLACEHOLDER = '${ENV:SECRET}' // 비-password 자격증명 일반 마스킹.

// ── 라벨 정의 ──────────────────────────────────────────────────────────────
// 비밀번호 계열 라벨(영문/한글). 영문은 단어경계(\b)로 합성어 과탐을 줄인다.
//   영문: password / passwd / pwd / pw
//   한글: 비밀번호 / 패스워드 / 비번 / 암호  (\b 가 한글에 무력하므로 라벨 자체로 경계 표현)
const PW_LABEL = '(?:\\bpassword\\b|\\bpasswd\\b|\\bpwd\\b|\\bpw\\b|패스워드|비밀번호|비번|암호)'

// 비-password 자격증명 라벨. (Authorization: Bearer 는 별도 패턴으로 처리.)
//   token / secret / api_key / apikey / api-key / access_key / secret_key / accessKeyId …
const SECRET_LABEL =
  '(?:\\bsecret[_-]?key\\b|\\baccess[_-]?key(?:[_-]?id)?\\b|\\bapi[_-]?key\\b|\\bapikey\\b|\\baccess[_-]?token\\b|\\brefresh[_-]?token\\b|\\bsecret\\b|\\btoken\\b)'

// 라벨 직후 허용: 닫는 따옴표(JSON/YAML 키), 공백 등 — 라벨-구분자 인접 제약을 푼다.
//   예: `"password":` / `'pw' =` / `password :`
const POST_LABEL = '["\'`]?[ \\t]*'

// 명시적 구분자(콜론/전각콜론/등호) + 뒤따르는 공백·개행 허용(S3).
const SEP_COLON = '[:：=][ \\t\\r\\n]*'
// 공백만(구분자 없음) — 라벨+공백 뒤 일반 설명문을 잡지 않도록 맨토큰 가드와 함께만 사용.
const SEP_SPACE = '[ \\t]+'

// ── 토큰 형태 ──────────────────────────────────────────────────────────────
// 이미 안전한 형태(치환자/마스킹)면 토큰으로 보지 않기 위한 사전 검사.
const SAFE_TOKEN = /^(?:\$\{ENV:[^}]*\}|\*{3,}|[•·]{3,})$/

// 공백 구분일 때만 허용하는 "비번스러운" 맨토큰:
//   영문/숫자/기호로만 구성(완전한 한글 설명어 "정책은" 등 배제) + 최소 4자.
//   → `암호 secret9` 는 잡고 `암호 정책은` 은 과탐하지 않는다.
const BARE_TOKEN = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};:'".,<>/?\\|~`]{4,}$/

// 콜론/등호 경로의 맨토큰(따옴표 없음) 가드(S7 과탐 완화):
//   설명문("password: 정책은 …")의 한글 단어를 치환하지 않도록,
//   "공백 없고 한글이 아닌, 비번스러운 토큰"일 때만 치환한다.
//   단 미탐 0 우선 → 따옴표 토큰은 가드 없이 무조건 치환(아래 콜백 참조).
const COLON_BARE_GUARD = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};'".,<>/?\\|~`]{4,}$/

// 따옴표 안 토큰: 같은 종류 따옴표로 닫힐 때까지(개행 포함, S3). 비탐욕.
const QUOTED = '(["\'`])([\\s\\S]+?)\\3'
// 따옴표 없는 토큰(같은 줄): 공백/따옴표로 시작하지 않는 비공백 시퀀스.
const BARE = '([^\\s"\'`][^\\s]*)'

// 공통 캡처 그룹 순서: 1=라벨,2=구분자(POST_LABEL+SEP),3=여는따옴표,4=따옴표안토큰,5=맨토큰
//   (닫는 따옴표는 \3 역참조 — 캡처 그룹이 아니다.)
function buildRe(label: string, sep: string): RegExp {
  return new RegExp(`(${label})(${POST_LABEL}${sep})(?:${QUOTED}|${BARE})`, 'gi')
}

const RE_PW_COLON = buildRe(PW_LABEL, SEP_COLON)
const RE_PW_SPACE = buildRe(PW_LABEL, SEP_SPACE)
const RE_SECRET_COLON = buildRe(SECRET_LABEL, SEP_COLON)
const RE_SECRET_SPACE = buildRe(SECRET_LABEL, SEP_SPACE)

// Authorization: Bearer <token> — 헤더 형태. Bearer 뒤 토큰만 치환.
//   group: 1=헤더+Bearer 접두(보존), 2=토큰
const RE_BEARER = /\b(Authorization[ \t]*:[ \t]*Bearer[ \t]+)([^\s"'`]+)/gi

// 마크다운 GFM 표 행: `| 비밀번호 | 값 |` — 라벨 셀 다음 셀의 값을 비번으로 본다.
//   파이프로 둘러싸인 라벨 셀, 그다음 파이프, 값 셀, 그다음 파이프.
//   값 셀은 셀 안의 내용을 trim 한 첫 토큰을 치환(표 구분선 `---` 행은 가드로 배제).
const RE_TABLE_PW = new RegExp(
  `(\\|[ \\t]*)(${PW_LABEL})([ \\t]*\\|[ \\t]*)([^|\\r\\n]*?)([ \\t]*\\|)`,
  'gi',
)
const RE_TABLE_SECRET = new RegExp(
  `(\\|[ \\t]*)(${SECRET_LABEL})([ \\t]*\\|[ \\t]*)([^|\\r\\n]*?)([ \\t]*\\|)`,
  'gi',
)

/**
 * 텍스트에서 라벨이 붙은 평문 비밀번호/자격증명 토큰을 표준 치환자로 redact 한다.
 * @returns redacted(치환된 텍스트), hits(치환 건수 — 원본 토큰 문자열은 절대 포함하지 않음)
 */
export function redactSecrets(text: string): { redacted: string; hits: number } {
  if (!text) return { redacted: text ?? '', hits: 0 }
  let hits = 0

  // 라벨+구분자 경로 공통 치환 콜백.
  //   placeholder: 이 토큰 클래스의 치환자.
  //   quotedNeedsGuard=false → 따옴표 토큰은 무조건 치환(미탐 0).
  //   bareGuard: 따옴표 없는 맨토큰을 치환할지 결정(과탐 차단).
  const make =
    (placeholder: string, bareGuard: (token: string) => boolean) =>
    (match: string, label: string, sep: string, openQ: string, quoted: string, bare: string) => {
      const quotedTok: string | undefined = quoted
      const token: string | undefined = quotedTok != null ? quotedTok : bare
      if (token == null) return match // 안전망(이론상 도달 불가)
      // 멱등성: 이미 치환자/마스킹 형태면 그대로 둔다(재치환 방지).
      if (SAFE_TOKEN.test(token.trim())) return match
      // 따옴표 토큰은 항상 치환. 맨토큰은 가드 통과 시에만 치환.
      if (quotedTok == null && !bareGuard(token)) return match
      hits++
      if (quotedTok != null) return `${label}${sep}${openQ}${placeholder}${openQ}`
      return `${label}${sep}${placeholder}`
    }

  let redacted = text

  // 0) 마크다운 표 — 라벨 셀 다음 값 셀 치환(콜론/공백 경로보다 먼저).
  redacted = redacted.replace(RE_TABLE_PW, (m, pre, label, mid, cell, post) => {
    const val = (cell as string).trim()
    if (!val || /^:?-{2,}:?$/.test(val) || SAFE_TOKEN.test(val)) return m
    hits++
    return `${pre}${label}${mid}${PW_PLACEHOLDER}${post}`
  })
  redacted = redacted.replace(RE_TABLE_SECRET, (m, pre, label, mid, cell, post) => {
    const val = (cell as string).trim()
    if (!val || /^:?-{2,}:?$/.test(val) || SAFE_TOKEN.test(val)) return m
    hits++
    return `${pre}${label}${mid}${SECRET_PLACEHOLDER}${post}`
  })

  // 1) 비번 — 콜론/등호(따옴표 토큰 무조건, 맨토큰은 비-한글 토큰만).
  redacted = redacted.replace(RE_PW_COLON, make(PW_PLACEHOLDER, (t) => COLON_BARE_GUARD.test(t)))
  // 2) 비번 — 공백 구분(비번스러운 맨토큰만).
  redacted = redacted.replace(RE_PW_SPACE, make(PW_PLACEHOLDER, (t) => BARE_TOKEN.test(t)))

  // 3) 비-password 자격증명 — Authorization: Bearer <token>.
  redacted = redacted.replace(RE_BEARER, (m, prefix, tok) => {
    if (SAFE_TOKEN.test((tok as string).trim())) return m
    hits++
    return `${prefix}${SECRET_PLACEHOLDER}`
  })
  // 4) 비-password 자격증명 — 콜론/등호.
  redacted = redacted.replace(
    RE_SECRET_COLON,
    make(SECRET_PLACEHOLDER, (t) => COLON_BARE_GUARD.test(t)),
  )
  // 5) 비-password 자격증명 — 공백 구분.
  redacted = redacted.replace(
    RE_SECRET_SPACE,
    make(SECRET_PLACEHOLDER, (t) => BARE_TOKEN.test(t)),
  )

  return { redacted, hits }
}

// ── 화면 요약 전용 보강 redact (옵션 C exploreLoggedInScreens 산출물용) ──────
//
// 목적: redactSecrets 는 "라벨이 붙은" 자격증명을 잡는다. 하지만 로그인 후 화면 요약에는
//       라벨 없이 떨어진 고엔트로피 토큰(세션 JWT, AWS 키, 긴 base64/hex 비밀)이 섞일 수 있다.
//       이 함수는 redactSecrets 결과 위에 "라벨 무관" 고엔트로피 마스킹 + (가능하면) 실제
//       자격증명 값 정확일치 마스킹을 추가한다.
//
// 주의:
//   - 이 함수는 화면 요약 전용이다. 시나리오 본문 일반 redact(chatScenario reply/markdown,
//     saveScenarioFile)에는 적용하지 않는다(고엔트로피 24+ 규칙이 정상 식별자를 과탐할 수 있음).
//   - 멱등성: 치환자(${ENV:...})·마스킹(***)은 다시 건드리지 않게 가드한다.
//   - 원본 자격증명 값은 어떤 형태로도 반환/로그하지 않는다(치환만 한다).
const SCREEN_SECRET = '${ENV:SECRET}'

// 이미 안전한 치환자/마스킹 토큰(중첩 치환 방지용 가드).
//   ${ENV:...} 와 *** 자체가 고엔트로피 규칙에 다시 걸리지 않도록 건너뛴다.
function isAlreadyMasked(token: string): boolean {
  return /\$\{ENV:[^}]*\}/.test(token) || /\*{3,}/.test(token)
}

export function redactScreenSummary(text: string, envValues?: string[]): string {
  if (!text) return text ?? ''
  // 1) 라벨 기반 기존 redact 선적용.
  let out = redactSecrets(text).redacted

  // 2) 라벨 무관 고엔트로피 마스킹.
  // 2-a) JWT (header.payload[.signature]) — eyJ 로 시작하는 점 구분 토큰.
  out = out.replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]+)?/g, (m) =>
    isAlreadyMasked(m) ? m : SCREEN_SECRET,
  )
  // 2-b) AWS 액세스키 ID.
  out = out.replace(/AKIA[0-9A-Z]{16}/g, (m) => (isAlreadyMasked(m) ? m : SCREEN_SECRET))
  // 2-c) 길이 24+ 연속 base64/hex/토큰 문자열(단어경계). 이미 마스킹/치환자면 건너뜀.
  out = out.replace(/\b[A-Za-z0-9+/=_-]{24,}\b/g, (m) => (isAlreadyMasked(m) ? m : SCREEN_SECRET))

  // 3) 실제 자격증명 값 정확일치 마스킹(주어졌을 때만). split/join 정확일치 — 정규식 메타 안전.
  if (Array.isArray(envValues)) {
    for (const raw of envValues) {
      const v = typeof raw === 'string' ? raw : ''
      if (!v || v.length < 4) continue // 과탐 방지: 빈값/짧은 값 건너뜀.
      if (out.includes(v)) out = out.split(v).join(SCREEN_SECRET)
    }
  }
  return out
}
