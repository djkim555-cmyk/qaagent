-- MCP 개인 액세스 토큰(PAT) — 외부 PC 개발자가 /mcp 로 접속할 때 쓰는 자격.
--
-- 가산(additive) 전용: 기존 테이블 ALTER 없음 → 구버전 코드는 이 테이블을 몰라도 정상 동작하고,
-- 롤백은 `DROP TABLE mcp_tokens` 한 줄로 끝난다(다른 데이터 무손실).
--
-- FK 를 선언하지 않는 것은 **의도**다: /sync/members 가 `DELETE FROM project_members` 로 멤버십을
-- 전량 교체하고 managers 를 upsert 만 하므로, FK/CASCADE 를 걸면 동기화 사이클에 토큰이 휩쓸릴 수 있다.
-- 대신 소유자 유효성은 런타임에서 매 요청 검증한다(mcp-auth.ts verifyPat 4단계).
--
-- 토큰 평문은 저장하지 않는다: token_id(조회키, 비밀 아님) + token_hash(HMAC-SHA256(MCP_TOKEN_SECRET,'mcp:'+secret)).
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id          TEXT    NOT NULL,          -- 공개 조회키(base32 10자)
  token_hash        TEXT    NOT NULL,          -- 비밀부의 HMAC 해시(hex)
  member_id         INTEGER NOT NULL,          -- 소유 회원. super 토큰은 존재하지 않음(발급 경로 없음)
  label             TEXT,                      -- '김개발 사무실 PC' 식 디바이스 라벨
  scope_project_ids TEXT,                      -- NULL = 소유자 권한 전체 / JSON 배열 = 그 부분집합
  created_at        INTEGER NOT NULL,
  created_by        TEXT,
  expires_at        INTEGER NOT NULL,          -- NOT NULL = 무기한 토큰 불가(기본 30일·최대 90일)
  last_used_at      INTEGER,
  use_count         INTEGER DEFAULT 0,
  revoked_at        INTEGER,                   -- 즉시 폐기 스위치
  revoked_by        TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_tokens_tid    ON mcp_tokens(token_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_tokens_hash   ON mcp_tokens(token_hash);
CREATE INDEX        IF NOT EXISTS idx_mcp_tokens_member ON mcp_tokens(member_id);
