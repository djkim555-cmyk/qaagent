# M1 — Cloudflare 셋업 가이드 (운영자 직접 수행)

| 항목 | 내용 |
|------|------|
| 문서 ID | 07_결과공유_클라우드뷰어_M1_Cloudflare셋업가이드 |
| 작성자 | 강도윤 (테크리드, proj-techlead) |
| 작성일 | 2026-06-16 |
| 버전 | v0.1 |
| 입력 문서 | 01_아키텍처 v0.2, 06_API계약서 v0.1, `cloud/` (Worker 골격) |
| 상태 | 운영자 실행 대기 |

> 이 단계는 **브라우저 로그인·계정 생성**이 필요해 AI가 대신할 수 없습니다. 아래를 순서대로 실행하세요.
> 명령은 모두 `cloud/` 폴더에서 실행합니다. 끝나면 §8 체크리스트로 검증합니다.

---

## 0. 사전 준비
- **Cloudflare 계정**(무료) — https://dash.cloudflare.com/sign-up
- Node 18+ (이미 있음). wrangler 는 `npx` 로 실행(전역설치 불필요).
- 터미널에서:
  ```bash
  cd "c:/workspace_DJ/1. general/QA_agent_team/cloud"
  npm install
  ```

## 1. 로그인
```bash
npx wrangler login
```
브라우저가 열리면 Cloudflare 계정으로 승인. (성공 시 터미널에 "Successfully logged in".)

## 2. D1 데이터베이스 생성
```bash
npx wrangler d1 create qa-viewer-db
```
출력에 나오는 `database_id = "xxxxxxxx-...."` 를 복사 → `cloud/wrangler.toml` 의
`database_id = "TODO_M1_에서_채움"` 자리에 붙여넣기.

## 3. 스키마 적용(원격 D1)
```bash
npx wrangler d1 migrations apply qa-viewer-db --remote
```
`migrations/0001_init.sql` 가 적용됨(테이블·인덱스 생성). 로컬 테스트용은 `--local`.

## 4. R2 버킷 생성(리포트·스크린샷)
```bash
npx wrangler r2 bucket create qa-viewer-assets
```
(이름은 `wrangler.toml` 의 `bucket_name` 과 동일해야 함.)

## 5. 동기화 토큰 발급 + 등록
로컬 동기화기와 Worker 가 공유할 비밀 토큰. 강한 랜덤값 생성:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
출력값을 안전히 보관하고, Worker 시크릿으로 등록:
```bash
npx wrangler secret put SYNC_TOKEN
# 프롬프트에 위 토큰 붙여넣기
```

## 6. 배포
```bash
npm run deploy
```
출력에 배포 URL(`https://qa-viewer.<계정>.workers.dev`)이 나옴 → 복사해 둠.
빠른 확인: 브라우저에서 `<URL>/health` → `{"ok":true}` 떠야 정상.

## 7. Cloudflare Access (이메일 허용목록) — 뷰어 보호
대시보드 → **Zero Trust → Access → Applications**.

1. **Add an application → Self-hosted**
   - Application name: `QA Viewer`
   - Application domain: 배포 URL 호스트(`qa-viewer.<계정>.workers.dev`)
   - Policy: **Allow** / 규칙 = `Emails` 에 공유할 동료 이메일들(또는 `Emails ending in @malgnsoft.com`).
   → 이걸로 `/api/*`(조회·트리아지)가 **허용된 이메일만** 접근.

2. **두 번째 애플리케이션으로 `/sync/*` 는 Access 제외**(머신 토큰이 보호하므로):
   - Add application → Self-hosted, 같은 호스트 + **Path = `/sync`** (및 `/sync/*`)
   - Policy: **Bypass** / `Everyone`.
   → 로컬 동기화기(브라우저 아님)가 Access 리다이렉트에 막히지 않게. 보안은 Worker 의 `SYNC_TOKEN` 이 담당.

> 핵심: **Access = 사람(`/api/*`) / 토큰 = 기계(`/sync/*`)**. 두 경로를 분리 보호.

## 8. 로컬 webapp 에 연결 → 동기화 켜기
`webapp/.env` 에 추가(값은 위에서 만든 것):
```ini
CLOUD_SYNC_URL=https://qa-viewer.<계정>.workers.dev
SYNC_TOKEN=<5단계에서 만든 토큰>
# SYNC_INTERVAL_MS=300000   # (선택) 5분마다 자동 동기화
```
webapp 재시작 → 부팅 로그에 `[sync] 활성 → https://qa-viewer...` 가 보이면 연결됨.

수동 1회 동기화(최고관리자 로그인 상태에서):
```bash
curl -X POST https://localhost:5510/api/sync/now -b <세션쿠키>
# 또는 화면에서 "지금 동기화"(차기 UI)
```

## 9. 검증 체크리스트
- [ ] `<URL>/health` → `{"ok":true}`
- [ ] Access 미인증 브라우저로 `<URL>/api/projects` → 로그인 화면(차단)
- [ ] 허용 이메일로 로그인 후 `<URL>/api/projects` → JSON 응답
- [ ] `<URL>/sync/triage?since=0` 를 토큰 없이 호출 → 401 (토큰 보호 확인)
- [ ] webapp `[sync] 활성` 로그
- [ ] `POST /api/sync/now` → `{ok:true}` 후, 클라우드 `/api/runs/:id/issues` 에 데이터 보임
- [ ] 클라우드에서 이슈 트리아지 변경 → webapp 동기화 후 로컬에도 반영(양방향 LWW)

## 10. 비용
D1(5GB·5M reads/day)·Workers(10만 req/day)·R2(10GB·egress 0)·Access(50인 이하 무료)
— 사내 QA 공유 규모는 **무료 티어 내**. 초과 지점만 모니터링.

---

> 막히는 단계가 있으면 그 명령의 출력 전문을 강도윤(proj-techlead)에게 주세요. 다음(R2 업로드 자동화·뷰어 화면)은 M3 에서 이어집니다.
