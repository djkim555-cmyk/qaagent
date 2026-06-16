-- 뷰어 로그인 체계 이식 — 회원(managers)을 표시용에서 "인증 주체"로 승급.
-- QA 에이전트팀 웹앱과 동일한 ID/PW 로그인을 클라우드에서도 받기 위해
-- login_id / password_hash / status / active 를 추가 동기화한다.
--   · password_hash 는 HMAC(SHA-256) 해시(평문 아님). 검증 시크릿 PW_HASH_SECRET 가 있어야 의미가 있다.
--   · 슈퍼관리자(admin)는 DB에 없고 env(SUPER_PASSWORD)로만 인증한다(웹앱과 동일).
ALTER TABLE managers ADD COLUMN login_id      TEXT;
ALTER TABLE managers ADD COLUMN password_hash TEXT;
ALTER TABLE managers ADD COLUMN status        TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE managers ADD COLUMN active        INTEGER NOT NULL DEFAULT 1;

-- 로그인 아이디 조회용(부분 유니크 — login_id 가 있는 행만 고유 보장, 웹앱 idx_managers_login 과 동일 정책)
CREATE UNIQUE INDEX IF NOT EXISTS idx_managers_login ON managers(login_id) WHERE login_id IS NOT NULL;
