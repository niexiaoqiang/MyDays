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
  logs: [],
  notes: {},
  reviews: {},
  periodReviews: {},
  projectReviews: {},
  projectPeriodReviews: {},
  periodReports: {},
  projectPeriodReports: {},
};
const legacyState = {
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
  notes: { "2026-08-12": "旧版笔记" },
    reviews: {},
    periodReviews: {},
    projectReviews: {},
    projectPeriodReviews: {},
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
    assert.match(await loginPageResponse.text(), /styles\.css\?v=23/);

    for (const route of ["/", "/tasks", "/timeline", "/review", "/summary", "/ai-settings", "/tasks/"]) {
      const pageResponse = await fetch(`${baseUrl}${route}`);
      assert.equal(pageResponse.status, 200, `${route} 应返回应用页面`);
      const pageHtml = await pageResponse.text();
      assert.match(pageHtml, /data-route="today"/);
      assert.match(pageHtml, /styles\.css\?v=23/);
      assert.match(pageHtml, /app\.js\?v=24/);
      assert.match(pageHtml, /id="summary-export-trigger"[^>]+aria-haspopup="menu"[^>]+aria-expanded="false"/);
      assert.match(pageHtml, /id="summary-export-menu" role="menu"/);
      assert.match(pageHtml, /role="menuitem"[^>]+data-export-format="markdown"/);
      assert.match(pageHtml, /role="menuitem"[^>]+data-export-format="excel"/);
      assert.doesNotMatch(pageHtml, /id="summary-export-(markdown|excel)"/);
    }
    const appScriptResponse = await fetch(`${baseUrl}/app.js?v=24`);
    assert.equal(appScriptResponse.headers.get("cache-control"), "no-cache", "应用脚本必须重新验证，避免容器升级后继续使用旧版本");
    const appScript = await appScriptResponse.text();
    assert.match(appScript, /renderItemActions/);
    assert.match(appScript, /serializeAchievementsMarkdown/);
    assert.match(appScript, /createAchievementsWorkbook/);
    assert.match(appScript, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
    assert.match(appScript, /closeSummaryExportMenu/);
    assert.match(appScript, /moveSummaryExportFocus/);
    const stylesheetResponse = await fetch(`${baseUrl}/styles.css?v=23`);
    assert.equal(stylesheetResponse.headers.get("cache-control"), "no-cache", "应用样式必须重新验证，避免与旧脚本混用");
    const stylesheet = await stylesheetResponse.text();
    assert.match(stylesheet, /\.item-action/);
    assert.match(stylesheet, /\.summary-achievement-actions/);
    assert.match(stylesheet, /\.summary-export-menu-item/);
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
    assert.equal(result.body.migrationAllowed, true);
    assert.deepEqual(result.body.data, emptyState);
    assert.equal(result.body.revision, 0);

    result = await jsonRequest("/api/migrate", {
      method: "POST",
      body: JSON.stringify({ data: legacyState }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.migrated, true);
    assert.equal(result.body.migrationAllowed, false);
    assert.equal(result.body.data.tasks[0].title, "迁移旧待办");
    assert.equal(result.body.data.notes["2026-08-12"], "旧版笔记");

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

    result = await jsonRequest("/api/migrate", {
      method: "POST",
      body: JSON.stringify({ data: emptyState }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.migrated, false);
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
      wins: "完成周期汇总存储",
      blockers: "需要补充移动端验证",
      next: "完成浏览器回归测试",
      completedAt: "2026-08-16T10:00:00.000Z",
    };
    updatedState.periodReviews["month:2026-08-01"] = { wins: "月度成果", blockers: "", next: "下月重点", completedAt: null };
    updatedState.periodReviews["quarter:2026-07-01"] = { wins: "季度成果", blockers: "", next: "下季度重点", completedAt: null };
    updatedState.periodReviews["year:2026-01-01"] = { wins: "年度成果", blockers: "", next: "明年重点", completedAt: null };
    updatedState.projectReviews["2026-08-12"] = {
      工作: { wins: "工作项目成果", blockers: "工作项目问题", next: "工作项目下一步", completedAt: null },
    };
    updatedState.projectPeriodReviews["week:2026-08-10"] = {
      工作: { wins: "工作项目周成果", blockers: "", next: "工作项目下周重点", completedAt: null },
    };
    updatedState.periodReports["week:2026-08-10"] = { content: "本周汇报：完成登录体验优化。", updatedAt: null };
    updatedState.periodReports["month:2026-08-01"] = { content: "月度汇报初稿", updatedAt: null };
    updatedState.projectPeriodReports["week:2026-08-10"] = {
      工作: { content: "工作项目周汇报", updatedAt: null },
    };

    result = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: updatedState, revision: currentRevision }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.tasks[0].completed, true);
    assert.equal(result.body.data.logs.length, 1);
    assert.equal(result.body.data.periodReviews["week:2026-08-10"].wins, "完成周期汇总存储");
    assert.equal(Object.keys(result.body.data.periodReviews).length, 4, "四种周期复盘必须独立保存");
    assert.equal(result.body.data.periodReviews["month:2026-08-01"].wins, "月度成果");
    assert.equal(result.body.data.periodReviews["quarter:2026-07-01"].wins, "季度成果");
    assert.equal(result.body.data.periodReviews["year:2026-01-01"].wins, "年度成果");
    assert.equal(result.body.data.projectReviews["2026-08-12"].工作.wins, "工作项目成果");
    assert.equal(result.body.data.projectPeriodReviews["week:2026-08-10"].工作.wins, "工作项目周成果");
    assert.equal(result.body.data.periodReports["week:2026-08-10"].content, "本周汇报：完成登录体验优化。");
    assert.equal(result.body.data.periodReports["month:2026-08-01"].content, "月度汇报初稿");
    assert.equal(result.body.data.projectPeriodReports["week:2026-08-10"].工作.content, "工作项目周汇报");

    const modernRevision = result.body.revision;
    const oldClientState = structuredClone(result.body.data);
    delete oldClientState.periodReviews;
    delete oldClientState.projectReviews;
    delete oldClientState.projectPeriodReviews;
    delete oldClientState.periodReports;
    delete oldClientState.projectPeriodReports;
    oldClientState.notes["2026-08-13"] = "旧客户端写入";
    result = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: oldClientState, revision: modernRevision }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(
      result.body.data.periodReviews["week:2026-08-10"].wins,
      "完成周期汇总存储",
      "旧客户端请求不得覆盖周期复盘",
    );
    assert.equal(result.body.data.projectReviews["2026-08-12"].工作.wins, "工作项目成果", "旧客户端不得覆盖项目每日复盘");
    assert.equal(
      result.body.data.projectPeriodReviews["week:2026-08-10"].工作.wins,
      "工作项目周成果",
      "旧客户端不得覆盖项目周期复盘",
    );
    assert.equal(
      result.body.data.periodReports["week:2026-08-10"].content,
      "本周汇报：完成登录体验优化。",
      "旧客户端不得覆盖周期汇报",
    );
    assert.equal(
      result.body.data.projectPeriodReports["week:2026-08-10"].工作.content,
      "工作项目周汇报",
      "旧客户端不得覆盖项目周期汇报",
    );

    const invalidPeriodState = structuredClone(result.body.data);
    invalidPeriodState.periodReviews["quarter:2026-02-01"] = {
      wins: "无效季度",
      blockers: "",
      next: "",
      completedAt: null,
    };
    const invalidPeriodResult = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: invalidPeriodState, revision: result.body.revision }),
    });
    assert.equal(invalidPeriodResult.response.status, 400);
    assert.equal(invalidPeriodResult.body.error.code, "INVALID_STATE");

    const invalidReportState = structuredClone(result.body.data);
    invalidReportState.periodReports["week:2026-08-11"] = { content: "无效周期起始日的汇报", updatedAt: null };
    const invalidReportResult = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: invalidReportState, revision: result.body.revision }),
    });
    assert.equal(invalidReportResult.response.status, 400);
    assert.equal(invalidReportResult.body.error.code, "INVALID_STATE");

    const staleResult = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: emptyState, revision: modernRevision }),
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
    assert.equal(result.body.data.periodReviews["week:2026-08-10"].next, "完成浏览器回归测试");
    assert.equal(result.body.migrationAllowed, false);
    assert.equal(fs.existsSync(path.join(tempDir, "mydays.db")), true);

    const clearResult = await jsonRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: emptyState, revision: result.body.revision }),
    });
    assert.equal(clearResult.response.status, 200);
    assert.equal(clearResult.body.empty, true);
    assert.equal(clearResult.body.migrationAllowed, false);

    const remigrationResult = await jsonRequest("/api/migrate", {
      method: "POST",
      body: JSON.stringify({ data: legacyState }),
    });
    assert.equal(remigrationResult.response.status, 200);
    assert.equal(remigrationResult.body.migrated, false);
    assert.deepEqual(remigrationResult.body.data, emptyState, "删空后不得重复导入旧浏览器数据");

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
