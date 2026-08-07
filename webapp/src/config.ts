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
 * 포팅 재현성 SoT = webapp/package.json 의 "qaAgentTeam" 블록.
 * 버전을 코드에 두 번 적지 않는다(설치 스크립트도 같은 필드를 읽어 .mcp.json 을 만든다).
 * package.json 을 못 읽는 예외 상황에도 서버가 죽지 않게 최소 폴백만 둔다.
 */
type QaMeta = { nodeMajorMin?: number; playwrightMcpSpec?: string; playwrightForBrowsers?: string }
function readQaMeta(): QaMeta {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(WEBAPP_ROOT, 'package.json'), 'utf8'))
    return (pkg?.qaAgentTeam ?? {}) as QaMeta
  } catch {
    return {}
  }
}
const QA_META = readQaMeta()

/** Playwright MCP 실행 스펙(핀 고정). QA_PLAYWRIGHT_MCP 환경변수로 덮어쓸 수 있다. */
export const PLAYWRIGHT_MCP_SPEC =
  process.env.QA_PLAYWRIGHT_MCP || QA_META.playwrightMcpSpec || '@playwright/mcp@0.0.78'
/** 최소 Node 메이저 버전(설치·진단 스크립트와 동일 기준). */
export const NODE_MAJOR_MIN = Number(QA_META.nodeMajorMin) || 24
/** 브라우저 설치에 쓰는 playwright 버전(MCP 핀이 의존하는 버전 — 빌드번호 불일치 방지). */
export const PLAYWRIGHT_FOR_BROWSERS = QA_META.playwrightForBrowsers || ''

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
