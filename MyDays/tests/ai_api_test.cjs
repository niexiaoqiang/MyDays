const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createServer } = require("node:http");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-ai-api-"));
const appPort = 43175;
const mockPort = 43176;
const appUrl = `http://127.0.0.1:${appPort}`;
const mockUrl = `http://127.0.0.1:${mockPort}`;
const requests = [];

function mockPolishText(body) {
  const prompt = body?.messages?.map((message) => String(message.content)).join("\n") ?? "";
  const source = /原文：([^\n]*)/u.exec(prompt)?.[1] ?? "";
  if (source.includes("MULTILINE")) return "第一行 MULTILINE\n第二行";
  if (source.includes("TOO-LONG")) return "TOO-LONG" + "长".repeat(121);
  if (source.includes("MARKDOWN")) return `- ${source}`;
  if (source.includes("QUOTED")) return `“${source}”`;
  if (source.includes("TOKEN-MISSING")) return "登录页修复已完成";
  return source.replace("尽快的", "尽快");
}

const mock = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const text = Buffer.concat(chunks).toString("utf8");
    const body = text ? JSON.parse(text) : null;
    requests.push({ url: request.url, headers: request.headers, body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/openai/v1/chat/completions") {
      const isPolish = body?.messages?.some((message) => String(message.content).includes("原文："));
      const isAchievements = body?.messages?.some((message) => String(message.content).includes("成就总结"));
      const isReport = !isPolish && !isAchievements && body?.messages?.some((message) => String(message.content).includes("工作汇报"));
      const isSummary = !isReport && body?.messages?.some((message) => String(message.content).includes("周期数据："));
      const content = isAchievements
        ? "```markdown\n## 概述\n八月完成 2 项成果。\n\n## 主要成就\n- 完成登录体验优化\n```"
        : isPolish
        ? mockPolishText(body)
        : isReport
        ? "## 本周工作汇报\n\n本周共完成 2 项待办，活跃 1 天。\n\n### 主要成果\n- 完成登录体验优化\n\n### 下一步\n- 完善 AI 汇报回归测试"
        : isSummary
          ? JSON.stringify({ wins: "完成了登录体验优化", blockers: "模型获取流程需要继续观察", next: "完善 AI 总结回归测试" })
          : request.headers.authorization;
      response.end(JSON.stringify({ model: "mock-openai", choices: [{ message: { content } }] }));
    } else if (request.url === "/claude/messages") {
      const isPolish = body?.messages?.some((message) => String(message.content).includes("原文："));
      const isReport = !isPolish && body?.messages?.some((message) => String(message.content).includes("工作汇报"));
      const isSummary = !isReport && body?.messages?.some((message) => String(message.content).includes("周期数据："));
      const text = isPolish
        ? mockPolishText(body)
        : isReport
        ? "## 本月工作汇报\n\n本月完成 1 项待办。\n\n### 主要成果\n- Claude 整理的汇报成果"
        : isSummary
          ? '```json\n{"wins":"Claude 整理的成果","blockers":"Claude 整理的反思","next":"Claude 整理的下一步"}\n```'
          : request.headers["x-api-key"];
      response.end(JSON.stringify({ model: "mock-claude", content: [{ type: "text", text }] }));
    } else if (request.url === "/openai/v1/models") {
      response.end(JSON.stringify({ data: [{ id: "zeta-model" }, { id: "alpha-model" }, { id: "alpha-model" }, { id: "bad\nmodel" }] }));
    } else if (request.url === "/claude/models") {
      response.end(JSON.stringify({ models: [{ id: "claude-z", name: "Claude Z" }, { name: "claude-a" }] }));
    } else if (request.url === "/redirect/chat/completions") {
      response.statusCode = 302;
      response.setHeader("Location", "/openai/v1/chat/completions");
      response.end(JSON.stringify({ redirect: true }));
    } else if (request.url === "/redirect/models") {
      response.statusCode = 302;
      response.setHeader("Location", "/openai/v1/models");
      response.end(JSON.stringify({ internal: "raw redirect body must not escape" }));
    } else if (request.url === "/truncated/v1/chat/completions") {
      response.end(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "## 本周工作汇报\n\n本周共完成" } }] }));
    } else if (request.url === "/truncated-claude/messages") {
      response.end(JSON.stringify({ stop_reason: "max_tokens", content: [{ type: "text", text: "## 本周工作汇报\n\n本周共完成" }] }));
    } else if (request.url === "/invalid/v1/chat/completions") {
      const isTextTask = body?.messages?.some((message) => String(message.content).includes("工作汇报") || String(message.content).includes("原文："));
      response.end(JSON.stringify({ choices: [{ message: { content: isTextTask ? request.headers.authorization : "not-json-upstream-secret" } }] }));
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not found" }));
    }
  });
});

const child = spawn(process.execPath, ["server.js"], {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env, PORT: String(appPort), DATA_DIR: dataDir, AI_CONFIG_SECRET: "test-master-secret", AI_ALLOW_PROXY_FAKE_IP: "1" },
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

async function waitForApp() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${appUrl}/healthz`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`AI test app did not start:\n${output}`);
}

(async () => {
  await new Promise((resolve) => mock.listen(mockPort, "127.0.0.1", resolve));
  try {
    await waitForApp();
    let result = await request("/api/ai/providers");
    assert.deepEqual(result.body, { providers: [], configured: false, defaultProviderId: null });
    result = await request("/api/ai/polish-entry", {
      method: "POST",
      body: JSON.stringify({ type: "task", text: "整理登录页问题" }),
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "AI_DEFAULT_PROVIDER_MISSING");

    const openaiKey = "sk-openai-plain-secret";
    result = await request("/api/ai/models", {
      method: "POST",
      body: JSON.stringify({
        protocol: "openai",
        baseUrl: `${mockUrl}/openai/v1`,
        apiKey: openaiKey,
        timeoutMs: 5000,
      }),
    });
    assert.equal(result.response.status, 200, "未保存服务也应支持获取模型");
    assert.deepEqual(result.body.models, [{ id: "alpha-model" }, { id: "zeta-model" }]);
    assert.equal(JSON.stringify(result.body).includes(openaiKey), false, "临时模型发现不得回传 Key");
    result = await request("/api/ai/providers");
    assert.equal(result.body.providers.length, 0, "临时模型发现不得创建服务或存储 Key");
    assert.equal(output.includes(openaiKey), false, "临时模型发现不得把 Key 写入服务日志");

    result = await request("/api/ai/providers", {
      method: "POST",
      body: JSON.stringify({
        name: "Local OpenAI",
        protocol: "openai",
        baseUrl: `${mockUrl}/openai/v1/`,
        model: "test-openai",
        timeoutMs: 5000,
        apiKey: openaiKey,
        options: { maxTokens: 8 },
      }),
    });
    assert.equal(result.response.status, 201);
    const openaiId = result.body.provider.id;
    assert.equal(result.body.provider.hasApiKey, true);
    assert.equal(result.body.provider.apiKeyMask, "••••••••");
    assert.equal(JSON.stringify(result.body).includes(openaiKey), false);
    assert.equal(result.body.provider.isDefault, true);

    result = await request("/api/ai/summary-settings");
    assert.equal(result.response.status, 200);
    assert.equal(result.body.isCustom, false);
    const defaultSummaryPrompt = result.body.promptExcerpt;
    result = await request("/api/ai/summary-settings", {
      method: "PUT",
      body: JSON.stringify({ promptExcerpt: "突出项目价值与下周风险。" }),
    });
    assert.equal(result.body.isCustom, true);
    assert.equal(result.body.promptExcerpt, "突出项目价值与下周风险。");

    result = await request("/api/ai/polish-entry", {
      method: "POST",
      body: JSON.stringify({ type: "task", text: "8月20日前尽快的完成 MyDays v2.1 登录页修复" }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.polished, "8月20日前尽快完成 MyDays v2.1 登录页修复");
    assert.equal(result.body.provider, "Local OpenAI");
    assert.equal(result.body.model, "test-openai");
    const openaiPolishRequest = requests.find((entry) => entry.url === "/openai/v1/chat/completions"
      && entry.body.messages.some((message) => String(message.content).includes("原文：8月20日")));
    assert.equal(openaiPolishRequest.headers.authorization, `Bearer ${openaiKey}`);
    assert.equal(openaiPolishRequest.body.messages.some((message) => String(message.content).includes("原文是唯一事实来源")), true);
    assert.equal(JSON.stringify(openaiPolishRequest.body).includes("突出项目价值与下周风险。"), false, "总结偏好不得影响润色安全提示词");
    assert.equal(JSON.stringify(openaiPolishRequest.body).includes("排查模型获取按钮"), false, "润色请求不得携带其他工作记录");

    for (const body of [
      { type: "note", text: "无效类型" },
      { type: "task", text: "" },
      { type: "log", text: "第一行\n第二行" },
      { type: "task", text: "长".repeat(121) },
    ]) {
      result = await request("/api/ai/polish-entry", { method: "POST", body: JSON.stringify(body) });
      assert.equal(result.response.status, 400);
      assert.equal(result.body.error.code, "AI_POLISH_INVALID");
    }

    for (const text of ["完成 TOKEN-MISSING 登录页修复", "记录 MULTILINE", "记录 TOO-LONG", "记录 MARKDOWN", "记录 QUOTED"]) {
      result = await request("/api/ai/polish-entry", {
        method: "POST",
        body: JSON.stringify({ type: "log", text }),
      });
      assert.equal(result.response.status, 502);
      assert.equal(result.body.error.code, "AI_RESPONSE_INVALID");
      assert.equal(JSON.stringify(result.body).includes(text), false, "非法上游润色正文不得透传");
    }

    const stateResult = await request("/api/state");
    const summaryState = structuredClone(stateResult.body.data);
    summaryState.tasks.push({
      id: "summary-task-1",
      date: "2026-08-12",
      title: "完成登录体验优化",
      project: "MyDays",
      priority: "high",
      completed: true,
      createdAt: "2026-08-12T02:00:00.000Z",
      completedAt: "2026-08-12T05:00:00.000Z",
    });
    summaryState.logs.push({
      id: "summary-log-1",
      date: "2026-08-13",
      title: "排查模型获取按钮",
      project: "MyDays",
      sourceTaskId: null,
      createdAt: "2026-08-13T03:00:00.000Z",
    });
    result = await request("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: summaryState, revision: stateResult.body.revision }),
    });
    assert.equal(result.response.status, 200);

    result = await request("/api/ai/period-report", {
      method: "POST",
      body: JSON.stringify({ periodType: "week", periodStart: "2026-08-10", project: "MyDays" }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.report.includes("本周工作汇报"), true, "OpenAI 应返回汇报文本");
    assert.equal(result.body.report.includes("完成登录体验优化"), true, "汇报应基于周期记录归纳");
    assert.equal(result.body.provider, "Local OpenAI");
    assert.equal(result.body.model, "test-openai");
    assert.equal(JSON.stringify(result.body).includes(openaiKey), false, "AI 汇报不得回传 OpenAI Key");
    const openaiReportRequest = requests.find((entry) => entry.url === "/openai/v1/chat/completions"
      && entry.body.messages.some((message) => String(message.content).includes("工作汇报")));
    assert.equal(openaiReportRequest.headers.authorization, `Bearer ${openaiKey}`);
    assert.equal(openaiReportRequest.body.model, "test-openai");
    assert.equal(openaiReportRequest.body.stream, false);
    assert.equal(JSON.stringify(openaiReportRequest.body).includes("完成登录体验优化"), true);
    assert.equal(JSON.stringify(openaiReportRequest.body).includes("突出项目价值与下周风险。"), true, "汇报提示词必须包含用户的总结偏好");
    assert.equal(openaiReportRequest.body.messages.some((message) => String(message.content).includes('"project":"MyDays"')), true);
    let persistedState = await request("/api/state");
    assert.deepEqual(persistedState.body.data.periodReviews, {}, "AI 生成结果不得自动保存周期复盘");
    assert.deepEqual(persistedState.body.data.periodReports, {}, "AI 汇报生成结果不得自动保存到 SQLite");

    result = await request("/api/ai/achievements", { method: "POST", body: JSON.stringify({ from: "2026-07-01", to: "2026-12-31" }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.document, "## 概述\n八月完成 2 项成果。\n\n## 主要成就\n- 完成登录体验优化", "应去掉代码围栏");
    assert.equal(result.body.provider, "Local OpenAI");
    const achievementRequest = requests.find((entry) => entry.url === "/openai/v1/chat/completions"
      && entry.body.messages.some((message) => String(message.content).includes("成就总结")));
    const achievementPrompt = achievementRequest.body.messages[1].content;
    assert.equal(achievementPrompt.includes("完成登录体验优化"), true, "成就总结必须基于该时间段的成果");
    assert.equal(achievementPrompt.includes('"omittedAchievements":0'), true);
    assert.equal(achievementPrompt.includes("突出项目价值与下周风险。"), true, "成就总结也应包含用户的总结偏好");
    assert.equal(achievementRequest.body.max_tokens, 4096);
    for (const body of [{ from: "2026-08-10", to: "2026-08-01" }, { from: "2025-01-01", to: "2026-06-30" }, { from: "bad", to: "2026-08-01" }, "nope"]) {
      result = await request("/api/ai/achievements", { method: "POST", body: JSON.stringify(body) });
      assert.equal(result.response.status, 400);
      assert.equal(result.body.error.code, "AI_ACHIEVEMENTS_INVALID");
    }
    result = await request("/api/ai/achievements", { method: "POST", body: JSON.stringify({ from: "2025-01-01", to: "2025-06-30" }) });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "AI_ACHIEVEMENTS_EMPTY");

    result = await request("/api/ai/period-report", {
      method: "POST",
      body: JSON.stringify({ periodType: "week", periodStart: "2026-08-11" }),
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "AI_SUMMARY_INVALID");
    result = await request("/api/ai/period-report", {
      method: "POST",
      body: JSON.stringify({ periodType: "month", periodStart: "2025-01-01" }),
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "AI_SUMMARY_EMPTY");
    result = await request("/api/ai/period-report", {
      method: "POST",
      body: JSON.stringify({ periodType: "week", periodStart: "2026-08-10", project: "不存在项目" }),
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "AI_SUMMARY_EMPTY");

    result = await request("/api/ai/summary-settings", { method: "DELETE" });
    assert.equal(result.body.isCustom, false);
    assert.equal(result.body.promptExcerpt, defaultSummaryPrompt);

    const anthropicKey = "sk-ant-plain-secret";
    result = await request("/api/ai/providers", {
      method: "POST",
      body: JSON.stringify({
        name: "Local Claude",
        protocol: "anthropic",
        baseUrl: `${mockUrl}/claude`,
        model: "test-claude",
        timeoutMs: 5000,
        apiKey: anthropicKey,
        options: { anthropicVersion: "2023-06-01", maxTokens: 12 },
      }),
    });
    assert.equal(result.response.status, 201);
    const anthropicId = result.body.provider.id;

    result = await request(`/api/ai/providers/${openaiId}/test`, { method: "POST" });
    assert.equal(result.response.status, 200);
    assert.equal(Object.hasOwn(result.body, "responsePreview"), false, "上游正文不得回传浏览器");
    assert.equal(JSON.stringify(result.body).includes(openaiKey), false, "上游回显的 OpenAI Key 不得进入响应");
    result = await request(`/api/ai/providers/${anthropicId}/test`, { method: "POST" });
    assert.equal(result.response.status, 200);
    assert.equal(Object.hasOwn(result.body, "responsePreview"), false, "Anthropic 上游正文不得回传浏览器");
    assert.equal(JSON.stringify(result.body).includes(anthropicKey), false, "上游回显的 Anthropic Key 不得进入响应");
    const openaiTestRequest = requests.find((entry) => entry.url === "/openai/v1/chat/completions");
    const anthropicTestRequest = requests.find((entry) => entry.url === "/claude/messages");
    assert.equal(openaiTestRequest.headers.authorization, `Bearer ${openaiKey}`);
    assert.equal(openaiTestRequest.body.model, "test-openai");
    assert.equal(anthropicTestRequest.headers["x-api-key"], anthropicKey);
    assert.equal(anthropicTestRequest.headers["anthropic-version"], "2023-06-01");

    result = await request(`/api/ai/providers/${openaiId}/models`, { method: "POST" });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.models, [{ id: "alpha-model" }, { id: "zeta-model" }]);
    result = await request(`/api/ai/providers/${anthropicId}/models`, { method: "POST" });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.models, [{ id: "claude-a" }, { id: "claude-z", name: "Claude Z" }]);
    const openaiModelsRequest = requests.find((entry) => entry.url === "/openai/v1/models");
    const claudeModelsRequest = requests.find((entry) => entry.url === "/claude/models");
    assert.equal(openaiModelsRequest.headers.authorization, `Bearer ${openaiKey}`);
    assert.equal(claudeModelsRequest.headers["x-api-key"], anthropicKey);
    assert.equal(claudeModelsRequest.headers["anthropic-version"], "2023-06-01");

    result = await request(`/api/ai/providers/${anthropicId}/default`, { method: "POST" });
    assert.equal(result.body.provider.isDefault, true);
    result = await request("/api/ai/providers");
    assert.equal(result.body.defaultProviderId, anthropicId);
    assert.equal(result.body.providers.filter((provider) => provider.isDefault).length, 1);

    result = await request("/api/ai/period-report", {
      method: "POST",
      body: JSON.stringify({ periodType: "week", periodStart: "2026-08-10" }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.report.includes("本月工作汇报"), true, "Claude 应返回汇报文本");
    assert.equal(result.body.provider, "Local Claude");
    assert.equal(result.body.model, "test-claude");
    assert.equal(JSON.stringify(result.body).includes(anthropicKey), false, "AI 汇报不得回传 Anthropic Key");
    const claudeReportRequest = requests.find((entry) => entry.url === "/claude/messages"
      && entry.body.messages.some((message) => String(message.content).includes("工作汇报")));
    assert.equal(claudeReportRequest.headers["x-api-key"], anthropicKey);
    assert.equal(claudeReportRequest.body.max_tokens, 4096, "汇报生成的 Token 上限不得受连接测试 Token 设置限制");
    assert.equal(claudeReportRequest.headers["anthropic-version"], "2023-06-01");

    result = await request("/api/ai/polish-entry", {
      method: "POST",
      body: JSON.stringify({ type: "log", text: "完成 MyDays v2.1 登录页修复" }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.polished, "完成 MyDays v2.1 登录页修复");
    assert.equal(result.body.provider, "Local Claude");
    assert.equal(result.body.model, "test-claude");
    const claudePolishRequest = requests.find((entry) => entry.url === "/claude/messages"
      && entry.body.messages.some((message) => String(message.content).includes("原文：完成 MyDays")));
    assert.equal(claudePolishRequest.headers["x-api-key"], anthropicKey);
    assert.equal(claudePolishRequest.body.system.includes("不得把待办写成已完成"), true);
    assert.equal(claudePolishRequest.body.max_tokens, 512);

    const invalidKey = "sk-invalid-summary-secret";
    result = await request("/api/ai/providers", {
      method: "POST",
      body: JSON.stringify({
        name: "Invalid Summary Service",
        protocol: "openai",
        baseUrl: `${mockUrl}/invalid/v1`,
        model: "invalid-summary-model",
        timeoutMs: 5000,
        apiKey: invalidKey,
      }),
    });
    const invalidId = result.body.provider.id;
    await request(`/api/ai/providers/${invalidId}/default`, { method: "POST" });
    result = await request("/api/ai/period-summary", { method: "POST", body: JSON.stringify({ periodType: "week", periodStart: "2026-08-10" }) });
    assert.equal(result.response.status, 404, "已移除的周期结构化总结接口不得再响应");

    result = await request("/api/ai/polish-entry", {
      method: "POST",
      body: JSON.stringify({ type: "task", text: "修复登录页" }),
    });
    assert.equal(result.response.status, 502);
    assert.equal(result.body.error.code, "AI_RESPONSE_INVALID");
    assert.equal(JSON.stringify(result.body).includes("Bearer"), false, "润色接口不得透传上游回显的 Authorization 头");
    assert.equal(JSON.stringify(result.body).includes(invalidKey), false, "润色接口不得泄露 Key");

    result = await request("/api/ai/period-report", {
      method: "POST",
      body: JSON.stringify({ periodType: "week", periodStart: "2026-08-10" }),
    });
    assert.equal(result.response.status, 502);
    assert.equal(result.body.error.code, "AI_RESPONSE_INVALID");
    assert.equal(JSON.stringify(result.body).includes("Bearer"), false, "上游回显的 Authorization 头不得透传");
    assert.equal(JSON.stringify(result.body).includes(invalidKey), false, "非法响应不得泄露 Key");

    await request(`/api/ai/providers/${invalidId}`, { method: "DELETE" });

    for (const [protocol, suffix] of [["openai", "/truncated/v1"], ["anthropic", "/truncated-claude"]]) {
      result = await request("/api/ai/providers", {
        method: "POST",
        body: JSON.stringify({
          name: `Truncated ${protocol}`,
          protocol,
          baseUrl: `${mockUrl}${suffix}`,
          model: "truncated-model",
          timeoutMs: 5000,
          apiKey: "sk-truncated-secret",
        }),
      });
      assert.equal(result.response.status, 201);
      const truncatedId = result.body.provider.id;
      await request(`/api/ai/providers/${truncatedId}/default`, { method: "POST" });
      result = await request("/api/ai/period-report", {
        method: "POST",
        body: JSON.stringify({ periodType: "week", periodStart: "2026-08-10" }),
      });
      assert.equal(result.response.status, 502);
      assert.equal(result.body.error.code, "AI_RESPONSE_TRUNCATED", `${protocol} 被截断的汇报不得当作完整结果返回`);
      await request(`/api/ai/providers/${truncatedId}`, { method: "DELETE" });
    }
    await request(`/api/ai/providers/${openaiId}/default`, { method: "POST" });
    let polishRateLimited = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      result = await request("/api/ai/polish-entry", {
        method: "POST",
        body: JSON.stringify({ type: "task", text: "完成 MyDays v2.1 登录页修复" }),
      });
      if (result.response.status === 429) {
        polishRateLimited = true;
        assert.equal(result.body.error.code, "RATE_LIMITED");
        break;
      }
      assert.equal(result.response.status, 200);
    }
    assert.equal(polishRateLimited, true, "润色接口必须使用独立限流键稳定拒绝超限请求");

    result = await request(`/api/ai/providers/${openaiId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: "Updated OpenAI",
        protocol: "openai",
        baseUrl: `${mockUrl}/openai/v1`,
        model: "test-openai-2",
        timeoutMs: 6000,
        options: { maxTokens: 8 },
      }),
    });
    assert.equal(result.body.provider.hasApiKey, true, "省略新 Key 时必须保留原 Key");

    result = await request(`/api/ai/providers/${openaiId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: "Must not change target",
        protocol: "openai",
        baseUrl: `${mockUrl}/different-path`,
        model: "test-openai-2",
        timeoutMs: 6000,
        options: { maxTokens: 8 },
      }),
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "AI_KEY_REENTRY_REQUIRED", "完整 Base URL 变化必须重新填写 Key");
    result = await request("/api/ai/providers");
    assert.equal(result.body.providers.find((provider) => provider.id === openaiId).baseUrl, `${mockUrl}/openai/v1`, "拒绝后数据库目标不能改变");

    result = await request(`/api/ai/providers/${openaiId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: "Must not change protocol",
        protocol: "anthropic",
        baseUrl: `${mockUrl}/openai/v1`,
        model: "test-openai-2",
        timeoutMs: 6000,
        options: { maxTokens: 8 },
      }),
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "AI_KEY_REENTRY_REQUIRED", "协议变化必须重新填写 Key");

    result = await request(`/api/ai/providers/${openaiId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: "Updated OpenAI",
        protocol: "openai",
        baseUrl: `${mockUrl}/redirect`,
        model: "test-openai-2",
        apiKey: openaiKey,
        timeoutMs: 6000,
        options: { maxTokens: 8 },
      }),
    });
    assert.equal(result.response.status, 200);
    const requestCountBeforeRedirect = requests.length;
    result = await request(`/api/ai/providers/${openaiId}/test`, { method: "POST" });
    assert.equal(result.response.status, 502);
    assert.equal(result.body.error.code, "AI_REDIRECT_BLOCKED");
    assert.equal(requests.length, requestCountBeforeRedirect + 1, "重定向不得产生第二次携带 Key 的请求");
    result = await request(`/api/ai/providers/${openaiId}/models`, { method: "POST" });
    assert.equal(result.response.status, 502);
    assert.equal(result.body.error.code, "AI_REDIRECT_BLOCKED");
    assert.equal(JSON.stringify(result.body).includes("raw redirect body"), false);

    for (const baseUrl of [
      "http://example.com/v1",
      "http://169.254.169.254/latest",
      "http://100.64.0.1/v1",
      "http://198.18.0.1/v1",
      "https://198.18.8.221/v1",
      "https://168.63.129.16/metadata",
      "https://[::ffff:169.254.169.254]/latest",
      "https://[fd00:ec2::254]/latest",
      "https://user:pass@example.com/v1",
    ]) {
      result = await request("/api/ai/providers", {
        method: "POST",
        body: JSON.stringify({ name: "Blocked", protocol: "openai", baseUrl, model: "x", apiKey: "x", timeoutMs: 5000 }),
      });
      assert.equal(result.response.status, 400, `${baseUrl} 应被拒绝`);
    }

    const database = new DatabaseSync(path.join(dataDir, "mydays.db"), { readOnly: true });
    const stored = database.prepare("SELECT * FROM ai_providers WHERE id = ?").get(openaiId);
    assert.notEqual(stored.api_key_ciphertext, openaiKey);
    assert.equal(JSON.stringify(stored).includes(openaiKey), false);
    assert.equal(database.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get().value, "10");
    database.close();
    assert.equal(fs.existsSync(path.join(dataDir, ".ai-config-secret")), false, "环境变量密钥不得生成主密钥文件");

    result = await request(`/api/ai/providers/${openaiId}/key`, { method: "DELETE" });
    assert.equal(result.body.provider.hasApiKey, false);
    result = await request(`/api/ai/providers/${openaiId}`, { method: "DELETE" });
    assert.equal(result.body.deleted, true);

    console.log("MyDays AI provider API test passed");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => mock.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  console.error(output);
  child.kill("SIGKILL");
  mock.close();
  process.exitCode = 1;
});
