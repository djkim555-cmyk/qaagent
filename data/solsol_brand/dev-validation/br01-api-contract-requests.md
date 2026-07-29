# BR01 — brand-api 미비 계약 요청서 (스파이크 W6)

> **작성**: 2026-07-10 (KST) · 바탕(api-developer) · 읽기 전용 분석 산출물(코드 무수정·미배포)
> **배경**: 브랜드 사용자단 스파이크(`solsol-brand`, W1~W4)가 실 연동 중 brand-api 계약 부재로
> **MOCK 배지** 처리한 5개 지점을 정식 구현 이관용 계약 스펙으로 확정한다.
> **출처**: 착수계획 [`docs/architecture/BRAND_FRONT_SPIKE_PLAN.md`](../architecture/BRAND_FRONT_SPIKE_PLAN.md) §5(미비계약 4건) +
> 결함표 [`docs/dev-validation/br01-r02.md`](br01-r02.md) D07(문의 CRUD, §5 밖에서 추가 확인된 5번째 갭).
> **대상 코드**: `solsol-brand-api/src/{routes,db/schema.master.ts,docs/endpoints.ts}` · `solsol-brand/app/pages/my/**`
> **데이터 정본**: `solsol-mng/docs/data-model/{master.sql,tenant_template.sql,ERD.md}`(2026-07-10 R1~R3 반영 최신)
> **본 문서는 계약 스펙 확정용이며, brand-api 라우트 코드·마이그레이션은 포함하지 않는다.** 구현은
> 별도 착수(선결: 아래 우선순위·의존 순서) 시 바탕(api) + 필요 시 solsol-api 백엔드 담당 + 바다(dba) 협의.

## 0. 요약 (5건)

| # | 항목 | 신규/변경 엔드포인트 | 우선순위 | 신규 DB컬럼 | 담당(레포) | 의존 | 난이도 |
|---|---|---|---|---|---|---|---|
| ① | 사이트 사용량 집계 | (A) 배치 파이프라인(신규, 라우트 아님) + (B) `GET /api/sites`·`/:id` 응답 반영 | **최상위** | 없음(컬럼 기존재) | **solsol-api**(배치, 테넌트DB 접근) + brand-api(반영) | 없음(독립 착수 가능) | **상**(크로스스키마 배치 신규 인프라) |
| ② | 결제 이메일 변경 | `GET`·`PATCH /api/account/billing-email` | 중 | 없음(컬럼·purpose 기존재) | brand-api | email-code purpose enum 확장(내부, 하위호환) | 중 |
| ③ | 도메인/슬러그 사전확인 | `GET /api/sites/check-domain` | 하 | 없음 | brand-api | 없음 | **하**(최소) |
| ④ | 결제요약/비례정산 견적 | `POST /api/subscriptions/:id/plan/quote` | 상 | 없음(저장 안 함, 조회+연산) | brand-api | 비례정산 계산식 정책 확정(오너/정책, [추정] 해소) | 중 |
| ⑤ | 문의 수정/삭제 | `PATCH`·`DELETE /api/contact/:id` | 중 | 없음 | brand-api | 없음(D07 이미 결함표 등재) | **하**(기존 패턴 재사용) |

**착수 순서 권고**: ③·⑤(독립·저난이도, 즉시 착수 가능) → ②(enum 확장 1건 수반) → ④(정책 확정 대기) → ①(별도 레포 인프라, 병행 착수하되 완료는 가장 늦을 수 있음).

---

## ① 사이트 사용량 집계 (최상위)

**현상**: `sites.ts` `toSiteResponse()`가 `usage.memberUsed`/`usage.storageUsed`를 항상 `0`으로 하드코딩(`sites.ts:118,120` 주석 "가이드 §사용량 분리"). `TB_SITE.video_storage_used_bytes`/`member_used_count`/`usage_synced_at` 컬럼은 2026-07-10 R3 C3로 **이미 라이브 반영**되어 있으나 채우는 배치가 없다.

### (A) 배치 파이프라인 — 신규, **solsol-api 소관**

brand-api는 master 스키마 전용(테넌트 DB 크로스 커넥트 불가 — 최소 권한 원칙, `db-change-sync-sot` 관례와 별개로 아키텍처상 brand-api가 테넌트 Hyperdrive를 열지 않음). 테넌트별 실사용량 집계는 테넌트 DB 접근 권한이 있는 **solsol-api**(schema-per-tenant 라우팅 보유) 쪽에 배치를 두는 것이 합리적. `solsol-api` 백엔드 담당과 별도 조율 필요.

- **트리거**: Cloudflare Cron Trigger(예: 매시 정각 또는 야간 배치). 실시간 크로스스키마 집계는 컬럼 코멘트("배치 동기화·표시전용 — 실시간 집계 금지")로 명시 금지되어 있으므로 **반드시 배치**.
- **로직**(사이트별):
  1. `master.TB_SITE`(status IN (0,1)) 순회 → `schema_name`으로 대상 테넌트 스키마 연결.
  2. `storageUsed = SUM(tenant.TB_CONTENT.size_bytes) WHERE status=1`(컬럼 `tenant_template.sql:486`, bytes 단위 — `TB_PLAN.storage_limit`(BIGINT, 2026-07-10 D03 정정)와 동일 단위이므로 직접 비교 가능).
  3. `memberUsed = COUNT(tenant.TB_USER) WHERE user_type='learner' AND status=1`(`tenant_template.sql:38-71`).
  4. `UPDATE master.TB_SITE SET video_storage_used_bytes=?, member_used_count=?, usage_synced_at=NOW() WHERE id=?`.
- **멱등성**: UPDATE 자체가 최신값 덮어쓰기라 자연 멱등. 동시 실행(중복 크론) 방지는 사이트별 락까지는 불필요(낮은 우선순위) — 배치 실행시간이 크론 주기보다 짧다는 가정만 확인.
- **범위 결정 필요**: 전체 사이트 풀스캔 vs 증분(변경분만). 스파이크~초기 GA는 사이트 수가 적어 풀스캔으로 충분, 증분은 후속 최적화.
- **선택(낮은 우선순위)**: 운영자 수동 트리거 `POST /admin/sites/:id/usage-sync`(brand-api admin 라우트, requireRole)를 열어두면 배치 실패 시 개별 재동기화·디버깅에 유용. 이번 이관 스코프에는 필수 아님.

### (B) brand-api 응답 반영 — 신규 라우트 아님, 기존 로직 수정

- **요청**: 없음(기존 `GET /api/sites`·`GET /api/sites/:id` 그대로).
- **응답 변경**: `sites.ts:118,120` 하드코딩 `0` 제거 → `M.site.memberUsedCount`/`M.site.videoStorageUsedBytes` select·반영. `SiteResponse.usage`에 `syncedAt: string | null`(=`usage_synced_at` ISO, 배치 미실행 시 `null`) 필드 **추가**(additive, breaking 아님) — 프론트가 "최근 동기화" 문구·MOCK 배지 해제 판단에 사용.
- **백킹 테이블/컬럼**: `master.TB_SITE.video_storage_used_bytes`·`member_used_count`·`usage_synced_at`(전부 기존재, `master.sql:28-30`).
- **게이트**: 인증(requireAuth, sites 라우트 그룹 공통) 외 추가 게이트 불필요. 조회 전용.
- **마스킹/보안**: 해당 없음(수치값, PII 아님).
- **프론트 영향**: `S-BR01-0401-*`(my/sites 사용량 배지) — `app/pages/my/sites.vue`, `product-upgrade-cycle.vue`(사이트 카드 사용량 표기 시).

---

## ② 결제 이메일(billing_email) 변경/조회 EP (중)

**현상**: `TB_USER.billing_email`·`billing_email_verified_at` 컬럼과 `TB_AUTH_CODE.purpose='billing_email_change'` 값이 이미 정본(`master.sql:47-48,420`)이나, 조회/저장 EP가 없다. `account.ts`에 없음. 프론트 `my/account/billing-email.vue`가 로그인 이메일을 읽기전용 대체 표시하고 저장은 안내 모달만 띄운다.

### `GET /api/account/billing-email`

- **목적**: 현재 결제 이메일(설정 여부·인증 상태) 조회.
- **요청**: 없음(Bearer 인증만).
- **응답**: `{ ok: true, data: { billingEmail: string | null, effectiveEmail: string, verifiedAt: string | null } }`.
  - `effectiveEmail` = `billingEmail ?? email`(컬럼 코멘트 "NULL=email 대체 사용" 규약 그대로 서버가 계산해 프론트에 확정값 제공 — 프론트에서 대체 로직 재구현 금지).
- **백킹**: `master.TB_USER.billing_email`·`billing_email_verified_at`(기존재).
- **게이트**: `requireAuth`(seller 본인). 비마스킹(본인 자기조회, AC1과 동일 원칙).
- **마스킹/보안**: 없음(본인 조회).
- **우선순위**: 중.
- **프론트 영향**: `S-BR01-0901-002` — `app/pages/my/account/billing-email.vue`(상단 "현재 이메일 주소" 실데이터화), `app/pages/my/account.vue`(결제 이메일 카드).

### `PATCH /api/account/billing-email`

- **목적**: 결제 이메일 변경(이메일 소유 인증 + 현재 비밀번호 확인 후 저장).
- **요청**: `{ billingEmail: string(email), verifyToken: string, currentPassword: string }`.
  - `verifyToken` = 기존 `POST /api/auth/email-code/issue`→`verify`(A5/A6) 재사용. **의존**: `auth.ts:517` `email-code/issue`의 zod `purpose` enum이 현재 `['signup','email_change']`만 허용 — **`'billing_email_change'` 값을 enum에 추가**해야 한다(DB `TB_AUTH_CODE.purpose` 컬럼은 자유 VARCHAR라 이미 이 값을 지원, `master.sql:420` 코멘트에도 명시됨 — **코드 측 enum 확장만 필요, DB 마이그 불필요**). `account.ts` `verifyEmailTicket()`이 현재 `purpose !== 'email_verified'`만 확인하므로(`account.ts:206`) email-code verify가 발급하는 티켓 `purpose='email_verified'` 자체는 그대로 재사용 가능 — 즉 verify 단계(A6)는 무수정, **issue 단계(A5)의 enum만 확장**하면 된다.
  - `currentPassword`: AC4(비밀번호 변경)·AC5(탈퇴) 패턴과 동일한 방어심층. 프론트 UI(`billing-email.vue`)가 이미 비밀번호 필드를 요구하고 있으므로 실제 서버 대조로 구현(현재는 클라 필수입력 검증만, 서버 미대조).
- **응답**: `{ ok: true, data: { billingEmail, verifiedAt } }`(echo, Hyperdrive stale 회피).
- **에러**: `EMAIL_VERIFY_REQUIRED`(400, verifyToken 불일치/purpose 상이) · `PASSWORD_MISMATCH`(400) · `VALIDATION_ERROR`(400, 이메일 형식).
- **백킹**: `master.TB_USER.billing_email`·`billing_email_verified_at`(UPDATE), `TB_AUTH_CODE.purpose`(enum 값 추가, DB 무변경).
- **게이트**: `requireAuth` + verifyToken(이메일 소유 증빙) + currentPassword(계정 소유 재확인). PII 변경이므로 실연동 프로파일 기준 privacy 검토 대상.
- **마스킹/보안**: `verifyToken`은 기존 HMAC 서명 티켓 재사용(신규 시크릿 불필요). 응답에 비밀번호·해시 절대 미포함.
- **우선순위**: 중.
- **프론트 영향**: `S-BR01-0901-002` — `app/pages/my/account/billing-email.vue`(제출 로직을 MOCK 안내→실 PATCH 호출로 교체).

---

## ③ 도메인/슬러그 사전확인 EP (하)

**현상**: `POST /api/sites`가 `slug` 중복 시 `409 ALREADY_EXISTS`만 반환(`sites.ts:347-354`). 사전 조회 EP가 없어 `my/sites/create.vue`의 "도메인 중복 체크" 버튼이 안내 모달만 띄우고(`sites/create.vue:55-65`) 실제 확인은 "생성하기" 제출 시에만 이뤄진다.

### `GET /api/sites/check-domain`

- **목적**: 사이트 생성 폼에서 슬러그 실사용 가능 여부 사전 확인(생성 없이).
- **요청**: 쿼리 `?slug=<string>`. `SLUG_PATTERN`(`sites.ts:321` `/^[a-z][a-z0-9-]{1,48}[a-z0-9]$/`)과 동일 정규식으로 사전 검증(프론트 `sites/create.vue:37`는 3~30자 상한을 별도로 쓰므로 서버 상한 48자와 다름 — **정규화 필요**: 서버 검증 상한을 프론트 정책값에 맞출지, 프론트를 서버값에 맞출지 확정 필요, [확인 필요]).
- **응답**: `{ ok: true, data: { slug: string, available: boolean } }`. 형식 오류(정규식 불일치)는 `available:false` + `reason:'invalid_format'` 필드 추가 권고(선택).
- **판정 로직**: `SELECT id FROM TB_SITE WHERE slug=?`(status 무관 — `uk_site_slug`는 소프트삭제(-1)여도 유니크 제약이 걸려 있어 재사용 불가이므로 status 필터 없이 조회해야 실제 제약과 일치).
- **백킹**: `master.TB_SITE.slug`(uk_site_slug, 기존재).
- **게이트**: `requireAuth`(sites 라우트 그룹 공통 유지 — 비로그인에 열 필요 없음, 신규 사이트는 로그인 셀러만 생성).
- **마스킹/보안**: 낮은 민감도(슬러그 존재 열거이지 계정 정보 아님)지만, 자동화 스크래핑 방지 관점에서 레이트리밋 고려 대상으로 D10(로그인/이메일코드 레이트리밋 부재)과 함께 후속 라운드에서 재검토 권고.
- **우선순위**: 하(경미 — 프론트가 이미 "제출 시 확정 판정" UX로 무음 성공 위장 없이 정직하게 처리 중).
- **프론트 영향**: `S-BR01-0401-001` — `app/pages/my/sites/create.vue`("도메인 중복 체크" 버튼 실연동).

---

## ④ 결제요약/비례정산 견적 EP (상)

**현상**: `product-upgrade-cycle.vue`가 플랜 업그레이드 시 잔여기간 비례정산(proration) 금액을 **클라이언트에서 계산**(`remainRatio`·`creditAmount`·`settledAmount`, `product-upgrade-cycle.vue:65-82`)하고 `MockBadge label="비례정산 견적(확정 아님)"`으로 표시한다. brand-api `PATCH /api/subscriptions/:id/plan`도 동일 계산을 `TODO(staging-gate)`로 남겨두고(`subscriptions.ts:405-407`) 실제로는 새 플랜 단가로 교체만 한다("[추정] — 정책 확정 전까지"). 결제 정확성에 직결되므로 클라 계산에 의존하지 않고 **서버 권위 계산**으로 이관해야 한다.

### `POST /api/subscriptions/:id/plan/quote`

- **목적**: 플랜 변경(업그레이드/다운그레이드) 전 비례정산 견적 미리보기(비가역 아님, 조회성 — 실제 변경은 여전히 `PATCH .../plan`).
- **요청**: `{ planId: number, billingCycle: 1 | 12 }`.
- **응답**: `{ ok: true, data: { subscriptionId, currentPlanId, targetPlanId, billingCycle, unitPrice, creditAmount, settledAmount, remainRatio, currentPeriodEnd, provisional: true, quotedAt } }`.
  - `provisional: true` 고정 — 비례정산 정책이 `[추정]`(정책 확정 전)이므로 **견적일 뿐 확정 결제액 아님**을 응답 형상으로도 명시(프론트 `MockBadge` 문구를 서버 플래그로 근거화).
  - 계산식은 현재 프론트 클라 로직(`remainRatio = max(0, periodEnd-now) / (periodEnd-periodStart)`, `creditAmount = round(sub.unitPrice * remainRatio)`, `settledAmount = max(0, unitPrice - creditAmount)`)을 **서버로 그대로 이관**하는 것을 1차 구현으로 권고(프론트-서버 계산 불일치 방지). 다만 이 계산식 자체가 정책 확정 대상([추정])이므로 확정 정책이 나오면 계산 함수만 교체.
- **에러**: `VALIDATION_ERROR`(planId 미존재/협의가 플랜), `NOT_FOUND`(구독 소유 아님).
- **백킹**: `master.TB_SUBSCRIPTION`(조회만, 저장 안 함) · `master.TB_PLAN`(단가). **신규 컬럼 불필요** — 순수 연산.
- **선택 확장(낮은 우선순위)**: 견적을 감사·재현 목적으로 영속화하려면 `TB_SUBSCRIPTION_QUOTE`류 신규 테이블이 필요할 수 있음 — 이번 이관 스코프에는 불필요, 필요 시 바다(dba)과 별도 상의.
- **게이트**: `requireAuth`(구독 소유 검증, `loadOwnedSubscription` 기존 헬퍼 재사용). 조회 전용이라 staging-gate 대상 아님(실제 차액 결제는 여전히 `PATCH .../plan`이 gated).
- **마스킹/보안**: 없음(본인 구독 금액).
- **의존**: **비례정산 계산식 정책 확정**(오너/기획, `subscriptions.ts:361` "[추정]" 해소) — 계산식이 바뀌면 이 EP와 `PATCH .../plan`의 실 정산 로직을 함께 갱신해야 한다(두 곳이 동일 계산 함수를 공유하도록 구현 권고, 로직 이원화 방지).
- **우선순위**: 상(브리프 "결제 정확성"으로 표기했으나 스파이크 단계에선 MOCK 잔존 허용 — 정식 릴리스 게이트 전 필수).
- **프론트 영향**: `S-BR01-0801-*`(product-upgrade-cycle) — `app/pages/my/product-upgrade-cycle.vue`(클라 계산 → 서버 견적 호출로 교체).

---

## ⑤ 문의 수정/삭제 EP (중, 결함표 D07 이미 등재)

**현상**: `contact.ts`는 C(작성)·R(조회)·답변 추가만 지원, U(수정)·D(삭제)가 없다. `inquiry-detail.vue`의 케밥 메뉴(수정/삭제)가 MOCK 안내만 띄운다(`inquiry-detail.vue:32-44`). `docs/dev-validation/br01-r02.md` **D07**(중, 담당 바탕, open)에 이미 결함으로 등재되어 있음 — 본 절은 그 결함의 계약 스펙 확정.

### `PATCH /api/contact/:id`

- **목적**: 본인 문의 수정(제목/내용/유형).
- **요청**: `{ title?: string, subtype?: string, content?: string }`(type 변경은 대상 유형 재분류 리스크가 있어 1차 스코프에서 제외 권고 — [확인 필요], 필요 시 포함).
- **응답**: `{ ok: true, data: { id, title, subtype, content, updatedAt } }`(echo).
- **제약**: 본인 소유(`userId===sub`) + `contactState==='open'`(답변대기)만 수정 허용(이미 `answered`/`closed`면 수정 불가 — 답변과의 정합성 보호, C-CONTACT-4의 "closed는 답변 불가" 정책과 동일 원칙). 위반 시 `403 FORBIDDEN`.
- **백킹**: `master.TB_CONTACT.title`·`subtype`·`content`·`updated_at`(전부 기존재).
- **게이트**: `requireAuth` + 소유 검증(기존 `notFound()` 존재 비노출 패턴 재사용).
- **마스킹/보안**: 없음(본인 문의).

### `DELETE /api/contact/:id`

- **목적**: 본인 문의 삭제(soft delete).
- **요청**: 없음(path만).
- **응답**: `{ ok: true, data: { id, deleted: true } }`.
- **제약**: 본인 소유 + `contactState==='open'`만 삭제 허용 권고(답변 진행된 문의 삭제는 운영 감사 추적 훼손 우려 — 정책 확인 필요, [확인 필요]. 완화하려면 `answered`까지 허용하되 `closed`는 항상 금지).
- **동작**: `UPDATE TB_CONTACT SET status=-1 WHERE id=? AND user_id=?`(billing.ts DELETE 패턴과 동일 soft delete 관례).
- **백킹**: `master.TB_CONTACT.status`(기존재).
- **게이트**: `requireAuth` + 소유 검증.
- **마스킹/보안**: 없음.
- **우선순위**: 중.
- **프론트 영향**: `S-BR01-0702-002` — `app/pages/my/inquiry-detail.vue`(케밥 메뉴 실연동).

---

## 데이터모델 정합 매트릭스

| # | 필요 데이터 | 상태 |
|---|---|---|
| ① | `TB_SITE.video_storage_used_bytes`·`member_used_count`·`usage_synced_at` | **이미 라이브 존재**(2026-07-10 R3 C3) — 신규 컬럼 불필요, 로직/배치만 필요 |
| ② | `TB_USER.billing_email`·`billing_email_verified_at`, `TB_AUTH_CODE.purpose='billing_email_change'` | **이미 라이브 존재**(R3 C1·C15) — DB 무변경, `auth.ts` zod enum 코드 확장만 |
| ③ | `TB_SITE.slug`(uk_site_slug) | **기존재** — 신규 불필요 |
| ④ | `TB_SUBSCRIPTION`·`TB_PLAN` 단가 | **기존재**(조회+연산, 저장 안 함) — 신규 불필요. (선택) 감사영속화 시 신규 테이블 별도 상의 |
| ⑤ | `TB_CONTACT.title`·`subtype`·`content`·`status`·`updated_at` | **기존재** — 신규 불필요 |

**5건 전부 DB 마이그레이션 불필요** — 순수 애플리케이션(라우트+배치) 계층 작업. 유일한 코드 측 "스키마성" 변경은 ②의 `auth.ts` zod `purpose` enum에 `'billing_email_change'` 리터럴 1개 추가(DB 컬럼은 자유 VARCHAR라 이미 수용 — 하위호환, 기존 `signup`/`email_change` 값 영향 없음).

## 구현 난이도 · 의존 순서

1. **③·⑤ 즉시 착수 가능**(독립, 저난이도, 기존 라우트 파일 내 패턴 재사용 — `sites.ts`/`billing.ts`/`account.ts`의 조회·soft-delete 관례 그대로 적용).
2. **②** — enum 확장(`auth.ts` 1줄) + 신규 라우트 2개(`account.ts`류 패턴). email-code 인프라 재사용이라 중난이도지만 리스크 낮음.
3. **④** — 계산 로직은 이관 가능하나, **비례정산 정책이 `[추정]`** 상태라 정책 확정(오너/기획) 전에는 "이관해도 여전히 견적"인 상태. 정책 확정을 선행 조건으로 두거나, 확정 전까지는 `provisional:true`로 서버 이관만 먼저 진행(프론트-서버 계산 불일치 리스크 제거)하는 절충안 권고.
4. **①** — 가장 난이도 높음: (a) **별도 레포(solsol-api) 소관**이라 팀 간 조율 필요, (b) 크로스스키마 배치라는 신규 인프라(Cron Trigger·전 사이트 순회·테넌트 커넥션) 신설, (c) 성능(사이트 수 증가 시 풀스캔 비용) 고려. brand-api 쪽 반영(B)은 컬럼 select 1줄 수준으로 간단하나 (A) 없이는 무의미(항상 0).

## 게이트 · 보안 유의 공통사항

- 전 5건 `requireAuth`(seller Bearer) 하에서만 동작 — 공개(비인증) 엔드포인트 없음.
- ②·④·⑤는 본인 소유 리소스만 접근(기존 `notFound()` 존재 비노출 패턴 유지 — 타인 리소스 열람 시 403 대신 404로 존재 자체를 숨기는 계약 일관성 유지).
- ②는 PII(이메일) 변경이라 **실연동 승격 시 privacy(가림) 서명 대상**(`DEV_VALIDATION_PROCESS.md` 실연동 자동승격 룰).
- ①의 배치는 크로스스키마 대량 UPDATE이므로 배치 실행 시간대·부하 고려(테넌트 DB 대상 스캔 — Aurora 부하 모니터링 권고, 바다(dba) 상의).
- 시크릿(JWT_SECRET·AUTH_CODE_PEPPER 등) 신규 발급 불필요 — 전부 기존 인프라 재사용.

## 참고(비스코프 — 후속 확인 필요 항목)

- ③ 슬러그 길이 상한 불일치(서버 48자 vs 프론트 30자) — 계약 확정 시 정규화.
- ⑤ 답변 진행된(`answered`) 문의의 수정/삭제 허용 범위 — 운영 정책 확인 필요.
- ④ 비례정산 계산식 자체(일할 기준일·반올림 규칙 등) — 정책설계서 확정 필요, 본 문서는 "EP 계약 형상"만 확정하고 계산식 세부는 [추정] 유지.
