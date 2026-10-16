const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-schema-v7-"));
const databasePath = path.join(dataDir, "mydays.db");
const port = 43188;
const baseUrl = `http://127.0.0.1:${port}`;

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
  INSERT INTO metadata(key, value) VALUES ('schema_version', '7'), ('revision', '9'), ('legacy_migration_completed', '1');
  INSERT INTO tasks VALUES ('v7-task', '2026-10-12', '升级前的待办', '工作', 'normal', 1, '2026-10-12T01:00:00.000Z', '2026-10-12T02:00:00.000Z');
  INSERT INTO logs VALUES ('v7-auto-log', '2026-10-12', '升级前的待办', '工作', 'v7-task', '2026-10-12T02:00:00.000Z');
  INSERT INTO logs VALUES ('v7-manual-log', '2026-10-12', '升级前的手动记录', '', NULL, '2026-10-12T03:00:00.000Z');
`);
seed.close();

let serverOutput = "";

async function runServer(check) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { serverOutput += chunk; });
  child.stderr.on("data", (chunk) => { serverOutput += chunk; });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        if ((await fetch(`${baseUrl}/healthz`)).ok) break;
      } catch {}
      if (attempt >= 50) throw new Error("Server did not start");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await check();
  } finally {
    child.kill("SIGTERM");
    await exited;
  }
}

async function assertUpgraded() {
  const body = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal(body.revision, 9, "v7 升级不得重置 revision");
  assert.equal(body.data.tasks[0].title, "升级前的待办");
  assert.equal(body.data.tasks[0].dueDate, null, "旧待办没有截止日期");
  assert.deepEqual(body.data.recurrences, []);
  assert.equal(body.data.logs.length, 2, "v7 记录必须保留");
  assert.deepEqual(body.data.logs.map((log) => log.source), ["", ""], "旧记录的来源必须为空");
  assert.equal(body.data.logs.find((log) => log.id === "v7-auto-log").sourceTaskId, "v7-task");
}

(async () => {
  try {
    await runServer(assertUpgraded);
    await runServer(assertUpgraded);

    const migrated = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(migrated.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get().value, "10");
    assert.equal(migrated.prepare("PRAGMA table_info(logs)").all().filter((column) => column.name === "source").length, 1, "重复启动不得重复添加 source 列");
    assert.equal(migrated.prepare("PRAGMA table_info(agent_tokens)").all().filter((column) => column.name === "scope").length, 1, "重复启动不得重复添加 scope 列");
    const taskColumns = migrated.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
    for (const column of ["origin_date", "due_date", "due_time", "remind_minutes", "recurrence_id"]) {
      assert.equal(taskColumns.filter((name) => name === column).length, 1, `tasks.${column} 只能添加一次`);
    }
    assert.equal(migrated.prepare("SELECT value FROM metadata WHERE key = 'task_rollover'").get().value, "1", "升级后默认开启顺延");
    for (const table of ["agent_tokens", "agent_turns", "agent_digest_settings", "agent_digest_runs", "agent_time_daily", "task_recurrences"]) {
      assert.equal(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)?.name, table);
    }
    migrated.close();
    console.log("MyDays schema v7 to v10 upgrade test passed");
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  console.error(serverOutput);
  process.exitCode = 1;
});
