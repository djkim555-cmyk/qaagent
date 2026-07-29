# 브랜드 사용자단 화면 현재 상태 비교 (4축 전수) — 2026-07-16

> **목적**: `solsol-brand` 사용자단 화면을 **정책서/SoT · 목업2 · 스파이크(실앱) · 허브앱(/screens)** 4축에서 전수 실측 비교해 현재 갭을 확정한다.
> **기준일**: 2026-07-16 (오늘 반영분 — SoT 45→52 개정 반영 상태 + 신규 3화면(`0102-001`·`0103-001`·`0801-001_pu01`) 실앱 구현·배포(`b71a1c3`, 프로덕션 `eb81c73f`) 포함)
> **작성**: 도담(qa) · 검증 방식 = 코드/문서 실측(추정 금지) — 파일 트리 `find` 실행, 소스 `grep`/`Read`, 커밋 이력 `git log` 대조
> **이 문서는 기존 `docs/dev-validation/spike/br01-r03-screen-matrix.md`(4축·2026-07-14 작성·SoT45 기준·stale)를 대체하는 52-기준 현행판**이다. 원 문서는 자체 경고문(상단)에 "SoT=45→52 개정으로 전체 재작업 필요"를 명시하고 있었다.

## 0. 4축 정의 및 근거

| 축 | 정의 | 근거 파일(실측) |
| --- | --- | --- |
| **① 정책서/SoT** | `S-BR01-*` 화면ID 체계, **52건**(본화면45 + 모달/팝업7)이 현재 정본 | `docs/validation_modified/00_화면목록.md` §3.3(라인 343~441, v1.3 개정) · `BR01_화면ID_매핑표.md`(채번 근거·07-16 addendum) · `docs/policy/brand/**` · `docs/validation/03_brand-site.md`(화면 정의 원본) |
| **② 목업2** | 정적 목업 파일 실체, **66뷰**(페이지39 + 모달15 + 이메일12) | `solsol-brand/mockup2/src/views/**` — `find` 실측 66개 파일 |
| **③ 스파이크(실앱)** | `solsol-brand/app/pages/**` 실제 route 파일 | `find` 실측 **37개** route 파일(오늘 추가된 `about.vue`·`product.vue` 포함) + 모달은 `app/components/modal/**`(3개: `SolsolModal`·`TermsModal`·`AccountDeleteModal`)로 흡수 |
| **④ 허브앱 /screens** | `solsol-mng`(본 관리 허브) `app/utils/screenList.ts`의 `key:"brand-front"` 섹션이 `https://solsol-mng.pages.dev/screens`에 렌더하는 브랜드 사용자단 화면 레지스트리. 고유 화면ID **52개**(SoT 52건과 완전 정합, pseudo-id 2건은 07-16 제거) → flat 렌더 52행 | `solsol-mng/app/utils/screenList.ts:4831-5594`(실측) |

**화면ID 정본 = ①**(validation_modified, 52건)이며, 본 문서의 모든 행은 이 52개 화면ID를 기준으로 조인한다. 목업2·스파이크에만 있고 SoT 비대상인 항목(이메일12·범용제외7)은 별도 섹션(§3-4)에 누락 없이 기록한다. ④ 허브앱 /screens는 §1 note와 같이 D03 시정 이후 ①과 사실상 1:1이므로, 별도 조인 없이 ①의 52건 각 행에 존재 여부만 부기한다.

---

## 1. 총량 요약

| 축 | 건수 | 세부 |
| --- | ---: | --- |
| ① SoT(정책서) | **52** | 본화면 45 + 모달/팝업 7(부모종속6+공유C01) |
| ② 목업2 | **66** | 페이지 39 + 모달조각 15 + 이메일템플릿 12 |
| ③ 스파이크 route | **37** | `.vue` 페이지 파일(오늘 `about.vue`·`product.vue` 포함) — 모달은 컴포넌트 3개로 별도 흡수 |
| ④ 허브앱 /screens | **52** | 화면ID 52(pseudo 정리 완료) |

### 3축 교집합·차집합 (SoT 화면ID 52건 기준 조인)

| 구분 | 건수 | 내용 |
| --- | ---: | --- |
| **① SoT ∩ ② 목업2 ∩ ③ 스파이크**(스파이크 어떤 형태로든 존재) | **44** | 페이지 38 + 모달 6 — 상태는 ✅완전구현부터 ⚠️MOCK·🔶고아까지 스펙트럼 존재(§3-1·§3-2) |
| **① SoT ∩ ② 목업2, ③ 스파이크 없음**(진짜 누락) | **1** | `S-BR01-0901-003`(결제 이메일 변경 완료) — D23, `useModal().alert`로 대체 |
| **① SoT만(② 목업2 없음), 이번에 ③ 스파이크로 해소** | **3** | `0102-001`(플랫폼소개)·`0103-001`(프로덕트)·`0801-001_pu01`(구독취소완료) — 오늘(07-16) 목업2 생략하고 실앱 직접 구현·배포 |
| **① SoT만(② 목업2 없음, ③ 스파이크도 없음)** | **4** | `0104-001`·`0105-001`(실사이트 대체, 설계 불필요) · `0501-001`·`0501-002`(공지/소식, 오너 won't-fix) — **정당 사유 있는 비갭** |
| **② 목업2만(① SoT 비대상)** | **19** | 이메일템플릿 12(화면ID 비대상 명문화) + 범용 Alert/Confirm 제외 7(카드모달4·계정삭제·구독취소컨펌·파일용량초과) |
| **③ 스파이크 고아**(①②③ 모두 존재하나 진입 배선 없음) | **4** | `0601-002`·`0601-003`·`0601-005`·`0601-008`(purchase 계열) — D02, `pricing.vue` CTA가 `/my/sites`로 우회해 도달 불가 |

검산: 52(SoT) = 44(3축교집합) + 1(진짜누락) + 3(오늘해소) + 4(정당비갭). 목업2 66 = 39(페이지, 이 중 38이 SoT 페이지와 매칭+1은 0901-003 목업2엔 있으나 스파이크 없음) 오차 없음. 모달15 = 8(SoT 6개ID로 귀결, C01이 3파일 흡수) + 7(범용제외). 이메일12는 전건 비대상.

> **④ 허브앱 정합**: D03 시정(00_화면목록.md v1.3) 이후 허브앱 `/screens`는 SoT와 1:1 정합됐다 — flat도 52·완전 정합(C01 pseudo-id 2건 07-16 제거). 과거 stale matrix(`spike/br01-r03-screen-matrix.md`, 65건·off-by-one)에서 정정됨.

---

## 2. 전수 비교 표

**상태값 규약**: ✅구현 / ⚠️MOCK(화면 존재·계약 부재) / 🔶고아(구현됐으나 진입 배선 없음) / ❌미구현 / 🟡흡수(전용 라우트 없이 컴포넌트/모달로 흡수, 기능은 존재) / —(비대상)

### 2-1. 본화면 45건

| 화면ID | 화면명 | 유형 | 정책서(SoT) | 목업2(파일) | 스파이크(route·구현상태) | ④ 허브앱(/screens) | 상태/갭 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S-BR01-0101-001 | 메인(랜딩) | 페이지 | ✅ 증류완료 | ✅ `home/index.html` | ✅ `/` | ✓ | ✅구현 |
| S-BR01-0102-001 | 플랫폼 소개 | 페이지 | ✅(목업2 미대응) | ❌ 없음 | ✅ `/about`(**07-16 신규**) | ✓ | ✅구현 — 목업2 생략, 실앱 직접(오너결정 07-16). 배포 `eb81c73f` |
| S-BR01-0103-001 | 프로덕트 | 페이지 | ✅(구 미설계) | ❌ 없음 | ✅ `/product`(**07-16 신규**) | ✓ | ✅구현 — 동일. "미설계" 상태 종료 |
| S-BR01-0104-001 | 데모보기 | 페이지 | — 실사이트 대체 | ❌ 없음 | ❌ 없음 | ✓ | — 비대상(라이브 배포본 `creatorlms-brand.pages.dev`로 대체, 설계 불필요) |
| S-BR01-0105-001 | 주요기능 소개 | 페이지 | — 실사이트 대체 | ❌ 없음 | ❌ 없음 | ✓ | — 비대상(동일) |
| S-BR01-0301-001 | 회원가입 - Free | 페이지 | ✅ | ✅ `auth/signup.html` | ✅ `/signup` | ✓ | ⚠️일부(D11 비번규칙 강화 불일치, 중) |
| S-BR01-0301-002 | 회원가입 동의 통합폼 | 페이지 | ✅ | ✅ `auth/signup-terms.html` | 🟡 `TermsModal` 흡수(전용 라우트 없음) | ✓ | 🟡흡수(기능 존재) |
| S-BR01-0301-003 | 회원가입 완료 | 페이지 | ✅ | ✅ `auth/signup-complete.html` | ✅ `/signup-complete` | ✓ | ✅구현 |
| S-BR01-0302-001 | 로그인 | 페이지 | ✅ | ✅ `auth/login.html` | ✅ `/login` | ✓ | ⚠️일부(D10 오픈리다이렉트 가드 누락, 중·보안) |
| S-BR01-0302-002 | 비밀번호 재설정(인증메일) | 페이지 | ✅ | ✅ `auth/password-reset.html` | ✅ `/password-reset` | ✓ | ✅구현 |
| S-BR01-0302-003 | 새 비밀번호 설정 | 페이지 | ✅ | ✅ `auth/password-reset-new.html` | ✅ `/password-reset-new` | ✓ | ⚠️일부(D11 규칙 완화 불일치, 중) |
| S-BR01-0302-005 | 재설정 메일 발송 완료(신규) | 페이지 | ✅(대기·신규) | ✅ `auth/password-reset-sent.html` | ✅ `/password-reset-sent` | ✓ | ✅구현 |
| S-BR01-0401-001 | 내 사이트 만들기 | 페이지 | ✅ | ✅ `my/sites-create.html` | ✅ `/my/sites/create` | ✓ | ✅구현 |
| S-BR01-0401-002 | 내 사이트 관리(목록) | 페이지 | ✅ | ✅ `my/sites.html` | ✅ `/my/sites` | ✓ | ⚠️일부(D06 구독기간·경고배너 소실, 중) |
| S-BR01-0501-001 | 공지/소식 목록 | 페이지 | ✅(목업2 미대응) | ❌ 없음 | ❌ 없음 | ✓ | — won't-fix(오너 확정, br01-r01-D01) |
| S-BR01-0501-002 | 공지/소식 상세 | 페이지 | ✅(목업2 미대응) | ❌ 없음 | ❌ 없음 | ✓ | — won't-fix(동일) |
| S-BR01-0601-001 | 가격(요금제) | 페이지 | ✅ | ✅ `payment/pricing.html` | ✅ `/pricing` | ✓ | ⚠️일부(**D02 유료 CTA가 `/my/sites`로 오배선 — 상**, purchase 5화면 고아의 원인) |
| S-BR01-0601-002 | 유료플랜 구매하기 | 페이지 | ✅ | ✅ `payment/purchase.html` | ✅ `/purchase` | ✓ | 🔶고아(D02 — 구현은 완료, 진입 불가) |
| S-BR01-0601-003 | 결제 완료 | 페이지 | ✅(범위확장, 0601-004 구의미 흡수) | ✅ `payment/purchase-complete.html` | ✅ `/purchase-complete` | ✓ | 🔶고아(D02) |
| S-BR01-0601-004 | 플랜 업그레이드/주기변경(재정의) | 페이지 | ✅(대기·재정의) | ✅ `my/product-upgrade-cycle.html` | ⚠️ `/my/product-upgrade-cycle` | ✓ | ⚠️MOCK(비례정산 견적 MOCK, D07 결제안내블록 누락 중) |
| S-BR01-0601-005 | 결제 실패 | 페이지 | ✅ | ✅ `payment/purchase-failed.html` | ✅ `/purchase-failed` | ✓ | 🔶고아(D02) |
| S-BR01-0601-006 | 가격표(홈 리다이렉트 스텁, 신규) | 페이지 | ✅(대기·신규) | ✅ `home/pricing.html`(스텁) | 🟡 `/pricing` 통합 | ✓ | 🟡흡수 |
| S-BR01-0601-007 | 카드 등록(신규) | 페이지 | ✅(대기·신규) | ⚠️ `payment/purchase-card.html`(원본 빈 스텁) | ⚠️ `/purchase-card` | ✓ | ⚠️MOCK(원본부터 계약 미비, staging) |
| S-BR01-0601-008 | 로그인(구매 전용, 신규) | 페이지 | ✅(대기·신규) | ✅ `payment/purchase-login.html` | ✅ `/purchase-login` | ✓ | 🔶고아(D02) |
| S-BR01-0701-001 | 문의하기 | 페이지 | ✅ | ✅ `inquiry/inquiry.html` | ✅ `/inquiry` | ✓ | ⚠️경미(D21 필수표시 `*` 누락, 하) |
| S-BR01-0701-002 | 문의하기 접수 완료 | 페이지 | ✅ | ✅ `inquiry/inquiry-complete.html` | ✅ `/inquiry-complete` | ✓ | ✅구현 |
| S-BR01-0702-001 | 문의 내역(목록) | 페이지 | ✅ | ✅ `my/inquiry.html` | ✅ `/my/inquiry` | ✓ | ⚠️일부(**D01 검색 정책위반 — 상**, D05 케밥 누락 중) |
| S-BR01-0702-002 | 문의 내역 상세 | 페이지 | ✅ | ✅ `my/inquiry-detail.html` | ⚠️ `/my/inquiry-detail` | ✓ | ⚠️MOCK(수정·삭제 MOCK, D08 답변 케밥 소실 중) |
| S-BR01-0801-001 | 자동 연장하기 | 페이지 | ✅(범위협소화) | ✅ `my/product-auto-renew.html` | ✅ `/my/product-auto-renew` | ✓ | ⚠️경미(D19 등급배지 누락, 하) |
| S-BR01-0801-002 | 즉시 결제 | 페이지 | ✅(범위협소화) | ✅ `my/product-pay-now.html` | ✅ `/my/product-pay-now` | ✓ | ⚠️일부(D07 결제안내블록 누락, 중) |
| S-BR01-0801-003 | 구독 취소 | 페이지 | ✅(대기·신규) | ✅ `my/product-cancel.html` | ✅ `/my/product-cancel` | ✓ | ✅구현(**07-16부터 실 API 호출 활성화** — `DELETE /api/subscriptions/:id` mode=expire, 이전 "미호출" 방침을 오너 승인으로 번복) |
| S-BR01-0901-001 | 계정관리 | 페이지 | ✅ | ✅ `my/account.html` | ✅ `/my/account` | ✓ | ✅구현 |
| S-BR01-0901-002 | 결제 이메일 변경 | 페이지 | ✅ | ✅ `my/account-billing-email-change.html` | ⚠️ `/my/account/billing-email` | ✓ | ⚠️MOCK(저장 EP 부재) |
| S-BR01-0901-003 | 결제 이메일 변경 완료(신규) | 페이지 | ✅(대기·신규) | ✅ `my/account-billing-email-complete.html` | ❌ 없음 | ✓ | **❌미구현(D23, 유일한 "진짜 누락")** — `useModal().alert`로 대체, 저장 EP 부재가 근본원인 |
| S-BR01-1001-001 | 결제 내역 | 페이지 | ✅ | ✅ `my/payments.html` | ✅ `/my/payments` | ✓ | ⚠️일부(**D01 검색 정책위반 — 상**, D04 필터 3종→1종 중) |
| S-BR01-1101-001 | 이용약관 | 페이지 | ✅ | ✅ `footer/terms.html` | ✅ `/terms` | ✓ | ✅구현 |
| S-BR01-1101-002 | 무료약정 약관 | 페이지 | ✅ | ✅ `footer/terms-free.html` | ✅ `/terms-free` | ✓ | ✅구현 |
| S-BR01-1101-003 | 유료약정 약관 | 페이지 | ✅ | ✅ `footer/terms-paid.html` | ✅ `/terms-paid` | ✓ | ✅구현 |
| S-BR01-1101-004 | 개인정보처리방침 | 페이지 | ✅ | ✅ `footer/privacy.html` | ✅ `/privacy` | ✓ | ✅구현 |
| S-BR01-1101-005 | 마케팅 수신 동의 | 페이지 | ✅ | ✅ `footer/marketing-consent.html` | ✅ `/marketing-consent` | ✓ | ✅구현 |
| S-BR01-9001-001 | 시스템 에러 | 페이지 | ✅ | ✅ `error/system-error.html` | ✅ `/error/system-error` | ✓ | ⚠️경미(D14 화면ID 주석 오기, 하) |
| S-BR01-9001-002 | 404 | 페이지 | ✅ | ✅ `error/404.html` | 🟡 `app/error.vue` 분기(전용 라우트 없음, 동작 동등) | ✓ | 🟡흡수 |
| S-BR01-9001-003 | 네트워크 오류 | 페이지 | ✅ | ✅ `error/network-error.html` | ✅ `/error/network-error` | ✓ | ✅구현 |
| S-BR01-9001-004 | 서비스 긴급점검 | 페이지 | ✅ | ✅ `error/maintenance-emergency.html` | ✅ `/error/maintenance-emergency` | ✓ | ⚠️경미(D14 ID 오기, 하) |
| S-BR01-9001-005 | 서비스 정기점검 | 페이지 | ✅ | ✅ `error/maintenance-scheduled.html` | ✅ `/error/maintenance-scheduled` | ✓ | ⚠️경미(D14 ID 오기, 하) |

### 2-2. 모달/팝업 7건

| 화면ID | 화면명 | 유형 | 정책서(SoT) | 목업2(파일) | 스파이크(구현상태) | ④ 허브앱(/screens) | 상태/갭 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S-BR01-0301-002_pu01 | 인증코드 발송 PU | 모달(LPU) | ✅ | ✅ `auth/signup-code-sent-modal.html` | 🟡 `useModal().alert` | ✓ | ⚠️경미(D12 문구 "3분내"→"10분내" 변경, 중) |
| S-BR01-0302-003_pu01 | 새 비밀번호 완료 컨펌 | 모달(LPU) | ✅ | ✅ `auth/password-reset-complete-modal.html` | 🟡 `useModal().alert` | ✓ | 🟡흡수 |
| S-BR01-0401-001_pu01 | 도메인 중복확인 - 사용가능 | 모달(LPU) | ✅ | ✅ `my/sites-create-domain-available-modal.html` | ⚠️ MOCK | ✓ | ⚠️MOCK(중복확인 EP 부재) |
| S-BR01-0401-001_pu02 | 도메인 중복확인 - 사용불가(신규) | 모달(LPU) | ✅(신규) | ✅ `my/sites-create-domain-taken-modal.html` | ⚠️ MOCK | ✓ | ⚠️MOCK(동일) |
| S-BR01-0801-001_pu01 | 구독 취소 완료 | 모달(LPU) | ✅(목업2 미대응) | ❌ 없음 | ✅ `my/product-cancel.vue` 흡수(**07-16 신규**) | ✓ | ✅구현 — 목업2 없이 실앱 직접, 실 API 호출과 함께 활성화(§2-1 0801-003 참조) |
| S-BR01-0901-002_pu01 | 결제이메일 인증코드 PU | 모달(LPU) | ✅ | ✅ `my/account-billing-email-code-sent-modal.html` | 🟡 `useModal().alert` | ✓ | ⚠️경미(D12 문구 동일 이슈) |
| S-BR01-C01 | 약관 상세보기 모달(공유) | 모달(LPU 공유) | ✅ | ✅ 3파일(`signup-terms/-privacy/-marketing-modal.html`) | 🟡 `TermsModal` | ✓ | 🟡흡수 — 3변형(약관·개인정보·마케팅) 흡수·단일 화면ID |

### 2-3. 목업2에만 있는 이메일 템플릿 12건 (SoT 비대상 — 누락 아님)

| 목업2 파일 | 용도 | SoT | 스파이크/brand-api | 비고 |
| --- | --- | :-: | :-: | --- |
| `auth/signup-certification-email.html` | 회원가입 인증코드 메일 | — 비대상 | ❌ 0건 | D17 — brand-api 발송 로직 자체가 TODO |
| `auth/password-reset-email.html` | 비밀번호 재설정 인증메일 | — 비대상 | ❌ | 동일 |
| `payment/purchase-complete-email.html` | 결제완료 메일 | — 비대상 | ❌ | 동일 |
| `my/product-payment-failed-email.html` | 결제실패 메일 | — 비대상 | ❌ | 동일 |
| `my/product-payment-grace-email.html` | 결제유예 메일 | — 비대상 | ❌ | 동일 |
| `my/service-created-email.html` | 서비스 생성 축하 메일 | — 비대상 | ❌ | 동일 |
| `my/service-suspended-email.html` | 서비스 중지 메일 | — 비대상 | ❌ | 동일 |
| `my/service-terminated-email.html` | 서비스 전면중단 메일 | — 비대상 | ❌ | 동일 |
| `my/subscription-cancel-email.html` | 구독취소 안내 메일 | — 비대상 | ❌ | 동일 |
| `my/subscription-expiring-email.html` | 만료 도래 메일 | — 비대상 | ❌ | 동일 |
| `my/subscription-expired-email.html` | 만료 안내 메일 | — 비대상 | ❌ | 동일 |
| `my/usage-warning-email.html` | 사용량 경고 메일 | — 비대상 | ❌ | 동일 |

> `00_화면목록.md` §3.3.1이 "화면ID 비대상" 명문화(v1.3, 오너결정). 12건 전부 `screenList.ts`가 과거 잘못 부여한 화면ID(`0301-004`·`0302-004`·`0601-009`·`1201-001~009`)는 무효화됨.

### 2-4. 목업2에만 있는 범용 Alert/Confirm 모달 7건 (SoT 비대상 — 누락 아님)

| 목업2 파일 | 성격 | SoT | 근거(제외 규칙) |
| --- | --- | :-: | --- |
| `inquiry/inquiry-file-size-modal.html` | 파일용량초과 Alert | — 비대상 | `00_화면목록.md` §3.3.2 각주 기제외 |
| `my/account-delete-modal.html` | 계정삭제 컨펌 | — 비대상 | 동일 |
| `my/product-cancel-confirm-modal.html` | 구독취소 컨펌 | — 비대상 | 동일(`0801-001_pu01`은 §2-2 별개 항목이 정당 소유) |
| `my/account-card-primary-modal.html` | 카드 대표설정 확인 | — 비대상 | v1.3 카드모달 4종 재확인 제외 |
| `my/account-card-delete-modal.html` | 카드 삭제 확인 | — 비대상 | 동일 |
| `my/account-card-min-modal.html` | 카드 최소 1개 유지 안내 | — 비대상 | 동일 |
| `my/account-card-primary-nodelete-modal.html` | 대표카드 삭제불가 안내 | — 비대상 | 동일 |

---

## 3. 갭 분석

### (a) 3축 모두 존재(SoT+목업2+스파이크) — 44건

페이지 38 + 모달 6. 상태는 ✅완전구현(약관5·에러4·인증계열 다수)부터 ⚠️MOCK·🔶고아까지 폭넓다. **핵심 발견: "페이지가 없는 것"은 문제의 본질이 아니고, "존재하는 페이지 안의 특정 기능·배선이 빠진 것"이 문제다**(br01-r03.md §3 관찰과 일치).

- **🔶 스파이크 고아 4건**(구현은 끝났으나 진입 불가): `0601-002`(purchase)·`0601-003`(purchase-complete)·`0601-005`(purchase-failed)·`0601-008`(purchase-login). 원인 = `pricing.vue`의 유료 CTA가 `/login?next=/my/sites`로 오배선(**D02, 심각도 상, open**). `/my/sites`를 경유하는 것이 의도된 재설계라면 정책서 갱신이 필요하고, 아니라면 CTA 복원이 필요.
- **⚠️MOCK 잔존 6건**: `0601-004`(업그레이드 비례정산)·`0601-007`(카드등록, 원본부터 빈 스텁)·`0702-002`(문의상세 수정·삭제)·`0901-002`(결제이메일 저장)·`0401-001_pu01`·`0401-001_pu02`(도메인 중복확인 2건).
- **open blocker(상) 2건 위치**: `D01`(검색 정책위반) — `app/pages/my/payments.vue`·`app/pages/my/inquiry.vue` / `D02`(유료 CTA 오배선) — `app/pages/pricing.vue:207`. 두 건 모두 `docs/history/history.20260716.md` §7 "남은 open blocker"로 재확인됨.
- 코드 실측: `MockBadge` 컴포넌트가 삽입된 페이지 **18개**(`grep -rl MockBadge app/pages/`) — 단, 이는 페이지 전체가 아니라 페이지 내 특정 기능 단위(카드결제·비번재설정 안내 등)에 붙은 부분 MOCK 표시가 다수 포함되어 위 "MOCK 6건"보다 넓은 집합이다.

### (b) SoT+목업2만(스파이크 미구현) — 1건

- **`S-BR01-0901-003`(결제 이메일 변경 완료)** — 목업2 파일(`my/account-billing-email-complete.html`)은 있으나 스파이크에 대응 페이지 없음(D23, `useModal().alert`로 대체). 근본원인 = `billing_email` 저장 EP 자체가 부재해 성공 케이스가 아직 존재하지 않음(무음 성공 위장은 아님, 정당 사유는 있으나 여전히 미구현 상태). **이번 3축 비교에서 확인된 유일한 "진짜 페이지 누락"**.

### (c) SoT만(목업2·스파이크 둘 다 없음 = 레거시/정당 비갭) — 4건

- `0104-001`(데모보기)·`0105-001`(주요기능 소개) — 라이브 배포본(`creatorlms-brand.pages.dev`) 대체, 설계 자체 불필요.
- `0501-001`·`0501-002`(공지/소식 목록·상세) — 오너 won't-fix 기결정(`br01-r01-D01`), 재계상 안 함.

### (d) 목업2만(SoT 비대상) — 19건

- 이메일 템플릿 12건(§2-3) — 화면ID 비대상 명문화(v1.3). 단 **brand-api 발송 로직 자체가 TODO**(D17)로, "화면 비대상"과 별개로 **기능 이관 공백**은 실재한다(이관 대상으로 백로그 등재됨, 담당 바탕).
- 범용 Alert/Confirm 모달 7건(§2-4) — 콘텐츠 없는 단순 확인창으로 규칙상 화면ID 미부여, 스파이크에는 `useModal().confirm/alert`·`AccountDeleteModal` 등 공용 컴포넌트로 흡수돼 있어 기능 자체는 존재.

### (e) 오늘(07-16) 해소된 3건 — SoT만(목업2 없음) → SoT+스파이크(목업2 생략)

- `0102-001`(플랫폼 소개, `/about`) · `0103-001`(프로덕트, `/product`) · `0801-001_pu01`(구독취소 완료, `my/product-cancel.vue` 흡수) — 목업2 단계를 건너뛰고 실앱에 직접 구현·배포. 상세는 §4.

---

## 4. 오늘(07-16) 변화 요약

1. **SoT 45→52 개정 반영**: `00_화면목록.md` v1.3(2026-07-15 커밋)이 이미 BR01 본화면 39→45(+6)·모달 6→7(+1)로 목업2 실체(66뷰) 기준 정합화를 완료한 상태였고(D03 시정), 본 문서는 이 52-체계를 기준선으로 채택했다.
   - ⚠️ **문서 동기화 잔여**: `00_화면목록.md` 본문(라인 349~350)은 아직 `0102-001`을 "목업2 미대응·오너 확인 대기", `0103-001`을 "미설계"로 서술하고 있어 **오늘의 구현 완료 사실이 SoT 본문에 반영되지 않은 상태**다(반영은 `BR01_화면ID_매핑표.md` §2-1의 2026-07-16 addendum에만 있음). 또박(tech-writer) 또는 후속 세션이 `00_화면목록.md` 본문 갱신 필요.
2. **신규 3화면 구현·배포**로 갭이 아래와 같이 줄었다:
   - `0102-001`·`0103-001`: "SoT만 존재(목업2 없음, 스파이크 없음)" → "SoT+스파이크 존재(목업2 생략)" — **§3(c) 레거시 4건에서 §3(e) 해소 3건으로 이동**.
   - `0801-001_pu01`: 동일 패턴. 이 화면은 완료 모달을 "정직하게" 띄우기 위해 **`DELETE /api/subscriptions/:id` 실 API 호출도 함께 활성화**(오너 07-16 승인, 이전 "미호출" 방침 번복) — 부수효과로 `0801-003`(구독취소 페이지)도 ⚠️MOCK→✅구현으로 격상됐다.
   - 결과: 이전 4건이던 "정당 비갭(레거시)" 중 3건이 실제 구현으로 전환, 나머지 1건(`0104`·`0105`·`0501`×2 중 3건은 그대로, 정확히는 4건 레거시에서 3건이 빠져나가 §3(c)는 4건 유지 — `0104-001`·`0105-001`·`0501-001`·`0501-002`만 남음)로 재편.
3. **남은 open blocker는 D01(검색 정책위반)·D02(유료 CTA 오배선) 2건**으로, 오늘 작업 범위 밖이었으며 `docs/history/history.20260716.md` §7에서도 재확인된다. 진짜 페이지 누락은 `0901-003`(D23) 1건만 남았다.
4. **④ 허브앱(/screens) 정합 확인**: `solsol-mng/app/utils/screenList.ts`의 `key:"brand-front"` 섹션은 D03 시정(`00_화면목록.md` v1.3) 이후 SoT 52건과 1:1로 정합됐다 — 과거 `spike/br01-r03-screen-matrix.md`(4축·07-14 작성)의 stale 65건·off-by-one 문제는 더 이상 존재하지 않는다. **C01 pseudo-id 2건 제거 완료(07-16), ④ 허브앱 = SoT 52 완전 정합**.

---

## 5. 참고 자료(실측 근거)

- 파일 트리 실측: `find solsol-brand/mockup2/src/views -type f`(66) · `find solsol-brand/app/pages -type f`(37)
- SoT 원문: `docs/validation_modified/00_화면목록.md` 라인 343~441 · `BR01_화면ID_매핑표.md` 전문
- ④ 허브앱 실측: `solsol-mng/app/utils/screenList.ts:4831-5594`(`key:"brand-front"` 섹션, 화면ID 52 = flat 52행, pseudo-id 2건 07-16 제거)
- 결함표: `docs/dev-validation/spike/br01-r03.md`(D01~D26, 26건 — 상3·중14·하9) · 구 4축 대조표(stale) `docs/dev-validation/spike/br01-r03-screen-matrix.md`
- 오늘 작업 이력: `docs/history/history.20260716.md`
- 코드 실측: `git log --oneline` (`solsol-brand`, 커밋 `b71a1c3` 확인) · `grep -n "to=\"/login" app/pages/pricing.vue`(D02 재확인, 여전히 `/my/sites`) · `grep -rn "billing-email-complete" app/`(0건, D23 재확인) · `grep -n "DELETE\|api/subscriptions" app/pages/my/product-cancel.vue`(실 호출 코드 확인)
