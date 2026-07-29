# 페르소나: 기능/인터랙션 QA — br01-r04 재검증

- **검증 대상**: `solsol-brand` HEAD `71f948d` (r03 기준선 `5e7ced2` 이후 커밋: `b71a1c3`·`bd1f51a`·`c4bcb63` 반영분)
- **정적검증**: `pnpm typecheck` EXIT 0 (baseline 오류 0, 신규 오류 0) — 회귀 없음
- **방법**: 결함표 근거 파일을 실제로 Read, 라인 대조. 추정 없음.

## 1. 담당 결함ID 판정

| 결함ID | 판정 | 근거(파일:라인) | 설명 |
|---|---|---|---|
| br01-r03-D01 | open | `app/pages/my/payments.vue:194,196` · `app/pages/my/inquiry.vue:171,173` | 여전히 `v-model="searchTerm"` → `filtered` computed가 키 입력마다 즉시 반영. 돋보기 아이콘(`ico-20px-search.svg`)에 `@click` 없음(삭제 아이콘만 `@click="searchTerm=''"` 있음). 두 페이지 다 미시정 |
| br01-r03-D02 | changed | `app/pages/pricing.vue:207`(CTA 여전히 `/login?next=/my/sites`) · `app/middleware/01.require-auth.global.ts:16-19,26`(`/purchase`·`-card`·`-complete`·`-failed` 보호 대상으로 명시) · `grep -rn "to=\"/purchase\"" app` → 0건 | 구조가 바뀌었다: `/purchase-card`(`my/account.vue:51`)·`/purchase-complete`·`/purchase-failed`(product-auto-renew/pay-now/upgrade-cycle의 결과 리다이렉트)는 이제 정상 도달 가능해 "5페이지 전부 고아"라는 원 진단은 더는 사실이 아니다. 그러나 **`/purchase`(최초 구매 진입 페이지) 자체로 연결되는 링크는 앱 전체에 0건** — 기존 결제 사이트 소유자는 `product-*.vue`에서 `POST /api/subscriptions`로 직행하고, 신규 사용자는 pricing CTA가 `/my/sites`로 우회해 `/purchase`를 거치지 않는다. `purchase.vue`는 여전히 미들웨어 보호만 받는 죽은 진입점 |
| br01-r03-D05 | open | `app/pages/my/inquiry.vue:179-194` | `qna-item`에 케밥(⋮)·본문 미리보기(excerpt)·답변수 아이콘 여전히 없음(배지+제목+경과시간만). `inquiry-detail.vue`엔 케밥이 있어 화면 간 불일치 유지 |
| br01-r03-D08 | open | `app/pages/my/inquiry-detail.vue:203-216` | 답변(`comment`) 루프에 케밥 없음, `reply.content` 정적 출력만. 문의글(질문) 자체엔 케밥+MockBadge가 추가됐지만(33-44,147-159행) **답변 단위**는 그대로 소실 |
| br01-r03-D13 | changed | `app/pages/index.vue:74,366` · `app/pages/pricing.vue:204,207` · `app/composables/useAuth.ts:87` · `app/middleware/01.require-auth.global.ts:26,30,49-57` | **홈 히어로 CTA는 사실상 해소**: `to="/my/sites"`로 고정하되 `/my/**` 전역 미들웨어가 비로그인 시 `/login?next=/my/sites`로 되돌리고 로그인 후 원목적지 복귀 — `useAuth().ctaHref`를 직접 쓰진 않지만 최종 동작은 기대와 동일(오히려 `next` 보존이 되어 `ctaHref`보다 나음). **가격 페이지는 미해소**: `pricing.vue:204`의 Free 플랜 "무료로 시작하기"가 로그인 여부 확인 없이 무조건 `/signup`이라 로그인 사용자가 클릭하면 `/my/sites`가 아니라 회원가입 폼으로 감(`signup.vue`에 로그인 상태 체크 없음, 별도 확인) — 실사용 시나리오 결함 |
| br01-r03-D15 | open | `app/plugins/interactions.client.ts` 전체(특히 113-129행 select, 40-51행 search) | `grep -rn "solsol:select\|solsol:search\|CustomEvent" app` → 0건. `mockup2/src/assets/site.js:321,361`의 `window.dispatchEvent(new CustomEvent(...))`에 대응하는 코드가 여전히 없음. select 값도 `sInput.value = ...`로 DOM 직접 조작(119행) — Vue 바인딩과 이중 소유 문제 그대로 |
| br01-r03-D16 | open | `app/plugins/interactions.client.ts:96-100` | `kebItem` 분기가 `e.preventDefault(); closeKebabs(); return`만 하고 기본 액션(수정→이동, danger→confirm→처리) 없음. `mockup2/src/assets/site.js:271-279`의 `location.href=...`/`window.confirm(...)` 대응 로직 부재. 단, `inquiry-detail.vue`가 케밥 버튼에 `@click="onEditContact"` 식으로 직접 배선해 이 페이지 안에서는 가려짐(플러그인 기본값 자체는 여전히 죽음) |
| br01-r03-D25 | open | `app/plugins/interactions.client.ts:18-38,49` vs `grep -rn "data-empty-state" app/pages` → 0건 | `[data-empty-state]`·`refreshEmptyState()`·`data-searching` 로직이 플러그인에 그대로 남아있고 사용처는 0. `docs/design/brand/patterns.md:32-34`(P5)도 여전히 구 규약("`site.js` `refreshEmptyState()`") 기술 — 코드·문서 둘 다 미정리 |

**요약**: open 6 · changed 2 · closed 0

## 2. br01-r02-D04~D06 재확인 결과

전부 코드상 확인됨 — `bd1f51a`가 예고한 대로 5개 화면군이 실재하고 정상 라우트로 존재.

- **약관 5**: `app/pages/terms.vue`(4011B) · `terms-free.vue`(4410B) · `terms-paid.vue`(3944B) · `privacy.vue`(2601B) · `marketing-consent.vue`(1772B) — 5개 전부 존재
- **에러 5(`app/error.vue` + 프리뷰 4)**: `app/error.vue`가 `statusCode===404` 분기로 `ErrorScreen` 렌더(404/시스템에러 2종), `app/pages/error/{network-error,system-error,maintenance-scheduled,maintenance-emergency}.vue` 4개 프리뷰 라우트 존재
- **사이트 만들기**: `app/pages/my/sites/create.vue` 존재, `app/pages/my/sites/index.vue:128,207`에서 `<NuxtLink to="/my/sites/create">` 2곳으로 연결 확인(단, 파일 위치가 `my/sites.vue`에서 `my/sites/index.vue`로 이동 — r03 근거 경로와 다르므로 참조 시 주의)
- **결제이메일 변경**: `app/pages/my/account/billing-email.vue` 존재, `app/pages/my/account.vue:480`에서 `<NuxtLink to="/my/account/billing-email">`로 연결 확인

**판정**: `br01-r02-D04·D05·D06` = **closed@bd1f51a** — 문서 결론이 실측과 일치. 허브가 원장에 `open`→`closed@bd1f51a` 정정할 근거 확보(원 예고와 어긋남 없음).

## 3. b71a1c3 신규 3화면 존재 확인 결과

`git show b71a1c3 --stat` 확인 결과 실제로는 아래 4개 신규/변경 화면(0102·0103·0801_pu01 대응 3화면 + product-cancel 기존화면 실호출 전환):

- `app/pages/about.vue`(258줄, S-BR01-0102-001·`/about`) — 존재, `AppHeader.vue:84`·`MobileNav.vue:52`·`AppFooter.vue:23`에서 링크 연결 확인
- `app/pages/product.vue`(260줄, S-BR01-0103-001·`/product`) — 존재, `AppHeader.vue:85`·`MobileNav.vue:53`·`AppFooter.vue:24`에서 링크 연결 확인
- `app/pages/my/product-cancel.vue`(구독취소 완료 모달, S-BR01-0801-001_pu01) — 기존 파일 수정(35줄 diff)으로 존재, `DELETE /api/subscriptions/:id` 실 호출 활성화 커밋 메시지대로 남아있음(코드 상세 재검증은 이번 라운드 범위 밖 — 존재·연결만 확인)

**판정**: 3화면 전부 현재도 남아있고 GNB/모바일/푸터에서 도달 가능 — 이관 후 삭제·경로 유실 없음.

## 4. 이 렌즈에서 우연히 발견한 신규 이슈

- **`pricing.vue:204` 로그인 상태 미분기(D13 확산)**: Free 플랜 CTA가 `/signup`으로 고정이라, 이미 로그인된 사용자가 가격 페이지에서 "무료로 시작하기"를 누르면 `/my/sites`가 아니라 회원가입 폼에 진입한다. `signup.vue`에 로그인 여부 체크가 없어(grep 결과 0건) 이중가입 시도 UX로 이어질 수 있음. 근거: `app/pages/pricing.vue:204` · `app/pages/signup.vue`(로그인 체크 부재). 심각도 판단은 QA 소관 밖이나 담당(나래) 전달 권장 — D13과 같은 결함군이라 별도 ID 신설보다 D13 갱신 시 이 파일도 함께 반영 요망.
- 그 외 우연 발견 없음(담당 범위 내 파일 대조 중 발견된 것은 위 1건뿐).
