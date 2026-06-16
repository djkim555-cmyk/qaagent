# QA 클라우드 뷰어 (cloud/)

QA 결과를 **24/7·무료 티어**로 공유하는 Cloudflare Worker. 로컬 `webapp` 이 SoT,
이쪽은 **읽기 복제 + 트리아지 양방향 동기화**(LWW). 설계: `../docs/결과공유_클라우드뷰어/`.

- 스택: **Hono on Workers + D1(조회 복제·트리아지 원장) + R2(리포트·스크린샷)**
- 인증: `/sync/*` = `SYNC_TOKEN`(머신) · `/api/*` = **Cloudflare Access**(이메일=편집자)
- 구현 계약: `../docs/결과공유_클라우드뷰어/06_API계약서.md`

> 상태: **골격(M2-cloud)** — 배포 전. D1/R2/Access 생성(M1)은 `../docs/결과공유_클라우드뷰어/07_M1_Cloudflare셋업가이드.md` 참조.

## 디렉터리
```
cloud/
├── wrangler.toml            # D1/R2 바인딩·vars (M1에서 database_id 채움)
├── migrations/0001_init.sql # D1 스키마(webapp/src/db.ts 이식, A/B + 동기화 메타)
├── src/index.ts             # Hono: /sync/ingest/run · /sync/triage(GET·POST) · 조회 · PATCH triage
└── package.json
```

## 로컬 개발(Cloudflare 계정 있을 때)
```bash
npm install
npm run migrate:local                 # 로컬 D1 에 스키마 적용
echo 'SYNC_TOKEN="dev-token"' > .dev.vars
# wrangler.toml 의 DEV_ALLOW_NO_ACCESS 를 "true" 로 두면 Access 없이 조회 가능(개발 한정)
npm run dev                           # http://localhost:8787
```

## 배포(M1 완료 후)
```bash
npm run migrate:remote
npx wrangler secret put SYNC_TOKEN
npm run deploy
```
배포 후 로컬 `webapp/.env` 에:
```ini
CLOUD_SYNC_URL=https://qa-viewer.<계정>.workers.dev
SYNC_TOKEN=<위와 동일한 토큰>
# SYNC_INTERVAL_MS=300000   # (선택) 주기 동기화
```
→ webapp 재시작하면 `[sync] 활성` 로그와 함께 실행 결과·트리아지가 동기화된다.

## 엔드포인트 요약 (06_API계약서)
| 메서드 | 경로 | 표면 | 용도 |
|---|---|---|---|
| POST | `/sync/ingest/run` | S1 | A 데이터(run+하위) upsert |
| POST | `/sync/triage` | S1 | B 변경 push(LWW) |
| GET | `/sync/triage?since=` | S1 | B 변경 pull |
| GET | `/api/projects` · `/api/projects/:id/runs` · `/api/runs/:id` · `/api/runs/:id/issues` · `/api/issues/:id` · `/api/developers` | S2 | 조회 |
| GET | `/api/assets/*` | S2 | R2 리포트·스크린샷 |
| PATCH | `/api/issues/:id/triage` | S3 | 클라우드 트리아지 편집 |

> 미구현(차기): 뷰어 프론트(화면), 프로젝트별 세분 접근(이메일↔project_members), R2 업로드 자동화, 보존정책 배치.
