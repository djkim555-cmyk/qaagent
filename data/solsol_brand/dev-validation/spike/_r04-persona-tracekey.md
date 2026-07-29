# 페르소나: 추적키·커버리지 QA — br01-r04 재검증

> 작성: 도담(qa) · 기준일 2026-07-27 · solsol-brand HEAD `71f948d` · br01-r03 원 결함표 [br01-r03.md](br01-r03.md) 대비 재검증
> 스코프: D03·D14·D17·D23·D24·D26 (추적키·커버리지 렌즈) + 스크린 매트릭스 §0 축별 총량 재실측

## 1. 결함 재검증표

| 결함ID | 판정 | 근거(파일:라인) | 설명 |
|---|---|---|---|
| br01-r03-D03 | **해소(closed)** | `docs/policy/brand/_index.md:8-14`(표 정정) · `:38-64`(변경로그 "화면ID 재수확(D03 2단계)") · `front/account.md:3` `S-BR01-0901-001` · `front/payments.md:3` `S-BR01-1001-001` · `front/inquiry.md:3` `S-BR01-0701-001·0702-001·0702-002` · `front/pricing-upgrade.md:3` `S-BR01-0601-001·0601-004` · `front/sites-home-signup.md:3` `S-BR01-0401-002·0101-001·0301-001` | 5개 문서 헤더 전건 재수확 완료(2026-07-15, 또박). 원 결함이 지적한 15개 off-by-one 전부 정정 확인. 단 `docs/design/brand/review-log.md`는 같은 오기를 여전히 미러링 중이라고 변경로그(§`_index.md:60`)가 명시 — **이는 D03 스코프(허브 문서=`docs/policy/brand/**`) 밖**이라 별도 결함이며 이번 판정에 영향 없음(design 폴더 재확인은 별건 권고). |
| br01-r03-D14 | **미해소(open, 재발 없이 지속)** | `app/error.vue:3-4`("404(9001-001)·500계열(9001-002)") · `app/pages/error/system-error.vue:3`("서비스 시스템 에러(9001-002)") · `maintenance-scheduled.vue:3`("서비스 정기점검(9001-004)") · `maintenance-emergency.vue:3`("서비스 긴급점검…(9001-005)") vs SoT(`br01-r03-screen-matrix.md` §L) 정답 = 시스템에러=001·404=002·긴급점검=004·정기점검=005 | 4건 스왑 그대로 잔존: 시스템에러↔404(001↔002), 긴급↔정기점검(004↔005). 코드 수정 미착수. |
| br01-r03-D17 | **미해소(open)** | `solsol-brand-api/src/routes/auth.ts:8,10`(발송 TODO 주석 잔존) · `:565`("TODO(mail): 실제 이메일 발송 연동…게이트웨이 확정 후") · `:727`("TODO(mail): 재설정 링크 발송…") · `find solsol-brand-api -iname "*email*"`(템플릿·발송 구현 파일 0건) | brand-api 발송 로직 여전히 TODO. 스파이크 12종 이메일 템플릿 대응 0건 유지(`grep -rl` 스파이크 쪽도 미변경 확인 안 했으나 D17 자체가 brand-api 이관 대상이라 brand-api 상태만으로 판정 충분). |
| br01-r03-D23 | **미해소(open, 정당 사유 유지)** | `app/pages/my/account/billing-email.vue:145-148`(`useModal().alert('결제 이메일 변경 기능은 아직 지원되지 않습니다.', {desc:'billing_email 저장 API가 없어…'})`) · `solsol-brand-api` 전체 `grep -rn "billing_email|billingEmail" src/routes/*.ts` → 0건 | 완료 화면 미이식 그대로. 저장 EP 부재라는 정당 사유도 여전히 유효(brand-api에 관련 라우트 없음 확인). |
| br01-r03-D24 | **미해소(open, 수치 일치)** | `public/images` 121개 vs `mockup2/src/images` 100개 → 차집합 21개(원 결함 수치와 정확히 일치). 21개 중 20개는 `app/` 내 참조 0건(`grep -rl`), 1개(`ico-48px-delete.svg`)만 1건 참조 확인 | 원 결함 "21개 dead asset" 그대로. 20개는 완전 미사용, 1개는 실사용 중이라 정리 시 화이트리스트 확인 필요(원 결함표엔 세부 구분 없었음 — 정리 담당자 참고용 신규 관찰). |
| br01-r03-D26 | **미해소(open, 정황 근거)** | `mockup2/pagelists.html`·`index.html` git 이력상 마지막 변경 `6d0ec36`(2026-07-09)로 r03 기준선 커밋 `5e7ced2`(2026-07-10)보다 이전 — **목업2 카탈로그 파일 자체가 동결 상태로 변경 0건**. ① `account-card-primary-nodelete-modal.html` 파일은 존재(`find mockup2 -iname "*nodelete*"`)하나 `pagelists.html`·`index.html` 어디에도 미선언(`grep -n "account-card-primary" pagelists.html/index.html` → `account-card-primary-modal`만 매칭, nodelete 버전 0건) — 원 결함 그대로 재현 | ②초과채번 21건·③SoT ID충돌 5건은 원문서(`BR01_화면ID_매핑표.md:33`)에 ID충돌 사례 1건(`S-BR01-0801-001_pu01` 이중배정)이 언급되나 21건·5건 전체를 이번 세션에서 전건 재대조하지는 못함 — **①은 실측 확인(재현), ②③은 카탈로그 원본 무변경 정황으로 미해소 추정(전건 재수확은 미검증)**. |

## 2. 스크린 매트릭스 재실측 결과 (§0 축별 총량)

| 항목 | 매트릭스 기준값(2026-07-14, `5e7ced2`) | 실측값(현재, `71f948d`) | 비고 |
|---|---|---|---|
| 스파이크 `app/pages/` 파일 수 | 35 | **37**(`find app/pages -type f | wc -l`) | +2 |
| `app/error.vue` | 별도 1(합산 시 "35+error.vue") | 그대로 1(`app/pages/` 밖 최상위 파일, 이번 실측 대상에서 제외됨을 확인) | 변화 없음 |
| **합계(라우트 서피스)** | 36 | **38** | +2 |

- **증가 원인 100% 확인**: `git log --diff-filter=AD 5e7ced2..HEAD -- app/pages` → 파일 추가/삭제가 발생한 커밋은 **`b71a1c3` 단 1건**. 그 커밋의 `--stat`에서 신규 파일(added)은 정확히 2개 — `app/pages/about.vue`(신규, 258줄) · `app/pages/product.vue`(신규, 260줄). `my/product-cancel.vue`·`pricing.vue`는 **기존 파일 수정**(삭제/신규 아님, 각각 +35/-9·+6/-0)이라 파일 수 증가에 기여하지 않음.
- `git ls-tree -r --name-only 5e7ced2 -- app/pages | wc -l` = **35** 로 매트릭스 기준값 정확히 재현 → 매트릭스 §0 원 수치 자체는 신뢰 가능했음을 교차 확인.
- 결론: **35→37 증가는 전부 `b71a1c3`(about.vue·product.vue 신규 구현, 2026-07-16)로 설명되며 회귀·누락 없음.**

## 3. 이 렌즈에서 발견한 신규 이슈

- **D24 세부 관찰(신규, 하)**: 원 결함표는 "21개 dead asset"으로 뭉뚱그렸으나, 실제로는 20개 완전 미사용 + 1개(`ico-48px-delete.svg`) 실사용 중. 향후 자산 정리 작업 시 이 1건을 오삭제하지 않도록 화이트리스트 처리 필요(담당: 나래 또는 자산 정리 담당, 별도 결함 등재는 D24 갱신으로 충분— 신규 결함ID 불필요).
- **D26 범위 한계 고지**: 이번 세션은 시간·스코프상 ①(미선언 파일)만 재현 확인했고, ②(초과채번 21건)·③(SoT ID충돌 5건)은 목업2 카탈로그 원본이 무변경임을 근거로 "미해소 추정"했을 뿐 전건 재대조는 하지 않았다. 전건 재검증이 필요하면 별도 세션에 위임 권고.
- 그 외 신규 이슈 없음(담당 결함ID 6건 + 매트릭스 재실측 범위에서 추가 발견 없음).
