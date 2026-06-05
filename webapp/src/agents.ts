import fs from 'node:fs'
import path from 'node:path'
import { PROJECT_ROOT } from './config.js'

/**
 * Agent SDK 는 .claude/agents/*.md 를 자동 로드하지 않으므로, 기존 에이전트 정의의
 * 본문(프런트매터 제외)을 직접 읽어 프롬프트에 주입해 그대로 재사용한다.
 */
function stripFrontmatter(md: string): string {
  if (md.startsWith('---')) {
    const end = md.indexOf('\n---', 3)
    if (end !== -1) {
      const afterNewline = md.indexOf('\n', end + 1)
      return md.slice(afterNewline + 1).trim()
    }
  }
  return md.trim()
}

export function loadAgentBody(name: 'persona-tester' | 'qa-synthesizer'): string {
  const p = path.join(PROJECT_ROOT, '.claude', 'agents', `${name}.md`)
  return stripFrontmatter(fs.readFileSync(p, 'utf8'))
}
