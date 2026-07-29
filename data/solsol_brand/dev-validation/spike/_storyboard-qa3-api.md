# storyboard 3차 QA — API·데이터 계약 정합성 (신규 페르소나)

> 정리: 바탕(백엔드) · 2026-07-27 (KST) · 대상: `docs/storyboard/solsol-brand/` 중 API를 구체 인용한 파일 18개
> 방법: storyboard 문서 vs `solsol-brand-api/src/routes/**`(+ Zod 스키마) · `solsol-brand-api/src/index.ts`(마운트 경로) · `solsol-brand/app/types/brandApi.ts` · 프론트 스파이크(`app/pages/**`) 3자 대조.
> 기존 QA(화면·정책·보안·UX 라운드)와 달리 **"문서가 인용한 API 계약이 실제 백엔드 구현과 정확히 일치하는가"**만 판정한다.

## 요약

- 검토 파일: 18개 (storyboard 45개 중 API를 구체적으로 인용한 전부)
- 인용 API 엔드포인트: 23개 고유 (METHOD+path 기준, `/api/auth/*` 8 · `/api/sites/*` 1(check-slug) · `/api/plans` 1 · `/api/subscriptions/*` 5 · `/api/billing/cards/*` 3 · `/api/invoices` 1 · `/api/payments/*` 2 · `/api/account/*` 2)
- **불일치(경로·스키마·에러코드 오기재) = 0건.** storyboard가 인용한 모든 `METHOD /api/...`가 실제 라우트에 동일 경로·메서드로 존재하고, 문서가 언급한 요청/응답 필드·enum·상태전이가 코드와 1:1 일치했다.
- 발견 3건 — **전부 "하"(정보성/이미 알려진 사실 재확인), 신규 불일치 없음.**

## 대조표

| storyboard 파일 | 인용 API | 일치 여부 | 근거(파일:라인) | 심각도 |
|---|---|---|---|---|
| S-BR01-0302-001-로그인.md | BFF `POST /api/session/login` → brand-api `POST /api/auth/login` | ✅ 일치 | `solsol-brand/server/routes/api/session/login.post.ts:19`(callBrandApi 대상 `/api/auth/login`) · `solsol-brand-api/src/routes/auth.ts:367`(`auth.post('/login', ...)`, 마운트 `index.ts:187 app.route('/api/auth', auth)`) | — |
| S-BR01-0302-003-새-비밀번호-설정.md | `resetPassword(requestId, token, newPassword)` → BFF `/api/auth/password/reset` | ✅ 일치 | `auth.ts:744-811`(`auth.post('/password/reset', zValidator('json', {requestId,token,newPassword}))`) — 요청 3필드 정확 일치 | — |
| S-BR01-0401-001_pu01/_pu02(도메인 중복확인) | `GET /api/sites/check-slug?slug=` | ✅ 일치(문서의 "정정" 서술도 정확) | `sites.ts:245-266`(`sites.get('/check-slug', ...)`, 마운트 전 등록 순서 주석까지 코드와 일치) · 프론트 `sites/create.vue:55-96` | — |
| S-BR01-0601-001-가격.md | `GET /api/plans` → `PlanPublic[]` | ✅ 일치 | `plans.ts:7,37-63,140-152`(공개·`requireAuth` 미부착 확인 — plans.ts에 `plans.use('*', requireAuth)` 없음) · `app/types/brandApi.ts:9`(`PlanPublic`) · `pricing.vue:21` | — |
| S-BR01-0601-002-유료구매.md | `GET /api/plans`·`GET /api/sites`·`POST /api/subscriptions` | ✅ 일치 | `purchase.vue:28,32,100`(`POST /api/subscriptions` body `{siteId,planId,billingCardId,billingCycle}`) = `subscriptions.ts:225-230`(`startSchema`) · 성공/실패 라우팅(`/purchase-complete?subscriptionId=`·`/purchase-failed?reason=`) = `purchase.vue:113,117` | — |
| S-BR01-0601-004-플랜업그레이드.md | `PATCH /api/subscriptions/:id/plan`(gated) | ✅ 일치 | `subscriptions.ts:366-420`(`changePlanSchema{planId,billingCardId?}`, 응답 `{subscription,gated:true,idemKey}`) = `product-upgrade-cycle.vue:112-114` body·응답 사용 동일. 비례정산 EP 부재 서술도 코드에 proration 관련 라우트 전무로 확인(`grep -n "proration\|prorate" src/routes/*.ts` 0건) | — |
| S-BR01-0601-007-카드등록.md | `POST /api/billing/cards`(gated) | ✅ 일치 | `billing.ts:121-183`(`registerCardSchema{authKey?,customerKey?,cardCompany?,cardType?,cardLast4?,setDefault?}`) = `purchase-card.vue:47` body 필드 일치, 응답 `gated:true` 반영 확인 | — |
| S-BR01-0801-001-자동연장하기.md | `POST /api/subscriptions/:id/extend`(gated, 개월 1/6/12 필수) | ✅ 일치 | `subscriptions.ts:429-432`(`extendSchema{months: 1\|6\|12 필수, billingCardId?}`) = `product-auto-renew.vue:86-89` body 동일. "개월 선택 토글 신규 추가" 서술은 서버 스키마가 실제로 months 필수임을 정확히 반영 | — |
| S-BR01-0801-002-즉시결제.md | `GET /api/invoices`(재시도 대상 탐색) → `POST /api/payments/:invoiceId/retry`(gated) | ✅ 일치 | `payments.ts:265-392`(재시도 가능 상태 화이트리스트 `['failed','grace','open']`, `payments.ts:296`) = 문서 §기능정의 "failed/grace/open" 그대로. `product-pay-now.vue:24,70` 호출 경로·순서 일치 | — |
| S-BR01-0801-003·_pu01(구독취소) | `DELETE /api/subscriptions/:id`(mode='expire' 고정) | ✅ 일치 | `subscriptions.ts:478-519`(`cancelSchema{mode:'expire'\|'now', reason?}`, expire=cancel_scheduled 전이) = `product-cancel.vue:65-67`(`body:{mode:'expire'}`) 정확 일치 | — |
| S-BR01-0901-001_pu01(대표카드 등록확인) | `PATCH /api/billing/cards/:id/primary` | ✅ 일치 | `billing.ts:189-240` = `account.vue:66` | — |
| S-BR01-0901-001_pu02/_pu03/_pu04(카드삭제·최소1개·대표삭제불가) | `DELETE /api/billing/cards/:id` | ✅ 일치(서버 미강제 보안 갭도 정확) | `billing.ts:249-276`(소유권 검증만 있고 `isDefault`·카드개수 가드 **부재** — 코드 실측 확인) = 문서가 이미 지적한 내용과 100% 일치. 이 갭은 2차 QA 보안 페르소나가 이미 등재(`_storyboard-qa2-security.md`) — 본 라운드에서 재확인만, 신규 발견 아님 | 하(재확인) |
| S-BR01-0901-001_pu05(계정삭제 확인) | `DELETE /api/account`(스파이크 미호출) | ✅ 일치 | `account.ts:289-323`(`account.delete('/', ...)` 실제 존재·구현됨) vs `account.vue:182-190`(`onConfirmDelete`가 alert만 띄우고 `callApi` 호출 없음 — 실측 확인) — "실 삭제 호출 비활성화" 서술 정확 | — |
| S-BR01-0901-002(결제 이메일 변경) | `/api/auth/email-code/issue\|verify`(purpose=email_change) · "billing_email 저장 EP 없음" | ✅ 일치 | `auth.ts:512-571`(`purpose: z.enum(['signup','email_change'])`) · `schema.master.ts:116-117`(`billingEmail`/`billingEmailVerifiedAt` **컬럼은 존재하나** `grep -rn billing_email src/routes/*.ts` 0건 — DB엔 있고 API엔 없음, 문서의 grep 근거 그대로 재현됨) | — |
| S-BR01-1201-001/002(비밀번호재설정·회원가입 인증메일) | `auth.ts:727`·`auth.ts:8,565`의 `TODO(mail)` 잔존 | ✅ 일치(라인번호까지 정확) | `auth.ts:565`(email-code issue TODO) · `auth.ts:727`(reset-request TODO) — grep으로 라인 실측 일치 확인 | — |
| S-BR01-1201-003(결제완료메일) | "결제 정보 8개 필드는 실 결제 API 응답과 1:1 매핑" — `SubscriptionResponse` 언급 | ⚠️ 부분 — 단일 EP로는 8필드 완비 안 됨(설계 노트 필요) | 8필드(주문번호·구독플랜·구독유형·결제금액·결제수단·구독기간·다음결제일·결제상태) 중 6개(주문번호=`payment.orderId`·플랜=`payment.planName`·유형=`payment.billingCycle`·금액=`payment.payPrice`·수단=`payment.cardCompany`+`cardMasked`·상태=`payment.payState`)는 `payments.ts:129-176`(조인 포함 `toPaymentDto`)에서 나오지만, 나머지 2개(구독기간=`currentPeriodStart/End`, 다음결제일=`nextBillingAt`)는 `payment` 응답에 없고 `subscriptions.ts:56-70`(`SubscriptionResponse`)에만 있음 — **단일 API 응답이 아니라 Payment+Subscription 조합 조회가 필요**. 문서가 "SubscriptionResponse 등 참고"로 이미 복수 소스를 암시하고 있어 치명적 오기재는 아니나, 발송 로직 설계 시 "8필드=1개 API 응답"으로 오독될 여지 있음 | 하 |
| S-BR01-1201-010(구독취소메일) | 트리거 `DELETE /api/subscriptions/:id`(mode=expire) | ✅ 일치 | `subscriptions.ts:509-515`(mode='expire' 분기: cancel_scheduled=1·sub_state 유지) — 메일 카피의 "만료일까지 계속 이용 가능" 서술과 서버 전이 로직 정합 | — |

## 인증/권한 대조 (항목 4)

| 라우터 | storyboard 암시 | 실제 미들웨어 | 일치 여부 |
|---|---|---|---|
| `/api/auth/*` | 비로그인 접근(로그인·가입·재설정) | 미부착(공개) — `auth.ts`에 전역 `use('*', requireAuth)` 없음 | ✅ |
| `/api/plans` | 비로그인에서도 가격표 노출(랜딩·pricing) | 미부착(공개) — `plans.ts` 주석 "공개, 인증 미부착"·코드 확인 | ✅ |
| `/api/sites/*`(check-slug 포함) | `/my/*`(로그인 후) 화면에서만 호출 | `sites.ts:41 sites.use('*', requireAuth)` — check-slug도 포함 | ✅(문서가 로그인 화면 하위로만 서술 — 인증 요구와 충돌 없음) |
| `/api/subscriptions/*`·`/api/billing/*`·`/api/invoices`·`/api/payments/*`·`/api/account/*` | 전부 `/my/*` 로그인 화면 | 각 라우터 전역 `use('*', requireAuth)` 확인(`subscriptions.ts:50`·`billing.ts:42`·`invoices.ts:35`·`payments.ts:40`·`account.ts:36`) | ✅ |

문서가 "인증 없이도 호출되는데 언급이 없는" 역방향 사례는 발견되지 않음.

## DB 스키마 필드명 대조 (항목 5)

- `isDefault`(billingKey) — storyboard 여러 파일이 `card.isDefault`로 언급 → `billing.ts:54,74`(`BillingCardResponse.isDefault`) 정확 일치.
- `cancelScheduled`·`subState` — storyboard가 `cancel_scheduled=1`·`sub_state` 표기 → `subscriptions.ts:66,68`(camelCase 응답 필드), DB 컬럼명(snake_case)도 문서 서술과 일치(스키마 주석 확인).
- `billing_email`/`billing_email_verified_at` — 위 표 참조, DB엔 존재·API 미노출 정확 재현.
- 잘못된 필드명 사용(storyboard가 실제와 다른 필드명을 인용한 사례) — **미발견**.

## 핵심 발견 요약

1. **불일치 0건** — 대조한 23개 엔드포인트 전부 경로·메서드·요청 스키마·응답 형상·인증 요구사항이 코드와 정확히 일치. 이 storyboard 세트는 API 인용 정확도가 매우 높다(코드를 직접 대조해 작성된 것으로 보임 — 각 파일이 `solsol-brand-api/src/routes/*.ts:라인` 근거를 구체적으로 병기).
2. **billing.ts 카드 삭제 서버 가드 부재**는 신규 발견이 아니라 2차 보안 QA가 이미 등재한 사실의 재확인(코드 실측으로 재검증만 함) — `_storyboard-qa2-security.md` 참조.
3. **1201-003(결제완료메일) "8개 필드=1:1 매핑" 서술**은 실제로는 Payment 응답(6필드) + Subscription 응답(2필드: 구독기간·다음결제일)의 **조합**이 필요 — 단일 API 참고로 오독될 여지가 있어 "설계 시 주의" 수준으로 기록(치명적 아님, 문서가 이미 "SubscriptionResponse 등"이라 복수형으로 서술해 완전히 틀린 것은 아님).
4. 비례정산(proration) 견적 API 부재(0601-004), billing_email 저장 EP 부재(0901-002), DELETE /api/account 미호출(0901-001_pu05) 등 storyboard가 스스로 밝힌 "계약 갭"은 모두 코드 실측과 정확히 일치 — 문서의 자체 정정·갭 서술 신뢰도 높음.
