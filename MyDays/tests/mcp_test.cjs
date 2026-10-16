const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-mcp-"));
const port = 43186;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.js"], {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, AI_CONFIG_SECRET: "mcp-test-secret" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

async function request(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  return { response, body: await response.json().catch(() => null) };
}
const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

function startMcp(env) {
  const child = spawn(process.execPath, ["collector/mcp.mjs"], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  let nextId = 1;
  return {
    call(method, params) {
      const id = nextId++;
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return new Promise((resolve, reject) => {
        pending.set(id, resolve);
        setTimeout(() => reject(new Error(`MCP ${method} timed out`)), 10000);
      });
    },
    notify(method) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
    },
    raw(text) {
      child.stdin.write(`${text}\n`);
    },
    stop() {
      child.kill("SIGTERM");
    },
  };
}

(async () => {
  let mcp;
  try {
    for (let attempt = 0; ; attempt += 1) {
      if ((await fetch(`${baseUrl}/healthz`).catch(() => null))?.ok) break;
      if (attempt > 50) throw new Error("server did not start");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const at = (date, hh) => `${date}T${hh}:00:00.000Z`;
    const ops = [
      { op: "task.put", task: { id: "t1", date: "2026-10-12", title: "实现 WebSocket 重连", project: "工作", priority: "normal", completed: true, createdAt: at("2026-10-12", "01"), completedAt: at("2026-10-12", "03") } },
      { op: "log.put", log: { id: "l1", date: "2026-10-12", title: "实现 WebSocket 重连", project: "工作", sourceTaskId: "t1", createdAt: at("2026-10-12", "03") } },
      { op: "task.put", task: { id: "t2", date: "2026-10-13", title: "补充断线测试", project: "工作", priority: "normal", completed: false, createdAt: at("2026-10-13", "01"), completedAt: null } },
      { op: "log.put", log: { id: "l2", date: "2026-10-13", title: "排查 WebSocket 断线原因", project: "工作", sourceTaskId: null, source: "agent-digest", createdAt: at("2026-10-13", "10") } },
      { op: "note.put", date: "2026-10-13", content: "网关超时是 60 秒" },
      { op: "review.put", date: "2026-10-13", review: { wins: "", blockers: "断线还没复现", next: "抓包", completedAt: null } },
      { op: "periodReport.put", key: "week:2026-10-12", report: { content: "本周完成 WebSocket 重连。" } },
    ];
    let result = await request("/api/state", { method: "PATCH", body: JSON.stringify({ baseRevision: 0, ops }) });
    assert.equal(result.response.status, 200);

    result = await request("/api/agent-tokens", { method: "POST", body: JSON.stringify({ name: "Claude Code", scope: "read" }) });
    assert.equal(result.response.status, 201);
    assert.equal(result.body.scope, "read");
    const readToken = result.body.token;
    result = await request("/api/agent-tokens", { method: "POST", body: JSON.stringify({ name: "采集器" }) });
    assert.equal(result.body.scope, "ingest", "默认创建采集令牌");
    const ingestToken = result.body.token;
    result = await request("/api/agent-tokens", { method: "POST", body: JSON.stringify({ name: "x", scope: "admin" }) });
    assert.equal(result.response.status, 400);

    // Scopes do not overlap.
    result = await request("/api/agent/search?q=websocket", bearer(ingestToken));
    assert.equal(result.response.status, 403);
    assert.equal(result.body.error.code, "AGENT_SCOPE_FORBIDDEN");
    result = await request("/api/agent/turns", { method: "POST", body: "{}", ...bearer(readToken) });
    assert.equal(result.response.status, 403);
    result = await request("/api/agent/config", bearer(readToken));
    assert.equal(result.response.status, 403);
    result = await request("/api/state", bearer(readToken));
    assert.equal(result.response.status, 200, "无访问密码时 /api/state 本就开放，这里只确认令牌不改变它");

    for (const query of ["/api/agent/days?from=bad", "/api/agent/days?from=2026-10-13&to=2026-10-01", "/api/agent/days?from=2026-01-01&to=2026-03-01", "/api/agent/search?q=", "/api/agent/period?period=decade&date=2026-10-12"]) {
      result = await request(query, bearer(readToken));
      assert.equal(result.response.status, 400, query);
      assert.equal(result.body.error.code, "AGENT_READ_INVALID");
    }

    mcp = startMcp({ MYDAYS_URL: `${baseUrl}/`, MYDAYS_TOKEN: readToken });
    const init = await mcp.call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(init.result.protocolVersion, "2025-06-18");
    assert.deepEqual(init.result.capabilities, { tools: {} });
    assert.equal(init.result.serverInfo.name, "mydays");
    mcp.notify("notifications/initialized");
    const old = await mcp.call("initialize", { protocolVersion: "1999-01-01" });
    assert.equal(old.result.protocolVersion, "2025-06-18", "不支持的版本回退到最新支持版本");

    const listed = await mcp.call("tools/list", {});
    assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["mydays_search", "mydays_get_days", "mydays_get_period"]);
    assert.equal(listed.result.tools.every((tool) => tool.inputSchema.type === "object" && !("path" in tool)), true);

    const parse = (response) => {
      assert.equal(response.result.isError, undefined, response.result.content?.[0]?.text);
      return JSON.parse(response.result.content[0].text);
    };
    let data = parse(await mcp.call("tools/call", { name: "mydays_search", arguments: { query: "websocket" } }));
    assert.equal(data.total, 3, "待办、AI 整理记录和周期汇报各一条");
    assert.equal(data.results[0].date, "2026-10-13", "最新的在前");
    assert.equal(data.results.some((entry) => entry.type === "AI 整理"), true);
    data = parse(await mcp.call("tools/call", { name: "mydays_search", arguments: { query: "websocket 断线" } }));
    assert.equal(data.total, 1, "多个关键词为“且”关系");

    data = parse(await mcp.call("tools/call", { name: "mydays_get_days", arguments: { from: "2026-10-11", to: "2026-10-14" } }));
    assert.deepEqual(data.days.map((day) => day.date), ["2026-10-12", "2026-10-13"], "没有记录的日期被省略");
    const day13 = data.days[1];
    assert.deepEqual(day13.openTasks, [{ title: "补充断线测试", project: "工作" }]);
    assert.deepEqual(day13.workLogs, [{ title: "排查 WebSocket 断线原因", project: "工作", origin: "AI 整理" }]);
    assert.equal(day13.note, "网关超时是 60 秒");
    assert.deepEqual(day13.review, { problems: "断线还没复现", tomorrow: "抓包", completed: false });
    assert.deepEqual(data.days[0].workLogs, [], "完成待办生成的记录不重复出现");

    data = parse(await mcp.call("tools/call", { name: "mydays_get_period", arguments: { period: "week", date: "2026-10-15" } }));
    assert.equal(data.start, "2026-10-12");
    assert.equal(data.end, "2026-10-18");
    assert.deepEqual(data.metrics, { completedTasks: 1, totalTasks: 2, workLogs: 1, activeDays: 2, aiCollaborationMinutes: 0 });
    assert.deepEqual(data.achievements.map((item) => item.title), ["实现 WebSocket 重连", "排查 WebSocket 断线原因"]);
    assert.equal(data.report, "本周完成 WebSocket 重连。");
    data = parse(await mcp.call("tools/call", { name: "mydays_get_period", arguments: { period: "month", date: "2026-10-31", project: "不存在" } }));
    assert.equal(data.start, "2026-10-01");
    assert.equal(data.metrics.totalTasks, 0);

    let error = await mcp.call("tools/call", { name: "mydays_get_days", arguments: { from: "not-a-date" } });
    assert.equal(error.result.isError, true);
    assert.match(error.result.content[0].text, /400/);
    error = await mcp.call("tools/call", { name: "mydays_delete_everything", arguments: {} });
    assert.equal(error.result.isError, true);
    error = await mcp.call("resources/list", {});
    assert.equal(error.error.code, -32601);
    const pong = await mcp.call("ping");
    assert.deepEqual(pong.result, {});
    mcp.stop();

    const unauthorized = startMcp({ MYDAYS_URL: baseUrl, MYDAYS_TOKEN: ingestToken });
    error = await unauthorized.call("tools/call", { name: "mydays_search", arguments: { query: "x" } });
    assert.equal(error.result.isError, true);
    assert.match(error.result.content[0].text, /403/);
    unauthorized.stop();
    const missing = startMcp({ MYDAYS_URL: baseUrl, MYDAYS_TOKEN: "" });
    error = await missing.call("tools/call", { name: "mydays_search", arguments: { query: "x" } });
    assert.match(error.result.content[0].text, /MYDAYS_TOKEN is not set/);
    missing.stop();
    const offline = startMcp({ MYDAYS_URL: "http://127.0.0.1:9", MYDAYS_TOKEN: readToken });
    error = await offline.call("tools/call", { name: "mydays_search", arguments: { query: "x" } });
    assert.match(error.result.content[0].text, /Cannot reach MyDays/);
    offline.stop();

    console.log("MyDays MCP test passed");
  } finally {
    mcp?.stop();
    server.kill("SIGTERM");
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  console.error(serverOutput.slice(-2000));
  process.exitCode = 1;
});
