const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-schema-v2-"));
const databasePath = path.join(dataDir, "mydays.db");
const seed = new DatabaseSync(databasePath);
seed.exec(`
  CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    work_date TEXT NOT NULL,
    title TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high')),
    completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL,
    completed_at TEXT
  ) STRICT;
  CREATE TABLE logs (
    id TEXT PRIMARY KEY,
    work_date TEXT NOT NULL,
    title TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT '',
    source_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE notes (work_date TEXT PRIMARY KEY, content TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
  CREATE TABLE reviews (
    work_date TEXT PRIMARY KEY,
    wins TEXT NOT NULL DEFAULT '',
    blockers TEXT NOT NULL DEFAULT '',
    next_actions TEXT NOT NULL DEFAULT '',
    completed_at TEXT,
    updated_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE period_reviews (
    period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month', 'quarter', 'year')),
    period_start TEXT NOT NULL,
    wins TEXT NOT NULL DEFAULT '',
    blockers TEXT NOT NULL DEFAULT '',
    next_actions TEXT NOT NULL DEFAULT '',
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (period_type, period_start)
  ) STRICT;
  INSERT INTO metadata(key, value) VALUES
    ('schema_version', '2'),
    ('revision', '7'),
    ('legacy_migration_completed', '1');
  INSERT INTO tasks(id, work_date, title, project, priority, completed, created_at, completed_at)
  VALUES ('v1-task', '2025-12-31', '升级前的重要记录', '迁移验证', 'high', 1, '2025-12-31T01:00:00.000Z', '2025-12-31T02:00:00.000Z');
  INSERT INTO period_reviews(period_type, period_start, wins, blockers, next_actions, completed_at, updated_at)
  VALUES ('year', '2025-01-01', '升级前年度成果', '', '继续保持', NULL, '2025-12-31T03:00:00.000Z');
`);
seed.close();

const port = 43174;
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server.js"], {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
child.stdout.on("data", (chunk) => { serverOutput += chunk; });
child.stderr.on("data", (chunk) => { serverOutput += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Schema-v1 server did not start:\n${serverOutput}`);
}

(async () => {
  try {
    await waitForServer();
    const response = await fetch(`${baseUrl}/api/state`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.revision, 7, "升级不得重置 revision");
    assert.equal(body.data.tasks[0].title, "升级前的重要记录", "v1 业务数据必须保留");
    assert.equal(body.data.periodReviews["year:2025-01-01"].wins, "升级前年度成果", "v2 周期复盘必须保留");

    const migrated = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(migrated.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get().value, "9");
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'period_reviews'").get().name, "period_reviews");
    assert.equal(migrated.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = 'v1-task'").get().count, 1);
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_providers'").get().name, "ai_providers");
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_summary_settings'").get().name, "ai_summary_settings");
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_options'").get().name, "project_options");
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_reviews'").get().name, "project_reviews");
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_period_reviews'").get().name, "project_period_reviews");
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'period_reports'").get().name, "period_reports");
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_period_reports'").get().name, "project_period_reports");
    assert.deepEqual(
      migrated.prepare("SELECT name FROM project_options ORDER BY sort_order").all().map((row) => row.name),
      ["工作", "个人", "学习", "迁移验证"],
      "升级时必须导入默认项目和历史项目",
    );
    migrated.close();
    console.log("MyDays schema v2 to v7 upgrade test passed");
  } finally {
    child.kill("SIGTERM");
  }
})().catch((error) => {
  console.error(error);
  console.error(serverOutput);
  child.kill("SIGKILL");
  process.exitCode = 1;
});

// --- Schema v6 to v7 upgrade test (period reports) ---
const dataDir6 = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-schema-v6-"));
const databasePath6 = path.join(dataDir6, "mydays.db");
const seed6 = new DatabaseSync(databasePath6);
seed6.exec(`
  CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    work_date TEXT NOT NULL,
    title TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high')),
    completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL,
    completed_at TEXT
  ) STRICT;
  CREATE TABLE period_reviews (
    period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month', 'quarter', 'year')),
    period_start TEXT NOT NULL,
    wins TEXT NOT NULL DEFAULT '',
    blockers TEXT NOT NULL DEFAULT '',
    next_actions TEXT NOT NULL DEFAULT '',
    completed_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (period_type, period_start)
  ) STRICT;
  CREATE TABLE project_period_reviews (
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
  INSERT INTO metadata(key, value) VALUES
    ('schema_version', '6'),
    ('revision', '5'),
    ('legacy_migration_completed', '1');
  INSERT INTO tasks(id, work_date, title, project, priority, completed, created_at, completed_at)
  VALUES ('v6-task', '2026-08-10', '升级前的周期任务', '迁移验证', 'high', 1, '2026-08-10T01:00:00.000Z', '2026-08-10T02:00:00.000Z');
  INSERT INTO period_reviews(period_type, period_start, wins, blockers, next_actions, completed_at, updated_at)
  VALUES ('week', '2026-08-10', 'v6 全部项目成果', '', '继续', NULL, '2026-08-10T03:00:00.000Z');
  INSERT INTO project_period_reviews(period_type, period_start, project, wins, blockers, next_actions, completed_at, updated_at)
  VALUES ('week', '2026-08-10', '迁移验证', 'v6 项目成果', '', '继续', NULL, '2026-08-10T03:00:00.000Z');
`);
seed6.close();

const port6 = 43177;
const baseUrl6 = `http://127.0.0.1:${port6}`;
const child6 = spawn(process.execPath, ["server.js"], {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env, PORT: String(port6), DATA_DIR: dataDir6 },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput6 = "";
child6.stdout.on("data", (chunk) => { serverOutput6 += chunk; });
child6.stderr.on("data", (chunk) => { serverOutput6 += chunk; });

async function waitForServer6() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl6}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Schema-v6 server did not start:\n${serverOutput6}`);
}

(async () => {
  try {
    await waitForServer6();
    const response = await fetch(`${baseUrl6}/api/state`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.revision, 5, "v6 升级不得重置 revision");
    assert.equal(body.data.tasks[0].title, "升级前的周期任务", "v6 任务数据必须保留");
    assert.equal(body.data.periodReviews["week:2026-08-10"].wins, "v6 全部项目成果", "v6 周期复盘必须保留");
    assert.equal(body.data.projectPeriodReviews["week:2026-08-10"]["迁移验证"].wins, "v6 项目成果", "v6 项目周期复盘必须保留");
    assert.deepEqual(body.data.periodReports, {}, "升级后新汇报表应为空");
    assert.deepEqual(body.data.projectPeriodReports, {}, "升级后新项目汇报表应为空");

    const migrated6 = new DatabaseSync(databasePath6, { readOnly: true });
    assert.equal(migrated6.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get().value, "9");
    assert.equal(migrated6.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'period_reports'").get().name, "period_reports");
    assert.equal(migrated6.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_period_reports'").get().name, "project_period_reports");
    assert.equal(migrated6.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = 'v6-task'").get().count, 1);
    migrated6.close();
    console.log("MyDays schema v6 to v7 upgrade test passed");
  } finally {
    child6.kill("SIGTERM");
  }
})().catch((error) => {
  console.error(error);
  console.error(serverOutput6);
  child6.kill("SIGKILL");
  process.exitCode = 1;
});
