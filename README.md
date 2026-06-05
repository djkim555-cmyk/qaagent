# 페르소나 기반 QA 에이전트

통합테스트 시나리오를 입력하면, **한국 인구통계 기반 페르소나 20명**(확장 가능)이 각자
사용자로서 서비스를 테스트하고, 하나의 **통합 QA 리포트**를 산출하는 시스템입니다.
사람이 하던 사용성/유저 테스트(User Test)를 AI 에이전트로 대체하는 것이 목표입니다.

## 동작 방식 (3단계 파이프라인)

```
[입력] 통합테스트 시나리오 + 대상 서비스(URL/스테이징)
   │
   ▼  ① 페르소나 로드 (personas/persona-seed.json — 인구통계 분포 반영 20인)
   │
   ▼  ② 페르소나별 테스트 (persona-tester 20명 병렬)
   │      하이브리드 = 실제 브라우저 구동(Playwright MCP) + 페르소나 관점 해석
   │      → reports/runs/{runId}/P01..P20/report.md (+스크린샷)
   │
   ▼  ③ 통합 분석 (qa-synthesizer 1명)
          중복 병합 · 빈도×심각도 랭킹 · 세그먼트 인사이트 · 출시 권고
          → reports/runs/{runId}/INTEGRATED-REPORT.md
```

## 폴더 구조

| 경로 | 내용 |
|------|------|
| `personas/persona-seed.json` | 기본 페르소나 20인 (한국 인구통계 분포) |
| `personas/demographic-model.md` | 분포 기준·속성 스키마·인원 확장 가이드 |
| `scenarios/_template.md` | 통합테스트 시나리오 입력 표준 양식 |
| `scenarios/example-shopping.md` | 작성 예시(쇼핑몰) |
| `config/target.example.json` | 대상 서비스·로그인/스테이징 인증 설정 양식 |
| `reports/_individual-template.md` | 개별 페르소나 리포트 양식 |
| `reports/_integrated-template.md` | 통합 QA 리포트 양식 |
| `.claude/agents/persona-tester.md` | 페르소나 1명 테스트 서브에이전트 |
| `.claude/agents/qa-synthesizer.md` | 통합 분석 서브에이전트 |
| `.claude/commands/run-qa.md` | 전체 실행 커맨드 (`/run-qa`) |
| `.claude/workflows/persona-qa.js` | 20인 병렬 fan-out 워크플로우 |

## 준비 (최초 1회)

1. **브라우저 자동화 도구 연결** (하이브리드 실제 구동에 필요):
   ```bash
   claude mcp add playwright -- npx @playwright/mcp@latest
   ```
   없으면 인지적 워크스루(시뮬레이션) 모드로만 동작합니다.

2. **대상 서비스 설정**: `config/target.example.json` → `config/target.json` 으로 복사 후 작성.
   - `baseUrl`, 뷰포트, `auth`(로그인 절차/스테이징), `guards`(금지영역) 채우기.
   - **비밀번호는 파일에 직접 쓰지 말고 환경변수로**:
     ```bash
     # PowerShell
     $env:QA_TEST_EMAIL="qa@example.com"; $env:QA_TEST_PASSWORD="..."
     ```
   - `config/target.json`, `config/.auth/`, `reports/runs/` 는 `.gitignore` 처리됨(자격증명·결과 보호).

3. **시나리오 작성**: `scenarios/_template.md` 를 복사해 `scenarios/<서비스명>.md` 작성.

## 실행

### A. 커맨드로 (소규모/대화형)
```
/run-qa scenarios/example-shopping.md
```

### B. 워크플로우로 (20인 병렬 — 권장, 멀티에이전트)
대량 병렬은 멀티에이전트 오케스트레이션이 효율적입니다. **비용이 크므로 명시적으로 요청하세요.**
클로드코드에게 이렇게 말하면 됩니다:
> "persona-qa 워크플로우를 scenario=scenarios/example-shopping.md, runId=shopping-001 로 돌려줘"

내부적으로 `args = { scenario, personaCount: 20, runId, config }` 로 실행됩니다.

## 신뢰성 설계 (사람 QA 대체의 핵심)

AI 페르소나가 **없는 버그를 지어내거나 진짜 버그를 놓치는 것**을 막기 위해:

- **증거 강제**: 모든 이슈는 스크린샷/콘솔로그/재현단계 동반. 없으면 `[추정]` 표기.
- **실제 구동 우선**: 하이브리드로 진짜 브라우저를 조작해 실제 결함을 확인.
- **신뢰성 게이트**: 통합 시 증거 있는 이슈만 본문 우선순위에 올리고, 미검증·단일보고·추정은 부록으로 분리.
- **세그먼트 투명성**: "20명 중 N명", "친숙도 하 전원" 처럼 빈도·집단을 명시해 과장 방지.

## 인원 확장

`personas/demographic-model.md` 의 분포를 유지하며 `persona-seed.json` 에 P21~ 추가.
워크플로우는 `personaCount` 만 늘리면 자동으로 그만큼 fan-out 합니다.

## 한계 (정직하게)

- 순수 시뮬레이션 모드(브라우저 미연결)는 실제 기능버그를 잡지 못합니다 — 사용성/UX 점검용.
- 깊은 기능 정확성·보안·부하는 별도 자동화 테스트와 병행하는 것이 좋습니다.
- 페르소나는 실제 사용자 표본이 아니라 인구통계 기반 합성 표본입니다(보정은 demographic-model.md 참조).
