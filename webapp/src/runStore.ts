export type RunStatus = 'pending' | 'running' | 'synthesizing' | 'done' | 'error' | 'cancelled'

// 진행 중(중단 가능) 상태 판정 — UI/서버 공용 기준
export const ACTIVE_STATUSES: RunStatus[] = ['pending', 'running', 'synthesizing']
export const isActiveStatus = (s: string): boolean => (ACTIVE_STATUSES as string[]).includes(s)

export interface RunEvent {
  ts: number
  level: 'info' | 'phase' | 'persona' | 'error'
  message: string
  data?: any
}

export interface RunState {
  runId: string
  projectId?: number
  scenario: string
  baseUrl: string
  personaCount: number
  status: RunStatus
  events: RunEvent[]
  integratedReportPath?: string
  launchRecommendation?: string
  summary?: string
  error?: string
  startedAt: number
  subscribers: Set<(e: RunEvent) => void>
  aborted: boolean
  abortController: AbortController
}

const runs = new Map<string, RunState>()

export function createRun(init: Pick<RunState, 'runId' | 'scenario' | 'baseUrl' | 'personaCount'> & { projectId?: number }): RunState {
  const run: RunState = {
    ...init,
    status: 'pending',
    events: [],
    startedAt: Date.now(),
    subscribers: new Set(),
    aborted: false,
    abortController: new AbortController(),
  }
  runs.set(run.runId, run)
  return run
}

/** 실행 중단 신호 — 진행 중인 에이전트 query 를 취소하고 aborted 플래그를 세운다. */
export function abortRun(run: RunState): void {
  run.aborted = true
  run.status = 'cancelled'
  try { run.abortController.abort() } catch { /* 이미 abort 됐으면 무시 */ }
}

/** 메모리 맵에서 live run 제거(삭제 시) */
export function removeRun(id: string): void {
  runs.delete(id)
}

export function getRun(id: string): RunState | undefined {
  return runs.get(id)
}

export function listRuns(): RunState[] {
  return [...runs.values()].sort((a, b) => b.startedAt - a.startedAt)
}

export function pushEvent(run: RunState, e: Omit<RunEvent, 'ts'>): void {
  const event: RunEvent = { ts: Date.now(), ...e }
  run.events.push(event)
  for (const cb of run.subscribers) {
    try { cb(event) } catch { /* 구독자 오류는 무시 */ }
  }
}

export function subscribe(run: RunState, cb: (e: RunEvent) => void): () => void {
  run.subscribers.add(cb)
  return () => run.subscribers.delete(cb)
}

/** SSE/JSON 직렬화용 — 순환참조(subscribers) 제거 */
export function publicView(run: RunState) {
  const { subscribers, ...rest } = run
  return rest
}
