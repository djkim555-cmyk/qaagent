export const meta = {
  name: 'persona-qa',
  description: '한국 인구통계 페르소나 N명이 통합테스트 시나리오를 하이브리드(실제 브라우저+페르소나 해석)로 테스트하고, 중복 병합·랭킹·세그먼트 분석을 거쳐 통합 QA 리포트를 생성',
  phases: [
    { title: '페르소나 테스트', detail: '페르소나별 병렬 사용성 테스트 (각자 개별 리포트 저장)' },
    { title: '통합 분석', detail: '중복 병합 · 빈도×심각도 랭킹 · 세그먼트 인사이트 · 출시 권고' },
  ],
}

// ── 입력 (Workflow 호출 시 args 로 전달; 없으면 기본값) ──
// args 예: { scenario: "scenarios/example-shopping.md", personaCount: 20, runId: "shopping-001", config: "config/target.json" }
const scenario = (args && args.scenario) || 'scenarios/example-shopping.md'
const personaCount = (args && args.personaCount) || 20
const runId = (args && args.runId) || 'run-manual'
const configPath = (args && args.config) || 'config/target.json'

// ── 페르소나 ID 목록 (P01..PNN) ──
const ids = Array.from({ length: personaCount }, (_, i) => 'P' + String(i + 1).padStart(2, '0'))

// ── 개별 페르소나 결과 스키마 ──
const PERSONA_RESULT = {
  type: 'object',
  required: ['personaId', 'completed', 'total', 'issues', 'reportPath', 'oneLineSummary'],
  properties: {
    personaId: { type: 'string' },
    completed: { type: 'integer', description: '성공한 태스크 수' },
    total: { type: 'integer', description: '전체 태스크 수' },
    droppedOut: { type: 'boolean', description: '중도 이탈 여부' },
    reportPath: { type: 'string', description: '저장된 개별 리포트 경로' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'severity', 'type', 'confidence'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['Blocker', 'Major', 'Minor', 'Nitpick'] },
          type: { type: 'string', enum: ['기능버그', '사용성', '접근성', '콘텐츠', '성능', '신뢰UX'] },
          task: { type: 'string', description: '어느 태스크/화면' },
          // 구조화 본문 — reports/_individual-template.md "발견 이슈" 블록과 1:1 대응
          symptom: { type: 'string', description: '무슨 일이 있었나(현상) — 페르소나 관점 서술' },
          repro: { type: 'array', items: { type: 'string' }, description: '재현 단계(단계별 문자열)' },
          expected: { type: 'string', description: '기대 동작' },
          actual: { type: 'string', description: '실제 동작' },
          impact: { type: 'string', description: '왜 이 페르소나에게 특히 문제인가' },
          suggestion: { type: 'string', description: '사용자 관점 개선 제안(선택)' },
          evidence: { type: 'string', description: '스크린샷 경로/콘솔로그 등. 없으면 빈 문자열' },
          confidence: { type: 'string', enum: ['확인됨', '추정'] },
        },
      },
    },
    oneLineSummary: { type: 'string' },
  },
}

const SYNTH_RESULT = {
  type: 'object',
  required: ['integratedReportPath', 'launchRecommendation', 'p1Count', 'summary'],
  properties: {
    integratedReportPath: { type: 'string' },
    launchRecommendation: { type: 'string', enum: ['🟢 출시가능', '🟡 조건부', '🔴 보류'] },
    p1Count: { type: 'integer' },
    summary: { type: 'string', description: '경영 요약 3~5문장' },
  },
}

// ── Phase 1: 페르소나별 병렬 테스트 ──
phase('페르소나 테스트')

const results = (await parallel(
  ids.map((pid) => () =>
    agent(
      [
        `당신은 페르소나 ${pid} 입니다.`,
        `1) personas/persona-seed.json 에서 id가 "${pid}" 인 객체를 읽어 그 사람이 되세요. 그 사람의 나이·디지털 친숙도·기기·접근성·성향·인내심대로 행동합니다.`,
        `2) 시나리오 ${scenario} 와 대상 설정 ${configPath} 를 읽으세요. config.guards 의 금지영역/금지행위는 절대 수행하지 않습니다.`,
        `3) 하이브리드 방식으로 테스트하세요: 브라우저 자동화 도구(Playwright MCP 등)가 있으면 실제로 조작·스크린샷·콘솔에러 수집. 없으면 인지적 워크스루로 진행하되 기능 판단은 모두 [추정] 표기.`,
        `4) 페르소나의 뷰포트(모바일/PC)에 맞춰 테스트하고, 시나리오의 각 태스크를 "이 사람이라면 어떻게 길을 찾을까" 관점으로 수행하세요.`,
        `5) reports/_individual-template.md 형식으로 개별 리포트를 reports/runs/${runId}/${pid}/report.md 에 저장하세요. 스크린샷도 같은 폴더에 저장.`,
        `6) 모든 이슈에는 증거를 동반하고, 증거 없는 판단은 confidence="추정" 으로 표기. 코드/서버는 수정하지 않습니다.`,
        `완료 후 구조화 요약을 반환하세요.`,
      ].join('\n'),
      { label: `test:${pid}`, phase: '페르소나 테스트', agentType: 'persona-tester', schema: PERSONA_RESULT }
    )
  )
)).filter(Boolean)

log(`페르소나 테스트 완료: ${results.length}/${personaCount}명 · 총 이슈 ${results.reduce((n, r) => n + (r.issues ? r.issues.length : 0), 0)}건`)

// ── Phase 2: 통합 분석 (모든 개별 리포트를 종합) ──
phase('통합 분석')

const synthesis = await agent(
  [
    `${results.length}명의 페르소나 개별 QA 리포트가 reports/runs/${runId}/P*/report.md 에 저장되어 있습니다.`,
    `시나리오: ${scenario}. 페르소나 속성: personas/persona-seed.json.`,
    `개별 결과 구조화 요약(JSON): ${JSON.stringify(results)}`,
    `작업: 1) 같은 근본원인 이슈를 병합하고 영향 인원 수를 집계, 2) 빈도×심각도로 랭킹, 3) 세그먼트(연령/친숙도/기기/접근성) 인사이트 도출, 4) 증거 있는 이슈만 본문 우선순위에 올리고 [추정]·미검증은 부록으로 분리, 5) 출시 권고(🟢/🟡/🔴).`,
    `reports/_integrated-template.md 형식으로 reports/runs/${runId}/INTEGRATED-REPORT.md 를 작성하세요.`,
  ].join('\n'),
  { label: 'synthesize', phase: '통합 분석', agentType: 'qa-synthesizer', schema: SYNTH_RESULT }
)

log(`통합 리포트 생성: ${synthesis ? synthesis.integratedReportPath : '실패'} · 출시권고 ${synthesis ? synthesis.launchRecommendation : '-'}`)

return {
  runId,
  scenario,
  personaTested: results.length,
  individualReports: results.map((r) => r.reportPath),
  integrated: synthesis,
}
