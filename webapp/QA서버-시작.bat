@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QA 에이전트팀 서버

echo ============================================
echo   QA 에이전트팀 서버 시작
echo ============================================
echo.

rem --- 인증 확인: API 키(.env) 또는 Claude 로그인 세션 중 하나면 OK ---
set "AUTH_OK="
findstr /b /c:"ANTHROPIC_API_KEY=sk-" .env >nul 2>&1
if not errorlevel 1 set "AUTH_OK=apikey"
if not defined AUTH_OK if exist "%USERPROFILE%\.claude\.credentials.json" set "AUTH_OK=session"
if "%AUTH_OK%"=="apikey"  echo 인증: API 키 사용
if "%AUTH_OK%"=="session" echo 인증: Claude 로그인 세션 사용 ^(API 키 없이 동작^)
if not defined AUTH_OK (
  echo [주의] API 키도 없고 Claude 로그인 세션도 없습니다.
  echo        QA 실행/페르소나 생성이 실패합니다. 둘 중 하나를 하세요:
  echo          1^) 이 PC에서  claude login  실행 ^(구독 로그인, 키 불필요^)
  echo          2^) webapp\.env 의 ANTHROPIC_API_KEY 에 키 붙여넣기
  echo.
)

rem --- 이미 서버가 떠 있으면 새로 띄우지 않고 브라우저만 연다 ---
netstat -ano | findstr ":5510" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo 서버가 이미 실행 중입니다 ^(포트 5510^). 브라우저만 엽니다.
  start "" http://localhost:5510
  echo 이 창은 닫아도 됩니다.
  echo.
  pause >nul
  exit /b
)

rem --- 의존성 없으면 설치 ---
if not exist "node_modules" (
  echo 의존성 설치 중... 잠시만 기다리세요.
  call npm ci
  echo.
)

echo 서버 주소: http://localhost:5510   (비밀번호: malgnqa)
echo 잠시 후 브라우저가 자동으로 열립니다. 종료하려면 이 창에서 Ctrl+C.
echo.

rem --- 4초 뒤 브라우저 자동 오픈 (서버는 그 사이 기동) ---
start "" /min cmd /c "timeout /t 4 >nul & start http://localhost:5510"

npm start

echo.
echo 서버가 종료되었습니다. 아무 키나 누르면 창이 닫힙니다.
pause >nul
