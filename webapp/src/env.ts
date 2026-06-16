// .env 로더 — config.ts/auth.ts 가 import 시점에 process.env 를 읽으므로
// 그보다 먼저 평가되어야 한다. 따라서 server.ts 의 *첫 번째* import 로 둔다.
// Node 20.12+ 내장 process.loadEnvFile 사용(외부 의존성 없음).
// 경로는 cwd 가 아니라 이 모듈(../ = webapp 루트) 기준으로 해석해 어디서 실행해도 동일하게 로드.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))
try {
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath)
    console.log(`[env] .env 로드됨: ${envPath}`)
  } else {
    console.log('[env] .env 파일 없음 — 시스템 환경변수/기본값 사용')
  }
} catch (e) {
  // 손상된 .env 라도 서버는 뜨게 하되, 기본값으로 떨어졌음을 분명히 알린다.
  console.error(`[env] .env 로드 실패 — 기본값으로 진행: ${(e as Error).message}`)
}
