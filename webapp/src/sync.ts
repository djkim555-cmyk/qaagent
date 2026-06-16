// 클라우드 동기화기(로컬 측) — 06_API계약서 구현. M2(로컬).
//
// 안전장치: CLOUD_SYNC_URL + SYNC_TOKEN 이 모두 설정됐을 때만 동작한다.
// 미설정이면 isEnabled()=false 로 모든 함수가 즉시 no-op → 로컬 앱 동작에 영향 없음.
// (클라우드(D1/Worker) 구축 = M1/M2-cloud 완료 후 .env 에 두 값을 넣으면 활성화된다.)
//
// 데이터 분할(설계서 §2):
//   A 실행데이터(runs·persona_runs·issues 본문) = 로컬→클라우드 단방향 push
//   B 트리아지(issues 트리아지·projects.hidden) = 양방향(push + pull, 행단위 LWW)
//   C 비밀 = 미동기화
import * as repo from './repo.js'

const BASE = (process.env.CLOUD_SYNC_URL || '').replace(/\/$/, '')
const TOKEN = process.env.SYNC_TOKEN || ''
// 동기화 주기(ms). 0 또는 미설정이면 주기 폴링 비활성(이벤트/수동만).
const INTERVAL = Number(process.env.SYNC_INTERVAL_MS) || 0

export const isEnabled = (): boolean => Boolean(BASE && TOKEN)

export function status() {
  return { enabled: isEnabled(), base: BASE || null, interval_ms: INTERVAL, last_sync_at: repo.getLastSyncAt() }
}

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init?.headers || {}) },
  })
  if (!res.ok) throw new Error(`sync ${path} → HTTP ${res.status}`)
  return res.status === 204 ? null : res.json()
}

// ── A push: 아직 발행되지 않은 완료 run 들을 올린다 (POST /sync/ingest/run) ──
// 주의: 리포트/스크린샷의 R2 업로드는 M1/M2-cloud(R2 자격) 단계에서 추가한다.
//        지금은 메타(파일 경로=R2 키)만 전송한다. [TODO: R2 PUT]
export async function pushRun(runId: string): Promise<boolean> {
  if (!isEnabled()) return false
  const bundle = repo.getRunBundle(runId)
  if (!bundle) return false
  await api('/sync/ingest/run', { method: 'POST', body: JSON.stringify(bundle) })
  repo.markRunPublished(runId)
  return true
}

async function pushUnpublishedRuns(): Promise<number> {
  let count = 0
  for (const id of repo.listDoneRunIds()) {
    if (repo.isRunPublished(id)) continue
    try { if (await pushRun(id)) count++ } catch (e) { console.error(`[sync] pushRun(${id}) 실패:`, (e as Error).message) }
  }
  return count
}

// ── B push: since 이후 로컬 트리아지 변경을 올린다 (POST /sync/triage) ──
export async function pushTriage(since: number): Promise<any> {
  if (!isEnabled()) return null
  const delta = repo.triageChangedSince(since)
  if (!delta.issues.length && !delta.projects.length) return { applied: {}, rejected_stale: {} }
  return api('/sync/triage', { method: 'POST', body: JSON.stringify({ since, ...delta }) })
}

// ── B pull: 클라우드 트리아지 변경을 받아 LWW 로 흡수, 커서 갱신 (GET /sync/triage?since=) ──
export async function pullTriage(since: number): Promise<{ now: number; applied: any } | null> {
  if (!isEnabled()) return null
  const data = await api(`/sync/triage?since=${since}`)
  const result = repo.applyTriagePull({ issues: data.issues, projects: data.projects })
  return { now: Number(data.now), applied: result.applied }
}

// ── 1 사이클: A push → B push → B pull → 커서=서버 now (§6) ──
let running = false
export async function syncCycle(): Promise<{ ok: boolean; reason?: string }> {
  if (!isEnabled()) return { ok: false, reason: 'disabled' }
  if (running) return { ok: false, reason: 'busy' }
  running = true
  try {
    const since = repo.getLastSyncAt()
    await pushUnpublishedRuns()
    await pushTriage(since)
    const pulled = await pullTriage(since)
    if (pulled) repo.setLastSyncAt(pulled.now)
    return { ok: true }
  } catch (e) {
    console.error('[sync] 사이클 실패(다음 주기 재시도):', (e as Error).message)
    return { ok: false, reason: (e as Error).message }
  } finally {
    running = false
  }
}

// run 종료 후 훅(오케스트레이터에서 호출). 비활성이면 조용히 통과.
export async function maybeSyncAfterRun(runId: string): Promise<void> {
  if (!isEnabled()) return
  try { await pushRun(runId); await syncCycle() } catch (e) { console.error('[sync] afterRun 실패:', (e as Error).message) }
}

// 주기 폴링 시작(서버 부팅 시 1회). 비활성이거나 INTERVAL=0 이면 시작 안 함.
let timer: ReturnType<typeof setInterval> | null = null
export function startSyncLoop(): void {
  if (!isEnabled()) { console.log('[sync] 비활성(CLOUD_SYNC_URL/SYNC_TOKEN 미설정) — 로컬 전용 동작'); return }
  console.log(`[sync] 활성 → ${BASE} (interval ${INTERVAL || '이벤트/수동'}ms)`)
  if (INTERVAL > 0 && !timer) timer = setInterval(() => { void syncCycle() }, INTERVAL)
}
