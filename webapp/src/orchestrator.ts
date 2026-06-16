import fs from 'node:fs'
import path from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { PROJECT_ROOT, CONCURRENCY, MODEL, ENABLE_PLAYWRIGHT } from './config.js'
import { loadAgentBody } from './agents.js'
import { RunState, pushEvent } from './runStore.js'
import * as repo from './repo.js'

// ── 단순 동시성 풀 (limit 개 워커가 큐를 소비) ──
async function pool<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= items.length) break
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// ── 에이전트 1회 실행 → 최종 텍스트 반환 ──
async function runAgent(prompt: string, abortController?: AbortController, onText?: (t: string) => void): Promise<string> {
  const options: any = {
    cwd: PROJECT_ROOT,
    model: MODEL,
    permissionMode: 'bypassPermissions', // 내부 도구 · 헤드리스. guards 는 프롬프트로 강제.
    allowedTools: ['Read', 'Write', 'Glob', 'Grep', 'Bash', 'mcp__playwright__*'],
  }
  if (abortController) options.abortController = abortController // 중단 신호 전파(query 취소)
  if (ENABLE_PLAYWRIGHT) {
    options.mcpServers = { playwright: { command: 'npx', args: ['@playwright/mcp@latest'] } }
  }

  let finalText = ''
  for await (const msg of query({ prompt, options }) as any) {
    if (msg?.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block?.type === 'text' && block.text) onText?.(block.text)
      }
    } else if (msg?.type === 'result') {
      finalText = msg.result ?? finalText
    }
  }
  return finalText
}

// ── 에이전트 응답 끝의 JSON 추출 (네이티브 schema 미지원 대체) ──
function extractJson(text: string): any | null {
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)]
  for (let i = fences.length - 1; i >= 0; i--) {
    try { return JSON.parse(fences[i][1].trim()) } catch { /* 다음 후보 */ }
  }
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)) } catch { /* 실패 */ }
  }
  return null
}

function loadPersonas(run: RunState): any[] {
  // 1) 프로젝트에 배정된 페르소나(인력풀에서 추출/추가) 우선
  if (run.projectId != null) {
    const assigned = repo.listProjectPersonas(run.projectId)
    if (assigned.length) return assigned.slice(0, run.personaCount)
  }
  // 2) 폴백: 기본 시드 파일(500인 → 없으면 20인)
  const seed500 = path.join(PROJECT_ROOT, 'personas', 'persona-seed-500.json')
  const file = fs.existsSync(seed500) ? seed500 : path.join(PROJECT_ROOT, 'personas', 'persona-seed.json')
  const seed = JSON.parse(fs.readFileSync(file, 'utf8'))
  return seed.personas.slice(0, run.personaCount)
}

function personaPrompt(testerBody: string, persona: any, run: RunState): string {
  return [
    `당신은 페르소나 ${persona.id} (${persona.name}) 입니다. 아래 행동 지침에 따라 "그 사람 자체"로서 대상 서비스를 사용하세요.`,
    '',
    '=== 행동 지침 (persona-tester) ===',
    testerBody,
    '',
    '=== 이번 실행 정보 ===',
    `- 페르소나 속성:\n${JSON.stringify(persona, null, 2)}`,
    `- 대상 서비스 baseUrl: ${run.baseUrl}`,
    `- 시나리오 파일: ${run.scenario} (Read 도구로 읽고 각 태스크를 수행)`,
    `- 출력 리포트: reports/runs/${run.runId}/${persona.id}/report.md (reports/_individual-template.md 형식으로 Write)`,
    `- 스크린샷: reports/runs/${run.runId}/${persona.id}/ 폴더에 shot-01.png 등으로 저장`,
    ENABLE_PLAYWRIGHT
      ? '- 브라우저 자동화(mcp__playwright__*)가 연결돼 있습니다. 반드시 실제로 조작·스크린샷·콘솔에러를 수집하세요.'
      : '- 브라우저 자동화 도구가 없습니다. 인지적 워크스루로 진행하고 모든 기능 판단을 [추정]으로 표기하세요.',
    "- 페르소나 기기에 맞는 뷰포트로 테스트(모바일 390×844 / PC 1440×900). primaryDevice가 '둘다'면 모바일 우선.",
    '- 코드/서버는 절대 수정하지 않습니다. 금지행위(실결제 최종승인, 실발송, 데이터 영구삭제 등)는 수행하지 않습니다.',
    '- 자격증명은 로그/리포트에 출력하지 않습니다.',
    '',
    '=== 출력 요구 ===',
    '리포트 파일 저장 후, 메시지 맨 마지막에 아래 JSON을 ```json 코드블록으로만 출력하세요(다른 텍스트 없이):',
    '```json',
    JSON.stringify(
      {
        personaId: persona.id,
        completed: 0,
        total: 0,
        droppedOut: false,
        reportPath: `reports/runs/${run.runId}/${persona.id}/report.md`,
        issues: [
          {
            title: '',
            severity: 'Major',
            type: '사용성',
            task: '',
            symptom: '무슨 일이 있었나 — 페르소나 관점의 현상 서술',
            repro: ['재현 1단계', '재현 2단계'],
            expected: '기대 동작',
            actual: '실제 동작',
            impact: '왜 이 페르소나에게 특히 문제인가',
            suggestion: '사용자 관점 개선 제안(없으면 빈 문자열)',
            evidence: 'shot-XX.png · 콘솔: ...',
            confidence: '확인됨',
          },
        ],
        successes: [
          {
            task: '문제 없이 완료한 태스크(시나리오 태스크명)',
            summary: '어떻게 무리 없이 끝냈는지 한 줄 요약',
            evidence: '(선택) shot-XX.png',
            confidence: '확인됨',
          },
        ],
        oneLineSummary: '',
      },
      null,
      2,
    ),
    '```',
    'severity ∈ {Blocker,Major,Minor,Nitpick}, type ∈ {기능버그,사용성,접근성,콘텐츠,성능,신뢰UX}, confidence ∈ {확인됨,추정}.',
    'symptom/repro/expected/actual/impact 는 reports/_individual-template.md 의 "발견 이슈" 블록과 1:1로 대응한다(현상·재현단계·기대·실제·페르소나 영향). repro 는 단계 문자열 배열. 증거 없는 판단은 confidence="추정". suggestion 은 선택(있을 때만).',
    'successes: 이슈 없이 정상 완료한 태스크를 빠짐없이 배열로 적는다(통과 기록 — 리스트에 "성공"으로 표시됨). 완료한 태스크가 없으면 빈 배열.',
    '스크린샷 규칙: 화면이 바뀔 때마다 무분별하게 찍지 말고, (1) 오류·실패·막힘이 발생한 바로 그 화면을 우선 캡처하고, (2) 이슈의 evidence 에는 그 오류 화면 파일명(예: shot-03.png)을 반드시 적는다. 상세 화면은 evidence 에 적힌 캡처만 "오류 화면"으로 노출한다. 정상 태스크는 캡처가 선택사항이다.',
  ].join('\n')
}

function synthPrompt(synthBody: string, run: RunState, results: any[]): string {
  return [
    '당신은 수석 QA 분석가입니다. 아래 행동 지침에 따라 통합 QA 리포트를 작성하세요.',
    '',
    '=== 행동 지침 (qa-synthesizer) ===',
    synthBody,
    '',
    '=== 이번 실행 정보 ===',
    `- runId: ${run.runId}`,
    `- 시나리오: ${run.scenario}`,
    `- 개별 리포트 위치: reports/runs/${run.runId}/P*/report.md (Glob/Read로 읽으세요)`,
    `- 페르소나 속성: personas/persona-seed.json`,
    `- 개별 결과 구조화 요약(JSON):\n${JSON.stringify(results)}`,
    `- 통합 리포트 저장: reports/runs/${run.runId}/INTEGRATED-REPORT.md (reports/_integrated-template.md 형식)`,
    '',
    '=== 출력 요구 ===',
    '통합 리포트 저장 후, 맨 마지막에 아래 JSON을 ```json 코드블록으로만 출력하세요:',
    '```json',
    JSON.stringify(
      {
        integratedReportPath: `reports/runs/${run.runId}/INTEGRATED-REPORT.md`,
        launchRecommendation: '🟡 조건부',
        p1Count: 0,
        // summary 는 정확히 2줄(가운데 \n 1개): 1줄 건수 'P1 (N건)' 형식, 2줄 친절한 출시 문구.
        summary: '통합 완료 · P1 (2건) · P2 (3건) · P3 (5건)\nP1의 2가지만 고치면 출시할 수 있어요. (주소(URL) 검증 누락 + 필수 항목 빈칸 저장)',
      },
      null,
      2,
    ),
    '```',
  ].join('\n')
}

/** Run 1건 실행 — fire-and-forget. 진행상황은 pushEvent 로 스트리밍된다. */
export async function startRun(run: RunState): Promise<void> {
  try {
    run.status = 'running'
    repo.setStatus(run.runId, 'running')
    const personas = loadPersonas(run)
    const testerBody = loadAgentBody('persona-tester')
    pushEvent(run, { level: 'phase', message: `페르소나 테스트 시작 — ${personas.length}명, 동시 ${CONCURRENCY}명${ENABLE_PLAYWRIGHT ? ' (실제 브라우저)' : ' (시뮬레이션)'}` })

    const results = await pool(personas, CONCURRENCY, async (persona) => {
      if (run.aborted) throw new Error('aborted')   // 중단 시 남은 페르소나는 시작하지 않음
      pushEvent(run, { level: 'persona', message: `▶ ${persona.id} ${persona.name} (${persona.ageBand}/친숙도 ${persona.digitalLiteracy}) 시작` })
      const text = await runAgent(personaPrompt(testerBody, persona, run), run.abortController)
      const parsed = extractJson(text) ?? {
        personaId: persona.id,
        completed: 0,
        total: 0,
        issues: [],
        oneLineSummary: '(구조화 요약 파싱 실패 — report.md 확인 필요)',
        reportPath: `reports/runs/${run.runId}/${persona.id}/report.md`,
      }
      if (run.aborted) throw new Error('aborted')   // 중단됐으면 삭제 대상 — 결과를 DB에 다시 쓰지 않음
      const issueCount = Array.isArray(parsed.issues) ? parsed.issues.length : 0
      try {
        repo.savePersonaResult(run.runId, persona, parsed)
      } catch (e: any) {
        pushEvent(run, { level: 'error', message: `${persona.id} DB 저장 실패: ${e?.message || e}` })
      }
      pushEvent(run, { level: 'persona', message: `✓ ${persona.id} 완료 — 이슈 ${issueCount}건 · ${parsed.oneLineSummary ?? ''}`, data: parsed })
      return parsed
    })

    if (run.aborted) throw new Error('aborted')   // 통합 분석 전 중단 확인
    run.status = 'synthesizing'
    repo.setStatus(run.runId, 'synthesizing')
    const totalIssues = results.reduce((n, r) => n + (Array.isArray(r.issues) ? r.issues.length : 0), 0)
    pushEvent(run, { level: 'phase', message: `통합 분석 시작 — 개별 ${results.length}건 · 총 이슈 ${totalIssues}건` })

    const synthBody = loadAgentBody('qa-synthesizer')
    const synthText = await runAgent(synthPrompt(synthBody, run, results), run.abortController)
    const synth = extractJson(synthText) ?? {}

    run.integratedReportPath = synth.integratedReportPath || `reports/runs/${run.runId}/INTEGRATED-REPORT.md`
    run.launchRecommendation = synth.launchRecommendation
    run.summary = synth.summary
    run.status = 'done'
    repo.finishRun(run.runId, {
      status: 'done',
      launchRecommendation: synth.launchRecommendation,
      p1Count: synth.p1Count,
      summary: synth.summary,
      integratedReportPath: run.integratedReportPath,
      finishedAt: Date.now(),
    })
    pushEvent(run, { level: 'phase', message: `통합 완료 — 출시권고 ${synth.launchRecommendation ?? '-'}` })
  } catch (e: any) {
    // 사용자가 중단한 경우: '없는 것으로 처리' — DB 상태를 error 로 남기지 않는다
    // (cancel 핸들러가 run 행과 산출물을 삭제한다). 진행 이벤트만 정리한다.
    if (run.aborted) {
      run.status = 'cancelled'
      pushEvent(run, { level: 'phase', message: '실행이 중단되었습니다 — 이 실행은 삭제됩니다.' })
      return
    }
    run.status = 'error'
    run.error = e?.message || String(e)
    try {
      repo.finishRun(run.runId, { status: 'error', error: run.error, finishedAt: Date.now() })
    } catch { /* DB 기록 실패는 무시 */ }
    pushEvent(run, { level: 'error', message: `실행 오류: ${run.error}` })
  }
}
