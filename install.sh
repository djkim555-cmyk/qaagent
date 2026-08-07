#!/bin/sh
# 얇은 래퍼(macOS·Linux): 판정·설치 로직은 전부 install/install.mjs 가 갖는다(로직 이중화 금지).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "[필수] Node.js 가 설치되어 있지 않습니다."
  echo "       https://nodejs.org 에서 LTS(24 이상)를 설치한 뒤 다시 실행하세요: sh install.sh"
  exit 1
fi
exec node "install/install.mjs" "$@"
