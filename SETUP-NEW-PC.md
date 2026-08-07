# QA 에이전트팀 — 다른 PC 설치 가이드

> **비전문가라면 이 파일 대신 `시작하기_먼저_열어보세요.html` 을 더블클릭하세요.** 그림·버튼으로 더 쉽게 안내합니다.
> 이 문서는 원클릭 설치 + 수동 폴백 + 데이터 이관 + 문제 해결까지 다루는 상세 참고용입니다.

이 zip은 **QA 에이전트팀 프로젝트 전체의 클린 스냅샷**입니다. 보안·용량을 위해
`node_modules`·실제 시크릿(`.env` 등)·로컬 DB·실행결과·로그·`.git`·`fixtures/`는 **제외**되어 있고,
빠진 것들은 **설치 프로그램이 자동으로 복원**합니다(의존성은 `npm ci`, 더미 파일은 재생성).

> 구성: ① **로컬 실행 앱**(`webapp/` — Express + 내장 SQLite + Claude Agent SDK, 이거 하나면 QA 실행·조회 전부 됨)
> ② **클라우드 결과공유 뷰어**(`cloud/` — 선택, Cloudflare Workers) ③ 페르소나·시나리오·문서 자산
> ④ **설치 프로그램**(`install/` + 루트 `설치.bat`·`install.sh`).

---

## ⚡ 1단계로 끝내기 — 원클릭 설치 (권장)

1. **Node.js 24 이상 설치** — https://nodejs.org (LTS, 설치 옵션은 전부 기본값).
2. 압축을 푼 폴더에서
   - **Windows**: 루트의 **`설치.bat` 더블클릭**
   - **macOS·Linux**: 터미널에서 `sh install.sh`
3. 화면 안내대로 **관리자 비밀번호**만 정하면(엔터 시 자동 생성) 끝입니다. 자동으로:
   Node 버전 게이트 → 의존성 `npm ci` → Chromium → Playwright MCP 설정 → `.env` 시크릿 3종 생성 →
   인증 상태 진단 → 테스트용 더미 파일 생성 → DB 전제 확인 → 포트 점검 → 결과표 출력.
4. **서버 시작**: `webapp\QA서버-시작.bat` 더블클릭 → 브라우저가 `http://localhost:5510` 로 자동 오픈.
   로그인은 **아이디 `admin`** + 방금 정한(또는 자동 생성된) 비밀번호.

> **한글 파일명이 깨져 보이면**(`설치.bat` 이 `?��.bat` 처럼 보일 때) 압축 해제 도구가 인코딩을 잃은 것입니다.
> 그때는 터미널에서 **`node install/install.mjs`** 를 직접 실행하세요(같은 동작).

### 설치 프로그램 옵션
| 옵션 | 용도 |
|---|---|
| `--yes` | 비대화형(질문 없이 자동 생성). 무인 서버·스크립트용 |
| `--quick` | 부팅 최소 점검·보정만(무거운 다운로드 스킵). 서버 런처가 내부적으로 사용 |
| `--with-cloud` | `cloud/`(Cloudflare 뷰어) 의존성도 설치 |
| `--with-data=<폴더>` | 기존 PC 에서 받은 `webapp/data` 를 그대로 이관(§3) |
| `--port=<번호>` | 5510 이 이미 쓰이는 PC 에서 다른 포트 사용(`.env` 의 `PORT` 를 갱신하고 런처도 그 값을 읽음) |
| `--no-browser` | Chromium 다운로드 생략(시뮬레이션 모드로만 쓸 때) |
| `--with-claude-cli` | Claude Code CLI 를 전역 설치까지 수행(기본은 안내만) |

---

## ⚠️ 먼저 알아야 할 3가지 (오해가 잦은 지점)

1. **설치 성공 ≠ QA 실행 가능.** 설치가 전부 PASS 여도 **새 QA 실행에는 Claude 인증이 따로** 필요합니다.
   인증이 없으면 로그인·프로젝트 조회·이슈 트리아지는 되지만 "실행"만 실패합니다(§2).
2. **`claude login` 은 Claude Code CLI 가 설치돼 있어야** 쓸 수 있는 명령입니다.
   webapp 에 들어 있는 Agent SDK 는 CLI 를 PATH 에 등록하지 않으므로, CLI 가 없으면
   `npm i -g @anthropic-ai/claude-code` 로 먼저 설치하세요(또는 API 키 방식을 쓰세요).
3. **인터넷이 필요합니다.** 설치 시 npm·Chromium 다운로드, 실행 시 `api.anthropic.com`.
   또한 화면(UI)이 **외부 CDN 5종**(Google Fonts·jsDelivr·Tailwind Play CDN·unpkg)을 씁니다 —
   오프라인이거나 사내 방화벽이 이 호스트를 막으면 **화면 스타일·폰트가 깨집니다**(기능 자체는 로컬).
   설치 프로그램이 이 항목을 WARN 으로 알려줍니다. 완전 오프라인 PC 는 자가호스팅이 필요하며 현재 범위 밖입니다.

---

## 0. 사전 요구사항
| 항목 | 요구 |
|---|---|
| **Node.js** | **24 이상 — 하드 요구.** DB가 Node 내장 `node:sqlite` 를 씁니다. **22·23 은 불가**(22.0~22.4 는 모듈 자체가 없고, 22.5+ 도 플래그 필요 → 게이트만 통과하고 서버가 조용히 죽습니다). 설치 프로그램이 major < 24 를 **차단**합니다 |
| 인증 | **둘 중 하나** — 이 PC 에서 `claude login`(구독 세션, CLI 필요) **또는** Anthropic API 키. (조회만 하면 불필요) |
| 디스크 | 2GB+ (의존성 약 300MB + Chromium 약 500MB + 리포트 누적) |
| 인터넷 | npm registry · Chromium 다운로드 · `api.anthropic.com` · UI CDN |

확인: `node -v` → `v24.x` 이상. 전체 진단은 `node install/doctor.mjs`.

> **버전 핀의 단일 출처(SoT)** = `webapp/package.json` 의 `qaAgentTeam` 필드
> (`nodeMajorMin`·`playwrightMcpSpec`·`playwrightForBrowsers`). `.mcp.json` 은 설치 프로그램이 이 값으로
> 생성/갱신합니다 — **문서·설정 파일에 버전을 손으로 복사해 두지 마세요**(두 곳이 어긋나는 사고의 원인).

---

## 1. 수동 설치 (폴백 — 원클릭이 안 될 때만)

```bash
cd webapp
npm ci                              # package-lock 기준 정확 설치
                                    # 불일치로 실패하면 npm install 로 우회하지 말고 lock 을 맞추세요(재현성)
npx -y playwright@<qaAgentTeam.playwrightForBrowsers> install chromium
node scripts/setup-env.mjs --admin="정할관리자비밀번호"   # 시크릿 3종 자동 생성(멱등)
npm start                           # → http://localhost:5510  (admin / 위에서 정한 비밀번호)
```

**`.env` 는 `.env.example` 복사만으로 끝나지 않습니다.** 필수 3종이 빈 값이면
서버가 **부팅 시점에 예외를 던지고 즉시 종료**합니다(fail-closed — 창이 바로 닫히는 원인 1순위).

| 변수 | 의미 | 비고 |
|---|---|---|
| `QA_PASSWORD` | 슈퍼관리자(admin) 로그인 비밀번호 | 기본값·폴백 **없음** |
| `QA_SESSION_SECRET` | 세션 쿠키 서명 키(랜덤 32자↑) | 회전 가능(기존 로그인만 만료) |
| `QA_PW_PEPPER` | 비밀번호 해시용 페퍼(랜덤 32자↑) | **한번 정하면 변경 금지** |

> 과거 문서에 있던 "미설정 시 기본값 `malgnqa` 로 폴백" 은 **사실이 아닙니다.** 그 값으로 로그인을 시도하지 마세요.

---

## 2. Claude 인증 (새 QA 실행에 필요)

셋 중 하나를 고릅니다. 설치 프로그램이 현재 상태를 `apikey / session / none` 으로 진단해 줍니다.

| 방식 | 방법 | 비고 |
|---|---|---|
| 구독 세션 | `npm i -g @anthropic-ai/claude-code` → `claude login` | CLI 별도 설치가 **전제**. Windows·Linux 는 `~/.claude/.credentials.json` 으로 확인, **macOS 는 Keychain 에 저장될 수 있어 파일이 없어도 로그인돼 있을 수 있음** |
| API 키 | `webapp/.env` 의 `ANTHROPIC_API_KEY` 에 키 입력 | 무인 서버에 적합 |
| 인증 없이 | 그대로 사용 | 로그인·조회·트리아지는 되고 **새 QA 실행만 실패** |

---

## 3. 기존 PC 의 데이터 옮기기 (선택 · 별도 안전 채널)

전달 zip 에는 **DB 가 없습니다.** 새 PC 는 서버 첫 기동 시 `webapp/data/qa.db` 를 스키마와 함께
**빈 상태로 자동 생성**하므로 그대로 써도 동작합니다. 기존 결과까지 옮기려면:

**보내는 PC (원본은 건드리지 않습니다 — 비파괴 복사)**
```bash
node install/export-data.mjs --out="D:\qa-data-이관"          # 서버를 먼저 종료(Ctrl+C)
node install/export-data.mjs --out="D:\qa-data-이관" --dry-run # 계획만 보기
#  옵션: --include-reports (원본 리포트·스크린샷도) / --checkpoint (WAL 축소, opt-in)
```
`qa.db` + `qa.db-wal` + `qa.db-shm` **3파일을 함께** 복사하고 **행 수를 전후 대조**합니다
(WAL 모드라 `qa.db` 만 가져가면 최근 결과가 통째로 빠집니다).

**받는 PC**
```bash
node install/install.mjs --with-data="D:\qa-data-이관\webapp\data"
```

> ⚠️ **이 산출물은 zip 에 넣지 말고 반드시 별도 안전 채널로 전달하세요.** `qa.db` 에는
> **회원 비밀번호 해시**가 들어 있습니다(그래서 전달 zip 에서 일부러 뺐습니다).

### 🔐 받는 PC 보안 수칙 (4줄 — 반드시 지키세요)
1. 보내는 PC 의 `QA_SESSION_SECRET`·`QA_PW_PEPPER` 를 **복사하지 마세요.** 받는 PC 에서 **새로 생성된 값**을 씁니다.
   (단, `QA_PW_PEPPER` 를 새로 만들면 이관해 온 회원 비밀번호 해시는 검증되지 않습니다 → 회원 비번 재설정 또는
   그 페퍼만 안전 채널로 함께 이관 후 즉시 회전 계획을 세우세요.)
2. 클라우드 동기화를 쓴다면 `SYNC_TOKEN` 을 **회전**하세요(두 PC 가 같은 토큰을 공유하지 않게).
3. 수신 즉시 **`QA_PASSWORD` 를 변경**하세요(전달 과정에서 노출됐다고 가정).
4. 대상 서비스 자격증명은 **`.env` 의 `QA_TEST_EMAIL`/`QA_TEST_PASSWORD` 로만** 주입하세요 —
   스크립트·시나리오·리포트에 평문으로 적지 마세요.

---

## 4. 브라우저 자동화(MCP) — Claude Code 로 페르소나를 돌릴 때
설치 프로그램이 `webapp/package.json` 의 핀 버전으로 `.mcp.json` 을 만들고 npx 캐시를 미리 받아 둡니다.
그다음 **Claude Code 에서 이 폴더를 열면 MCP 서버 사용 승인 창**이 뜨는데, **승인해야** 실제 브라우저 구동
모드가 됩니다(미승인 = 시뮬레이션 모드, 기능 판단은 전부 `[추정]`).

## 5. 대상 서비스 로그인이 필요한 QA (선택)
`config/target.example.json` → `config/target.json` 으로 복사해 작성하고,
자격증명은 `.env` 의 `QA_TEST_EMAIL`/`QA_TEST_PASSWORD` 로 주입합니다(파일에 평문 저장 금지).

## 6. 클라우드 결과공유 뷰어 (선택 · `cloud/`)
QA 결과를 24/7 공유하려면 Cloudflare(Workers+D1)에 별도 배포합니다. **별도 Cloudflare 계정 필요.**
절차: `docs/결과공유_클라우드뷰어/07_M1_Cloudflare셋업가이드.md`·`08_뷰어_로그인_운영.md`.
설치는 `node install/install.mjs --with-cloud`.

## 7. 상시 가동 / 서버화
개인 PC 로그온 자동시작·systemd·pm2·NSSM·리버스프록시(HTTPS·SSE) 등은 `webapp/DEPLOY.md` 참고.

> **정본 저장소**: `https://github.com/djkim555-cmyk/qaagent.git` — 히스토리째 이어서 개발하려면 zip 대신
> `git clone` 후 `node install/install.mjs` 만 실행하면 됩니다.

---

## 8. 문제 해결 — 먼저 자기진단을 돌리세요

```bash
node install/doctor.mjs          # 사람이 읽는 표 (아무것도 바꾸지 않습니다)
node install/doctor.mjs --json   # 기계 판독용
node install/install.mjs         # 진단에서 FAIL 이 나온 것을 실제로 고칩니다(멱등 — 몇 번 돌려도 안전)
```
진단은 **고치지 않고**, 설치 프로그램은 **고칩니다.** 설치 결과 요약은 `install/last-install-report.txt`
(시크릿 값은 기록되지 않습니다).

| 증상 | 원인·처방 |
|---|---|
| 검은 창이 "Node.js 없음" | Node 24+ 설치 후 다시 실행 |
| `node:sqlite` 오류 / Node 22 인데 통과됐다 | Node 24 이상으로 올리세요(22·23 은 지원 안 함) |
| **서버 창이 즉시 닫힘 + `[auth] 필수 환경변수…`** | `.env` 의 필수 3종이 비었거나 공개기본값 → `node install/install.mjs` 재실행(값을 복구합니다) |
| 포트 충돌 | `node install/install.mjs --port=5511` (`.env` 와 런처가 함께 그 포트를 씁니다) |
| "QA 실행 실패" | Claude 인증 없음 → `claude login` 또는 API 키 (§2). **설치 성공 ≠ 실행 가능** |
| 화면이 스타일 없이 깨져 보임 | 외부 CDN 차단·오프라인 (§먼저 알아야 할 3가지) |
| `npm ci` 가 lock 불일치로 실패 | `npm install` 로 우회하지 말고 원본 PC 의 갱신된 `package-lock.json` 을 함께 받으세요 |
| 브라우저 구동이 아니라 시뮬레이션으로만 돌아감 | Chromium 미설치 또는 Claude Code 의 MCP 승인 안 함 (§4) |

---

## 9. 이 zip 에서 의도적으로 제외된 것 (투명성)
`node_modules/`(→ `npm ci`) · 실제 `.env`(→ `.env.example`·`setup-env.mjs`) · `config/target.json`(→ `*.example`) ·
`webapp/data/`(로컬 DB — 회원 비번 해시 포함, §3) · `reports/runs/`(실행결과·캡처) · `fixtures/`(더미 17MB, 설치 시 재생성) ·
`*.log` · `output/` · `.git/`(→ GitHub 클론) · 개인 로컬 설정(`.claude/settings.local.json`).

**패키지 종류 2종** — 상세 목록·해시·미커밋 변경 내역은 zip 안의 **`MANIFEST.txt`** 를 보세요.
| 종류 | 만드는 법 | 포함 |
|---|---|---|
| **full**(기본) | `node install/pack.mjs` | 작업자산 포함(`cloud/`·`data/solsol_brand/`) — **본인/사내 PC 포팅용** |
| **slim** | `node install/pack.mjs --slim` | `cloud/`·`data/solsol_brand/` 제외 — **사외(제3자) 전달용** |

패키징은 3중 게이트(추적물 allowlist → 시크릿 denylist → 내용 스캔)를 통과해야 zip 이 만들어지며,
압축은 **bsdtar** 만 씁니다(PowerShell `Compress-Archive` 는 경로에 백슬래시를 넣어 mac·Linux 해제 시 깨짐).
게이트가 실제로 동작하는지 확인: `node install/pack.mjs --self-test`.
