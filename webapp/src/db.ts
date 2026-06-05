import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { WEBAPP_ROOT } from './config.js'

// 내장 SQLite(node:sqlite) 사용 — 네이티브 컴파일/외부 의존성 없음.
// 같은 SQLite 방언이라 추후 Cloudflare D1 등으로 이전 시 SQL 재사용 가능.
const dataDir = path.join(WEBAPP_ROOT, 'data')
fs.mkdirSync(dataDir, { recursive: true })

export const DB_PATH = path.join(dataDir, 'qa.db')
export const db = new DatabaseSync(DB_PATH)

db.exec('PRAGMA journal_mode = WAL;')
db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  base_url    TEXT NOT NULL,
  platform    TEXT,
  description TEXT,
  guards      TEXT,
  manager_id  INTEGER,           -- 소유 프로젝트 관리자(managers.id). NULL = 미배정(최고관리자만 표시)
  hidden      INTEGER NOT NULL DEFAULT 0,  -- 1 = 목록에서 숨김(소프트 숨김, 데이터 보존)
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS developers (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL,
  email  TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

-- 프로젝트 관리자(접속자) — 비밀번호 단독 로그인. 최고관리자는 env QA_PASSWORD 라 DB에 없음.
-- password_hash = HMAC(비밀번호) (auth.ts) — 평문 미저장, 전체 고유(로그인 식별 키).
CREATE TABLE IF NOT EXISTS managers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  contact       TEXT,             -- 이메일/슬랙 등 연락처(선택) — 운영 조직 알림·연락용
  password_hash TEXT NOT NULL UNIQUE,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id                     TEXT PRIMARY KEY,
  project_id             INTEGER,
  scenario               TEXT NOT NULL,
  base_url               TEXT NOT NULL,
  persona_count          INTEGER NOT NULL,
  status                 TEXT NOT NULL,
  launch_recommendation  TEXT,
  p1_count               INTEGER,
  summary                TEXT,
  integrated_report_path TEXT,
  error                  TEXT,
  started_at             INTEGER NOT NULL,
  finished_at            INTEGER
);

CREATE TABLE IF NOT EXISTS persona_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id           TEXT NOT NULL,
  persona_id       TEXT NOT NULL,
  persona_name     TEXT,
  age_band         TEXT,
  digital_literacy TEXT,
  primary_device   TEXT,
  accessibility    TEXT,
  completed        INTEGER,
  total            INTEGER,
  dropped_out      INTEGER,
  report_path      TEXT,
  one_line_summary TEXT
);

CREATE TABLE IF NOT EXISTS issues (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL,
  persona_id  TEXT,
  title       TEXT,
  severity    TEXT,
  type        TEXT,
  task        TEXT,
  -- 구조화 이슈 본문 (reports/_individual-template.md 정책과 1:1 대응)
  symptom     TEXT,            -- 무슨 일이 있었나(현상) — 페르소나 관점 서술
  repro       TEXT,            -- 재현 단계 (줄바꿈 구분)
  expected    TEXT,            -- 기대 동작
  actual      TEXT,            -- 실제 동작
  impact      TEXT,            -- 페르소나 영향(왜 이 사용자에게 특히 문제인가)
  suggestion  TEXT,            -- 사용자 관점 개선 제안(선택)
  evidence    TEXT,            -- 증거(스크린샷 경로·콘솔로그 등)
  confidence  TEXT,
  category    TEXT,            -- 구분 코드: 문의 | 오류 | 기능개선 | 제안
  assignee_id INTEGER,         -- 개발담당자 (developers.id)
  status      TEXT DEFAULT '열림',  -- 열림 | 진행중 | 완료 | 보류
  memo        TEXT             -- 트리아지 메모(관리자 작성)
);

CREATE TABLE IF NOT EXISTS project_personas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL,
  persona_id  TEXT NOT NULL,    -- 시드 풀 ID (P001..) — 풀에서 추출/추가된 페르소나
  data        TEXT NOT NULL,    -- 페르소나 전체 JSON 스냅샷
  created_at  INTEGER NOT NULL
);

-- 시나리오 파일 소유권 — 등록(저장)한 관리자 기준 가시성 제어.
-- path = 'scenarios/<file>.md' (전체 고유). manager_id NULL = 미배정(최고관리자만 표시).
CREATE TABLE IF NOT EXISTS scenario_owners (
  path        TEXT PRIMARY KEY,
  manager_id  INTEGER,
  project_id  INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_persona_runs_run ON persona_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_issues_run ON issues(run_id);
CREATE INDEX IF NOT EXISTS idx_project_personas_project ON project_personas(project_id);
CREATE INDEX IF NOT EXISTS idx_scenario_owners_manager ON scenario_owners(manager_id);
`)

// ── 경량 마이그레이션: 기존 DB에 누락된 컬럼 보강 ──
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}
ensureColumn('runs', 'project_id', 'project_id INTEGER')
ensureColumn('managers', 'contact', 'contact TEXT')
ensureColumn('projects', 'manager_id', 'manager_id INTEGER')
ensureColumn('projects', 'hidden', 'hidden INTEGER NOT NULL DEFAULT 0')
// manager_id 컬럼 보강 후에 인덱스 생성(기존 DB 마이그레이션 순서 보장)
db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(manager_id);`)
ensureColumn('issues', 'category', 'category TEXT')
ensureColumn('issues', 'assignee_id', 'assignee_id INTEGER')
ensureColumn('issues', 'status', "status TEXT DEFAULT '열림'")
ensureColumn('issues', 'memo', 'memo TEXT')
// 구조화 이슈 본문(현상/재현/기대·실제/영향/제안) — UI 이슈 상세 + 리포트 템플릿 정책 반영
ensureColumn('issues', 'symptom', 'symptom TEXT')
ensureColumn('issues', 'repro', 'repro TEXT')
ensureColumn('issues', 'expected', 'expected TEXT')
ensureColumn('issues', 'actual', 'actual TEXT')
ensureColumn('issues', 'impact', 'impact TEXT')
ensureColumn('issues', 'suggestion', 'suggestion TEXT')

// 기존 미분류(category NULL) 이슈를 유형 기반 분류 기준으로 1회 백필.
// 분류 기준: 기능버그→오류 · 콘텐츠→제안 · 사용성/접근성/성능/신뢰UX→기능개선 · 그 외→문의
// (이미 관리자가 지정한 값은 NULL 이 아니므로 건드리지 않음)
db.exec(`
UPDATE issues SET category = CASE
  WHEN type = '기능버그' THEN '오류'
  WHEN type = '콘텐츠'  THEN '제안'
  WHEN type IN ('사용성','접근성','성능','신뢰UX') THEN '기능개선'
  ELSE '문의' END
WHERE category IS NULL;
`)

// ── 최초 시드 (비어 있을 때만) ──
const devCount = (db.prepare(`SELECT COUNT(*) c FROM developers`).get() as any).c
if (devCount === 0) {
  const ins = db.prepare(`INSERT INTO developers (name, email) VALUES (?, ?)`)
  for (const d of [
    ['김프론트', 'front@example.com'],
    ['이백엔드', 'back@example.com'],
    ['박QA', 'qa@example.com'],
  ]) ins.run(d[0], d[1])
}
