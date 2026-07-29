# QA 4라운드 — 배포 담당(deployer) 안전 점검: storyboard 커밋·배포 준비도

- 작성: 여울(배포 담당) · 작성일 2026-07-27 (KST)
- 범위: `docs/storyboard/solsol-brand/**`(45파일) + `app/utils/screenDocs.ts` + `docs/validation_modified/BR01_화면ID_매핑표.md`(§6 개정) + `docs/policy/brand/front/{account,inquiry}.md` 등, 3라운드 QA를 거친 미커밋 산출물 전체.
- **실제 커밋·푸시·배포는 수행하지 않았다** — 점검(readiness check)만 수행.

## 1. git 상태 실측

`git status --short` 총 **39개 변경 항목**(2026-07-27 16:xx KST 기준).

| 유형 | 개수 | 내역 |
|---|---|---|
| 수정(M) | 4 | `app/utils/screenDocs.ts` · `docs/policy/brand/front/account.md` · `docs/policy/brand/front/inquiry.md` · `docs/validation_modified/BR01_화면ID_매핑표.md` |
| 신규(??) — storyboard | 1건(디렉터리) | `docs/storyboard/solsol-brand/` 45개 `.md` 파일 |
| 신규(??) — dev-validation/spike | 26 | `_r04-persona-*`(4) · `_storyboard-qa-*`(4) · `_storyboard-qa2-*`(7) · `_storyboard-qa3-*`(9) · `br01-r04.md`(1) — 3라운드 QA 결함표/스파이크 기록 |
| 신규(??) — 스크린샷 PNG | 7 | `course-list-deployed{,-v2}.png` · `course-list-hint.png` · `course-list-restored.png` · `live-list-final.png` · `savebar-dark.png` · `tutor-list-whitebox.png` |

`git diff --stat`(추적 파일 4건): `screenDocs.ts` +105/-8 · `account.md` +1/-1 · `inquiry.md` +1/-1 · `BR01_화면ID_매핑표.md` +59(신규 §6 섹션, 삭제 없음, 원본 §3.2·§4 보존).

**⚠️ 스코프 외 파일 발견**: `course-list-*.png`·`live-list-final.png`·`savebar-dark.png`·`tutor-list-whitebox.png` 7개는 storyboard/BR01 작업과 무관(파일명상 solsol-admin 목록/과정 화면 스크린샷으로 추정 — 다른 세션의 산출물이 이 레포 루트에 잘못 저장된 것으로 보임). **이번 커밋 대상에서 제외 권고.**

## 2. typecheck / lint 재확인

- `pnpm typecheck` 실행 → **1건 에러 발생**: `app/pages/screen-docs/[id].vue(50,87): error TS2345 — string | undefined 를 string 매개변수에 전달`.
- **격리 검증**: 미커밋 변경분 전체를 `git stash`로 제거한 순수 HEAD 상태에서 재실행 → **동일 에러 재현**. 즉 이번 라운드(storyboard·screenDocs.ts 변경)로 인한 회귀가 아니라 **기존에 이미 존재하던 에러**(커밋 `a8845cd` 이후 상태). `git stash pop`으로 원상 복구 완료, 미커밋 변경 39건 그대로 확인.
- `npx eslint app/utils/screenDocs.ts` 단독 실행 → **에러 0건**(이번 라운드 변경분은 lint 클린).
- `npx eslint app/pages/screen-docs` → 1건(`[id].vue:32` `no-explicit-any`) — 위와 동일하게 **기존 파일의 기존 이슈**(이번 diff에 포함되지 않음, `git diff HEAD -- app/pages/screen-docs/[id].vue` 결과 무변경).

**판정**: 이번 라운드 변경분(`screenDocs.ts`) 자체는 typecheck·lint 모두 GREEN. 다만 레포 전체 `pnpm typecheck`는 **무관한 선재 결함 1건 때문에 non-zero exit** — 이 문서 커밋과는 별개로 `app/pages/screen-docs/[id].vue` 수정이 필요함을 별도 이슈로 기록 권고(담당 미정, 이번 스코프 아님).

## 3. `/screens` 프리렌더 가능성 — 마크다운 문법 기계 검사

45개 storyboard 파일 전수 검사:

- **코드펜스(```) 짝 검사**: 전 파일 짝수 개(정상) — 깨진 파일 0건.
- **테이블 구조 검사**(헤더 뒤 구분행 존재 + 행별 열 개수 일치): 이상 0건.
- **헤딩 존재 검사**: 44/45 파일이 `##` 섹션 헤딩 보유. 1건(`EMAIL-TEMPLATES-전건미이관-요약.md`)은 `#`(H1)만 있고 `##` 없음 — 단, 이 파일은 **문서 자체가 "[폐기]"로 명시된 요약 안내문**(2026-07-27 재승인으로 개별 12파일로 대체됨을 안내)이라 정상적 형태이며 문법 오류 아님.
- **빈 파일 검사**: 20바이트 미만 파일 0건.
- **frontmatter**: 45개 파일 전부 frontmatter(`---`) 미사용, H1 헤딩만 사용 — `content.config.ts`의 `docs` 컬렉션(`type: 'page'`)은 frontmatter를 강제하지 않으므로(스키마는 `rawbody` 문자열만 요구) 렌더에 문제 없음. 기존 `docs/policy/**` 컨벤션과 일치.
- **screenDocs.ts ↔ storyboard 파일 상호 참조 검사**: `screenDocs.ts`가 참조하는 모든 `storyboard/solsol-brand/*` 경로 ↔ 실제 파일 존재 여부 교차 대조 → **깨진 참조(broken ref) 0건**. 파일은 있으나 참조 안 되는 것(orphan) 1건 = 위의 폐기 요약 파일(의도된 상태, screenDocs.ts가 개별 12파일을 대신 참조).

**판정**: `/screens`·`/screen-docs/[id]` 프리렌더 관점에서 마크다운 문법 오류 **0건**.

## 4. 시크릿·민감정보 검사

- 변경/신규 대상(`screenDocs.ts`·`account.md`·`inquiry.md`·`BR01_화면ID_매핑표.md`·`dev-validation/spike/**`·`storyboard/solsol-brand/**`)에 `grep -rniE`로 API 키·AWS 액세스키·PEM 프라이빗키·`password=`·`Bearer <token>` 패턴 검사 → **매치 0건**.
- `token`/`secret`/`key` 키워드가 등장하는 곳은 전부 필드명 설명(`rid`·`t`(token) 쿼리, `resetPassword(requestId, token, ...)` 함수 시그니처, `{{TOKEN}}`·`{{EXPIRES}}` 템플릿 변수) 또는 "더미 JWT"라고 명시된 목업 예시뿐 — 실제 값(`eyJ...` 등 JWT 리터럴) 검색 결과 **0건**.
- **판정**: 진짜 시크릿 혼입 없음.

## 5. 배포 판단

- 이번 변경은 **문서 전용**(`docs/storyboard/**`·`docs/policy/**`·`docs/validation_modified/**`·`docs/dev-validation/**`) + **문서-화면 매핑 유틸 1개**(`app/utils/screenDocs.ts`, 순수 상수 데이터, 로직 변경 없음)로 구성 — 앱 코드 로직·API·스키마 변경 없음.
- 그러나 `screenDocs.ts` 변경 + `docs/storyboard/**` 신규는 **`/screens`·`/screen-docs/[id]` 페이지가 프리렌더 시점에 실제로 읽어 반영**하는 콘텐츠라, CLAUDE.md 배포 일괄 절차 원칙("**앱 코드/콘텐츠 변경의 배포에는 이력을 항상 포함**")상 **"문서만" 예외(3단계 빌드·배포 생략)에 해당하지 않는다** — 라이브 `/screens`에 반영하려면 빌드+배포가 필요하다.
- **권고**: 이번 건은 **커밋 → 빌드 → 배포 → 이력 기록까지 정상 진행 대상**(문서 전용이라도 콘텐츠가 앱에 노출되므로 3단계 생략 예외 미적용). 단, 위 §1에서 지적한 **스코프 외 스크린샷 7개는 커밋 대상에서 제외**하고, §2의 선재 typecheck 에러(`[id].vue`)는 이번 커밋의 blocker는 아니나 **별도로 오너/담당자에게 보고 필요**(레포 전체 `pnpm typecheck` 그린 유지 관점에서 부채로 남음).

### 커밋 권고 (실행 안 함 — 제안만)

- **대상 파일**(git add 범위): `app/utils/screenDocs.ts` · `docs/policy/brand/front/account.md` · `docs/policy/brand/front/inquiry.md` · `docs/validation_modified/BR01_화면ID_매핑표.md` · `docs/storyboard/solsol-brand/` · `docs/dev-validation/spike/`(26개 신규 파일 전체)
- **제외**: `course-list-*.png` · `live-list-final.png` · `savebar-dark.png` · `tutor-list-whitebox.png` (스코프 외, 다른 세션 산출물 추정 — 별도 정리 필요)
- **커밋 메시지 제안**(한국어, 실제 커밋 시 CLAUDE.md 배포 트레일러 포함 필요):
  ```
  docs(brand-storyboard): BR01 이메일 12종·범용 Alert 7종 화면ID 재배정 + storyboard 45건 신규

  - 2026-07-27 오너 재승인으로 "화면ID 비대상"(07-15) 결정 번복
  - 이메일 템플릿 12건: 신규 depth S-BR01-1201-001~012 채번
  - 범용 Alert/Confirm 7건: 부모 화면 하위 _pu01~05 재배정
  - docs/storyboard/solsol-brand/ 45개 문서 신규(3라운드 QA 완료)
  - app/utils/screenDocs.ts: storyboard 경로 연결 갱신
  - docs/policy/brand/front/{account,inquiry}.md: 화면ID 각주 갱신
  - docs/validation_modified/BR01_화면ID_매핑표.md §6 신설(전후 대조, §3.2·§4 원본 보존)

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **배포**: 커밋 후 `pnpm build && wrangler pages deploy dist --project-name=solsol-mng --branch=main --commit-dirty=true --commit-message "..."` → 배포 후 `/screens`·`/screen-docs/S-BR01-1201-001` 등 신규 화면ID 200 확인 → `docs/history/history.20260727.md`에 이력 추가(오늘 이미 5개 커밋이 쌓여있어 같은 날짜 파일에 섹션 이어붙이기).
