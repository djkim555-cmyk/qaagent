# 페르소나: 마크업·카피 QA — br01-r04 재검증

- **검증 관점**: 목업2 HTML ↔ 스파이크 Vue 템플릿의 마크업 블록·문구·배지 1:1 충실도(추정 금지, 라인 대조).
- **대상 커밋**: `solsol-brand` HEAD `71f948d`(r03 기준 `5e7ced2` 대비 11개 커밋 진행 — `git log 5e7ced2..71f948d` 확인. 도메인 solsol.com→solsol.live, sites-create 실연동, 로그인 임시계정 확장 등. 본 담당 ID(D04/D06/D07/D09/D12/D18/D19/D20/D21/D22)에 해당하는 커밋 없음).

## 결함표

| 결함ID | 판정 | 근거(파일:라인) | 설명 |
|---|---|---|---|
| br01-r03-D04 | **open 유지(재현)** | `mockup2/src/views/my/payments.html:49-55` vs `app/pages/my/payments.vue:172-198` | 3종 셀렉트(기간·결제상태·지급수단) 중 지급수단 셀렉트 여전히 없음. 기간 셀렉트는 옵션 메뉴 없는 readonly 껍데기(174행 `title="기간 필터는 목업2 정본상 표시 전용입니다"` — 목업2엔 5옵션 `select-menu`가 실재해 이 주석은 여전히 사실과 다름). 초기화 `.btn-circle` 버튼도 미이식. r03 기술과 동일 |
| br01-r03-D06 | **open 유지(재현)** | `mockup2/src/views/my/sites.html:55-61,242-246,278-280` vs `app/pages/my/sites/index.vue:151-192` | `site-card__alerts` 블록(영상용량 90%·수강 90%·구독기간 만료임박 경고) 템플릿에 전혀 없음(190-192행 `site-card__status`엔 badge만). "구독기간"(2026.01.15 ~ 무제한 등) 표기도 158행 "플랜"으로 대체돼 카드 상단 plan-tag와 중복. "결제 유예(20일 남음)"류 잔여일 표기 부재 |
| br01-r03-D07 | **open 유지(재현)** | `mockup2/src/views/my/product-pay-now.html:99-100` · `product-upgrade-cycle.html:117-118` vs `app/pages/my/product-pay-now.vue` · `app/pages/my/product-upgrade-cycle.vue`(`checkout__notice` grep 0건) | 두 화면 모두 "구독서비스 결제 안내"(`checkout__notice`) 블록 통째 누락 그대로. 동일 블록이 `purchase.vue:257-267`엔 존재(D18 참고) — 여전히 비대칭 |
| br01-r03-D09 | **open 유지(재현)** | `mockup2/src/views/auth/password-reset.html`(`erricon` 보유) vs `grep -rln "input-box__erricon" app/pages/` → `app/pages/password-reset.vue` **1건만** | 공통 폼검증 모듈(`auth-validate.js`) 미이식 문제 그대로. login·signup·inquiry·password-reset-new·purchase-card 등 나머지 폼엔 에러 아이콘 없음(테두리·메시지만) |
| br01-r03-D12 | **open 유지(재현)** | `mockup2/src/views/auth/signup-code-sent-modal.html:107`("3분내") vs `app/pages/signup.vue:63`·`app/pages/my/account/billing-email.vue:71`(둘 다 `'10분내 인증코드를 등록해 주세요'`) | 두 곳 모두 "10분내"로 하드코딩 유지. `expiresIn` 응답 바인딩 없음 |
| br01-r03-D18 | **open 유지(재현)** | `mockup2/src/views/payment/purchase.html:66,73` vs `app/pages/purchase.vue:254-256,265` | ① `checkout__sub-label` 문구 "무료 플랜시 유의사항"→"구독서비스 결제 안내"로 변경 유지(255행, `checkout__notice-title`과 동일 문구 중복). ② 연간구독 설명에서 "매월 요금을 자동으로 결제하는 방식입니다. 처음 결제한 날짜를 기준으로" 구절 삭제 유지(265행) |
| br01-r03-D19 | **open 유지(재현)** | `mockup2/src/views/my/product-auto-renew.html:24`(`<span class="badge badge--outline">베이직 플랜</span>`) vs `app/pages/my/product-{auto-renew,pay-now,upgrade-cycle}.vue`(`plan-summary__top` 블록에 `badge--outline` grep 0건, 3화면 전부) | 플랜 등급 배지(예: "베이직 플랜") 3화면 모두 여전히 누락 |
| br01-r03-D20 | **open 유지(재현)** | `mockup2/src/views/auth/signup.html:166`(`if (!d.value.trim()) d.classList.add(...)` — 빈 칸만) vs `app/pages/signup.vue:306`(`:class="{ 'auth-code__digit--error': codeError && !codeVerified }"` — 6칸 전부에 무조건 적용) | digit 값 유무를 조건에 포함하지 않아 6칸 전부 빨갛게 표시되는 상태 그대로 |
| br01-r03-D21 | **open 유지(재현)** | `mockup2/src/views/inquiry/inquiry.html:93`(`첨부파일 (선택)<span class="info-table__req">*</span>`) vs `app/pages/inquiry.vue:346-349`(`<span class="info-table__req">` 없음) | `*` 스팬 미이식 그대로 |
| br01-r03-D22 | **open 유지(재현)** | `mockup2/css/base.css:1378`(`.auth-sendbtn { flex: none; width: 110px; border: … }` — inline-flex 없음) vs `app/assets/css/base.css:1385`(`display: inline-flex; align-items: center; justify-content: center;` 3속성 선두 추가, 나머지 동일) | 시각차 유발 가능한 임의 CSS 추가 그대로 유지. 사유 기록 없음 |

**집계: closed 0 / open 9 / changed 0** (r03 대비 이 10건 중 시각적 회귀 새 발생 0, 개선/원복도 0 — 전부 그대로)

## 이 렌즈에서 발견한 신규 이슈

- **도메인 표기 불일치(신규 관찰, 결함 등재는 보류)**: `71f948d`(`feat(sites): 사이트 도메인 접미사를 solsol.com에서 solsol.live로 변경`)로 `app/pages/my/sites/index.vue:145,148`가 `${slug}.solsol.live`를 쓰는 반면 `mockup2/src/views/my/sites.html`은 여전히 `djtechtree.solsol.com`/`admin.solsol.com` 표기. 의도된 최신 정책 변경으로 보여 "미이식 결함"이 아니라 **목업2 쪽이 stale**한 경우로 판단(1:1 충실도 위반이 아님) — 확인 필요하면 정책팀에 위임 권장, 본 라운드 결함표에는 넣지 않음.
- **D04 주석의 이중 오류 지속**: 단순 미이식이 아니라 코드 주석(`title="기간 필터는 목업2 정본상 표시 전용입니다"`)이 목업2 실체(5옵션 메뉴 실재)와 반대로 서술 — r03이 이미 지적했지만, 재검증 시점에도 정정되지 않아 다음 개발자가 "의도된 사양"으로 오인할 위험이 여전히 큼(재강조).
- **D07/D18 상호모순 지속**: `purchase.vue`엔 `checkout__notice` 블록이 있고 문구도 D18에서 수정된 채로 존재하는데, 같은 블록이 필요한 `product-pay-now`/`product-upgrade-cycle`엔 아예 없음 — 3개 결제 관련 화면 간 "구독서비스 결제 안내" 노출 정책이 화면별로 제각각인 상태(신규는 아니나 이번 대조로 재확인).
- **신규 결함 없음**: 담당 10개 ID 범위 밖에서 마크업·카피 1:1 충실도 관점의 새로운 이슈는 발견하지 못함(코드 변경 11개 커밋 확인했으나 담당 화면·자산과 겹치는 변경 없음).
