const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createServer } = require("node:http");
const { spawn } = require("node:child_process");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-agent-api-"));
const appPort = 43189;
const mockPort = 43190;
const appUrl = `http://127.0.0.1:${appPort}`;

const aiCalls = [];
let aiMode = "ok";
const mock = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const system = body.messages[0].content;
    const kind = system.includes("个人工作记录整理助手") ? "final" : "project";
    aiCalls.push({ kind, user: body.messages[1].content, maxTokens: body.max_tokens });
    response.setHeader("Content-Type", "application/json");
    if (aiMode === "fail") {
      response.statusCode = 500;
      return response.end("{}");
    }
    if (aiMode === "truncated") {
      return response.end(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"items":[{"title":"被截' } }] }));
    }
    const content = kind === "project"
      ? "完成了该项目的主要改动并通过测试。"
      : aiMode === "badjson"
        ? "今天做了很多事情"
        : JSON.stringify({ items: [
          { title: `完成汇总接口联调 ${aiCalls.length}`, project: "工作" },
          { title: "梳理采集器的提取规则", project: "不存在的项目" },
        ] });
    response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }] }));
  });
});

const child = spawn(process.execPath, ["server.js"], {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env, PORT: String(appPort), DATA_DIR: dataDir, AI_CONFIG_SECRET: "test-master-secret", AGENT_DIGEST_CHECK_SECONDS: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

async function request(url, options = {}) {
  const response = await fetch(`${appUrl}${url}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  return { response, body: await response.json().catch(() => null) };
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const agent = (token, url, options = {}) => request(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
const pushTurns = (token, turns) => agent(token, "/api/agent/turns", { method: "POST", body: JSON.stringify({ turns }) });
const runDigest = (date) => request("/api/agent-digest/run", { method: "POST", body: JSON.stringify({ date }) });
const dateKey = (offsetDays) => new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
const stamp = (offsetDays, offsetSeconds = 1) => new Date(Date.now() - offsetDays * 86400000 - offsetSeconds * 1000).toISOString();
let turnSequence = 0;
const turn = (offsetDays, overrides = {}) => {
  turnSequence += 1;
  return {
    agent: "claude-code",
    sessionId: "session-1",
    turnKey: `turn-${turnSequence}`,
    project: "工作",
    startedAt: stamp(offsetDays, 2),
    endedAt: stamp(offsetDays, 1),
    prompt: `帮我完成第 ${turnSequence} 项工作`,
    reply: `第 ${turnSequence} 项工作已完成并通过测试。`,
    ...overrides,
  };
};

async function waitFor(check, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const value = await check();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}\n${output}`);
}
async function statusDay(date) {
  const { body } = await request("/api/agent-digest/status");
  return { ...body.days.find((day) => day.date === date), body };
}
async function digestLogs(date) {
  const { body } = await request("/api/state");
  return body.data.logs.filter((log) => log.date === date && log.source === "agent-digest");
}

(async () => {
  try {
    await new Promise((resolve) => mock.listen(mockPort, "127.0.0.1", resolve));
    await waitFor(async () => (await fetch(`${appUrl}/healthz`).catch(() => null))?.ok, "server");

    let result = await request("/api/agent/config");
    assert.equal(result.response.status, 401);
    assert.equal(result.body.error.code, "AGENT_TOKEN_INVALID");
    result = await agent("mdk_not-a-real-token", "/api/agent/config");
    assert.equal(result.response.status, 401);

    result = await request("/api/agent-digest/settings");
    assert.equal(result.body.enabled, false, "功能默认关闭");
    result = await request("/api/agent-digest/settings", { method: "PUT", body: JSON.stringify({ enabled: true }) });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "AGENT_DIGEST_PROVIDER_REQUIRED");

    result = await request("/api/ai/providers", {
      method: "POST",
      body: JSON.stringify({ name: "Mock", protocol: "openai", baseUrl: `http://127.0.0.1:${mockPort}/v1`, model: "mock", timeoutMs: 5000, apiKey: "sk-mock-digest-secret" }),
    });
    assert.equal(result.response.status, 201);

    result = await request("/api/agent-tokens", { method: "POST", body: JSON.stringify({ name: "笔记本" }) });
    assert.equal(result.response.status, 201);
    const token = result.body.token;
    assert.match(token, /^mdk_[A-Za-z0-9_-]{43}$/);
    result = await request("/api/agent-tokens");
    assert.equal(JSON.stringify(result.body).includes(token), false, "令牌明文只在创建时返回一次");
    assert.equal(result.body.tokens[0].prefix, token.slice(0, 12));

    result = await agent(token, "/api/agent/config");
    assert.equal(result.response.status, 200);
    assert.equal(result.body.enabled, false);
    result = await pushTurns(token, [turn(0)]);
    assert.equal(result.response.status, 409, "关闭时必须拒收素材");
    assert.equal(result.body.error.code, "AGENT_DIGEST_DISABLED");
    result = await agent(token, "/api/agent/config", { headers: { Origin: appUrl } });
    assert.equal(result.response.status, 403);
    result = await agent(token, "/api/agent/unknown");
    assert.equal(result.response.status, 404);

    for (const body of [{ summaryTime: "25:00" }, { timezone: "Mars/Olympus" }, { dayStartHour: 13 }, { maxInputChars: 10 }, { providerId: "missing" }, { excludedProjects: [""] }, { gitAuthorEmails: ["not-an-email"] }, { gitAuthorEmails: Array.from({ length: 11 }, (_, index) => `a${index}@b.c`) }, { gitRepoDirs: ["relative/path"] }, { gitRepoDirs: ["/a\nb"] }, { gitRepoDirs: Array.from({ length: 11 }, (_, index) => `/r${index}`) }, { gitRepoDirs: "/repos" }]) {
      result = await request("/api/agent-digest/settings", { method: "PUT", body: JSON.stringify(body) });
      assert.equal(result.response.status, 400, JSON.stringify(body));
      assert.equal(result.body.error.code, "AGENT_DIGEST_SETTINGS_INVALID");
    }

    // A far-future summary time keeps "today" from running until the test asks for it.
    result = await request("/api/agent-digest/settings", {
      method: "PUT",
      body: JSON.stringify({ enabled: true, timezone: "UTC", dayStartHour: 0, summaryTime: "23:59" }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.enabled, true);
    result = await request("/api/agent-digest/settings", { method: "PUT", body: JSON.stringify({ gitAuthorEmails: [" Me@Example.com ", "me@example.com"] }) });
    assert.deepEqual(result.body.gitAuthorEmails, ["me@example.com"], "邮箱应去空格、转小写并去重");
    result = await agent(token, "/api/agent/config");
    assert.equal(result.body.enabled, true);
    assert.deepEqual(result.body.gitAuthorEmails, ["me@example.com"], "采集器需要拿到 Git 作者邮箱");
    result = await request("/api/agent-digest/settings", { method: "PUT", body: JSON.stringify({ gitRepoDirs: [" ~/code/ ", "~/code", "/Users/me/work", "~"] }) });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.gitRepoDirs, ["~/code", "/Users/me/work", "~"], "目录去空格、去掉末尾斜杠并去重");
    result = await agent(token, "/api/agent/config");
    assert.deepEqual(result.body.gitRepoDirs, ["~/code", "/Users/me/work", "~"], "采集器需要拿到 Git 仓库目录");
    result = await agent(token, "/api/agent/collector-status", { method: "POST", body: JSON.stringify({ gitDirs: [{ path: "~/code", state: "ok", repos: 3 }, { path: "/Users/me/work", state: "missing", repos: 0 }] }) });
    assert.equal(result.response.status, 200);
    for (const body of [{}, { gitDirs: [{ path: "~/code", state: "weird" }] }, { gitDirs: [{ path: "~/code", state: "outside-mount" }] }, { gitDirs: [{ path: 1, state: "ok" }] }]) {
      result = await agent(token, "/api/agent/collector-status", { method: "POST", body: JSON.stringify(body) });
      assert.equal(result.response.status, 400, JSON.stringify(body));
    }
    result = await request("/api/agent-digest/status");
    assert.deepEqual(result.body.collector.gitDirs, [{ path: "~/code", state: "ok", repos: 3 }, { path: "/Users/me/work", state: "missing", repos: 0 }]);
    assert.ok(result.body.collector.reportedAt);

    const today = dateKey(0);
    const yesterday = dateKey(1);
    const state = (await request("/api/state")).body;
    result = await request("/api/state", {
      method: "PATCH",
      body: JSON.stringify({ baseRevision: state.revision, ops: [{ op: "log.put", log: { id: "manual-log", date: yesterday, title: "手动记录的工作", project: "", sourceTaskId: null, createdAt: stamp(1) } }] }),
    });
    assert.equal(result.response.status, 200);

    for (const body of [
      { turns: [] },
      { turns: [turn(0, { agent: "Bad Agent" })] },
      { turns: [turn(0, { prompt: "" })] },
      { turns: [turn(0, { startedAt: "not-a-date" })] },
      { turns: [turn(40)] },
      { turns: Array.from({ length: 101 }, () => turn(0)) },
    ]) {
      result = await agent(token, "/api/agent/turns", { method: "POST", body: JSON.stringify(body) });
      assert.equal(result.response.status, 400);
      assert.equal(result.body.error.code, "AGENT_TURNS_INVALID");
    }

    const yesterdayTurns = [turn(1), turn(1)];
    result = await pushTurns(token, yesterdayTurns);
    assert.deepEqual(result.body, { accepted: 2 });
    result = await pushTurns(token, yesterdayTurns);
    assert.deepEqual(result.body, { accepted: 0 }, "重复推送未变化的轮次不得计为新素材");

    let day = await waitFor(async () => {
      const current = await statusDay(yesterday);
      return current.run?.status === "ok" ? current : null;
    }, "yesterday digest");
    assert.equal(day.run.finalized, true);
    assert.equal(day.run.turnCount, 2);
    assert.equal(day.run.itemCount, 2);
    assert.equal(day.turnCount, 2);
    assert.deepEqual(day.agents, ["claude-code"]);
    assert.equal(day.body.storedTurns, 2);
    let logs = await digestLogs(yesterday);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].project, "工作");
    assert.equal(logs[1].project, "", "不在项目选项中的项目名必须置空");
    assert.equal(logs.every((log) => log.sourceTaskId === null), true);
    const finalCall = aiCalls.find((call) => call.kind === "final");
    assert.equal(finalCall.user.includes("- 手动记录的工作"), true, "当天已有记录必须作为去重上下文");
    assert.equal(finalCall.user.includes("第 "), true);
    assert.equal(finalCall.maxTokens, 2048);
    assert.equal(aiCalls.filter((call) => call.kind === "project").length, 0, "素材较少时只调用一次模型");

    const callsAfterFirst = aiCalls.length;
    await sleep(2500);
    assert.equal(aiCalls.length, callsAfterFirst, "没有新素材时不得重复调用模型");
    assert.equal((await statusDay(today)).run, null, "未到总结时间不得整理当天");

    // Claiming: an edited digest entry belongs to the user and survives later runs.
    let fullState = (await request("/api/state")).body;
    const claimed = { ...logs[0], title: "我改过的汇总条目", source: "" };
    result = await request("/api/state", { method: "PATCH", body: JSON.stringify({ baseRevision: fullState.revision, ops: [{ op: "log.put", log: claimed }] }) });
    assert.equal(result.response.status, 200);
    result = await pushTurns(token, [turn(1)]);
    assert.deepEqual(result.body, { accepted: 1 });
    await waitFor(async () => aiCalls.length > callsAfterFirst, "re-finalization after late turns");
    await waitFor(async () => (await statusDay(yesterday)).run?.turnCount === 3, "updated run");
    fullState = (await request("/api/state")).body;
    const yesterdayLogs = fullState.data.logs.filter((log) => log.date === yesterday);
    assert.equal(yesterdayLogs.some((log) => log.id === "manual-log"), true, "手动记录不得被汇总影响");
    assert.equal(yesterdayLogs.find((log) => log.id === claimed.id)?.title, "我改过的汇总条目", "已认领的条目不得被覆盖");
    assert.equal(yesterdayLogs.filter((log) => log.source === "agent-digest").length, 2, "同一日期只保留最新一份汇总");
    assert.equal(yesterdayLogs.some((log) => log.id === logs[1].id), false, "旧的汇总条目必须被替换");

    // Today runs once the summary time has passed.
    result = await pushTurns(token, [turn(0), turn(0, { project: "个人", agent: "codex" })]);
    assert.deepEqual(result.body, { accepted: 2 });
    result = await request("/api/agent-digest/settings", { method: "PUT", body: JSON.stringify({ summaryTime: "00:00" }) });
    assert.equal(result.response.status, 200);
    day = await waitFor(async () => {
      const current = await statusDay(today);
      return current.run?.status === "ok" ? current : null;
    }, "today digest");
    assert.equal(day.run.finalized, false, "当天的汇总在次日才定稿");
    assert.deepEqual(day.agents, ["claude-code", "codex"]);
    const callsAfterToday = aiCalls.length;
    result = await pushTurns(token, [turn(0)]);
    await sleep(2500);
    assert.equal(aiCalls.length, callsAfterToday, "当天自动整理最多一次");

    // Failures keep the material and the previous digest.
    aiMode = "fail";
    result = await runDigest(today);
    assert.equal(result.response.status, 200);
    day = result.body.days.find((entry) => entry.date === today);
    assert.equal(day.run.status, "failed");
    assert.equal(day.run.errorCode, "AI_UPSTREAM_ERROR");
    assert.equal((await digestLogs(today)).length, 2, "失败时必须保留上一次的汇总");
    assert.equal(result.body.storedTurns, 6, "失败时必须保留素材");
    const callsAfterFailure = aiCalls.length;
    await sleep(2500);
    assert.equal(aiCalls.length, callsAfterFailure, "失败后不得立即循环重试");
    for (const [mode, code] of [["truncated", "AI_RESPONSE_TRUNCATED"], ["badjson", "AI_RESPONSE_INVALID"]]) {
      aiMode = mode;
      result = await runDigest(today);
      assert.equal(result.body.days.find((entry) => entry.date === today).run.errorCode, code);
    }
    assert.equal(JSON.stringify(result.body).includes("sk-mock-digest-secret"), false);
    aiMode = "ok";
    result = await runDigest(today);
    assert.equal(result.body.days.find((entry) => entry.date === today).run.status, "ok");

    // Time estimate: turns closer than 20 minutes merge into one block; parallel projects count once in the total.
    const timeDate = dateKey(5);
    const at = (hhmm) => new Date(`${timeDate}T${hhmm}:00.000Z`).toISOString();
    result = await pushTurns(token, [
      turn(5, { project: "甲", sessionId: "time-a", startedAt: at("10:00"), endedAt: at("10:10") }),
      turn(5, { project: "甲", sessionId: "time-a", startedAt: at("10:20"), endedAt: at("10:30") }),
      turn(5, { project: "甲", sessionId: "time-a", startedAt: at("13:00"), endedAt: at("13:01") }),
      turn(5, { project: "乙", sessionId: "time-b", agent: "codex", startedAt: at("10:05"), endedAt: at("10:25") }),
      turn(5, { project: "甲", sessionId: "git:甲", agent: "git", startedAt: at("16:00"), endedAt: at("16:00"), prompt: "提交：完成时间统计", reply: "" }),
    ]);
    assert.deepEqual(result.body, { accepted: 5 });
    const time = await waitFor(async () => {
      const { body } = await request(`/api/agent-digest/time?from=${timeDate}&to=${timeDate}`);
      return body.totalMinutes ? body : null;
    }, "time estimate");
    assert.equal(time.totalMinutes, 35, "并行的项目在总时长中只计一次，短于 5 分钟的段按 5 分钟计，代码提交不计入时长");
    assert.deepEqual(time.byProject, [{ project: "甲", minutes: 35 }, { project: "乙", minutes: 20 }]);
    assert.deepEqual(time.byDay, [{ date: timeDate, minutes: 35 }]);
    for (const query of ["from=bad&to=2026-01-01", `from=${today}&to=${yesterday}`]) {
      result = await request(`/api/agent-digest/time?${query}`);
      assert.equal(result.response.status, 400);
      assert.equal(result.body.error.code, "AGENT_TIME_INVALID");
    }

    // Larger days are summarized per project first, then merged.
    const big = dateKey(3);
    const longReply = "完成了一项比较大的改动，".repeat(120);
    result = await pushTurns(token, [
      ...Array.from({ length: 6 }, () => turn(3, { reply: longReply })),
      ...Array.from({ length: 6 }, () => turn(3, { project: "学习", sessionId: "session-2", reply: longReply })),
    ]);
    assert.deepEqual(result.body, { accepted: 12 });
    const callsBeforeBig = aiCalls.length;
    day = await waitFor(async () => {
      const current = await statusDay(big);
      return current.run?.status === "ok" ? current : null;
    }, "two-stage digest");
    const bigCalls = aiCalls.slice(callsBeforeBig);
    assert.deepEqual(bigCalls.map((call) => call.kind), ["project", "project", "final"]);
    assert.equal(bigCalls[2].user.includes("按项目整理的当天小结"), true);
    assert.equal(day.run.inputChars > 12000, true);

    result = await request("/api/agent-digest/settings", { method: "PUT", body: JSON.stringify({ maxInputChars: 5000, instructions: "多写结果", excludedProjects: ["学习"] }) });
    assert.equal(result.response.status, 200);
    const callsBeforeBudget = aiCalls.length;
    result = await runDigest(big);
    day = result.body.days.find((entry) => entry.date === big);
    assert.equal(day.run.status, "ok");
    assert.equal(day.run.turnCount, 6, "排除的项目不得进入素材");
    assert.equal(day.run.inputChars <= 5000, true, "素材必须压缩到每日输入上限以内");
    const budgetCalls = aiCalls.slice(callsBeforeBudget);
    assert.deepEqual(budgetCalls.map((call) => call.kind), ["final"]);
    assert.equal(budgetCalls[0].user.includes("学习（"), false);
    assert.equal(budgetCalls[0].user.includes("使用者的偏好：多写结果"), true);

    result = await request("/api/agent-digest/settings", { method: "PUT", body: JSON.stringify({ excludedProjects: ["工作", "学习"] }) });
    result = await runDigest(big);
    assert.equal(result.body.days.find((entry) => entry.date === big).run.status, "empty");
    assert.equal((await digestLogs(big)).length, 0, "素材全部被排除时必须清空该日期的汇总");

    for (const body of [{ date: "2026-13-40" }, { date: dateKey(-2) }, { date: dateKey(45) }]) {
      result = await runDigest(body.date);
      assert.equal(result.response.status, 400);
      assert.equal(result.body.error.code, "AGENT_DIGEST_RUN_INVALID");
    }

    result = await request("/api/agent-digest/settings", { method: "PUT", body: JSON.stringify({ enabled: false }) });
    assert.equal(result.body.enabled, false);
    result = await pushTurns(token, [turn(0)]);
    assert.equal(result.response.status, 409);
    result = await runDigest(today);
    assert.equal(result.response.status, 409);
    const callsWhenDisabled = aiCalls.length;
    await sleep(2500);
    assert.equal(aiCalls.length, callsWhenDisabled, "关闭后不得再调用模型");

    result = await request("/api/agent-digest/turns", { method: "DELETE" });
    assert.equal(result.body.deleted, 23);
    const exported = JSON.stringify((await request("/api/state")).body);
    assert.equal(exported.includes("mdk_"), false);
    assert.equal(exported.includes("agent_turns"), false);

    const tokenId = (await request("/api/agent-tokens")).body.tokens.find((entry) => entry.prefix === token.slice(0, 12)).id;
    result = await request(`/api/agent-tokens/${tokenId}`, { method: "DELETE" });
    assert.equal(result.body.revoked, true);
    result = await agent(token, "/api/agent/config");
    assert.equal(result.response.status, 401, "吊销后的令牌必须立即失效");
    result = await request(`/api/agent-tokens/${tokenId}`, { method: "DELETE" });
    assert.equal(result.response.status, 404);

    console.log("MyDays agent digest API test passed");
  } finally {
    child.kill("SIGTERM");
    mock.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  console.error(output.slice(-3000));
  process.exitCode = 1;
});
