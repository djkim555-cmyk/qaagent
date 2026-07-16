# QA 에이전트팀 — 다른 PC 설치 가이드

> **비전문가라면 이 파일 대신 `시작하기_먼저_열어보세요.html` 을 더블클릭하세요.** 그림·버튼으로 더 쉽게 안내합니다.
> 이 문서는 수동 설치·다른 OS·서버 배포까지 다루는 상세 참고용입니다.

이 zip은 **QA 에이전트팀 프로젝트 전체의 클린 스냅샷**입니다. 보안·용량을 위해
`node_modules`·실제 시크릿(`.env` 등)·로컬 DB·실행결과·로그·`.git`은 **제외**되어 있고,
대신 채워 쓸 **예시 파일(`*.example`)** 이 들어 있습니다.

> 구성: ① **로컬 실행 앱**(`webapp/` — Express + 내장 SQLite + Claude Agent SDK, 이거 하나면 QA 실행·조회 전부 됨) ② **클라우드 결과공유 뷰어**(`cloud/` — 선택, Cloudflare Workers) ③ 페르소나·시나리오·문서 자산.

---

## ⚡ 가장 쉬운 길 — Windows 원클릭 (권장)
1. **Node.js 24+ 설치** — https://nodejs.org (LTS, 설치 옵션은 기본값).
2. `webapp\QA서버-시작.bat` **더블클릭**.
   - 최초 1회: **관리자 비밀번호**만 정하면(엔터 시 자동 생성) 나머지 보안 시크릿은 **자동 생성**됩니다.
   - 필요하면 Anthropic API 키를 붙여넣고(없으면 엔터).
   - 이후 자동으로 의존성 설치(`npm ci`) → 서버 기동 → 브라우저 자동 오픈.
3. `http://localhost:5510` → **아이디 `admin` / 비번 = 방금 정한(또는 자동 생성된) 관리자 비밀번호**.
4. **새 QA를 직접 실행**하려면 인증이 필요 — 이 PC에서 `claude login` **또는** `.env`에 API 키.
   (결과 조회·트리아지만 할 거면 인증 없이도 됩니다.)

> `.bat`이 하는 일: Node 유무·버전 점검 → `.env` 자동 생성(`scripts/setup-env.mjs`가 시크릿 3종 자동 생성) → 인증 상태 안내 → `npm ci` → `npm start` → 브라우저 오픈. 재실행해도 안전(멱등).

---

## 0. 사전 요구사항
| 항목 | 요구 |
|---|---|
| **Node.js** | **24 LTS 이상 권장** (DB가 Node 내장 `node:sqlite` 사용 → 18·20 불가. 22.x는 `--experimental-sqlite` 플래그 필요) |
| 인증 | **둘 중 하나** — 이 PC에서 `claude login`(구독 세션) **또는** Anthropic API 키. (조회만 하면 불필요) |
| 인터넷 | `api.anthropic.com` 아웃바운드 + 최초 `npm`/Playwright 다운로드 |

확인: `node -v` → `v24.x` 이상.

---

## 1. 수동 설치 — 모든 OS (macOS·Linux·Windows)

**a. 의존성 설치**
```bash
cd webapp
npm ci                          # package-lock 기준 정확 설치
npx playwright install chromium # (권장) 실제 브라우저 구동용. 생략 시 시뮬레이션 모드
```

**b. 환경설정 — `webapp/.env`**
자동 방식(권장): `node scripts/setup-env.mjs --admin="원하는관리자비번"` → 시크릿 3종 자동 생성.
수동 방식: `cp .env.example .env` 후 아래 **필수 3종**을 고유한 값으로 설정(미설정/공개기본값이면 **서버가 뜨지 않습니다** — 의도된 보안 게이트).

| 변수 | 의미 | 생성 팁 |
|---|---|---|
| `QA_PASSWORD` | 슈퍼관리자(admin) 로그인 비밀번호 | 강한 임의 문자열 |
| `QA_SESSION_SECRET` | 세션 쿠키 서명 키 | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `QA_PW_PEPPER` | 비밀번호 해시용 페퍼(**한번 정하면 변경 금지**) | 위와 동일 랜덤 32자+ |

인증(QA 실행에 필요)은 `claude login` **또는** `.env`의 `ANTHROPIC_API_KEY=sk-ant-...`.

**c. 실행**
```bash
npm start        # → http://localhost:5510  (admin / QA_PASSWORD)
```

---

## 2. 데이터에 대해 (중요)
- 이 zip에는 **DB가 없습니다.** 서버가 처음 뜰 때 `webapp/data/qa.db`를 **빈 상태로 자동 생성**합니다(스키마 자동). 그래서 바로 동작합니다.
- **기존 PC의 QA 결과(프로젝트·실행·이슈·트리아지)까지 옮기려면**: 원본 PC의
  `webapp/data/qa.db`(+ `qa.db-wal`, `qa.db-shm` 세 파일 함께) 와 `reports/runs/` 폴더를
  **별도로 안전하게 복사**해 같은 위치에 넣으세요.
  ⚠️ `qa.db`에는 **회원 비밀번호 해시**가 들어 있으니 안전한 채널로만 전달하세요(이 zip에서 일부러 뺀 이유).

---

## 3. 브라우저 자동화(MCP) — Claude Code로 페르소나 실행 시
`.mcp.json`(Playwright MCP 설정)은 포함되어 있습니다. Claude Code에서 이 폴더를 열면
서버 사용 승인 후 실제 브라우저 구동 모드가 됩니다. (없으면 시뮬레이션 모드, 판단은 `[추정]`)

## 4. 대상 서비스 로그인이 필요한 QA (선택)
`config/target.example.json` → `config/target.json`으로 복사해 작성하고,
자격증명은 `.env`의 `QA_TEST_EMAIL`/`QA_TEST_PASSWORD`로 주입합니다(파일에 평문 저장 금지).

## 5. 클라우드 결과공유 뷰어 (선택 · `cloud/`)
QA 결과를 24/7 공유하려면 Cloudflare(Workers+D1)에 별도 배포합니다. **별도 Cloudflare 계정 필요**.
절차: `docs/결과공유_클라우드뷰어/07_M1_Cloudflare셋업가이드.md`·`08_뷰어_로그인_운영.md`.

## 6. 상시 가동 / 서버화
개인 PC 로그온 자동시작·systemd·pm2·NSSM·리버스프록시(HTTPS·SSE) 등은 `webapp/DEPLOY.md` 참고.

> **정본 저장소**: `https://github.com/djkim555-cmyk/qaagent.git` — 히스토리째 이어서 개발하려면 zip 대신 `git clone` 후 §1-b대로 `.env`만 만들면 됩니다.

---

## 7. 문제 해결
- **`node:sqlite` 오류** → Node 버전 확인(24+ 권장, 22.x는 `--experimental-sqlite`).
- **서버가 즉시 종료 + `[auth] 필수 환경변수...`** → `.env` 지우고 원클릭(또는 `setup-env.mjs`) 재실행.
- **포트 충돌** → `.env`의 `PORT` 변경.
- **QA 실행 인증 실패** → `claude login` 또는 `ANTHROPIC_API_KEY`.

## 이 zip에서 의도적으로 제외된 것 (투명성)
`node_modules/`(→ `npm ci`) · 실제 `.env`(→ `.env.example`·`setup-env.mjs`) · `config/target.json`(→ `*.example`) ·
`webapp/data/`(DB, 자동 재생성) · `reports/runs/`(실행결과) · `*.log` · `.git/`(→ GitHub 클론).
