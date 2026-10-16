const { chromium } = require("playwright");
const fs = require("node:fs");

const screenshotDir = "/tmp/mydays-smoke";
const baseUrl = process.env.MYDAYS_TEST_URL ?? "http://127.0.0.1:4173";
fs.mkdirSync(screenshotDir, { recursive: true });

let browser;

function readStoredZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compression = buffer.readUInt16LE(offset + 8);
    if (compression !== 0) throw new Error("测试读取器只接受未压缩的 XLSX ZIP 条目");
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    entries.set(name, buffer.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  if (buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) < 0) {
    throw new Error("Excel 导出缺少 ZIP 目录结束记录");
  }
  return entries;
}

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
    if (message.type() === "error") {
      const location = message.location().url;
      consoleErrors.push(`${message.text()}${location ? ` · ${location}` : ""}`);
    }
  });

  await page.goto(baseUrl);
  await page.waitForLoadState("networkidle");
  const initialState = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (!initialState.empty || initialState.revision !== 0) {
    throw new Error("浏览器测试必须使用全新的隔离 SQLite 数据库");
  }
  // Seed the isolated database through the same whole-state endpoint that backup import uses.
  await page.evaluate(() => fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: 0, data: {
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
    } }),
  }).then((response) => { if (!response.ok) throw new Error(`seed failed: ${response.status}`); }));
  await page.reload();
  await page.waitForLoadState("networkidle");

  if (!(await page.locator("#workbench-overview").isVisible()) || (await page.locator(".dashboard-grid").isVisible())) {
    throw new Error("工作台没有隔离完整待办、时间线和复盘面板");
  }
  if ((await page.title()) !== "MyDays · 工作台"
    || (await page.getByRole("link", { name: "工作台", exact: true }).getAttribute("aria-current")) !== "page") {
    throw new Error("工作台命名或激活状态不正确");
  }
  if ((await page.locator("#overview-task-count").innerText()) !== "0"
    || (await page.locator("#overview-log-count").innerText()) !== "0"
    || (await page.locator("#overview-review-status").innerText()) !== "待复盘") {
    throw new Error("工作台初始摘要不正确");
  }
  if ((await page.getByLabel("临时笔记").inputValue()) !== "从 localStorage 迁移的笔记") {
    throw new Error("种子数据中的临时笔记没有显示");
  }

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
  await page.locator(".task-title", { hasText: "从浏览器迁移的待办" }).waitFor();

  const polishRequests = [];
  let signalDelayedPolish;
  let releaseDelayedPolish;
  const delayedPolishStarted = new Promise((resolve) => { signalDelayedPolish = resolve; });
  await page.route("**/api/ai/polish-entry", async (route) => {
    const body = route.request().postDataJSON();
    polishRequests.push(body);
    if (body.text.includes("等待返回")) {
      signalDelayedPolish();
      await new Promise((resolve) => { releaseDelayedPolish = resolve; });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        polished: body.text.replace("尽快的", "尽快"),
        provider: "浏览器模拟服务",
        model: "browser-polish-model",
        latencyMs: 42,
      }),
    });
  });

  const captureInput = page.locator("#capture-input");
  await captureInput.fill("等待返回的原文");
  await page.getByRole("button", { name: "AI 润色" }).click();
  await delayedPolishStarted;
  await captureInput.fill("用户已经修改原文");
  releaseDelayedPolish();
  await page.waitForTimeout(80);
  if ((await captureInput.inputValue()) !== "用户已经修改原文" || await page.locator("#capture-polish-suggestion").isVisible()) {
    throw new Error("过期的 AI 润色结果覆盖了用户新输入");
  }

  await captureInput.fill("8月20日前尽快的完成 MyDays v2.1 登录页修复");
  await page.getByRole("button", { name: "AI 润色" }).click();
  await page.locator("#capture-polish-suggestion").waitFor();
  if ((await captureInput.inputValue()) !== "8月20日前尽快的完成 MyDays v2.1 登录页修复") {
    throw new Error("AI 润色预览提前覆盖了原文");
  }
  await page.getByRole("button", { name: "取消" }).click();
  if ((await captureInput.inputValue()) !== "8月20日前尽快的完成 MyDays v2.1 登录页修复") {
    throw new Error("取消 AI 润色后原文发生变化");
  }
  const taskCountBeforeAdopt = await page.evaluate(() => state.tasks.length);
  await page.getByRole("button", { name: "AI 润色" }).click();
  await page.locator("#capture-polish-suggestion").waitFor();
  await page.getByRole("button", { name: "采用" }).click();
  if ((await captureInput.inputValue()) !== "8月20日前尽快完成 MyDays v2.1 登录页修复") {
    throw new Error("采用 AI 润色建议后没有替换输入文本");
  }
  if ((await page.evaluate(() => state.tasks.length)) !== taskCountBeforeAdopt) {
    throw new Error("采用 AI 润色建议时自动添加了待办");
  }
  if (polishRequests.at(-1)?.type !== "task") throw new Error("待办润色请求类型不正确");

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
  const createdTask = page.locator(".task-item", { hasText: "完成 MyDays 第一版" });
  if ((await createdTask.locator(".item-action").count()) !== 2
    || (await createdTask.locator(".edit-entry").getAttribute("class")) !== "item-action edit-entry"
    || !(await createdTask.locator(".delete-task").getAttribute("class")).includes("item-action danger")) {
    throw new Error("待办编辑和删除按钮没有使用统一样式");
  }
  const taskActionSizes = await createdTask.locator(".item-action").evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return [box.width, box.height];
  }));
  if (taskActionSizes.some(([width, height]) => width !== taskActionSizes[0][0] || height !== taskActionSizes[0][1])) {
    throw new Error("待办编辑和删除按钮尺寸不一致");
  }
  await createdTask.getByRole("button", { name: "编辑待办：完成 MyDays 第一版" }).click();
  await page.locator(".entry-edit-title").fill("这次修改不应保存");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  if (!(await createdTask.locator(".task-title").innerText()).includes("完成 MyDays 第一版")) {
    throw new Error("取消待办编辑后原内容发生变化");
  }
  await createdTask.getByRole("button", { name: "编辑待办：完成 MyDays 第一版" }).click();
  await page.locator(".entry-edit-title").fill("尚未保存的编辑草稿");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator(".task-item", { hasText: "从浏览器迁移的待办" })
    .getByRole("button", { name: "编辑待办：从浏览器迁移的待办" })
    .click();
  if ((await page.locator(".entry-edit-title").inputValue()) !== "尚未保存的编辑草稿") {
    throw new Error("切换编辑目标时静默丢失了未保存内容");
  }
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await createdTask.getByRole("button", { name: "编辑待办：完成 MyDays 第一版" }).click();
  await page.locator(".entry-edit-title").fill("完成 MyDays 第一版验收");
  await page.locator("[data-entry-edit-select][data-field='priority'] .capture-select-trigger").click();
  await page.locator("[data-entry-edit-select][data-field='priority'] [data-value='low']").click();
  await page.screenshot({ path: "/tmp/mydays-smoke/inline-edit-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.locator(".task-title", { hasText: "完成 MyDays 第一版验收" }).waitFor();
  const editedTaskState = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  const editedTask = editedTaskState.data.tasks.find((task) => task.title === "完成 MyDays 第一版验收");
  if (!editedTask || editedTask.priority !== "low" || editedTask.project !== "自定义研发项目") {
    throw new Error("待办原位置编辑没有保存标题、项目或优先级");
  }
  await page.getByPlaceholder("写下需要完成的事，按 Enter 保存…").fill("临时删除待办");
  await page.getByRole("button", { name: "添加" }).click();
  const disposableTask = page.locator(".task-item", { hasText: "临时删除待办" });
  page.once("dialog", (dialog) => dialog.accept());
  await disposableTask.getByRole("button", { name: "删除待办：临时删除待办" }).click();
  if (await page.locator(".task-title", { hasText: "临时删除待办" }).count()) {
    throw new Error("待办删除功能失效");
  }

  await page.getByRole("link", { name: "工作台", exact: true }).click();
  if (new URL(page.url()).pathname !== "/" || (await page.locator("#overview-task-list .overview-item").count()) !== 1) {
    throw new Error("工作台未显示新增的待办摘要");
  }
  if (!(await page.locator("#overview-task-list").innerText()).includes("完成 MyDays 第一版验收")) {
    throw new Error("工作台待办摘要内容不正确");
  }
  await page.evaluate(() => {
    const now = new Date().toISOString();
    for (let index = 0; index < 3; index += 1) {
      state.tasks.push({ id: `overview-limit-${index}`, date: selectedDate, title: `临时摘要 ${index}`, project: "", priority: "normal", completed: false, createdAt: now });
    }
    renderOverview();
  });
  if ((await page.locator("#overview-task-list .overview-item").count()) !== 3) throw new Error("工作台待办摘要超过 3 条");
  await page.evaluate(() => {
    state.tasks = state.tasks.filter((task) => !task.id.startsWith("overview-limit-"));
    renderOverview();
  });
  const overviewTaskLink = page.locator(".overview-task-card [data-app-link]");
  const modifiedOverviewClickPrevented = await overviewTaskLink.evaluate((link) => {
    let prevented = null;
    link.addEventListener("click", (event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    return prevented;
  });
  if (modifiedOverviewClickPrevented !== false) throw new Error("工作台摘要错误拦截了修饰键点击");
  await overviewTaskLink.click();
  if (new URL(page.url()).pathname !== "/tasks" || !(await page.locator(".task-panel").isVisible())) {
    throw new Error("工作台待办入口没有无刷新进入专属页面");
  }

  await page.getByRole("button", { name: "完成待办：完成 MyDays 第一版验收" }).click();
  if ((await page.locator("#task-count").innerText()) !== "0") throw new Error("完成后的待办计数不正确");
  if ((await page.locator("#score-number").innerText()) !== "100%") throw new Error("完成度不正确");

  await page.getByRole("link", { name: "工作时间线" }).click();
  if (new URL(page.url()).pathname !== "/timeline") throw new Error("时间线页面 URL 不正确");
  if (!(await page.locator(".timeline-panel").isVisible()) || (await page.locator(".task-panel").isVisible())) {
    throw new Error("时间线页面内容隔离不正确");
  }
  await page.locator(".timeline-content p", { hasText: "完成 MyDays 第一版验收" }).waitFor();
  const autoLog = page.locator(".timeline-item.auto", { hasText: "完成 MyDays 第一版验收" });
  await autoLog.getByRole("button", { name: "编辑工作记录：完成 MyDays 第一版验收" }).click();
  if (!(await page.locator(".entry-edit-hint").innerText()).includes("来源")) {
    throw new Error("自动完成记录编辑时没有说明来源待办");
  }
  await page.locator(".entry-edit-title").fill("完成 MyDays 第一版验收（已复核）");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.locator(".timeline-content p", { hasText: "完成 MyDays 第一版验收（已复核）" }).waitFor();
  const autoEditState = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  const sourceTask = autoEditState.data.tasks.find((task) => task.title === "完成 MyDays 第一版验收（已复核）");
  const sourceLogs = autoEditState.data.logs.filter((log) => log.sourceTaskId === sourceTask?.id);
  if (!sourceTask || sourceLogs.length !== 1 || sourceLogs[0].title !== sourceTask.title || sourceLogs[0].project !== sourceTask.project) {
    throw new Error("自动完成记录没有通过来源待办同步更新");
  }
  await page.getByPlaceholder("记录刚刚完成的工作，按 Enter 保存…").fill("检查移动端布局");
  await page.getByRole("button", { name: "AI 润色" }).click();
  await page.locator("#capture-polish-suggestion").waitFor();
  if (polishRequests.at(-1)?.type !== "log") throw new Error("工作记录润色请求类型不正确");
  await page.getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: "添加" }).click();
  await page.locator(".timeline-content p", { hasText: "检查移动端布局" }).waitFor();
  const manualLog = page.locator(".timeline-item", { hasText: "检查移动端布局" });
  await manualLog.getByRole("button", { name: "编辑工作记录：检查移动端布局" }).click();
  await page.locator(".entry-edit-title").fill("检查移动端布局与交互");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.locator(".timeline-content p", { hasText: "检查移动端布局与交互" }).waitFor();
  await page.getByPlaceholder("记录刚刚完成的工作，按 Enter 保存…").fill("临时删除记录");
  await page.getByRole("button", { name: "添加" }).click();
  const disposableLog = page.locator(".timeline-item", { hasText: "临时删除记录" });
  page.once("dialog", (dialog) => dialog.accept());
  await disposableLog.getByRole("button", { name: "删除工作记录：临时删除记录" }).click();
  if (await page.locator(".timeline-content p", { hasText: "临时删除记录" }).count()) {
    throw new Error("工作记录删除功能失效");
  }
  const autoReviewAfterLog = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if ((autoReviewAfterLog.data.reviews["2026-08-12"]?.wins ?? "").includes("检查移动端布局与交互")) {
    throw new Error("今日复盘不应再自动复述时间线中的工作记录");
  }
  await page.getByRole("link", { name: "今日复盘" }).click();
  await page.locator("#review-next").fill("这是我手工修改的复盘");
  await page.waitForTimeout(500);
  await page.getByRole("link", { name: "工作时间线" }).click();
  await page.getByPlaceholder("记录刚刚完成的工作，按 Enter 保存…").fill("手工复盘后的工作记录");
  await page.getByRole("button", { name: "添加" }).click();
  const stateAfterManualReview = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (stateAfterManualReview.data.reviews["2026-08-12"]?.next !== "这是我手工修改的复盘") {
    throw new Error("新增工作记录覆盖了手工编辑的今日复盘");
  }

  await page.locator("#project-select-trigger").click();
  await page.getByRole("button", { name: "管理项目" }).click();
  const customProjectRow = page.locator(".project-option-row[data-name='自定义研发项目']");
  await customProjectRow.getByRole("button", { name: "上移项目：自定义研发项目" }).click();
  const renamedInput = page.locator(".project-option-row[data-name='自定义研发项目'] input");
  await renamedInput.fill("研发项目（新）");
  await page.keyboard.press("Enter");
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

  await page.getByRole("link", { name: "工作台", exact: true }).click();
  if (new URL(page.url()).pathname !== "/") throw new Error("工作台 URL 不正确");
  if ((await page.locator("#overview-log-list .overview-item").count()) !== 3
    || (await page.locator("#overview-review-status").innerText()) !== "进行中") {
    throw new Error("工作台动态摘要或复盘状态不正确");
  }
  await page.screenshot({ path: `${screenshotDir}/workbench-desktop.png`, fullPage: true });
  await page.getByLabel("临时笔记").fill("第一版交互已经可以使用。");

  await page.getByRole("link", { name: "今日复盘" }).click();
  if (new URL(page.url()).pathname !== "/review") throw new Error("复盘页面 URL 不正确");
  if (!(await page.locator(".review-panel").isVisible()) || (await page.locator(".capture-card").isVisible())) {
    throw new Error("复盘页面内容隔离不正确");
  }
  if (await page.locator("#review-project-filter").count()) throw new Error("今日复盘不应显示项目分类");
  if ((await page.locator("#review-next").inputValue()) !== "这是我手工修改的复盘") throw new Error("今日综合复盘没有正确加载");
  if (await page.locator("#review-wins, #generate-review").count()) throw new Error("今日复盘不应再显示“今天完成了什么”");
  if (!(await page.locator("#review-day-summary").innerText()).includes("详见工作时间线")) throw new Error("今日复盘缺少当天记录概览");
  await page.locator("#review-blockers").fill("今日综合复盘问题");
  await page.getByRole("button", { name: "完成今日复盘" }).click();
  if (!(await page.locator("#review-state").innerText()).includes("已于")) throw new Error("复盘状态不正确");
  const savedDailyReview = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (savedDailyReview.data.reviews["2026-08-12"]?.blockers !== "今日综合复盘问题") throw new Error("今日综合复盘没有保存");
  if ("projectReviews" in savedDailyReview.data) throw new Error("项目每日复盘已移除，不应再出现在状态中");

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
  const baseAchievementCount = await page.evaluate(() => getAchievements(getSummaryContext()).length);
  await page.evaluate(() => {
    const now = new Date().toISOString();
    for (let index = 1; index <= 11; index += 1) {
      state.logs.push({
        id: `export-page-${index}`,
        date: selectedDate,
        title: index === 11 ? "分页成果 11 & <测试>" : `分页成果 ${String(index).padStart(2, "0")}`,
        project: "自定义研发项目",
        createdAt: now,
      });
    }
    renderSummary();
  });
  const exportAchievementCount = baseAchievementCount + 11;
  if ((await page.locator("#summary-achievements-count").innerText()) !== `共 ${exportAchievementCount} 项`
    || (await page.locator("#summary-achievements .summary-list-item").count()) !== 10) {
    throw new Error("主要成果跨页测试数据没有正确分页");
  }

  const exportTrigger = page.locator("#summary-export-trigger");
  const exportMenu = page.locator("#summary-export-menu");
  if (await exportMenu.isVisible() || (await exportTrigger.getAttribute("aria-expanded")) !== "false") {
    throw new Error("主要成果导出菜单初始状态不正确");
  }
  await exportTrigger.click();
  await page.waitForTimeout(20);
  if (!(await exportMenu.isVisible())
    || (await exportTrigger.getAttribute("aria-expanded")) !== "true"
    || !(await page.locator("[data-export-format='markdown']").evaluate((item) => item === document.activeElement))) {
    throw new Error("主要成果导出菜单没有展开或聚焦首个格式");
  }
  await page.keyboard.press("Escape");
  if (await exportMenu.isVisible()
    || (await exportTrigger.getAttribute("aria-expanded")) !== "false"
    || !(await exportTrigger.evaluate((trigger) => trigger === document.activeElement))) {
    throw new Error("Escape 没有关闭导出菜单并恢复焦点");
  }
  await exportTrigger.press("ArrowUp");
  await page.waitForTimeout(20);
  if (!(await page.locator("[data-export-format='excel']").evaluate((item) => item === document.activeElement))) {
    throw new Error("导出菜单键盘打开时没有按方向聚焦格式");
  }
  await page.locator("#summary-period-label").click();
  if (await exportMenu.isVisible() || (await exportTrigger.getAttribute("aria-expanded")) !== "false") {
    throw new Error("点击导出菜单外部没有关闭菜单");
  }

  await exportTrigger.click();
  const markdownDownloadPromise = page.waitForEvent("download");
  await page.locator("[data-export-format='markdown']").click();
  const markdownDownload = await markdownDownloadPromise;
  if (await exportMenu.isVisible() || !(await exportTrigger.evaluate((trigger) => trigger === document.activeElement))) {
    throw new Error("选择 Markdown 后没有关闭菜单并恢复焦点");
  }
  const markdown = fs.readFileSync(await markdownDownload.path(), "utf8");
  if (!markdownDownload.suggestedFilename().endsWith(".md")
    || !markdownDownload.suggestedFilename().includes("week-2026-08-10")
    || !markdown.includes("# MyDays · 2026年第33周主要成果")
    || !markdown.includes("项目范围：自定义研发项目")
    || !markdown.includes("分页成果 11")
    || !markdown.includes("测试")
    || markdown.includes("从浏览器迁移的待办")) {
    throw new Error("Markdown 导出没有使用当前周期、项目或完整分页成果");
  }
  if (markdown.split("完成 MyDays 第一版验收（已复核）").length - 1 !== 1
    || !markdown.includes("完成待办")
    || !markdown.includes("工作记录")) {
    throw new Error("Markdown 导出类型错误或重复导出了自动完成记录");
  }

  await exportTrigger.click();
  const excelDownloadPromise = page.waitForEvent("download");
  await page.locator("[data-export-format='excel']").click();
  const excelDownload = await excelDownloadPromise;
  const workbookPath = `${screenshotDir}/summary-achievements.xlsx`;
  await excelDownload.saveAs(workbookPath);
  const workbook = fs.readFileSync(workbookPath);
  const workbookEntries = readStoredZipEntries(workbook);
  const requiredEntries = [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/worksheets/sheet1.xml",
    "xl/styles.xml",
  ];
  if (!excelDownload.suggestedFilename().endsWith(".xlsx")
    || requiredEntries.some((name) => !workbookEntries.has(name))) {
    throw new Error("Excel 导出不是完整的标准 XLSX 容器");
  }
  const workbookXml = workbookEntries.get("xl/workbook.xml").toString("utf8");
  const sheetXml = workbookEntries.get("xl/worksheets/sheet1.xml").toString("utf8");
  if (!workbookXml.includes('sheet name="主要成果"')
    || !sheetXml.includes("日期")
    || !sheetXml.includes("项目")
    || !sheetXml.includes("类型")
    || !sheetXml.includes("主要成果")
    || !sheetXml.includes("分页成果 11 &amp; &lt;测试&gt;")
    || !sheetXml.includes("完成待办")
    || !sheetXml.includes("工作记录")
    || (sheetXml.match(/<row /g) ?? []).length !== exportAchievementCount + 1) {
    throw new Error("Excel 工作表表头、文本转义或跨页成果不完整");
  }

  await page.evaluate(() => {
    state.logs = state.logs.filter((log) => !log.id.startsWith("export-page-"));
    summaryAnchor = new Date(1999, 0, 4);
    renderSummary();
  });
  let emptyExportDownloaded = false;
  const onEmptyDownload = () => { emptyExportDownloaded = true; };
  page.on("download", onEmptyDownload);
  await exportTrigger.click();
  await page.locator("[data-export-format='markdown']").click();
  await page.waitForTimeout(80);
  page.off("download", onEmptyDownload);
  if (emptyExportDownloaded || !(await page.locator("#toast").innerText()).includes("没有可导出的主要成果")) {
    throw new Error("空成果范围仍生成了文件或没有给出提示");
  }
  await page.locator("#summary-current").click();
  let aiReportRequest = null;
  await page.route("**/api/ai/period-report", async (route) => {
    aiReportRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        report: "本周完成登录体验与移动端布局检查，下一步继续验证数据边界。",
        provider: "浏览器模拟服务",
        model: "browser-report-model",
        latencyMs: 42,
      }),
    });
  });
  await page.locator("#generate-ai-summary").click();
  await page.waitForFunction(() => document.querySelector("#summary-ai-report")?.value?.includes("本周完成登录体验"));
  if (JSON.stringify(aiReportRequest) !== JSON.stringify({ periodType: "week", periodStart: "2026-08-10", project: "自定义研发项目" })) {
    throw new Error("周期 AI 总结请求没有使用当前规范周期");
  }
  await page.waitForFunction(() => document.querySelector("#summary-review-state")?.textContent?.includes("生成并已保存"));
  const stateAfterAiReport = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (stateAfterAiReport.data.projectPeriodReports["week:2026-08-10"]?.["自定义研发项目"]?.content
    !== "本周完成登录体验与移动端布局检查，下一步继续验证数据边界。") {
    throw new Error("AI 总结生成后没有立即保存到项目周期 SQLite 数据");
  }
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.locator("#summary-project-trigger").click();
  await page.locator("#summary-project-menu [data-value='自定义研发项目']").click();
  if ((await page.locator("#summary-ai-report").inputValue()) !== "本周完成登录体验与移动端布局检查，下一步继续验证数据边界。") {
    throw new Error("AI 总结刷新后没有从 SQLite 恢复");
  }
  await page.locator("#summary-blockers").fill("自定义研发项目问题");
  await page.getByRole("button", { name: "完成周度复盘" }).click();
  await page.waitForFunction(() => document.querySelector("#summary-review-state")?.textContent?.includes("已于"));
  const savedProjectPeriodReview = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (savedProjectPeriodReview.data.projectPeriodReviews["week:2026-08-10"]?.["自定义研发项目"]?.blockers !== "自定义研发项目问题") {
    throw new Error("项目周期复盘没有独立保存");
  }
  await page.locator("#summary-project-trigger").click();
  await page.locator("#summary-project-menu [data-value='']").click();
  if ((await page.locator("#summary-ai-report").inputValue()) !== ""
    || (await page.locator("#summary-blockers").inputValue()) === "自定义研发项目问题") {
    throw new Error("项目周期 AI 总结或复盘内容泄漏到全部项目范围");
  }
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
  if (await page.locator("#summary-wins, #summary-next-actions").count()) throw new Error("周期复盘不应再重复显示成果和下一周期重点");
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
  await page.locator(".task-title", { hasText: "完成 MyDays 第一版验收（已复核）" }).waitFor();
  await page.getByRole("link", { name: "工作时间线" }).click();
  await page.getByRole("link", { name: "今日复盘" }).click();
  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/timeline");
  if (!(await page.locator(".timeline-panel").isVisible())) throw new Error("浏览器后退未恢复时间线页面");
  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/tasks");
  if (!(await page.locator(".task-panel").isVisible())) throw new Error("浏览器后退未恢复待办页面");
  await page.getByRole("link", { name: "工作台", exact: true }).click();
  if ((await page.locator("#overview-review-status").innerText()) !== "已完成") {
    throw new Error("工作台没有显示已完成的复盘状态");
  }
  if ((await page.getByLabel("临时笔记").inputValue()) !== "第一版交互已经可以使用。") {
    throw new Error("刷新后 SQLite 笔记没有保留");
  }
  const serverState = await page.evaluate(() => fetch("/api/state").then((response) => response.json()));
  if (!serverState.data.tasks.some((task) => task.title === "完成 MyDays 第一版验收（已复核）")) {
    throw new Error("服务器 SQLite 中没有新增待办");
  }
  if (serverState.data.notes["2026-08-12"] !== "第一版交互已经可以使用。") {
    throw new Error("服务器 SQLite 中没有临时笔记");
  }

  await page.locator("#account-menu-button").click();
  if (!(await page.locator("#ai-settings-link").isVisible())) throw new Error("账户菜单中没有 AI 设置入口");
  await page.locator("#ai-settings-link").click();
  if (new URL(page.url()).pathname !== "/settings" || !(await page.locator("#ai-settings-page").isVisible())) {
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
    link.addEventListener("click", (event) => {
      modifiedClickPrevented = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
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
  if (settingsStructure.href !== "/settings" || !settingsStructure.parentIsAccountMenu) {
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
  await mobile.goto(baseUrl);
  await mobile.waitForLoadState("networkidle");
  if (!(await mobile.locator("#workbench-overview").isVisible()) || (await mobile.locator(".dashboard-grid").isVisible())) {
    throw new Error("移动端工作台概览不可见");
  }
  const mobileOverviewBox = await mobile.locator("#workbench-overview").boundingBox();
  if (!mobileOverviewBox || mobileOverviewBox.x < 0 || mobileOverviewBox.x + mobileOverviewBox.width > 390) {
    throw new Error("移动端工作台超出 390px 视口");
  }
  await mobile.screenshot({ path: `${screenshotDir}/workbench-mobile.png`, fullPage: true });
  await mobile.getByRole("link", { name: "待办事项" }).click();
  if (!(await mobile.locator(".sidebar").isVisible()) || !(await mobile.locator("#capture-input").isVisible())) {
    throw new Error("移动端核心界面不可见");
  }
  const mobileMainBox = await mobile.locator(".main-content").boundingBox();
  if (!mobileMainBox || mobileMainBox.x !== 0 || mobileMainBox.width < 389) {
    throw new Error("移动端主内容仍受桌面侧栏偏移影响");
  }
  const mobileEditedTask = mobile.locator(".task-item", { hasText: "完成 MyDays 第一版验收（已复核）" });
  if (!(await mobileEditedTask.locator(".edit-entry").isVisible()) || !(await mobileEditedTask.locator(".delete-task").isVisible())) {
    throw new Error("移动端待办编辑或删除入口不可见");
  }
  await mobileEditedTask.getByRole("button", { name: "编辑待办：完成 MyDays 第一版验收（已复核）" }).click();
  const mobileEditFormBox = await mobile.locator(".entry-edit-form").boundingBox();
  if (!mobileEditFormBox || mobileEditFormBox.x < 0 || mobileEditFormBox.x + mobileEditFormBox.width > 390) {
    throw new Error("移动端原位置编辑表单超出 390px 视口");
  }
  await mobile.locator("[data-entry-edit-select][data-field='project'] .capture-select-trigger").click();
  const mobileEditMenuBox = await mobile.locator("[data-entry-edit-select][data-field='project'] .capture-select-menu").boundingBox();
  if (!mobileEditMenuBox || mobileEditMenuBox.x < 0 || mobileEditMenuBox.x + mobileEditMenuBox.width > 390) {
    throw new Error("移动端编辑项目下拉超出 390px 视口");
  }
  await mobile.screenshot({ path: "/tmp/mydays-smoke/inline-edit-mobile.png", fullPage: true });
  await mobile.keyboard.press("Escape");
  await mobile.getByRole("button", { name: "取消", exact: true }).click();
  await mobile.route("**/api/ai/polish-entry", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        polished: body.text.replace("尽快的", "尽快"),
        provider: "移动端模拟服务",
        model: "mobile-polish-model",
        latencyMs: 28,
      }),
    });
  });
  await mobile.locator("#capture-input").fill("8月20日前尽快的完成 MyDays v2.1 登录页修复");
  await mobile.getByRole("button", { name: "AI 润色" }).click();
  await mobile.locator("#capture-polish-suggestion").waitFor();
  const mobilePolishBox = await mobile.locator("#capture-polish-suggestion").boundingBox();
  if (!mobilePolishBox || mobilePolishBox.x < 0 || mobilePolishBox.x + mobilePolishBox.width > 390) {
    throw new Error("移动端 AI 润色建议区超出 390px 视口");
  }
  await mobile.getByRole("button", { name: "取消" }).click();
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
  if (!(await mobile.locator("#generate-ai-summary").isVisible())) throw new Error("移动端 AI 总结入口不可见");
  const mobileExportActionsBox = await mobile.locator(".summary-achievement-actions").boundingBox();
  if (!mobileExportActionsBox
    || mobileExportActionsBox.x < 0
    || mobileExportActionsBox.x + mobileExportActionsBox.width > 390
    || !(await mobile.locator("#summary-export-trigger").isVisible())) {
    throw new Error("移动端主要成果导出操作超出 390px 视口或不可见");
  }
  await mobile.locator("#summary-export-trigger").click();
  const mobileExportMenuBox = await mobile.locator("#summary-export-menu").boundingBox();
  if (!mobileExportMenuBox || mobileExportMenuBox.x < 0 || mobileExportMenuBox.x + mobileExportMenuBox.width > 390) {
    throw new Error("移动端主要成果导出菜单超出 390px 视口");
  }
  await mobile.keyboard.press("Escape");
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
