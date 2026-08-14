const { chromium } = require("playwright");
const fs = require("node:fs");

const screenshotDir = "/tmp/mydays-smoke";
const baseUrl = process.env.MYDAYS_TEST_URL ?? "http://127.0.0.1:4173";
fs.mkdirSync(screenshotDir, { recursive: true });

let browser;

(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const fixedNow = new Date("2026-08-12T10:00:00+08:00").getTime();
  await page.addInitScript(({ now }) => {
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [now]));
      }
      static now() { return now; }
    }
    Object.setPrototypeOf(FixedDate, NativeDate);
    globalThis.Date = FixedDate;
  }, { now: fixedNow });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(baseUrl);
  await page.waitForLoadState("networkidle");
  const initialState = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (!initialState.empty || !initialState.migrationAllowed) {
    throw new Error("浏览器测试必须使用全新的隔离 SQLite 数据库");
  }
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("mydays.v1", JSON.stringify({
      tasks: [{
        id: "browser-legacy-task",
        date: "2026-08-12",
        title: "从浏览器迁移的待办",
        project: "个人",
        priority: "normal",
        completed: true,
        createdAt: "2026-08-12T00:30:00.000Z",
        completedAt: "2026-08-12T00:45:00.000Z",
      }],
      logs: [],
      notes: { "2026-08-12": "从 localStorage 迁移的笔记" },
      reviews: {},
    }));
  });
  await page.reload();
  await page.waitForLoadState("networkidle");

  await page.locator(".task-title", { hasText: "从浏览器迁移的待办" }).waitFor();
  if ((await page.getByLabel("临时笔记").inputValue()) !== "从 localStorage 迁移的笔记") {
    throw new Error("旧版 localStorage 笔记迁移失败");
  }
  const migrationMarker = await page.evaluate(() => localStorage.getItem("mydays.v1.sqlite-migrated"));
  if (!migrationMarker) throw new Error("旧版迁移完成标记不存在");

  await page.locator("#date-picker-button").click();
  if (!(await page.locator("#calendar-popover").isVisible())) throw new Error("日期选择器没有打开");
  if ((await page.locator(".calendar-day").count()) !== 42) throw new Error("月历没有渲染完整的 6 周日期");
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${screenshotDir}/calendar-desktop.png`, fullPage: true });
  const initialCalendarMonth = await page.locator("#calendar-month-label").innerText();
  await page.locator("#calendar-next-month").click();
  if ((await page.locator("#calendar-month-label").innerText()) === initialCalendarMonth) {
    throw new Error("月历切换月份失败");
  }
  await page.keyboard.press("Escape");
  if (await page.locator("#calendar-popover").isVisible()) throw new Error("Escape 没有关闭日期选择器");

  await page.locator("#date-picker-button").click();
  await page.locator(".calendar-day[data-date=\"2026-08-11\"]").click();
  if (!(await page.locator("#date-label").innerText()).includes("8月11日")) throw new Error("选择日期后顶部日期没有更新");
  if ((await page.getByLabel("临时笔记").inputValue()) !== "") throw new Error("选择日期后没有切换对应日期数据");
  await page.locator("#date-picker-button").click();
  await page.locator(".calendar-day[data-date=\"2026-08-12\"]").click();
  if ((await page.getByLabel("临时笔记").inputValue()) !== "从 localStorage 迁移的笔记") {
    throw new Error("月历切回原日期后数据没有恢复");
  }

  await page.locator("#date-picker-button").click();
  await page.locator(".welcome-copy").click({ position: { x: 4, y: 4 } });
  if (await page.locator("#calendar-popover").isVisible()) throw new Error("点击月历外部没有关闭日期选择器");

  await page.getByRole("link", { name: "待办事项" }).click();
  if (new URL(page.url()).pathname !== "/tasks") throw new Error("待办页面 URL 不正确");
  if ((await page.title()) !== "MyDays · 待办事项") throw new Error("待办页面标题不正确");
  if (!(await page.locator(".task-panel").isVisible()) || (await page.locator(".timeline-panel").isVisible())) {
    throw new Error("待办页面内容隔离不正确");
  }

  await page.locator("#project-select-trigger").click();
  await page.getByRole("button", { name: "管理项目" }).click();
  await page.locator("#project-new-name").fill("自定义研发项目");
  await page.getByRole("button", { name: "添加项目" }).click();
  await page.locator(".project-option-row[data-name='自定义研发项目']").waitFor();
  await page.locator("#project-dialog-done").click();
  await page.locator("#project-select-trigger").click();
  await page.locator("#project-select-menu [data-value='自定义研发项目']").click();
  await page.locator("#priority-select-trigger").click();
  await page.locator("#priority-select-menu [data-value='high']").click();
  await page.getByPlaceholder("写下需要完成的事，按 Enter 保存…").fill("完成 MyDays 第一版");
  await page.getByRole("button", { name: "添加" }).click();
  await page.locator(".task-title", { hasText: "完成 MyDays 第一版" }).waitFor();
  if ((await page.locator("#task-count").innerText()) !== "1") throw new Error("待办计数不正确");

  await page.getByRole("button", { name: "完成待办：完成 MyDays 第一版" }).click();
  if ((await page.locator("#task-count").innerText()) !== "0") throw new Error("完成后的待办计数不正确");
  if ((await page.locator("#score-number").innerText()) !== "100%") throw new Error("完成度不正确");

  await page.getByRole("link", { name: "工作时间线" }).click();
  if (new URL(page.url()).pathname !== "/timeline") throw new Error("时间线页面 URL 不正确");
  if (!(await page.locator(".timeline-panel").isVisible()) || (await page.locator(".task-panel").isVisible())) {
    throw new Error("时间线页面内容隔离不正确");
  }
  await page.locator(".timeline-content p", { hasText: "完成 MyDays 第一版" }).waitFor();
  await page.getByPlaceholder("记录刚刚完成的工作，按 Enter 保存…").fill("检查移动端布局");
  await page.getByRole("button", { name: "添加" }).click();
  await page.locator(".timeline-content p", { hasText: "检查移动端布局" }).waitFor();
  const autoReviewAfterLog = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (!autoReviewAfterLog.data.reviews["2026-08-12"]?.wins.includes("检查移动端布局")) {
    throw new Error("新增工作记录后今日复盘没有自动同步");
  }
  await page.getByRole("link", { name: "今日复盘" }).click();
  await page.locator("#review-wins").fill("这是我手工修改的复盘");
  await page.waitForTimeout(500);
  await page.getByRole("link", { name: "工作时间线" }).click();
  await page.getByPlaceholder("记录刚刚完成的工作，按 Enter 保存…").fill("手工复盘后的工作记录");
  await page.getByRole("button", { name: "添加" }).click();
  const stateAfterManualReview = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (stateAfterManualReview.data.reviews["2026-08-12"]?.wins !== "这是我手工修改的复盘") {
    throw new Error("新增工作记录覆盖了手工编辑的今日复盘");
  }

  await page.locator("#project-select-trigger").click();
  await page.getByRole("button", { name: "管理项目" }).click();
  const customProjectRow = page.locator(".project-option-row[data-name='自定义研发项目']");
  await customProjectRow.getByRole("button", { name: "上移项目：自定义研发项目" }).click();
  const renamedInput = page.locator(".project-option-row[data-name='自定义研发项目'] input");
  await renamedInput.fill("研发项目（新）");
  await page.locator("#project-dialog-title").click();
  await page.locator(".project-option-row[data-name='研发项目（新）']").waitFor();
  await page.locator("#project-dialog-done").click();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.locator("#project-select-trigger").click();
  const projectValuesAfterReload = await page.locator("#project-select-menu .capture-select-option").evaluateAll((options) => options.map((option) => option.dataset.value));
  if (projectValuesAfterReload.indexOf("研发项目（新）") !== 3) throw new Error("项目重命名或排序刷新后未保留");
  await page.locator("#project-select-menu [data-value='研发项目（新）']").click();
  await page.locator("#project-select-trigger").click();
  await page.getByRole("button", { name: "管理项目" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".project-option-row[data-name='研发项目（新）']").getByRole("button", { name: "删除项目：研发项目（新）" }).click();
  await page.locator("#project-dialog-done").click();
  if ((await page.locator("#project-select").inputValue()) !== "") throw new Error("删除当前项目后表单没有回退到无项目");
  const historyAfterOptionChanges = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  const projectHistory = [...historyAfterOptionChanges.data.tasks, ...historyAfterOptionChanges.data.logs]
    .filter((item) => item.title.includes("MyDays") || item.title.includes("移动端") || item.title.includes("手工复盘"));
  if (!projectHistory.length || projectHistory.some((item) => item.project !== "自定义研发项目")) {
    throw new Error("项目选项重命名或删除改写了历史记录");
  }

  await page.getByRole("link", { name: "今日", exact: true }).click();
  if (new URL(page.url()).pathname !== "/") throw new Error("今日页面 URL 不正确");
  await page.getByLabel("临时笔记").fill("第一版交互已经可以使用。");

  await page.getByRole("link", { name: "今日复盘" }).click();
  if (new URL(page.url()).pathname !== "/review") throw new Error("复盘页面 URL 不正确");
  if (!(await page.locator(".review-panel").isVisible()) || (await page.locator(".capture-card").isVisible())) {
    throw new Error("复盘页面内容隔离不正确");
  }
  if (await page.locator("#review-project-filter").count()) throw new Error("今日复盘不应显示项目分类");
  if ((await page.locator("#review-wins").inputValue()) !== "这是我手工修改的复盘") throw new Error("今日综合复盘没有正确加载");
  await page.getByRole("button", { name: "自动整理今日记录" }).click();
  const reviewWins = await page.locator("#review-wins").inputValue();
  if (!reviewWins.includes("从浏览器迁移的待办")
    || !reviewWins.includes("完成 MyDays 第一版")
    || !reviewWins.includes("检查移动端布局")
    || !reviewWins.includes("手工复盘后的工作记录")) {
    throw new Error("复盘自动整理结果不完整");
  }
  await page.locator("#review-blockers").fill("今日综合复盘问题");
  await page.getByRole("button", { name: "完成今日复盘" }).click();
  if (!(await page.locator("#review-state").innerText()).includes("已于")) throw new Error("复盘状态不正确");
  const savedDailyReview = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (savedDailyReview.data.reviews["2026-08-12"]?.blockers !== "今日综合复盘问题") throw new Error("今日综合复盘没有保存");
  if (Object.keys(savedDailyReview.data.projectReviews).length) throw new Error("今日复盘不应再写入项目分类数据");

  await page.getByRole("link", { name: "周期汇总" }).click();
  if (new URL(page.url()).pathname !== "/summary") throw new Error("周期汇总页面 URL 不正确");
  if (!(await page.locator("#summary-page").isVisible()) || (await page.locator(".dashboard-grid").isVisible())) {
    throw new Error("周期汇总页面内容隔离不正确");
  }
  if (!(await page.locator(".topbar").isVisible()) || !(await page.locator("#account-menu-button").isVisible())) {
    throw new Error("周期汇总页无法访问账户菜单");
  }
  if (!(await page.locator(".summary-scope-bar").isVisible())
    || !(await page.locator("#summary-project-trigger").isVisible())
    || await page.locator("#summary-project-filter").isVisible()) {
    throw new Error("周期汇总项目范围没有使用工作记录同款自定义下拉框");
  }
  const scopeFollowsDate = await page.evaluate(() => {
    const toolbar = document.querySelector(".period-toolbar");
    const scope = document.querySelector(".summary-scope-bar");
    return Boolean(toolbar && scope
      && (toolbar.compareDocumentPosition(scope) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  if (!scopeFollowsDate) {
    throw new Error("周期汇总项目范围没有放在日期选择下方");
  }
  if ((await page.locator("#summary-completed").innerText()) !== "2") throw new Error("周期完成待办汇总不正确");
  if ((await page.locator("#summary-rate").innerText()) !== "100%") throw new Error("周期完成率汇总不正确");
  if ((await page.locator("#summary-logs").innerText()) !== "3") throw new Error("周期工作记录汇总不正确");
  await page.locator("#summary-project-trigger").click();
  await page.locator("#summary-project-menu [data-value='自定义研发项目']").click();
  if ((await page.locator("#summary-completed").innerText()) !== "1" || (await page.locator("#summary-logs").innerText()) !== "3") throw new Error("周期汇总项目筛选不正确");
  let aiSummaryRequest = null;
  await page.route("**/api/ai/period-summary", async (route) => {
    aiSummaryRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: {
          wins: "AI 整理的周期成果",
          blockers: "AI 整理的问题与反思",
          next: "AI 整理的下一周期重点",
        },
        provider: "浏览器模拟服务",
        model: "browser-summary-model",
        latencyMs: 42,
      }),
    });
  });
  await page.getByRole("button", { name: "AI 总结" }).click();
  await page.waitForFunction(() => document.querySelector("#summary-wins")?.value === "AI 整理的周期成果");
  if (JSON.stringify(aiSummaryRequest) !== JSON.stringify({ periodType: "week", periodStart: "2026-08-10", project: "自定义研发项目" })) {
    throw new Error("周期 AI 总结请求没有使用当前规范周期");
  }
  if ((await page.locator("#summary-blockers").inputValue()) !== "AI 整理的问题与反思"
    || (await page.locator("#summary-next-actions").inputValue()) !== "AI 整理的下一周期重点") {
    throw new Error("AI 总结没有完整填入三个复盘字段");
  }
  const stateAfterAiSummary = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (stateAfterAiSummary.data.periodReviews["week:2026-08-10"]
    || stateAfterAiSummary.data.projectPeriodReviews["week:2026-08-10"]?.["自定义研发项目"]) {
    throw new Error("AI 总结结果在用户保存前被自动写入 SQLite");
  }
  await page.getByRole("button", { name: "完成周度复盘" }).click();
  await page.waitForFunction(() => document.querySelector("#summary-review-state")?.textContent?.includes("已于"));
  const savedProjectPeriodReview = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (savedProjectPeriodReview.data.projectPeriodReviews["week:2026-08-10"]?.["自定义研发项目"]?.wins !== "AI 整理的周期成果") {
    throw new Error("项目周期复盘没有独立保存");
  }
  await page.evaluate(() => {
    document.querySelector("#summary-wins").value = "";
    document.querySelector("#summary-blockers").value = "";
    document.querySelector("#summary-next-actions").value = "";
  });
  await page.locator("#summary-project-trigger").click();
  await page.locator("#summary-project-menu [data-value='']").click();
  if ((await page.locator("#summary-wins").inputValue()) !== "") throw new Error("项目周期复盘内容泄漏到全部项目复盘");
  await page.getByRole("button", { name: "每月" }).click();
  if (!(await page.locator("#summary-period-label").innerText()).includes("8月")) throw new Error("月度周期切换失败");
  await page.getByRole("button", { name: "每季度" }).click();
  if (!(await page.locator("#summary-period-label").innerText()).includes("第3季度")) throw new Error("季度周期边界不正确");
  await page.getByRole("button", { name: "每年" }).click();
  if ((await page.locator("#summary-period-label").innerText()) !== "2026年") throw new Error("年度周期边界不正确");
  await page.getByRole("button", { name: "每周" }).click();
  await page.evaluate(() => {
    summaryAnchor = new Date(2025, 11, 29);
    renderSummary();
  });
  if ((await page.locator("#summary-period-label").innerText()) !== "2026年第1周") throw new Error("跨年 ISO 周编号不正确");
  const crossYearRange = await page.locator("#summary-period-range").innerText();
  if (!crossYearRange.includes("2025/12/29") || !crossYearRange.includes("2026/1/4")) throw new Error("跨年周边界不正确");
  await page.getByRole("button", { name: "回到本周期" }).click();
  const leapBoundaries = await page.evaluate(() => {
    summaryPeriod = "month";
    summaryAnchor = new Date(2024, 1, 14);
    const month = getSummaryContext();
    summaryPeriod = "quarter";
    summaryAnchor = new Date(2024, 10, 14);
    const quarter = getSummaryContext();
    summaryPeriod = "year";
    summaryAnchor = new Date(2024, 6, 1);
    const year = getSummaryContext();
    summaryPeriod = "week";
    summaryAnchor = new Date();
    renderSummary();
    return {
      month: [month.startKey, month.endKey, month.days.length],
      quarter: [quarter.startKey, quarter.endKey],
      year: [year.startKey, year.endKey, year.days.length],
    };
  });
  if (JSON.stringify(leapBoundaries.month) !== JSON.stringify(["2024-02-01", "2024-02-29", 29])) throw new Error("闰年二月边界不正确");
  if (JSON.stringify(leapBoundaries.quarter) !== JSON.stringify(["2024-10-01", "2024-12-31"])) throw new Error("季度边界不正确");
  if (JSON.stringify(leapBoundaries.year) !== JSON.stringify(["2024-01-01", "2024-12-31", 366])) throw new Error("闰年年度边界不正确");
  await page.getByRole("button", { name: "下一个周期" }).click();
  await page.getByRole("button", { name: "下一个周期" }).click();
  await page.getByRole("button", { name: "下一个周期" }).click();
  const crossMonthRange = await page.locator("#summary-period-range").innerText();
  if (!crossMonthRange.includes("8/31") || !crossMonthRange.includes("9/6")) throw new Error("跨月周边界不正确");
  await page.getByRole("button", { name: "回到本周期" }).click();
  await page.getByRole("button", { name: "快速初稿" }).click();
  if (!(await page.locator("#summary-wins").inputValue()).includes("完成 MyDays 第一版")) {
    throw new Error("周期复盘自动初稿不完整");
  }
  await page.locator("#summary-blockers").fill("继续检查数据边界。");
  await page.getByRole("button", { name: "完成周度复盘" }).click();
  await page.waitForFunction(() => document.querySelector("#summary-review-state")?.textContent?.includes("已于"));
  if (!(await page.locator("#summary-review-state").innerText()).includes("已于")) throw new Error("周期复盘状态不正确");
  const currentWeekLabel = await page.locator("#summary-period-label").innerText();
  await page.getByRole("button", { name: "上一个周期" }).click();
  if ((await page.locator("#summary-period-label").innerText()) === currentWeekLabel) throw new Error("上一周期导航失败");
  await page.getByRole("button", { name: "回到本周期" }).click();
  if ((await page.locator("#summary-period-label").innerText()) !== currentWeekLabel) throw new Error("回到本周期失败");

  await page.reload();
  await page.waitForLoadState("networkidle");
  if (new URL(page.url()).pathname !== "/summary" || !(await page.locator("#summary-page").isVisible())) {
    throw new Error("周期汇总子页面刷新后路由丢失");
  }
  if ((await page.locator("#summary-blockers").inputValue()) !== "继续检查数据边界。") {
    throw new Error("周期复盘刷新后没有从 SQLite 恢复");
  }
  await page.getByRole("link", { name: "待办事项" }).click();
  await page.locator(".task-title", { hasText: "完成 MyDays 第一版" }).waitFor();
  await page.getByRole("link", { name: "工作时间线" }).click();
  await page.getByRole("link", { name: "今日复盘" }).click();
  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/timeline");
  if (!(await page.locator(".timeline-panel").isVisible())) throw new Error("浏览器后退未恢复时间线页面");
  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/tasks");
  if (!(await page.locator(".task-panel").isVisible())) throw new Error("浏览器后退未恢复待办页面");
  await page.getByRole("link", { name: "今日", exact: true }).click();
  if ((await page.getByLabel("临时笔记").inputValue()) !== "第一版交互已经可以使用。") {
    throw new Error("刷新后 SQLite 笔记没有保留");
  }
  const serverState = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (!serverState.data.tasks.some((task) => task.title === "完成 MyDays 第一版")) {
    throw new Error("服务器 SQLite 中没有新增待办");
  }
  if (serverState.data.notes["2026-08-12"] !== "第一版交互已经可以使用。") {
    throw new Error("服务器 SQLite 中没有临时笔记");
  }

  await page.locator("#account-menu-button").click();
  if (!(await page.locator("#ai-settings-link").isVisible())) throw new Error("账户菜单中没有 AI 设置入口");
  await page.locator("#ai-settings-link").click();
  if (new URL(page.url()).pathname !== "/ai-settings" || !(await page.locator("#ai-settings-page").isVisible())) {
    throw new Error("AI 设置独立页面路由失败");
  }
  if (!(await page.locator(".topbar").isVisible()) || !(await page.locator("#account-menu-button").isVisible())) {
    throw new Error("AI 设置页无法访问账户菜单");
  }
  if ((await page.locator(".nav-list > .nav-item").count()) !== 5) {
    throw new Error("桌面端主导航应只包含五个工作栏目");
  }
  if ((await page.locator(".nav-item[aria-current=\"page\"]").count()) !== 0
    || (await page.locator("#ai-settings-link").getAttribute("aria-current")) !== "page") {
    throw new Error("AI 设置页激活状态不正确");
  }
  const settingsStructure = await page.evaluate(() => {
    const link = document.querySelector("#ai-settings-link");
    let modifiedClickPrevented = null;
    link.addEventListener("click", (event) => { modifiedClickPrevented = event.defaultPrevented; }, { once: true });
    link.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    }));
    return {
      href: link.getAttribute("href"),
      parentIsAccountMenu: link.parentElement?.id === "account-menu",
      modifiedClickPrevented,
    };
  });
  if (settingsStructure.href !== "/ai-settings" || !settingsStructure.parentIsAccountMenu) {
    throw new Error("AI 设置入口不是用户菜单中的独立真实链接");
  }
  if (settingsStructure.modifiedClickPrevented !== false) throw new Error("AI 设置入口错误拦截了修饰键点击");
  await page.locator("#ai-provider-name").fill("浏览器测试服务");
  await page.locator("#ai-provider-base-url").fill("http://127.0.0.1:3000/v1");
  await page.locator("#ai-provider-model").fill("browser-test-model");
  await page.locator("#ai-provider-api-key").fill("browser-secret-key");
  await page.getByRole("button", { name: "保存配置" }).click();
  await page.locator(".ai-test-result.success").waitFor();
  if ((await page.locator("#ai-provider-api-key").inputValue()) !== "") throw new Error("保存后 API Key 输入框未清空");
  const aiProjection = await page.evaluate(() => fetch("/api/ai/providers").then((response) => response.json()));
  if (JSON.stringify(aiProjection).includes("browser-secret-key")) throw new Error("AI 配置响应泄露 API Key");
  if (await page.locator("#ai-fetch-models").isDisabled()) throw new Error("已保存且有 Key 的服务未启用获取模型");
  await page.locator("#ai-summary-prompt").fill("优先突出业务价值和下周风险。");
  await page.locator("#ai-prompt-save").click();
  await page.waitForFunction(() => document.querySelector("#ai-prompt-mode")?.textContent === "已自定义");
  await page.reload();
  await page.waitForLoadState("networkidle");
  if (!(await page.locator(".ai-provider-item", { hasText: "浏览器测试服务" }).isVisible())) {
    throw new Error("AI 服务配置刷新后未保留");
  }
  if ((await page.locator("#ai-summary-prompt").inputValue()) !== "优先突出业务价值和下周风险。") throw new Error("自定义 AI 总结撮要刷新后未恢复");
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#ai-prompt-reset").click();
  await page.waitForFunction(() => document.querySelector("#ai-prompt-mode")?.textContent === "默认");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${screenshotDir}/desktop.png`, fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.addInitScript(({ now }) => {
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [now]));
      }
      static now() { return now; }
    }
    Object.setPrototypeOf(FixedDate, NativeDate);
    globalThis.Date = FixedDate;
  }, { now: fixedNow });
  await mobile.goto(`${baseUrl}/tasks`);
  await mobile.waitForLoadState("networkidle");
  if (!(await mobile.locator(".sidebar").isVisible()) || !(await mobile.locator("#capture-input").isVisible())) {
    throw new Error("移动端核心界面不可见");
  }
  const mobileMainBox = await mobile.locator(".main-content").boundingBox();
  if (!mobileMainBox || mobileMainBox.x !== 0 || mobileMainBox.width < 389) {
    throw new Error("移动端主内容仍受桌面侧栏偏移影响");
  }
  await mobile.locator("#project-select-trigger").click();
  await mobile.getByRole("button", { name: "管理项目" }).click();
  const mobileDialogBox = await mobile.locator(".project-dialog-card").boundingBox();
  if (!mobileDialogBox || mobileDialogBox.x < 0 || mobileDialogBox.x + mobileDialogBox.width > 390) {
    throw new Error("移动端项目管理弹窗超出 390px 视口");
  }
  await mobile.locator("#project-dialog-done").click();
  await mobile.locator("#date-picker-button").click();
  const mobileCalendarBox = await mobile.locator("#calendar-popover").boundingBox();
  if (!mobileCalendarBox || mobileCalendarBox.x < 0 || mobileCalendarBox.x + mobileCalendarBox.width > 390) {
    throw new Error("移动端月历超出 390px 视口");
  }
  const lastCalendarDayBox = await mobile.locator(".calendar-day").last().boundingBox();
  if (!lastCalendarDayBox || lastCalendarDayBox.x + lastCalendarDayBox.width > mobileCalendarBox.x + mobileCalendarBox.width) {
    throw new Error("移动端月历日期格被裁切");
  }
  await mobile.waitForTimeout(220);
  await mobile.screenshot({ path: `${screenshotDir}/calendar-mobile.png`, fullPage: true });
  await mobile.keyboard.press("Escape");
  await mobile.getByRole("link", { name: "工作时间线" }).click();
  if (new URL(mobile.url()).pathname !== "/timeline" || !(await mobile.locator(".timeline-panel").isVisible())) {
    throw new Error("移动端独立页面导航失败");
  }
  await mobile.getByRole("link", { name: "周期汇总" }).click();
  const summaryPageBox = await mobile.locator("#summary-page").boundingBox();
  if (!summaryPageBox || summaryPageBox.x < 0 || summaryPageBox.x + summaryPageBox.width > 390) {
    throw new Error("移动端周期汇总超出 390px 视口");
  }
  if (!(await mobile.getByRole("button", { name: "AI 总结" }).isVisible())) throw new Error("移动端 AI 总结入口不可见");
  const mobileScopeBox = await mobile.locator(".summary-scope-bar").boundingBox();
  if (!mobileScopeBox || mobileScopeBox.x < 0 || mobileScopeBox.x + mobileScopeBox.width > 390) {
    throw new Error("移动端项目汇总范围控件超出 390px 视口");
  }
  await mobile.locator("#summary-project-trigger").click();
  const mobileProjectMenuBox = await mobile.locator("#summary-project-menu").boundingBox();
  if (!mobileProjectMenuBox || mobileProjectMenuBox.x < 0 || mobileProjectMenuBox.x + mobileProjectMenuBox.width > 390) {
    throw new Error("移动端项目下拉菜单超出 390px 视口");
  }
  await mobile.locator("#summary-project-menu [data-value='自定义研发项目']").click();
  if ((await mobile.locator("#summary-project-filter").inputValue()) !== "自定义研发项目") {
    throw new Error("移动端自定义项目下拉无法切换项目");
  }
  const summaryActionsBox = await mobile.locator(".summary-review-actions").boundingBox();
  if (!summaryActionsBox || summaryActionsBox.x < 0 || summaryActionsBox.x + summaryActionsBox.width > 390) {
    throw new Error("移动端 AI 总结操作区超出 390px 视口");
  }
  await mobile.locator("#account-menu-button").click();
  await mobile.locator("#ai-settings-link").click();
  const aiSettingsBox = await mobile.locator("#ai-settings-page").boundingBox();
  if (!aiSettingsBox || aiSettingsBox.x < 0 || aiSettingsBox.x + aiSettingsBox.width > 390) {
    throw new Error("移动端 AI 设置超出 390px 视口");
  }
  if ((await mobile.locator(".nav-item").count()) !== 5) throw new Error("移动端主导航应只包含五个工作栏目");
  const mobileNavBox = await mobile.locator(".sidebar").boundingBox();
  if (!mobileNavBox) throw new Error("移动端底部导航不可见");
  if ((await mobile.locator("#ai-settings-link").getAttribute("aria-current")) !== "page") {
    throw new Error("移动端设置入口没有表达当前页面状态");
  }
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (mobileOverflow > 1) throw new Error(`移动端页面存在 ${mobileOverflow}px 横向溢出`);
  await mobile.locator(".ai-editor-actions").scrollIntoViewIfNeeded();
  const visibleActionsBox = await mobile.locator(".ai-editor-actions").boundingBox();
  if (!visibleActionsBox) throw new Error("移动端 AI 页面底部操作不可见");
  await mobile.screenshot({ path: `${screenshotDir}/mobile.png`, fullPage: true });

  if (consoleErrors.length) throw new Error(`控制台错误：${consoleErrors.join(" | ")}`);
  console.log("MyDays smoke test passed");
  console.log(`${screenshotDir}/desktop.png`);
  console.log(`${screenshotDir}/mobile.png`);
  await browser.close();
  browser = null;
})().catch((error) => {
  console.error(error);
  if (browser) browser.close().catch(() => {});
  process.exitCode = 1;
});
