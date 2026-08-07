@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QA 에이전트팀 - 서버 시작

rem ============================================================
rem  이 런처는 "검사·설치 로직을 직접 갖지 않는다".
rem  Node 버전 게이트·.env 생성·의존성·포트 점검은 모두
rem  ..\install\install.mjs --quick 이 단일 원본으로 판정한다.
rem  (과거 이 파일이 자체 판정을 갖고 있어 문서와 어긋났다:
rem   런처는 Node>=22 통과, 실제로는 22.0~22.4 에 node:sqlite 가
rem   없어 게이트 통과 후 서버가 조용히 즉사했다.)
rem ============================================================

echo ============================================
echo   QA 에이전트팀  서버 시작
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [필수] Node.js 가 설치되어 있지 않습니다.
  echo        https://nodejs.org 에서 LTS ^(24 이상^) 를 받아 설치한 뒤 이 파일을 다시 더블클릭하세요.
  echo.
  pause
  exit /b 1
)

rem ----- 포트는 .env 에서 읽는다(하드코딩 금지) -----
call :readport

rem ----- 이미 떠 있으면 브라우저만 연다 -----
netstat -ano | findstr ":%QAPORT%" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo 서버가 이미 실행 중입니다 ^(포트 %QAPORT%^). 브라우저만 엽니다.
  start "" http://localhost:%QAPORT%
  echo 이 창은 닫아도 됩니다.
  echo.
  pause >nul
  exit /b 0
)

rem ----- 설치/점검은 install.mjs 에 위임 -----
node "..\install\install.mjs" --quick
if errorlevel 1 (
  echo.
  echo [중단] 위에 표시된 안내를 해결한 뒤 이 파일을 다시 더블클릭하세요.
  echo        전체 설치를 다시 하려면 상위 폴더의 "설치.bat" 을 실행하세요.
  echo.
  pause
  exit /b 1
)

rem ----- .env 가 방금 만들어졌을 수 있으니 포트를 다시 읽는다 -----
call :readport

echo.
echo 서버 시작: http://localhost:%QAPORT%   ^(로그인 아이디: admin^)
echo 잠시 후 브라우저가 자동으로 열립니다. 종료하려면 이 창에서 Ctrl+C.
echo.

rem --- 5초 뒤 브라우저 자동 오픈(서버는 그 사이 기동) ---
start "" /min cmd /c "timeout /t 5 >nul & start http://localhost:%QAPORT%"

npm start

echo.
echo 서버가 종료되었습니다. 아무 키나 누르면 창이 닫힙니다.
pause >nul
exit /b 0

:readport
set "QAPORT=5510"
for /f "usebackq delims=" %%p in (`node -e "const fs=require('fs');const t=fs.existsSync('.env')?fs.readFileSync('.env','utf8'):'';const m=t.match(/^PORT=(\d+)/m);process.stdout.write(m?m[1]:'5510')"`) do set "QAPORT=%%p"
goto :eof
