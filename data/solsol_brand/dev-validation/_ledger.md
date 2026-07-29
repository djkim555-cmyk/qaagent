# Blocker 이월 원장 (dev-validation ledger)

모든 **상(blocker)** 결함을 라운드 간 추적하는 단일 원장. 게이트 종료조건 "blocker 0"은 여기서 검산한다.
운영 규칙 = [README.md](README.md) §4 · 절차 정본 = [../DEV_VALIDATION_PROCESS.md](../DEV_VALIDATION_PROCESS.md) §7.

- **등재**: 라운드에서 `상` 결함 발생 시 **즉시** 등재(등재시각 기재). 라운드 종료 후 소급 등재 금지(불가피 시 사유).
- **처분유형(enum 5종)**: `closed` / `이관` / `강등` / `won't-fix` / `미통과배포`. `강등`·`won't-fix`·`미통과배포`는 `승인자·사유` 공란이면 **자동 무효**.
- **검산**: 대상 = `상태=open AND 심각도=상`. `won't-fix`·`이관` 제외(제외 근거 검산 주석에 명시). 서명은 `역할:판정·근거(파일:라인)` — 파일:라인 없는 서명 무효. 실연동 close는 security·privacy 서명 필수.
- **결함ID** = `<영역>-r<NN>-D##`(축코드 접두 금지). 데이터 원인 태그 `[DDL위반]`/`[ERD드리프트]`/`[06참고오류]`.

| 결함ID | 등재시각(KST) | 발견라운드 | 추적키(+소유트랙) | 심각도 | 요약 | 상태 | 처분유형 | closed라운드 | 서명(역할:판정·근거) | 승인자·사유 |
|---|---|---|---|---|---|---|---|---|---|---|
| br01-r01-D01 | 2026-07-09 | mockup/br01-r01 | S-BR01-0501-001/002 (브랜드) | 상 | 공지/소식 목록·상세 2화면 목업2 완전 부재(폴더 없음) | closed | won't-fix(검증제외) | br01-r01 | qa(도담):조건부GO·근거 00_화면목록:358-359 | **오너**: 공지/소식 화면 **범위 제외** 결정(2026-07-09) — 검증대상 아님 |
| br01-r01-D02 | 2026-07-09 | mockup/br01-r01 | C-1 GNB 전화면공통 (브랜드) | 상 | GNB 드롭다운 hover-only·aria-expanded 부재 → 키보드만으로 하위메뉴 도달 불가(접근성) | 이관 | 이관(→implementation) | — | ux(아름):조건부GO·근거 css/base.css:1457-1461 | **오너**: 목업 완료 승인·a11y는 **구현(implementation) 라운드 이월**(2026-07-09). 구현 br01 라운드에서 재점검·해소 |
<!-- mockup/br01-r01: 초기 NO-GO(상2) → 오너 결정으로 D01 검증제외·D02 구현이관 → open blocker 0 → 판정 조건부GO. 중7·하7은 결함표 br01-r01.md(원장 미등재). -->
| br01-r03-D01 | 2026-07-15 | spike/br01-r03 | S-BR01-1001-001·0702-001 (브랜드) | 상 | 결제내역·문의내역 목록 검색이 키입력마다 실시간 필터(엔터/돋보기 클릭시만 실행하는 오너확정 공통규칙 위반), 돋보기 클릭 무동작 | open | — | — | qa(도담):게이트대기(미실시·자가검수 등재)·근거 app/pages/my/payments.vue:48-59,194,196·app/pages/my/inquiry.vue:72-77,171,173 | — |
| br01-r03-D02 | 2026-07-15 | spike/br01-r03 | S-BR01-0601-001→002 (브랜드) | 상 | 유료 플랜 "구매하기" CTA가 `/my/sites`로 오배선되어 purchase·purchase-card·purchase-login·purchase-complete·purchase-failed 5페이지가 앱 어디서도 도달 불가(고아) | open | — | — | qa(도담):게이트대기(미실시·자가검수 등재)·근거 app/pages/pricing.vue:207 | — |
| br01-r03-D03 | 2026-07-15 | spike/br01-r03 | 전 화면(추적키 자체, 브랜드) | 상 | 허브 정책문서 `docs/policy/brand/**` 화면ID 16개 중 15개 오기(근본원인=mockup2 `index.html` 카드그리드 off-by-one 수확, 허브 소관) | closed | closed | qa-verify-20260715 | qa(도담):GO·근거 검증항목 1~4 전건 PASS(아래 검산 상세) — 매핑표↔00_화면목록 §3.3 52-ID 완전일치(diff 0) · screenList.ts BR01 canonical-format 52-ID 정확일치(이메일0·제외7부재·C01존재·중복0, 근거 app/utils/screenList.ts:4831-5594) · policy/brand 5문서(13-ID)↔design/brand/review-log.md(13-ID) 1:1 완전일치(diff 0, off-by-one 잔존 0) · 추적키 1:1 누락 0 | **처분근거**: 정본 개정 커밋 `87847ad`(00_화면목록.md v1.3 + BR01_화면ID_매핑표.md 신설) + 2단계 재수확(screenList.ts 재생성·policy/brand 5문서 재기입·design/brand/review-log.md 9건 정정, 미커밋·총괄 일괄커밋 예정)을 독립검증(qa)이 grep/스크립트 카운트로 재확인. **부수발견(비blocker·심각도 하, 별건)**: screenList.ts C01(app/utils/screenList.ts:5032) 하위에 흡수 3파일 중 2개가 `S-BR01-C01·signup-privacy-modal`/`S-BR01-C01·signup-marketing-modal` 비표준 pseudo-id로 별도 modals 자식 노출 — canonical 52-ID 카운트엔 영향 없으나 `/screens` 앱 렌더 시 flat count 54(52+2)로 나타남(app/pages/screens.vue:31-32 flat() 로직, FR01 기존 `·login1` 관행과 유사). D03 종료를 막을 사유는 아니라고 판단(정정 대상=신규 결함표 별건 등재 권고, 원장 미등재 — 심각도 하) |
| br01-r04-D27 | 2026-07-27 | storyboard-qa3-a11y | S-BR01-1001-001 (브랜드) | 상 | 결제 내역(`/my/payments`) 결제상태 필터가 키보드로 절대 열리지 않음 — 트리거가 `<input readonly>`이고 열기/닫기가 전역 click 델리게이션 1건뿐이라 마우스 없이는 조작 자체 불가 | open | — | — | qa(도담):게이트대기(storyboard 3차 QA 접근성 심층 검토, 독립 페르소나)·근거 `app/plugins/interactions.client.ts:113-129`, storyboard 반영 = `S-BR01-1001-001-결제-내역.md` 디자인이슈표 | — |
<!-- spike/br01-r03: 신규 blocker 3건 등재(D01·D02·D03, 기준커밋 5e7ced2). 개발주체=브랜드 사용자단 세션 자가검수이므로 서명 게이트 효력 없음(README §2-2) — 정식 판정은 허브 독립게이트(qa·security·privacy) 소관, 상태는 그때까지 open 유지.
br01-r03-D03: 2026-07-15 허브 독립검증(qa 도담)으로 closed 전환. D01·D02는 브랜드 사용자단 실앱 회귀결함으로 이번 검증 스코프 밖(open 유지).
br01-r02-D04·D05·D06(약관/에러 화면·사이트만들기·결제이메일)는 **원장 등재대상 아님**(심각도=중, 본 원장은 상=blocker만 등재 — README §4) — 위 3건은 애초 본 원장에 존재한 적이 없어 "stale 정정"이 성립하지 않는다(코드상 `bd1f51a`로 해소된 것은 사실이나, 정정 대상은 원장이 아니라 결함표 `br01-r02.md` 자체의 상태 칸 — 본 작업으로 갱신, §보고 참조).
br01-r04-D27: 2026-07-27 storyboard(목업2→스파이크 이식 검증) 4라운드 QA 중 접근성 심층 페르소나(3차)가 신규 발견, QA게이트 메타 감사(4차)가 원장 미등재를 지적해 총괄이 등재. 실연동(blocker 0 강제) 전 반드시 해소 필요. 상세 근거 = `docs/dev-validation/spike/_storyboard-qa3-a11y.md`. -->

> **검산** @storyboard-qa4-20260727(2026-07-27, 총괄 등재·qa 독립발견): open=3 [br01-r03-D01, br01-r03-D02, br01-r04-D27] (소유트랙: 브랜드) — br01-r03-D03 closed 유지, D27 신규 open 추가. → 종료조건 미충족(**NO-GO**, D01·D02·D27 미해소) — 실앱 우회불가. 3건 모두 브랜드 사용자단 세션 소관, 별도 시정 필요.
>
> **[구] 검산** @qa-verify-20260715(2026-07-15, 허브 독립검증·qa 도담): open=2 [br01-r03-D01, br01-r03-D02] (소유트랙: 브랜드) — br01-r03-D03 closed(위 근거) 반영. → 종료조건 미충족(**NO-GO**, D01·D02 미해소) — 실앱 우회불가. D01(검색 실시간필터 정책위반)·D02(purchase 계열 5페이지 고아)는 브랜드 사용자단 세션 소관 회귀결함, 이번 D03 독립검증 스코프 밖(그대로 open 유지, 별도 시정 필요).
>
> **[구] 검산** @spike/br01-r03(2026-07-15, 자가검수·서명무효): open=3 [br01-r03-D01, br01-r03-D02, br01-r03-D03] — 위 재검산으로 대체.

> **리셋 스냅샷 (2026-07-09, KST)**: 검증 시스템 재출발로 원장 본문 리셋. **리셋 시점 open blocker = 0**(직전 검산: 쏠쏠·브랜드 전건 closed, closed 16·won't-fix 1·이관 1·open 0). 리셋 전 전체 감사추적 = **git 태그 `dev-validation-reset-20260709`**(결함표 70 + 원장 전건 복구 가능) + 원장 스냅샷 파일 [`../report/_archive/_ledger.reset-20260709.md`](../report/_archive/_ledger.reset-20260709.md). 신규 라운드는 영역별 `r01`부터.
