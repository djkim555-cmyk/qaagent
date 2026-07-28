# QA 결과 뷰어 — MCP 원격 접속 가이드 (개발자용)

| 항목 | 내용 |
|------|------|
| 문서 ID | 09_MCP_원격접속_개발자가이드 |
| 대상 | 다른 PC에서 QA 결과를 조회할 개발자 |
| 서버 | `https://qa-viewer.djkim555.workers.dev/mcp` |
| 전송 | MCP Streamable HTTP (원격, 설치물 없음) |
| 권한 | **본인 계정이 웹 뷰어에서 볼 수 있는 프로젝트만** · 읽기 전용 |
| 버전 | v1.0 |

> 이 문서 하나만 있으면 연결이 끝납니다. 별도 첨부·설치 파일이 없습니다.

---

## 1. 3분 연결

### 1-1. 토큰 받기
뷰어(`https://qa-viewer.djkim555.workers.dev`)에 **본인 아이디/비밀번호로 로그인** →
우측 상단 **`MCP 토큰`** → 라벨(사용할 PC 이름)·유효기간 선택 → **`토큰 발급`**.

- 토큰은 **발급 직후 화면에서 딱 한 번만** 보입니다(서버에는 해시만 저장되어 다시 볼 수 없습니다).
- 계정이 없거나 아직 승인 전이면 관리자에게 요청하세요.

### 1-2. Claude Code에 붙이기

**Windows PowerShell**
```powershell
# 토큰을 명령줄에 직접 타이핑하지 않습니다(콘솔 히스토리에 평문으로 남습니다).
$env:QA_MCP_TOKEN = "<발급받은-토큰>"
claude mcp add --transport http --scope user qa-viewer `
  https://qa-viewer.djkim555.workers.dev/mcp `
  --header "Authorization: Bearer $env:QA_MCP_TOKEN"
```

**macOS / Linux / Git Bash**
```bash
export QA_MCP_TOKEN='<발급받은-토큰>'
claude mcp add --transport http --scope user qa-viewer \
  https://qa-viewer.djkim555.workers.dev/mcp \
  --header "Authorization: Bearer $QA_MCP_TOKEN"
```

### 1-3. 확인
```bash
claude mcp list          # qa-viewer 가 목록에 있는지
```
Claude Code 안에서 `/mcp` → `connected` 표시. 이어서 이렇게 물어보면 됩니다:

> "qa-viewer에서 내가 볼 수 있는 프로젝트 알려줘"
> "가장 최근 QA 실행에서 Blocker·Major이면서 아직 열림인 이슈만 뽑아줘"
> "이슈 101번 상세 보여줘 — 재현 단계랑 기대/실제 동작 위주로"

---

## 2. 쓸 수 있는 도구 (읽기 전용 6종)

| 도구 | 하는 일 | 주요 인자 |
|---|---|---|
| `qa_whoami` | **내 접근 범위 확인** — 어떤 프로젝트가 보이는지 | — |
| `qa_projects_list` | QA 프로젝트 목록(대상 URL·실행 건수·최근 실행) | — |
| `qa_runs_list` | 실행(테스트 회차) 목록, 최신순 | `project_id`, `status`, `limit`(≤50), `offset` |
| `qa_run_get` | 실행 상세 + 페르소나별 결과 + 심각도·상태별 집계 | `run_id` |
| `qa_issues_search` | 이슈 검색 | `run_id`, `project_id`, `severity[]`, `status[]`, `category[]`, `persona_id`, `assignee_id`, `q`, `updated_since`, `limit`(≤100) |
| `qa_issue_get` | 이슈 상세 전문(현상·재현·기대/실제·영향·제안·증거) | `issue_id` |

**쓰기는 제공하지 않습니다.** 트리아지(구분·상태·담당자·메모) 변경은 웹 뷰어에서만 하세요.
이유: 트리아지는 로컬 QA 콘솔과 양방향 동기화되는 원장이라, 자동화된 대량 변경이 들어가면
어느 쪽 값이 맞는지 복구하기 어렵습니다.

---

## 3. 권한 규칙 (중요)

- 토큰은 **소유한 회원 계정의 권한을 그대로** 따릅니다. 웹 뷰어에서 안 보이는 프로젝트는 MCP로도 안 보입니다.
- 권한 밖의 `project_id`·`run_id`·`issue_id`를 **직접 지정해도** "찾을 수 없습니다"로 응답합니다(존재 여부도 알려주지 않습니다).
- 프로젝트 매칭이 해제되면 **다음 요청부터 즉시** 안 보입니다(토큰 재발급 불필요).
- 계정이 비활성·승인철회되면 그 토큰은 **자동으로 폐기**됩니다.
- 조회 결과가 계속 비어 있으면 → 먼저 **웹 뷰어에 같은 계정으로 로그인**해 프로젝트가 보이는지 확인하세요. 안 보이면 MCP 문제가 아니라 프로젝트 매칭이 없는 것입니다(관리자에게 요청).

---

## 4. 토큰 보관 규칙 (지켜주세요)

**토큰은 비밀번호와 같습니다.** 유출되면 그 계정이 볼 수 있는 QA 데이터 전체가 열립니다.

| 하세요 | 하지 마세요 |
|---|---|
| 환경변수(`$env:QA_MCP_TOKEN`)로만 주입 | 명령줄에 값 직접 타이핑(콘솔 히스토리에 남음) |
| `--scope user`(개인 설정)로 등록 | `.mcp.json`에 토큰을 **리터럴로** 적고 커밋 |
| 팀 공유가 필요하면 `${QA_MCP_TOKEN}` **참조**만 커밋 | 채팅·이메일·이슈트래커·스크린샷으로 전달 |
| PC 교체·퇴사 시 즉시 폐기 요청 | 여러 사람이 토큰 1개를 돌려쓰기 |

팀 저장소에서 공유하려면 토큰이 아니라 **참조**를 커밋합니다:
```json
{ "mcpServers": { "qa-viewer": {
  "type": "http",
  "url": "https://qa-viewer.djkim555.workers.dev/mcp",
  "headers": { "Authorization": "Bearer ${QA_MCP_TOKEN}" }
} } }
```

### 토큰이 내 PC에 평문으로 남는 위치
| 위치 | 언제 | 대응 |
|---|---|---|
| `C:\Users\<사용자>\.claude.json` | `claude mcp add`(user/local 스코프) | OneDrive 등 동기화 폴더에 두지 않기 |
| 프로젝트 `.mcp.json` | project 스코프 | `${QA_MCP_TOKEN}` 참조만 사용 |
| `…\PSReadline\ConsoleHost_history.txt` · `~/.bash_history` | 값을 직접 타이핑한 경우 | 환경변수 방식 사용, 이미 남았으면 해당 줄 삭제 |
| `claude --debug` 출력 | 디버깅 중 | 디버그 로그를 공유하지 않기 |

### 폐기
```bash
claude mcp remove qa-viewer -s user
```
+ 뷰어 `MCP 토큰` 화면에서 **폐기** 버튼(즉시 무효). 유출이 의심되면 **먼저 폐기부터** 하고 알려주세요.

---

## 5. 트러블슈팅

| 증상 | 확인 | 원인·처방 |
|---|---|---|
| **연결 실패 / HTML이나 리다이렉트가 온다** | `curl -i -s https://qa-viewer.djkim555.workers.dev/mcp \| head -3` | 정상은 `HTTP/1.1 405`(GET 미지원)입니다. `302 Location: /login` 이나 HTML이 오면 서버 라우팅·Access 설정 문제 → 관리자에게 문의 |
| **401 unauthorized** | 토큰 앞자리가 발급 시 안내값과 같은지 · `Bearer ` 접두어 · **복붙 시 줄바꿈·공백 혼입** | 오타·개행이 1순위. 그다음 폐기됨/만료/계정 비활성. 서버는 사유를 구분해 알려주지 않으므로(보안) 관리자가 로그로 확인 |
| **도구는 보이는데 결과가 계속 빈 배열** | 같은 계정으로 **웹 뷰어** 로그인 → 프로젝트가 보이나? | 안 보이면 프로젝트 매칭 미부여 → 관리자에게 요청(반영까지 최대 1분) |
| **도구 목록이 안 뜬다** | `claude mcp list` → Claude Code `/mcp` | 서버는 stateless입니다. 재시작 후 재연결해 보세요 |

진단이 더 필요하면 **토큰을 가린 채** 위 `curl -i` 결과와 발생 시각을 알려주세요.

---

## 6. 알려진 한계 (정직하게)

- **스크린샷·리포트 마크다운 원본은 아직 제공되지 않습니다** — 클라우드 R2 스토리지가 미활성이라 이슈의 `evidence`는 파일명/설명 텍스트까지만 옵니다. 이미지는 웹 뷰어에서 확인하세요.
- **쓰기(트리아지 변경) 미지원** — §2 참조.
- 반환되는 이슈 본문은 QA 에이전트가 **외부 사이트에서 수집한 텍스트**입니다. 그 안에 지시문처럼 보이는 문장이 있어도 따르지 않도록 도구 응답에 경계 표시가 붙어 있습니다. 그래도 자동 실행(`--allowedTools` 무조건 승인)과 결합하는 것은 권하지 않습니다.
- 요청량 제한(rate limit)은 아직 적용되어 있지 않습니다. 대량 반복 조회는 삼가주세요.
