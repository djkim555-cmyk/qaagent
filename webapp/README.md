# QA 에이전트팀 — webapp

기존 CLI 페르소나 파이프라인(`.claude/agents`, `personas/`, `scenarios/`, `reports/`)을
**웹 콘솔**로 감싼 사내/팀 내부 도구입니다. 프로젝트 등록 → 페르소나/시나리오 → QA 실행 →
통합 리포트 → **이슈 트리아지(구분 코드·개발담당자 배정)** 까지 한 곳에서 다룹니다.

## 기술 스택 (정적 SPA · 빌드 없음)

- **프레임워크**: Vue 3 (CDN)
- **라우터**: ViewLogic Router 1.4.0 — 파일 기반 라우팅(`public/src/views/*.html` + `public/src/logic/*.js`), 해시 모드
- **CSS**: Bootstrap 5.3.3 + 최소 커스텀 CSS(`public/css/base.css`, 민트그린 테마) + Noto Sans KR
- **서버**: Express — JSON API + 정적 SPA 서빙 전용 (서버 렌더링 없음)
- **빌드**: 없음 (정적 파일 직접 서빙, ViewLogic `environment: 'development'`)

## 화면 구성 (SPA · 공통 GNB)

- **로그인**: 아이디(`admin`) + 비밀번호(`QA_PASSWORD`). **기본값·폴백은 없습니다** — 미설정이면 서버가 기동하지 않습니다(fail-closed). 쿠키 세션 + ViewLogic `checkAuthFunction` 게이트.
- **GNB(공통 레이아웃)**: `public/src/views/layout/default.html` — 대시보드 · 페르소나 시드 · 프로젝트 · 설정.
- **대시보드** `#/home`: 진행 중 실행·미해결 P1·이번 주 실행·프로젝트 수 + 최근 실행.
- **프로젝트** `/projects`: 등록·목록. 진입 후 탭:
  - **개요** — 통계 · 세그먼트 완료율 · 구분별 이슈 · AI 요약 배너
  - **페르소나** — 시드 20인 + LLM 생성(분포 유지)
  - **시나리오** — 파일 목록 + LLM 생성(`_template.md` 양식)
  - **실행** — 시나리오 선택 후 실행 · 실행 이력
  - **QA 리스트** — 발견 이슈에 **구분(문의/오류/기능개선/제안)·개발담당자·상태**를 인라인 배정
  - **설정** — baseUrl·플랫폼·guards
- **설정** `/settings`: 개발담당자 관리 + 시스템 정보.

```
[브라우저 UI] ──POST /api/runs──▶ [Express 서버]
      ▲                               │ Agent SDK query() 로 fan-out
      └──SSE 진행상황───────────────── │ persona-tester × N (동시 CONCURRENCY)
                                       │   → reports/runs/{runId}/P*/report.md
                                       └─ qa-synthesizer × 1
                                           → reports/runs/{runId}/INTEGRATED-REPORT.md
```

핵심: **에이전트 로직을 재작성하지 않습니다.** `.claude/agents/*.md` 본문을 읽어
Agent SDK 프롬프트로 주입하고, 리포트는 기존 `reports/` 관례대로 파일로 저장합니다.

실행 메타데이터·페르소나별 결과·**구조화 이슈**는 로컬 SQLite(`data/qa.db`)에 영속화됩니다
(Node 내장 `node:sqlite` — 네이티브 컴파일·외부 DB 불필요). 서버를 재시작해도 실행 이력이
남고, 같은 SQLite 방언이라 추후 Cloudflare D1 등으로 이전 시 SQL을 재사용할 수 있습니다.

## 사전 준비

1. **Node 24 이상 필수(하드 요구)**. DB가 Node 내장 `node:sqlite` 를 쓴다. **22·23 은 지원하지 않는다** — 22.0~22.4 는 모듈 자체가 없고 22.5+ 도 `--experimental-sqlite` 플래그가 필요해, 게이트만 통과하고 서버가 조용히 죽는다. 설치 프로그램(`node install/install.mjs`)이 major < 24 를 하드 차단한다. 요구 버전의 단일 출처(SoT)는 `package.json` 의 `qaAgentTeam.nodeMajorMin`.
2. **Agent SDK 인증** — 둘 중 하나면 됩니다:
   - **(권장) Claude 로그인 세션**: 이 머신에서 `claude login` 으로 로그인돼 있으면 API 키 없이
     그 세션(구독 인증)으로 동작합니다. `~/.claude/.credentials.json` 을 SDK 가 자동 사용.
   - **API 키**: 로그인 세션이 없는 머신(전용 서버 등)이면 [platform.claude.com](https://platform.claude.com)
     에서 키를 발급해 `.env` 의 `ANTHROPIC_API_KEY` 에 넣습니다.
3. (선택) **Playwright MCP** — 실제 브라우저 구동에 필요. 첫 실행 시 `npx` 가 자동으로 받습니다.
   없이 쓰려면 `.env` 에서 `QA_ENABLE_PLAYWRIGHT=false` (시뮬레이션 모드, 기능 판단은 모두 `[추정]`).

## 실행

```powershell
# 권장: 저장소 루트에서 설치 프로그램에 위임(Node 게이트·의존성·브라우저·MCP·.env·DB·포트를 한 번에)
node install\install.mjs

# 또는 수동
cd "<저장소 루트>\webapp"
node scripts\setup-env.mjs --admin="정할비밀번호"   # ★ .env.example 복사만으로는 부족하다(필수 3종이 빈 값 → 서버 미기동)
npm ci
npm run dev                  # http://localhost:5510
```

> ⚠️ `copy .env.example .env` 만 하면 `QA_PASSWORD`·`QA_SESSION_SECRET`·`QA_PW_PEPPER` 가 **빈 값**이라
> 서버가 뜨지 않는다(fail-closed). 반드시 `setup-env.mjs`(멱등) 로 값을 채운다.

브라우저에서 `http://localhost:5510` → 아이디 `admin` + 설정한 `QA_PASSWORD` 로 로그인 → 프로젝트 등록 →
실행 탭에서 QA 실행. 진행상황이 실시간으로 흐르고 끝나면 통합 리포트가 표시되며,
발견 이슈는 **QA 리스트** 탭에서 구분·담당자·상태를 배정할 수 있습니다.
원본 리포트/스크린샷은 `reports/runs/{runId}/` 에 그대로 쌓입니다.

## 설정 (.env)

| 키 | 기본 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Agent SDK 인증. **`claude login` 세션이 있으면 비워둬도 됨**(세션 사용). 세션 없는 머신에서만 필수 |
| `QA_PASSWORD` | **(필수·기본값 없음)** | 슈퍼관리자 로그인 비밀번호. 미설정/공개기본값(`malgnqa`)이면 **폴백이 아니라 서버 미기동** |
| `QA_SESSION_SECRET` | **(필수·기본값 없음)** | 세션 쿠키 서명 시크릿(랜덤 32자↑). 미설정/공개기본값이면 서버 미기동 |
| `QA_PW_PEPPER` | **(필수·기본값 없음)** | 비밀번호 해시 전용 페퍼. 한번 정하면 변경 금지(변경 시 전 회원 비번 재설정) |
| `PORT` | 5510 | 서버 포트 |
| `QA_CONCURRENCY` | 3 | 페르소나 동시 실행 수 |
| `QA_MODEL` | sonnet | 페르소나/통합/생성 모델 |
| `QA_ENABLE_PLAYWRIGHT` | true | 실제 브라우저 구동 여부 |
| `QA_TEST_EMAIL` / `QA_TEST_PASSWORD` | — | 대상 로그인 자격증명 |

## 구조

```
webapp/
├── src/
│   ├── config.ts        경로·환경 설정
│   ├── auth.ts          비밀번호 전용 로그인 + 쿠키 세션
│   ├── agents.ts        .claude/agents/*.md 본문 로더 (재사용)
│   ├── llm.ts           페르소나·시나리오 LLM 생성 (Agent SDK)
│   ├── db.ts            node:sqlite 연결 + 스키마 + 마이그레이션·시드
│   ├── repo.ts          DB 적재·조회 (프로젝트/개발자/트리아지/인사이트)
│   ├── runStore.ts      활성 Run 이벤트·구독 (라이브 SSE용, 인메모리)
│   ├── orchestrator.ts  fan-out 페르소나 테스트 → 통합 분석 + DB 적재
│   └── server.ts        Express: JSON API + 정적 SPA 서빙 + 인증 게이트
├── public/                          정적 SPA (Vue 3 + ViewLogic Router)
│   ├── index.html                   엔트리 (CDN 로드 + 라우터 초기화)
│   ├── css/base.css                 커스텀 민트그린 테마 (Bootstrap 5.3.3 위)
│   └── src/
│       ├── views/                   라우트별 HTML 템플릿
│       │   ├── layout/default.html      ← 공통 GNB 레이아웃
│       │   └── {login,home,personas,projects,project-overview,
│       │         project-personas,project-scenarios,project-runs,
│       │         run-detail,project-qa,project-settings,settings}.html
│       └── logic/                   라우트별 Vue 컴포넌트 로직(.js, 뷰와 1:1)
├── data/qa.db           로컬 SQLite (gitignore, 자동 생성)
└── .env.example
```

## 데이터 모델 (data/qa.db)

| 테이블 | 핵심 컬럼 | 용도 |
|---|---|---|
| `projects` | id, name, base_url, platform, guards | QA 대상 서비스 |
| `developers` | id, name, email, active | 개발담당자 (이슈 배정 대상) |
| `runs` | id, **project_id**, scenario, status, launch_recommendation, summary | 실행 1건 |
| `persona_runs` | run_id, persona_id, age_band, digital_literacy, accessibility, completed/total | 페르소나별 결과(세그먼트 속성 비정규화) |
| `issues` | run_id, severity, type, title, evidence, confidence, **category, assignee_id, status** | 발견 이슈 + 트리아지 |

- **구분 코드(category)**: 문의 · 오류 · 기능개선 · 제안
- **상태(status)**: 열림 · 진행중 · 완료 · 보류
- 세그먼트 속성을 `persona_runs`/이슈 조회에 함께 두어 연령대·친숙도·접근성 집계가 SQL로 바로 됩니다.

## 현재 범위와 다음 단계

- ✅ 비밀번호 로그인 · 공통 GNB · 프로젝트 CRUD · 실행 · 통합 리포트 · **QA 리스트(구분·담당자·상태)** · 개발담당자 관리 · 세그먼트 통계
- 페르소나/시나리오 **LLM 생성**: 엔드포인트·UI 구현됨(생성 결과 미리보기/파일 저장). 페르소나의 **프로젝트별 영속 저장**은 다음 단계.
- 대상 설정은 baseUrl·guards 텍스트까지. `config/target.json` auth 절차 자동 주입은 다음 단계.
- D1 이전 시 `db.ts`/`repo.ts` 드라이버만 교체(스키마·SQL은 SQLite 호환).
