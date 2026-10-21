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
const review = (content) => ({ content });
const record = (report, notes = "") => ({ report, notes });

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
      { op: "review.put", date: "2026-10-12", review: review("第一天复盘") },
      { op: "review.put", date: "2026-10-13", review: review("第二天复盘") },
      { op: "periodReview.put", key: "week:2026-10-12", project: "", review: record("", "周说明") },
      { op: "periodReview.put", key: "week:2026-10-12", project: "工作", review: record("项目周报") },
      { op: "periodReview.put", key: "month:2026-10-01", review: record("月度汇报") },
      { op: "periodReview.put", key: "range:2026-01-01:2026-06-30", project: "工作", review: record("上半年项目总结") },
    ]);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body, { revision: 1, stale: false });

    state = await readServerState();
    assert.equal(state.revision, 1);
    assert.deepEqual(state.data.tasks.map((entry) => entry.id).sort(), ["t1", "t2"]);
    assert.equal(state.data.tasks.find((entry) => entry.id === "t2").completed, true);
    assert.equal(state.data.logs.find((entry) => entry.id === "l2").sourceTaskId, "t2");
    assert.equal(state.data.reviews["2026-10-13"].content, "第二天复盘");
    assert.deepEqual(state.data.periodReviews["week:2026-10-12"], { "": record("", "周说明"), 工作: record("项目周报") });
    assert.deepEqual(state.data.periodReviews["month:2026-10-01"], { "": record("月度汇报") }, "省略 project 即全部项目");
    assert.equal(state.data.periodReviews["range:2026-01-01:2026-06-30"].工作.report, "上半年项目总结");

    const database = new DatabaseSync(path.join(tempDir, "mydays.db"), { readOnly: true });
    const readStamps = () => ({
      review12: database.prepare("SELECT updated_at FROM daily_reviews WHERE work_date = '2026-10-12'").get().updated_at,
      review13: database.prepare("SELECT updated_at FROM daily_reviews WHERE work_date = '2026-10-13'").get().updated_at,
      report: database.prepare("SELECT updated_at FROM period_records WHERE period_type = 'month'").get().updated_at,
    });
    const before = readStamps();
    await new Promise((resolve) => setTimeout(resolve, 20));
    result = await patch(1, [
      { op: "review.put", date: "2026-10-13", review: review("第二天复盘（已修改）") },
      { op: "task.put", task: task("t1", { title: "改过标题的待办", priority: "high" }) },
    ]);
    assert.deepEqual(result.body, { revision: 2, stale: false });
    const after = readStamps();
    assert.notEqual(after.review13, before.review13, "被修改的复盘必须更新 updated_at");
    assert.equal(after.review12, before.review12, "未修改的复盘不得更新 updated_at");
    assert.equal(after.report, before.report, "未修改的汇报不得更新 updated_at");

    result = await patch(1, [{ op: "task.put", task: task("t3") }]);
    assert.equal(result.response.status, 200, "过期 baseRevision 不得拒绝不同条目的写入");
    assert.deepEqual(result.body, { revision: 3, stale: true });
    state = await readServerState();
    assert.equal(state.data.tasks.find((entry) => entry.id === "t1").title, "改过标题的待办");
    assert.equal(state.data.tasks.some((entry) => entry.id === "t3"), true);
    assert.equal(state.data.reviews["2026-10-13"].content, "第二天复盘（已修改）");

    result = await patch(3, [
      { op: "task.put", task: task("t4") },
      { op: "review.put", date: "2026-13-40", review: review("非法日期") },
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
      [{ baseRevision: 3, ops: [{ op: "note.put", date: "2026-10-12", content: "笔记已并入复盘" }] }, "INVALID_PATCH"],
      [{ baseRevision: 3, ops: [{ op: "periodReport.put", key: "week:2026-10-12", report: { content: "已合并" } }] }, "INVALID_PATCH"],
      [{ baseRevision: 3, ops: [{ op: "__proto__" }] }, "INVALID_PATCH"],
      [{ baseRevision: 3, ops: "nope" }, "INVALID_PATCH"],
      [{ baseRevision: -1, ops: [{ op: "task.delete", id: "t1" }] }, "INVALID_REVISION"],
      [{ baseRevision: 3, ops: [{ op: "periodReview.put", key: "week:2026-10-13", review: record("非周一") }] }, "INVALID_STATE"],
      [{ baseRevision: 3, ops: [{ op: "periodReview.put", key: "range:2025-01-01:2026-06-30", review: record("超过一年") }] }, "INVALID_STATE"],
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
      { op: "review.delete", date: "2026-10-12" },
      { op: "periodReview.delete", key: "week:2026-10-12", project: "" },
      { op: "periodReview.delete", key: "week:2026-10-12", project: "工作" },
      { op: "periodReview.delete", key: "month:2026-10-01" },
      { op: "periodReview.delete", key: "range:2026-01-01:2026-06-30", project: "工作" },
    ]);
    assert.deepEqual(result.body, { revision: 4, stale: false });
    state = await readServerState();
    assert.deepEqual(state.data.tasks.map((entry) => entry.id).sort(), ["t1", "t3"]);
    assert.deepEqual(state.data.logs, [], "删除待办必须级联删除其自动记录");
    assert.deepEqual(Object.keys(state.data.reviews), ["2026-10-13"]);
    assert.deepEqual(state.data.periodReviews, {}, "周期汇报应已删除");

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

    // Weekly goals and focus items travel through the same incremental save path.
    const goal = (id, title = "本周目标") => ({ id, week: "2026-10-12", title, done: false, createdAt: "2026-10-12T01:00:00.000Z" });
    result = await patch(rev, [
      { op: "goal.put", goal: goal("g1", "完成重连") },
      { op: "task.put", task: task("focus-task", { focus: true, goalId: "g1" }) },
    ]);
    assert.equal(result.response.status, 200);
    rev = result.body.revision;
    state = await readServerState();
    assert.equal(state.data.goals[0].title, "完成重连");
    assert.deepEqual(
      (({ focus, goalId }) => ({ focus, goalId }))(state.data.tasks.find((entry) => entry.id === "focus-task")),
      { focus: true, goalId: "g1" },
    );
    result = await patch(rev, ["g2", "g3", "g4", "g5", "g6"].map((id) => ({ op: "goal.put", goal: goal(id) })));
    assert.equal(result.response.status, 400, "每周第 6 个目标必须被拒绝");
    result = await patch(rev, [{ op: "goal.put", goal: { ...goal("g-bad"), week: "2026-10-13" } }]);
    assert.equal(result.response.status, 400, "目标的周起始日必须是周一");
    result = await patch(rev, [{ op: "goal.delete", id: "g1" }]);
    rev = result.body.revision;
    assert.deepEqual((await readServerState()).data.goals, []);

    // Quick capture: a capture-scoped token adds one entry; other scopes and the browser cannot use it.
    const issue = async (scope) => (await jsonRequest("/api/agent-tokens", { method: "POST", body: JSON.stringify({ name: scope, scope }) })).body.token;
    const captureToken = await issue("capture");
    const readToken = await issue("read");
    const capture = (token, body, headers = {}) => fetch(`${baseUrl}/api/agent/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...headers },
      body: JSON.stringify(body),
    });
    await jsonRequest("/api/tasks/daily", { method: "POST", body: JSON.stringify({ date: "2026-10-12", timeZone: "Asia/Shanghai" }) });
    const revisionBeforeCapture = (await (await fetch(`${baseUrl}/api/revision`)).json()).revision;
    let response = await capture(captureToken, { title: "  从快捷指令  记录  ", project: "工作", dueDate: "2026-10-20" });
    assert.equal(response.status, 201);
    const captured = await response.json();
    assert.equal(captured.title, "从快捷指令 记录", "标题里的多余空白应合并");
    assert.equal(captured.date, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date()), "默认记到浏览器时区的今天");
    response = await capture(captureToken, { type: "log", title: "补一条工作记录", date: "2026-10-12" });
    assert.equal(response.status, 201);
    const revisionAfterCapture = (await (await fetch(`${baseUrl}/api/revision`)).json()).revision;
    assert.equal(revisionAfterCapture, revisionBeforeCapture + 2, "每次快速记录都必须推进 revision");
    state = await readServerState();
    assert.equal(state.data.tasks.find((entry) => entry.id === captured.id).dueDate, "2026-10-20");
    assert.equal(state.data.logs.some((entry) => entry.title === "补一条工作记录" && entry.date === "2026-10-12"), true);
    for (const body of [{ title: "" }, { type: "note", title: "x" }, { title: "x", date: "2026-13-01" }, { title: "x", priority: "urgent" }]) {
      assert.equal((await capture(captureToken, body)).status, 400);
    }
    assert.equal((await capture(readToken, { title: "x" })).status, 403, "读取令牌不能写入");
    assert.equal((await fetch(`${baseUrl}/api/agent/days?from=2026-10-12`, { headers: { Authorization: `Bearer ${captureToken}` } })).status, 403, "快速记录令牌不能读取");
    assert.equal((await capture(captureToken, { title: "x" }, { Origin: "http://evil.example" })).status, 403, "浏览器页面不能使用令牌");

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
