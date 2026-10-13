const { createServer, request: httpRequest } = require("node:http");
const { request: httpsRequest } = require("node:https");
const { mkdirSync, readFileSync, writeFileSync, chmodSync } = require("node:fs");
const { randomBytes, createHash, createCipheriv, createDecipheriv, randomUUID, timingSafeEqual } = require("node:crypto");
const { lookup } = require("node:dns/promises");
const { isIP, BlockList } = require("node:net");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, "data");
const DATABASE_PATH = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "mydays.db");
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_PATCH_OPS = 500;
const MAX_AI_RESPONSE_BYTES = 512 * 1024;
const MAX_AI_SUMMARY_FIELD_LENGTH = 4000;
const MAX_AI_SUMMARY_ITEMS = 120;
const MAX_AI_REPORT_LENGTH = 8000;
const MAX_REPORT_CONTENT_LENGTH = 20000;
const MAX_CAPTURE_ENTRY_LENGTH = 120;
const AI_PERIOD_TASK_MAX_TOKENS = 4096;
const AI_POLISH_TASK_MAX_TOKENS = 512;
const AI_TEXT_TASK_MIN_TIMEOUT_MS = 60000;
const DEFAULT_AI_SUMMARY_PROMPT_EXCERPT = "请生成简洁、具体、忠于事实的中文工作复盘，突出可验证的成果、实际阻碍和可执行的下一步。优先使用易编辑的短段落或项目符号，不要虚构未提供的信息。";
const AI_SECRET_PATH = path.join(DATA_DIR, ".ai-config-secret");
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const AI_ALLOW_PROXY_FAKE_IP = process.env.AI_ALLOW_PROXY_FAKE_IP === "1";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_SESSIONS = 1024;
const MAX_RATE_LIMIT_KEYS = 2048;
const sessions = new Map();
const loginAttempts = new Map();
const aiOperations = new Map();

function readSecretSetting(valueName, fileName) {
  const filePath = process.env[fileName];
  if (filePath) {
    const value = readFileSync(filePath, "utf8").trim();
    if (!value) throw new Error(`${fileName} points to an empty secret`);
    return value;
  }
  if (Object.hasOwn(process.env, valueName)) {
    const value = process.env[valueName].trim();
    if (!value) throw new Error(`${valueName} must not be empty`);
    return value;
  }
  return "";
}

const ACCESS_PASSWORD = readSecretSetting("MYDAYS_ACCESS_PASSWORD", "MYDAYS_ACCESS_PASSWORD_FILE");
const ACCESS_PASSWORD_HASH = ACCESS_PASSWORD ? createHash("sha256").update(ACCESS_PASSWORD).digest() : null;

const AI_IPV4_PRIVATE = new BlockList();
AI_IPV4_PRIVATE.addSubnet("10.0.0.0", 8, "ipv4");
AI_IPV4_PRIVATE.addSubnet("172.16.0.0", 12, "ipv4");
AI_IPV4_PRIVATE.addSubnet("192.168.0.0", 16, "ipv4");
const AI_IPV4_LOCAL = new BlockList();
AI_IPV4_LOCAL.addSubnet("127.0.0.0", 8, "ipv4");
const AI_IPV4_FAKE_IP = new BlockList();
AI_IPV4_FAKE_IP.addSubnet("198.18.0.0", 15, "ipv4");
const AI_IPV4_FORBIDDEN = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["100.64.0.0", 10],
  ["169.254.0.0", 16],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) AI_IPV4_FORBIDDEN.addSubnet(address, prefix, "ipv4");
AI_IPV4_FORBIDDEN.addAddress("168.63.129.16", "ipv4");

const AI_IPV6_PRIVATE = new BlockList();
AI_IPV6_PRIVATE.addSubnet("fc00::", 7, "ipv6");
const AI_IPV6_LOCAL = new BlockList();
AI_IPV6_LOCAL.addAddress("::1", "ipv6");
const AI_IPV6_FORBIDDEN = new BlockList();
for (const [address, prefix] of [
  ["::", 128],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
]) AI_IPV6_FORBIDDEN.addSubnet(address, prefix, "ipv6");
AI_IPV6_FORBIDDEN.addAddress("fd00:ec2::254", "ipv6");

const EMPTY_STATE = Object.freeze({
  tasks: [],
  logs: [],
  notes: {},
  reviews: {},
  periodReviews: {},
  projectReviews: {},
  projectPeriodReviews: {},
});

const STATIC_FILES = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8", cache: "no-cache" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8", cache: "no-cache" }],
  ["/tasks", { file: "index.html", type: "text/html; charset=utf-8", cache: "no-cache" }],
  ["/timeline", { file: "index.html", type: "text/html; charset=utf-8", cache: "no-cache" }],
  ["/review", { file: "index.html", type: "text/html; charset=utf-8", cache: "no-cache" }],
  ["/summary", { file: "index.html", type: "text/html; charset=utf-8", cache: "no-cache" }],
  ["/ai-settings", { file: "index.html", type: "text/html; charset=utf-8", cache: "no-cache" }],
  ["/login", { file: "login.html", type: "text/html; charset=utf-8", cache: "no-store" }],
  ["/theme.js", { file: "theme.js", type: "application/javascript; charset=utf-8", cache: "no-cache" }],
  ["/login.js", { file: "login.js", type: "application/javascript; charset=utf-8", cache: "no-store" }],
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8", cache: "no-cache" }],
  ["/app.js", { file: "app.js", type: "application/javascript; charset=utf-8", cache: "no-cache" }],
]);

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class ConflictError extends HttpError {
  constructor() {
    super(409, "STATE_CONFLICT", "数据已在其他页面更新，请重新加载后再试");
  }
}

mkdirSync(DATA_DIR, { recursive: true });
const database = new DatabaseSync(DATABASE_PATH);
database.exec("PRAGMA journal_mode = WAL");
database.exec("PRAGMA foreign_keys = ON");
database.exec("PRAGMA busy_timeout = 5000");
database.exec(`
  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    work_date TEXT NOT NULL,
    title TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high')),
    completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL,
    completed_at TEXT
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_tasks_work_date ON tasks(work_date);

  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    work_date TEXT NOT NULL,
    title TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT '',
    source_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_logs_work_date ON logs(work_date);

  CREATE TABLE IF NOT EXISTS notes (
    work_date TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS reviews (
    work_date TEXT PRIMARY KEY,
    wins TEXT NOT NULL DEFAULT '',
    blockers TEXT NOT NULL DEFAULT '',
    next_actions TEXT NOT NULL DEFAULT '',
    completed_at TEXT,
    updated_at TEXT NOT NULL
  ) STRICT;

  INSERT OR IGNORE INTO metadata(key, value) VALUES ('schema_version', '1');
  INSERT OR IGNORE INTO metadata(key, value) VALUES ('revision', '0');
  INSERT OR IGNORE INTO metadata(key, value) VALUES ('legacy_migration_completed', '0');
`);

database.exec("BEGIN IMMEDIATE");
try {
  database.exec(`
    CREATE TABLE IF NOT EXISTS period_reviews (
      period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month', 'quarter', 'year')),
      period_start TEXT NOT NULL,
      wins TEXT NOT NULL DEFAULT '',
      blockers TEXT NOT NULL DEFAULT '',
      next_actions TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (period_type, period_start)
    ) STRICT;

    UPDATE metadata SET value = '2' WHERE key = 'schema_version' AND CAST(value AS INTEGER) < 2;
  `);
  database.exec("COMMIT");
} catch (error) {
  if (database.isTransaction) database.exec("ROLLBACK");
  throw error;
}

database.exec("BEGIN IMMEDIATE");
try {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      protocol TEXT NOT NULL CHECK (protocol IN ('openai', 'anthropic')),
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      timeout_ms INTEGER NOT NULL CHECK (timeout_ms BETWEEN 1000 AND 120000),
      options_json TEXT NOT NULL DEFAULT '{}',
      api_key_ciphertext TEXT,
      api_key_iv TEXT,
      api_key_tag TEXT,
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_providers_default
      ON ai_providers(is_default) WHERE is_default = 1;

    CREATE TRIGGER IF NOT EXISTS trg_ai_providers_key_insert
    BEFORE INSERT ON ai_providers
    WHEN NOT (
      (NEW.api_key_ciphertext IS NULL AND NEW.api_key_iv IS NULL AND NEW.api_key_tag IS NULL)
      OR (NEW.api_key_ciphertext IS NOT NULL AND NEW.api_key_iv IS NOT NULL AND NEW.api_key_tag IS NOT NULL)
    )
    BEGIN
      SELECT RAISE(ABORT, 'AI key encryption fields must be all null or all present');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_ai_providers_key_update
    BEFORE UPDATE OF api_key_ciphertext, api_key_iv, api_key_tag ON ai_providers
    WHEN NOT (
      (NEW.api_key_ciphertext IS NULL AND NEW.api_key_iv IS NULL AND NEW.api_key_tag IS NULL)
      OR (NEW.api_key_ciphertext IS NOT NULL AND NEW.api_key_iv IS NOT NULL AND NEW.api_key_tag IS NOT NULL)
    )
    BEGIN
      SELECT RAISE(ABORT, 'AI key encryption fields must be all null or all present');
    END;

    UPDATE metadata SET value = '3' WHERE key = 'schema_version' AND CAST(value AS INTEGER) < 3;
  `);
  database.exec("COMMIT");
} catch (error) {
  if (database.isTransaction) database.exec("ROLLBACK");
  throw error;
}

database.exec("BEGIN IMMEDIATE");
try {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_summary_settings (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      prompt_excerpt TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    UPDATE metadata SET value = '4' WHERE key = 'schema_version' AND CAST(value AS INTEGER) < 4;
  `);
  database.exec("COMMIT");
} catch (error) {
  if (database.isTransaction) database.exec("ROLLBACK");
  throw error;
}

database.exec("BEGIN IMMEDIATE");
try {
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_options (
      name TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    INSERT OR IGNORE INTO project_options(name, sort_order, created_at, updated_at)
    SELECT name, sort_order, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM (
      SELECT '工作' AS name, 0 AS sort_order
      UNION ALL SELECT '个人', 1
      UNION ALL SELECT '学习', 2
      UNION ALL
      SELECT project, 3 + ROW_NUMBER() OVER (ORDER BY project) - 1
      FROM (
        SELECT DISTINCT trim(project) AS project FROM tasks WHERE trim(project) <> ''
        UNION
        SELECT DISTINCT trim(project) AS project FROM logs WHERE trim(project) <> ''
      )
      WHERE project NOT IN ('工作', '个人', '学习')
    )
    WHERE CAST((SELECT value FROM metadata WHERE key = 'schema_version') AS INTEGER) < 5;

    UPDATE metadata SET value = '5' WHERE key = 'schema_version' AND CAST(value AS INTEGER) < 5;
  `);
  database.exec("COMMIT");
} catch (error) {
  if (database.isTransaction) database.exec("ROLLBACK");
  throw error;
}

database.exec("BEGIN IMMEDIATE");
try {
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_reviews (
      work_date TEXT NOT NULL,
      project TEXT NOT NULL CHECK (length(trim(project)) BETWEEN 1 AND 80),
      wins TEXT NOT NULL DEFAULT '',
      blockers TEXT NOT NULL DEFAULT '',
      next_actions TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (work_date, project)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS project_period_reviews (
      period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month', 'quarter', 'year')),
      period_start TEXT NOT NULL,
      project TEXT NOT NULL CHECK (length(trim(project)) BETWEEN 1 AND 80),
      wins TEXT NOT NULL DEFAULT '',
      blockers TEXT NOT NULL DEFAULT '',
      next_actions TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (period_type, period_start, project)
    ) STRICT;

    UPDATE metadata SET value = '6' WHERE key = 'schema_version' AND CAST(value AS INTEGER) < 6;
  `);
  database.exec("COMMIT");
} catch (error) {
  if (database.isTransaction) database.exec("ROLLBACK");
  throw error;
}


database.exec("BEGIN IMMEDIATE");
try {
  database.exec(`
    CREATE TABLE IF NOT EXISTS period_reports (
      period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month', 'quarter', 'year')),
      period_start TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (period_type, period_start)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS project_period_reports (
      period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month', 'quarter', 'year')),
      period_start TEXT NOT NULL,
      project TEXT NOT NULL CHECK (length(trim(project)) BETWEEN 1 AND 80),
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (period_type, period_start, project)
    ) STRICT;

    UPDATE metadata SET value = '7' WHERE key = 'schema_version' AND CAST(value AS INTEGER) < 7;
  `);
  database.exec("COMMIT");
} catch (error) {
  if (database.isTransaction) database.exec("ROLLBACK");
  throw error;
}

database.exec("BEGIN IMMEDIATE");
try {
  if (!database.prepare("PRAGMA table_info(logs)").all().some((column) => column.name === "source")) {
    database.exec("ALTER TABLE logs ADD COLUMN source TEXT NOT NULL DEFAULT ''");
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0, 1)),
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS agent_turns (
      agent TEXT NOT NULL,
      session_id TEXT NOT NULL,
      turn_key TEXT NOT NULL,
      project TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      prompt TEXT NOT NULL,
      reply TEXT NOT NULL DEFAULT '',
      received_at TEXT NOT NULL,
      PRIMARY KEY (agent, session_id, turn_key)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_agent_turns_started ON agent_turns(started_at);

    CREATE TABLE IF NOT EXISTS agent_digest_settings (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      summary_time TEXT NOT NULL DEFAULT '18:30',
      day_start_hour INTEGER NOT NULL DEFAULT 4 CHECK (day_start_hour BETWEEN 0 AND 12),
      timezone TEXT NOT NULL DEFAULT 'UTC',
      provider_id TEXT,
      max_input_chars INTEGER NOT NULL DEFAULT 60000 CHECK (max_input_chars BETWEEN 5000 AND 200000),
      instructions TEXT NOT NULL DEFAULT '',
      excluded_projects_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS agent_digest_runs (
      work_date TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('ok', 'empty', 'failed')),
      finalized INTEGER NOT NULL DEFAULT 0 CHECK (finalized IN (0, 1)),
      turn_count INTEGER NOT NULL DEFAULT 0,
      input_chars INTEGER NOT NULL DEFAULT 0,
      item_count INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      last_turn_received_at TEXT,
      ran_at TEXT NOT NULL
    ) STRICT;

    UPDATE metadata SET value = '8' WHERE key = 'schema_version' AND CAST(value AS INTEGER) < 8;
  `);
  database.exec("COMMIT");
} catch (error) {
  if (database.isTransaction) database.exec("ROLLBACK");
  throw error;
}

const statements = {
  getRevision: database.prepare("SELECT value FROM metadata WHERE key = 'revision'"),
  setRevision: database.prepare("UPDATE metadata SET value = ? WHERE key = 'revision'"),
  getMigrationCompleted: database.prepare("SELECT value FROM metadata WHERE key = 'legacy_migration_completed'"),
  completeMigration: database.prepare("UPDATE metadata SET value = '1' WHERE key = 'legacy_migration_completed'"),
  countData: database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM tasks) +
      (SELECT COUNT(*) FROM logs) +
      (SELECT COUNT(*) FROM notes) +
      (SELECT COUNT(*) FROM reviews) +
      (SELECT COUNT(*) FROM period_reviews) +
      (SELECT COUNT(*) FROM project_reviews) +
      (SELECT COUNT(*) FROM project_period_reviews) +
      (SELECT COUNT(*) FROM period_reports) +
      (SELECT COUNT(*) FROM project_period_reports) AS count
  `),
  readTasks: database.prepare(`
    SELECT id, work_date, title, project, priority, completed, created_at, completed_at
    FROM tasks ORDER BY created_at ASC
  `),
  readLogs: database.prepare(`
    SELECT id, work_date, title, project, source_task_id, source, created_at
    FROM logs ORDER BY created_at ASC
  `),
  readNotes: database.prepare("SELECT work_date, content FROM notes ORDER BY work_date ASC"),
  readReviews: database.prepare(`
    SELECT work_date, wins, blockers, next_actions, completed_at
    FROM reviews ORDER BY work_date ASC
  `),
  readPeriodReviews: database.prepare(`
    SELECT period_type, period_start, wins, blockers, next_actions, completed_at
    FROM period_reviews ORDER BY period_start ASC, period_type ASC
  `),
  readProjectReviews: database.prepare(`
    SELECT work_date, project, wins, blockers, next_actions, completed_at
    FROM project_reviews ORDER BY work_date ASC, project ASC
  `),
  readProjectPeriodReviews: database.prepare(`
    SELECT period_type, period_start, project, wins, blockers, next_actions, completed_at
    FROM project_period_reviews ORDER BY period_start ASC, period_type ASC, project ASC
  `),
  insertTask: database.prepare(`
    INSERT INTO tasks(id, work_date, title, project, priority, completed, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertLog: database.prepare(`
    INSERT INTO logs(id, work_date, title, project, source_task_id, created_at, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  insertNote: database.prepare(`
    INSERT INTO notes(work_date, content, updated_at) VALUES (?, ?, ?)
  `),
  insertReview: database.prepare(`
    INSERT INTO reviews(work_date, wins, blockers, next_actions, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  insertPeriodReview: database.prepare(`
    INSERT INTO period_reviews(
      period_type, period_start, wins, blockers, next_actions, completed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  insertProjectReview: database.prepare(`
    INSERT INTO project_reviews(work_date, project, wins, blockers, next_actions, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  insertProjectPeriodReview: database.prepare(`
    INSERT INTO project_period_reviews(
      period_type, period_start, project, wins, blockers, next_actions, completed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  readPeriodReports: database.prepare(`
    SELECT period_type, period_start, content, updated_at
    FROM period_reports ORDER BY period_start ASC, period_type ASC
  `),
  readProjectPeriodReports: database.prepare(`
    SELECT period_type, period_start, project, content, updated_at
    FROM project_period_reports ORDER BY period_start ASC, period_type ASC, project ASC
  `),
  insertPeriodReport: database.prepare(`
    INSERT INTO period_reports(period_type, period_start, content, updated_at)
    VALUES (?, ?, ?, ?)
  `),
  insertProjectPeriodReport: database.prepare(`
    INSERT INTO project_period_reports(period_type, period_start, project, content, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  taskExists: database.prepare("SELECT 1 AS found FROM tasks WHERE id = ?"),
  upsertTask: database.prepare(`
    INSERT INTO tasks(id, work_date, title, project, priority, completed, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET work_date = excluded.work_date, title = excluded.title,
      project = excluded.project, priority = excluded.priority, completed = excluded.completed,
      created_at = excluded.created_at, completed_at = excluded.completed_at
  `),
  deleteTask: database.prepare("DELETE FROM tasks WHERE id = ?"),
  upsertLog: database.prepare(`
    INSERT INTO logs(id, work_date, title, project, source_task_id, created_at, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET work_date = excluded.work_date, title = excluded.title,
      project = excluded.project, source_task_id = excluded.source_task_id, created_at = excluded.created_at,
      source = excluded.source
  `),
  readLogSource: database.prepare("SELECT source FROM logs WHERE id = ?"),
  deleteLog: database.prepare("DELETE FROM logs WHERE id = ?"),
  upsertNote: database.prepare(`
    INSERT INTO notes(work_date, content, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(work_date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `),
  deleteNote: database.prepare("DELETE FROM notes WHERE work_date = ?"),
  upsertReview: database.prepare(`
    INSERT INTO reviews(work_date, wins, blockers, next_actions, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(work_date) DO UPDATE SET wins = excluded.wins, blockers = excluded.blockers,
      next_actions = excluded.next_actions, completed_at = excluded.completed_at, updated_at = excluded.updated_at
  `),
  deleteReview: database.prepare("DELETE FROM reviews WHERE work_date = ?"),
  upsertProjectReview: database.prepare(`
    INSERT INTO project_reviews(work_date, project, wins, blockers, next_actions, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(work_date, project) DO UPDATE SET wins = excluded.wins, blockers = excluded.blockers,
      next_actions = excluded.next_actions, completed_at = excluded.completed_at, updated_at = excluded.updated_at
  `),
  deleteProjectReview: database.prepare("DELETE FROM project_reviews WHERE work_date = ? AND project = ?"),
  upsertPeriodReview: database.prepare(`
    INSERT INTO period_reviews(period_type, period_start, wins, blockers, next_actions, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(period_type, period_start) DO UPDATE SET wins = excluded.wins, blockers = excluded.blockers,
      next_actions = excluded.next_actions, completed_at = excluded.completed_at, updated_at = excluded.updated_at
  `),
  deletePeriodReview: database.prepare("DELETE FROM period_reviews WHERE period_type = ? AND period_start = ?"),
  upsertProjectPeriodReview: database.prepare(`
    INSERT INTO project_period_reviews(
      period_type, period_start, project, wins, blockers, next_actions, completed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(period_type, period_start, project) DO UPDATE SET wins = excluded.wins, blockers = excluded.blockers,
      next_actions = excluded.next_actions, completed_at = excluded.completed_at, updated_at = excluded.updated_at
  `),
  deleteProjectPeriodReview: database.prepare(`
    DELETE FROM project_period_reviews WHERE period_type = ? AND period_start = ? AND project = ?
  `),
  upsertPeriodReport: database.prepare(`
    INSERT INTO period_reports(period_type, period_start, content, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(period_type, period_start) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `),
  deletePeriodReport: database.prepare("DELETE FROM period_reports WHERE period_type = ? AND period_start = ?"),
  upsertProjectPeriodReport: database.prepare(`
    INSERT INTO project_period_reports(period_type, period_start, project, content, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(period_type, period_start, project) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `),
  deleteProjectPeriodReport: database.prepare(`
    DELETE FROM project_period_reports WHERE period_type = ? AND period_start = ? AND project = ?
  `),
  readAiProviders: database.prepare(`
    SELECT id, name, protocol, base_url, model, timeout_ms, options_json,
      api_key_ciphertext, api_key_iv, api_key_tag, is_default, created_at, updated_at
    FROM ai_providers ORDER BY is_default DESC, created_at ASC
  `),
  readAiProvider: database.prepare(`
    SELECT id, name, protocol, base_url, model, timeout_ms, options_json,
      api_key_ciphertext, api_key_iv, api_key_tag, is_default, created_at, updated_at
    FROM ai_providers WHERE id = ?
  `),
  readDefaultAiProvider: database.prepare(`
    SELECT id, name, protocol, base_url, model, timeout_ms, options_json,
      api_key_ciphertext, api_key_iv, api_key_tag, is_default, created_at, updated_at
    FROM ai_providers WHERE is_default = 1 LIMIT 1
  `),
  insertAiProvider: database.prepare(`
    INSERT INTO ai_providers(
      id, name, protocol, base_url, model, timeout_ms, options_json,
      api_key_ciphertext, api_key_iv, api_key_tag, is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateAiProvider: database.prepare(`
    UPDATE ai_providers SET name = ?, protocol = ?, base_url = ?, model = ?, timeout_ms = ?,
      options_json = ?, api_key_ciphertext = ?, api_key_iv = ?, api_key_tag = ?, updated_at = ?
    WHERE id = ?
  `),
  deleteAiProvider: database.prepare("DELETE FROM ai_providers WHERE id = ?"),
  clearAiKey: database.prepare(`
    UPDATE ai_providers SET api_key_ciphertext = NULL, api_key_iv = NULL, api_key_tag = NULL, updated_at = ? WHERE id = ?
  `),
  clearDefaultAiProvider: database.prepare("UPDATE ai_providers SET is_default = 0 WHERE is_default = 1"),
  setDefaultAiProvider: database.prepare("UPDATE ai_providers SET is_default = 1, updated_at = ? WHERE id = ?"),
  readAiSummarySettings: database.prepare(`
    SELECT prompt_excerpt, updated_at FROM ai_summary_settings WHERE singleton_id = 1
  `),
  saveAiSummarySettings: database.prepare(`
    INSERT INTO ai_summary_settings(singleton_id, prompt_excerpt, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(singleton_id) DO UPDATE SET prompt_excerpt = excluded.prompt_excerpt, updated_at = excluded.updated_at
  `),
  resetAiSummarySettings: database.prepare("DELETE FROM ai_summary_settings WHERE singleton_id = 1"),
  readProjectOptions: database.prepare("SELECT name FROM project_options ORDER BY sort_order ASC, name ASC"),
  readProjectOption: database.prepare("SELECT name FROM project_options WHERE name = ?"),
  maxProjectOrder: database.prepare("SELECT COALESCE(MAX(sort_order), -1) AS value FROM project_options"),
  insertProjectOption: database.prepare(`
    INSERT INTO project_options(name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?)
  `),
  renameProjectOption: database.prepare("UPDATE project_options SET name = ?, updated_at = ? WHERE name = ?"),
  updateProjectOrder: database.prepare("UPDATE project_options SET sort_order = ?, updated_at = ? WHERE name = ?"),
  deleteProjectOption: database.prepare("DELETE FROM project_options WHERE name = ?"),
};

function loadAiMasterKey() {
  if (process.env.AI_CONFIG_SECRET_FILE) {
    const value = readFileSync(process.env.AI_CONFIG_SECRET_FILE, "utf8").trim();
    if (!value) throw new Error("AI_CONFIG_SECRET_FILE points to an empty secret");
    return createHash("sha256").update(value, "utf8").digest();
  }
  if (Object.hasOwn(process.env, "AI_CONFIG_SECRET")) {
    const value = process.env.AI_CONFIG_SECRET.trim();
    if (!value) throw new Error("AI_CONFIG_SECRET must not be empty");
    return createHash("sha256").update(value, "utf8").digest();
  }
  try {
    const secret = Buffer.from(readFileSync(AI_SECRET_PATH, "utf8").trim(), "base64");
    chmodSync(AI_SECRET_PATH, 0o600);
    return secret;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const secret = randomBytes(32);
    try {
      writeFileSync(AI_SECRET_PATH, secret.toString("base64"), { encoding: "utf8", mode: 0o600, flag: "wx" });
      return secret;
    } catch (writeError) {
      if (writeError.code !== "EEXIST") throw writeError;
      const existing = Buffer.from(readFileSync(AI_SECRET_PATH, "utf8").trim(), "base64");
      chmodSync(AI_SECRET_PATH, 0o600);
      return existing;
    }
  }
}

const AI_MASTER_KEY = loadAiMasterKey();
if (AI_MASTER_KEY.length !== 32) throw new Error("AI configuration master key is invalid");

function encryptApiKey(apiKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", AI_MASTER_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptApiKey(provider) {
  if (!provider.api_key_ciphertext || !provider.api_key_iv || !provider.api_key_tag) {
    throw new HttpError(400, "AI_KEY_MISSING", "这个服务还没有配置 API Key");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", AI_MASTER_KEY, Buffer.from(provider.api_key_iv, "base64"));
    decipher.setAuthTag(Buffer.from(provider.api_key_tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(provider.api_key_ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new HttpError(400, "AI_KEY_UNREADABLE", "API Key 无法解密，请重新填写并保存");
  }
}

function projectAiProvider(row) {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    baseUrl: row.base_url,
    model: row.model,
    timeoutMs: row.timeout_ms,
    options: JSON.parse(row.options_json || "{}"),
    isDefault: Boolean(row.is_default),
    hasApiKey: Boolean(row.api_key_ciphertext),
    apiKeyMask: row.api_key_ciphertext ? "••••••••" : "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readAiProviders() {
  return statements.readAiProviders.all().map(projectAiProvider);
}

function readAiSummarySettings() {
  const row = statements.readAiSummarySettings.get();
  return {
    promptExcerpt: row?.prompt_excerpt ?? DEFAULT_AI_SUMMARY_PROMPT_EXCERPT,
    isCustom: Boolean(row),
    updatedAt: row?.updated_at ?? null,
  };
}

function saveAiSummarySettings(input) {
  if (!isPlainObject(input)) throw new HttpError(400, "AI_SUMMARY_SETTINGS_INVALID", "AI 总结偏好必须是对象");
  const promptExcerpt = requireString(input.promptExcerpt, "promptExcerpt", 4000).trim();
  statements.saveAiSummarySettings.run(promptExcerpt, new Date().toISOString());
  return readAiSummarySettings();
}

function resetAiSummarySettings() {
  statements.resetAiSummarySettings.run();
  return readAiSummarySettings();
}

function readProjectOptions() {
  return statements.readProjectOptions.all().map((row) => row.name);
}

function normalizeProjectName(value, field = "name") {
  if (typeof value !== "string") throw new HttpError(400, "PROJECT_INVALID", `${field} 必须是字符串`);
  const name = value.trim();
  if (!name || name.length > 80) throw new HttpError(400, "PROJECT_INVALID", "项目名称不能为空且不能超过 80 个字符");
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new HttpError(400, "PROJECT_INVALID", "项目名称不能包含控制字符");
  return name;
}

function createProjectOption(input) {
  if (!isPlainObject(input)) throw new HttpError(400, "PROJECT_INVALID", "项目配置必须是对象");
  const name = normalizeProjectName(input.name);
  if (statements.readProjectOption.get(name)) throw new HttpError(409, "PROJECT_EXISTS", "这个项目已经存在");
  const now = new Date().toISOString();
  try {
    statements.insertProjectOption.run(name, statements.maxProjectOrder.get().value + 1, now, now);
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) throw new HttpError(409, "PROJECT_EXISTS", "这个项目已经存在");
    throw error;
  }
  return { projects: readProjectOptions(), selected: name };
}

function renameProjectOption(currentName, input) {
  const current = normalizeProjectName(currentName, "currentName");
  if (!statements.readProjectOption.get(current)) throw new HttpError(404, "PROJECT_NOT_FOUND", "项目选项不存在");
  if (!isPlainObject(input)) throw new HttpError(400, "PROJECT_INVALID", "项目配置必须是对象");
  const name = normalizeProjectName(input.name);
  if (name !== current && statements.readProjectOption.get(name)) throw new HttpError(409, "PROJECT_EXISTS", "这个项目已经存在");
  try {
    statements.renameProjectOption.run(name, new Date().toISOString(), current);
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) throw new HttpError(409, "PROJECT_EXISTS", "这个项目已经存在");
    throw error;
  }
  return { projects: readProjectOptions(), selected: name };
}

function reorderProjectOptions(input) {
  if (!isPlainObject(input) || !Array.isArray(input.projects)) throw new HttpError(400, "PROJECT_ORDER_INVALID", "项目顺序必须是数组");
  const projects = input.projects.map((name, index) => normalizeProjectName(name, `projects[${index}]`));
  const current = readProjectOptions();
  if (projects.length !== current.length || new Set(projects).size !== projects.length
    || projects.some((name) => !current.includes(name))) {
    throw new HttpError(400, "PROJECT_ORDER_INVALID", "项目顺序必须包含全部现有项目且不能重复");
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    const now = new Date().toISOString();
    projects.forEach((name, index) => statements.updateProjectOrder.run(index, now, name));
    database.exec("COMMIT");
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
  return { projects: readProjectOptions() };
}

function deleteProjectOption(name) {
  const normalized = normalizeProjectName(name);
  if (!statements.readProjectOption.get(normalized)) throw new HttpError(404, "PROJECT_NOT_FOUND", "项目选项不存在");
  statements.deleteProjectOption.run(normalized);
  return { projects: readProjectOptions(), deleted: normalized };
}

function requireAiProvider(id) {
  const provider = statements.readAiProvider.get(id);
  if (!provider) throw new HttpError(404, "AI_PROVIDER_NOT_FOUND", "AI 服务配置不存在");
  return provider;
}

function normalizeBaseUrl(value) {
  const raw = requireString(value, "baseUrl", 500).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "AI_URL_INVALID", "Base URL 不是有效地址");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new HttpError(400, "AI_URL_INVALID", "Base URL 只支持 HTTP 或 HTTPS");
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new HttpError(400, "AI_URL_INVALID", "Base URL 不能包含凭据、查询参数或片段");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function classifyIp(address) {
  if (isIP(address) === 4) {
    if (AI_IPV4_LOCAL.check(address, "ipv4")) return "local";
    if (AI_IPV4_PRIVATE.check(address, "ipv4")) return "private";
    if (AI_IPV4_FAKE_IP.check(address, "ipv4")) return "fake";
    if (AI_IPV4_FORBIDDEN.check(address, "ipv4")) return "forbidden";
    return "public";
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase().split("%")[0];
    const mappedMatch = /^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]+):([0-9a-f]+)$/.exec(normalized);
    if (mappedMatch) {
      const value = (BigInt(`0x${mappedMatch[1]}`) << 16n) | BigInt(`0x${mappedMatch[2]}`);
      return classifyIp([24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 255n)).join("."));
    }
    if (normalized.startsWith("::ffff:") && isIP(normalized.slice(7)) === 4) return classifyIp(normalized.slice(7));
    if (AI_IPV6_LOCAL.check(normalized, "ipv6")) return "local";
    if (AI_IPV6_FORBIDDEN.check(normalized, "ipv6")) return "forbidden";
    if (AI_IPV6_PRIVATE.check(normalized, "ipv6")) return "private";
    return "public";
  }
  return "forbidden";
}

async function validateAiTarget(baseUrl) {
  const url = normalizeBaseUrl(baseUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const literalAddress = Boolean(isIP(hostname));
  const blockedNames = new Set(["metadata.google.internal", "metadata", "instance-data"]);
  if (blockedNames.has(hostname) || hostname.endsWith(".internal") && hostname.includes("metadata")) {
    throw new HttpError(400, "AI_TARGET_BLOCKED", "该地址属于敏感网络目标，不能使用");
  }
  let addresses;
  if (literalAddress) addresses = [{ address: hostname, family: isIP(hostname) }];
  else {
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new HttpError(400, "AI_TARGET_UNRESOLVED", "Base URL 域名无法解析");
    }
  }
  if (!addresses.length) throw new HttpError(400, "AI_TARGET_UNRESOLVED", "Base URL 域名无法解析");
  const classes = addresses.map(({ address }) => classifyIp(address));
  if (classes.includes("forbidden")) throw new HttpError(400, "AI_TARGET_BLOCKED", "该地址属于敏感网络目标，不能使用");
  if (classes.includes("fake") && (!AI_ALLOW_PROXY_FAKE_IP || literalAddress || url.protocol !== "https:")) {
    throw new HttpError(400, "AI_TARGET_BLOCKED", "该地址属于敏感网络目标，不能使用");
  }
  if (url.protocol === "http:" && !classes.every((kind) => kind === "local" || kind === "private")) {
    throw new HttpError(400, "AI_HTTPS_REQUIRED", "公网 AI 服务必须使用 HTTPS");
  }
  const selected = addresses[0];
  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    address: selected.address,
    family: selected.family || isIP(selected.address),
  };
}

function validateAiProviderInput(input, { requireKey = false } = {}) {
  if (!isPlainObject(input)) throw new HttpError(400, "AI_PROVIDER_INVALID", "服务配置必须是对象");
  const protocol = requireString(input.protocol, "protocol", 20).trim();
  if (!["openai", "anthropic"].includes(protocol)) throw new HttpError(400, "AI_PROVIDER_INVALID", "协议类型无效");
  const timeoutMs = Number(input.timeoutMs ?? 15000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new HttpError(400, "AI_PROVIDER_INVALID", "超时时间必须在 1 到 120 秒之间");
  }
  const apiKey = input.apiKey === undefined || input.apiKey === ""
    ? null
    : requireString(input.apiKey, "apiKey", 4096);
  if (requireKey && !apiKey) throw new HttpError(400, "AI_KEY_MISSING", "新增服务时必须填写 API Key");
  const options = isPlainObject(input.options) ? input.options : {};
  const anthropicVersion = requireString(
    options.anthropicVersion ?? "2023-06-01",
    "options.anthropicVersion",
    40,
  ).trim();
  const maxTokens = Number(options.maxTokens ?? 16);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 1024) {
    throw new HttpError(400, "AI_PROVIDER_INVALID", "测试最大 Token 数无效");
  }
  return {
    name: requireString(input.name, "name", 80).trim(),
    protocol,
    baseUrl: requireString(input.baseUrl, "baseUrl", 500).trim(),
    model: requireString(input.model, "model", 160).trim(),
    timeoutMs,
    apiKey,
    options: { anthropicVersion, maxTokens },
  };
}

async function saveAiProvider(input, existing = null) {
  const next = validateAiProviderInput(input, { requireKey: !existing });
  next.baseUrl = (await validateAiTarget(next.baseUrl)).baseUrl;
  if (existing && !next.apiKey && (next.protocol !== existing.protocol || next.baseUrl !== existing.base_url)) {
    throw new HttpError(400, "AI_KEY_REENTRY_REQUIRED", "更改协议或 Base URL 时必须重新填写 API Key");
  }
  const now = new Date().toISOString();
  const encrypted = next.apiKey ? encryptApiKey(next.apiKey) : null;
  if (!existing) {
    const id = randomUUID();
    const isDefault = statements.readAiProviders.all().length === 0 ? 1 : 0;
    statements.insertAiProvider.run(
      id,
      next.name,
      next.protocol,
      next.baseUrl,
      next.model,
      next.timeoutMs,
      JSON.stringify(next.options),
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      isDefault,
      now,
      now,
    );
    return projectAiProvider(requireAiProvider(id));
  }
  statements.updateAiProvider.run(
    next.name,
    next.protocol,
    next.baseUrl,
    next.model,
    next.timeoutMs,
    JSON.stringify(next.options),
    encrypted?.ciphertext ?? existing.api_key_ciphertext,
    encrypted?.iv ?? existing.api_key_iv,
    encrypted?.tag ?? existing.api_key_tag,
    now,
    existing.id,
  );
  return projectAiProvider(requireAiProvider(existing.id));
}

function setDefaultAiProvider(id) {
  requireAiProvider(id);
  database.exec("BEGIN IMMEDIATE");
  try {
    statements.clearDefaultAiProvider.run();
    statements.setDefaultAiProvider.run(new Date().toISOString(), id);
    database.exec("COMMIT");
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
  return projectAiProvider(requireAiProvider(id));
}

function deleteAiProvider(id) {
  const provider = requireAiProvider(id);
  database.exec("BEGIN IMMEDIATE");
  try {
    statements.deleteAiProvider.run(id);
    if (provider.is_default) {
      const replacement = statements.readAiProviders.all()[0];
      if (replacement) statements.setDefaultAiProvider.run(new Date().toISOString(), replacement.id);
    }
    database.exec("COMMIT");
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

async function readBoundedJson(response) {
  const declaredLength = Number(response.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AI_RESPONSE_BYTES) {
    response.destroy();
    throw new HttpError(502, "AI_RESPONSE_TOO_LARGE", "AI 服务返回内容过大");
  }
  const chunks = [];
  let bytes = 0;
  for await (const value of response) {
    bytes += value.length;
    if (bytes > MAX_AI_RESPONSE_BYTES) {
      response.destroy();
      throw new HttpError(502, "AI_RESPONSE_TOO_LARGE", "AI 服务返回内容过大");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回格式无法识别");
  }
}

function mapAiUpstreamError(error) {
  if (error instanceof HttpError) return error;
  if (error?.code === "AI_REQUEST_TIMEOUT" || error?.name === "TimeoutError" || error?.name === "AbortError") {
    return new HttpError(504, "AI_TIMEOUT", "连接 AI 服务超时，请检查地址和超时设置");
  }
  return new HttpError(502, "AI_CONNECTION_FAILED", "无法连接 AI 服务，请检查地址和网络");
}

function requestAiTarget(target, resourcePath, { method = "POST", headers, body = null, timeoutMs }) {
  const endpoint = new URL(`${target.baseUrl}${resourcePath}`);
  const request = endpoint.protocol === "https:" ? httpsRequest : httpRequest;
  const hostname = endpoint.hostname.replace(/^\[|\]$/g, "");
  return new Promise((resolve, reject) => {
    let settled = false;
    let deadline;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      callback(value);
    };
    const outgoing = request(endpoint, {
      method,
      headers,
      agent: false,
      ...(isIP(hostname) ? {} : { servername: hostname }),
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
    }, async (response) => {
      try {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.destroy();
          finish(resolve, { ok: false, status: response.statusCode, result: null });
          return;
        }
        const result = await readBoundedJson(response);
        finish(resolve, {
          ok: true,
          status: response.statusCode,
          result,
        });
      } catch (error) {
        finish(reject, error);
      }
    });
    deadline = setTimeout(() => {
      const error = new Error("AI request timed out");
      error.code = "AI_REQUEST_TIMEOUT";
      outgoing.destroy(error);
      finish(reject, error);
    }, timeoutMs);
    outgoing.on("error", (error) => finish(reject, error));
    outgoing.end(body);
  });
}

function normalizeDiscoveredModels(result, forbiddenValues = []) {
  const sourceType = Array.isArray(result?.data) ? "data" : Array.isArray(result?.models) ? "models" : null;
  const source = sourceType ? result[sourceType] : null;
  if (!source) throw new HttpError(502, "AI_MODELS_INVALID", "AI 服务返回的模型列表格式无法识别");
  if (source.length > 5000) throw new HttpError(502, "AI_MODELS_TOO_MANY", "AI 服务返回的模型数量过多");
  const containsSecret = (value) => forbiddenValues.some((secret) => secret && value.includes(secret));
  const hasControlCharacters = (value) => /[\u0000-\u001f\u007f-\u009f]/.test(value);
  const models = new Map();
  for (const item of source) {
    if (!isPlainObject(item)) continue;
    const rawId = typeof item.id === "string"
      ? item.id
      : sourceType === "models" && typeof item.name === "string"
        ? item.name
        : "";
    const id = rawId.trim();
    if (!id || id.length > 160 || hasControlCharacters(id) || containsSecret(id)) continue;
    const rawName = typeof item.name === "string" ? item.name.trim() : "";
    const name = rawName && rawName.length <= 200 && !hasControlCharacters(rawName) && !containsSecret(rawName)
      ? rawName
      : null;
    if (!models.has(id)) models.set(id, { id, ...(name && name !== id ? { name } : {}) });
    if (models.size >= 500) break;
  }
  if (!models.size) throw new HttpError(502, "AI_MODELS_EMPTY", "AI 服务没有返回可用的模型标识");
  return [...models.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function discoverAiModels(id) {
  const provider = requireAiProvider(id);
  return discoverAiModelsWithConfig({
    protocol: provider.protocol,
    baseUrl: provider.base_url,
    apiKey: decryptApiKey(provider),
    timeoutMs: provider.timeout_ms,
    options: JSON.parse(provider.options_json || "{}"),
  });
}

function validateAiModelDiscoveryInput(input) {
  if (!isPlainObject(input)) throw new HttpError(400, "AI_PROVIDER_INVALID", "模型发现配置必须是对象");
  const protocol = requireString(input.protocol, "protocol", 20).trim();
  if (!["openai", "anthropic"].includes(protocol)) throw new HttpError(400, "AI_PROVIDER_INVALID", "协议类型无效");
  const timeoutMs = Number(input.timeoutMs ?? 15000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new HttpError(400, "AI_PROVIDER_INVALID", "超时时间必须在 1 到 120 秒之间");
  }
  const options = isPlainObject(input.options) ? input.options : {};
  return {
    protocol,
    baseUrl: requireString(input.baseUrl, "baseUrl", 500).trim(),
    apiKey: requireString(input.apiKey, "apiKey", 4096),
    timeoutMs,
    options: {
      anthropicVersion: requireString(options.anthropicVersion ?? "2023-06-01", "options.anthropicVersion", 40).trim(),
    },
  };
}

async function discoverAiModelsFromInput(input) {
  return discoverAiModelsWithConfig(validateAiModelDiscoveryInput(input));
}

async function discoverAiModelsWithConfig({ protocol, baseUrl, apiKey, timeoutMs, options }) {
  const target = await validateAiTarget(baseUrl);
  const openai = protocol === "openai";
  const headers = openai
    ? { Accept: "application/json", Authorization: `Bearer ${apiKey}` }
    : {
        Accept: "application/json",
        "x-api-key": apiKey,
        "anthropic-version": options.anthropicVersion || "2023-06-01",
      };
  try {
    const response = await requestAiTarget(target, "/models", {
      method: "GET",
      headers,
      timeoutMs,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new HttpError(502, "AI_REDIRECT_BLOCKED", "AI 服务返回了重定向，出于安全原因未跟随");
    }
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403
        ? "AI_AUTH_FAILED"
        : response.status === 429
          ? "AI_RATE_LIMITED"
          : "AI_MODELS_FAILED";
      const message = code === "AI_AUTH_FAILED"
        ? "AI 服务拒绝了 API Key"
        : code === "AI_RATE_LIMITED"
          ? "AI 服务请求过于频繁，请稍后再试"
          : `获取模型失败（HTTP ${response.status}）`;
      throw new HttpError(response.status === 429 ? 429 : 502, code, message);
    }
    return { models: normalizeDiscoveredModels(response.result, [apiKey]) };
  } catch (error) {
    throw mapAiUpstreamError(error);
  }
}

async function testAiProvider(id) {
  const provider = requireAiProvider(id);
  const target = await validateAiTarget(provider.base_url);
  const apiKey = decryptApiKey(provider);
  const options = JSON.parse(provider.options_json || "{}");
  const openai = provider.protocol === "openai";
  const headers = openai
    ? { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }
    : {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": options.anthropicVersion || "2023-06-01",
      };
  const body = openai
    ? {
        model: provider.model,
        messages: [{ role: "user", content: "Reply with OK only." }],
        max_tokens: options.maxTokens || 16,
        stream: false,
      }
    : {
        model: provider.model,
        system: "This is a connection test. Reply briefly.",
        messages: [{ role: "user", content: "Reply with OK only." }],
        max_tokens: options.maxTokens || 16,
        stream: false,
      };
  const startedAt = Date.now();
  try {
    const response = await requestAiTarget(target, openai ? "/chat/completions" : "/messages", {
      headers,
      body: JSON.stringify(body),
      timeoutMs: provider.timeout_ms,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new HttpError(502, "AI_REDIRECT_BLOCKED", "AI 服务返回了重定向，出于安全原因未跟随");
    }
    const result = response.result;
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403
        ? "AI_AUTH_FAILED"
        : response.status === 429
          ? "AI_RATE_LIMITED"
          : "AI_UPSTREAM_ERROR";
      const message = code === "AI_AUTH_FAILED"
        ? "AI 服务拒绝了 API Key"
        : code === "AI_RATE_LIMITED"
          ? "AI 服务请求过于频繁，请稍后再试"
          : `AI 服务返回错误（HTTP ${response.status}）`;
      throw new HttpError(response.status === 429 ? 429 : 502, code, message);
    }
    const text = openai
      ? result?.choices?.[0]?.message?.content
      : result?.content?.find?.((item) => item?.type === "text")?.text;
    if (typeof text !== "string") throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务响应缺少文本结果");
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      provider: provider.name,
      protocol: provider.protocol,
      model: provider.model,
    };
  } catch (error) {
    throw mapAiUpstreamError(error);
  }
}

function requirePeriodSummaryInput(input) {
  if (!isPlainObject(input)) throw new HttpError(400, "AI_SUMMARY_INVALID", "周期参数必须是对象");
  const periodType = requireString(input.periodType, "periodType", 20).trim();
  if (!Object.hasOwn({ week: true, month: true, quarter: true, year: true }, periodType)) {
    throw new HttpError(400, "AI_SUMMARY_INVALID", "周期类型无效");
  }
  const periodStart = requireString(input.periodStart, "periodStart", 10).trim();
  try {
    validatePeriodStart(periodType, periodStart, "periodStart");
  } catch (error) {
    if (error instanceof HttpError) throw new HttpError(400, "AI_SUMMARY_INVALID", "周期起始日无效");
    throw error;
  }
  const project = input.project === undefined || input.project === null || input.project === ""
    ? null
    : requireString(input.project, "project", 80).trim();
  return { periodType, periodStart, project };
}

function periodEndKey(periodType, periodStart) {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(start);
  if (periodType === "week") end.setUTCDate(end.getUTCDate() + 6);
  if (periodType === "month") end.setUTCMonth(end.getUTCMonth() + 1, 0);
  if (periodType === "quarter") end.setUTCMonth(end.getUTCMonth() + 3, 0);
  if (periodType === "year") end.setUTCFullYear(end.getUTCFullYear() + 1, 0, 0);
  return end.toISOString().slice(0, 10);
}

function buildPeriodSummarySnapshot(periodType, periodStart, project = null) {
  const periodEnd = periodEndKey(periodType, periodStart);
  const data = readState();
  const matchesProject = (item) => !project || item.project === project;
  const tasks = data.tasks.filter((task) => task.date >= periodStart && task.date <= periodEnd && matchesProject(task));
  const logs = data.logs.filter((log) => log.date >= periodStart && log.date <= periodEnd && matchesProject(log));
  const manualLogs = logs.filter((log) => !log.sourceTaskId);
  const periodKey = `${periodType}:${periodStart}`;
  const authoredReview = project
    ? data.projectPeriodReviews[periodKey]?.[project] ?? {}
    : data.periodReviews[periodKey] ?? {};
  const activeDates = new Set([
    ...tasks.map((task) => task.date),
    ...logs.map((log) => log.date),
    ...(!project ? Object.entries(data.notes)
      .filter(([date, content]) => date >= periodStart && date <= periodEnd && content.trim())
      .map(([date]) => date) : []),
    ...(!project ? Object.entries(data.reviews) : Object.entries(data.projectReviews))
      .filter(([date, reviewValue]) => {
        const review = project ? reviewValue[project] : reviewValue;
        return date >= periodStart && date <= periodEnd
          && review && [review.wins, review.blockers, review.next].some((value) => value?.trim());
      })
      .map(([date]) => date),
  ]);
  const projects = new Map();
  for (const item of [...tasks, ...manualLogs]) {
    const project = item.project || "未分类";
    projects.set(project, (projects.get(project) ?? 0) + 1);
  }
  const completedTasks = tasks.filter((task) => task.completed);
  const hasAuthoredReview = [authoredReview.wins, authoredReview.blockers, authoredReview.next]
    .some((value) => value?.trim());
  if (!tasks.length && !manualLogs.length && !hasAuthoredReview) {
    throw new HttpError(400, "AI_SUMMARY_EMPTY", "这个周期还没有可供 AI 总结的工作记录");
  }
  const summarizeItem = (item) => ({
    date: item.date,
    title: item.title,
    ...(item.project ? { project: item.project } : {}),
  });
  return {
    period: { type: periodType, start: periodStart, end: periodEnd, project },
    metrics: {
      completedTasks: completedTasks.length,
      totalTasks: tasks.length,
      completionRate: tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
      manualWorkLogs: manualLogs.length,
      activeDays: activeDates.size,
    },
    completedItems: completedTasks
      .slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_AI_SUMMARY_ITEMS).map(summarizeItem),
    manualWorkLogs: manualLogs
      .slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_AI_SUMMARY_ITEMS).map(summarizeItem),
    openItems: tasks.filter((task) => !task.completed)
      .slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, MAX_AI_SUMMARY_ITEMS).map(summarizeItem),
    projects: [...projects.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 50).map(([name, count]) => ({ name, count })),
    currentReview: {
      wins: authoredReview.wins ?? "",
      blockers: authoredReview.blockers ?? "",
      next: authoredReview.next ?? "",
    },
  };
}

function aiOutputTruncated(protocol, result) {
  return protocol === "openai"
    ? result?.choices?.[0]?.finish_reason === "length"
    : result?.stop_reason === "max_tokens";
}

function extractAiText(protocol, result) {
  return protocol === "openai"
    ? result?.choices?.[0]?.message?.content
    : result?.content?.find?.((item) => item?.type === "text")?.text;
}

function parsePeriodSummaryText(text, forbiddenValues = []) {
  if (typeof text !== "string") throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务响应缺少总结文本");
  let normalized = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(normalized);
  if (fenced) normalized = fenced[1].trim();
  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务没有返回有效的结构化总结");
  }
  if (!isPlainObject(parsed)) throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回的总结结构无效");
  const summary = {};
  for (const field of ["wins", "blockers", "next"]) {
    if (typeof parsed[field] !== "string") {
      throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回的总结字段不完整");
    }
    const value = parsed[field].trim();
    if (value.length > MAX_AI_SUMMARY_FIELD_LENGTH) {
      throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回的总结内容过长");
    }
    if (forbiddenValues.some((secret) => secret && value.includes(secret))) {
      throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回的总结包含敏感内容");
    }
    summary[field] = value;
  }
  if (!summary.wins && !summary.blockers && !summary.next) {
    throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回了空总结");
  }
  return summary;
}

function parsePeriodReportText(text, forbiddenValues = []) {
  if (typeof text !== "string") throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务响应缺少汇报文本");
  let normalized = text.trim();
  const fenced = /^```(?:markdown|md|text)?\s*([\s\S]*?)\s*```$/i.exec(normalized);
  if (fenced) normalized = fenced[1].trim();
  if (!normalized) throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回了空汇报");
  if (normalized.length > MAX_AI_REPORT_LENGTH) {
    throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回的汇报内容过长");
  }
  for (const secret of forbiddenValues) {
    if (secret && normalized.includes(secret)) {
      throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回的汇报包含敏感内容");
    }
  }
  return normalized;
}

function periodReportPrompt(snapshot, promptExcerpt) {
  return [
    `用户的总结偏好：${promptExcerpt}`,
    "请根据下面的工作周期数据，生成一份可直接提交的中文工作汇报。",
    "要求：客观、真实、简洁明了；可以稍加修饰，但不要空话套话、不要夸张措辞、不要明显的 AI 腔。",
    "结构建议：先用一两句话概述本周期情况（可包含完成事项数、活跃天数、项目分布等量化数据）；再分条列出主要成果（只能基于给定记录归纳，不得虚构）；然后写下一周期的计划；如有风险或需要的支持可单列。",
    "不要虚构未提供的事实；不要使用‘赋能’‘抓手’‘很高兴’等套话；直接陈述做了什么、结果如何。",
    `周期数据：${JSON.stringify(snapshot)}`,
  ].join("\n");
}

function periodSummaryPrompt(snapshot, promptExcerpt) {
  return [
    `用户的总结偏好：${promptExcerpt}`,
    "请根据下面的工作周期数据生成中文工作复盘。",
    "只返回一个 JSON 对象，不要 Markdown、代码围栏或额外说明。",
    'JSON 必须严格包含三个字符串字段：{"wins":"主要成果","blockers":"问题与反思","next":"下一周期重点"}。',
    "不要虚构未提供的事实；信息不足的字段可给出基于现有记录的审慎建议。",
    "每个字段控制在 1200 个中文字符以内，优先使用易编辑的短段落或项目符号。",
    `周期数据：${JSON.stringify(snapshot)}`,
  ].join("\n");
}

async function runDefaultAiTextTask({ systemPrompt, userPrompt, parseResult, maxTokens }) {
  const provider = statements.readDefaultAiProvider.get();
  if (!provider) throw new HttpError(400, "AI_DEFAULT_PROVIDER_MISSING", "请先在 AI 设置中配置默认服务");
  if (!provider.model?.trim()) throw new HttpError(400, "AI_MODEL_MISSING", "默认 AI 服务还没有配置模型");
  const apiKey = decryptApiKey(provider);
  const resolvedUserPrompt = typeof userPrompt === "function" ? userPrompt() : userPrompt;
  const target = await validateAiTarget(provider.base_url);
  const options = JSON.parse(provider.options_json || "{}");
  const openai = provider.protocol === "openai";
  const headers = openai
    ? { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }
    : {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": options.anthropicVersion || "2023-06-01",
      };
  const body = openai
    ? {
        model: provider.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: resolvedUserPrompt },
        ],
        max_tokens: maxTokens,
        stream: false,
      }
    : {
        model: provider.model,
        system: systemPrompt,
        messages: [{ role: "user", content: resolvedUserPrompt }],
        max_tokens: maxTokens,
        stream: false,
      };
  const startedAt = Date.now();
  try {
    const response = await requestAiTarget(target, openai ? "/chat/completions" : "/messages", {
      headers,
      body: JSON.stringify(body),
      timeoutMs: Math.max(provider.timeout_ms, AI_TEXT_TASK_MIN_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new HttpError(502, "AI_REDIRECT_BLOCKED", "AI 服务返回了重定向，出于安全原因未跟随");
    }
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403
        ? "AI_AUTH_FAILED"
        : response.status === 429
          ? "AI_RATE_LIMITED"
          : "AI_UPSTREAM_ERROR";
      const message = code === "AI_AUTH_FAILED"
        ? "AI 服务拒绝了 API Key"
        : code === "AI_RATE_LIMITED"
          ? "AI 服务请求过于频繁，请稍后再试"
          : `AI 服务返回错误（HTTP ${response.status}）`;
      throw new HttpError(response.status === 429 ? 429 : 502, code, message);
    }
    if (aiOutputTruncated(provider.protocol, response.result)) {
      throw new HttpError(502, "AI_RESPONSE_TRUNCATED", "AI 输出达到长度上限被截断，请缩小周期范围或更换模型后重试");
    }
    return {
      ...parseResult(extractAiText(provider.protocol, response.result), apiKey),
      provider: provider.name,
      model: provider.model,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    throw mapAiUpstreamError(error);
  }
}

async function runPeriodAiTask({ periodType, periodStart, project, systemPrompt, makeUserPrompt, parseResult }) {
  return runDefaultAiTextTask({
    systemPrompt,
    userPrompt: () => makeUserPrompt(
      buildPeriodSummarySnapshot(periodType, periodStart, project),
      readAiSummarySettings().promptExcerpt,
    ),
    parseResult,
    maxTokens: AI_PERIOD_TASK_MAX_TOKENS,
  });
}

async function generatePeriodAiSummary(input) {
  const { periodType, periodStart, project } = requirePeriodSummaryInput(input);
  return runPeriodAiTask({
    periodType,
    periodStart,
    project,
    systemPrompt: "你是一个严谨的工作复盘助手。必须严格遵守用户要求的 JSON 输出格式。",
    makeUserPrompt: periodSummaryPrompt,
    parseResult: (text, apiKey) => ({ summary: parsePeriodSummaryText(text, [apiKey]) }),
  });
}

async function generatePeriodAiReport(input) {
  const { periodType, periodStart, project } = requirePeriodSummaryInput(input);
  return runPeriodAiTask({
    periodType,
    periodStart,
    project,
    systemPrompt: "你是一个严谨、务实的工作汇报助手。必须基于给定的周期数据客观陈述，不虚构、不夸大。",
    makeUserPrompt: periodReportPrompt,
    parseResult: (text, apiKey) => ({ report: parsePeriodReportText(text, [apiKey]) }),
  });
}

function requirePolishEntryInput(input) {
  if (!isPlainObject(input)) throw new HttpError(400, "AI_POLISH_INVALID", "润色参数必须是对象");
  const type = typeof input.type === "string" ? input.type.trim() : "";
  if (!Object.hasOwn({ task: true, log: true }, type)) {
    throw new HttpError(400, "AI_POLISH_INVALID", "记录类型无效");
  }
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text || text.length > MAX_CAPTURE_ENTRY_LENGTH || /[\r\n]/.test(text)) {
    throw new HttpError(400, "AI_POLISH_INVALID", "请输入 1 到 120 字的单行记录");
  }
  return { type, text };
}

function extractPolishProtectedTokens(text) {
  const tokens = new Set();
  const patterns = [
    /https?:\/\/[^\s<>"'，。！？；：]+/giu,
    /\b[A-Za-z][A-Za-z0-9]*(?:[._:/#-][A-Za-z0-9]+)*\b/gu,
    /\d+(?:[./:_-]\d+)*(?:年|月|日|号|点|时|分|秒|周|天|个|项|次|元|万|%|％|GB|MB)?/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) tokens.add(match[0]);
  }
  return [...tokens];
}

function parsePolishedEntryText(text, sourceText, forbiddenValues = []) {
  if (typeof text !== "string") throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务响应缺少润色文本");
  const normalized = text.trim();
  if (!normalized || normalized.length > MAX_CAPTURE_ENTRY_LENGTH || /[\r\n]/.test(normalized)) {
    throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回的润色内容不是有效单行文本");
  }
  const quotePairs = [["\"", "\""], ["'", "'"], ["“", "”"], ["‘", "’"]];
  const wrappedInQuotes = quotePairs.some(([open, close]) => normalized.startsWith(open) && normalized.endsWith(close));
  if (wrappedInQuotes
    || /^(?:#{1,6}\s|[-+*>]\s|```|\d+[.)]\s)/u.test(normalized)
    || /(?:\*\*|__|~~|`[^`]+`|\[[^\]]+\]\([^)]+\))/u.test(normalized)) {
    throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回了不支持的格式");
  }
  if (forbiddenValues.some((secret) => secret && normalized.includes(secret))) {
    throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 服务返回的润色内容包含敏感信息");
  }
  const missingToken = extractPolishProtectedTokens(sourceText).find((token) => !normalized.includes(token));
  if (missingToken) {
    throw new HttpError(502, "AI_RESPONSE_INVALID", "AI 润色未能完整保留原文中的关键信息");
  }
  return normalized;
}

function polishEntryPrompt(type, text) {
  const typeLabel = type === "task" ? "待办事项（尚未完成）" : "工作记录（已经发生或完成）";
  return [
    `记录类型：${typeLabel}`,
    `原文：${text}`,
    "只返回润色后的单行纯文本，不要引号、标题、列表、Markdown 或解释。",
  ].join("\n");
}

async function generateCapturePolish(input) {
  const { type, text } = requirePolishEntryInput(input);
  return runDefaultAiTextTask({
    systemPrompt: [
      "你是日常工作记录润色助手。原文是唯一事实来源。",
      "只允许修正病句、调整语序、压缩无信息赘词；不得增加、删除或改变任何事实。",
      "不得虚构数字、时间、状态、成果、原因或下一步，不得夸大，不得把待办写成已完成。",
      "保留原文中的数字、日期、URL、版本、工单号和英文标识符。",
      "使用简洁、准确、自然的中文，避免赋能、抓手、闭环、深度、全面等空泛汇报腔。",
    ].join("\n"),
    userPrompt: polishEntryPrompt(type, text),
    parseResult: (resultText, apiKey) => ({ polished: parsePolishedEntryText(resultText, text, [apiKey]) }),
    maxTokens: AI_POLISH_TASK_MAX_TOKENS,
  });
}

function getRevision() {
  return Number.parseInt(statements.getRevision.get().value, 10);
}

function hasDatabaseData() {
  return statements.countData.get().count > 0;
}

function isMigrationAllowed() {
  return statements.getMigrationCompleted.get().value !== "1" && !hasDatabaseData();
}

function groupProjectReviewRows(rows, keyFromRow) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFromRow(row);
    if (!grouped.has(key)) grouped.set(key, new Map());
    grouped.get(key).set(row.project, {
      wins: row.wins,
      blockers: row.blockers,
      next: row.next_actions,
      completedAt: row.completed_at,
    });
  }
  return Object.fromEntries(
    [...grouped].map(([key, projects]) => [key, Object.fromEntries(projects)]),
  );
}


function groupProjectReportRows(rows, keyFromRow) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFromRow(row);
    if (!grouped.has(key)) grouped.set(key, new Map());
    grouped.get(key).set(row.project, { content: row.content, updatedAt: row.updated_at });
  }
  return Object.fromEntries(
    [...grouped].map(([key, projects]) => [key, Object.fromEntries(projects)]),
  );
}

function readState() {
  const tasks = statements.readTasks.all().map((row) => ({
    id: row.id,
    date: row.work_date,
    title: row.title,
    project: row.project,
    priority: row.priority,
    completed: Boolean(row.completed),
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));

  const logs = statements.readLogs.all().map((row) => ({
    id: row.id,
    date: row.work_date,
    title: row.title,
    project: row.project,
    sourceTaskId: row.source_task_id,
    source: row.source,
    createdAt: row.created_at,
  }));

  const notes = Object.fromEntries(
    statements.readNotes.all().map((row) => [row.work_date, row.content]),
  );

  const reviews = Object.fromEntries(
    statements.readReviews.all().map((row) => [
      row.work_date,
      {
        wins: row.wins,
        blockers: row.blockers,
        next: row.next_actions,
        completedAt: row.completed_at,
      },
    ]),
  );

  const periodReviews = Object.fromEntries(
    statements.readPeriodReviews.all().map((row) => [
      `${row.period_type}:${row.period_start}`,
      {
        wins: row.wins,
        blockers: row.blockers,
        next: row.next_actions,
        completedAt: row.completed_at,
      },
    ]),
  );

  const projectReviews = groupProjectReviewRows(
    statements.readProjectReviews.all(),
    (row) => row.work_date,
  );

  const projectPeriodReviews = groupProjectReviewRows(
    statements.readProjectPeriodReviews.all(),
    (row) => `${row.period_type}:${row.period_start}`,
  );

  const periodReports = Object.fromEntries(
    statements.readPeriodReports.all().map((row) => [
      `${row.period_type}:${row.period_start}`,
      { content: row.content, updatedAt: row.updated_at },
    ]),
  );

  const projectPeriodReports = groupProjectReportRows(
    statements.readProjectPeriodReports.all(),
    (row) => `${row.period_type}:${row.period_start}`,
  );

  return { tasks, logs, notes, reviews, periodReviews, projectReviews, projectPeriodReviews, periodReports, projectPeriodReports };
}

function stateResponse() {
  return {
    data: readState(),
    revision: getRevision(),
    empty: !hasDatabaseData(),
    migrationAllowed: isMigrationAllowed(),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, field, maxLength, { allowEmpty = false, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string") throw new HttpError(400, "INVALID_STATE", `${field} 必须是字符串`);
  if ((!allowEmpty && !value.trim()) || value.length > maxLength) {
    throw new HttpError(400, "INVALID_STATE", `${field} 长度不符合要求`);
  }
  return value;
}

function requireDate(value, field) {
  requireString(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "INVALID_STATE", `${field} 不是有效日期`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, "INVALID_STATE", `${field} 不是有效日期`);
  }
  return value;
}

function requireTimestamp(value, field, options = {}) {
  const timestamp = requireString(value, field, 40, options);
  if (timestamp === null) return null;
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new HttpError(400, "INVALID_STATE", `${field} 不是有效时间`);
  }
  return timestamp;
}

function requireArray(value, field, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new HttpError(400, "INVALID_STATE", `${field} 不是有效数组`);
  }
  return value;
}

function validatePeriodStart(periodType, periodStart, field) {
  requireDate(periodStart, field);
  const date = new Date(`${periodStart}T00:00:00Z`);
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const valid = periodType === "week"
    ? date.getUTCDay() === 1
    : periodType === "month"
      ? day === 1
      : periodType === "quarter"
        ? day === 1 && month % 3 === 0
        : month === 0 && day === 1;
  if (!valid) throw new HttpError(400, "INVALID_STATE", `${field} 不是规范的周期起始日`);
  return periodStart;
}

function validateReviewValue(review, field, maxLength) {
  if (!isPlainObject(review)) throw new HttpError(400, "INVALID_STATE", `${field} 无效`);
  return {
    wins: requireString(review.wins ?? "", `${field}.wins`, maxLength, { allowEmpty: true }),
    blockers: requireString(review.blockers ?? "", `${field}.blockers`, maxLength, { allowEmpty: true }),
    next: requireString(review.next ?? "", `${field}.next`, maxLength, { allowEmpty: true }),
    completedAt: requireTimestamp(review.completedAt, `${field}.completedAt`, { nullable: true }),
  };
}

function validateReportValue(report, field) {
  if (!isPlainObject(report)) throw new HttpError(400, "INVALID_STATE", `${field} 无效`);
  return {
    content: requireString(report.content ?? "", `${field}.content`, MAX_REPORT_CONTENT_LENGTH, { allowEmpty: true }),
    updatedAt: requireTimestamp(report.updatedAt, `${field}.updatedAt`, { nullable: true }),
  };
}

function validateTaskValue(task, field) {
  if (!isPlainObject(task)) throw new HttpError(400, "INVALID_STATE", `${field} 无效`);
  const id = requireString(task.id, `${field}.id`, 128);
  if (!["low", "normal", "high"].includes(task.priority)) {
    throw new HttpError(400, "INVALID_STATE", `${field}.priority 无效`);
  }
  if (typeof task.completed !== "boolean") {
    throw new HttpError(400, "INVALID_STATE", `${field}.completed 必须是布尔值`);
  }
  return {
    id,
    date: requireDate(task.date, `${field}.date`),
    title: requireString(task.title, `${field}.title`, 120),
    project: requireString(task.project ?? "", `${field}.project`, 80, { allowEmpty: true }),
    priority: task.priority,
    completed: task.completed,
    createdAt: requireTimestamp(task.createdAt, `${field}.createdAt`),
    completedAt: requireTimestamp(task.completedAt, `${field}.completedAt`, { nullable: true }),
  };
}

function validateLogSource(value, field) {
  if (value === undefined || value === null) return undefined;
  if (value !== "" && (typeof value !== "string" || !/^[a-z0-9-]{1,40}$/.test(value))) {
    throw new HttpError(400, "INVALID_STATE", `${field} 无效`);
  }
  return value;
}

function validateLogValue(log, field) {
  if (!isPlainObject(log)) throw new HttpError(400, "INVALID_STATE", `${field} 无效`);
  return {
    id: requireString(log.id, `${field}.id`, 128),
    date: requireDate(log.date, `${field}.date`),
    title: requireString(log.title, `${field}.title`, 120),
    project: requireString(log.project ?? "", `${field}.project`, 80, { allowEmpty: true }),
    sourceTaskId: requireString(log.sourceTaskId, `${field}.sourceTaskId`, 128, { nullable: true }),
    source: validateLogSource(log.source, `${field}.source`),
    createdAt: requireTimestamp(log.createdAt, `${field}.createdAt`),
  };
}

function validateProjectReviewMap(input, field, { period = false, maxEntries = 100000 } = {}) {
  if (!isPlainObject(input)) throw new HttpError(400, "INVALID_STATE", `${field} 必须是有效对象`);
  const groups = [];
  let entryCount = 0;
  for (const [key, projectValues] of Object.entries(input)) {
    if (period) {
      const match = /^(week|month|quarter|year):(\d{4}-\d{2}-\d{2})$/.exec(key);
      if (!match) throw new HttpError(400, "INVALID_STATE", `${field}.${key} 的键无效`);
      validatePeriodStart(match[1], match[2], `${field}.${key} 起始日`);
    } else {
      requireDate(key, `${field} 日期`);
    }
    if (!isPlainObject(projectValues)) throw new HttpError(400, "INVALID_STATE", `${field}.${key} 必须是项目对象`);
    const projects = [];
    for (const [project, review] of Object.entries(projectValues)) {
      requireString(project, `${field}.${key} 项目`, 80);
      projects.push([project, validateReviewValue(review, `${field}.${key}.${project}`, period ? 4000 : 1200)]);
      entryCount += 1;
      if (entryCount > maxEntries) throw new HttpError(400, "INVALID_STATE", `${field} 条目过多`);
    }
    groups.push([key, Object.fromEntries(projects)]);
  }
  return Object.fromEntries(groups);
}

function validateProjectReportMap(input, field, { maxEntries = 100000 } = {}) {
  if (!isPlainObject(input)) throw new HttpError(400, "INVALID_STATE", `${field} 必须是有效对象`);
  const groups = [];
  let entryCount = 0;
  for (const [key, projectValues] of Object.entries(input)) {
    const match = /^(week|month|quarter|year):(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (!match) throw new HttpError(400, "INVALID_STATE", `${field}.${key} 的键无效`);
    validatePeriodStart(match[1], match[2], `${field}.${key} 起始日`);
    if (!isPlainObject(projectValues)) throw new HttpError(400, "INVALID_STATE", `${field}.${key} 必须是项目对象`);
    const projects = [];
    for (const [project, report] of Object.entries(projectValues)) {
      requireString(project, `${field}.${key} 项目`, 80);
      projects.push([project, validateReportValue(report, `${field}.${key}.${project}`)]);
      entryCount += 1;
      if (entryCount > maxEntries) throw new HttpError(400, "INVALID_STATE", `${field} 条目过多`);
    }
    groups.push([key, Object.fromEntries(projects)]);
  }
  return Object.fromEntries(groups);
}

function validateState(input, {
  periodReviewsFallback = {},
  projectReviewsFallback = {},
  projectPeriodReviewsFallback = {},
  periodReportsFallback = {},
  projectPeriodReportsFallback = {},
  logSourcesFallback = new Map(),
} = {}) {
  if (!isPlainObject(input)) throw new HttpError(400, "INVALID_STATE", "data 必须是对象");

  const taskIds = new Set();
  const tasks = requireArray(input.tasks, "tasks", 10000).map((task, index) => {
    const validated = validateTaskValue(task, `tasks[${index}]`);
    if (taskIds.has(validated.id)) throw new HttpError(400, "INVALID_STATE", `待办 ID 重复：${validated.id}`);
    taskIds.add(validated.id);
    return validated;
  });

  const logIds = new Set();
  const logs = requireArray(input.logs, "logs", 20000).map((log, index) => {
    const validated = validateLogValue(log, `logs[${index}]`);
    if (logIds.has(validated.id)) throw new HttpError(400, "INVALID_STATE", `记录 ID 重复：${validated.id}`);
    logIds.add(validated.id);
    if (validated.sourceTaskId && !taskIds.has(validated.sourceTaskId)) {
      throw new HttpError(400, "INVALID_STATE", `logs[${index}].sourceTaskId 不存在`);
    }
    validated.source ??= logSourcesFallback.get(validated.id) ?? "";
    return validated;
  });

  if (!isPlainObject(input.notes) || Object.keys(input.notes).length > 36600) {
    throw new HttpError(400, "INVALID_STATE", "notes 必须是有效对象");
  }
  const notes = {};
  for (const [date, content] of Object.entries(input.notes)) {
    notes[requireDate(date, "notes 日期")] = requireString(content, `notes.${date}`, 2000, { allowEmpty: true });
  }

  if (!isPlainObject(input.reviews) || Object.keys(input.reviews).length > 36600) {
    throw new HttpError(400, "INVALID_STATE", "reviews 必须是有效对象");
  }
  const reviews = {};
  for (const [date, review] of Object.entries(input.reviews)) {
    requireDate(date, "reviews 日期");
    reviews[date] = validateReviewValue(review, `reviews.${date}`, 1200);
  }

  const periodReviewInput = input.periodReviews === undefined ? periodReviewsFallback : input.periodReviews;
  if (!isPlainObject(periodReviewInput) || Object.keys(periodReviewInput).length > 10000) {
    throw new HttpError(400, "INVALID_STATE", "periodReviews 必须是有效对象");
  }
  const periodReviews = {};
  for (const [key, review] of Object.entries(periodReviewInput)) {
    const match = /^(week|month|quarter|year):(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (!match) throw new HttpError(400, "INVALID_STATE", `periodReviews.${key} 的键无效`);
    const [, periodType, periodStart] = match;
    validatePeriodStart(periodType, periodStart, `periodReviews.${key} 起始日`);
    periodReviews[key] = validateReviewValue(review, `periodReviews.${key}`, 4000);
  }

  const projectReviews = validateProjectReviewMap(
    input.projectReviews === undefined ? projectReviewsFallback : input.projectReviews,
    "projectReviews",
  );
  const projectPeriodReviews = validateProjectReviewMap(
    input.projectPeriodReviews === undefined ? projectPeriodReviewsFallback : input.projectPeriodReviews,
    "projectPeriodReviews",
    { period: true },
  );

  const periodReportsInput = input.periodReports === undefined ? periodReportsFallback : input.periodReports;
  if (!isPlainObject(periodReportsInput) || Object.keys(periodReportsInput).length > 10000) {
    throw new HttpError(400, "INVALID_STATE", "periodReports 必须是有效对象");
  }
  const periodReports = {};
  for (const [key, report] of Object.entries(periodReportsInput)) {
    const match = /^(week|month|quarter|year):(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (!match) throw new HttpError(400, "INVALID_STATE", `periodReports.${key} 的键无效`);
    validatePeriodStart(match[1], match[2], `periodReports.${key} 起始日`);
    periodReports[key] = validateReportValue(report, `periodReports.${key}`);
  }

  const projectPeriodReports = validateProjectReportMap(
    input.projectPeriodReports === undefined ? projectPeriodReportsFallback : input.projectPeriodReports,
    "projectPeriodReports",
  );

  return {
    tasks,
    logs,
    notes,
    reviews,
    periodReviews,
    projectReviews,
    projectPeriodReviews,
    periodReports,
    projectPeriodReports,
  };
}

function replaceState(nextState, expectedRevision, { onlyIfEmpty = false } = {}) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const currentRevision = getRevision();
    if (onlyIfEmpty && !isMigrationAllowed()) {
      database.exec("ROLLBACK");
      return { migrated: false, ...stateResponse() };
    }
    if (!onlyIfEmpty && expectedRevision !== currentRevision) throw new ConflictError();

    database.exec(`
      DELETE FROM logs;
      DELETE FROM tasks;
      DELETE FROM notes;
      DELETE FROM reviews;
      DELETE FROM period_reviews;
      DELETE FROM project_reviews;
      DELETE FROM project_period_reviews;
      DELETE FROM period_reports;
      DELETE FROM project_period_reports;
    `);

    for (const task of nextState.tasks) {
      statements.insertTask.run(
        task.id,
        task.date,
        task.title,
        task.project,
        task.priority,
        task.completed ? 1 : 0,
        task.createdAt,
        task.completedAt,
      );
    }
    for (const log of nextState.logs) {
      statements.insertLog.run(log.id, log.date, log.title, log.project, log.sourceTaskId, log.createdAt, log.source);
    }
    const updatedAt = new Date().toISOString();
    for (const [date, content] of Object.entries(nextState.notes)) {
      statements.insertNote.run(date, content, updatedAt);
    }
    for (const [date, review] of Object.entries(nextState.reviews)) {
      statements.insertReview.run(date, review.wins, review.blockers, review.next, review.completedAt, updatedAt);
    }
    for (const [key, review] of Object.entries(nextState.periodReviews)) {
      const [periodType, periodStart] = key.split(":");
      statements.insertPeriodReview.run(
        periodType,
        periodStart,
        review.wins,
        review.blockers,
        review.next,
        review.completedAt,
        updatedAt,
      );
    }
    for (const [date, projects] of Object.entries(nextState.projectReviews)) {
      for (const [project, review] of Object.entries(projects)) {
        statements.insertProjectReview.run(
          date,
          project,
          review.wins,
          review.blockers,
          review.next,
          review.completedAt,
          updatedAt,
        );
      }
    }
    for (const [key, projects] of Object.entries(nextState.projectPeriodReviews)) {
      const [periodType, periodStart] = key.split(":");
      for (const [project, review] of Object.entries(projects)) {
        statements.insertProjectPeriodReview.run(
          periodType,
          periodStart,
          project,
          review.wins,
          review.blockers,
          review.next,
          review.completedAt,
          updatedAt,
        );
      }
    }
    for (const [key, report] of Object.entries(nextState.periodReports)) {
      const [periodType, periodStart] = key.split(":");
      statements.insertPeriodReport.run(periodType, periodStart, report.content, updatedAt);
    }
    for (const [key, projects] of Object.entries(nextState.projectPeriodReports)) {
      const [periodType, periodStart] = key.split(":");
      for (const [project, report] of Object.entries(projects)) {
        statements.insertProjectPeriodReport.run(periodType, periodStart, project, report.content, updatedAt);
      }
    }

    const nextRevision = currentRevision + 1;
    statements.setRevision.run(String(nextRevision));
    statements.completeMigration.run();
    database.exec("COMMIT");
    return {
      migrated: onlyIfEmpty,
      data: nextState,
      revision: nextRevision,
      empty: !hasDatabaseData(),
      migrationAllowed: false,
    };
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

function requirePeriodKey(key, field) {
  const match = typeof key === "string" ? /^(week|month|quarter|year):(\d{4}-\d{2}-\d{2})$/.exec(key) : null;
  if (!match) throw new HttpError(400, "INVALID_STATE", `${field} 的键无效`);
  validatePeriodStart(match[1], match[2], `${field} 起始日`);
  return [match[1], match[2]];
}

const reviewParams = (review, now) => [review.wins, review.blockers, review.next, review.completedAt, now];

const PATCH_OPS = {
  "task.put": {
    parse: (op, field) => ({ task: validateTaskValue(op.task, `${field}.task`) }),
    run: ({ task }) => statements.upsertTask.run(
      task.id, task.date, task.title, task.project, task.priority, task.completed ? 1 : 0, task.createdAt, task.completedAt,
    ),
  },
  "task.delete": {
    parse: (op, field) => ({ id: requireString(op.id, `${field}.id`, 128) }),
    run: ({ id }) => statements.deleteTask.run(id),
  },
  "log.put": {
    parse: (op, field) => ({ log: validateLogValue(op.log, `${field}.log`), field }),
    run: ({ log, field }) => {
      if (log.sourceTaskId && !statements.taskExists.get(log.sourceTaskId)) {
        throw new HttpError(400, "INVALID_STATE", `${field}.log.sourceTaskId 不存在`);
      }
      const source = log.source ?? statements.readLogSource.get(log.id)?.source ?? "";
      statements.upsertLog.run(log.id, log.date, log.title, log.project, log.sourceTaskId, log.createdAt, source);
    },
  },
  "log.delete": {
    parse: (op, field) => ({ id: requireString(op.id, `${field}.id`, 128) }),
    run: ({ id }) => statements.deleteLog.run(id),
  },
  "note.put": {
    parse: (op, field) => ({
      date: requireDate(op.date, `${field}.date`),
      content: requireString(op.content, `${field}.content`, 2000, { allowEmpty: true }),
    }),
    run: ({ date, content }, now) => statements.upsertNote.run(date, content, now),
  },
  "note.delete": {
    parse: (op, field) => ({ date: requireDate(op.date, `${field}.date`) }),
    run: ({ date }) => statements.deleteNote.run(date),
  },
  "review.put": {
    parse: (op, field) => ({
      date: requireDate(op.date, `${field}.date`),
      review: validateReviewValue(op.review, `${field}.review`, 1200),
    }),
    run: ({ date, review }, now) => statements.upsertReview.run(date, ...reviewParams(review, now)),
  },
  "review.delete": {
    parse: (op, field) => ({ date: requireDate(op.date, `${field}.date`) }),
    run: ({ date }) => statements.deleteReview.run(date),
  },
  "projectReview.put": {
    parse: (op, field) => ({
      date: requireDate(op.date, `${field}.date`),
      project: requireString(op.project, `${field}.project`, 80),
      review: validateReviewValue(op.review, `${field}.review`, 1200),
    }),
    run: ({ date, project, review }, now) => statements.upsertProjectReview.run(date, project, ...reviewParams(review, now)),
  },
  "projectReview.delete": {
    parse: (op, field) => ({
      date: requireDate(op.date, `${field}.date`),
      project: requireString(op.project, `${field}.project`, 80),
    }),
    run: ({ date, project }) => statements.deleteProjectReview.run(date, project),
  },
  "periodReview.put": {
    parse: (op, field) => ({
      period: requirePeriodKey(op.key, `${field}.key`),
      review: validateReviewValue(op.review, `${field}.review`, 4000),
    }),
    run: ({ period, review }, now) => statements.upsertPeriodReview.run(...period, ...reviewParams(review, now)),
  },
  "periodReview.delete": {
    parse: (op, field) => ({ period: requirePeriodKey(op.key, `${field}.key`) }),
    run: ({ period }) => statements.deletePeriodReview.run(...period),
  },
  "projectPeriodReview.put": {
    parse: (op, field) => ({
      period: requirePeriodKey(op.key, `${field}.key`),
      project: requireString(op.project, `${field}.project`, 80),
      review: validateReviewValue(op.review, `${field}.review`, 4000),
    }),
    run: ({ period, project, review }, now) => statements.upsertProjectPeriodReview.run(
      ...period, project, ...reviewParams(review, now),
    ),
  },
  "projectPeriodReview.delete": {
    parse: (op, field) => ({
      period: requirePeriodKey(op.key, `${field}.key`),
      project: requireString(op.project, `${field}.project`, 80),
    }),
    run: ({ period, project }) => statements.deleteProjectPeriodReview.run(...period, project),
  },
  "periodReport.put": {
    parse: (op, field) => ({
      period: requirePeriodKey(op.key, `${field}.key`),
      report: validateReportValue(op.report, `${field}.report`),
    }),
    run: ({ period, report }, now) => statements.upsertPeriodReport.run(...period, report.content, now),
  },
  "periodReport.delete": {
    parse: (op, field) => ({ period: requirePeriodKey(op.key, `${field}.key`) }),
    run: ({ period }) => statements.deletePeriodReport.run(...period),
  },
  "projectPeriodReport.put": {
    parse: (op, field) => ({
      period: requirePeriodKey(op.key, `${field}.key`),
      project: requireString(op.project, `${field}.project`, 80),
      report: validateReportValue(op.report, `${field}.report`),
    }),
    run: ({ period, project, report }, now) => statements.upsertProjectPeriodReport.run(
      ...period, project, report.content, now,
    ),
  },
  "projectPeriodReport.delete": {
    parse: (op, field) => ({
      period: requirePeriodKey(op.key, `${field}.key`),
      project: requireString(op.project, `${field}.project`, 80),
    }),
    run: ({ period, project }) => statements.deleteProjectPeriodReport.run(...period, project),
  },
};

function validatePatch(input) {
  if (!isPlainObject(input)) throw new HttpError(400, "INVALID_PATCH", "请求内容必须是对象");
  if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0) {
    throw new HttpError(400, "INVALID_REVISION", "baseRevision 无效");
  }
  if (!Array.isArray(input.ops) || !input.ops.length || input.ops.length > MAX_PATCH_OPS) {
    throw new HttpError(400, "INVALID_PATCH", `ops 必须是 1 到 ${MAX_PATCH_OPS} 条变更组成的数组`);
  }
  const ops = input.ops.map((op, index) => {
    const handler = isPlainObject(op) && typeof op.op === "string" && Object.hasOwn(PATCH_OPS, op.op)
      ? PATCH_OPS[op.op]
      : null;
    if (!handler) throw new HttpError(400, "INVALID_PATCH", `ops[${index}].op 无效`);
    return { handler, args: handler.parse(op, `ops[${index}]`) };
  });
  return { baseRevision: input.baseRevision, ops };
}

function applyPatch({ baseRevision, ops }) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const currentRevision = getRevision();
    const now = new Date().toISOString();
    for (const { handler, args } of ops) handler.run(args, now);
    const nextRevision = currentRevision + 1;
    statements.setRevision.run(String(nextRevision));
    statements.completeMigration.run();
    database.exec("COMMIT");
    return { revision: nextRevision, stale: baseRevision !== currentRevision };
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

function singleHeaderValue(request, name) {
  const raw = request.headers[name];
  if (raw === undefined) return null;
  if (Array.isArray(raw) || /[\u0000-\u001f\u007f,]/.test(raw)) {
    throw new HttpError(400, "PROXY_HEADER_INVALID", "代理转发信息无效");
  }
  const value = raw.trim();
  if (!value) throw new HttpError(400, "PROXY_HEADER_INVALID", "代理转发信息无效");
  return value;
}

function validateAuthority(value) {
  if (!value || value.length > 300 || /[\s/@\\]/.test(value)) {
    throw new HttpError(400, "HOST_INVALID", "请求主机信息无效");
  }
  let parsed;
  try {
    parsed = new URL(`http://${value}`);
  } catch {
    throw new HttpError(400, "HOST_INVALID", "请求主机信息无效");
  }
  if (!parsed.hostname || parsed.host.toLowerCase() !== value.toLowerCase() || parsed.pathname !== "/") {
    throw new HttpError(400, "HOST_INVALID", "请求主机信息无效");
  }
  return parsed.host;
}

function proxyContext(request) {
  if (request.mydaysProxyContext) return request.mydaysProxyContext;
  const context = { protocol: null, host: null, address: null };
  if (TRUST_PROXY) {
    const protocol = singleHeaderValue(request, "x-forwarded-proto");
    if (protocol && protocol !== "http" && protocol !== "https") {
      throw new HttpError(400, "PROXY_HEADER_INVALID", "代理转发信息无效");
    }
    const forwardedHost = singleHeaderValue(request, "x-forwarded-host");
    const forwardedFor = singleHeaderValue(request, "x-forwarded-for");
    let address = forwardedFor;
    if (address?.startsWith("[") && address.endsWith("]")) address = address.slice(1, -1);
    if (address && !isIP(address)) {
      throw new HttpError(400, "PROXY_HEADER_INVALID", "代理转发信息无效");
    }
    context.protocol = protocol;
    context.host = forwardedHost ? validateAuthority(forwardedHost) : null;
    context.address = address;
  }
  request.mydaysProxyContext = context;
  return context;
}

function requestAuthority(request) {
  return proxyContext(request).host || validateAuthority(singleHeaderValue(request, "host"));
}

function requestIsSecure(request) {
  if (request.socket.encrypted) return true;
  return proxyContext(request).protocol === "https";
}

function commonHeaders(extra = {}, { secure = false } = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    ...(secure ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
    ...extra,
  };
}

function sendJson(response, status, body, request = null) {
  const content = Buffer.from(JSON.stringify(body));
  response.writeHead(status, commonHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": content.length,
    "Cache-Control": "no-store",
  }, { secure: request ? requestIsSecure(request) : Boolean(response.mydaysSecure) }));
  response.end(content);
}

function parseCookies(request) {
  const cookies = {};
  for (const part of (request.headers.cookie || "").split(";").map((value) => value.trim()).filter(Boolean)) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    try {
      cookies[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
    } catch {
      continue;
    }
  }
  return cookies;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
  while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
}

function currentSession(request) {
  cleanupSessions();
  const id = parseCookies(request).mydays_session;
  const session = id ? sessions.get(id) : null;
  if (!session || session.expiresAt <= Date.now()) return null;
  return { id, ...session };
}

function sourceKey(request) {
  const forwardedAddress = proxyContext(request).address;
  if (forwardedAddress) return forwardedAddress;
  return request.socket.remoteAddress || "unknown";
}

function consumeRateLimit(map, key, { limit, windowMs }) {
  const now = Date.now();
  const cutoff = now - windowMs;
  for (const [existingKey, timestamps] of map) {
    const active = timestamps.filter((time) => time > cutoff);
    if (!active.length) map.delete(existingKey);
    else if (active.length !== timestamps.length) map.set(existingKey, active);
  }
  const recent = map.get(key) || [];
  if (recent.length >= limit) throw new HttpError(429, "RATE_LIMITED", "请求过于频繁，请稍后再试");
  recent.push(now);
  if (!map.has(key)) {
    while (map.size >= MAX_RATE_LIMIT_KEYS) map.delete(map.keys().next().value);
  } else {
    map.delete(key);
  }
  map.set(key, recent);
}

function validateSameOrigin(request, { required = true } = {}) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const secure = requestIsSecure(request);
  const expectedOrigin = new URL(`${secure ? "https" : "http"}://${requestAuthority(request)}`).origin;
  const supplied = request.headers.origin || request.headers.referer;
  if (!supplied) {
    if (required) throw new HttpError(403, "ORIGIN_REQUIRED", "修改请求缺少同源信息");
    return;
  }
  let actual;
  try { actual = new URL(supplied).origin; } catch { throw new HttpError(403, "ORIGIN_INVALID", "请求来源无效"); }
  if (actual !== expectedOrigin) throw new HttpError(403, "ORIGIN_MISMATCH", "跨站修改请求已被拒绝");
}

function sendError(response, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof HttpError ? error.message : "服务器暂时无法处理请求";
  if (status >= 500) console.error(error);
  sendJson(response, status, { error: { code, message } });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let tooLarge = false;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) return reject(new HttpError(413, "BODY_TOO_LARGE", "请求内容超过 2 MiB 限制"));
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new HttpError(400, "INVALID_JSON", "请求内容不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}

function serveStatic(request, response, pathname) {
  const normalizedPath = pathname !== "/" ? pathname.replace(/\/+$/, "") : pathname;
  const entry = STATIC_FILES.get(normalizedPath);
  if (!entry) throw new HttpError(404, "NOT_FOUND", "页面不存在");
  const content = readFileSync(path.join(__dirname, entry.file));
  response.writeHead(200, commonHeaders({
    "Content-Type": entry.type,
    "Content-Length": content.length,
    "Cache-Control": entry.cache,
  }, { secure: requestIsSecure(request) }));
  response.end(request.method === "HEAD" ? undefined : content);
}

const server = createServer(async (request, response) => {
  try {
    response.mydaysSecure = false;
    proxyContext(request);
    requestAuthority(request);
    response.mydaysSecure = requestIsSecure(request);
    const url = new URL(request.url, "http://localhost");

    if (url.pathname === "/healthz") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
      }
      database.prepare("SELECT 1").get();
      const content = Buffer.from("ok\n");
      response.writeHead(200, commonHeaders({
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": content.length,
        "Cache-Control": "no-store",
      }, { secure: requestIsSecure(request) }));
      return response.end(request.method === "HEAD" ? undefined : content);
    }

    if (url.pathname === "/api/auth/status") {
      if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
      return sendJson(response, 200, { enabled: Boolean(ACCESS_PASSWORD_HASH), authenticated: !ACCESS_PASSWORD_HASH || Boolean(currentSession(request)) }, request);
    }

    if (url.pathname === "/api/auth/login") {
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
      if (!ACCESS_PASSWORD_HASH) return sendJson(response, 200, { authenticated: true }, request);
      validateSameOrigin(request);
      const loginSource = sourceKey(request);
      consumeRateLimit(loginAttempts, loginSource, { limit: 8, windowMs: 15 * 60 * 1000 });
      const body = await readJsonBody(request);
      const validPasswordInput = typeof body.password === "string" && body.password.length > 0 && body.password.length <= 4096;
      const candidate = validPasswordInput ? createHash("sha256").update(body.password).digest() : Buffer.alloc(32);
      if (!timingSafeEqual(ACCESS_PASSWORD_HASH, candidate)) {
        throw new HttpError(401, "LOGIN_FAILED", "访问密码不正确");
      }
      loginAttempts.delete(loginSource);
      cleanupSessions();
      const id = randomBytes(32).toString("base64url");
      sessions.set(id, { expiresAt: Date.now() + SESSION_TTL_MS });
      const secure = requestIsSecure(request);
      response.setHeader("Set-Cookie", `mydays_session=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`);
      return sendJson(response, 200, { authenticated: true }, request);
    }

    if (url.pathname === "/api/auth/logout") {
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
      validateSameOrigin(request);
      const session = currentSession(request);
      if (session) sessions.delete(session.id);
      response.setHeader("Set-Cookie", `mydays_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${requestIsSecure(request) ? "; Secure" : ""}`);
      return sendJson(response, 200, { authenticated: false }, request);
    }

    const anonymousPath = url.pathname === "/login" || url.pathname === "/login.js" || url.pathname === "/theme.js" || url.pathname === "/styles.css";
    if (ACCESS_PASSWORD_HASH && !anonymousPath && !currentSession(request)) {
      if (url.pathname.startsWith("/api/")) throw new HttpError(401, "AUTH_REQUIRED", "请先登录 MyDays");
      response.writeHead(302, commonHeaders({ Location: "/login", "Cache-Control": "no-store" }, { secure: requestIsSecure(request) }));
      return response.end();
    }
    validateSameOrigin(request, { required: Boolean(ACCESS_PASSWORD_HASH) });

    if (url.pathname === "/api/state") {
      if (request.method === "GET") return sendJson(response, 200, stateResponse());
      if (request.method === "PUT") {
        const body = await readJsonBody(request);
        if (!Number.isSafeInteger(body.revision) || body.revision < 0) {
          throw new HttpError(400, "INVALID_REVISION", "revision 无效");
        }
        const currentState = readState();
        const nextState = validateState(body.data, {
          periodReviewsFallback: currentState.periodReviews,
          projectReviewsFallback: currentState.projectReviews,
          projectPeriodReviewsFallback: currentState.projectPeriodReviews,
          periodReportsFallback: currentState.periodReports,
          projectPeriodReportsFallback: currentState.projectPeriodReports,
          logSourcesFallback: new Map(currentState.logs.map((log) => [log.id, log.source])),
        });
        return sendJson(response, 200, replaceState(nextState, body.revision));
      }
      if (request.method === "PATCH") {
        return sendJson(response, 200, applyPatch(validatePatch(await readJsonBody(request))));
      }
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
    }

    if (url.pathname === "/api/migrate") {
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
      const body = await readJsonBody(request);
      const legacyState = validateState(body.data);
      return sendJson(response, 200, replaceState(legacyState, null, { onlyIfEmpty: true }));
    }

    if (url.pathname === "/api/projects") {
      if (request.method === "GET") return sendJson(response, 200, { projects: readProjectOptions() });
      if (request.method === "POST") return sendJson(response, 201, createProjectOption(await readJsonBody(request)));
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
    }

    if (url.pathname === "/api/projects/order") {
      if (request.method !== "PUT") throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
      return sendJson(response, 200, reorderProjectOptions(await readJsonBody(request)));
    }

    const projectOptionMatch = /^\/api\/projects\/([^/]+)$/.exec(url.pathname);
    if (projectOptionMatch) {
      let projectName;
      try { projectName = decodeURIComponent(projectOptionMatch[1]); } catch { throw new HttpError(400, "PROJECT_INVALID", "项目名称编码无效"); }
      if (request.method === "PUT") return sendJson(response, 200, renameProjectOption(projectName, await readJsonBody(request)));
      if (request.method === "DELETE") return sendJson(response, 200, deleteProjectOption(projectName));
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
    }

    if (url.pathname === "/api/ai/providers") {
      if (request.method === "GET") {
        const providers = readAiProviders();
        return sendJson(response, 200, {
          providers,
          configured: providers.some((provider) => provider.hasApiKey),
          defaultProviderId: providers.find((provider) => provider.isDefault)?.id ?? null,
        });
      }
      if (request.method === "POST") {
        const provider = await saveAiProvider(await readJsonBody(request));
        return sendJson(response, 201, { provider });
      }
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
    }

    if (url.pathname === "/api/ai/models") {
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
      consumeRateLimit(aiOperations, currentSession(request)?.id || sourceKey(request), { limit: 20, windowMs: 60 * 1000 });
      return sendJson(response, 200, await discoverAiModelsFromInput(await readJsonBody(request)));
    }

    if (url.pathname === "/api/ai/summary-settings") {
      if (request.method === "GET") return sendJson(response, 200, readAiSummarySettings());
      if (request.method === "PUT") return sendJson(response, 200, saveAiSummarySettings(await readJsonBody(request)));
      if (request.method === "DELETE") return sendJson(response, 200, resetAiSummarySettings());
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
    }

    if (url.pathname === "/api/ai/period-summary") {
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
      consumeRateLimit(aiOperations, `summary:${currentSession(request)?.id || sourceKey(request)}`, { limit: 10, windowMs: 60 * 1000 });
      return sendJson(response, 200, await generatePeriodAiSummary(await readJsonBody(request)));
    }

    if (url.pathname === "/api/ai/period-report") {
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
      consumeRateLimit(aiOperations, `report:${currentSession(request)?.id || sourceKey(request)}`, { limit: 10, windowMs: 60 * 1000 });
      return sendJson(response, 200, await generatePeriodAiReport(await readJsonBody(request)));
    }

    if (url.pathname === "/api/ai/polish-entry") {
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
      consumeRateLimit(aiOperations, `polish:${currentSession(request)?.id || sourceKey(request)}`, { limit: 20, windowMs: 60 * 1000 });
      return sendJson(response, 200, await generateCapturePolish(await readJsonBody(request)));
    }

    const aiProviderMatch = /^\/api\/ai\/providers\/([0-9a-f-]+)(?:\/(default|test|key|models))?$/.exec(url.pathname);
    if (aiProviderMatch) {
      const [, id, action] = aiProviderMatch;
      if (!action && request.method === "PUT") {
        const provider = await saveAiProvider(await readJsonBody(request), requireAiProvider(id));
        return sendJson(response, 200, { provider });
      }
      if (!action && request.method === "DELETE") {
        deleteAiProvider(id);
        return sendJson(response, 200, { deleted: true });
      }
      if (action === "default" && request.method === "POST") {
        return sendJson(response, 200, { provider: setDefaultAiProvider(id) });
      }
      if (action === "test" && request.method === "POST") {
        consumeRateLimit(aiOperations, currentSession(request)?.id || sourceKey(request), { limit: 20, windowMs: 60 * 1000 });
        return sendJson(response, 200, await testAiProvider(id));
      }
      if (action === "models" && request.method === "POST") {
        consumeRateLimit(aiOperations, currentSession(request)?.id || sourceKey(request), { limit: 20, windowMs: 60 * 1000 });
        return sendJson(response, 200, await discoverAiModels(id));
      }
      if (action === "key" && request.method === "DELETE") {
        requireAiProvider(id);
        statements.clearAiKey.run(new Date().toISOString(), id);
        return sendJson(response, 200, { provider: projectAiProvider(requireAiProvider(id)) });
      }
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
    }

    if (url.pathname.startsWith("/api/")) throw new HttpError(404, "NOT_FOUND", "API 不存在");
    if (request.method !== "GET" && request.method !== "HEAD") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
    }
    return serveStatic(request, response, url.pathname);
  } catch (error) {
    return sendError(response, error);
  }
});

server.listen(PORT, process.env.HOST ?? "0.0.0.0", () => {
  console.log(`MyDays listening on port ${PORT}; database: ${DATABASE_PATH}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

module.exports = { EMPTY_STATE, validateState };
