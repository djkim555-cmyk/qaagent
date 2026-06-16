# QA 클라우드 뷰어 — API 계약서 (ingest · sync · 조회)

| 항목 | 내용 |
|------|------|
| 문서 ID | 06_결과공유_클라우드뷰어_API계약서 |
| 작성자 | 강도윤 (테크리드, proj-techlead) |
| 지시자 | 운영자 (ai@malgnsoft.com) |
| 작성일 | 2026-06-16 |
| 버전 | v0.1 (Draft — 검토 요청) |
| 입력 문서 | 01_아키텍처_설계서 v0.2, 현행 `webapp/src/db.ts`·`server.ts` |
| 후속 작업자 | 오현우(backend, 동기화엔진·Worker), 정시우(frontend, 뷰어), 배준호(devops, D1/R2) |
| 상태 | 검토 요청 |

> 본 계약을 고정한 뒤 로컬 동기화기 ∥ Worker API ∥ 뷰어를 병렬 구현한다(사내 "API 계약 우선").

---

## 0. 범위 · 인증 표면 (3종)

| 표면 | 호출자 | 인증 | 용도 |
|---|---|---|---|
| **S1. Sync API** | 로컬 동기화기(서버-서버) | `Authorization: Bearer ${SYNC_TOKEN}` (wrangler secret) | A push / B push·pull |
| **S2. 뷰어 조회** | 브라우저(동료) | **Cloudflare Access**(이메일 허용목록) | 결과 읽기 |
| **S3. 뷰어 트리아지 쓰기** | 브라우저(동료) | Cloudflare Access — `Cf-Access-Authenticated-User-Email` 헤더로 신원 | 트리아지 편집 |

- S1은 Access 밖의 별도 경로(`/sync/*`)로 두고 토큰만으로 보호(머신 호출이라 Access 부적합).
- S2/S3는 Access 뒤. Worker는 Access가 주입하는 검증된 이메일 헤더를 신뢰해 `updated_by`로 사용.
- 비밀(`managers.password_hash`·env)은 **어떤 표면으로도 전송/노출하지 않는다.**

---

## 1. 엔티티 — 데이터 분류 (A/B)

현행 `db.ts` 스키마를 D1로 이식. 각 컬럼을 **A(실행·단방향 복제)** / **B(트리아지·양방향)** 로 표시.

### `projects`
`id`(PK, 로컬값 보존) · `name` · `base_url` · `platform` · `description` · `guards` · `manager_id` · **`hidden`(B)** · `created_at`. (B = `hidden` 만)

### `runs` — 전부 A
`id`(TEXT PK) · `project_id` · `scenario` · `base_url` · `persona_count` · `status` · `launch_recommendation` · `p1_count` · `summary` · `integrated_report_path`→**R2 키** · `error` · `started_at` · `finished_at`.

### `persona_runs` — 전부 A
`id` · `run_id` · `persona_id` · `persona_name` · `age_band` · `digital_literacy` · `primary_device` · `accessibility` · `completed` · `total` · `dropped_out` · `report_path`→**R2 키** · `one_line_summary`.

### `issues` — 본문 A + 트리아지 B
- **A(본문)**: `id`(PK, 로컬값 보존) · `run_id` · `persona_id` · `title` · `severity` · `type` · `task` · `symptom` · `repro` · `expected` · `actual` · `impact` · `suggestion` · `evidence`(스크린샷 R2 키 포함) · `confidence`.
- **B(트리아지)**: `category` · `assignee_id` · `status` · `memo`.

### 룩업/멤버십
- `developers`(B: 담당자 후보 목록) · `project_members`(B: 멤버십, 툼스톤 삭제) · `managers`(표시용 `id`·`name`·`contact`만, **password_hash 제외**).

### 동기화 메타 컬럼 (B 대상 행에 신규 추가 — 로컬·D1 양쪽)
| 컬럼 | 타입 | 의미 |
|---|---|---|
| `updated_at` | INTEGER(epoch ms) | 마지막 변경 시각. LWW 비교 기준 |
| `updated_by` | TEXT | 편집자(`이메일` \| `'local-admin'`) |
| `deleted` | INTEGER(0/1) | 툼스톤(물리삭제 대신) |

> **키 정책**: A행(projects·runs·issues…)은 **로컬에서만 생성**되므로 ingest 시 **로컬 PK를 그대로 보존**(D1은 복제본, 자체 채번 안 함). 따라서 트리아지는 동일 `issues.id`로 양쪽이 가리킨다.

---

## 2. Sync API (S1 — 로컬 동기화기 ↔ Worker)

공통: `Authorization: Bearer <SYNC_TOKEN>`, `Content-Type: application/json`. 모든 쓰기는 **멱등 upsert**.

### 2.1 `POST /sync/ingest/run` — A 데이터 push (run 1건)
run 종료 시 그 run과 하위 전체를 올린다. 파일은 §4(R2) 별도 업로드 후 키만 본문에 담는다.

요청:
```json
{
  "project": { "id": 3, "name": "구글 파트너 정산", "base_url": "https://...", "platform": "web",
               "description": "...", "manager_id": 2, "hidden": 0, "created_at": 1718500000000 },
  "run": { "id": "shopping-001", "project_id": 3, "scenario": "scenarios/example-shopping.md",
           "base_url": "https://...", "persona_count": 20, "status": "done",
           "launch_recommendation": "조건부 출시", "p1_count": 4, "summary": "...",
           "integrated_report_path": "runs/shopping-001/INTEGRATED-REPORT.md",
           "error": null, "started_at": 1718500000000, "finished_at": 1718503600000 },
  "persona_runs": [ { "id": 101, "run_id": "shopping-001", "persona_id": "P001", "persona_name": "김영희",
                      "age_band": "60대", "digital_literacy": "하", "primary_device": "mobile",
                      "accessibility": "저시력", "completed": 5, "total": 7, "dropped_out": 0,
                      "report_path": "runs/shopping-001/P01/report.md", "one_line_summary": "..." } ],
  "issues": [ { "id": 5001, "run_id": "shopping-001", "persona_id": "P001", "title": "결제 버튼 안 보임",
                "severity": "상", "type": "사용성", "task": "정산 자료 업로드", "symptom": "...",
                "repro": "1. ...\n2. ...", "expected": "...", "actual": "...", "impact": "...",
                "suggestion": "...", "evidence": "runs/shopping-001/P01/shots/checkout.png",
                "confidence": "확인", "category": "기능개선", "assignee_id": null, "status": "열림", "memo": null } ]
}
```
응답 `200`:
```json
{ "ok": true, "run_id": "shopping-001",
  "upserted": { "projects": 1, "runs": 1, "persona_runs": 20, "issues": 37 } }
```
규칙: 본문에 들어온 `issues`의 **B필드(category/assignee_id/status/memo)는 "초기값"으로만** 적용 — 이미 D1에 더 최신 `updated_at`이 있으면 §6 LWW로 덮어쓰지 않는다(클라우드 트리아지 보호).

### 2.2 `POST /sync/triage` — B 변경 push (로컬 → 클라우드)
로컬에서 `last_sync_at` 이후 바뀐 B행을 올린다.
```json
{ "since": 1718500000000,
  "issues":   [ { "id": 5001, "category": "오류", "assignee_id": 7, "status": "진행중", "memo": "재현됨",
                  "updated_at": 1718600000000, "updated_by": "local-admin", "deleted": 0 } ],
  "projects": [ { "id": 3, "hidden": 1, "updated_at": 1718600500000, "updated_by": "local-admin", "deleted": 0 } ],
  "project_members": [ { "project_id": 3, "member_id": 2, "updated_at": 1718600600000, "updated_by": "local-admin", "deleted": 0 } ],
  "developers": [ { "id": 7, "name": "정시우", "email": "front@x.com", "active": 1,
                    "updated_at": 1718600700000, "updated_by": "local-admin", "deleted": 0 } ] }
```
응답 `200`: 행별 LWW 적용 결과(채택/거절).
```json
{ "ok": true,
  "applied": { "issues": [5001], "projects": [3], "project_members": [], "developers": [7] },
  "rejected_stale": { "issues": [], "projects": [], "project_members": [ {"project_id":3,"member_id":2} ], "developers": [] } }
```
`rejected_stale` = D1에 더 최신 값이 있어 미적용(로컬이 다음 pull로 최신을 받게 됨).

### 2.3 `GET /sync/triage?since={epochMs}` — B 변경 pull (클라우드 → 로컬)
`updated_at > since` 인 B행(툼스톤 포함)을 돌려준다. 로컬이 LWW로 흡수.
```json
{ "now": 1718700000000,
  "issues":   [ { "id": 5002, "category": "제안", "assignee_id": null, "status": "완료", "memo": "QA확인",
                  "updated_at": 1718650000000, "updated_by": "chaewon@malgnsoft.com", "deleted": 0 } ],
  "projects": [], "project_members": [], "developers": [] }
```
- 페이지네이션: 응답이 크면 `next_since` 동봉, 클라이언트가 반복 호출.
- 로컬은 수신 후 자신의 `last_sync_at = now` 로 갱신(응답의 `now` 사용 — 서버시간 기준).

---

## 3. 뷰어 조회 API (S2 — 브라우저, Access 뒤)

현행 `server.ts` 라우트의 **읽기 부분 재사용**(경로 동일하게 맞춰 프론트 재활용). 모두 `deleted=0`·`hidden=0` 필터.

| 메서드·경로 | 응답 요약 |
|---|---|
| `GET /api/projects` | 접근 가능한 프로젝트 목록 |
| `GET /api/projects/:id/runs` | 프로젝트의 run 리스트(상태·출시권고·p1_count·요약) |
| `GET /api/runs/:id` | run 메타 + persona_runs 요약 |
| `GET /api/runs/:id/issues` | run의 이슈 목록(본문+트리아지+담당자명 조인) |
| `GET /api/issues/:id` | 이슈 상세(현상/재현/기대·실제/영향/제안 + evidence) |
| `GET /api/runs/:id/report` | 통합 리포트 마크다운(R2에서 fetch) |
| `GET /api/runs/:runId/shots/:persona/:file` | 스크린샷(R2 객체 스트림 또는 서명 URL) |
| `GET /api/developers` | 담당자 후보(트리아지 셀렉트용) |

응답 형태는 현행 `repo.ts` 반환과 동일 스키마 유지(프론트 변경 최소화).

---

## 4. 뷰어 트리아지 쓰기 API (S3 — 브라우저, Access 뒤)

### `PATCH /api/issues/:id/triage`
클라우드에서 트리아지 편집. Access 검증 이메일을 `updated_by`로 기록.
요청:
```json
{ "category": "오류", "assignee_id": 7, "status": "진행중", "memo": "재현 확인" }
```
서버 처리: 전달된 필드만 갱신 + `updated_at = Date.now()(D1 서버시간)`, `updated_by = <Access 이메일>`, `deleted=0`. (본문 A필드는 불변 — 거부)
응답 `200`: 갱신된 이슈(트리아지 포함). 이 변경은 다음 로컬 `GET /sync/triage`로 흡수된다.

> 프로젝트 숨김 등 다른 B쓰기가 필요하면 동일 패턴으로 `PATCH /api/projects/:id`(hidden) 추가. MVP는 이슈 트리아지만.

---

## 5. R2 객체 규약

- 키 네임스페이스: `runs/{runId}/...` (로컬 `reports/runs/{runId}/...` 와 1:1).
  - 통합 리포트: `runs/{runId}/INTEGRATED-REPORT.md`
  - 페르소나 리포트: `runs/{runId}/P01/report.md`
  - 스크린샷: `runs/{runId}/P01/shots/{file}.png`
- D1에는 **R2 키만** 저장(`integrated_report_path`·`report_path`·`issues.evidence`). 실체는 R2.
- 업로드: 로컬 동기화기가 ingest 직후(또는 직전) R2 PUT. 멱등(같은 키 덮어쓰기 안전).

---

## 6. 동기화 시맨틱 (LWW · 커서 · 멱등)

1. **커서**: 로컬에 `last_sync_at`(epoch ms) 1개 보관. 매 사이클: ① A push(미발행 run) → ② B push(`updated_at>last_sync_at` 로컬변경) → ③ B pull(`GET ?since=last_sync_at`) → ④ `last_sync_at = 응답 now`.
2. **LWW 규칙(행단위)**: 같은 키 두 버전 비교 → `updated_at` 큰 쪽 채택. 동률이면 **클라우드 우선**(항상 켜진 기준시계).
3. **툼스톤**: 삭제 = `deleted=1`+`updated_at` 갱신으로 전파. 물리삭제 금지. 영구정리는 보존정책(별도 배치)으로 양쪽 동시.
4. **멱등성**: 모든 upsert는 자연키(projects.id/runs.id/issues.id/(project_id,member_id)) 기준 → 재시도·중복 안전.
5. **시계 오차**: 클라우드 쓰기는 D1 `Date.now()`, 로컬 쓰기는 로컬시계. 트리아지 저빈도라 LWW 오차 영향 미미(최악=메모 1건 덮임, `updated_by`로 추적·복구).
6. **충돌 예시**: 같은 이슈 status를 로컬(09:00)·클라우드(09:05)에서 변경 → pull 시 09:05 채택, 로컬 09:00 폐기. push 단계에서 로컬은 `rejected_stale`로 통보받고 pull로 최신 흡수.

---

## 7. 상태 코드 · 에러

| 코드 | 상황 |
|---|---|
| 200 | 정상(부분 stale 거절 포함 — 본문에 표기) |
| 400 | 스키마 위반(필수 필드 누락·타입 오류) |
| 401 | Sync 토큰 무효(S1) / Access 미인증(S2·S3) |
| 403 | A필드 쓰기 시도 등 허용되지 않은 변경 |
| 404 | 대상 이슈/런 없음 |
| 409 | (예약) 향후 필드단위 머지 도입 시 충돌 표면화용 |
| 5xx | D1/R2 오류 → 로컬은 동일 커서로 재시도(멱등) |

---

## 8. 열린 항목

1. 토큰 분리: ingest/triage를 단일 `SYNC_TOKEN`으로 둘지, 2종으로 나눌지(권고: MVP 단일).
2. `GET /sync/triage` 페이지 크기·`next_since` 형식 확정.
3. 프로젝트별 세분 접근(이메일↔`project_members`)을 S2/S3 필터에 넣을지(설계서 §10-2와 연동).
4. 스크린샷 서빙: R2 스트림 프록시 vs 서명 URL(만료) — 보안·캐시 트레이드오프.

> 승인 시: 배준호 M1(D1/R2/Access) · 오현우 M2(동기화기+`/sync/*`) · 정시우 M3(뷰어+트리아지 UI) 병렬 착수. 검증 M4(신유진·차은성).
