const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-tasks-api-"));
const port = 43189;
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
  return { response, body: await response.json().catch(() => null) };
}

async function readState() {
  return (await jsonRequest("/api/state")).body;
}

async function patch(ops) {
  const { revision } = await readState();
  return jsonRequest("/api/state", { method: "PATCH", body: JSON.stringify({ baseRevision: revision, ops }) });
}

const prepareDay = (date) => jsonRequest("/api/tasks/daily", { method: "POST", body: JSON.stringify({ date }) });

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) return;
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
const recurrence = (id, overrides = {}) => ({
  id,
  title: `重复 ${id}`,
  project: "",
  priority: "normal",
  rule: "daily",
  weekdays: 0,
  monthDay: null,
  dueTime: null,
  remindMinutes: null,
  startDate: "2026-10-10",
  paused: false,
  lastGeneratedDate: null,
  createdAt: "2026-10-10T01:00:00.000Z",
  ...overrides,
});
const byId = (state, id) => state.data.tasks.find((entry) => entry.id === id);

(async () => {
  try {
    await waitForServer();
    let state = await readState();
    assert.deepEqual(state.data.recurrences, []);
    assert.deepEqual(state.taskSettings, { taskRollover: true }, "默认开启顺延");

    // Deadline fields round-trip and are validated.
    let result = await patch([{ op: "task.put", task: task("due", { dueDate: "2026-10-20", dueTime: "18:00", remindMinutes: 60 }) }]);
    assert.equal(result.response.status, 200);
    state = await readState();
    assert.deepEqual(
      (({ dueDate, dueTime, remindMinutes, originDate, recurrenceId }) => ({ dueDate, dueTime, remindMinutes, originDate, recurrenceId }))(byId(state, "due")),
      { dueDate: "2026-10-20", dueTime: "18:00", remindMinutes: 60, originDate: null, recurrenceId: null },
    );
    for (const overrides of [{ dueTime: "25:00" }, { dueDate: "2026-02-30" }, { remindMinutes: -5 }, { remindMinutes: 1.5 }, { remindMinutes: 999999 }]) {
      result = await patch([{ op: "task.put", task: task("bad", overrides) }]);
      assert.equal(result.response.status, 400, JSON.stringify(overrides));
    }
    for (const overrides of [{ rule: "hourly" }, { rule: "weekly", weekdays: 0 }, { rule: "monthly", monthDay: null }, { rule: "monthly", monthDay: 32 }, { rule: "daily", monthDay: 3 }, { weekdays: 128, rule: "weekly" }, { paused: "yes" }]) {
      result = await patch([{ op: "recurrence.put", recurrence: recurrence("bad", overrides) }]);
      assert.equal(result.response.status, 400, JSON.stringify(overrides));
    }

    // 2026-10-16 is a Friday; 2026-10-17 a Saturday.
    result = await patch([
      { op: "task.put", task: task("old-open", { date: "2026-10-12" }) },
      { op: "task.put", task: task("old-done", { date: "2026-10-12", completed: true, completedAt: "2026-10-12T05:00:00.000Z" }) },
      { op: "task.put", task: task("future", { date: "2026-10-20" }) },
      { op: "recurrence.put", recurrence: recurrence("daily", { dueTime: "10:00", remindMinutes: 15 }) },
      { op: "recurrence.put", recurrence: recurrence("weekdays", { rule: "weekdays" }) },
      { op: "recurrence.put", recurrence: recurrence("friday", { rule: "weekly", weekdays: 1 << 5 }) },
      { op: "recurrence.put", recurrence: recurrence("monday", { rule: "weekly", weekdays: 1 << 1 }) },
      { op: "recurrence.put", recurrence: recurrence("paused", { paused: true }) },
      { op: "recurrence.put", recurrence: recurrence("later", { startDate: "2026-10-18" }) },
      { op: "recurrence.put", recurrence: recurrence("month-end", { rule: "monthly", monthDay: 31, startDate: "2026-09-01" }) },
    ]);
    assert.equal(result.response.status, 200);

    for (const body of [{}, { date: "2026/10/16" }, { date: "2026-13-01" }]) {
      result = await jsonRequest("/api/tasks/daily", { method: "POST", body: JSON.stringify(body) });
      assert.equal(result.response.status, 400, JSON.stringify(body));
      assert.equal(result.body.error.code, "INVALID_TASK_DAY");
    }

    const before = (await readState()).revision;
    result = await prepareDay("2026-10-16");
    assert.equal(result.response.status, 200);
    assert.equal(result.body.rolled, 2, "两条之前未完成的待办顺延（含 10-12 的截止待办）");
    assert.equal(result.body.generated, 3, "每天、工作日、每周五各生成一条");
    assert.equal(result.body.revision, before + 1);
    state = result.body;
    assert.equal(byId(state, "old-open").date, "2026-10-16");
    assert.equal(byId(state, "old-open").originDate, "2026-10-12", "保留最初计划日期");
    assert.equal(byId(state, "old-done").date, "2026-10-12", "已完成的待办不移动");
    assert.equal(byId(state, "future").date, "2026-10-20", "未来的待办不移动");
    const daily = byId(state, "rec-daily-2026-10-16");
    assert.deepEqual(
      (({ date, title, dueDate, dueTime, remindMinutes, recurrenceId, completed }) => ({ date, title, dueDate, dueTime, remindMinutes, recurrenceId, completed }))(daily),
      { date: "2026-10-16", title: "重复 daily", dueDate: "2026-10-16", dueTime: "10:00", remindMinutes: 15, recurrenceId: "daily", completed: false },
    );
    assert.equal(byId(state, "rec-weekdays-2026-10-16").dueDate, null, "没有时间的重复待办不设截止");
    assert.ok(byId(state, "rec-friday-2026-10-16"));
    for (const id of ["monday", "paused", "later", "month-end"]) {
      assert.equal(state.data.tasks.some((entry) => entry.recurrenceId === id), false, `${id} 今天不应生成`);
    }
    assert.equal(state.data.recurrences.find((entry) => entry.id === "daily").lastGeneratedDate, "2026-10-16");

    result = await prepareDay("2026-10-16");
    assert.deepEqual([result.body.rolled, result.body.generated], [0, 0], "同一天重复调用不得重复生成");
    assert.equal(result.body.data, undefined, "没有变化时不返回整份数据");
    assert.equal(result.body.revision, before + 1, "没有变化时不增加 revision");
    const [first, second] = await Promise.all([prepareDay("2026-10-16"), prepareDay("2026-10-16")]);
    assert.equal(first.body.generated + second.body.generated, 0);

    // A deleted instance does not come back; completing one keeps it on its day.
    result = await patch([{ op: "task.delete", id: "rec-weekdays-2026-10-16" }]);
    assert.equal(result.response.status, 200);
    result = await prepareDay("2026-10-16");
    assert.equal(result.body.generated, 0, "删掉的当天实例不得重新生成");

    // A client re-sending an older lastGeneratedDate must not rewind the rule.
    result = await patch([{ op: "recurrence.put", recurrence: recurrence("daily", { dueTime: "10:00", remindMinutes: 15, lastGeneratedDate: "2026-10-01", title: "改名后的每日站会" }) }]);
    assert.equal(result.response.status, 200);
    state = await readState();
    const dailyRule = state.data.recurrences.find((entry) => entry.id === "daily");
    assert.equal(dailyRule.lastGeneratedDate, "2026-10-16");
    assert.equal(dailyRule.title, "改名后的每日站会");

    result = await patch([{ op: "task.put", task: { ...byId(state, "rec-friday-2026-10-16"), date: "2026-10-16", id: "rec-friday-copy" } }]);
    assert.equal(result.response.status, 400, "同一规则同一天只能有一条");

    // Saturday: missed recurring instances stay where they were; one-off tasks keep rolling.
    result = await prepareDay("2026-10-17");
    assert.equal(result.body.rolled, 2);
    assert.equal(result.body.generated, 1, "周六只生成每天的那条");
    state = result.body;
    assert.equal(byId(state, "rec-daily-2026-10-16").date, "2026-10-16", "错过的重复待办不顺延");
    assert.equal(byId(state, "old-open").originDate, "2026-10-12", "多次顺延仍保留最初日期");
    assert.ok(byId(state, "rec-daily-2026-10-17"));

    // Deleting a rule keeps its generated tasks, which still never roll over.
    result = await patch([{ op: "recurrence.delete", id: "daily" }]);
    assert.equal(result.response.status, 200);
    result = await prepareDay("2026-10-18");
    state = result.body.data ? result.body : await readState();
    assert.equal(byId(state, "rec-daily-2026-10-17").recurrenceId, "daily", "已生成的待办保留来源");
    assert.equal(byId(state, "rec-daily-2026-10-17").date, "2026-10-17");
    assert.equal(state.data.tasks.some((entry) => entry.id === "rec-daily-2026-10-18"), false);
    assert.ok(byId(state, "rec-later-2026-10-18"), "到了开始日期才生成");

    // Monthly on the 31st falls on the last day of shorter months.
    result = await prepareDay("2026-11-30");
    state = result.body;
    assert.ok(byId(state, "rec-month-end-2026-11-30"));

    // Rollover can be switched off.
    for (const body of [{}, { taskRollover: "no" }]) {
      result = await jsonRequest("/api/tasks/settings", { method: "PUT", body: JSON.stringify(body) });
      assert.equal(result.response.status, 400);
    }
    result = await jsonRequest("/api/tasks/settings", { method: "PUT", body: JSON.stringify({ taskRollover: false }) });
    assert.deepEqual(result.body, { taskRollover: false });
    assert.deepEqual((await readState()).taskSettings, { taskRollover: false });
    result = await prepareDay("2026-12-01");
    assert.equal(result.body.rolled, 0, "关闭后不再顺延");
    assert.equal(byId(await readState(), "old-open").date, "2026-11-30");

    // Backups carry recurrences; older backups without them still import.
    state = await readState();
    result = await jsonRequest("/api/state", { method: "PUT", body: JSON.stringify({ data: state.data, revision: state.revision }) });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.data.recurrences, state.data.recurrences);
    assert.deepEqual(result.body.data.tasks, state.data.tasks);
    const duplicate = { ...state.data, tasks: [...state.data.tasks, { ...byId(state, "rec-later-2026-10-18"), id: "dup" }] };
    result = await jsonRequest("/api/state", { method: "PUT", body: JSON.stringify({ data: duplicate, revision: result.body.revision }) });
    assert.equal(result.response.status, 400);
    const legacy = { ...state.data };
    delete legacy.recurrences;
    legacy.tasks = legacy.tasks.map(({ originDate, dueDate, dueTime, remindMinutes, recurrenceId, ...rest }) => rest);
    state = await readState();
    result = await jsonRequest("/api/state", { method: "PUT", body: JSON.stringify({ data: legacy, revision: state.revision }) });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.data.recurrences, []);

    console.log("MyDays tasks API test passed");
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  console.error(serverOutput);
  process.exitCode = 1;
});
