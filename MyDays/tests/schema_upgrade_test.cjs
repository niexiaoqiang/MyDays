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
  INSERT INTO notes(work_date, content, updated_at) VALUES ('2025-12-31', '升级前笔记', '2025-12-31T03:00:00.000Z');
  INSERT INTO notes(work_date, content, updated_at) VALUES ('2025-12-30', '只有笔记的一天', '2025-12-30T03:00:00.000Z');
  INSERT INTO reviews(work_date, wins, blockers, next_actions, completed_at, updated_at)
  VALUES ('2025-12-31', '', '升级前的问题', '', NULL, '2025-12-31T03:00:00.000Z');
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
    assert.equal(
      body.data.periodReviews["year:2025-01-01"][""].notes,
      "【成果】\n升级前年度成果\n\n【下一步】\n继续保持",
      "v2 周期复盘必须带标签合并保留",
    );
    assert.equal(body.data.reviews["2025-12-31"].content, "【问题】\n升级前的问题\n\n【笔记】\n升级前笔记", "每日复盘和笔记必须合并保留");
    assert.equal(body.data.reviews["2025-12-30"].content, "只有笔记的一天", "只有一段内容时不加标签");
    assert.equal("notes" in body.data, false);

    const migrated = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(migrated.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get().value, "13");
    const tableNames = new Set(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    for (const retired of ["notes", "reviews", "period_reviews", "project_reviews", "project_period_reviews", "period_reports", "project_period_reports"]) {
      assert.equal(tableNames.has(retired), false, `v11 必须删除 ${retired}`);
    }
    assert.equal(tableNames.has("daily_reviews") && tableNames.has("period_records"), true);
    assert.equal(migrated.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = 'v1-task'").get().count, 1);
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_providers'").get().name, "ai_providers");
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_summary_settings'").get().name, "ai_summary_settings");
    assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_options'").get().name, "project_options");
    assert.deepEqual(
      migrated.prepare("SELECT name FROM project_options ORDER BY sort_order").all().map((row) => row.name),
      ["工作", "个人", "学习", "迁移验证"],
      "升级时必须导入默认项目和历史项目",
    );
    migrated.close();
    console.log("MyDays schema v2 to v13 upgrade test passed");
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
    assert.deepEqual(body.data.periodReviews["week:2026-08-10"], {
      "": { report: "", notes: "【成果】\nv6 全部项目成果\n\n【下一步】\n继续" },
      迁移验证: { report: "", notes: "【成果】\nv6 项目成果\n\n【下一步】\n继续" },
    }, "v6 全部项目与项目周期复盘必须合并保留");

    const migrated6 = new DatabaseSync(databasePath6, { readOnly: true });
    assert.equal(migrated6.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get().value, "13");
    assert.equal(migrated6.prepare("SELECT COUNT(*) AS count FROM period_records").get().count, 2);
    assert.equal(migrated6.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = 'v6-task'").get().count, 1);
    migrated6.close();
    console.log("MyDays schema v6 to v13 upgrade test passed");
  } finally {
    child6.kill("SIGTERM");
  }
})().catch((error) => {
  console.error(error);
  console.error(serverOutput6);
  child6.kill("SIGKILL");
  process.exitCode = 1;
});
