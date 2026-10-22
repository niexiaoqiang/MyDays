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

function fetchState(page) {
  return page.evaluate(() => fetch("/api/state").then((response) => response.json()));
}

async function expectWithinViewport(page, selector, width, message) {
  const box = await page.locator(selector).boundingBox();
  if (!box || box.x < 0 || box.x + box.width > width) throw new Error(message);
}

// Waits until the debounced autosave of a textarea reached SQLite.
async function waitForSaved(page, stateSelector) {
  await page.waitForFunction((selector) => {
    const text = document.querySelector(selector)?.textContent ?? "";
    return text.includes("已自动保存") || text.includes("已保存");
  }, stateSelector);
}

async function addFixedClock(page, now) {
  await page.addInitScript(({ now: fixed }) => {
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixed]));
      }
      static now() { return fixed; }
    }
    Object.setPrototypeOf(FixedDate, NativeDate);
    globalThis.Date = FixedDate;
  }, { now });
}

(async () => {
  // Playwright's bundled Chromium by default; MYDAYS_CHROME points at another Chrome binary.
  browser = await chromium.launch({
    headless: true,
    ...(process.env.MYDAYS_CHROME ? { executablePath: process.env.MYDAYS_CHROME } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const fixedNow = new Date("2026-08-12T10:00:00+08:00").getTime();
  await addFixedClock(page, fixedNow);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location().url;
      consoleErrors.push(`${message.text()}${location ? ` · ${location}` : ""}`);
    }
  });

  await page.goto(baseUrl);
  await page.waitForLoadState("networkidle");
  const initialState = await fetchState(page);
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
      reviews: { "2026-08-12": { content: "种子数据里的今日复盘" } },
    } }),
  }).then((response) => { if (!response.ok) throw new Error(`seed failed: ${response.status}`); }));
  await page.reload();
  await page.waitForLoadState("networkidle");

  // The today page shows tasks, timeline and review together; the old overview and note are gone.
  if (!(await page.locator(".dashboard-grid").isVisible())
    || !(await page.locator("#tasks").isVisible())
    || !(await page.locator("#timeline").isVisible())
    || !(await page.locator("#review").isVisible())) {
    throw new Error("工作台页面没有同时显示待办、时间线和复盘");
  }
  if (await page.locator("#workbench-overview, [id^='overview-'], #daily-note").count()) {
    throw new Error("工作台页面仍残留概览卡片或临时笔记");
  }
  if ((await page.title()) !== "MyDays · 工作台"
    || (await page.getByRole("link", { name: "工作台", exact: true }).getAttribute("aria-current")) !== "page") {
    throw new Error("工作台页面命名或激活状态不正确");
  }
  if ((await page.locator(".nav-list > .nav-item").count()) !== 3) throw new Error("主导航应包含今天、即将到期和周期汇总");
  if (!(await page.locator("#sidebar-search").isVisible())
    || !(await page.locator("#sidebar-project-list .sidebar-project").count())
    || (await page.locator("#heatmap-grid [data-date]").count()) < 28
    || !(await page.locator(".sidebar-settings").isVisible())) {
    throw new Error("侧边栏缺少搜索、项目、月历热力图或设置入口");
  }
  if (await page.locator("#export-button, #import-button, .backup-button").count()) {
    throw new Error("侧栏不应再显示备份按钮");
  }
  if ((await page.locator("#review-content").inputValue()) !== "种子数据里的今日复盘") {
    throw new Error("种子数据中的今日复盘没有显示");
  }
  if (await page.locator("#review-blockers, #review-next, #complete-review").count()
    || await page.getByRole("button", { name: "完成今日复盘" }).count()) {
    throw new Error("今日复盘应只剩一个自动保存的文本框");
  }
  if ("notes" in (await fetchState(page)).data) throw new Error("状态中不应再出现临时笔记");

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
  if ((await page.locator("#review-content").inputValue()) !== "") throw new Error("选择日期后没有切换对应日期的复盘");
  await page.locator("#date-picker-button").click();
  await page.locator(".calendar-day[data-date=\"2026-08-12\"]").click();
  if ((await page.locator("#review-content").inputValue()) !== "种子数据里的今日复盘") {
    throw new Error("月历切回原日期后复盘没有恢复");
  }

  await page.locator("#date-picker-button").click();
  await page.locator(".welcome-copy").click({ position: { x: 4, y: 4 } });
  if (await page.locator("#calendar-popover").isVisible()) throw new Error("点击月历外部没有关闭日期选择器");

  // The former task / timeline / review pages are aliases of sections on the today page.
  for (const section of ["tasks", "timeline", "review"]) {
    await page.goto(`${baseUrl}/${section}`);
    await page.waitForLoadState("networkidle");
    const url = new URL(page.url());
    if (url.pathname !== "/" || url.hash !== `#${section}`) throw new Error(`/${section} 没有改写为 /#${section}`);
    if ((await page.title()) !== "MyDays · 工作台" || !(await page.locator(".dashboard-grid").isVisible())) {
      throw new Error(`/${section} 没有打开工作台页面`);
    }
    await page.waitForTimeout(100);
    const scrolledToSection = await page.evaluate((id) => {
      const top = document.getElementById(id).getBoundingClientRect().top;
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      return Math.abs(top) < 2 || (atBottom && top >= 0 && top < window.innerHeight);
    }, section);
    if (!scrolledToSection) throw new Error(`/${section} 没有滚动到对应区块`);
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
  await page.locator("#capture-polish-cancel").click();
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

  // Project management lives in the general settings tab; the capture menu links there.
  await page.locator("#project-select-trigger").click();
  await page.getByRole("button", { name: "管理项目" }).click();
  await page.waitForFunction(() => location.pathname === "/settings" && location.hash === "#general");
  if (!(await page.locator("#settings-panel-general").isVisible())) throw new Error("管理项目没有打开通用设置");
  await page.locator("#project-new-name").fill("自定义研发项目");
  await page.getByRole("button", { name: "添加项目" }).click();
  await page.locator(".project-option-row[data-name='自定义研发项目']").waitFor();
  await page.getByRole("link", { name: "工作台", exact: true }).click();
  await page.locator("#project-select-trigger").click();
  await page.locator("#project-select-menu [data-value='自定义研发项目']").click();
  await page.locator("#priority-select-trigger").click();
  await page.locator("#priority-select-menu [data-value='high']").click();
  await page.getByPlaceholder("写下需要完成的事，按 Enter 保存…").fill("完成 MyDays 第一版");
  await page.getByRole("button", { name: "添加", exact: true }).click();
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
  await page.screenshot({ path: `${screenshotDir}/inline-edit-desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.locator(".task-title", { hasText: "完成 MyDays 第一版验收" }).waitFor();
  const editedTaskState = await fetchState(page);
  const editedTask = editedTaskState.data.tasks.find((task) => task.title === "完成 MyDays 第一版验收");
  if (!editedTask || editedTask.priority !== "low" || editedTask.project !== "自定义研发项目") {
    throw new Error("待办原位置编辑没有保存标题、项目或优先级");
  }
  await page.getByPlaceholder("写下需要完成的事，按 Enter 保存…").fill("临时删除待办");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  const disposableTask = page.locator(".task-item", { hasText: "临时删除待办" });
  page.once("dialog", (dialog) => dialog.accept());
  await disposableTask.getByRole("button", { name: "删除待办：临时删除待办" }).click();
  if (await page.locator(".task-title", { hasText: "临时删除待办" }).count()) {
    throw new Error("待办删除功能失效");
  }

  // Recurrence, rollover and notifications are managed in one task settings dialog.
  await page.locator("#task-settings-open").click();
  const taskSettings = page.locator("#task-settings-dialog");
  if (!(await taskSettings.isVisible())
    || !(await taskSettings.locator("#task-rollover").count())
    || !(await taskSettings.locator("#task-notify-state").isVisible())
    || !(await taskSettings.locator("#recurrence-list").count())) {
    throw new Error("待办设置弹窗没有包含重复、顺延和提醒设置");
  }
  await page.locator("#task-settings-close").click();
  if (await taskSettings.isVisible()) throw new Error("待办设置弹窗没有关闭");

  await page.getByRole("button", { name: "完成待办：完成 MyDays 第一版验收" }).click();
  if ((await page.locator("#task-count").innerText()) !== "0") throw new Error("完成后的待办计数不正确");
  if ((await page.locator("#score-number").innerText()) !== "100%") throw new Error("完成度不正确");

  await page.locator(".timeline-content p", { hasText: "完成 MyDays 第一版验收" }).waitFor();
  const autoLog = page.locator(".timeline-item.auto", { hasText: "完成 MyDays 第一版验收" });
  await autoLog.getByRole("button", { name: "编辑工作记录：完成 MyDays 第一版验收" }).click();
  if (!(await page.locator(".entry-edit-hint").innerText()).includes("来源")) {
    throw new Error("自动完成记录编辑时没有说明来源待办");
  }
  await page.locator(".entry-edit-title").fill("完成 MyDays 第一版验收（已复核）");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.locator(".timeline-content p", { hasText: "完成 MyDays 第一版验收（已复核）" }).waitFor();
  const autoEditState = await fetchState(page);
  const sourceTask = autoEditState.data.tasks.find((task) => task.title === "完成 MyDays 第一版验收（已复核）");
  const sourceLogs = autoEditState.data.logs.filter((log) => log.sourceTaskId === sourceTask?.id);
  if (!sourceTask || sourceLogs.length !== 1 || sourceLogs[0].title !== sourceTask.title || sourceLogs[0].project !== sourceTask.project) {
    throw new Error("自动完成记录没有通过来源待办同步更新");
  }
  await page.getByRole("tab", { name: "工作记录" }).click();
  await page.getByPlaceholder("记录刚刚完成的工作，按 Enter 保存…").fill("检查移动端布局");
  await page.getByRole("button", { name: "AI 润色" }).click();
  await page.locator("#capture-polish-suggestion").waitFor();
  if (polishRequests.at(-1)?.type !== "log") throw new Error("工作记录润色请求类型不正确");
  await page.locator("#capture-polish-cancel").click();
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.locator(".timeline-content p", { hasText: "检查移动端布局" }).waitFor();
  const manualLog = page.locator(".timeline-item", { hasText: "检查移动端布局" });
  await manualLog.getByRole("button", { name: "编辑工作记录：检查移动端布局" }).click();
  await page.locator(".entry-edit-title").fill("检查移动端布局与交互");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.locator(".timeline-content p", { hasText: "检查移动端布局与交互" }).waitFor();
  await page.getByPlaceholder("记录刚刚完成的工作，按 Enter 保存…").fill("临时删除记录");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  const disposableLog = page.locator(".timeline-item", { hasText: "临时删除记录" });
  page.once("dialog", (dialog) => dialog.accept());
  await disposableLog.getByRole("button", { name: "删除工作记录：临时删除记录" }).click();
  if (await page.locator(".timeline-content p", { hasText: "临时删除记录" }).count()) {
    throw new Error("工作记录删除功能失效");
  }
  const reviewAfterLog = (await fetchState(page)).data.reviews["2026-08-12"]?.content ?? "";
  if (reviewAfterLog.includes("检查移动端布局与交互")) throw new Error("今日复盘不应自动复述时间线中的工作记录");

  // The daily review is one textarea that autosaves its content.
  await page.locator("#review-content").fill("这是我手工修改的复盘");
  await waitForSaved(page, "#review-state");
  if ((await page.evaluate(() => JSON.stringify(state.reviews["2026-08-12"]))) !== JSON.stringify({ content: "这是我手工修改的复盘" })) {
    throw new Error("今日复盘没有以 { content } 形式写入状态");
  }
  await page.getByPlaceholder("记录刚刚完成的工作，按 Enter 保存…").fill("手工复盘后的工作记录");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.locator(".timeline-content p", { hasText: "手工复盘后的工作记录" }).waitFor();
  const stateAfterManualReview = await fetchState(page);
  const savedReview = stateAfterManualReview.data.reviews["2026-08-12"];
  if (savedReview?.content !== "这是我手工修改的复盘" || "blockers" in savedReview || "next" in savedReview) {
    throw new Error("新增工作记录覆盖了手工编辑的今日复盘，或复盘仍包含旧字段");
  }
  if (!(await page.locator("#review-day-summary").innerText()).includes("详见工作时间线")) throw new Error("今日复盘缺少当天记录概览");

  await page.locator("#project-select-trigger").click();
  await page.getByRole("button", { name: "管理项目" }).click();
  await page.waitForFunction(() => location.pathname === "/settings");
  const customProjectRow = page.locator(".project-option-row[data-name='自定义研发项目']");
  await customProjectRow.getByRole("button", { name: "上移项目：自定义研发项目" }).click();
  const renamedInput = page.locator(".project-option-row[data-name='自定义研发项目'] input");
  await renamedInput.fill("研发项目（新）");
  await page.keyboard.press("Enter");
  await page.locator(".project-option-row[data-name='研发项目（新）']").waitFor();
  await page.reload();
  await page.waitForLoadState("networkidle");
  if (!(await page.locator(".project-option-row[data-name='研发项目（新）']").isVisible())) {
    throw new Error("刷新后设置页没有保留项目改名");
  }
  await page.getByRole("link", { name: "工作台", exact: true }).click();
  await page.locator("#project-select-trigger").click();
  const projectValuesAfterReload = await page.locator("#project-select-menu .capture-select-option").evaluateAll((options) => options.map((option) => option.dataset.value));
  if (projectValuesAfterReload.indexOf("研发项目（新）") !== 3) throw new Error("项目重命名或排序刷新后未保留");
  await page.locator("#project-select-menu [data-value='研发项目（新）']").click();
  await page.locator("#project-select-trigger").click();
  await page.getByRole("button", { name: "管理项目" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".project-option-row[data-name='研发项目（新）']").getByRole("button", { name: "删除项目：研发项目（新）" }).click();
  await page.locator(".project-option-row[data-name='研发项目（新）']").waitFor({ state: "detached" });
  await page.getByRole("link", { name: "工作台", exact: true }).click();
  if ((await page.locator("#project-select").inputValue()) !== "") throw new Error("删除当前项目后表单没有回退到无项目");
  const historyAfterOptionChanges = await fetchState(page);
  const projectHistory = [...historyAfterOptionChanges.data.tasks, ...historyAfterOptionChanges.data.logs]
    .filter((item) => item.title.includes("MyDays") || item.title.includes("移动端") || item.title.includes("手工复盘"));
  if (!projectHistory.length || projectHistory.some((item) => item.project !== "自定义研发项目")) {
    throw new Error("项目选项重命名或删除改写了历史记录");
  }
  await page.screenshot({ path: `${screenshotDir}/today-desktop.png`, fullPage: true });

  await page.getByRole("link", { name: "周期汇总" }).click();
  if (new URL(page.url()).pathname !== "/summary") throw new Error("周期汇总页面 URL 不正确");
  if (!(await page.locator("#summary-page").isVisible()) || (await page.locator(".dashboard-grid").isVisible())) {
    throw new Error("周期汇总页面内容隔离不正确");
  }
  if (!(await page.locator(".topbar").isVisible()) || !(await page.locator("#account-menu-button").isVisible())) {
    throw new Error("周期汇总页无法访问账户菜单");
  }
  if (await page.locator("#achievements-dialog, #save-summary-review").count()) {
    throw new Error("成果总结弹窗和保存按钮应已移除");
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
  if (await page.locator("#summary-range-controls").isVisible()) throw new Error("非自定义周期不应显示时间段选择");
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

  // The period report is saved per scope as { report, notes }; "" is the all-projects scope.
  const aiReportRequests = [];
  await page.route("**/api/ai/period-report", async (route) => {
    const body = route.request().postDataJSON();
    aiReportRequests.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        report: body.periodType === "range"
          ? "## 交付\n- 完成登录体验与移动端布局检查。"
          : "本周完成登录体验与移动端布局检查，下一步继续验证数据边界。",
        provider: "浏览器模拟服务",
        model: "browser-report-model",
        latencyMs: 42,
      }),
    });
  });
  const weeklyReport = "本周完成登录体验与移动端布局检查，下一步继续验证数据边界。";
  if ((await page.locator("#summary-report-label").innerText()) !== "AI 周报") throw new Error("周期汇报标签不正确");
  await page.locator("#generate-ai-summary").click();
  await page.waitForFunction((text) => document.querySelector("#summary-ai-report")?.value === text, weeklyReport);
  if (JSON.stringify(aiReportRequests.at(-1)) !== JSON.stringify({ periodType: "week", periodStart: "2026-08-10", project: "自定义研发项目" })) {
    throw new Error("周期 AI 总结请求没有使用当前规范周期");
  }
  await page.waitForFunction(() => document.querySelector("#summary-review-state")?.textContent?.includes("生成并已保存"));
  const stateAfterAiReport = await fetchState(page);
  const projectRecord = stateAfterAiReport.data.periodReviews["week:2026-08-10"]?.["自定义研发项目"];
  if (projectRecord?.report !== weeklyReport || projectRecord.notes !== "") {
    throw new Error("AI 总结生成后没有立即保存为项目周期 { report, notes }");
  }
  for (const legacyKey of ["projectPeriodReports", "projectPeriodReviews", "periodReports"]) {
    if (legacyKey in stateAfterAiReport.data) throw new Error(`状态中不应再出现 ${legacyKey}`);
  }
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.locator("#summary-project-trigger").click();
  await page.locator("#summary-project-menu [data-value='自定义研发项目']").click();
  if ((await page.locator("#summary-ai-report").inputValue()) !== weeklyReport) {
    throw new Error("AI 总结刷新后没有从 SQLite 恢复");
  }
  await page.locator("#summary-blockers").fill("自定义研发项目问题");
  await waitForSaved(page, "#summary-review-state");
  const savedProjectPeriodReview = await fetchState(page);
  if (JSON.stringify(savedProjectPeriodReview.data.periodReviews["week:2026-08-10"]?.["自定义研发项目"])
    !== JSON.stringify({ report: weeklyReport, notes: "自定义研发项目问题" })) {
    throw new Error("项目周期汇报的补充说明没有独立保存");
  }
  const reportDownloadPromise = page.waitForEvent("download");
  await page.locator("#download-summary-report").click();
  const reportDownload = await reportDownloadPromise;
  const reportMarkdown = fs.readFileSync(await reportDownload.path(), "utf8");
  if (!reportDownload.suggestedFilename().endsWith(".md")
    || !reportDownload.suggestedFilename().includes("周报")
    || !reportDownload.suggestedFilename().includes("week-2026-08-10")
    || reportMarkdown.trim() !== weeklyReport) {
    throw new Error("下载 Markdown 没有导出当前周期汇报");
  }
  await page.locator("#summary-project-trigger").click();
  await page.locator("#summary-project-menu [data-value='']").click();
  if ((await page.locator("#summary-ai-report").inputValue()) !== ""
    || (await page.locator("#summary-blockers").inputValue()) !== "") {
    throw new Error("项目周期 AI 总结或补充说明泄漏到全部项目范围");
  }
  const sidebarProject = page.locator("#sidebar-project-list .sidebar-project").first();
  const sidebarProjectName = await sidebarProject.getAttribute("data-project");
  await sidebarProject.click();
  if ((await page.locator("#summary-project-trigger .capture-select-value").innerText()) !== sidebarProjectName) {
    throw new Error("从侧栏选择项目后，周期汇总的项目下拉没有同步");
  }
  await page.locator("#sidebar-project-list .sidebar-project").first().click();
  if ((await page.locator("#summary-project-filter").inputValue()) !== ""
    || (await page.locator("#summary-project-trigger .capture-select-value").innerText()) !== "全部项目") {
    throw new Error("再次点击侧栏当前项目没有恢复全部项目");
  }
  await page.getByRole("button", { name: "每月" }).click();
  if (!(await page.locator("#summary-period-label").innerText()).includes("8月")) throw new Error("月度周期切换失败");
  if ((await page.locator("#summary-report-label").innerText()) !== "AI 月报") throw new Error("月度汇报标签不正确");
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
  await waitForSaved(page, "#summary-review-state");
  const savedAllProjectsReview = await fetchState(page);
  if (JSON.stringify(savedAllProjectsReview.data.periodReviews["week:2026-08-10"]?.[""])
    !== JSON.stringify({ report: "", notes: "继续检查数据边界。" })) {
    throw new Error("全部项目的周期汇报没有以空项目键保存");
  }
  const currentWeekLabel = await page.locator("#summary-period-label").innerText();
  await page.getByRole("button", { name: "上一个周期" }).click();
  if ((await page.locator("#summary-period-label").innerText()) === currentWeekLabel) throw new Error("上一周期导航失败");
  await page.getByRole("button", { name: "回到本周期" }).click();
  if ((await page.locator("#summary-period-label").innerText()) !== currentWeekLabel) throw new Error("回到本周期失败");

  // Custom ranges replace the old achievements dialog.
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  if (!(await page.locator("#summary-range-controls").isVisible())
    || await page.locator("#summary-previous").isVisible()
    || await page.locator("#summary-next").isVisible()
    || (await page.locator("#summary-period-label").innerText()) !== "自定义时间段"
    || (await page.locator(".period-tab[data-period='range']").getAttribute("aria-pressed")) !== "true") {
    throw new Error("自定义时间段没有显示时间段选择");
  }
  if ((await page.locator("#summary-range-from").inputValue()) !== "2026-07-01"
    || (await page.locator("#summary-range-to").inputValue()) !== "2026-08-12") {
    throw new Error("自定义时间段默认范围不是下半年至今");
  }
  if (!(await page.locator("[data-range='second-half']").getAttribute("class")).includes("active")) {
    throw new Error("默认时间段没有高亮对应的常用时间段");
  }
  if ((await page.locator("#summary-report-label").innerText()) !== "AI 成果总结") throw new Error("自定义时间段汇报标签不正确");
  await page.locator("[data-range='first-half']").click();
  if ((await page.locator("#summary-range-from").inputValue()) !== "2026-01-01"
    || (await page.locator("#summary-range-to").inputValue()) !== "2026-06-30"
    || (await page.locator("#summary-completed").innerText()) !== "0") {
    throw new Error("常用时间段“上半年”没有生效");
  }
  await page.locator("#summary-range-to").fill("2026-08-12");
  await page.locator("#summary-range-from").fill("2026-08-01");
  if ((await page.locator("#summary-completed").innerText()) !== "2"
    || (await page.locator("#summary-logs").innerText()) !== "3"
    || (await page.locator("#summary-days-total").innerText()) !== "共 12 天") {
    throw new Error("自定义时间段汇总不正确");
  }
  await page.locator("#summary-range-from").fill("2026-09-01");
  if (!(await page.locator("#toast").innerText()).includes("开始日期不能晚于结束日期")
    || (await page.locator("#summary-range-from").inputValue()) !== "2026-08-01") {
    throw new Error("开始日期晚于结束日期时没有拒绝");
  }
  await page.locator("#generate-ai-summary").click();
  await page.waitForFunction(() => document.querySelector("#summary-review-state")?.textContent?.includes("生成并已保存"));
  if (JSON.stringify(aiReportRequests.at(-1)) !== JSON.stringify({ periodType: "range", from: "2026-08-01", to: "2026-08-12" })) {
    throw new Error("自定义时间段 AI 总结请求不正确");
  }
  const rangeState = await fetchState(page);
  if (rangeState.data.periodReviews["range:2026-08-01:2026-08-12"]?.[""]?.report !== "## 交付\n- 完成登录体验与移动端布局检查。") {
    throw new Error("自定义时间段汇报没有保存到 range 键");
  }
  await page.getByRole("button", { name: "每周" }).click();
  if (await page.locator("#summary-range-controls").isVisible()) throw new Error("切回每周后仍显示时间段选择");

  await page.reload();
  await page.waitForLoadState("networkidle");
  if (new URL(page.url()).pathname !== "/summary" || !(await page.locator("#summary-page").isVisible())) {
    throw new Error("周期汇总子页面刷新后路由丢失");
  }
  if ((await page.locator("#summary-blockers").inputValue()) !== "继续检查数据边界。") {
    throw new Error("周期汇报刷新后没有从 SQLite 恢复");
  }
  await page.getByRole("link", { name: "工作台", exact: true }).click();
  await page.locator(".task-title", { hasText: "完成 MyDays 第一版验收（已复核）" }).waitFor();
  if ((await page.locator("#review-content").inputValue()) !== "这是我手工修改的复盘") {
    throw new Error("刷新后今日复盘没有从 SQLite 恢复");
  }
  await page.locator("#account-menu-button").click();
  if (!(await page.locator("#ai-settings-link").isVisible())) throw new Error("账户菜单中没有设置入口");
  await page.locator("#ai-settings-link").click();
  if (new URL(page.url()).pathname !== "/settings" || !(await page.locator("#ai-settings-page").isVisible())) {
    throw new Error("设置页面路由失败");
  }
  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/");
  if (!(await page.locator(".dashboard-grid").isVisible())) throw new Error("浏览器后退未恢复工作台页面");
  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/summary");
  if (!(await page.locator("#summary-page").isVisible())) throw new Error("浏览器后退未恢复周期汇总页面");
  await page.goForward();
  await page.goForward();
  await page.waitForFunction(() => location.pathname === "/settings");

  if (!(await page.locator(".topbar").isVisible()) || !(await page.locator("#account-menu-button").isVisible())) {
    throw new Error("设置页无法访问账户菜单");
  }
  if ((await page.locator(".nav-list .nav-item[aria-current=\"page\"]").count()) !== 0
    || (await page.locator(".sidebar-settings").getAttribute("aria-current")) !== "page"
    || (await page.locator("#ai-settings-link").getAttribute("aria-current")) !== "page") {
    throw new Error("设置页激活状态不正确");
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
    throw new Error("设置入口不是用户菜单中的独立真实链接");
  }
  if (settingsStructure.modifiedClickPrevented !== false) throw new Error("设置入口错误拦截了修饰键点击");

  // Export and import live in the data tab of the settings page.
  await page.locator("#settings-tab-data").click();
  if (new URL(page.url()).hash !== "#data"
    || !(await page.locator("#settings-panel-data").isVisible())
    || await page.locator("#settings-panel-general").isVisible()) {
    throw new Error("设置数据标签页没有打开");
  }
  const backupDownloadPromise = page.waitForEvent("download");
  await page.locator("#settings-export-button").click();
  const backupDownload = await backupDownloadPromise;
  const backup = JSON.parse(fs.readFileSync(await backupDownload.path(), "utf8"));
  if (!backupDownload.suggestedFilename().startsWith("mydays-backup-")
    || backup.data.reviews["2026-08-12"]?.content !== "这是我手工修改的复盘"
    || backup.data.periodReviews["week:2026-08-10"]?.[""]?.notes !== "继续检查数据边界。"
    || "notes" in backup.data) {
    throw new Error("导出备份没有包含新的每日复盘与周期汇报结构");
  }
  backup.data.reviews["2026-08-12"] = { content: "从备份导入的复盘" };
  const importPath = `${screenshotDir}/import-backup.json`;
  fs.writeFileSync(importPath, JSON.stringify(backup));
  page.once("dialog", (dialog) => dialog.accept());
  const preImportDownloadPromise = page.waitForEvent("download");
  await page.locator("#import-file").setInputFiles(importPath);
  const preImportDownload = await preImportDownloadPromise;
  if (!preImportDownload.suggestedFilename().startsWith("mydays-before-import-")) {
    throw new Error("导入前没有自动下载当前数据");
  }
  await page.waitForFunction(() => state.reviews["2026-08-12"]?.content === "从备份导入的复盘");
  const importedState = await fetchState(page);
  if (importedState.data.reviews["2026-08-12"]?.content !== "从备份导入的复盘"
    || !importedState.data.tasks.some((task) => task.title === "完成 MyDays 第一版验收（已复核）")) {
    throw new Error("导入备份没有写入 SQLite");
  }
  if (!(await page.locator("#settings-import-button").isVisible())) throw new Error("数据标签页缺少导入按钮");

  await page.locator("#settings-tab-ai").click();
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
  if (new URL(page.url()).hash !== "#ai" || !(await page.locator(".ai-provider-item", { hasText: "浏览器测试服务" }).isVisible())) {
    throw new Error("AI 服务配置刷新后未保留");
  }
  if ((await page.locator("#ai-summary-prompt").inputValue()) !== "优先突出业务价值和下周风险。") throw new Error("自定义 AI 总结撮要刷新后未恢复");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#ai-prompt-reset").click();
  await page.waitForFunction(() => document.querySelector("#ai-prompt-mode")?.textContent === "默认");
  // Weekly goals, focus items, plan-your-day and the upcoming view.
  await page.locator(".sidebar-settings").waitFor();
  await page.getByRole("link", { name: "工作台", exact: true }).click();
  await page.locator("#today-button").evaluate((button) => { if (!button.hidden) button.click(); });
  await page.locator("#goal-new-title").fill("上线侧边栏改版");
  await page.getByRole("button", { name: "添加目标" }).click();
  await page.locator(".goal-row", { hasText: "上线侧边栏改版" }).waitFor();
  await page.locator("#capture-more-button").click();
  await page.locator("#capture-goal").selectOption({ label: "上线侧边栏改版" });
  await page.getByPlaceholder("写下需要完成的事，按 Enter 保存…").fill("调整侧边栏间距");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  const goalTask = page.locator(".task-item", { hasText: "调整侧边栏间距" });
  await goalTask.locator(".goal-chip", { hasText: "上线侧边栏改版" }).waitFor();
  await goalTask.locator(".focus-toggle").click();
  await page.waitForFunction(() => document.querySelector("#score-label")?.textContent === "重点完成");
  await goalTask.locator(".task-check").click();
  await page.locator(".goal-row", { hasText: "关联待办 1/1" }).waitFor();
  const futureDue = await page.evaluate(() => {
    const due = new Date();
    due.setDate(due.getDate() + 2);
    return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
  });
  await page.evaluate((date) => {
    state.tasks.push({ id: "smoke-upcoming", date, title: "两天后交付的方案", project: "", priority: "normal", completed: false, createdAt: new Date().toISOString(), completedAt: null, originDate: null, dueDate: date, dueTime: null, remindMinutes: null, recurrenceId: null, focus: false, goalId: null });
    persist();
    render();
  }, futureDue);
  await page.locator(".plan-item", { hasText: "两天后交付的方案" }).waitFor();
  await page.getByRole("link", { name: "即将到期" }).click();
  await page.waitForFunction(() => location.pathname === "/upcoming");
  const upcomingItem = page.locator(".upcoming-item", { hasText: "两天后交付的方案" });
  await upcomingItem.locator("[data-upcoming-today]").click();
  await page.waitForFunction(() => state.tasks.find((task) => task.id === "smoke-upcoming")?.date === new Date().toLocaleDateString("en-CA"));
  const goalState = await fetchState(page);
  if (goalState.data.goals.length !== 1 || !goalState.data.tasks.some((task) => task.goalId === goalState.data.goals[0].id && task.focus)) {
    throw new Error("周目标或今日重点没有保存到 SQLite");
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${screenshotDir}/desktop.png`, fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await addFixedClock(mobile, fixedNow);
  mobile.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`[mobile] ${message.text()}`);
  });
  await mobile.goto(baseUrl);
  await mobile.waitForLoadState("networkidle");
  if (!(await mobile.locator(".dashboard-grid").isVisible())) throw new Error("移动端工作台页面不可见");
  await expectWithinViewport(mobile, ".dashboard-grid", 390, "移动端工作台页面超出 390px 视口");
  await expectWithinViewport(mobile, "#review", 390, "移动端今日复盘超出 390px 视口");
  await mobile.screenshot({ path: `${screenshotDir}/today-mobile.png`, fullPage: true });
  if (!(await mobile.locator(".sidebar").isVisible()) || !(await mobile.locator("#capture-input").isVisible())) {
    throw new Error("移动端核心界面不可见");
  }
  if ((await mobile.locator(".nav-list > .nav-item:visible").count()) !== 3
    || await mobile.locator(".sidebar-section:visible, .sidebar-search:visible, .sidebar-settings:visible").count()) {
    throw new Error("移动端底栏应只包含今天、即将到期和周期汇总");
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
  await expectWithinViewport(mobile, ".entry-edit-form", 390, "移动端原位置编辑表单超出 390px 视口");
  await mobile.locator("[data-entry-edit-select][data-field='project'] .capture-select-trigger").click();
  await expectWithinViewport(mobile, "[data-entry-edit-select][data-field='project'] .capture-select-menu", 390, "移动端编辑项目下拉超出 390px 视口");
  await mobile.screenshot({ path: `${screenshotDir}/inline-edit-mobile.png`, fullPage: true });
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
  await expectWithinViewport(mobile, "#capture-polish-suggestion", 390, "移动端 AI 润色建议区超出 390px 视口");
  await mobile.locator("#capture-polish-cancel").click();
  await mobile.locator("#task-settings-open").click();
  await expectWithinViewport(mobile, "#task-settings-dialog", 390, "移动端待办设置弹窗超出 390px 视口");
  await mobile.locator("#task-settings-close").click();
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
  await mobile.locator("#project-select-trigger").click();
  await mobile.getByRole("button", { name: "管理项目" }).click();
  await mobile.waitForFunction(() => location.pathname === "/settings");
  await expectWithinViewport(mobile, "#settings-panel-general", 390, "移动端项目设置超出 390px 视口");
  await mobile.getByRole("link", { name: "周期汇总" }).click();
  await expectWithinViewport(mobile, "#summary-page", 390, "移动端周期汇总超出 390px 视口");
  if (!(await mobile.locator("#generate-ai-summary").isVisible())) throw new Error("移动端 AI 总结入口不可见");
  if (!(await mobile.locator("#summary-export-trigger").isVisible())) throw new Error("移动端主要成果导出操作不可见");
  await expectWithinViewport(mobile, ".summary-achievement-actions", 390, "移动端主要成果导出操作超出 390px 视口");
  await mobile.locator("#summary-export-trigger").click();
  await expectWithinViewport(mobile, "#summary-export-menu", 390, "移动端主要成果导出菜单超出 390px 视口");
  await mobile.keyboard.press("Escape");
  await expectWithinViewport(mobile, ".summary-scope-bar", 390, "移动端项目汇总范围控件超出 390px 视口");
  await mobile.locator("#summary-project-trigger").click();
  await expectWithinViewport(mobile, "#summary-project-menu", 390, "移动端项目下拉菜单超出 390px 视口");
  await mobile.locator("#summary-project-menu [data-value='自定义研发项目']").click();
  if ((await mobile.locator("#summary-project-filter").inputValue()) !== "自定义研发项目") {
    throw new Error("移动端自定义项目下拉无法切换项目");
  }
  await expectWithinViewport(mobile, ".summary-review-actions", 390, "移动端 AI 总结操作区超出 390px 视口");
  await mobile.getByRole("button", { name: "自定义", exact: true }).click();
  await expectWithinViewport(mobile, "#summary-range-controls", 390, "移动端自定义时间段控件超出 390px 视口");
  const summaryOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (summaryOverflow > 1) throw new Error(`移动端周期汇总存在 ${summaryOverflow}px 横向溢出`);
  await mobile.screenshot({ path: `${screenshotDir}/summary-mobile.png`, fullPage: true });
  await mobile.locator("#account-menu-button").click();
  await mobile.locator("#ai-settings-link").click();
  await expectWithinViewport(mobile, "#ai-settings-page", 390, "移动端设置超出 390px 视口");
  if (!(await mobile.locator(".sidebar").boundingBox())) throw new Error("移动端底部导航不可见");
  if ((await mobile.locator("#ai-settings-link").getAttribute("aria-current")) !== "page") {
    throw new Error("移动端设置入口没有表达当前页面状态");
  }
  await mobile.locator("#settings-tab-data").click();
  await expectWithinViewport(mobile, "#settings-panel-data", 390, "移动端数据设置超出 390px 视口");
  await mobile.locator("#settings-tab-ai").click();
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (mobileOverflow > 1) throw new Error(`移动端页面存在 ${mobileOverflow}px 横向溢出`);
  await mobile.locator(".ai-editor-actions").scrollIntoViewIfNeeded();
  if (!(await mobile.locator(".ai-editor-actions").boundingBox())) throw new Error("移动端 AI 页面底部操作不可见");
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
