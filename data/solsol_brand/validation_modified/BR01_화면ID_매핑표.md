# BR01 화면ID 개정 매핑표 (목업2 66뷰 기준)

> **목적**: `docs/validation/00_화면목록.md` §3.3 BR01(현 S-BR01 45개 체계)을 목업2 실체(66뷰) 기준으로 개정하기 위한 **권위 매핑 스펙**. 개정본 본체는 [`00_화면목록.md`](./00_화면목록.md) §3.3. 2단계(정책문서·screenList 재수확)는 **이 표를 유일 기준**으로 삼는다.
> **근거 자료**: [`docs/dev-validation/spike/br01-r03-screen-matrix.md`](../dev-validation/spike/br01-r03-screen-matrix.md)(4축 대조표) · [`br01-r03.md`](../dev-validation/spike/br01-r03.md) §D03(off-by-one) · `solsol-brand/mockup2/src/views/` 실측(66파일) · `solsol-mng/app/utils/screenList.ts:4831-5745`(BR01 섹션, mockup2 `pagelists.html` 파생·65건)
> **작성** = 새롬(기획) · **작성일** = 2026-07-15 · **오너 승인** = 완료(개정 착수 승인)

---

## 0. 총량 요약

| 구분 | 기존 SoT45 | 개정 후 | 증감 | 비고 |
|---|---:|---:|---:|---|
| 본화면 | 39 | **45** | +6 | 목업2 신규 페이지 7건 반영, 0601-004 의미변경(폐지 아님, 재정의) |
| 모달/팝업(`_pu`+공유) | 6 (부모종속5+공유1) | **7** (부모종속6+공유1) | +1 | 도메인 중복확인 1→2 분리, C01 복원 |
| **합계(화면ID)** | **45** | **52** | **+7** | |
| 이메일 템플릿 | 12(비대상, 문서화만) | **12(비대상, 명문화)** | 0 | screenList.ts가 잘못 부여한 이메일 12개 ID **전건 무효화** |
| 범용 제외(신규 확인) | (미확인) | **7건 제외** | — | 카드모달4·계정삭제·구독취소컨펌·파일용량초과 — 기존 §1 규칙 엄격 적용(§3 참조) |

**검산**: 목업2 66뷰 = 페이지39(전건 화면ID) + 모달15(8건→화면ID 6개 압축 + 7건 제외) + 이메일12(전건 비대상) → **화면ID로 귀결되는 목업2 파일 = 39+8 = 47**, 이 중 8개 모달파일이 6개 ID로 압축(신호 손실 없음, C01이 3파일 흡수). 여기에 목업2 미대응 기존 SoT 항목(본화면 6 + 모달 1 = 7)을 더해 **총 52개 화면ID**.

---

## 1. 채번 규칙 (재현 가능성 — 2단계가 그대로 재수확할 수 있어야 함)

1. **체계 불변**: `S-BR01-[Depth][화면번호][_pu##]` 형식·부여 규칙은 `00_화면목록.md` §1을 그대로 따른다(오버라이드 없음).
2. **원칙 = 목업2 파일 1개당 화면ID 1개**(페이지 기준). 신규 페이지는 기존 depth 그룹 내 **다음 빈 화면번호**로 채번한다(예: `0601` 그룹의 `006/007/008`, `0801` 그룹의 `003`, `0901` 그룹의 `003`, `0302` 그룹의 `005`). depth 자체를 새로 만들지 않는다(그룹은 §3 표의 "영역" 참조로 판별 — 페이지 성격이 속한 기존 메뉴 트리를 따른다).
3. **모달/팝업**: 기존 규칙 그대로 — `_pu##`는 부모 화면 등장순, 여러 부모가 재사용하는 콘텐츠형 모달은 공유 컴포넌트 `S-BR01-C##` 1회만 채번.
4. **범용 Alert/Confirm 제외 규칙(00_화면목록 §1)을 목업2 모달 파일에 엄격 적용**한다 — "콘텐츠 없는 단순 확인·경고창"은 화면ID 비부여. 본 개정에서 재확인된 제외 7건(§3.2):
   - 카드 관리 모달 4종(대표설정 확인·삭제 확인·최소1개 유지 안내·대표카드 삭제불가 안내) — 기존 FR01 §1 각주가 "카드 삭제/대표설정"을 범용 컨펌 예시로 이미 명시한 것과 동일 범주로 판단.
   - 계정삭제 컨펌·구독취소 컨펌·파일용량초과 Alert — **기존 BR01 §3.3.2 각주(원본 line 410)가 이미 "범용 Confirm 3종"으로 명시적으로 제외한 항목**. `screenList.ts`가 이 3건에 화면ID(`0701-001_pu01`·`0801-001_pu01`·`0901-001_pu04`)를 잘못 부여한 것을 이번 개정에서 **정정(회수)**한다.
5. **이메일 템플릿 12종 = 화면ID 비대상**(오너 결정, 2026-07-15). `00_화면목록.md` §3.3.1은 원래도 이 원칙이었다(이메일은 화면 아님) — `screenList.ts`가 임의로 부여한 이메일 ID 12개(`0302-004`·`0301-004`·`0601-009`·`1201-001~009`)는 **전건 무효화**. 2단계에서 `screenList.ts` 재생성 시 이 12개 항목을 제거하고 §3.3.1(비대상 목록)로 되돌려야 한다.
6. **상태 분기 파일의 ID 합산 여부**: 동일 모달의 성공/실패 등 상태만 다른 목업2 파일(예: 도메인 중복확인 `available`/`taken`)은 **원칙적으로 파일별 1 ID**를 부여한다(목업2 66뷰 실체를 그대로 반영하는 것이 이번 개정 목적이므로). 단, 이미 SoT가 "상태별" 표기로 단일 화면 안에 상태를 흡수해 설계한 기존 항목(예: `0801-001` "이용상품 정보(상태별)")은 그 설계를 유지한다.
7. **ID 충돌 해소**: `screenList.ts`가 서로 다른 두 파일에 동일 문자열 `S-BR01-0801-001_pu01`을 이중 배정한 충돌을 발견했다(`product-cancel-confirm-modal.html`에 배정 vs 원 SoT의 "구독취소 완료" 의미). 원 SoT 의미(구독취소 완료, `03_brand-site.md` p107/03:705 근거 있음)를 보존하고, `product-cancel-confirm-modal.html`은 규칙4에 따라 범용 컨펌으로 제외한다.
8. **연속성 우선(불필요한 재배치 최소화)**: `screenList.ts`가 이미 배정한 ID는 규칙 4·5·7에 위배되지 않는 한 그대로 채택한다. 예: `product-upgrade-cycle.html`은 메뉴상 "이용상품(0801)" 그룹이 더 정합적이나, 코드베이스 연속성을 위해 `screenList.ts`가 이미 쓰고 있는 `0601-004`(원래 "결제완료-업그레이드"였던 ID를 재정의)를 채택했다. 이 판단은 **판단 근거로 명시**하며, 2단계에서 오너가 `0801-004`로 재배치를 원하면 되돌릴 수 있다.
9. **목업2 미대응 레거시 화면 처리**: 목업2에 대응 파일이 없는 기존 SoT 항목(본화면 6·모달 1 = 7건)은 **삭제하지 않고 유지**한다(범위 축소가 아니라 목업2 66뷰 정합화가 목적). 상태 컬럼에 "목업2 미대응"을 명기하고 2단계/오너 확인 대상으로 표기한다.

---

## 2. 매핑표 — 페이지 39 (전건 화면ID 부여)

| # | 목업2 경로(`src/views/`) | 새 화면ID | 대상 route(스파이크) | 기존 SoT45 대응 | 비고 |
|---|---|---|---|---|---|
| 1 | `home/index.html` | S-BR01-0101-001 | `/` | 유지 | |
| 2 | `home/pricing.html` | **S-BR01-0601-006**(신규) | `/pricing`(통합 스텁) | 신규채번 | screenList.ts 기존 배정 채택(규칙8) |
| 3 | `auth/signup.html` | S-BR01-0301-001 | `/signup` | 유지 | |
| 4 | `auth/signup-terms.html` | S-BR01-0301-002 | 🟡 `TermsModal` 흡수 | 유지 | 전용 라우트 없음(기존 결함 D-계열 별건) |
| 5 | `auth/signup-complete.html` | S-BR01-0301-003 | `/signup-complete` | 유지 | |
| 6 | `auth/login.html` | S-BR01-0302-001 | `/login` | 유지 | |
| 7 | `auth/password-reset.html` | S-BR01-0302-002 | `/password-reset` | 유지 | |
| 8 | `auth/password-reset-sent.html` | **S-BR01-0302-005**(신규) | `/password-reset-sent` | 신규채번 | screenList.ts 기존 배정 채택 |
| 9 | `auth/password-reset-new.html` | S-BR01-0302-003 | `/password-reset-new` | 유지 | |
| 10 | `my/sites-create.html` | S-BR01-0401-001 | `/my/sites/create` | 유지 | |
| 11 | `my/sites.html` | S-BR01-0401-002 | `/my/sites` | 유지 | |
| 12 | `payment/pricing.html` | S-BR01-0601-001 | `/pricing` | 유지 | |
| 13 | `payment/purchase.html` | S-BR01-0601-002 | `/purchase`(고아, D02) | 유지 | 명칭 "유료플랜 구매하기(신규 결제)"로 협소화(업그레이드는 0601-004로 분리) |
| 14 | `payment/purchase-card.html` | **S-BR01-0601-007**(신규) | `/purchase-card`(MOCK 스텁) | 신규채번(재분류) | 원 SoT는 "외부 toss 제외"였으나 내부 1st-party 페이지로 재설계됨 → 화면ID 필요 |
| 15 | `payment/purchase-login.html` | **S-BR01-0601-008**(신규) | `/purchase-login`(고아) | 신규채번 | |
| 16 | `payment/purchase-complete.html` | S-BR01-0601-003 | `/purchase-complete`(고아) | 유지(범위 재확인) | **0601-004(구 "결제완료-업그레이드")를 흡수·통합** — 최초/업그레이드 공용 단일 화면 확정 |
| 17 | `payment/purchase-failed.html` | S-BR01-0601-005 | `/purchase-failed`(고아) | 유지 | |
| 18 | `inquiry/inquiry.html` | S-BR01-0701-001 | `/inquiry` | 유지 | |
| 19 | `inquiry/inquiry-complete.html` | S-BR01-0701-002 | `/inquiry-complete` | 유지 | |
| 20 | `my/inquiry.html` | S-BR01-0702-001 | `/my/inquiry` | 유지 | |
| 21 | `my/inquiry-detail.html` | S-BR01-0702-002 | `/my/inquiry-detail` | 유지 | |
| 22 | `my/product-auto-renew.html` | S-BR01-0801-001 | `/my/product-auto-renew` | 유지(재정의) | 원 SoT "이용상품 정보(상태별)"를 "자동 연장하기"로 협소화 |
| 23 | `my/product-pay-now.html` | S-BR01-0801-002 | `/my/product-pay-now` | 유지(재정의) | 원 SoT "사용 연장하기"를 "즉시 결제"로 협소화 |
| 24 | `my/product-cancel.html` | **S-BR01-0801-003**(신규) | `/my/product-cancel`(MOCK) | 신규채번 | |
| 25 | `my/product-upgrade-cycle.html` | **S-BR01-0601-004**(재정의) | `/my/product-upgrade-cycle`(MOCK) | **변경**(폐지 아님 — 의미 재정의) | 구 의미(결제완료-업그레이드)는 #16(0601-003)로 통합·폐지. 신 의미(플랜 업그레이드/주기변경 선택 화면)로 재사용. 규칙8·규칙6 참조 — 오너가 `0801-004` 재배치 원하면 변경 가능 |
| 26 | `my/account.html` | S-BR01-0901-001 | `/my/account` | 유지 | |
| 27 | `my/account-billing-email-change.html` | S-BR01-0901-002 | `/my/account/billing-email` | 유지 | |
| 28 | `my/account-billing-email-complete.html` | **S-BR01-0901-003**(신규) | ❌ 미구현(D23, alert 대체) | 신규채번 | |
| 29 | `my/payments.html` | S-BR01-1001-001 | `/my/payments` | 유지 | |
| 30 | `footer/terms.html` | S-BR01-1101-001 | `/terms` | 유지 | |
| 31 | `footer/terms-free.html` | S-BR01-1101-002 | `/terms-free` | 유지 | |
| 32 | `footer/terms-paid.html` | S-BR01-1101-003 | `/terms-paid` | 유지 | |
| 33 | `footer/privacy.html` | S-BR01-1101-004 | `/privacy` | 유지 | |
| 34 | `footer/marketing-consent.html` | S-BR01-1101-005 | `/marketing-consent` | 유지 | |
| 35 | `error/system-error.html` | S-BR01-9001-001 | `/error/system-error` | 유지 | ID 오기(D14) 정정 대상은 스파이크 주석(2단계) |
| 36 | `error/404.html` | S-BR01-9001-002 | 🟡 `app/error.vue` 분기 | 유지 | |
| 37 | `error/network-error.html` | S-BR01-9001-003 | `/error/network-error` | 유지 | |
| 38 | `error/maintenance-emergency.html` | S-BR01-9001-004 | `/error/maintenance-emergency` | 유지 | ID 오기(D14) |
| 39 | `error/maintenance-scheduled.html` | S-BR01-9001-005 | `/error/maintenance-scheduled` | 유지 | ID 오기(D14) |

### 2-1. 목업2 미대응 레거시 본화면 (6건 — 유지, 목업2 파일 없음)

| 화면ID | 화면명 | 상태 | 처리 |
|---|---|---|---|
| S-BR01-0102-001 | 플랫폼 소개 | **구현됨(실앱 직접, route `/about`, 07-16)** | 해소 — 오너 결정(07-16) "목업2 없는 페이지는 이번 개발에서 생성", `solsol-brand/app/pages/about.vue`(정적). 스펙 = `docs/design/brand/new-screens-spec-0102-0103.md` §1 |
| S-BR01-0103-001 | 프로덕트 | **구현됨(실앱 직접, route `/product`, 07-16)** | 해소 — "미설계" 상태 종료. 오너 결정(07-16)으로 콘텐츠 기획 확정, `solsol-brand/app/pages/product.vue`(정적). 스펙 = `docs/design/brand/new-screens-spec-0102-0103.md` §2 |
| S-BR01-0104-001 | 데모보기 | 실사이트 대체 | 유지(라이브 배포본 대체, 별도 화면 설계 불필요) |
| S-BR01-0105-001 | 주요기능 소개 | 실사이트 대체 | 유지(동일) |
| S-BR01-0501-001 | 공지/소식 목록 | 증류완료(won't-fix) | 유지(오너 기결정 br01-r01-D01, 재계상 안 함) |
| S-BR01-0501-002 | 공지/소식 상세 | 증류완료(won't-fix) | 유지(동일) |

> **갱신(2026-07-16)**: 위 6건 중 `0102-001`·`0103-001` 2건은 목업2 단계를 생략하고 **실앱에 직접 구현 완료**되어 "오너 확인 대기"·"미설계" 상태가 해소됐다(§5-4 참조). 나머지 4건(`0104-001`·`0105-001`·`0501-001`·`0501-002`)은 기존 처리(실사이트 대체/won't-fix)를 그대로 유지하며 이번 갱신 대상이 아니다.

---

## 3. 매핑표 — 모달/팝업 15 (화면ID 6개로 귀결 + 제외 7건)

### 3.1 화면ID 부여 (6개 — 부모종속 5 + 공유 1)

| 목업2 파일(들) | 새 화면ID | 유형 | 대상(스파이크) | 근거·비고 |
|---|---|---|---|---|
| `auth/signup-code-sent-modal.html` | S-BR01-0301-002_pu01 | LPU | 🟡 `useModal().alert` | 유지(기존 ID) |
| `auth/password-reset-complete-modal.html` | S-BR01-0302-003_pu01 | LPU | 🟡 `useModal().alert` | 유지(기존 ID) |
| `my/sites-create-domain-available-modal.html` | **S-BR01-0401-001_pu01**(신규 분리) | LPU | ⚠️ MOCK | 규칙6 — 기존엔 1개 ID로 상태 통합했으나 목업2 파일이 2개로 분리돼 있어 1:1 재배정 |
| `my/sites-create-domain-taken-modal.html` | **S-BR01-0401-001_pu02**(신규 분리) | LPU | ⚠️ MOCK | 동일 |
| `my/account-billing-email-code-sent-modal.html` | S-BR01-0901-002_pu01 | LPU | 🟡 `useModal().alert` | 유지(기존 ID) |
| `auth/signup-terms-modal.html`<br>`auth/signup-privacy-modal.html`<br>`auth/signup-marketing-modal.html` | **S-BR01-C01**(공유, 3파일 흡수) | LPU(공유) | 🟡 `TermsModal` | screenList.ts가 `_pu02~04`로 잘못 분리했던 것을 원 SoT 공유 컴포넌트 설계로 복원(D03 근본원인 중 하나) — 이용약관/개인정보/마케팅 3종 콘텐츠를 파라미터화해 표시하는 동일 LPU |

### 3.2 화면ID 제외 — 범용 Alert/Confirm (7건, §1 규칙4 적용)

| 목업2 파일 | screenList.ts 기존(잘못된) ID | 제외 사유 |
|---|---|---|
| `inquiry/inquiry-file-size-modal.html` | `S-BR01-0701-001_pu01`(회수) | 원 SoT §3.3.2 각주 기제외 항목("파일용량초과 Alert") — screenList가 오배정 |
| `my/account-delete-modal.html` | `S-BR01-0901-001_pu04`(회수) | 원 SoT §3.3.2 각주 기제외("계정삭제 컨펌") — screenList가 오배정 |
| `my/product-cancel-confirm-modal.html` | `S-BR01-0801-001_pu01`(회수, ID충돌) | 원 SoT §3.3.2 각주 기제외("구독취소 컨펌") — 해당 ID는 §2-2 "구독취소 완료"가 정당 소유주(규칙7) |
| `my/account-card-primary-modal.html` | `S-BR01-0901-001_pu01`(회수) | FR01 §1 각주 동일범주 "카드 대표설정" 컨펌 |
| `my/account-card-delete-modal.html` | `S-BR01-0901-001_pu02`(회수) | FR01 §1 각주 동일범주 "카드 삭제" 컨펌 |
| `my/account-card-min-modal.html` | `S-BR01-0901-001_pu03`(회수) | 콘텐츠 없는 단순 안내("카드 최소 1개 유지") |
| `my/account-card-primary-nodelete-modal.html` | (screenList 미등재) | 콘텐츠 없는 단순 안내("대표카드는 삭제 불가") |

### 3.3 목업2 미대응 레거시 모달 (1건 — 유지)

| 화면ID | 화면명 | 상태 | 처리 |
|---|---|---|---|
| S-BR01-0801-001_pu01 | 구독 취소 완료(LPU) | **구현됨(실앱, `my/product-cancel.vue` 플로우, 07-16)** | 해소 — 오너 결정(07-16) "목업2 없는 모달은 이번 개발에서 생성". `03_brand-site.md` L705 SoT 카피 그대로 반영. **구독취소 실 호출도 함께 활성화**(`DELETE /api/subscriptions/:id` mode=expire, 오너 07-16 승인 — 이전 세션의 "실 호출 안 함" 결정을 뒤집은 것, 사유는 `docs/design/brand/_changelog.md` 07-16 행 참조) |

---

## 4. 매핑표 — 이메일 템플릿 12 (전건 화면ID 비대상)

| 목업2 파일 | 용도 | screenList.ts 기존(무효화) ID |
|---|---|---|
| `auth/signup-certification-email.html` | 회원가입 인증코드 | `S-BR01-0301-004`(무효) |
| `auth/password-reset-email.html` | 비밀번호 재설정 인증메일 | `S-BR01-0302-004`(무효) |
| `payment/purchase-complete-email.html` | 결제완료 | `S-BR01-0601-009`(무효) |
| `my/product-payment-failed-email.html` | 결제실패 | `S-BR01-1201-004`(무효) |
| `my/product-payment-grace-email.html` | 결제유예 | `S-BR01-1201-005`(무효) |
| `my/service-created-email.html` | 서비스 생성 축하 | `S-BR01-1201-001`(무효) |
| `my/service-suspended-email.html` | 서비스 중지 | `S-BR01-1201-002`(무효) |
| `my/service-terminated-email.html` | 서비스 전면 중단 | `S-BR01-1201-003`(무효) |
| `my/subscription-cancel-email.html` | 구독취소 안내 | `S-BR01-1201-006`(무효) |
| `my/subscription-expiring-email.html` | 만료 도래 | `S-BR01-1201-008`(무효) |
| `my/subscription-expired-email.html` | 만료 안내 | `S-BR01-1201-007`(무효) |
| `my/usage-warning-email.html` | 사용량 경고 | `S-BR01-1201-009`(무효) |

> **2단계 작업지시**: `solsol-mng/app/utils/screenList.ts` BR01 섹션(라인 4831~5745) 재생성 시 위 12개 이메일 항목 전체를 화면 배열에서 제거하고, `docs/policy/brand/_index.md` 등 정책문서의 이메일 관련 서술도 "화면ID 비대상"으로 정정한다.

> ⚠️ **위 §3.2·§4의 "화면ID 비대상" 결정은 2026-07-27 오너 재승인으로 번복되었다 — 아래 §6 참조. 이 절(§3.2·§4)은 원본 그대로 보존하고 지우지 않는다(전후 대조 목적).**

---

## 5. 2단계로 넘기는 재수확 기준 (요약)

1. **입력 = 이 매핑표(§2~4)만** 사용한다. `mockup2/index.html` 카드 그리드를 다시 눈으로 읽지 않는다(D03의 off-by-one 재발 방지 — 그 방식이 근본원인이었다).
2. `docs/policy/brand/**`의 화면ID 16개(현재 15개 오기 확인됨, br01-r03-D03)를 이 매핑표 기준으로 전건 재기입하고, 라우트도 목업2 경로가 아니라 **스파이크 실경로**(`app/pages/**`)로 갱신한다.
3. `app/utils/screenList.ts`(허브) BR01 섹션을 이 매핑표 기준으로 재생성한다 — 이메일 12개 제거, 카드모달 등 제외 7건 제거, C01 공유 컴포넌트 복원, 도메인모달 `_pu01/_pu02` 분리 반영.
4. **미정 TODO 2건은 오너 확인 후 확정**: ① `S-BR01-0102-001`(플랫폼 소개) 메인 흡수 여부, ② `S-BR01-0801-001_pu01`(구독취소 완료) 목업2 누락분 제작 여부. → **해소(오너 07-16 결정)**: 메인 흡수 대신 **별도 페이지로 제작 확정**(①), 목업2 없이 **실앱 직접 제작 확정**(②). 같은 결정으로 `S-BR01-0103-001`(프로덕트, "미설계" 상태)도 콘텐츠 기획 확정·제작. 3건 모두 구현 완료(route `/about`·`/product`, `my/product-cancel.vue` 완료 LPU) — 상세는 §2-1·§3.3, 스펙은 `docs/design/brand/new-screens-spec-0102-0103.md`.
5. `03_brand-site.md` 본문에 신규/재정의 화면 9건(0302-005·0601-004[재정의]·0601-006·0601-007·0601-008·0801-003·0901-003·0401-001_pu02·C01 복원)의 본문 증류 반영은 2단계 몫이다(이번 1단계는 채번·구조 확정까지).

---

## 6. 2026-07-27 오너 재승인 — 화면ID 재배정 (§3.2·§4 번복)

> **번복 근거**: 목업2→스파이크 이식 검증(br01-r04) 중 화면ID 없는 항목을 storyboard로 옮기려다 §3.2·§4의 "비대상" 결정을 재확인했고, **오너에게 재확인해 이 결정을 번복하고 새 화면ID를 배정하라는 승인**을 받았다(2026-07-27, 요청자=총괄, 승인=오너). §3.2·§4 자체의 판단 근거(범용 Alert/Confirm 판정 기준, 이메일=화면 아님 원칙)가 틀렸다는 뜻이 아니라, **이번 라운드에서는 개별 추적이 더 유용하다고 오너가 재판단**한 것 — 원 판단 로직은 §1 규칙4·5로 유지하되 이 19건에 한해 예외 적용.
> **작성** = 새롬(기획) · **작성일** = 2026-07-27

### 6.1 전후 대조 요약

| 구분 | 07-15 결정(§3.2·§4) | 07-27 번복 후 |
|---|---|---|
| 범용 Alert/Confirm 7건 | 화면ID 비대상(회수) | 개별 화면ID 신규 배정(부모 그룹 하위 `_pu##`) |
| 이메일 템플릿 12건 | 화면ID 비대상(명문화) | 신규 depth `S-BR01-1201`(이메일 템플릿) 독립 채번 |

### 6.2 매핑표 — 범용 Alert/Confirm 7건 재배정

| # | 목업2 파일 | 구ID(§3.2, 회수됐었음) | 신규ID | 부모 | 화면명 | 비고 |
|---|---|---|---|---|---|---|
| 1 | `inquiry/inquiry-file-size-modal.html` | `S-BR01-0701-001_pu01`(회수) | **S-BR01-0701-001_pu01**(재사용) | S-BR01-0701-001(문의하기) | 파일 용량초과 안내 | 회수된 ID 문자열 그대로 재사용(부모 하위 유일한 `_pu`라 충돌 없음). `app/utils/screenDocs.ts:525`에 무관한 스테일 매핑(`POLICY_B_SITES`)이 이미 존재 — 총괄이 정정 |
| 2 | `my/product-cancel-confirm-modal.html` | `S-BR01-0801-001_pu01`(회수, 규칙7에 따라 재사용 불가) | **S-BR01-0801-003_pu01**(신규) | S-BR01-0801-003(구독취소) | 구독 취소 안내 | ⚠️ **오너 확인 필요(중대)** — §6.4 참조. 실측 결과 이 파일의 실제 콘텐츠는 Y/N 컨펌이 아니라 **"구독 취소가 완료되었습니다" 완료 안내**(확인 버튼 1개뿐)로, 이미 추적 중인 `S-BR01-0801-001_pu01`(구독 취소 완료 LPU, `product-cancel.vue` 구현·03_brand-site.md L705 SoT)와 **동일 내용**. 두 ID 중복/중첩 가능성 있음 — 정리는 §6.4 |
| 3 | `my/account-card-primary-modal.html` | `S-BR01-0901-001_pu01`(회수) | **S-BR01-0901-001_pu01**(재사용) | S-BR01-0901-001(계정관리) | 대표카드 등록 확인 모달 | |
| 4 | `my/account-card-delete-modal.html` | `S-BR01-0901-001_pu02`(회수) | **S-BR01-0901-001_pu02**(재사용) | S-BR01-0901-001 | 카드 삭제 확인 모달 | |
| 5 | `my/account-card-min-modal.html` | `S-BR01-0901-001_pu03`(회수) | **S-BR01-0901-001_pu03**(재사용) | S-BR01-0901-001 | 카드 최소 1개 유지 안내 모달 | |
| 6 | `my/account-card-primary-nodelete-modal.html` | (screenList 미등재) | **S-BR01-0901-001_pu04**(신규) | S-BR01-0901-001 | 대표카드 삭제불가 안내 모달 | |
| 7 | `my/account-delete-modal.html` | `S-BR01-0901-001_pu04`(회수, 옛 번호 — 신규 번호와 우연히 겹치므로 혼동 주의) | **S-BR01-0901-001_pu05**(신규) | S-BR01-0901-001 | 계정 삭제(탈퇴) 확인 모달 | 옛 회수ID(`_pu04`)와 신규ID(`_pu05`)가 다른 번호임에 주의 — 5개 파일을 등장순(카드3종→대표카드삭제불가→계정삭제)으로 pu01~05 재배열했기 때문 |

> `app/utils/screenDocs.ts`에 이미 존재하는 `S-BR01-0901-001_pu01~03`(라인 508~510, `POLICY_B_ACCOUNT`로만 연결된 스테일 매핑)은 이번 재배정으로 그 문자열이 **legitimize**됐다 — 총괄이 storyboard 경로로 갱신.

### 6.3 매핑표 — 이메일 템플릿 12건 재배정 (신규 depth `1201`)

**채번 원칙**: §1 규칙2는 "신규 페이지는 기존 depth 그룹 내 다음 빈 화면번호"이나, 이메일은 어느 기존 화면 depth에도 속하지 않는 독립 자산이라 **신규 depth `1201`(이메일 템플릿)을 신설**해 12건을 그 안에서 순차 채번한다. 구 `screenList.ts` 무효 ID 중 9건이 이미 `1201-001~009`를 썼던 전례(§4 참조)를 이어받아 depth 번호 자체는 재사용하되, 범위를 12건 전체로 확장하고 번호를 처음부터 다시 순서대로 매긴다(구 매핑과 1:1 대응 아님 — 근거: 구 배정은 3개 depth(0301·0302·0601)에 흩어져 있어 재현성이 낮았음).

| # | 목업2 파일 | 구ID(§4, 무효화됐었음) | 신규ID | 용도 |
|---|---|---|---|---|
| 1 | `auth/password-reset-email.html` | `S-BR01-0302-004`(무효) | **S-BR01-1201-001** | 비밀번호 재설정 인증메일 |
| 2 | `auth/signup-certification-email.html` | `S-BR01-0301-004`(무효) | **S-BR01-1201-002** | 회원가입 인증코드 발송메일 |
| 3 | `payment/purchase-complete-email.html` | `S-BR01-0601-009`(무효) | **S-BR01-1201-003** | 결제완료 메일 |
| 4 | `my/product-payment-failed-email.html` | `S-BR01-1201-004`(무효) | **S-BR01-1201-004**(재사용) | 결제실패 메일 |
| 5 | `my/product-payment-grace-email.html` | `S-BR01-1201-005`(무효) | **S-BR01-1201-005**(재사용) | 결제유예 메일 |
| 6 | `my/service-created-email.html` | `S-BR01-1201-001`(무효) | **S-BR01-1201-006** | 서비스생성 메일 |
| 7 | `my/service-suspended-email.html` | `S-BR01-1201-002`(무효) | **S-BR01-1201-007** | 서비스중지 메일 |
| 8 | `my/service-terminated-email.html` | `S-BR01-1201-003`(무효) | **S-BR01-1201-008** | 서비스중단 메일 |
| 9 | `my/usage-warning-email.html` | `S-BR01-1201-009`(무효) | **S-BR01-1201-009**(재사용) | 사용량경고 메일 |
| 10 | `my/subscription-cancel-email.html` | `S-BR01-1201-006`(무효) | **S-BR01-1201-010** | 구독취소 메일 |
| 11 | `my/subscription-expiring-email.html` | `S-BR01-1201-008`(무효) | **S-BR01-1201-011** | 만료도래 메일 |
| 12 | `my/subscription-expired-email.html` | `S-BR01-1201-007`(무효) | **S-BR01-1201-012** | 만료 메일 |

> **참고(제외 유지)**: `my/account-billing-email-code-sent-modal.html`·`account-billing-email-change.html`·`account-billing-email-complete.html`은 이메일 템플릿이 아니라 이미 화면ID가 있는 실제 화면/모달(`S-BR01-0901-002`·`S-BR01-0901-002_pu01`·`S-BR01-0901-003`)이므로 본 재배정 대상에서 제외.
> **참고 정본 관례**: `solsol-admin` storyboard(`app/utils/screenDocs.ts:110~112`)는 이메일을 `E-#-<슬러그>` 형식(예: `E-1-비밀번호-재설정-인증-메일`)의 화면ID 밖 별도 네임스페이스로 다루고 있음을 확인했다 — BR01은 이 매핑표 전체가 `S-BR01-` 접두 일관성을 유지하는 문서이므로 이번 재배정은 그 관례를 따르지 않고 `S-BR01-1201-*` 형식을 유지했다. **[미확정 TODO]** 크리에이터·브랜드 두 제품 간 이메일 화면ID 네이밍 불일치(`E-#` vs `S-BR01-1201-*`)는 오너/기획-lead가 추후 통일 여부를 결정할 사항.

### 6.4 오너 확인 필요 — `S-BR01-0801-003_pu01` vs `S-BR01-0801-001_pu01` 중복 의심

- `my/product-cancel-confirm-modal.html`의 실제 HTML 내용을 확인한 결과 파일명("컨펌")과 달리 **"구독 취소가 완료되었습니다 / 내 사이트 관리하기에서 확인하실 수 있습니다" 완료 안내 하나뿐**(취소 여부를 묻는 Y/N 버튼 없음, 확인 버튼 1개).
- 이는 이미 `docs/storyboard/solsol-brand/S-BR01-0801-003-구독취소.md`가 "`S-BR01-0801-001_pu01`(별도 화면ID로 흡수됨)"로 서술한 것과 **동일 카피**이며, `app/pages/my/product-cancel.vue:70-75`의 `useModal().alert('구독 취소가 완료되었습니다', ...)` 구현이 바로 이 문구를 재현한 것으로 보인다.
- 반면 스파이크의 **확인(Y/N) 컨펌 텍스트("정말 구독을 취소하시겠어요?", `product-cancel.vue:57-60`)는 이 mockup2 파일에 대응하는 원본이 없다** — 별도 저작(추정: `03_brand-site.md` SoT 또는 개발자 자유 작성)으로 보인다.
- **처리**: 오너 지시대로 `S-BR01-0801-003_pu01`을 신규 배정하되(§6.2 #2), storyboard 문서(`docs/storyboard/solsol-brand/S-BR01-0801-003_pu01-구독취소-완료안내.md`)에는 **실제 콘텐츠 그대로(완료 안내)** 서술하고 `S-BR01-0801-001_pu01`과의 중복 가능성을 명시했다. **[미확정 TODO]** 두 ID를 하나로 통합할지, 아니면 "0801-001_pu01=레거시 기록용·0801-003_pu01=신규 실사용"으로 역할을 분리할지는 오너/기획-lead 확인 필요.
