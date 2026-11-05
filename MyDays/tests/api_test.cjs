const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-api-"));
const port = 43173;
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server.js"], {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env, PORT: String(port), DATA_DIR: tempDir },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
child.stdout.on("data", (chunk) => { serverOutput += chunk; });
child.stderr.on("data", (chunk) => { serverOutput += chunk; });

const emptyState = {
  tasks: [],
  recurrences: [],
  logs: [],
  goals: [],
  reviews: {},
  periodReviews: {},
};
const seedState = {
  tasks: [{
    id: "legacy-task",
    date: "2026-08-12",
    title: "迁移旧待办",
    project: "工作",
    priority: "high",
    completed: false,
    createdAt: "2026-08-12T01:00:00.000Z",
  }],
  logs: [],
  // A backup from before schema v11: notes and multi-part reviews are folded on import.
  notes: { "2026-08-12": "旧版笔记" },
  reviews: { "2026-08-12": { wins: "旧版成果", blockers: "", next: "", completedAt: null } },
  periodReviews: { "week:2026-08-10": { wins: "", blockers: "旧版周问题", next: "", completedAt: null } },
  projectPeriodReviews: {},
  periodReports: { "week:2026-08-10": { content: "旧版周报", updatedAt: null } },
  projectPeriodReports: { "week:2026-08-10": { 工作: { content: "旧版项目周报", updatedAt: null } } },
};

async function jsonRequest(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
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

(async () => {
  try {
    await waitForServer();

    const loginPageResponse = await fetch(`${baseUrl}/login`);
    assert.equal(loginPageResponse.status, 200, "/login 应返回登录页面");
    assert.match(await loginPageResponse.text(), /styles\.css\?v=41/);

    // /tasks, /timeline and /review are old links that now open sections of the today page.
    for (const route of ["/", "/tasks", "/timeline", "/review", "/summary", "/settings", "/ai-settings", "/tasks/"]) {
      const pageResponse = await fetch(`${baseUrl}${route}`);
      assert.equal(pageResponse.status, 200, `${route} 应返回应用页面`);
      const pageHtml = await pageResponse.text();
      assert.match(pageHtml, /data-route="today"/);
      assert.match(pageHtml, /styles\.css\?v=41/);
      assert.match(pageHtml, /app\.js\?v=41/);
      assert.match(pageHtml, /id="summary-export-trigger"[^>]+aria-haspopup="menu"[^>]+aria-expanded="false"/);
      assert.match(pageHtml, /id="summary-export-menu" role="menu"/);
      assert.match(pageHtml, /role="menuitem"[^>]+data-export-format="markdown"/);
      assert.match(pageHtml, /role="menuitem"[^>]+data-export-format="excel"/);
      assert.doesNotMatch(pageHtml, /id="summary-export-(markdown|excel)"/);
    }
    const appScriptResponse = await fetch(`${baseUrl}/app.js?v=41`);
    assert.equal(appScriptResponse.headers.get("cache-control"), "no-cache", "应用脚本必须重新验证，避免容器升级后继续使用旧版本");
    const appScript = await appScriptResponse.text();
    assert.match(appScript, /renderItemActions/);
    assert.match(appScript, /serializeAchievementsMarkdown/);
    assert.match(appScript, /savePeriodRecordDraft/);
    assert.match(appScript, /createAchievementsWorkbook/);
    assert.match(appScript, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
    assert.match(appScript, /closeSummaryExportMenu/);
    assert.match(appScript, /moveSummaryExportFocus/);
    const stylesheetResponse = await fetch(`${baseUrl}/styles.css?v=41`);
    assert.equal(stylesheetResponse.headers.get("cache-control"), "no-cache", "应用样式必须重新验证，避免与旧脚本混用");
    const stylesheet = await stylesheetResponse.text();
    assert.match(stylesheet, /\.item-action/);
    assert.match(stylesheet, /\.summary-achievement-actions/);
    assert.match(stylesheet, /\.summary-export-menu-item/);
    const themeScriptResponse = await fetch(`${baseUrl}/theme.js?v=1`);
    assert.equal(themeScriptResponse.status, 200, "主题脚本必须可访问");
    assert.match(await themeScriptResponse.text(), /MyDaysTheme/);
    const missingPage = await fetch(`${baseUrl}/unknown-page`);
    assert.equal(missingPage.status, 404);

    const crossSiteMutation = await jsonRequest("/api/state", {
      method: "PUT",
      headers: { Origin: "https://evil.example" },
      body: JSON.stringify({ data: emptyState, revision: 0 }),
    });
    assert.equal(crossSiteMutation.response.status, 403, "无认证本地模式也必须拒绝显式跨站修改请求");
    assert.equal(crossSiteMutation.body.error.code, "ORIGIN_MISMATCH");

    let result = await jsonRequest("/api/state");
    assert.equal(result.response.status, 200);
    assert.equal(result.body.empty, true);
    assert.equal("migrationAllowed" in result.body, false, "旧版浏览器数据迁移已移除");
    assert.deepEqual(result.body.data, emptyState);
    assert.equal(result.body.revision, 0);
    assert.equal((await jsonRequest("/api/migrate", { method: "POST", body: JSON.stringify({ data: seedState }) })).response.status, 404);

    result = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: { ...seedState, projectReviews: { "2026-08-12": { 工作: { wins: "旧备份里的项目每日复盘" } } } }, revision: 0 }),
    });
    assert.equal(result.response.status, 200);
    assert.equal("projectReviews" in result.body.data, false, "旧备份中的项目每日复盘应被忽略");
    assert.equal(result.body.data.tasks[0].title, "迁移旧待办");
    assert.equal("notes" in result.body.data, false, "旧备份的笔记应并入每日复盘");
    assert.equal(result.body.data.reviews["2026-08-12"].content, "【成果】\n旧版成果\n\n【笔记】\n旧版笔记");
    assert.deepEqual(result.body.data.periodReviews["week:2026-08-10"], {
      "": { report: "旧版周报", notes: "旧版周问题" },
      工作: { report: "旧版项目周报", notes: "" },
    });

    let projectsResult = await jsonRequest("/api/projects");
    assert.equal(projectsResult.response.status, 200);
    assert.deepEqual(projectsResult.body.projects, ["工作", "个人", "学习"]);

    projectsResult = await jsonRequest("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "  自定义研发  " }),
    });
    assert.equal(projectsResult.response.status, 201);
    assert.equal(projectsResult.body.selected, "自定义研发");
    assert.deepEqual(projectsResult.body.projects, ["工作", "个人", "学习", "自定义研发"]);

    let invalidProject = await jsonRequest("/api/projects", { method: "POST", body: JSON.stringify({ name: "自定义研发" }) });
    assert.equal(invalidProject.response.status, 409);
    invalidProject = await jsonRequest("/api/projects", { method: "POST", body: JSON.stringify({ name: "   " }) });
    assert.equal(invalidProject.response.status, 400);
    invalidProject = await jsonRequest("/api/projects", { method: "POST", body: JSON.stringify({ name: "项".repeat(81) }) });
    assert.equal(invalidProject.response.status, 400);

    projectsResult = await jsonRequest(`/api/projects/${encodeURIComponent("自定义研发")}`, {
      method: "PUT",
      body: JSON.stringify({ name: "客户项目" }),
    });
    assert.equal(projectsResult.response.status, 200);
    assert.equal(projectsResult.body.selected, "客户项目");

    projectsResult = await jsonRequest("/api/projects/order", {
      method: "PUT",
      body: JSON.stringify({ projects: ["客户项目", "工作", "个人", "学习"] }),
    });
    assert.deepEqual(projectsResult.body.projects, ["客户项目", "工作", "个人", "学习"]);
    invalidProject = await jsonRequest("/api/projects/order", {
      method: "PUT",
      body: JSON.stringify({ projects: ["客户项目", "工作"] }),
    });
    assert.equal(invalidProject.response.status, 400);

    projectsResult = await jsonRequest(`/api/projects/${encodeURIComponent("工作")}`, {
      method: "PUT",
      body: JSON.stringify({ name: "核心工作" }),
    });
    assert.equal(projectsResult.response.status, 200);
    let historyState = await jsonRequest("/api/state");
    assert.equal(historyState.body.data.tasks[0].project, "工作", "重命名选项不得改写历史任务");
    projectsResult = await jsonRequest(`/api/projects/${encodeURIComponent("核心工作")}`, { method: "DELETE" });
    assert.equal(projectsResult.response.status, 200);
    historyState = await jsonRequest("/api/state");
    assert.equal(historyState.body.data.tasks[0].project, "工作", "删除选项不得改写历史任务");
    assert.equal(projectsResult.body.projects.includes("核心工作"), false);

    result = await jsonRequest("/api/state");
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.tasks[0].title, "迁移旧待办");

    const currentRevision = result.body.revision;
    const updatedState = structuredClone(result.body.data);
    updatedState.tasks[0].completed = true;
    updatedState.tasks[0].completedAt = "2026-08-12T02:00:00.000Z";
    updatedState.logs.push({
      id: "legacy-log",
      date: "2026-08-12",
      title: "迁移旧待办",
      project: "工作",
      sourceTaskId: "legacy-task",
      createdAt: "2026-08-12T02:00:00.000Z",
    });
    updatedState.periodReviews["week:2026-08-10"] = {
      "": { report: "本周汇报：完成登录体验优化。", notes: "需要补充移动端验证" },
      工作: { report: "工作项目周汇报", notes: "工作项目下周重点" },
    };
    updatedState.periodReviews["month:2026-08-01"] = { "": { report: "月度汇报初稿", notes: "" } };
    updatedState.periodReviews["quarter:2026-07-01"] = { "": { report: "", notes: "季度说明" } };
    updatedState.periodReviews["year:2026-01-01"] = { "": { report: "", notes: "年度说明" } };
    updatedState.periodReviews["day:2026-08-12"] = { "": { report: "日报初稿", notes: "" } };
    updatedState.periodReviews["range:2026-01-01:2026-06-30"] = { "": { report: "上半年成果总结", notes: "" } };

    result = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: updatedState, revision: currentRevision }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.tasks[0].completed, true);
    assert.equal(result.body.data.logs.length, 1);
    assert.equal(Object.keys(result.body.data.periodReviews).length, 6, "五种周期和自定义时间段必须独立保存");
    assert.equal(result.body.data.periodReviews["day:2026-08-12"][""].report, "日报初稿");
    assert.equal(result.body.data.periodReviews["week:2026-08-10"][""].notes, "需要补充移动端验证");
    assert.equal(result.body.data.periodReviews["week:2026-08-10"].工作.report, "工作项目周汇报");
    assert.equal(result.body.data.periodReviews["month:2026-08-01"][""].report, "月度汇报初稿");
    assert.equal(result.body.data.periodReviews["year:2026-01-01"][""].notes, "年度说明");
    assert.equal(result.body.data.periodReviews["range:2026-01-01:2026-06-30"][""].report, "上半年成果总结");

    const modernRevision = result.body.revision;
    const omittingClientState = structuredClone(result.body.data);
    delete omittingClientState.periodReviews;
    result = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: omittingClientState, revision: modernRevision }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(
      result.body.data.periodReviews["week:2026-08-10"].工作.report,
      "工作项目周汇报",
      "省略 periodReviews 的整包保存不得清空周期汇报",
    );

    for (const key of ["day:2026-02-30", "quarter:2026-02-01", "week:2026-08-11", "range:2026-06-30:2026-01-01", "range:2025-01-01:2026-06-30"]) {
      const invalidPeriodState = structuredClone(result.body.data);
      invalidPeriodState.periodReviews[key] = { "": { report: "无效", notes: "" } };
      const invalidPeriodResult = await jsonRequest("/api/state", {
        method: "PUT",
        body: JSON.stringify({ data: invalidPeriodState, revision: result.body.revision }),
      });
      assert.equal(invalidPeriodResult.response.status, 400, `${key} 应被拒绝`);
      assert.equal(invalidPeriodResult.body.error.code, "INVALID_STATE");
    }
    const latestRevision = result.body.revision;

    const goal = (id, week, title = "周目标") => ({ id, week, title, done: false, createdAt: "2026-08-10T01:00:00.000Z" });
    const goalState = structuredClone(result.body.data);
    goalState.goals = [goal("g1", "2026-08-10", "完成登录体验优化")];
    goalState.tasks[0].goalId = "g1";
    goalState.tasks[0].focus = true;
    result = await jsonRequest("/api/state", { method: "PUT", body: JSON.stringify({ data: goalState, revision: latestRevision }) });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.data.goals, [goal("g1", "2026-08-10", "完成登录体验优化")]);
    assert.equal(result.body.data.tasks[0].goalId, "g1");
    assert.equal(result.body.data.tasks[0].focus, true);
    const { goals: _omittedGoals, ...noGoalsState } = result.body.data;
    result = await jsonRequest("/api/state", { method: "PUT", body: JSON.stringify({ data: noGoalsState, revision: result.body.revision }) });
    assert.equal(result.body.data.goals.length, 1, "省略 goals 的整包保存不得清空目标");
    for (const goals of [
      [goal("g2", "2026-08-11")],
      Array.from({ length: 6 }, (_, index) => goal(`g${index}`, "2026-08-10")),
    ]) {
      const invalidGoals = await jsonRequest("/api/state", {
        method: "PUT",
        body: JSON.stringify({ data: { ...result.body.data, goals }, revision: result.body.revision }),
      });
      assert.equal(invalidGoals.response.status, 400, "目标必须落在周一且每周最多 5 个");
    }

    const staleResult = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: emptyState, revision: latestRevision }),
    });
    assert.equal(staleResult.response.status, 409);
    assert.equal(staleResult.body.error.code, "STATE_CONFLICT");

    const invalidResult = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: { ...emptyState, tasks: [{ title: "缺少字段" }] }, revision: result.body.revision }),
    });
    assert.equal(invalidResult.response.status, 400);
    assert.equal(invalidResult.body.error.code, "INVALID_STATE");

    result = await jsonRequest("/api/state");
    assert.equal(result.body.data.tasks[0].completed, true, "失败写入不得改变数据库");
    assert.equal(result.body.data.logs.length, 1);
    assert.equal(result.body.data.periodReviews["week:2026-08-10"][""].notes, "需要补充移动端验证");
    assert.equal(fs.existsSync(path.join(tempDir, "mydays.db")), true);

    const clearResult = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: emptyState, revision: result.body.revision }),
    });
    assert.equal(clearResult.response.status, 200);
    assert.equal(clearResult.body.empty, true);

    let sourceState = (await jsonRequest("/api/state")).body;
    const sourcedLog = { id: "sourced-log", date: "2026-08-12", title: "AI 整理的记录", project: "", sourceTaskId: null, source: "agent-digest", createdAt: "2026-08-12T09:00:00.000Z" };
    result = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: { ...sourceState.data, logs: [sourcedLog] }, revision: sourceState.revision }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.logs[0].source, "agent-digest");
    const { source: _omitted, ...legacyLog } = sourcedLog;
    result = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: { ...result.body.data, logs: [legacyLog] }, revision: result.body.revision }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.logs[0].source, "agent-digest", "旧客户端整包保存不得清除记录来源");
    result = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: { ...result.body.data, logs: [{ ...legacyLog, source: "" }] }, revision: result.body.revision }),
    });
    assert.equal(result.body.data.logs[0].source, "", "显式清空来源即认领");

    console.log("MyDays API test passed");
  } finally {
    child.kill("SIGTERM");
  }
})().catch((error) => {
  console.error(error);
  console.error(serverOutput);
  child.kill("SIGKILL");
  process.exitCode = 1;
});
