@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QA 에이전트팀 - 설치 프로그램
rem 얇은 래퍼: 판정·설치 로직은 전부 install\install.mjs 가 갖는다(로직 이중화 금지).
where node >nul 2>&1
if errorlevel 1 (
  echo [필수] Node.js 가 설치되어 있지 않습니다.
  echo        https://nodejs.org 에서 LTS ^(24 이상^) 를 받아 설치한 뒤, 이 파일을 다시 더블클릭하세요.
  pause
  exit /b 1
)
node "install\install.mjs" %*
echo.
pause
