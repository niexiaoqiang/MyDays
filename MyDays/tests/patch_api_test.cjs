const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-patch-api-"));
const port = 43187;
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server.js"], {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env, PORT: String(port), DATA_DIR: tempDir },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
child.stdout.on("data", (chunk) => { serverOutput += chunk; });
child.stderr.on("data", (chunk) => { serverOutput += chunk; });

async function jsonRequest(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

function patch(baseRevision, ops) {
  return jsonRequest("/api/state", { method: "PATCH", body: JSON.stringify({ baseRevision, ops }) });
}

async function readServerState() {
  return (await jsonRequest("/api/state")).body;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start:\n${serverOutput}`);
}

const task = (id, overrides = {}) => ({
  id,
  date: "2026-10-12",
  title: `待办 ${id}`,
  project: "工作",
  priority: "normal",
  completed: false,
  createdAt: "2026-10-12T01:00:00.000Z",
  completedAt: null,
  ...overrides,
});
const log = (id, overrides = {}) => ({
  id,
  date: "2026-10-12",
  title: `记录 ${id}`,
  project: "",
  sourceTaskId: null,
  createdAt: "2026-10-12T02:00:00.000Z",
  ...overrides,
});
const review = (wins) => ({ wins, blockers: "", next: "", completedAt: null });

(async () => {
  try {
    await waitForServer();

    let state = await readServerState();
    assert.equal(state.revision, 0);

    let result = await patch(0, [
      { op: "task.put", task: task("t1") },
      { op: "task.put", task: task("t2", { completed: true, completedAt: "2026-10-12T03:00:00.000Z" }) },
      { op: "log.put", log: log("l1") },
      { op: "log.put", log: log("l2", { sourceTaskId: "t2" }) },
      { op: "note.put", date: "2026-10-12", content: "第一天笔记" },
      { op: "note.put", date: "2026-10-13", content: "第二天笔记" },
      { op: "review.put", date: "2026-10-12", review: review("每日成果") },
      { op: "periodReview.put", key: "week:2026-10-12", review: review("周成果") },
      { op: "projectPeriodReview.put", key: "week:2026-10-12", project: "工作", review: review("项目周成果") },
      { op: "periodReport.put", key: "month:2026-10-01", report: { content: "月度汇报" } },
      { op: "projectPeriodReport.put", key: "month:2026-10-01", project: "工作", report: { content: "项目月度汇报" } },
    ]);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body, { revision: 1, stale: false });

    state = await readServerState();
    assert.equal(state.revision, 1);
    assert.deepEqual(state.data.tasks.map((entry) => entry.id).sort(), ["t1", "t2"]);
    assert.equal(state.data.tasks.find((entry) => entry.id === "t2").completed, true);
    assert.equal(state.data.logs.find((entry) => entry.id === "l2").sourceTaskId, "t2");
    assert.equal(state.data.notes["2026-10-13"], "第二天笔记");
    assert.equal(state.data.reviews["2026-10-12"].wins, "每日成果");
    assert.equal(state.data.periodReviews["week:2026-10-12"].wins, "周成果");
    assert.equal(state.data.projectPeriodReviews["week:2026-10-12"].工作.wins, "项目周成果");
    assert.equal(state.data.periodReports["month:2026-10-01"].content, "月度汇报");
    assert.equal(state.data.projectPeriodReports["month:2026-10-01"].工作.content, "项目月度汇报");

    const database = new DatabaseSync(path.join(tempDir, "mydays.db"), { readOnly: true });
    const readStamps = () => ({
      note12: database.prepare("SELECT updated_at FROM notes WHERE work_date = '2026-10-12'").get().updated_at,
      note13: database.prepare("SELECT updated_at FROM notes WHERE work_date = '2026-10-13'").get().updated_at,
      review: database.prepare("SELECT updated_at FROM reviews WHERE work_date = '2026-10-12'").get().updated_at,
      report: database.prepare("SELECT updated_at FROM period_reports").get().updated_at,
    });
    const before = readStamps();
    await new Promise((resolve) => setTimeout(resolve, 20));
    result = await patch(1, [
      { op: "note.put", date: "2026-10-13", content: "第二天笔记（已修改）" },
      { op: "task.put", task: task("t1", { title: "改过标题的待办", priority: "high" }) },
    ]);
    assert.deepEqual(result.body, { revision: 2, stale: false });
    const after = readStamps();
    assert.notEqual(after.note13, before.note13, "被修改的笔记必须更新 updated_at");
    assert.equal(after.note12, before.note12, "未修改的笔记不得更新 updated_at");
    assert.equal(after.review, before.review, "未修改的复盘不得更新 updated_at");
    assert.equal(after.report, before.report, "未修改的汇报不得更新 updated_at");

    result = await patch(1, [{ op: "task.put", task: task("t3") }]);
    assert.equal(result.response.status, 200, "过期 baseRevision 不得拒绝不同条目的写入");
    assert.deepEqual(result.body, { revision: 3, stale: true });
    state = await readServerState();
    assert.equal(state.data.tasks.find((entry) => entry.id === "t1").title, "改过标题的待办");
    assert.equal(state.data.tasks.some((entry) => entry.id === "t3"), true);
    assert.equal(state.data.notes["2026-10-13"], "第二天笔记（已修改）");

    result = await patch(3, [
      { op: "task.put", task: task("t4") },
      { op: "note.put", date: "2026-13-40", content: "非法日期" },
    ]);
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "INVALID_STATE");
    result = await patch(3, [
      { op: "task.put", task: task("t4") },
      { op: "log.put", log: log("l3", { sourceTaskId: "missing-task" }) },
    ]);
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "INVALID_STATE");
    state = await readServerState();
    assert.equal(state.revision, 3, "失败的增量请求不得改变 revision");
    assert.equal(state.data.tasks.some((entry) => entry.id === "t4"), false, "失败的增量请求必须整体回滚");

    for (const [body, code] of [
      [{ baseRevision: 3, ops: [] }, "INVALID_PATCH"],
      [{ baseRevision: 3, ops: Array.from({ length: 501 }, (_, index) => ({ op: "task.delete", id: `x${index}` })) }, "INVALID_PATCH"],
      [{ baseRevision: 3, ops: [{ op: "task.replace", task: task("t9") }] }, "INVALID_PATCH"],
      [{ baseRevision: 3, ops: [{ op: "projectReview.put", date: "2026-10-12", project: "工作", review: review("已移除") }] }, "INVALID_PATCH"],
      [{ baseRevision: 3, ops: [{ op: "__proto__" }] }, "INVALID_PATCH"],
      [{ baseRevision: 3, ops: "nope" }, "INVALID_PATCH"],
      [{ baseRevision: -1, ops: [{ op: "task.delete", id: "t1" }] }, "INVALID_REVISION"],
      [{ baseRevision: 3, ops: [{ op: "periodReview.put", key: "week:2026-10-13", review: review("非周一") }] }, "INVALID_STATE"],
      [{ baseRevision: 3, ops: [{ op: "task.put", task: task("t9", { priority: "urgent" }) }] }, "INVALID_STATE"],
    ]) {
      result = await jsonRequest("/api/state", { method: "PATCH", body: JSON.stringify(body) });
      assert.equal(result.response.status, 400);
      assert.equal(result.body.error.code, code);
    }

    result = await patch(3, [
      { op: "task.delete", id: "t2" },
      { op: "log.delete", id: "l1" },
      { op: "task.delete", id: "never-existed" },
      { op: "note.delete", date: "2026-10-12" },
      { op: "review.delete", date: "2026-10-12" },
      { op: "periodReview.delete", key: "week:2026-10-12" },
      { op: "projectPeriodReview.delete", key: "week:2026-10-12", project: "工作" },
      { op: "periodReport.delete", key: "month:2026-10-01" },
      { op: "projectPeriodReport.delete", key: "month:2026-10-01", project: "工作" },
    ]);
    assert.deepEqual(result.body, { revision: 4, stale: false });
    state = await readServerState();
    assert.deepEqual(state.data.tasks.map((entry) => entry.id).sort(), ["t1", "t3"]);
    assert.deepEqual(state.data.logs, [], "删除待办必须级联删除其自动记录");
    assert.deepEqual(Object.keys(state.data.notes), ["2026-10-13"]);
    for (const key of ["reviews", "periodReviews", "projectPeriodReviews", "periodReports", "projectPeriodReports"]) {
      assert.deepEqual(state.data[key], {}, `${key} 应已删除`);
    }

    result = await jsonRequest("/api/state", { method: "PUT", body: JSON.stringify({ data: state.data, revision: 3 }) });
    assert.equal(result.response.status, 409, "整包 PUT 仍必须严格校验 revision");
    assert.equal(result.body.error.code, "STATE_CONFLICT");

    database.close();
    const writer = new DatabaseSync(path.join(tempDir, "mydays.db"));
    writer.exec("PRAGMA busy_timeout = 5000");
    const insert = writer.prepare(`
      INSERT INTO tasks(id, work_date, title, project, priority, completed, created_at, completed_at)
      VALUES (?, '2026-01-05', ?, '', 'normal', 0, '2026-01-05T01:00:00.000Z', NULL)
    `);
    writer.exec("BEGIN");
    for (let index = 0; index < 9000; index += 1) insert.run(`bulk-${index}`, "历".repeat(120));
    writer.exec("COMMIT");
    writer.close();
    const fullResponse = await fetch(`${baseUrl}/api/state`);
    const fullSize = (await fullResponse.arrayBuffer()).byteLength;
    assert.equal(fullSize > 2 * 1024 * 1024, true, "测试数据必须超过整包保存的 2 MiB 上限");
    const smallBody = JSON.stringify({ baseRevision: 4, ops: [{ op: "task.put", task: task("after-bulk") }] });
    assert.equal(Buffer.byteLength(smallBody) < 4096, true);
    result = await jsonRequest("/api/state", { method: "PATCH", body: smallBody });
    assert.equal(result.response.status, 200, "数据超过 2 MiB 后增量保存仍必须成功");
    assert.equal(result.body.revision, 5);

    let rev = result.body.revision;
    result = await patch(rev, [{ op: "log.put", log: log("l-digest", { source: "agent-digest" }) }]);
    assert.equal(result.response.status, 200);
    rev = result.body.revision;
    result = await patch(rev, [{ op: "log.put", log: log("l-digest", { title: "旧客户端改了标题" }) }]);
    rev = result.body.revision;
    const database2 = new DatabaseSync(path.join(tempDir, "mydays.db"), { readOnly: true });
    const sourceOf = (id) => database2.prepare("SELECT source, title FROM logs WHERE id = ?").get(id);
    assert.deepEqual({ ...sourceOf("l-digest") }, { source: "agent-digest", title: "旧客户端改了标题" }, "未带 source 的增量写入不得清除来源");
    result = await patch(rev, [{ op: "log.put", log: log("l-digest", { source: "" }) }]);
    rev = result.body.revision;
    assert.equal(sourceOf("l-digest").source, "", "显式清空来源即认领");
    result = await patch(rev, [{ op: "log.put", log: log("l-bad", { source: "Not Valid" }) }]);
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "INVALID_STATE");
    database2.close();

    console.log("MyDays incremental state API test passed");
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  console.error(serverOutput);
  process.exitCode = 1;
});
