# Google 로그인 설정 (운영자 직접 수행)

| 항목 | 내용 |
|------|------|
| 문서 ID | 08_결과공유_클라우드뷰어_Google로그인설정 |
| 작성자 | 강도윤 (테크리드) |
| 작성일 | 2026-06-16 |
| 상태 | 운영자 실행 대기 |

> 이 계정엔 Cloudflare 도메인이 없어 Access 를 못 쓰므로, **Worker 내장 Google 로그인**으로 인증한다.
> 이메일=신원(허용목록), 트리아지 변경자도 이메일로 기록된다. 코드는 배포 완료, **아래 3개 시크릿만 채우면 로그인 활성화**.

대상 URL: **https://qa-viewer.djkim555.workers.dev**
콜백 URL(정확히 등록): **https://qa-viewer.djkim555.workers.dev/auth/callback**

---

## 1. Google OAuth 클라이언트 만들기 (브라우저)

1. https://console.cloud.google.com → 프로젝트 선택/생성(아무 이름).
2. **API 및 서비스 → OAuth 동의 화면**:
   - User Type: **External** → 만들기.
   - 앱 이름(예: QA 결과 뷰어), 사용자 지원 이메일, 개발자 연락처 입력 → 저장.
   - **Scopes**: 추가 안 해도 됨(openid/email/profile 은 기본). 저장.
   - **Test users**: 로그인할 동료 이메일들을 **테스트 사용자**로 추가(테스트 상태에서 이들만 로그인 가능. 최대 100명). → 저장.
     - (원하면 나중에 "앱 게시"로 전환 가능. email/profile 은 민감 스코프 아님 → 검증 없이 게시 가능.)
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**:
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI: `https://qa-viewer.djkim555.workers.dev/auth/callback` **정확히** 추가
   - 만들기 → **클라이언트 ID** 와 **클라이언트 보안 비밀** 복사.

---

## 2. 시크릿 3개 등록 (CR 안전한 일괄 방식 권장)

`cloud/` 폴더에서, 임시 파일 `.secret.json`(이미 .gitignore 처리됨)을 만들고 일괄 등록:

```bash
cd "c:/workspace_DJ/1. general/QA_agent_team/cloud"
```

`.secret.json` 내용(메모장/에디터로 작성, 값 채우기):
```json
{
  "GOOGLE_CLIENT_ID": "붙여넣기.apps.googleusercontent.com",
  "GOOGLE_CLIENT_SECRET": "붙여넣기",
  "ALLOWED_EMAILS": "you@gmail.com, colleague1@gmail.com, colleague2@gmail.com"
}
```
> `ALLOWED_EMAILS` 대신/추가로 도메인 전체 허용은 `"ALLOWED_DOMAIN": "malgnsoft.com"` 한 줄. 이메일·도메인 중 하나라도 맞으면 허용. (둘 다 비우면 아무도 통과 못 함 = 잠금)

등록 후 파일 삭제:
```bash
npx wrangler secret bulk .secret.json
del .secret.json        # (PowerShell: Remove-Item .secret.json)
```

> 시크릿은 `wrangler deploy` 없이 즉시 적용된다(라이브 반영). 끝나면 "등록했어요" 알려주세요 → 제가 로그인 흐름을 검증합니다.

---

## 3. 검증 (등록 후)
- 브라우저로 **https://qa-viewer.djkim555.workers.dev** → `/login` 으로 이동 → "Google로 로그인" → 허용된 계정 선택 → 뷰어 진입.
- 허용목록에 없는 계정 → "접근 권한 없음" 페이지(정상).
- 이슈 상세에서 트리아지 저장 → `updated_by` 에 로그인 이메일 기록 → 로컬 동기화 시 반영.

> 로그인이 "토큰 교환 실패"로 막히면: 리디렉션 URI 오타 또는 클라이언트 시크릿 값 확인. (드물게 CR 혼입 시 .secret.json 재등록.)
