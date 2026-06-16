# QA 에이전트팀

이 저장소는 **페르소나 기반 QA 에이전트 시스템**입니다. 통합테스트 시나리오를 입력하면,
한국 인구통계 기반 페르소나들이 각자 실사용자로서 대상 서비스를 테스트하고 하나의
**통합 QA 리포트**를 산출합니다. 사람이 하던 사용성/유저 테스트(User Test)를 AI 에이전트로
대체하는 것이 목표입니다.

> 전체 사용법·실행 절차는 [README.md](README.md) 가 1차 기준 문서입니다. 이 파일은 작업 시
> 지켜야 할 규칙과 구조 요약입니다.

## 동작 방식 (3단계 파이프라인)

```
[입력] 통합테스트 시나리오 + 대상 서비스(URL/스테이징)
   │
   ▼ ① 페르소나 로드 (personas/persona-seed.json — 인구통계 분포 반영 20인)
   ▼ ② 페르소나별 병렬 테스트 (persona-tester N명)
   │     하이브리드 = 실제 브라우저 구동(Playwright MCP) + 페르소나 관점 해석
   │     → reports/runs/{runId}/P01..PNN/report.md (+스크린샷)
   ▼ ③ 통합 분석 (qa-synthesizer 1명)
         중복 병합 · 빈도×심각도 랭킹 · 세그먼트 인사이트 · 출시 권고
         → reports/runs/{runId}/INTEGRATED-REPORT.md
```

## 기술 스택

- **프레임워크**: Vue 3 (CDN)
- **라우터**: ViewLogic Router 1.4.0 (파일 기반 라우팅)
- **CSS**: Tailwind CSS (CDN, `?plugins=forms`) + Lucide 아이콘 — `StyleGuide/` 디자인 시스템 준수
- **폰트**: DM Sans + Pretendard(한글 폴백), 숫자는 `tabular-nums`
- **빌드**: 없음 (정적 파일 서빙)

## 디자인 시스템 / 스타일 가이드 (모든 페이지 필수 준수)

**기존 페이지와 앞으로 만드는 모든 페이지는 `StyleGuide/` 의 스타일 가이드를 따른다.**
기준 문서: `StyleGuide/맑은 노티 관리자/design_handoff_customer_detail/스타일 가이드.html`

핵심 토큰 (임의값 만들지 말고 토큰 안에서 조합):

- **색상**: Primary = blue `#2B7FFF` (액션·링크·선택), 중립 = Slate(표면·텍스트·보더).
  상태색(success emerald / warning amber / error red / info sky)·채널 강조색은 의미 있을 때만.
- **타이포**: DM Sans + Pretendard, 전역 자간 -1%, 제목 `tracking-tight`. 본문 14px(text-sm) 기준,
  14px 미만 본문·44px 미만 터치 타깃 금지. 수치는 `tabular-nums`.
- **스페이싱**: 4px 그리드. 카드 내부 20px(p-5), 페이지 패딩 24px, 컬럼 갭 20px.
- **반경**: 기본 6px(rounded-md). 보더는 `border` 대신 `ring-1 ring-inset ring-slate-200`(입력 300, 포커스 `ring-2 ring-primary-500`).
- **엘리베이션**: 표면은 평평하게(ring), 그림자는 떠 있는 요소만(shadow-sm 호버 · shadow-lg 팝오버 · shadow-2xl 모달).
- **아이콘**: Lucide, 선 굵기 1.75, 버튼 내 14·16px.
- **컨트롤 높이**: 28~36px (xs24/sm28/md32/lg36/xl40). 화면당 solid 주 액션은 1개로 제한.

> Tailwind config(primary 팔레트)와 공용 컴포넌트 클래스(`.card`/`.btn-*`/`.badge` 등)는 각 진입 HTML 의
> `<style type="text/tailwindcss">` 에 인라인 정의한다(Tailwind CDN JIT 는 외부 CSS 를 처리하지 않음).
> 자세한 Do/Don't 는 위 스타일 가이드 HTML 참조.

## 프로젝트 구조

```
QA 에이전트팀/
├── README.md                       # 사용법·실행 절차 (1차 기준 문서)
├── index.html                      # 테스트 대상 앱: "구글 파트너 정산" (Vue 3 + Bootstrap 단일 파일)
├── personas/
│   ├── persona-seed.json           # 기본 페르소나 20인 (한국 인구통계 분포)
│   └── demographic-model.md        # 분포 기준·속성 스키마·인원 확장 가이드
├── scenarios/
│   ├── _template.md                # 통합테스트 시나리오 입력 표준 양식
│   └── example-shopping.md         # 작성 예시(쇼핑몰)
├── config/
│   └── target.example.json         # 대상 서비스·로그인/스테이징 인증 설정 양식
├── reports/
│   ├── _individual-template.md     # 개별 페르소나 리포트 양식
│   ├── _integrated-template.md     # 통합 QA 리포트 양식
│   └── runs/{runId}/               # 실행 결과 (gitignore — 생성 후)
├── docs/                           # 보조 문서 (선택)
├── rules/                          # 추가 규칙 문서 (선택)
├── data/                           # 정적/참조 데이터 (선택)
└── .claude/
    ├── agents/qa-lead.md           # 팀 오케스트레이터 (사전점검·단계전환·보고)
    ├── agents/scenario-planner.md  # 시나리오 기획 서브에이전트 (파이프라인 앞단)
    ├── agents/persona-tester.md    # 페르소나 1명 테스트 서브에이전트
    ├── agents/a11y-specialist.md   # 접근성(WCAG) 전담 점검 서브에이전트
    ├── agents/evidence-auditor.md  # 증거 검수(신뢰성 게이트) 서브에이전트
    ├── agents/qa-synthesizer.md    # 통합 분석 서브에이전트
    ├── commands/run-qa.md          # 전체 실행 커맨드 (/run-qa)
    └── workflows/persona-qa.js     # N인 병렬 fan-out 워크플로우
```

## 핵심 규칙 (QA 에이전트 작업 시)

1. **코드/서버를 수정하지 않는다.** 이 시스템은 외부 서비스를 *테스트만* 한다. 페르소나는
   사용자일 뿐 관찰·보고만 한다. (단, 리포트 파일 작성은 허용)
2. **모든 이슈는 증거를 동반한다.** 스크린샷/콘솔로그/재현단계 없이 단정하지 말 것.
   증거 없는 판단은 `[추정]` 으로 표기한다. (환각 방지 — 사람 QA 대체의 핵심)
3. **config.guards 의 금지영역·금지행위를 절대 수행하지 않는다.** (실결제 최종승인,
   실발송, 데이터 영구삭제 등 비가역 행위 금지)
4. **자격증명을 로그·리포트에 출력하지 않는다.** 비밀번호는 환경변수(`${ENV:VAR}`)로 주입한다.
5. **페르소나를 일관되게 연기한다.** 친숙도 '하' 페르소나가 개발자처럼 행동하면 안 된다.
   그 사람의 인내심·습관·약점대로 행동한다.
6. **인구통계 분포를 유지한다.** 페르소나 추가·재생성 시 `demographic-model.md` 의 분포
   (고령·저친숙·접근성 비중)를 깨지 않는다.
7. **신뢰성 게이트.** 통합 시 증거 있는 이슈만 본문 우선순위에 올리고, 미검증·단일보고·추정은
   부록으로 분리한다. "20명 중 N명" 처럼 빈도·집단을 명시해 과장을 막는다.

## 실행

```
# A. 커맨드 (소규모/대화형)
/run-qa scenarios/example-shopping.md

# B. 워크플로우 (N인 병렬 — 멀티에이전트, 비용 큼 → 명시적 요청 시에만)
"persona-qa 워크플로우를 scenario=scenarios/example-shopping.md, runId=shopping-001 로 돌려줘"
```

내부적으로 워크플로우는 `args = { scenario, personaCount, runId, config }` 로 실행된다.

## 준비 (최초 1회)

1. **브라우저 자동화 도구 연결** (하이브리드 실제 구동에 필요):
   ```bash
   claude mcp add playwright -- npx @playwright/mcp@latest
   ```
   없으면 인지적 워크스루(시뮬레이션) 모드로만 동작하며, 기능 판단은 모두 `[추정]` 표기.
2. **대상 서비스 설정**: `config/target.example.json` → `config/target.json` 으로 복사 후 작성.
   비밀번호는 파일에 직접 쓰지 말고 환경변수로 주입.
   ```powershell
   $env:QA_TEST_EMAIL="qa@example.com"; $env:QA_TEST_PASSWORD="..."
   ```
3. **시나리오 작성**: `scenarios/_template.md` 를 복사해 `scenarios/<서비스명>.md` 작성.
   태스크는 "사용자 목표" 중심으로 적고 구현 방법은 지정하지 않는다.

> `config/target.json`, `config/.auth/`, `reports/runs/` 는 `.gitignore` 처리됨(자격증명·결과 보호).

## 테스트 대상 앱: index.html (구글 파트너 정산)

저장소 루트의 `index.html` 은 시냅스엠의 구글 파트너 정산 서비스를 위한 **Vue 3 + Bootstrap 5
단일 파일 앱**이다 (빌드 없음, 정적 서빙). 파트너 정산 비율·할당 기준·월별 서빙피 단가·월별
정산 기초 자료(CSV 업로드) 등을 관리한다. QA 에이전트의 테스트 대상이 될 수 있다.

```bash
python -m http.server 8000   # 또는 VS Code Live Server (포트 5502)
```

## 한계 (정직하게)

- 순수 시뮬레이션 모드(브라우저 미연결)는 실제 기능버그를 잡지 못함 — 사용성/UX 점검용.
- 깊은 기능 정확성·보안·부하는 별도 자동화 테스트와 병행하는 것이 좋다.
- 페르소나는 실제 사용자 표본이 아니라 인구통계 기반 합성 표본이다(보정은
  `demographic-model.md` 참조).
