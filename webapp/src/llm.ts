import { query } from '@anthropic-ai/claude-agent-sdk'
import fs from 'node:fs'
import path from 'node:path'
import { PROJECT_ROOT, MODEL } from './config.js'
import { redactSecrets } from './redact.js'

async function complete(prompt: string): Promise<string> {
  let finalText = ''
  const options: any = { cwd: PROJECT_ROOT, model: MODEL, permissionMode: 'bypassPermissions', allowedTools: ['Read', 'Glob'] }
  for await (const msg of query({ prompt, options }) as any) {
    if (msg?.type === 'result') finalText = msg.result ?? finalText
  }
  return finalText
}

function extractJson(text: string): any | null {
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)]
  for (let i = fences.length - 1; i >= 0; i--) {
    try { return JSON.parse(fences[i][1].trim()) } catch { /* next */ }
  }
  const a = text.indexOf('['), b = text.lastIndexOf(']')
  if (a !== -1 && b > a) { try { return JSON.parse(text.slice(a, b + 1)) } catch { /* */ } }
  const o = text.indexOf('{'), p = text.lastIndexOf('}')
  if (o !== -1 && p > o) { try { return JSON.parse(text.slice(o, p + 1)) } catch { /* */ } }
  return null
}

// 페르소나 LLM 생성 — demographic-model.md 분포를 시스템 제약으로 주입
export async function generatePersonas(audience: string, count: number): Promise<any[]> {
  const prompt = [
    '당신은 QA 페르소나 설계자입니다. 한국 인구통계 기반 합성 테스트 페르소나를 생성합니다.',
    'personas/demographic-model.md 를 Read 로 읽고 그 분포(고령·저친숙·접근성 취약층 비중)를 반드시 유지하세요.',
    `대상 서비스의 타깃 고객층: ${audience || '(특이사항 없음 — 일반 대중)'}`,
    `생성 인원: ${count}명. id는 P01..P${String(count).padStart(2, '0')}.`,
    'personas/persona-seed.json 의 객체 스키마(id,name,age,ageBand,gender,region,city,occupation,digitalLiteracy,primaryDevice,accessibility,goals,personality,techBehavior,frustrationTriggers,quote)를 그대로 따르세요.',
    '출력은 페르소나 객체 배열 JSON 하나만 ```json 코드블록으로 출력하세요. 다른 텍스트 금지.',
  ].join('\n')
  const parsed = extractJson(await complete(prompt))
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.personas) ? parsed.personas : []
}

// 대화형 페르소나 생성 — 대화 히스토리를 받아 (대화응답, 현재 페르소나 초안 JSON)을 반환
export async function chatPersona(
  messages: { role: string; content: string }[],
): Promise<{ reply: string; persona: any | null }> {
  const transcript = messages.map((m) => `${m.role === 'user' ? '사용자' : '도우미'}: ${m.content}`).join('\n\n')
  const prompt = [
    '당신은 QA 페르소나 설계 도우미입니다. 사용자와 대화하며 한국 인구통계 기반 합성 테스트 페르소나 1명을 함께 완성합니다.',
    'personas/demographic-model.md 를 Read 로 읽고 그 분포(고령·저친숙·접근성 취약층 비중)와 속성 정의를 참고하세요.',
    'personas/persona-seed.json 의 객체 스키마를 그대로 따르세요: name, age, ageBand("10대"~"60대+"), gender("남"|"여"), region("수도권"|"비수도권"), city, occupation, digitalLiteracy("상"|"중"|"하"), primaryDevice("모바일"|"PC"|"둘다"), accessibility(["노안","저시력","색약"] 중 0개 이상), goals, personality, techBehavior, frustrationTriggers(문자열 배열), quote. id 는 넣지 마세요(자동 부여).',
    '사용자가 일부만 말해도 나머지는 인구통계적으로 자연스럽게 채워 일관된 1명을 구성하세요. age 와 ageBand 는 서로 모순되지 않게 하세요.',
    '',
    '응답 형식(반드시 지킬 것):',
    '1) 먼저 사용자에게 한국어로 1~3문장 대화 응답을 합니다(무엇을 반영했는지, 더 다듬을 부분이 있으면 질문).',
    '2) 이어서 지금까지의 페르소나 초안을 ```json 코드블록 "하나"로 출력합니다(객체 1개). 정보가 부족해도 현재까지의 초안을 항상 포함하세요.',
    '',
    '=== 지금까지의 대화 ===',
    transcript,
  ].filter(Boolean).join('\n')

  const text = await complete(prompt)
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  let persona: any | null = null
  let reply = text.trim()
  if (blocks.length) {
    const last = blocks[blocks.length - 1]
    try { persona = JSON.parse(last[1].trim()) } catch { persona = null }
    reply = (text.slice(0, last.index ?? 0) + text.slice((last.index ?? 0) + last[0].length)).trim()
  } else {
    persona = extractJson(text)
  }
  if (persona && Array.isArray(persona)) persona = persona[0] || null
  if (!reply) reply = '페르소나 초안을 업데이트했습니다.'
  return { reply, persona }
}

// 대화형 시나리오 작성 — 대화 히스토리를 받아 (대화응답, 현재 시나리오 초안)을 반환
export async function chatScenario(
  messages: { role: string; content: string }[],
  serviceContext?: string,
): Promise<{ reply: string; markdown: string | null }> {
  const transcript = messages.map((m) => `${m.role === 'user' ? '사용자' : '도우미'}: ${m.content}`).join('\n\n')
  const prompt = [
    '당신은 QA 통합테스트 시나리오 작성 도우미입니다. 사용자와 대화하며 시나리오를 함께 완성합니다.',
    'scenarios/_template.md 를 Read 로 읽고 그 양식을 따르세요. 태스크는 "사용자 목표" 중심으로 적고 구현 방법(어떤 버튼 클릭 등)은 지정하지 않습니다.',
    serviceContext ? `대상 서비스: ${serviceContext}` : '',
    '',
    '보안 규칙(반드시 지킬 것):',
    '- 사용자가 비밀번호/자격증명을 제공하더라도 시나리오 본문이나 대화 응답에 평문으로 절대 쓰지 마세요.',
    '- 시나리오에는 계정 ID·로그인 경로(URL)만 적고, 비밀번호 값 자리에는 치환자 ${ENV:QA_TEST_PASSWORD} 를 그대로 표기하세요(예: `password: ${ENV:QA_TEST_PASSWORD}`).',
    '- 이미 사용자가 평문 비번을 입력했다면 그 값을 절대 반복하지 말고 치환자로 바꿔 안내하세요(실제 비번은 .env 의 QA_TEST_PASSWORD 로 주입된다고 설명).',
    '',
    '응답 형식(반드시 지킬 것):',
    '1) 먼저 사용자에게 한국어로 1~3문장 대화 응답을 합니다(무엇을 반영했는지, 더 필요한 정보가 있으면 질문).',
    '2) 이어서 지금까지의 전체 시나리오 초안을 ```markdown 코드블록 "하나"로 출력합니다. 정보가 부족해도 현재까지의 초안을 항상 포함하세요.',
    '',
    '=== 지금까지의 대화 ===',
    transcript,
  ].filter(Boolean).join('\n')

  const text = await complete(prompt)
  const blocks = [...text.matchAll(/```(?:markdown|md)?\s*([\s\S]*?)```/gi)]
  let markdown: string | null = null
  let reply = text.trim()
  if (blocks.length) {
    const last = blocks[blocks.length - 1]
    markdown = last[1].trim()
    reply = (text.slice(0, last.index ?? 0) + text.slice((last.index ?? 0) + last[0].length)).trim()
  }
  if (!reply) reply = '시나리오 초안을 업데이트했습니다.'
  // 평문 비번 차단 — LLM 이 사용자 비번을 reply/markdown 에 그대로 반복할 수 있으므로
  // 반환 직전에 redact 한다(saveScenarioFile 의 최종 게이트와 멱등하게 중첩).
  reply = redactSecrets(reply).redacted
  if (markdown != null) markdown = redactSecrets(markdown).redacted
  return { reply, markdown }
}

// 마크다운을 시나리오 파일로 저장
export function saveScenarioFile(name: string, markdown: string): { file: string } {
  const slug = (name || 'scenario').trim().replace(/[^\w가-힣-]+/g, '-').toLowerCase() || 'scenario'
  const rel = `scenarios/${slug}.md`
  // 최종 저장 게이트 — 디스크(및 이후 클라우드 동기화)로는 redact 된 내용만 나간다.
  const safe = redactSecrets(markdown ?? '').redacted
  fs.writeFileSync(path.join(PROJECT_ROOT, rel), safe, 'utf8')
  return { file: rel }
}

// 기존 시나리오 파일 읽기 (scenarios/ 내부만)
export function readScenarioFile(rel: string): string {
  const abs = path.resolve(PROJECT_ROOT, rel)
  const root = path.join(PROJECT_ROOT, 'scenarios')
  if (!abs.startsWith(root) || !fs.existsSync(abs)) throw new Error('파일을 찾을 수 없습니다')
  return fs.readFileSync(abs, 'utf8')
}
