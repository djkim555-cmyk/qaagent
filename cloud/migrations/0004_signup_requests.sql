-- 뷰어에서 받은 회원가입 "신청"을 임시 보관하는 접수함.
--
-- 왜 managers 에 직접 넣지 않는가:
--   회원(managers)은 로컬 웹앱 → 클라우드 **단방향 push**(/sync/members, id 기준 upsert)로만 채워진다.
--   클라우드가 managers 에 자체 채번으로 행을 만들면 로컬 id 와 충돌해 다음 push 때 서로를 덮어쓴다.
--   따라서 신청은 이 별도 테이블에 쌓고, 로컬이 /sync/signups 로 회수 → 승인 → /sync/signups/ack 로 삭제한다.
--   (imported 플래그 대신 "회수 후 삭제" 방식 — 접수함이 무한 적재되지 않는다.)
--
-- password_hash 는 평문이 아니라 HMAC-SHA256(PW_HASH_SECRET, 'pw:'+pw) hex.
--   웹앱 auth.ts hashPassword() 와 바이트 단위로 동일해야 승인 후 그 비밀번호로 로그인된다.
CREATE TABLE IF NOT EXISTS signup_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  contact       TEXT,
  password_hash TEXT NOT NULL,   -- HMAC(PW_HASH_SECRET,'pw:'+pw) hex — 평문 저장 금지
  created_at    INTEGER NOT NULL
);

-- 회수(오래된 순) 조회용
CREATE INDEX IF NOT EXISTS idx_signup_requests_created ON signup_requests(created_at);
