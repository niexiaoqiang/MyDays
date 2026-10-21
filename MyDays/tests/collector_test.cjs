const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createServer } = require("node:http");
const { execFileSync } = require("node:child_process");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-collector-"));
const claudeDir = path.join(root, "claude");
const codexDir = path.join(root, "codex");
const stateDir = path.join(root, "state");
const gitDir = path.join(root, "code");
const port = 43191;
const now = Date.now();
const at = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();
const writeLines = (filePath, entries) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, entries.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))).join("\n") + "\n");
};

const claudeFile = path.join(claudeDir, "-Users-me-work-shop", "session-a.jsonl");
const claudeUser = (uuid, minutesAgo, content, extra = {}) => ({
  type: "user", uuid, sessionId: "session-a", cwd: "/Users/me/work/shop", timestamp: at(minutesAgo), origin: { kind: "human" }, message: { role: "user", content }, ...extra,
});
const claudeAssistant = (minutesAgo, content) => ({ type: "assistant", sessionId: "session-a", timestamp: at(minutesAgo), message: { role: "assistant", content } });
writeLines(claudeFile, [
  claudeUser("u-old", 60 * 24 * 20, "二十天前的提问不应出现"),
  claudeUser("u1", 60, "帮我修复购物车金额计算，api_key=supersecretvalue123"),
  claudeAssistant(59, [{ type: "thinking", thinking: "内部思考不应出现" }]),
  claudeAssistant(58, [{ type: "text", text: "先看一下代码。" }, { type: "tool_use", id: "t1", name: "Read", input: { file: "cart.js" } }]),
  claudeUser("u1-tool", 57, [{ type: "tool_result", tool_use_id: "t1", content: "工具输出不应出现 sk-ant-abcdefghijklmnopqrstuvwxyz" }]),
  claudeAssistant(56, [{ type: "text", text: "已修复购物车金额计算并通过测试。" }]),
  claudeUser("u-side", 55, "子代理的提问不应出现", { isSidechain: true }),
  claudeUser("u-meta", 54, "元信息不应出现", { isMeta: true }),
  claudeUser("u-task", 53, "定时任务通知不应出现", { origin: { kind: "task-notification" } }),
  claudeUser("u-wrap", 52, "<system-reminder>系统注入不应出现</system-reminder>"),
  claudeUser("u-int", 51, "[Request interrupted by user]"),
  claudeUser("u2", 50, "<command-message>review</command-message>\n<command-name>/review</command-name>\n<command-args>检查支付模块</command-args>"),
  "this line is not json",
  claudeAssistant(49, [{ type: "text", text: `${"很长的答复".repeat(400)}结尾标记` }]),
  claudeUser("u3", 10, [{ type: "text", text: "再加一个优惠券功能" }]),
]);
writeLines(path.join(claudeDir, "-Users-me-work-shop", "session-a", "subagents", "agent-1.jsonl"), [claudeUser("sub", 5, "子代理文件不应出现")]);

const codexMeta = (source, cwd = "/Users/me/work/blog") => ({ type: "session_meta", timestamp: at(120), payload: { id: `codex-${typeof source === "string" ? source : "sub"}`, cwd, source } });
const codexUserItem = (minutesAgo, text) => ({ type: "response_item", timestamp: at(minutesAgo), payload: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
const codexAssistantItem = (minutesAgo, text) => ({ type: "response_item", timestamp: at(minutesAgo), payload: { type: "message", role: "assistant", content: [{ type: "output_text", text }] } });
writeLines(path.join(codexDir, "2026", "01", "02", "rollout-desktop.jsonl"), [
  codexMeta("vscode"),
  codexUserItem(40, "<environment_context>注入的环境信息不应出现</environment_context>"),
  codexUserItem(39, "给博客加上 RSS 输出"),
  { type: "response_item", timestamp: at(38), payload: { type: "function_call_output", output: "命令输出不应出现" } },
  codexAssistantItem(37, "正在处理。"),
  { type: "event_msg", timestamp: at(36), payload: { type: "task_complete", turn_id: "t-1", last_agent_message: "RSS 输出已完成，Bearer abcdefghijklmnopqrstuvwxyz012345 已配置。" } },
  { type: "turn_context", timestamp: at(30), payload: { cwd: "/Users/me/work/docs" } },
  codexUserItem(29, "更新部署文档"),
  { type: "event_msg", timestamp: at(29), payload: { type: "user_message", message: "更新部署文档" } },
  { type: "event_msg", timestamp: at(28), payload: { type: "agent_message", message: "部署文档已更新。" } },
]);
writeLines(path.join(codexDir, "2026", "10", "01", "rollout-sub.jsonl"), [codexMeta({ subagent: { other: "guardian" } }), codexUserItem(20, "子代理会话不应出现")]);
writeLines(path.join(codexDir, "2026", "10", "01", "rollout-exec.jsonl"), [codexMeta("exec"), codexUserItem(20, "程序化调用不应出现")]);

// A real repository with one commit by the user and one by someone else.
const repo = path.join(gitDir, "group", "webapp");
fs.mkdirSync(repo, { recursive: true });
const git = (args, env = {}) => execFileSync("git", args, { cwd: repo, env: { ...process.env, ...env }, stdio: "pipe" });
git(["init", "-q"]);
fs.writeFileSync(path.join(repo, "app.js"), "console.log(1);\n");
git(["add", "."]);
git(["commit", "-q", "-m", "实现首页搜索", "-m", "顺带修复样式。password=supersecretvalue"], { GIT_AUTHOR_NAME: "Me", GIT_AUTHOR_EMAIL: "me@example.com", GIT_COMMITTER_NAME: "Me", GIT_COMMITTER_EMAIL: "me@example.com" });
git(["commit", "-q", "--allow-empty", "-m", "别人的提交不应出现"], { GIT_AUTHOR_NAME: "Other", GIT_AUTHOR_EMAIL: "other@example.com", GIT_COMMITTER_NAME: "Other", GIT_COMMITTER_EMAIL: "other@example.com" });
fs.mkdirSync(path.join(gitDir, "node_modules", "dep", ".git", "logs"), { recursive: true });
fs.writeFileSync(path.join(gitDir, "node_modules", "dep", ".git", "logs", "HEAD"), "");

const received = [];
const statusReports = [];
let serverMode = "ok";
let enabled = true;
const server = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    response.setHeader("Content-Type", "application/json");
    if (request.headers.authorization !== "Bearer mdk_test-token") {
      response.statusCode = 401;
      return response.end(JSON.stringify({ error: { code: "AGENT_TOKEN_INVALID" } }));
    }
    if (request.url === "/api/agent/config") {
      return response.end(JSON.stringify({ enabled, maxPromptChars: 600, maxReplyChars: 1500, windowDays: 8, gitAuthorEmails: ["me@example.com"] }));
    }
    if (serverMode === "fail") {
      response.statusCode = 500;
      return response.end("{}");
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (request.url === "/api/agent/collector-status") {
      statusReports.push(body);
      return response.end(JSON.stringify({ ok: true }));
    }
    received.push(...body.turns);
    response.end(JSON.stringify({ accepted: body.turns.length }));
  });
});

(async () => {
  try {
    const collector = await import("../collector/collector.mjs");
    assert.equal(collector.redact("ghp_abcdefghijklmnopqrstuvwxyz0123 和 password: hunter2hunter2"), "[已隐藏] 和 password: [已隐藏]");
    assert.equal(collector.redact("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY----- 之后"), "[已隐藏] 之后");
    assert.equal(collector.redact("普通的一句话，没有密钥"), "普通的一句话，没有密钥");
    assert.equal(collector.clipMiddle("a".repeat(50), 20).length, 20);
    assert.equal(collector.clipMiddle("短文本", 20), "短文本");

    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    const env = {
      MYDAYS_URL: `http://127.0.0.1:${port}/`,
      MYDAYS_TOKEN: "mdk_test-token",
      CLAUDE_PROJECTS_DIR: claudeDir,
      CODEX_SESSIONS_DIR: codexDir,
      GIT_REPOS_DIR: gitDir,
      COLLECTOR_STATE_DIR: stateDir,
    };
    const logs = [];
    const config = collector.readConfig(env);
    assert.equal(config.url, `http://127.0.0.1:${port}`);

    enabled = false;
    assert.equal(await collector.runOnce(config, (line) => logs.push(line)), "disabled");
    assert.equal(received.length, 0);
    assert.equal(fs.existsSync(path.join(stateDir, "state.json")), false, "功能关闭时不得扫描会话文件");

    enabled = true;
    serverMode = "fail";
    assert.equal(await collector.runOnce(config, (line) => logs.push(line)), "failed");
    serverMode = "ok";
    assert.equal(await collector.runOnce(config, (line) => logs.push(line)), "ok", "推送失败后下一轮必须重试");

    const all = JSON.stringify(received);
    for (const forbidden of ["不应出现", "supersecretvalue123", "sk-ant-", "abcdefghijklmnopqrstuvwxyz012345", "内部思考", "/Users/me"]) {
      assert.equal(all.includes(forbidden), false, `素材中不得包含：${forbidden}`);
    }
    const claudeTurns = received.filter((turn) => turn.agent === "claude-code");
    assert.deepEqual(claudeTurns.map((turn) => turn.turnKey), ["u1", "u2", "u3"]);
    assert.equal(claudeTurns[0].prompt, "帮我修复购物车金额计算，api_key=[已隐藏]");
    assert.equal(claudeTurns[0].reply, "已修复购物车金额计算并通过测试。", "只保留该轮最后一段文字答复");
    assert.equal(claudeTurns[0].project, "shop", "只上传目录名，不上传完整路径");
    assert.equal(claudeTurns[0].sessionId, "session-a");
    assert.equal(claudeTurns[1].prompt, "/review 检查支付模块");
    assert.equal(claudeTurns[1].reply.length, 1500);
    assert.equal(claudeTurns[1].reply.endsWith("结尾标记"), true, "裁剪时保留答复的结尾");
    assert.equal(claudeTurns[2].reply, "", "进行中的轮次以空答复上传");
    const codexTurns = received.filter((turn) => turn.agent === "codex");
    assert.deepEqual(codexTurns.map((turn) => turn.prompt), ["给博客加上 RSS 输出", "更新部署文档"], "同一提问的两种记录形式不得重复");
    assert.equal(codexTurns[0].reply, "RSS 输出已完成，[已隐藏] 已配置。");
    assert.deepEqual(codexTurns.map((turn) => turn.project), ["blog", "docs"]);
    assert.equal(codexTurns[1].reply, "部署文档已更新。");
    assert.equal(codexTurns.every((turn) => turn.sessionId === "codex-vscode"), true);
    const gitTurns = received.filter((turn) => turn.agent === "git");
    assert.equal(gitTurns.length, 1, "只采集本人的提交，并跳过 node_modules 中的仓库");
    assert.equal(gitTurns[0].prompt, "实现首页搜索");
    assert.equal(gitTurns[0].project, "webapp");
    assert.equal(gitTurns[0].sessionId, "git:webapp");
    assert.match(gitTurns[0].turnKey, /^[0-9a-f]{40}$/);
    assert.equal(gitTurns[0].reply, "顺带修复样式。password=[已隐藏] （1 个文件，+1 -0）");
    assert.equal(gitTurns[0].startedAt, gitTurns[0].endedAt);
    assert.equal(received.every((turn) => !Number.isNaN(Date.parse(turn.startedAt)) && turn.endedAt >= turn.startedAt), true);

    received.length = 0;
    assert.equal(await collector.runOnce(config, (line) => logs.push(line)), "ok");
    assert.equal(received.length, 0, "未变化的文件不得重复读取和推送");

    fs.appendFileSync(claudeFile, JSON.stringify(claudeAssistant(1, [{ type: "text", text: "优惠券功能已完成。" }])) + "\n");
    assert.equal(await collector.runOnce(config, (line) => logs.push(line)), "ok");
    assert.equal(received.every((turn) => turn.agent === "claude-code"), true, "只重新处理发生变化的文件");
    assert.equal(received.find((turn) => turn.turnKey === "u3").reply, "优惠券功能已完成。");

    assert.equal(await collector.runOnce({ ...config, token: "mdk_wrong" }, (line) => logs.push(line)), "unreachable");
    const emptyConfig = collector.readConfig({ ...env, MYDAYS_TOKEN: "", MYDAYS_TOKEN_FILE: path.join(root, "missing-token") });
    assert.equal(emptyConfig.token, "");
    assert.equal(logs.join("\n").includes("mdk_"), false, "日志中不得出现令牌");
    assert.equal(logs.join("\n").includes("购物车"), false, "日志中不得出现会话内容");

    const stats = await collector.scan(config);
    assert.deepEqual(stats.map((stat) => [stat.agent, stat.turns]), [["claude-code", 3], ["codex", 2]], "没有作者邮箱时不采集 Git 提交");
    const withEmails = await collector.scan(collector.readConfig({ ...env, GIT_AUTHOR_EMAILS: "Me@Example.com" }));
    assert.deepEqual(withEmails.map((stat) => [stat.agent, stat.turns]), [["claude-code", 3], ["codex", 2], ["git", 1]]);
    assert.equal(stats[0].unreadableLines, 1);
    assert.deepEqual(collector.adaptersFor(collector.readConfig({ ...env, CODEX_SESSIONS_DIR: path.join(root, "nope") })).map((adapter) => adapter.name), ["claude-code"], "不存在的目录对应的适配器必须跳过");
    assert.deepEqual(collector.parseGitLog("\x1eabc\x1f2026-10-16T10:00:00+08:00\x1f只有标题\x1f\n", "/repos/x").map((turn) => turn.reply), [""]);

    assert.deepEqual(statusReports.at(-1), { gitDirs: [{ path: gitDir, state: "ok", repos: 1 }] }, "上报 Git 目录状态");

    // Directories chosen in MyDays are used as-is, with "~" expanded to the home folder.
    fs.mkdirSync(path.join(root, "work"), { recursive: true });
    assert.deepEqual(collector.resolveGitDir({ home: root }, "~/work"), { path: path.join(root, "work"), state: "ok" });
    assert.deepEqual(collector.resolveGitDir({ home: root }, "~"), { path: root, state: "ok" });
    assert.deepEqual(collector.resolveGitDir({ home: root }, path.join(root, "missing")), { path: path.join(root, "missing"), state: "missing" });
    const mappedConfig = { ...collector.readConfig({ ...env, GIT_REPOS_DIR: "" }), home: path.dirname(gitDir) };
    const missingDir = path.join(root, "elsewhere");
    const mappedLimits = { maxPromptChars: 600, maxReplyChars: 1500, windowDays: 8, gitAuthorEmails: ["me@example.com"], gitRepoDirs: [`~/${path.basename(gitDir)}`, missingDir] };
    const mappedStats = await collector.scan(mappedConfig, { limits: mappedLimits });
    assert.deepEqual(mappedStats.find((stat) => stat.agent === "git")?.turns, 1, "使用设置页配置的目录");
    assert.deepEqual(collector.collectorStatus(mappedConfig, mappedLimits).gitDirs, [
      { path: `~/${path.basename(gitDir)}`, state: "ok", repos: 1 },
      { path: missingDir, state: "missing", repos: 0 },
    ]);
    assert.equal(collector.collectorStatus(mappedConfig, { ...mappedLimits, gitAuthorEmails: [] }).gitDirs[0].state, "no-emails");
    assert.equal(collector.adaptersFor(mappedConfig, { ...mappedLimits, gitRepoDirs: [] }).some((adapter) => adapter.name === "git"), false);

    console.log("MyDays collector test passed");
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
