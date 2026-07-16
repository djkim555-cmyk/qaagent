@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QA 에이전트팀 - 설치/시작 도우미

echo ============================================
echo   QA 에이전트팀  설치 및 시작 도우미
echo ============================================
echo.

rem ===== 1) Node.js 설치 확인 =====
where node >nul 2>&1
if errorlevel 1 (
  echo [필수] Node.js 가 설치되어 있지 않습니다.
  echo.
  echo   1^) https://nodejs.org  에서 LTS ^(24 이상^) 를 받아 설치하세요.
  echo   2^) 설치가 끝나면 이 창을 닫고, 이 파일을 다시 더블클릭하세요.
  echo.
  pause
  exit /b
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODEMAJOR=%%v"
if %NODEMAJOR% LSS 22 (
  echo [주의] 현재 Node 버전이 너무 낮습니다 ^(v%NODEMAJOR%^). 24 이상을 권장합니다.
  echo        https://nodejs.org 에서 최신 LTS 로 업데이트한 뒤 다시 실행하세요.
  echo.
  pause
  exit /b
)
echo [확인] Node.js OK ^(v%NODEMAJOR%^)
echo.

rem ===== 2) 최초 실행이면 .env 를 만든다(시크릿 자동 생성) =====
if exist ".env" goto after_setup
echo 처음 실행이라 기본 설정을 만듭니다. 아래 두 가지만 정하면 됩니다.
echo.
set "ADMINPW="
set /p "ADMINPW=(1) 관리자 로그인 비밀번호를 정하세요. 엔터만 치면 자동 생성: "
echo.
echo (2) QA를 '직접 실행'하려면 Anthropic API 키가 필요합니다.
echo     - 키가 있으면 붙여넣으세요.  - 없으면 그냥 엔터 하세요
echo       (대신 이 PC에서 'claude login' 을 쓰면 키 없이도 실행됩니다. 결과 조회만 할 거면 아무거나 상관없음)
set "APIKEY="
set /p "APIKEY=    API 키(sk-ant-...): "
echo.
node scripts\setup-env.mjs --admin="%ADMINPW%" --apikey="%APIKEY%"
echo.
echo   ↑ 위에 표시된 '관리자 비밀번호'로 로그인합니다. 꼭 적어두세요.
echo.
pause
:after_setup

rem ===== 3) 인증 상태 안내(있으면 실행 가능, 없으면 조회만 가능) =====
set "AUTH_OK="
findstr /b /c:"ANTHROPIC_API_KEY=sk-" .env >nul 2>&1
if not errorlevel 1 set "AUTH_OK=apikey"
if not defined AUTH_OK if exist "%USERPROFILE%\.claude\.credentials.json" set "AUTH_OK=session"
if "%AUTH_OK%"=="apikey"  echo [확인] 인증: API 키 사용 - 새 QA 실행 가능
if "%AUTH_OK%"=="session" echo [확인] 인증: Claude 로그인 세션 사용 - 새 QA 실행 가능
if not defined AUTH_OK (
  echo [안내] 아직 Claude 인증이 없습니다. 로그인·결과 조회·트리아지는 되지만
  echo        '새 QA 실행'은 실패합니다. 나중에 둘 중 하나를 하세요:
  echo          - 이 PC에서  claude login   ^(구독 로그인, 키 불필요^)
  echo          - webapp\.env 의 ANTHROPIC_API_KEY 에 키 입력
)
echo.

rem ===== 4) 이미 떠 있으면 브라우저만 연다 =====
netstat -ano | findstr ":5510" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo 서버가 이미 실행 중입니다 ^(포트 5510^). 브라우저만 엽니다.
  start "" http://localhost:5510
  echo 이 창은 닫아도 됩니다.
  echo.
  pause >nul
  exit /b
)

rem ===== 5) 의존성 설치(최초 1회, 몇 분 소요) =====
if not exist "node_modules" (
  echo 의존성 설치 중... 처음 한 번은 몇 분 걸릴 수 있습니다. 기다려 주세요.
  call npm ci
  if errorlevel 1 (
    echo.
    echo [오류] 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행하세요.
    pause
    exit /b
  )
  echo.
)

echo 서버 시작: http://localhost:5510   ^(로그인 아이디: admin^)
echo 잠시 후 브라우저가 자동으로 열립니다. 종료하려면 이 창에서 Ctrl+C.
echo.

rem --- 5초 뒤 브라우저 자동 오픈(서버는 그 사이 기동) ---
start "" /min cmd /c "timeout /t 5 >nul & start http://localhost:5510"

npm start

echo.
echo 서버가 종료되었습니다. 아무 키나 누르면 창이 닫힙니다.
pause >nul
