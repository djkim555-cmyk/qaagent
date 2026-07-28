# MCP 원격 접속 — 배포·롤백 런북 (운영자용)

| 항목 | 내용 |
|------|------|
| 문서 ID | 10_MCP_배포_롤백_런북 |
| 대상 | 운영자(우리) |
| 대상 Worker | `qa-viewer` · D1 `qa-viewer-db` (`c49bfbeb-2581-46af-8080-a0646ab6e2de`) |
| 성격 | **비가역 요소 포함**(D1 마이그레이션·프로덕션 배포) — 백업·승인 전제 |
| 개발자 배포물 | [09_MCP_원격접속_개발자가이드.md](09_MCP_원격접속_개발자가이드.md) |

---

## 0. 이 변경의 성격

**완전 가산(additive)** 입니다. 신규 테이블 1개(`mcp_tokens`) + 신규 라우트 `/mcp` 만 추가하고,
`runs·issues·projects·managers·project_members` 스키마와 `/sync/*` 는 건드리지 않습니다.
따라서 표준의 "하위호환 마이그레이션 → 코드 배포 → 백필 → 파괴적 마무리" 중
**백필·파괴적 마무리 단계가 없습니다.** 롤백은 `DROP TABLE mcp_tokens` 한 줄로 끝납니다.

`/sync/*` 가 파괴적으로 지우는 대상은 지금도 정확히 2개뿐입니다(배포 전 재확인 명령):
```bash
grep -n "DELETE FROM\|DROP \|TRUNCATE" cloud/src/*.ts
# 기대: persona_runs(run 단위 교체) · project_members(멤버십 전량 교체) — 2건. 3건째가 나오면 리뷰.
```
`mcp_tokens` 는 FK 를 선언하지 않아(의도) 이 파괴적 동기화에 휩쓸리지 않습니다.

---

## 1. 배포 순서 (전부 `cloud/` 에서)

| # | 단계 | 명령 | 정상 판정 |
|---|---|---|---|
| 0-1 | 계정·버전 | `npx wrangler whoami` / `npx wrangler --version` | 계정 일치 · 3.114.x |
| 0-2 | 마이그레이션 상태 | `npx wrangler d1 migrations list qa-viewer-db --remote` | `0003_mcp_tokens.sql` 만 pending |
| 0-3 | **백업(비가역 게이트)** | `npx wrangler d1 export qa-viewer-db --remote --output "c:/tmp/qa-viewer-db-<날짜>.sql"` | 파일 생성 + `CREATE TABLE issues` 포함 |
| 0-4 | 시점복원 좌표 | `npx wrangler d1 time-travel info qa-viewer-db` | bookmark 를 아래 기록란에 적음 |
| 0-5 | 로컬 리허설 | `npm run migrate:local` → `npx wrangler dev --port 8788` → §2 스모크 | 전건 통과 |
| 1 | **원격 마이그레이션** | `npm run migrate:remote` | `0003` Executed · 이어서 pending 0 |
| 1-검증 | 테이블 확인 | `npx wrangler d1 execute qa-viewer-db --remote --command "SELECT COUNT(*) n FROM mcp_tokens"` | `n = 0` |
| 2 | **시크릿 먼저** | `npx wrangler secret put MCP_TOKEN_SECRET` → `npx wrangler secret list` | 목록에 이름 등장(값 미표시) |
| 3 | **코드 배포** | `npm run deploy` | Version ID 를 기록란에 적음(롤백 좌표) |
| 3-검증 | 스모크 | §2 전체 | 전건 통과 |
| 4 | 토큰 발급 | 뷰어 `MCP 토큰` 화면 | 목록에 1행 |
| 5 | Access 확인 | Zero Trust → Access → Applications | 이 호스트를 덮는 앱이 있으면 `/mcp` 에 **Bypass** 정책 추가 |

> **2를 3보다 먼저** 하는 이유: 시크릿 없이 배포되면 `MCP_TOKEN_SECRET` 이 undefined 가 되어
> `/mcp` 가 전건 401(fail-closed)로 동작합니다. 데이터가 새지는 않지만 "왜 안 되지" 로 시간을 버립니다.

### 기록란 (배포 때 채울 것)
- 백업 파일: `________________`
- time-travel bookmark: `________________`
- 배포 전 Version ID(롤백용): `________________`
- 배포 후 Version ID: `________________`

---

## 2. 스모크 (로그인 게이트에서 멈추지 않고 안쪽 데이터까지)

```bash
BASE="https://qa-viewer.djkim555.workers.dev"     # 로컬 리허설은 http://127.0.0.1:8788
# $SYNC_TOKEN, $QA_MCP_TOKEN 은 셸에 미리 export (명령줄에 값 직접 타이핑 금지)
```

| # | 확인 | 기대 |
|---|---|---|
| 1 | `curl -s $BASE/health` | `{"ok":true}` |
| 2 | `curl -o /dev/null -w "%{http_code}" $BASE/api/projects` | `401` (fail-closed) |
| 3 | `curl -i -s $BASE/mcp \| head -1` | **`405`** — `302`/HTML 이면 캐치올·Access 문제 |
| 4 | `curl -o /dev/null -w "%{http_code}" -X POST $BASE/mcp -d '{}'` | `401` + `WWW-Authenticate: Bearer` |
| 5 | **회귀** `curl -H "Authorization: Bearer $SYNC_TOKEN" "$BASE/sync/triage?since=0"` | `{"now":…}` — 실패면 **즉시 롤백** |
| 6 | `SYNC_TOKEN` 을 `/mcp` 에 제시 | `401` (표면 혼용 차단) |
| 7 | PAT 을 `/sync/triage` 에 제시 | `401` (역방향 차단) |
| 8 | initialize (아래 A) | `200` + `protocolVersion` + `serverInfo` |
| 9 | tools/list (아래 B) | `200` + 툴 6종 |
| 10 | **tools/call — 안쪽 데이터** (아래 C) | `200` + 실제 프로젝트 행이 담긴 content |
| 11 | **격리** 권한 밖 `project_id`/`run_id`/`issue_id` 직접 지정 | 전건 "찾을 수 없습니다" |
| 12 | 폐기 후 재시도 | `401` (즉시) |
| 13 | sync 무해성 | 동기화 1주기 전후 `SELECT COUNT(*) FROM mcp_tokens` 동일 |
| 14 | 실클라이언트 | 개발자 PC `claude mcp list` → `/mcp` | `connected` |

```bash
# A. initialize
curl -s -X POST "$BASE/mcp" -H "Authorization: Bearer $QA_MCP_TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'

# B. tools/list
curl -s -X POST "$BASE/mcp" -H "Authorization: Bearer $QA_MCP_TOKEN" \
  -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# C. 안쪽 데이터까지
curl -s -X POST "$BASE/mcp" -H "Authorization: Bearer $QA_MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"qa_projects_list","arguments":{}}}'
```
관찰: `npx wrangler tail qa-viewer --format pretty` (401 사유 확인 + **토큰 평문이 로그에 없는지**도 이때 검증)

---

## 3. 롤백

| 대상 | 방법 | 데이터 영향 |
|---|---|---|
| 코드 | `npx wrangler deployments list` → `npx wrangler rollback <이전 Version ID>` | 없음(즉시) |
| **긴급 킬스위치** | `npx wrangler secret delete MCP_TOKEN_SECRET` | 발급된 PAT 전량 즉시 무효(웹 뷰어는 정상) |
| 마이그레이션(권장) | `--remote --command "DROP TABLE mcp_tokens"` (+ 재적용하려면 `DELETE FROM d1_migrations WHERE name='0003_mcp_tokens.sql'`) | 없음(가산·무참조 테이블) |
| time-travel 복원 | `npx wrangler d1 time-travel restore …` | **그 사이 sync 로 들어온 실행·트리아지 유실 → 사실상 금지.** 위 DROP 으로 해결할 것 |

---

## 4. 운영 절차

**토큰 발급**: 원칙은 **회원 본인이** 뷰어에 로그인해 발급(우리 손을 거치지 않으므로 전달 사고가 없음).
슈퍼관리자가 대행 발급할 수 있으나, **슈퍼 본인 소유 토큰은 발급할 수 없습니다**(코드로 차단 —
전 프로젝트를 읽는 자격이 개발자 PC에 평문으로 사는 것을 막기 위함).

**폐기**: 뷰어 `MCP 토큰` 화면의 폐기 버튼(즉시 유효). 수동:
```bash
npx wrangler d1 execute qa-viewer-db --remote --command "UPDATE mcp_tokens SET revoked_at=unixepoch()*1000 WHERE id=<ID>"
```
전량 폐기(사고 시): `... WHERE revoked_at IS NULL` + `wrangler secret put MCP_TOKEN_SECRET`(새 값).

**인원 이탈**: 로컬 웹앱에서 매칭 해제 → 다음 sync(≤60초)에 조회 0건. 계정을 비활성/승인철회하면
그 토큰은 **다음 요청에서 자동 폐기**됩니다. 그래도 명시적 폐기를 함께 수행하세요.

**정기 점검(분기 1회)**: 발급 토큰 목록 ↔ 재직자 대조, `last_used_at` 이 90일 이상 없는 토큰 폐기.

---

## 5. 미포함(후속 백로그)

| 항목 | 왜 이번에 빠졌나 | 후속 |
|---|---|---|
| **레이트리밋** | KV/DO 바인딩 또는 Cloudflare Rate Limiting Rules 설정이 필요 — 코드 배포와 별개 축 | 대시보드 Rate Limiting Rules 로 `/mcp`·`/auth/login` 에 IP 기준 제한 |
| `/sync/members` sanity 가드 | 멤버십 급감·빈 payload 거부 로직 — sync 파이프라인 변경이라 별도 라운드 | `/sync` 표면 강화 라운드에서 |
| R2 자산(스크린샷·리포트) MCP 제공 | R2 자체가 미활성 | R2 활성화 후 `qa_report_get` 툴 추가 |
| 웹 `/api/*` 의 403 → 404 통일 | 사용자에게 보이는 안내 문구를 보존하려고 `/mcp` 에만 적용 | 열거 위험이 커지면 재검토 |
