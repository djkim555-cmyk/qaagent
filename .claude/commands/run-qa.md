---
description: 페르소나 기반 사용자 테스트를 실행해 통합 QA 리포트를 생성합니다
argument-hint: <시나리오파일 경로> [페르소나수]
---

# 페르소나 기반 QA 테스트 실행

입력으로 받은 통합테스트 시나리오를 한국 인구통계 기반 페르소나들이 수행하고,
하나의 통합 QA 리포트를 산출한다.

## 인자
- `$1` = 시나리오 파일 경로 (예: `scenarios/example-shopping.md`). 없으면 `scenarios/` 에서 후보를 보여주고 사용자에게 물어본다.
- `$2` = 페르소나 수 (기본 20). `personas/persona-seed.json` 앞에서 N명 사용.

## 사전 점검
1. `config/target.json` 이 있는지 확인. 없으면 `config/target.example.json` 을 복사·작성하도록 안내하고 중단.
2. 브라우저 자동화 도구(Playwright MCP 등) 연결 여부 확인.
   - 연결됨 → 하이브리드(실제 구동) 모드.
   - 없음 → 인지적 워크스루 모드로 진행하되, 실제 구동이 아니라는 점과 설치 방법(`claude mcp add playwright -- npx @playwright/mcp@latest`)을 사용자에게 먼저 고지하고 진행 여부를 확인.
3. `config.auth.required` 가 true면 자격증명(환경변수 또는 storageState) 준비 상태를 확인.
4. `config.guards` 의 금지영역·금지행위를 모든 페르소나 테스터에게 전달한다.

## 실행 절차
1. **runId 생성**: 사용자에게 받은 타임스탬프 또는 `시나리오명-NNN` 형태. 출력 폴더 `reports/runs/{runId}/` 생성.
2. **페르소나 로드**: `persona-seed.json` 에서 앞 N명.
3. **페르소나별 테스트**: 각 페르소나에 대해 `persona-tester` 서브에이전트를 실행한다.
   - 대량(N≥5) 병렬 실행이 필요하면 **`persona-qa` 워크플로우 사용을 권장**한다 (아래 참조).
   - 소규모면 Agent 도구로 직접 `persona-tester` 를 병렬 호출.
   - 각 테스터에 persona/scenario/config/출력경로를 전달.
4. **통합**: 모든 개별 리포트가 모이면 `qa-synthesizer` 서브에이전트를 1회 실행해
   `reports/runs/{runId}/INTEGRATED-REPORT.md` 를 생성.
5. **요약 보고**: 통합 리포트의 경영 요약과 P1 이슈, 출시 권고를 사용자에게 제시하고 파일 경로를 링크한다.

## 멀티에이전트(워크플로우) 안내
20명을 효율적으로 병렬 실행하려면 멀티에이전트 오케스트레이션이 적합하다.
이는 비용이 큰 작업이므로 **사용자가 명시적으로 동의할 때만** 워크플로우를 실행한다.
사용자가 "워크플로우로 돌려줘" 라고 하면 `.claude/workflows/persona-qa.js` 를 Workflow 도구로 실행한다.

## 주의
- 절대 코드를 수정하지 않는다(이 시스템은 외부 서비스를 테스트할 뿐이다).
- 자격증명을 로그·리포트에 출력하지 않는다.
- 실결제·실발송·영구삭제 등 비가역 행위를 수행하지 않는다.
