# 페르소나: 보안/인증 리뷰 — br01-r04 재검증

- **페르소나**: 미쁨(security) 렌즈 — 독립 병렬 재검증
- **대상 레포/커밋**: `solsol-brand` HEAD `71f948d` (원 결함표 br01-r03 기준선 = `5e7ced2`)
- **근거 방식**: 파일 직접 Read(라인 근거 확보), 추정 배제. 프레임워크 동작(Nuxt 3.16 `navigateTo`) 실동작 기준 판정.
- **스코프**: br01-r03-D10·D11 재평가 + 인접 인증플로우(login/signup/password-reset·session BFF) 한정 자체점검

## 담당 결함 재평가

| 결함ID | 판정 | 재평가 심각도 | 근거(파일:라인) | 설명 |
|---|---|---|---|---|
| br01-r03-D10 | 실재하나 프레임워크로 완화 — **상 승격 반려** | 하 | `app/pages/login.vue:43-44` (가드 부재 사실 확인) · 완화근거 = Nuxt 3.16 `navigateTo` 기본 external 차단 · `package.json:17` (`nuxt ^3.16.0`) | 가드 자체는 원 결함표 기술대로 실제로 없다(`route.query.next`를 검증 없이 `navigateTo(next)`). 그러나 **실제 오픈리다이렉트로 이어지지 않는다**: Nuxt 3의 `navigateTo`는 외부 URL(`https://evil.com`)·프로토콜상대(`//evil.com`)를 `external:true` 없이는 **던져서 차단**한다. 여기선 `external` 미지정이고, 던진 예외는 line 46 `catch`가 받아 `formError`로만 표시 → 리다이렉트 미발생. 목업2 가드 `/^\/[^/]/`가 겨냥한 정확한 케이스(`//evil.com`·스킴 포함)를 프레임워크가 이미 막는다. 원 결함표의 "미쁨 렌즈가 '상'으로 승격 가능" 예고는 **성립하지 않음**. 심층방어·목업 정합 차원의 가드 복원 권고는 유효(하). |
| br01-r03-D11 | **현행 HEAD에서 해소됨 — 무효** | 하(정보성) | `app/pages/signup.vue:125-130` ↔ `app/pages/password-reset-new.vue:31-36` (두 `validatePassword` 완전 동일) | `5e7ced2` 당시의 "회원가입 강화 / 재설정 완화" **양방향 불일치가 현재 HEAD `71f948d`에서 사라졌다**. 두 화면 모두 동일 규칙(8~16자 + 영문·숫자·특수문자 3종)으로 통일됐고, 주석도 "05_정책설계서 확정 / brand-api isPasswordValid 동일 규칙"으로 일치. 보안 관점 잔여 리스크 없음. (부기: 16자 상한은 패스프레이즈 엔트로피를 제한하는 경미한 정책 약점이나 취약점 아님. 또한 클라 검증은 보안 경계가 아니며 실 강제는 서버 `isPasswordValid`가 담당.) |

## 추가 자체 점검에서 발견한 신규 이슈

**결론: 신규 HIGH/MEDIUM 보안 이슈 없음.** 인접 인증플로우·BFF 세션 처리는 오히려 견고하다.

확인한 항목(모두 통과):
- **세션 쿠키 처리** (`server/utils/session.ts`): refresh 토큰을 브라우저에 노출하지 않고 프론트 도메인 httpOnly 쿠키(`sb_refresh`)로만 보관. `httpOnly` + `secure`(prod) + `sameSite=lax`(L69-79). HMAC-SHA256 이중 서명 + **timing-safe 비교**(L33-38, L95). 만료 검증(L91). 프로덕션에서 `NUXT_SESSION_SECRET` 미설정 시 dev 폴백 시크릿으로 서명하지 않고 **하드 실패(500)**(L44-48) — 세션 위조 방지 정석.
- **토큰 노출**: access 토큰은 메모리 store 보관(localStorage 아님), refresh는 httpOnly라 JS 접근 불가(`useAuth.ts:89-96`). 토큰 로깅 없음.
- **CSRF**: 상태변경 EP는 전부 POST + JSON body, refresh 쿠키 `sameSite=lax`라 cross-site POST에 쿠키 미전송 → 실질적 CSRF 완화.
- **오픈리다이렉트 싱크 전수**: `next`류를 `navigateTo`에 넘기는 지점(`login.vue:44`·`purchase-card.vue:60`·`purchase-login.vue:14`) 모두 동일하게 Nuxt 기본 external 차단으로 완화. `window.location`/`location.href` 등 원시 리다이렉트 싱크 사용 0건.

참고(신규 아님·본 프론트 PR 소관 아님): `signup.vue:8-11` 주석대로 brand-api A1(signup)이 A6 `verifyToken`을 받지 않아 이메일 인증과 가입이 **암호학적으로 결속되지 않음**. 이는 이미 문서화된 backend 계약 갭이며 프론트 스파이크가 새로 만든 결함이 아니고, 서버측(brand-api) 소관 — W6에서 backend 확인 대상으로 이미 flag됨.

## 게이트 신호 (허브 앞)
- **br01-r03-D10**: 심각도 **중→하 하향** 권고, 상 승격 반려(프레임워크 완화 근거). blocker 아님. 가드 복원은 심층방어·목업 정합 개선으로 잔존.
- **br01-r03-D11**: `closed@71f948d`로 상태 정정 권고(현행 코드에서 이미 통일됨). 원장 staleness — `5e7ced2` 기준으로 기술된 결함.
- 보안 축에서 신규 blocker(상) **0건**. 인증/세션 게이트 관점 NO-GO 사유 없음.
