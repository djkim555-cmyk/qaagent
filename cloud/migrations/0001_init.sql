-- QA 클라우드 뷰어 D1 스키마 (06_API계약서 §1) — webapp/src/db.ts 에서 이식.
-- 읽기 복제(A) + 트리아지 원장(B). A행은 로컬 PK 를 그대로 보존(클라우드 자체 채번 안 함) → AUTOINCREMENT 미사용.
-- 비밀(managers.password_hash)·env 는 이식하지 않는다.

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  base_url    TEXT,
  platform    TEXT,
  description TEXT,
  guards      TEXT,
  manager_id  INTEGER,
  hidden      INTEGER NOT NULL DEFAULT 0,   -- B
  created_at  INTEGER,
  updated_at  INTEGER,                      -- B 동기화 메타
  updated_by  TEXT,
  deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS runs (
  id                     TEXT PRIMARY KEY,
  project_id             INTEGER,
  scenario               TEXT,
  base_url               TEXT,
  persona_count          INTEGER,
  status                 TEXT,
  launch_recommendation  TEXT,
  p1_count               INTEGER,
  summary                TEXT,
  integrated_report_path TEXT,              -- R2 키
  error                  TEXT,
  started_at             INTEGER,
  finished_at            INTEGER
);

CREATE TABLE IF NOT EXISTS persona_runs (
  id               INTEGER PRIMARY KEY,
  run_id           TEXT NOT NULL,
  persona_id       TEXT,
  persona_name     TEXT,
  age_band         TEXT,
  digital_literacy TEXT,
  primary_device   TEXT,
  accessibility    TEXT,
  completed        INTEGER,
  total            INTEGER,
  dropped_out      INTEGER,
  report_path      TEXT,                    -- R2 키
  one_line_summary TEXT
);

CREATE TABLE IF NOT EXISTS issues (
  id          INTEGER PRIMARY KEY,
  run_id      TEXT NOT NULL,
  persona_id  TEXT,
  -- A(본문)
  title       TEXT,
  severity    TEXT,
  type        TEXT,
  task        TEXT,
  symptom     TEXT,
  repro       TEXT,
  expected    TEXT,
  actual      TEXT,
  impact      TEXT,
  suggestion  TEXT,
  evidence    TEXT,                         -- 스크린샷 R2 키 포함
  confidence  TEXT,
  -- B(트리아지)
  category    TEXT,
  assignee_id INTEGER,
  status      TEXT DEFAULT '열림',
  memo        TEXT,
  -- B 동기화 메타
  updated_at  INTEGER,
  updated_by  TEXT,
  deleted     INTEGER NOT NULL DEFAULT 0
);

-- 표시용(담당자/멤버 이름 해석) — 비밀번호 해시 없음
CREATE TABLE IF NOT EXISTS managers (
  id      INTEGER PRIMARY KEY,
  name    TEXT,
  contact TEXT
);

CREATE TABLE IF NOT EXISTS developers (
  id         INTEGER PRIMARY KEY,
  name       TEXT,
  email      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,    -- B
  updated_at INTEGER,
  updated_by TEXT,
  deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL,
  member_id  INTEGER NOT NULL,
  created_at INTEGER,
  updated_at INTEGER,                       -- B
  updated_by TEXT,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_runs_project       ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_persona_runs_run   ON persona_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_issues_run         ON issues(run_id);
CREATE INDEX IF NOT EXISTS idx_issues_updated     ON issues(updated_at);
CREATE INDEX IF NOT EXISTS idx_projects_updated   ON projects(updated_at);
