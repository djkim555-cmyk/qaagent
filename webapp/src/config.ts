import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))

/** webapp/ 디렉터리 */
export const WEBAPP_ROOT = path.resolve(here, '..')
/** 저장소 루트 (personas/, scenarios/, reports/, .claude/ 가 있는 곳) */
export const PROJECT_ROOT = path.resolve(WEBAPP_ROOT, '..')

export const PORT = Number(process.env.PORT) || 5510
export const CONCURRENCY = Math.max(1, Number(process.env.QA_CONCURRENCY) || 3)
export const MODEL = process.env.QA_MODEL || 'sonnet'
export const ENABLE_PLAYWRIGHT = (process.env.QA_ENABLE_PLAYWRIGHT ?? 'true') !== 'false'

/**
 * Agent SDK 인증 가용성 판정.
 * - apikey : ANTHROPIC_API_KEY 환경변수 사용
 * - session: 이 머신에 Claude 로그인 세션(~/.claude/.credentials.json)이 있음 → 키 없이 동작
 * - none   : 둘 다 없음 → 실행/생성 실패
 * 키가 없어도 로그인 세션만 있으면 QA 실행·페르소나 생성이 됩니다.
 */
export function authStatus(): { ok: boolean; mode: 'apikey' | 'session' | 'none' } {
  if (process.env.ANTHROPIC_API_KEY) return { ok: true, mode: 'apikey' }
  const cred = path.join(os.homedir(), '.claude', '.credentials.json')
  if (fs.existsSync(cred)) return { ok: true, mode: 'session' }
  return { ok: false, mode: 'none' }
}
