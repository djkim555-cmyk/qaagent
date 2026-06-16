# 사내 서버 배포 가이드

QA 에이전트팀 webapp 을 **사내 서버에서 상시 운영**하기 위한 절차입니다.
인터넷 연결이 가능한 환경 기준이며, Linux / Windows Server 양쪽을 다룹니다.

> 이 앱은 단일 Node 프로세스(Express + 내장 SQLite + Agent SDK + Playwright)로
> 한 머신에서 전부 동작합니다. Cloudflare Workers/D1 같은 별도 인프라가 필요 없습니다.

---

## 0. 사전 요구사항

| 항목 | 요구 | 비고 |
|---|---|---|
| **Node.js** | **24 LTS 권장** (최소 22.5) | DB가 `node:sqlite` 사용 → 18·20 불가. 22대는 `--experimental-sqlite` 플래그 필요 |
| 메모리 | 2GB+ (페르소나 동시 실행 시 Chromium 다중 구동) | `QA_CONCURRENCY` 로 조절 |
| 디스크 | 리포트/스크린샷 누적 — `reports/runs/` 증가 고려 | 정기 정리/백업 |
| 아웃바운드 | `api.anthropic.com` (Agent SDK), 첫 실행 시 npm/Playwright 다운로드 | 인터넷 가능 환경이므로 OK |

확인:
```bash
node -v    # v24.x 이상 권장
```

---

## 1. 코드 배치 & 의존성 설치

저장소 루트(`QA 에이전트팀/`) 전체를 서버에 둡니다. webapp 은 상위의
`personas/`, `scenarios/`, `reports/`, `.claude/` 를 읽으므로 **루트째로** 옮겨야 합니다.

```bash
cd "QA 에이전트팀/webapp"
npm ci            # package-lock 기준 정확 설치 (없으면 npm install)
npx playwright install chromium   # 브라우저 바이너리 사전 설치 (권장)
```

---

## 2. 환경설정 (.env)

`webapp/.env` 생성 후 **운영용 값으로 반드시 교체**:

```ini
# 인증은 둘 중 하나. (A) 이 서버에서 `claude login` 했다면 비워둬도 됨(로그인 세션 사용).
#                    (B) 세션이 없으면 키 입력 — 무인 전용 서버는 보통 이 방식.
ANTHROPIC_API_KEY=sk-ant-...        # 로그인 세션이 없을 때만 필수
QA_PASSWORD=<강한-비밀번호로-변경>    # [필수] 미설정 시 기본값 malgnqa 로 폴백됨 → 공개 노출 전 반드시 변경
QA_SESSION_SECRET=<랜덤-32자-이상>    # [필수] 미설정 시 공개 기본 시크릿으로 폴백 → 쿠키 위조 위험, 반드시 교체
PORT=5510
QA_CONCURRENCY=3                    # 서버 사양에 맞게 (브라우저 동시 수)
QA_MODEL=sonnet
QA_ENABLE_PLAYWRIGHT=true
# 대상 서비스 로그인이 필요하면:
# QA_TEST_EMAIL=...
# QA_TEST_PASSWORD=...
```

`QA_SESSION_SECRET` 랜덤 생성:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `.env` 는 부팅 시 `src/env.ts` 가 Node 내장 `process.loadEnvFile` 로 자동 로드한다(별도 dotenv 불필요).
> 따라서 위 값들이 실제 적용된다(설정만 하면 코드 수정 없이 반영).
>
> `.env`, `data/`, `reports/runs/` 는 `.gitignore` 처리됨 — 자격증명·결과가 커밋되지 않습니다.

> **클라우드 결과공유 동기화(선택)**: `CLOUD_SYNC_URL` + `SYNC_TOKEN` 을 설정하면 실행 결과·트리아지를
> Cloudflare(D1/Workers)로 동기화한다. 미설정이면 완전 비활성(로컬 전용). 설계: `docs/결과공유_클라우드뷰어/`.

---

## 3. 실행 확인 (포그라운드)

```bash
npm start          # tsx 로 src/server.ts 실행 → http://localhost:5510
```

브라우저에서 접속 → 비밀번호 로그인 → 프로젝트 등록 → 실행 탭에서 QA 1건 돌려 정상 확인.
확인되면 Ctrl+C 후, 아래 프로세스 관리자로 상시 가동 전환.

---

## 4. 상시 가동 (프로세스 관리자)

재부팅 자동복구·크래시 재시작을 위해 프로세스 관리자로 등록합니다.

### 4-A. Linux — systemd (권장)

`/etc/systemd/system/qa-agent.service`:
```ini
[Unit]
Description=QA Agent Team webapp
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/qa-agent/QA 에이전트팀/webapp
ExecStart=/usr/bin/npm start
EnvironmentFile=/opt/qa-agent/QA 에이전트팀/webapp/.env
Restart=always
RestartSec=5
User=qaagent

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now qa-agent
sudo systemctl status qa-agent      # 상태 확인
journalctl -u qa-agent -f           # 로그 추적
```

### 4-B. Windows Server — NSSM (권장)

[nssm.cc](https://nssm.cc) 다운로드 후:
```powershell
nssm install QAAgent "C:\Program Files\nodejs\npm.cmd" "start"
nssm set QAAgent AppDirectory "C:\qa-agent\QA 에이전트팀\webapp"
nssm set QAAgent AppEnvironmentExtra ANTHROPIC_API_KEY=sk-ant-... QA_PASSWORD=... QA_SESSION_SECRET=...
nssm start QAAgent
```
> NSSM 은 `.env` 파일을 자동 로드하지 않으므로 환경변수를 서비스에 직접 주입하거나,
> 별도 로더를 둡니다. (또는 아래 pm2 사용)

### 4-C. 양 OS 공통 대안 — pm2

```bash
npm i -g pm2
pm2 start npm --name qa-agent -- start
pm2 save
pm2 startup        # 출력되는 명령 실행 → 부팅 시 자동 시작
# Windows 부팅 자동시작: npm i -g pm2-windows-startup && pm2-startup install
```

### 4-D. Windows 개인 PC — 로그온 자동시작 (이 저장소에 설정됨)

별도 서버가 아닌 개인 PC라면, **로그온 자동시작 + 2분 주기 자가복구**가 가장 간단하다.
이 저장소에는 다음이 구성되어 있다(2중 복구: ① 런처 내부 루프 ② 작업 스케줄러 반복 트리거):

- **런처**: `webapp/autostart-server.ps1` — 5510 미기동 시 `npm start` 실행, 서버가 죽으면 10초 뒤 재시작, 로그는 `out.log`/`err.log` 누적. (Windows PowerShell 5.1 이 BOM 없는 한글을 cp949 로 오인하므로 **스크립트는 순수 ASCII**로 두고 webapp 경로는 `$PSScriptRoot` 에서 가져온다.)
- **작업 스케줄러**: `QA Agent Team Webapp`
  - 트리거 = 현재 사용자 **로그온** + **2분마다 반복**(자가복구). 로그오프/절전 등으로 런처 자체가 죽어도 최대 2분 안에 작업이 다시 띄운다.
  - **MultipleInstances=IgnoreNew** — 런처가 살아 있으면 반복이 중복 실행하지 않는다(런처는 단 1개 유지).
  - 액션 = `powershell.exe -WindowStyle Hidden -File autostart-server.ps1`, 실행시간 제한 없음, 실패 시 1분 간격 3회 재시작.
  - 로그온 세션에서 돌아 `claude login` 세션 인증을 그대로 쓴다(이 PC는 API 키 없이 세션 인증 사용).

```powershell
# 상태 확인 / 즉시 시작 / 중지 / 해제
Get-ScheduledTaskInfo -TaskName "QA Agent Team Webapp"
Start-ScheduledTask      -TaskName "QA Agent Team Webapp"
Stop-ScheduledTask       -TaskName "QA Agent Team Webapp"
Disable-ScheduledTask    -TaskName "QA Agent Team Webapp"   # 자가복구 일시중지(점검 시)
Unregister-ScheduledTask -TaskName "QA Agent Team Webapp" -Confirm:$false   # 자동시작 완전 해제
```

> 주의 1: 로그온 트리거이므로 **재부팅 후 이 사용자가 로그인해야** 서버가 뜬다(개인 PC 사용 패턴 기준).
> 로그인 없이 부팅만으로 띄우려면 `.env` 에 `ANTHROPIC_API_KEY` 를 넣고(세션 인증은 무인 컨텍스트에서 깨짐)
> 4-B(NSSM)/4-C(pm2)처럼 서비스/부팅 트리거로 전환한다.
>
> 주의 2(개발 메모): `Get-CimInstance powershell | Where CommandLine -match 'autostart-server' | Stop-Process`
> 류로 런처를 정리하면 **명령 텍스트 자체가 매칭되어 실행 중인 셸까지 죽는다**. PID 를 먼저 모아 `$_.ProcessId -ne $PID`
> 로 자기 자신을 제외하고 죽일 것.

---

## 5. 리버스 프록시 + HTTPS (권장)

앱은 비밀번호 1개 인증이므로 **사내망 한정 노출**이 안전합니다. 프록시 뒤에 두고 HTTPS·접근제어를 겁니다.

### nginx (Linux)
```nginx
server {
    listen 443 ssl;
    server_name qa.내부도메인;
    ssl_certificate     /path/cert.pem;
    ssl_certificate_key /path/key.pem;

    location / {
        proxy_pass http://127.0.0.1:5510;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        # 실행 진행상황 SSE(/api/runs/:id/events) 버퍼링 비활성화
        proxy_buffering off;
        proxy_read_timeout 3600s;   # 장시간 QA 실행 대비
    }
}
```

### IIS (Windows)
URL Rewrite + ARR 로 `127.0.0.1:5510` 역방향 프록시 구성.
**SSE/장시간 응답을 위해 응답 버퍼링 비활성화 + 프록시 타임아웃 연장** 필수.

> 핵심: 어떤 프록시든 `/api/runs/:id/events` 는 실시간 스트림(SSE)이고 QA 실행은 수 분이 걸리므로,
> **버퍼링 OFF + 읽기 타임아웃을 넉넉히(1시간+)** 잡아야 진행상황이 끊기지 않습니다.

---

## 6. 백업 & 운영

**전체 상태 = 아래 두 경로.** 이것만 정기 백업하면 복구됩니다.
- `webapp/data/qa.db` (+ `qa.db-wal`, `qa.db-shm`) — 프로젝트·실행·이슈·트리아지
- `reports/runs/` — 원본 리포트·스크린샷

WAL 모드라 운영 중 복사 시 세 파일을 함께 받으세요. 안전한 스냅샷이 필요하면 서비스 잠깐 멈추고 복사.

운영 팁:
- `reports/runs/` 가 계속 커지므로 오래된 run 은 주기적으로 아카이브/삭제.
- `QA_CONCURRENCY` 를 올리면 빨라지지만 Chromium 다중 구동으로 메모리·API 비용 증가. 3~5에서 시작.
- 로그: systemd `journalctl -u qa-agent` / pm2 `pm2 logs qa-agent`.

---

## 7. 운영 전 체크리스트

- [ ] Node 24(또는 22.5+ with 플래그) 설치 확인
- [ ] `QA_PASSWORD` 기본값(`malgnqa`)에서 변경
- [ ] `QA_SESSION_SECRET` 랜덤값으로 변경
- [ ] 인증 확보: 이 서버에서 `claude login` 했거나(세션) `ANTHROPIC_API_KEY` 설정 + 아웃바운드(api.anthropic.com) 허용
      ※ 서비스를 특정 계정으로 돌리면 그 계정이 로그인돼 있어야 세션 방식이 동작(systemd User=/Windows 서비스 계정 주의)
- [ ] `npx playwright install chromium` 완료 (또는 시뮬레이션 모드 결정)
- [ ] 프로세스 관리자 등록 + 재부팅 자동시작 확인
- [ ] 리버스 프록시 HTTPS + SSE 버퍼링 OFF + 타임아웃 연장
- [ ] `data/` · `reports/runs/` 백업 스케줄 등록
- [ ] 사내망 한정 접근(방화벽/프록시 ACL) 확인
