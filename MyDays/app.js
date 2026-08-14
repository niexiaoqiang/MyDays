const STORAGE_KEY = "mydays.v1";
const MIGRATION_KEY = "mydays.v1.sqlite-migrated";
const ROUTES = Object.freeze({
  "/": {
    key: "today",
    title: "MyDays · 今日工作台",
    eyebrow: "TODAY",
    copy: "把重要的事留在这里，让大脑轻一点。",
  },
  "/tasks": {
    key: "tasks",
    title: "MyDays · 待办事项",
    eyebrow: "TASKS",
    heading: "把要做的事，一件件推进",
    copy: "聚焦当天需要完成的事项，完成后会自动进入工作时间线。",
  },
  "/timeline": {
    key: "timeline",
    title: "MyDays · 工作时间线",
    eyebrow: "TIMELINE",
    heading: "看见今天走过的路",
    copy: "按时间回看完成的工作，也可以随手记下刚刚发生的进展。",
  },
  "/review": {
    key: "review",
    title: "MyDays · 今日复盘",
    eyebrow: "DAILY REVIEW",
    heading: "收好今天，为明天留出起点",
    copy: "整理成果、问题和下一步，让每一天都有清晰的落点。",
  },
  "/summary": {
    key: "summary",
    title: "MyDays · 周期汇总",
    eyebrow: "PERIOD SUMMARY",
    heading: "回顾一段时间，看见持续的进展",
    copy: "按周、月、季度或年度整理成果，并为下一阶段留下清晰的方向。",
  },
  "/ai-settings": {
    key: "ai-settings",
    title: "MyDays · AI 设置",
    eyebrow: "AI CONNECTIONS",
    heading: "连接你的 AI 服务",
    copy: "安全配置第三方 OpenAI 或 Claude 兼容服务。",
  },
});

const PERIODS = Object.freeze({
  week: { reviewLabel: "周度" },
  month: { reviewLabel: "月度" },
  quarter: { reviewLabel: "季度" },
  year: { reviewLabel: "年度" },
});

const elements = {
  dateLabel: document.querySelector("#date-label"),
  datePickerButton: document.querySelector("#date-picker-button"),
  calendarPopover: document.querySelector("#calendar-popover"),
  calendarSelectedLabel: document.querySelector("#calendar-selected-label"),
  calendarSelectedYear: document.querySelector("#calendar-selected-year"),
  calendarMonthLabel: document.querySelector("#calendar-month-label"),
  calendarGrid: document.querySelector("#calendar-grid"),
  calendarPreviousMonth: document.querySelector("#calendar-previous-month"),
  calendarNextMonth: document.querySelector("#calendar-next-month"),
  calendarCancel: document.querySelector("#calendar-cancel"),
  calendarToday: document.querySelector("#calendar-today"),
  previousDay: document.querySelector("#previous-day"),
  nextDay: document.querySelector("#next-day"),
  todayButton: document.querySelector("#today-button"),
  dayContext: document.querySelector("#day-context"),
  greeting: document.querySelector("#greeting"),
  welcomeCopy: document.querySelector("#welcome-copy"),
  scoreRing: document.querySelector("#score-ring"),
  scoreNumber: document.querySelector("#score-number"),
  captureForm: document.querySelector("#capture-form"),
  captureInput: document.querySelector("#capture-input"),
  captureTabs: [...document.querySelectorAll(".capture-tab")],
  projectSelect: document.querySelector("#project-select"),
  projectSelectMenu: document.querySelector("#project-select-menu"),
  prioritySelect: document.querySelector("#priority-select"),
  priorityField: document.querySelector(".priority-field"),
  captureSelects: [...document.querySelectorAll("[data-capture-select]")],
  taskList: document.querySelector("#task-list"),
  taskCount: document.querySelector("#task-count"),
  filterTabs: [...document.querySelectorAll(".filter-tab")],
  dailyNote: document.querySelector("#daily-note"),
  noteCount: document.querySelector("#note-count"),
  timelineList: document.querySelector("#timeline-list"),
  logCount: document.querySelector("#log-count"),
  generateReview: document.querySelector("#generate-review"),
  reviewTitle: document.querySelector("#daily-review-title"),
  reviewWins: document.querySelector("#review-wins"),
  reviewBlockers: document.querySelector("#review-blockers"),
  reviewNext: document.querySelector("#review-next"),
  reviewState: document.querySelector("#review-state"),
  saveReview: document.querySelector("#save-review"),
  exportButton: document.querySelector("#export-button"),
  accountMenuButton: document.querySelector("#account-menu-button"),
  accountMenu: document.querySelector("#account-menu"),
  logoutButton: document.querySelector("#logout-button"),
  footerDate: document.querySelector("#footer-date"),
  toast: document.querySelector("#toast"),
  emptyTaskTemplate: document.querySelector("#empty-task-template"),
  emptyLogTemplate: document.querySelector("#empty-log-template"),
  navItems: [...document.querySelectorAll(".nav-item")],
  settingsLink: document.querySelector("#ai-settings-link"),
  periodTabs: [...document.querySelectorAll(".period-tab")],
  summaryPrevious: document.querySelector("#summary-previous"),
  summaryNext: document.querySelector("#summary-next"),
  summaryCurrent: document.querySelector("#summary-current"),
  summaryProjectFilter: document.querySelector("#summary-project-filter"),
  summaryProjectMenu: document.querySelector("#summary-project-menu"),
  summaryPeriodLabel: document.querySelector("#summary-period-label"),
  summaryPeriodRange: document.querySelector("#summary-period-range"),
  summaryCompleted: document.querySelector("#summary-completed"),
  summaryTaskTotal: document.querySelector("#summary-task-total"),
  summaryRate: document.querySelector("#summary-rate"),
  summaryLogs: document.querySelector("#summary-logs"),
  summaryActiveDays: document.querySelector("#summary-active-days"),
  summaryDaysTotal: document.querySelector("#summary-days-total"),
  summaryTrend: document.querySelector("#summary-trend"),
  summaryProjects: document.querySelector("#summary-projects"),
  summaryAchievements: document.querySelector("#summary-achievements"),
  summaryOpenItems: document.querySelector("#summary-open-items"),
  summaryReviewTitle: document.querySelector("#summary-review-title"),
  summaryWins: document.querySelector("#summary-wins"),
  summaryBlockers: document.querySelector("#summary-blockers"),
  summaryNextActions: document.querySelector("#summary-next-actions"),
  summaryReviewState: document.querySelector("#summary-review-state"),
  generateSummaryReview: document.querySelector("#generate-summary-review"),
  generateAiSummary: document.querySelector("#generate-ai-summary"),
  saveSummaryReview: document.querySelector("#save-summary-review"),
  aiNewProvider: document.querySelector("#ai-new-provider"),
  aiProviderCount: document.querySelector("#ai-provider-count"),
  aiProviderList: document.querySelector("#ai-provider-list"),
  aiProviderForm: document.querySelector("#ai-provider-form"),
  aiEditorTitle: document.querySelector("#ai-editor-title"),
  aiProviderName: document.querySelector("#ai-provider-name"),
  aiProviderProtocol: document.querySelector("#ai-provider-protocol"),
  aiProviderBaseUrl: document.querySelector("#ai-provider-base-url"),
  aiProviderModel: document.querySelector("#ai-provider-model"),
  aiFetchModels: document.querySelector("#ai-fetch-models"),
  aiModelOptions: document.querySelector("#ai-model-options"),
  aiModelStatus: document.querySelector("#ai-model-status"),
  aiProviderTimeout: document.querySelector("#ai-provider-timeout"),
  aiProviderApiKey: document.querySelector("#ai-provider-api-key"),
  aiKeyStatus: document.querySelector("#ai-key-status"),
  aiAnthropicVersion: document.querySelector("#ai-anthropic-version"),
  aiAnthropicOption: document.querySelector(".anthropic-option"),
  aiMaxTokens: document.querySelector("#ai-max-tokens"),
  aiTestResult: document.querySelector("#ai-test-result"),
  aiDeleteProvider: document.querySelector("#ai-delete-provider"),
  aiClearKey: document.querySelector("#ai-clear-key"),
  aiSetDefault: document.querySelector("#ai-set-default"),
  aiTestProvider: document.querySelector("#ai-test-provider"),
  aiSummaryPrompt: document.querySelector("#ai-summary-prompt"),
  aiPromptCount: document.querySelector("#ai-prompt-count"),
  aiPromptMode: document.querySelector("#ai-prompt-mode"),
  aiPromptState: document.querySelector("#ai-prompt-state"),
  aiPromptReset: document.querySelector("#ai-prompt-reset"),
  aiPromptSave: document.querySelector("#ai-prompt-save"),
  projectDialog: document.querySelector("#project-dialog"),
  projectDialogClose: document.querySelector("#project-dialog-close"),
  projectDialogDone: document.querySelector("#project-dialog-done"),
  projectAddForm: document.querySelector("#project-add-form"),
  projectNewName: document.querySelector("#project-new-name"),
  projectOptionList: document.querySelector("#project-option-list"),
  projectDialogState: document.querySelector("#project-dialog-state"),
};

const defaultState = {
  tasks: [],
  logs: [],
  notes: {},
  reviews: {},
  periodReviews: {},
  projectReviews: {},
  projectPeriodReviews: {},
};

let state = structuredClone(defaultState);
let revision = 0;
let currentRoute = resolveRoute(window.location.pathname);
let selectedDate = toDateKey(new Date());
let summaryPeriod = "week";
let summaryAnchor = new Date();
let summaryProject = "";
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let captureType = "task";
let taskFilter = "all";
let saveQueue = Promise.resolve();
let saveEpoch = 0;
let deferredSaveTimer;
let saveStateTimer;
let toastTimer;
let summarySaveVersion = 0;
let aiSummaryLoading = false;
let aiProviders = [];
let selectedAiProviderId = null;
let aiProvidersLoaded = false;
let aiModelsProviderId = null;
let aiModelsRequestVersion = 0;
let aiSummarySettingsLoaded = false;
let projectOptions = [];

function setAccountMenu(open, { restoreFocus = false } = {}) {
  elements.accountMenu.hidden = !open;
  elements.accountMenuButton.setAttribute("aria-expanded", String(open));
  if (open) elements.settingsLink.focus();
  else if (restoreFocus) elements.accountMenuButton.focus();
}

function loadLegacyState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return null;
    return {
      tasks: Array.isArray(saved?.tasks) ? saved.tasks : [],
      logs: Array.isArray(saved?.logs) ? saved.logs : [],
      notes: saved?.notes && typeof saved.notes === "object" ? saved.notes : {},
      reviews: saved?.reviews && typeof saved.reviews === "object" ? saved.reviews : {},
      periodReviews: {},
      projectReviews: {},
      projectPeriodReviews: {},
    };
  } catch {
    return null;
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? "服务器请求失败");
    error.code = body?.error?.code;
    error.status = response.status;
    if (error.code === "AUTH_REQUIRED") window.location.replace("/login");
    throw error;
  }
  return body;
}

function setSaveIndicator(label, failed = false) {
  const indicator = document.querySelector(".save-state");
  if (!indicator) return;
  indicator.classList.toggle("failed", failed);
  indicator.innerHTML = `<i></i> ${label}`;
}

function persist({ defer = false, onSaved, onError } = {}) {
  setSaveIndicator("保存中…");
  window.clearTimeout(deferredSaveTimer);
  if (defer) {
    deferredSaveTimer = window.setTimeout(() => queueSave({ onSaved, onError }), 400);
    return;
  }
  queueSave({ onSaved, onError });
}

function queueSave({ onSaved, onError } = {}) {
  window.clearTimeout(deferredSaveTimer);
  const snapshot = structuredClone(state);
  const queuedEpoch = saveEpoch;
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    if (queuedEpoch !== saveEpoch) return;
    try {
      const result = await requestJson("/api/state", {
        method: "PUT",
        body: JSON.stringify({ data: snapshot, revision }),
      });
      revision = result.revision;
      setSaveIndicator("已保存到 SQLite");
      onSaved?.();
      window.clearTimeout(saveStateTimer);
      saveStateTimer = window.setTimeout(() => {
        setSaveIndicator("已保存到 SQLite");
      }, 450);
    } catch (error) {
      if (error.code === "STATE_CONFLICT") {
        saveEpoch += 1;
        await reloadServerState();
        showToast("检测到其他页面的更新，已载入最新数据");
        return;
      }
      setSaveIndicator("保存失败", true);
      onError?.(error);
      showToast(`保存失败：${error.message}`);
    }
  });
}

async function reloadServerState() {
  const result = await requestJson("/api/state");
  state = result.data;
  revision = result.revision;
  render();
}

async function bootstrap() {
  setSaveIndicator("正在连接 SQLite…");
  try {
    const auth = await requestJson("/api/auth/status");
    elements.accountMenuButton.hidden = false;
    elements.logoutButton.hidden = !auth.enabled;
    let result = await requestJson("/api/state");
    const legacyState = localStorage.getItem(MIGRATION_KEY) ? null : loadLegacyState();

    if (result.migrationAllowed && legacyState) {
      try {
        const migration = await requestJson("/api/migrate", {
          method: "POST",
          body: JSON.stringify({ data: legacyState }),
        });
        localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
        result = migration;
        if (migration.migrated) showToast("旧版浏览器数据已迁移到 SQLite");
      } catch (migrationError) {
        localStorage.setItem(MIGRATION_KEY, `failed:${new Date().toISOString()}`);
        showToast(`旧数据迁移失败，已保留浏览器备份：${migrationError.message}`);
      }
    }

    state = result.data;
    revision = result.revision;
    try {
      await Promise.all([loadAiProviders(), loadAiSummarySettings(), loadProjectOptions()]);
    } catch (aiError) {
      elements.aiTestResult.textContent = `AI 配置加载失败：${aiError.message}`;
      elements.aiTestResult.className = "ai-test-result failed";
    }
    setSaveIndicator("已连接 SQLite");
    render();
  } catch (error) {
    setSaveIndicator("数据库连接失败", true);
    showToast(`加载失败：${error.message}`);
    render();
  }
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

function resolveRoute(pathname) {
  return ROUTES[normalizePath(pathname)] ?? ROUTES["/"];
}

function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value ?? "";
  return container.innerHTML;
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatFullDate(date) {
  const day = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(date);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(date);
  return `${day} · ${weekday}`;
}

function formatCalendarAriaLabel(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

function render() {
  renderProjectChoices();
  renderRoute();
  renderDate();
  renderTasks();
  renderTimeline();
  renderNotes();
  renderReview();
  renderProgress();
  renderSummary();
  renderAiSettings();
}

function availableProjects() {
  return [...new Set([
    ...projectOptions,
    ...state.tasks.map((task) => task.project?.trim()),
    ...state.logs.map((log) => log.project?.trim()),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function replaceProjectOptions(select, menu, value) {
  const projects = availableProjects();
  const fragment = document.createDocumentFragment();
  fragment.append(new Option("全部项目", ""));
  projects.forEach((project) => fragment.append(new Option(project, project)));
  select.replaceChildren(fragment);
  select.value = projects.includes(value) ? value : "";
  menu.innerHTML = [
    '<button class="capture-select-option" type="button" role="option" data-value="" aria-selected="false">全部项目</button>',
    ...projects.map((project) => `<button class="capture-select-option" type="button" role="option" data-value="${escapeAttribute(project)}" aria-selected="false">${escapeHtml(project)}</button>`),
    '<div class="capture-select-divider" role="separator"></div><button class="capture-select-manage" type="button" data-manage-projects><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>管理项目</button>',
  ].join("");
  syncCaptureSelect(select.closest("[data-capture-select]"));
  return select.value;
}

function renderProjectChoices() {
  summaryProject = replaceProjectOptions(elements.summaryProjectFilter, elements.summaryProjectMenu, summaryProject);
}

function renderCaptureProjectOptions(preferredValue = elements.projectSelect.value) {
  const selected = projectOptions.includes(preferredValue) ? preferredValue : "";
  const selectFragment = document.createDocumentFragment();
  selectFragment.append(new Option("无项目", ""));
  projectOptions.forEach((project) => selectFragment.append(new Option(project, project)));
  elements.projectSelect.replaceChildren(selectFragment);
  elements.projectSelect.value = selected;

  elements.projectSelectMenu.innerHTML = [
    '<button class="capture-select-option" type="button" role="option" data-value="" aria-selected="false">无项目</button>',
    ...projectOptions.map((project) => `<button class="capture-select-option" type="button" role="option" data-value="${escapeAttribute(project)}" aria-selected="false">${escapeHtml(project)}</button>`),
    '<div class="capture-select-divider" role="separator"></div><button class="capture-select-manage" type="button" data-manage-projects><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>管理项目</button>',
  ].join("");
  syncCaptureSelect(elements.projectSelect.closest("[data-capture-select]"));
}

async function loadProjectOptions() {
  const result = await requestJson("/api/projects");
  projectOptions = result.projects;
  renderCaptureProjectOptions();
  renderProjectChoices();
  renderProjectManager();
}

function renderProjectManager() {
  if (!projectOptions.length) {
    elements.projectOptionList.innerHTML = '<div class="project-option-empty">还没有项目选项，先在上方添加一个吧。</div>';
    return;
  }
  elements.projectOptionList.innerHTML = projectOptions.map((project, index) => `
    <div class="project-option-row" data-name="${escapeAttribute(project)}">
      <span class="project-option-order">${index + 1}</span>
      <input maxlength="80" value="${escapeAttribute(project)}" aria-label="项目名称：${escapeAttribute(project)}" />
      <div class="project-option-actions">
        <button type="button" data-project-action="up" ${index === 0 ? "disabled" : ""} aria-label="上移项目：${escapeAttribute(project)}">↑</button>
        <button type="button" data-project-action="down" ${index === projectOptions.length - 1 ? "disabled" : ""} aria-label="下移项目：${escapeAttribute(project)}">↓</button>
        <button type="button" class="danger" data-project-action="delete" aria-label="删除项目：${escapeAttribute(project)}">删除</button>
      </div>
    </div>
  `).join("");
}

function openProjectDialog() {
  closeCaptureSelects();
  renderProjectManager();
  elements.projectDialog.hidden = false;
  elements.projectDialogState.textContent = "";
  elements.projectNewName.focus();
}

function closeProjectDialog() {
  if (elements.projectDialog.hidden) return;
  elements.projectDialog.hidden = true;
  elements.projectSelect.closest("[data-capture-select]").querySelector(".capture-select-trigger").focus();
}

function renderRoute() {
  document.body.dataset.route = currentRoute.key;
  document.title = currentRoute.title;
  elements.navItems.forEach((item) => {
    const active = item.dataset.route === currentRoute.key;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  const settingsActive = currentRoute.key === "ai-settings";
  elements.settingsLink.classList.toggle("active", settingsActive);
  if (settingsActive) elements.settingsLink.setAttribute("aria-current", "page");
  else elements.settingsLink.removeAttribute("aria-current");

  if (currentRoute.key === "tasks" && captureType !== "task") setCaptureType("task", { focus: false });
  if (currentRoute.key === "timeline" && captureType !== "log") setCaptureType("log", { focus: false });
}

function renderDate() {
  const date = fromDateKey(selectedDate);
  const today = toDateKey(new Date());
  elements.dateLabel.textContent = formatFullDate(date);
  elements.todayButton.hidden = selectedDate === today;
  const englishDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date).toUpperCase();
  elements.dayContext.textContent = currentRoute.key === "today"
    ? englishDate
    : `${currentRoute.eyebrow} · ${englishDate}`;

  const hour = new Date().getHours();
  const salutation = hour < 6 ? "夜深了" : hour < 12 ? "上午好" : hour < 18 ? "下午好" : "晚上好";
  if (currentRoute.heading) {
    elements.greeting.textContent = currentRoute.heading;
  } else if (selectedDate === today) {
    elements.greeting.textContent = `${salutation}，今天想推进什么？`;
  } else {
    elements.greeting.textContent = "回看这一天，留下了什么？";
  }
  elements.welcomeCopy.textContent = currentRoute.copy;
  elements.footerDate.textContent = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  renderCalendar();
}

function renderCalendar(focusDateKey = null) {
  const selected = fromDateKey(selectedDate);
  elements.calendarSelectedLabel.textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(selected);
  elements.calendarSelectedYear.textContent = String(selected.getFullYear());
  elements.calendarMonthLabel.textContent = `${calendarCursor.getFullYear()}年${calendarCursor.getMonth() + 1}月`;

  const firstDay = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayOffset);
  const todayKey = toDateKey(new Date());
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = toDateKey(date);
    const button = document.createElement("button");
    const isSelected = dateKey === selectedDate;
    const isToday = dateKey === todayKey;
    const isOtherMonth = date.getMonth() !== calendarCursor.getMonth();
    button.type = "button";
    button.className = `calendar-day${isSelected ? " selected" : ""}${isToday ? " today" : ""}${isOtherMonth ? " other-month" : ""}`;
    button.dataset.date = dateKey;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", formatCalendarAriaLabel(date));
    button.setAttribute("aria-selected", String(isSelected));
    if (isToday) button.setAttribute("aria-current", "date");
    button.tabIndex = dateKey === (focusDateKey ?? selectedDate) ? 0 : -1;
    button.textContent = String(date.getDate());
    fragment.append(button);
  }

  elements.calendarGrid.replaceChildren(fragment);
}

function openCalendar() {
  const selected = fromDateKey(selectedDate);
  calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
  elements.calendarPopover.hidden = false;
  elements.datePickerButton.setAttribute("aria-expanded", "true");
  elements.datePickerButton.classList.add("active");
  renderCalendar(selectedDate);
  window.requestAnimationFrame(() => {
    elements.calendarGrid.querySelector(`[data-date="${selectedDate}"]`)?.focus();
  });
}

function closeCalendar({ restoreFocus = false } = {}) {
  elements.calendarPopover.hidden = true;
  elements.datePickerButton.setAttribute("aria-expanded", "false");
  elements.datePickerButton.classList.remove("active");
  if (restoreFocus) elements.datePickerButton.focus();
}

function shiftCalendarMonth(offset) {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + offset, 1);
  renderCalendar();
}

function selectCalendarDate(dateKey) {
  selectedDate = dateKey;
  const selected = fromDateKey(dateKey);
  calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
  closeCalendar();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function focusCalendarDate(dateKey) {
  const date = fromDateKey(dateKey);
  calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1);
  renderCalendar(dateKey);
  window.requestAnimationFrame(() => {
    elements.calendarGrid.querySelector(`[data-date="${dateKey}"]`)?.focus();
  });
}

function renderTasks() {
  const tasks = state.tasks
    .filter((task) => task.date === selectedDate)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || priorityWeight(b.priority) - priorityWeight(a.priority) || a.createdAt.localeCompare(b.createdAt));

  const filteredTasks = tasks.filter((task) => {
    if (taskFilter === "open") return !task.completed;
    if (taskFilter === "done") return task.completed;
    return true;
  });

  elements.taskCount.textContent = String(tasks.filter((task) => !task.completed).length);
  elements.taskList.replaceChildren();

  if (!filteredTasks.length) {
    const empty = elements.emptyTaskTemplate.content.cloneNode(true);
    if (tasks.length && taskFilter !== "all") {
      empty.querySelector("strong").textContent = taskFilter === "done" ? "还没有完成的待办" : "没有进行中的待办";
      empty.querySelector("p").textContent = "切换筛选条件查看其他事项。";
    }
    elements.taskList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  filteredTasks.forEach((task) => {
    const item = document.createElement("article");
    item.className = `task-item${task.completed ? " completed" : ""}`;
    item.dataset.id = task.id;
    const priorityLabel = task.priority === "high" ? "重要" : task.priority === "low" ? "稍后" : "普通";
    const project = task.project ? `<span class="project-chip"># ${escapeHtml(task.project)}</span>` : "";
    const priority = task.priority !== "normal" ? `<span class="priority-chip ${task.priority}">${priorityLabel}</span>` : "";
    item.innerHTML = `
      <button class="task-check" type="button" aria-label="${task.completed ? "恢复" : "完成"}待办：${escapeHtml(task.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8"/></svg>
      </button>
      <div class="task-body">
        <p class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</p>
        <div class="task-meta">${project}${priority}<span>${formatTime(task.createdAt)}</span></div>
      </div>
      <button class="item-menu delete-task" type="button" aria-label="删除待办：${escapeHtml(task.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13M10 11v5M14 11v5"/></svg>
      </button>`;
    fragment.append(item);
  });
  elements.taskList.append(fragment);
}

function priorityWeight(priority) {
  return priority === "high" ? 2 : priority === "normal" ? 1 : 0;
}

function renderTimeline() {
  const logs = state.logs
    .filter((log) => log.date === selectedDate)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  elements.logCount.textContent = String(logs.length);
  elements.timelineList.replaceChildren();
  if (!logs.length) {
    elements.timelineList.append(elements.emptyLogTemplate.content.cloneNode(true));
    return;
  }

  const fragment = document.createDocumentFragment();
  logs.forEach((log) => {
    const item = document.createElement("article");
    item.className = `timeline-item${log.sourceTaskId ? " auto" : ""}`;
    item.dataset.id = log.id;
    item.innerHTML = `
      <time class="timeline-time">${formatTime(log.createdAt)}</time>
      <i class="timeline-dot"></i>
      <div class="timeline-content">
        <p title="${escapeHtml(log.title)}">${escapeHtml(log.title)}</p>
        <small>${log.sourceTaskId ? "完成待办" : "手动记录"}${log.project ? ` · ${escapeHtml(log.project)}` : ""}</small>
      </div>
      <button class="item-menu delete-log" type="button" aria-label="删除记录：${escapeHtml(log.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13M10 11v5M14 11v5"/></svg>
      </button>`;
    fragment.append(item);
  });
  elements.timelineList.append(fragment);
}

function renderNotes() {
  const note = state.notes[selectedDate] ?? "";
  if (elements.dailyNote.value !== note) elements.dailyNote.value = note;
  elements.noteCount.textContent = `${note.length} / 2000`;
}

function setOwnValue(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

function readDailyReview(date = selectedDate) {
  return state.reviews[date];
}

function writeDailyReview(date, review) {
  state.reviews[date] = review;
}

function readPeriodReview(context, project = summaryProject) {
  const key = `${summaryPeriod}:${context.startKey}`;
  return project ? state.projectPeriodReviews?.[key]?.[project] : state.periodReviews[key];
}

function writePeriodReview(context, project, review) {
  const key = `${summaryPeriod}:${context.startKey}`;
  if (!project) {
    state.periodReviews[key] = review;
    return;
  }
  state.projectPeriodReviews ??= {};
  if (!Object.hasOwn(state.projectPeriodReviews, key)) {
    setOwnValue(state.projectPeriodReviews, key, Object.create(null));
  }
  setOwnValue(state.projectPeriodReviews[key], project, review);
}

function renderReview() {
  const review = readDailyReview() ?? {};
  elements.reviewWins.value = review.wins ?? "";
  elements.reviewBlockers.value = review.blockers ?? "";
  elements.reviewNext.value = review.next ?? "";
  elements.reviewTitle.textContent = "给今天一个交代";
  elements.reviewState.textContent = review.completedAt ? `已于 ${formatTime(review.completedAt)} 完成复盘` : "内容会自动保存";
  elements.saveReview.textContent = review.completedAt ? "更新今日复盘" : "完成今日复盘";
}

function renderProgress() {
  const tasks = state.tasks.filter((task) => task.date === selectedDate);
  const completed = tasks.filter((task) => task.completed).length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const circumference = 2 * Math.PI * 31;
  elements.scoreRing.style.strokeDashoffset = String(circumference * (1 - progress / 100));
  elements.scoreNumber.textContent = `${progress}%`;
}

function startOfPeriod(type, anchor) {
  const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (type === "week") date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  if (type === "month") date.setDate(1);
  if (type === "quarter") date.setMonth(Math.floor(date.getMonth() / 3) * 3, 1);
  if (type === "year") date.setMonth(0, 1);
  return date;
}

function endOfPeriod(type, start) {
  const end = new Date(start);
  if (type === "week") end.setDate(end.getDate() + 6);
  if (type === "month") end.setMonth(end.getMonth() + 1, 0);
  if (type === "quarter") end.setMonth(end.getMonth() + 3, 0);
  if (type === "year") end.setFullYear(end.getFullYear() + 1, 0, 0);
  return end;
}

function shiftPeriod(type, anchor, offset) {
  const shifted = startOfPeriod(type, anchor);
  if (type === "week") shifted.setDate(shifted.getDate() + offset * 7);
  if (type === "month") shifted.setMonth(shifted.getMonth() + offset);
  if (type === "quarter") shifted.setMonth(shifted.getMonth() + offset * 3);
  if (type === "year") shifted.setFullYear(shifted.getFullYear() + offset);
  return shifted;
}

function daysBetween(start, end) {
  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function getSummaryContext() {
  const start = startOfPeriod(summaryPeriod, summaryAnchor);
  const end = endOfPeriod(summaryPeriod, start);
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const matchesProject = (item) => !summaryProject || item.project === summaryProject;
  const tasks = state.tasks.filter((task) => task.date >= startKey && task.date <= endKey && matchesProject(task));
  const logs = state.logs.filter((log) => log.date >= startKey && log.date <= endKey && matchesProject(log));
  const days = daysBetween(start, end);
  const activeDays = days.filter((date) => (
    tasks.some((task) => task.date === date)
    || logs.some((log) => log.date === date)
    || (!summaryProject && Boolean(state.notes[date]?.trim()))
    || (!summaryProject && Boolean(Object.values(state.reviews[date] ?? {})
      .some((value) => typeof value === "string" && value.trim())))
  ));
  return { start, end, startKey, endKey, tasks, logs, days, activeDays };
}

function formatPeriodHeading(type, start) {
  if (type === "week") {
    const thursday = new Date(start);
    thursday.setDate(thursday.getDate() + 3);
    const weekYear = thursday.getFullYear();
    const firstWeekStart = startOfPeriod("week", new Date(weekYear, 0, 4));
    const week = Math.round((start - firstWeekStart) / 604800000) + 1;
    return `${weekYear}年第${week}周`;
  }
  const year = start.getFullYear();
  if (type === "month") return `${year}年${start.getMonth() + 1}月`;
  if (type === "quarter") return `${year}年第${Math.floor(start.getMonth() / 3) + 1}季度`;
  return `${year}年`;
}

function formatShortDate(date, includeYear = false) {
  return new Intl.DateTimeFormat("zh-CN", {
    ...(includeYear ? { year: "numeric" } : {}),
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function makeTrendBuckets(context) {
  const bucketSize = summaryPeriod === "quarter" ? 7 : summaryPeriod === "year" ? null : 1;
  const buckets = [];
  if (summaryPeriod === "year") {
    for (let month = 0; month < 12; month += 1) {
      const start = new Date(context.start.getFullYear(), month, 1);
      const end = new Date(context.start.getFullYear(), month + 1, 0);
      buckets.push({ label: `${month + 1}月`, start: toDateKey(start), end: toDateKey(end) });
    }
  } else {
    for (let index = 0; index < context.days.length; index += bucketSize) {
      const slice = context.days.slice(index, index + bucketSize);
      const start = fromDateKey(slice[0]);
      const label = summaryPeriod === "week"
        ? new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(start)
        : summaryPeriod === "month"
          ? String(start.getDate())
          : `${start.getMonth() + 1}/${start.getDate()}`;
      buckets.push({ label, start: slice[0], end: slice.at(-1) });
    }
  }
  return buckets.map((bucket) => ({
    ...bucket,
    value: context.tasks.filter((task) => task.date >= bucket.start && task.date <= bucket.end && task.completed).length
      + context.logs.filter((log) => log.date >= bucket.start && log.date <= bucket.end && !log.sourceTaskId).length,
  }));
}

function renderTrend(context) {
  const buckets = makeTrendBuckets(context);
  const maxValue = Math.max(1, ...buckets.map((bucket) => bucket.value));
  elements.summaryTrend.innerHTML = buckets.map((bucket) => `
    <div class="trend-column" title="${escapeHtml(bucket.label)}：${bucket.value} 项">
      <span class="trend-value">${bucket.value || ""}</span>
      <i style="height:${Math.max(6, Math.round((bucket.value / maxValue) * 100))}%"></i>
      <small>${escapeHtml(bucket.label)}</small>
    </div>
  `).join("");
}

function renderProjects(context) {
  const counts = new Map();
  context.tasks.forEach((task) => counts.set(task.project || "未分类", (counts.get(task.project || "未分类") ?? 0) + 1));
  context.logs.filter((log) => !log.sourceTaskId).forEach((log) => counts.set(log.project || "未分类", (counts.get(log.project || "未分类") ?? 0) + 1));
  const projects = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = projects.reduce((sum, [, count]) => sum + count, 0);
  if (!projects.length) {
    elements.summaryProjects.innerHTML = '<div class="summary-empty">这个周期还没有项目记录</div>';
    return;
  }
  elements.summaryProjects.innerHTML = projects.map(([name, count], index) => `
    <div class="project-row">
      <span><i class="project-color color-${index % 4}"></i>${escapeHtml(name)}</span>
      <div><i style="width:${Math.round((count / total) * 100)}%"></i></div>
      <strong>${count}</strong>
    </div>
  `).join("");
}

function renderSummaryList(element, items, emptyText) {
  if (!items.length) {
    element.innerHTML = `<div class="summary-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  element.innerHTML = items.slice(0, 12).map((item) => `
    <div class="summary-list-item"><i></i><span>${escapeHtml(item.title)}</span><time>${escapeHtml(item.date.slice(5).replace("-", "/"))}</time></div>
  `).join("");
}

function renderSummaryReview(context) {
  const review = readPeriodReview(context) ?? {};
  if (elements.summaryWins.value !== (review.wins ?? "")) elements.summaryWins.value = review.wins ?? "";
  if (elements.summaryBlockers.value !== (review.blockers ?? "")) elements.summaryBlockers.value = review.blockers ?? "";
  if (elements.summaryNextActions.value !== (review.next ?? "")) elements.summaryNextActions.value = review.next ?? "";
  const periodLabel = PERIODS[summaryPeriod].reviewLabel;
  elements.summaryReviewTitle.textContent = `${formatPeriodHeading(summaryPeriod, context.start)}${summaryProject ? ` · ${summaryProject}` : ""}复盘`;
  elements.summaryReviewState.textContent = review.completedAt ? `已于 ${formatTime(review.completedAt)} 完成复盘` : "内容会自动保存";
  elements.saveSummaryReview.textContent = review.completedAt ? `更新${periodLabel}复盘` : `完成${periodLabel}复盘`;
}

function renderSummary() {
  if (currentRoute.key !== "summary") return;
  state.periodReviews ??= {};
  state.projectPeriodReviews ??= {};
  const context = getSummaryContext();
  const completed = context.tasks.filter((task) => task.completed).length;
  const currentStart = startOfPeriod(summaryPeriod, new Date());
  const isCurrent = context.startKey === toDateKey(currentStart);
  elements.periodTabs.forEach((tab) => {
    const active = tab.dataset.period === summaryPeriod;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
  elements.summaryPeriodLabel.textContent = formatPeriodHeading(summaryPeriod, context.start);
  elements.summaryPeriodRange.textContent = `${formatShortDate(context.start, context.start.getFullYear() !== context.end.getFullYear())} — ${formatShortDate(context.end, true)}`;
  elements.summaryCurrent.hidden = isCurrent;
  elements.summaryCompleted.textContent = String(completed);
  elements.summaryTaskTotal.textContent = `共 ${context.tasks.length} 项`;
  elements.summaryRate.textContent = `${context.tasks.length ? Math.round((completed / context.tasks.length) * 100) : 0}%`;
  elements.summaryLogs.textContent = String(context.logs.length);
  elements.summaryActiveDays.textContent = String(context.activeDays.length);
  elements.summaryDaysTotal.textContent = `共 ${context.days.length} 天`;
  renderTrend(context);
  renderProjects(context);
  const achievements = [
    ...context.tasks.filter((task) => task.completed).map((task) => ({ title: task.title, date: task.date })),
    ...context.logs.filter((log) => !log.sourceTaskId).map((log) => ({ title: log.title, date: log.date })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const openItems = context.tasks.filter((task) => !task.completed).sort((a, b) => a.date.localeCompare(b.date));
  renderSummaryList(elements.summaryAchievements, achievements, "这个周期还没有可展示的成果");
  renderSummaryList(elements.summaryOpenItems, openItems, "这个周期没有未完成事项");
  renderSummaryReview(context);
}

function saveSummaryReviewDraft({ defer = false } = {}) {
  const context = getSummaryContext();
  const previous = readPeriodReview(context) ?? {};
  writePeriodReview(context, summaryProject, {
    ...previous,
    wins: elements.summaryWins.value,
    blockers: elements.summaryBlockers.value,
    next: elements.summaryNextActions.value,
  });
  const saveVersion = ++summarySaveVersion;
  elements.summaryReviewState.textContent = "保存中…";
  persist({
    defer,
    onSaved: () => {
      if (saveVersion === summarySaveVersion) elements.summaryReviewState.textContent = "已保存到 SQLite";
    },
    onError: () => {
      if (saveVersion === summarySaveVersion) elements.summaryReviewState.textContent = "保存失败，请重试";
    },
  });
}

function generateSummaryReview() {
  const context = getSummaryContext();
  const achievements = [
    ...context.tasks.filter((task) => task.completed).map((task) => task.title),
    ...context.logs.filter((log) => !log.sourceTaskId).map((log) => log.title),
  ];
  const openItems = context.tasks.filter((task) => !task.completed).map((task) => task.title);
  if (!achievements.length && !openItems.length) {
    showToast(`${summaryProject || "这个周期"}还没有工作记录可供整理`);
    return;
  }
  if ((elements.summaryWins.value.trim() || elements.summaryNextActions.value.trim())
    && !window.confirm("生成初稿会覆盖已有的主要成果和下一周期重点，是否继续？")) return;
  elements.summaryWins.value = achievements.slice(0, 12).map((title) => `• ${title}`).join("\n");
  elements.summaryNextActions.value = openItems.slice(0, 8).map((title) => `• ${title}`).join("\n");
  saveSummaryReviewDraft();
  showToast("已根据周期记录生成复盘初稿");
}

function setAiSummaryLoading(loading) {
  aiSummaryLoading = loading;
  elements.generateAiSummary.disabled = loading;
  elements.generateSummaryReview.disabled = loading;
  elements.generateAiSummary.classList.toggle("loading", loading);
  elements.generateAiSummary.querySelector("span").textContent = loading ? "AI 正在整理…" : "AI 总结";
  elements.generateAiSummary.setAttribute("aria-busy", String(loading));
}

async function generateAiSummary() {
  if (aiSummaryLoading) return;
  const fields = [elements.summaryWins, elements.summaryBlockers, elements.summaryNextActions];
  const existingValues = fields.map((field) => field.value);
  if (existingValues.some((value) => value.trim())
    && !window.confirm("AI 总结会覆盖当前三个复盘输入框的内容，是否继续？")) return;
  const context = getSummaryContext();
  const requestedPeriod = summaryPeriod;
  const requestedProject = summaryProject;
  setAiSummaryLoading(true);
  elements.summaryReviewState.textContent = "AI 正在整理当前周期…";
  try {
    const result = await requestJson("/api/ai/period-summary", {
      method: "POST",
      body: JSON.stringify({
        periodType: requestedPeriod,
        periodStart: context.startKey,
        ...(requestedProject ? { project: requestedProject } : {}),
      }),
    });
    const currentContext = getSummaryContext();
    if (summaryPeriod !== requestedPeriod || summaryProject !== requestedProject || currentContext.startKey !== context.startKey) {
      elements.summaryReviewState.textContent = "周期已切换，本次 AI 结果未填入";
      showToast("周期已切换，请在当前周期重新生成 AI 总结");
      return;
    }
    if (fields.some((field, index) => field.value !== existingValues[index])) {
      elements.summaryReviewState.textContent = "内容已被编辑，本次 AI 结果未覆盖";
      showToast("检测到你正在编辑，AI 结果未覆盖当前内容");
      return;
    }
    elements.summaryWins.value = result.summary.wins;
    elements.summaryBlockers.value = result.summary.blockers;
    elements.summaryNextActions.value = result.summary.next;
    elements.summaryReviewState.textContent = `由 ${result.provider} · ${result.model} 生成，检查后保存`;
    showToast("AI 总结已生成，请检查修改后保存");
  } catch (error) {
    elements.summaryReviewState.textContent = "AI 总结失败，原内容未改变";
    if (["AI_DEFAULT_PROVIDER_MISSING", "AI_KEY_MISSING", "AI_KEY_UNREADABLE", "AI_MODEL_MISSING"].includes(error.code)) {
      showToast(`${error.message}，请前往 AI 设置`);
    } else {
      showToast(`AI 总结失败：${error.message}`);
    }
  } finally {
    setAiSummaryLoading(false);
  }
}

function completeSummaryReview() {
  const context = getSummaryContext();
  writePeriodReview(context, summaryProject, {
    wins: elements.summaryWins.value,
    blockers: elements.summaryBlockers.value,
    next: elements.summaryNextActions.value,
    completedAt: new Date().toISOString(),
  });
  const saveVersion = ++summarySaveVersion;
  elements.summaryReviewState.textContent = "保存中…";
  persist({
    onSaved: () => {
      if (saveVersion !== summarySaveVersion) return;
      renderSummaryReview(context);
      showToast("周期复盘已保存");
    },
    onError: () => {
      if (saveVersion === summarySaveVersion) elements.summaryReviewState.textContent = "保存失败，请重试";
    },
  });
}

async function loadAiProviders({ keepSelection = true } = {}) {
  const result = await requestJson("/api/ai/providers");
  aiProviders = result.providers;
  aiProvidersLoaded = true;
  if (!keepSelection || !aiProviders.some((provider) => provider.id === selectedAiProviderId)) {
    selectedAiProviderId = aiProviders.find((provider) => provider.isDefault)?.id ?? aiProviders[0]?.id ?? null;
  }
  renderAiSettings();
}

function renderAiSummarySettings(settings) {
  elements.aiSummaryPrompt.value = settings.promptExcerpt;
  elements.aiPromptCount.textContent = `${settings.promptExcerpt.length} / 4000`;
  elements.aiPromptMode.textContent = settings.isCustom ? "已自定义" : "默认";
  elements.aiPromptReset.disabled = !settings.isCustom;
  elements.aiPromptState.textContent = settings.isCustom ? "自定义撮要已保存到 SQLite" : "当前使用 MyDays 默认撮要";
}

async function loadAiSummarySettings() {
  const settings = await requestJson("/api/ai/summary-settings");
  aiSummarySettingsLoaded = true;
  renderAiSummarySettings(settings);
}

async function saveAiSummaryPrompt() {
  const promptExcerpt = elements.aiSummaryPrompt.value.trim();
  if (!promptExcerpt) {
    elements.aiPromptState.textContent = "提示词撮要不能为空；可使用恢复默认。";
    elements.aiSummaryPrompt.focus();
    return;
  }
  elements.aiPromptSave.disabled = true;
  elements.aiPromptState.textContent = "正在保存…";
  try {
    renderAiSummarySettings(await requestJson("/api/ai/summary-settings", {
      method: "PUT",
      body: JSON.stringify({ promptExcerpt }),
    }));
    showToast("AI 总结偏好已保存");
  } catch (error) {
    elements.aiPromptState.textContent = `保存失败：${error.message}`;
  } finally {
    elements.aiPromptSave.disabled = false;
  }
}

async function resetAiSummaryPrompt() {
  if (!window.confirm("确定恢复 MyDays 默认的 AI 总结撮要吗？")) return;
  elements.aiPromptReset.disabled = true;
  elements.aiPromptState.textContent = "正在恢复默认…";
  try {
    renderAiSummarySettings(await requestJson("/api/ai/summary-settings", { method: "DELETE" }));
    showToast("已恢复默认 AI 总结偏好");
  } catch (error) {
    elements.aiPromptState.textContent = `恢复失败：${error.message}`;
  }
}

async function addProjectOption(event) {
  event.preventDefault();
  const name = elements.projectNewName.value.trim();
  if (!name) {
    elements.projectDialogState.textContent = "请输入项目名称。";
    elements.projectNewName.focus();
    return;
  }
  try {
    const result = await requestJson("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
    projectOptions = result.projects;
    elements.projectNewName.value = "";
    renderCaptureProjectOptions(result.selected);
    renderProjectChoices();
    renderProjectManager();
    elements.projectDialogState.textContent = `已添加“${result.selected}”`;
  } catch (error) {
    elements.projectDialogState.textContent = error.message;
  }
}

async function renameProjectOption(row) {
  const currentName = row.dataset.name;
  const name = row.querySelector("input").value.trim();
  if (!name || name === currentName) {
    row.querySelector("input").value = currentName;
    return;
  }
  try {
    const selectedProject = elements.projectSelect.value;
    const result = await requestJson(`/api/projects/${encodeURIComponent(currentName)}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
    projectOptions = result.projects;
    renderCaptureProjectOptions(selectedProject === currentName ? result.selected : selectedProject);
    renderProjectChoices();
    renderProjectManager();
    elements.projectDialogState.textContent = `已将“${currentName}”重命名为“${result.selected}”；历史记录未修改。`;
  } catch (error) {
    row.querySelector("input").value = currentName;
    elements.projectDialogState.textContent = error.message;
  }
}

async function moveProjectOption(name, offset) {
  const index = projectOptions.indexOf(name);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= projectOptions.length) return;
  const next = [...projectOptions];
  [next[index], next[target]] = [next[target], next[index]];
  try {
    const result = await requestJson("/api/projects/order", { method: "PUT", body: JSON.stringify({ projects: next }) });
    projectOptions = result.projects;
    renderCaptureProjectOptions();
    renderProjectChoices();
    renderProjectManager();
    elements.projectDialogState.textContent = "项目顺序已保存";
  } catch (error) {
    elements.projectDialogState.textContent = error.message;
  }
}

async function removeProjectOption(name) {
  if (!window.confirm(`确定从下拉选项中删除“${name}”吗？历史记录不会改变。`)) return;
  try {
    const result = await requestJson(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
    projectOptions = result.projects;
    renderCaptureProjectOptions();
    renderProjectChoices();
    renderProjectManager();
    elements.projectDialogState.textContent = `已删除“${name}”选项；历史记录未修改。`;
  } catch (error) {
    elements.projectDialogState.textContent = error.message;
  }
}

function selectedAiProvider() {
  return aiProviders.find((provider) => provider.id === selectedAiProviderId) ?? null;
}

function clearAiModelOptions(providerId = null) {
  aiModelsRequestVersion += 1;
  aiModelsProviderId = providerId;
  elements.aiFetchModels.textContent = "获取模型";
  elements.aiModelOptions.hidden = true;
  elements.aiModelOptions.replaceChildren(new Option("选择模型…", ""));
}

function resetAiProviderForm() {
  selectedAiProviderId = null;
  clearAiModelOptions();
  elements.aiProviderForm.reset();
  elements.aiProviderProtocol.value = "openai";
  elements.aiProviderTimeout.value = "15";
  elements.aiAnthropicVersion.value = "2023-06-01";
  elements.aiMaxTokens.value = "16";
  elements.aiTestResult.className = "ai-test-result";
  elements.aiTestResult.textContent = "填写并保存配置后可以测试连接。";
  renderAiSettings();
  elements.aiProviderName.focus();
}

function renderAiSettings() {
  if (!elements.aiProviderList) return;
  const provider = selectedAiProvider();
  if (aiModelsProviderId !== (provider?.id ?? null)) clearAiModelOptions(provider?.id ?? null);
  elements.aiProviderCount.textContent = String(aiProviders.length);
  if (!aiProvidersLoaded) {
    elements.aiProviderList.innerHTML = '<div class="summary-empty">正在读取 AI 服务配置…</div>';
  } else if (!aiProviders.length) {
    elements.aiProviderList.innerHTML = '<div class="ai-provider-empty"><strong>还没有 AI 服务</strong><span>添加兼容服务后，就可以在这里测试连接。</span></div>';
  } else {
    elements.aiProviderList.innerHTML = aiProviders.map((entry) => `
      <button class="ai-provider-item${entry.id === selectedAiProviderId ? " active" : ""}" type="button" data-id="${escapeHtml(entry.id)}">
        <span class="ai-provider-icon">${entry.protocol === "openai" ? "O" : "C"}</span>
        <span><strong>${escapeHtml(entry.name)}</strong><small>${entry.protocol === "openai" ? "OpenAI" : "Claude"} · ${escapeHtml(entry.model)}</small></span>
        <span class="ai-provider-badges">${entry.isDefault ? '<i>默认</i>' : ""}${entry.hasApiKey ? '<i class="key">Key 已配置</i>' : '<i class="warning">缺少 Key</i>'}</span>
      </button>
    `).join("");
  }
  elements.aiEditorTitle.textContent = provider ? `编辑 ${provider.name}` : "添加 AI 服务";
  if (provider) {
    elements.aiProviderName.value = provider.name;
    elements.aiProviderProtocol.value = provider.protocol;
    elements.aiProviderBaseUrl.value = provider.baseUrl;
    elements.aiProviderModel.value = provider.model;
    elements.aiProviderTimeout.value = String(provider.timeoutMs / 1000);
    elements.aiProviderApiKey.value = "";
    elements.aiAnthropicVersion.value = provider.options?.anthropicVersion ?? "2023-06-01";
    elements.aiMaxTokens.value = String(provider.options?.maxTokens ?? 16);
    elements.aiKeyStatus.textContent = provider.hasApiKey
      ? `已有加密 Key（${provider.apiKeyMask}）；留空保存会保留原 Key。`
      : "尚未配置 Key，请填写后保存。";
  } else {
    elements.aiKeyStatus.textContent = "Key 仅提交给当前 MyDays 服务端，并使用 AES-256-GCM 加密。";
  }
  elements.aiAnthropicOption.hidden = elements.aiProviderProtocol.value !== "anthropic";
  elements.aiDeleteProvider.hidden = !provider;
  elements.aiClearKey.hidden = !provider?.hasApiKey;
  elements.aiSetDefault.hidden = !provider || provider.isDefault;
  elements.aiTestProvider.disabled = !provider || !provider.hasApiKey;
  elements.aiFetchModels.disabled = false;
  elements.aiModelStatus.textContent = provider?.hasApiKey
    ? "可手动填写，或从已保存服务获取模型列表。"
    : "填写 Base URL 和 API Key 后即可获取模型；无需先保存。";
}

async function fetchAiModels() {
  const provider = selectedAiProvider();
  const protocol = elements.aiProviderProtocol.value;
  const baseUrl = elements.aiProviderBaseUrl.value.trim();
  const apiKey = elements.aiProviderApiKey.value;
  const canReuseSavedKey = provider?.hasApiKey
    && protocol === provider.protocol
    && baseUrl.replace(/\/+$/, "") === provider.baseUrl.replace(/\/+$/, "")
    && !apiKey;
  if (!baseUrl) {
    elements.aiModelStatus.textContent = "请先填写 Base URL。";
    elements.aiProviderBaseUrl.focus();
    return;
  }
  if (!canReuseSavedKey && !apiKey) {
    elements.aiModelStatus.textContent = "请先填写 API Key；获取模型不会保存它。";
    elements.aiProviderApiKey.focus();
    return;
  }
  const providerId = canReuseSavedKey ? provider.id : null;
  const requestVersion = ++aiModelsRequestVersion;
  aiModelsProviderId = selectedAiProviderId;
  const currentModel = elements.aiProviderModel.value;
  elements.aiFetchModels.disabled = true;
  elements.aiFetchModels.textContent = "获取中…";
  elements.aiModelStatus.textContent = "正在安全获取模型列表…";
  try {
    const result = await requestJson(providerId ? `/api/ai/providers/${providerId}/models` : "/api/ai/models", {
      method: "POST",
      ...(providerId ? {} : {
        body: JSON.stringify({
          protocol,
          baseUrl,
          apiKey,
          timeoutMs: Number(elements.aiProviderTimeout.value) * 1000,
          options: { anthropicVersion: elements.aiAnthropicVersion.value },
        }),
      }),
    });
    if (requestVersion !== aiModelsRequestVersion) return;
    const fragment = document.createDocumentFragment();
    fragment.append(new Option(`选择模型（${result.models.length}）`, ""));
    result.models.forEach((model) => fragment.append(new Option(model.name ? `${model.name} · ${model.id}` : model.id, model.id)));
    elements.aiModelOptions.replaceChildren(fragment);
    elements.aiModelOptions.hidden = false;
    elements.aiModelStatus.textContent = `已获取 ${result.models.length} 个模型；选择后仍可手动修改。`;
  } catch (error) {
    if (requestVersion !== aiModelsRequestVersion) return;
    elements.aiProviderModel.value = currentModel;
    elements.aiModelStatus.textContent = `获取失败：${error.message}`;
  } finally {
    if (requestVersion !== aiModelsRequestVersion) return;
    elements.aiFetchModels.textContent = "获取模型";
    elements.aiFetchModels.disabled = false;
  }
}

function getAiProviderPayload() {
  const payload = {
    name: elements.aiProviderName.value,
    protocol: elements.aiProviderProtocol.value,
    baseUrl: elements.aiProviderBaseUrl.value,
    model: elements.aiProviderModel.value,
    timeoutMs: Number(elements.aiProviderTimeout.value) * 1000,
    options: {
      anthropicVersion: elements.aiAnthropicVersion.value,
      maxTokens: Number(elements.aiMaxTokens.value),
    },
  };
  if (elements.aiProviderApiKey.value) payload.apiKey = elements.aiProviderApiKey.value;
  return payload;
}

async function submitAiProvider(event) {
  event.preventDefault();
  const isNew = !selectedAiProviderId;
  elements.aiTestResult.className = "ai-test-result pending";
  elements.aiTestResult.textContent = "正在验证并保存配置…";
  try {
    const result = await requestJson(isNew ? "/api/ai/providers" : `/api/ai/providers/${selectedAiProviderId}`, {
      method: isNew ? "POST" : "PUT",
      body: JSON.stringify(getAiProviderPayload()),
    });
    selectedAiProviderId = result.provider.id;
    clearAiModelOptions(selectedAiProviderId);
    elements.aiProviderApiKey.value = "";
    await loadAiProviders();
    elements.aiTestResult.className = "ai-test-result success";
    elements.aiTestResult.textContent = "配置已安全保存到服务端。";
    showToast("AI 服务配置已保存");
  } catch (error) {
    elements.aiTestResult.className = "ai-test-result failed";
    elements.aiTestResult.textContent = error.message;
  }
}

async function testSelectedAiProvider() {
  if (!selectedAiProviderId) return;
  elements.aiTestResult.className = "ai-test-result pending";
  elements.aiTestResult.textContent = "正在发送最小连接测试，不会发送工作数据…";
  elements.aiTestProvider.disabled = true;
  try {
    const result = await requestJson(`/api/ai/providers/${selectedAiProviderId}/test`, { method: "POST" });
    elements.aiTestResult.className = "ai-test-result success";
    elements.aiTestResult.textContent = `连接成功 · ${result.model} · ${result.latencyMs} ms`;
  } catch (error) {
    elements.aiTestResult.className = "ai-test-result failed";
    elements.aiTestResult.textContent = error.message;
  } finally {
    elements.aiTestProvider.disabled = !selectedAiProvider()?.hasApiKey;
  }
}

async function setSelectedAiProviderDefault() {
  if (!selectedAiProviderId) return;
  try {
    await requestJson(`/api/ai/providers/${selectedAiProviderId}/default`, { method: "POST" });
    await loadAiProviders();
    showToast("默认 AI 服务已切换");
  } catch (error) {
    showToast(`切换失败：${error.message}`);
  }
}

async function deleteSelectedAiProvider() {
  const provider = selectedAiProvider();
  if (!provider || !window.confirm(`确定删除 AI 服务“${provider.name}”吗？此操作无法撤销。`)) return;
  try {
    await requestJson(`/api/ai/providers/${provider.id}`, { method: "DELETE" });
    selectedAiProviderId = null;
    await loadAiProviders();
    if (!aiProviders.length) resetAiProviderForm();
    showToast("AI 服务已删除");
  } catch (error) {
    showToast(`删除失败：${error.message}`);
  }
}

async function clearSelectedAiKey() {
  const provider = selectedAiProvider();
  if (!provider || !window.confirm(`确定清除“${provider.name}”保存的 API Key 吗？`)) return;
  try {
    await requestJson(`/api/ai/providers/${provider.id}/key`, { method: "DELETE" });
    await loadAiProviders();
    elements.aiTestResult.className = "ai-test-result";
    elements.aiTestResult.textContent = "API Key 已清除，重新填写并保存后才能测试连接。";
  } catch (error) {
    showToast(`清除失败：${error.message}`);
  }
}

function setCaptureType(type, { focus = true } = {}) {
  closeCaptureSelects();
  captureType = type;
  elements.captureTabs.forEach((tab) => {
    const active = tab.dataset.type === type;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  elements.priorityField.hidden = type !== "task";
  elements.captureInput.placeholder = type === "task"
    ? "写下需要完成的事，按 Enter 保存…"
    : "记录刚刚完成的工作，按 Enter 保存…";
  if (focus) elements.captureInput.focus();
}

function syncCaptureSelect(root) {
  const select = root.querySelector("select");
  const selectedOption = select.options[select.selectedIndex];
  const label = selectedOption?.textContent ?? "";
  const trigger = root.querySelector(".capture-select-trigger");
  root.querySelector(".capture-select-value").textContent = label;
  trigger.setAttribute("aria-label", `${trigger.dataset.label}：${label}`);
  root.querySelectorAll("[role='option']").forEach((option) => {
    option.setAttribute("aria-selected", String(option.dataset.value === select.value));
  });
  if (select === elements.prioritySelect) {
    root.classList.toggle("is-high", select.value === "high");
    root.classList.toggle("is-low", select.value === "low");
  }
}

function closeCaptureSelect(root, { restoreFocus = false } = {}) {
  const trigger = root.querySelector(".capture-select-trigger");
  const menu = root.querySelector(".capture-select-menu");
  if (menu.hidden) return;
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  root.classList.remove("is-open");
  if (restoreFocus) trigger.focus();
}

function closeCaptureSelects(except = null) {
  elements.captureSelects.forEach((root) => {
    if (root !== except) closeCaptureSelect(root);
  });
}

function focusCaptureOption(root, position = "selected") {
  const options = [...root.querySelectorAll("[role='option']")];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.getAttribute("aria-selected") === "true"));
  const index = position === "first" ? 0 : position === "last" ? options.length - 1 : selectedIndex;
  options[index]?.focus();
}

function openCaptureSelect(root, { focus = "selected" } = {}) {
  closeCaptureSelects(root);
  const trigger = root.querySelector(".capture-select-trigger");
  const menu = root.querySelector(".capture-select-menu");
  syncCaptureSelect(root);
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  root.classList.add("is-open");
  window.requestAnimationFrame(() => focusCaptureOption(root, focus));
}

function chooseCaptureOption(root, option) {
  const select = root.querySelector("select");
  select.value = option.dataset.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  closeCaptureSelect(root, { restoreFocus: true });
}

function moveCaptureOptionFocus(root, offset) {
  const options = [...root.querySelectorAll("[role='option']")];
  const currentIndex = options.indexOf(document.activeElement);
  const nextIndex = (Math.max(0, currentIndex) + offset + options.length) % options.length;
  options[nextIndex]?.focus();
}

function navigateTo(pathname, { replace = false } = {}) {
  const normalizedPath = normalizePath(pathname);
  const nextRoute = ROUTES[normalizedPath];
  if (!nextRoute) return;
  closeCaptureSelects();
  if (replace) window.history.replaceState({}, "", normalizedPath);
  else window.history.pushState({}, "", normalizedPath);
  currentRoute = nextRoute;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function changeDate(offset) {
  const date = fromDateKey(selectedDate);
  date.setDate(date.getDate() + offset);
  selectedDate = toDateKey(date);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function addCapture(event) {
  event.preventDefault();
  const title = elements.captureInput.value.trim();
  if (!title) {
    elements.captureInput.focus();
    showToast("先写下一件事吧");
    return;
  }

  const project = elements.projectSelect.value;
  const previousDraft = makeDailyReviewDraft(selectedDate);
  const now = new Date().toISOString();
  if (captureType === "task") {
    state.tasks.push({
      id: makeId(),
      date: selectedDate,
      title,
      project,
      priority: elements.prioritySelect.value,
      completed: false,
      createdAt: now,
    });
    showToast("待办已加入今天");
  } else {
    state.logs.push({
      id: makeId(),
      date: selectedDate,
      title,
      project,
      createdAt: now,
    });
    showToast("工作记录已保存");
  }

  elements.captureInput.value = "";
  reconcileDailyReview(selectedDate, previousDraft);
  persist();
  render();
  elements.captureInput.focus();
}

function toggleTask(id) {
  const task = state.tasks.find((entry) => entry.id === id);
  if (!task) return;
  const previousDraft = makeDailyReviewDraft(task.date);
  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : null;

  if (task.completed) {
    state.logs.push({
      id: makeId(),
      date: task.date,
      title: task.title,
      project: task.project,
      sourceTaskId: task.id,
      createdAt: task.completedAt,
    });
    showToast("做得好，已记入工作时间线");
  } else {
    state.logs = state.logs.filter((log) => log.sourceTaskId !== task.id);
    showToast("待办已恢复为进行中");
  }
  reconcileDailyReview(task.date, previousDraft);
  persist();
  render();
}

function deleteTask(id) {
  const task = state.tasks.find((entry) => entry.id === id);
  if (!task || !window.confirm(`确定删除待办“${task.title}”吗？`)) return;
  const previousDraft = makeDailyReviewDraft(task.date);
  state.tasks = state.tasks.filter((entry) => entry.id !== id);
  state.logs = state.logs.filter((log) => log.sourceTaskId !== id);
  reconcileDailyReview(task.date, previousDraft);
  persist();
  render();
  showToast("待办已删除");
}

function deleteLog(id) {
  const log = state.logs.find((entry) => entry.id === id);
  if (!log || !window.confirm(`确定删除工作记录“${log.title}”吗？`)) return;
  const previousDraft = makeDailyReviewDraft(log.date);
  state.logs = state.logs.filter((entry) => entry.id !== id);
  reconcileDailyReview(log.date, previousDraft);
  persist();
  render();
  showToast("工作记录已删除");
}

function saveReviewDraft({ defer = false } = {}) {
  const previous = readDailyReview() ?? {};
  writeDailyReview(selectedDate, {
    ...previous,
    wins: elements.reviewWins.value,
    blockers: elements.reviewBlockers.value,
    next: elements.reviewNext.value,
  });
  persist({ defer });
  elements.reviewState.textContent = "草稿已自动保存";
}

function makeDailyReviewDraft(date = selectedDate) {
  const completed = state.tasks.filter((task) => task.date === date && task.completed);
  const manualLogs = state.logs.filter((log) => log.date === date && !log.sourceTaskId);
  const openTasks = state.tasks.filter((task) => task.date === date && !task.completed);
  const wins = [...completed.map((task) => task.title), ...manualLogs.map((log) => log.title)];
  return {
    wins: wins.length ? wins.map((title) => `• ${title}`).join("\n") : "",
    next: openTasks.length ? openTasks.slice(0, 5).map((task) => `• ${task.title}`).join("\n") : "",
    hasRecords: Boolean(completed.length || manualLogs.length || openTasks.length),
  };
}

function reconcileDailyReview(date, previousDraft) {
  const nextDraft = makeDailyReviewDraft(date);
  const existingReview = readDailyReview(date);
  if (!existingReview) {
    if (!nextDraft.hasRecords) return false;
    writeDailyReview(date, { wins: nextDraft.wins, blockers: "", next: nextDraft.next });
    if (date === selectedDate) elements.reviewState.textContent = "已自动同步最新工作记录";
    return true;
  }
  const review = existingReview;
  let changed = false;
  for (const field of ["wins", "next"]) {
    if (!(review[field] ?? "").trim() || review[field] === previousDraft[field]) {
      if (review[field] !== nextDraft[field]) {
        review[field] = nextDraft[field];
        changed = true;
      }
    }
  }
  if (changed && date === selectedDate) elements.reviewState.textContent = "已自动同步最新工作记录";
  return changed;
}

function generateReview() {
  const draft = makeDailyReviewDraft();

  if (!draft.hasRecords) {
    showToast("先记录一些工作，再来自动整理吧");
    return;
  }

  elements.reviewWins.value = draft.wins;
  elements.reviewNext.value = draft.next;
  saveReviewDraft();
  showToast("已根据今日全部记录整理初稿");
}

function completeReview() {
  writeDailyReview(selectedDate, {
    wins: elements.reviewWins.value,
    blockers: elements.reviewBlockers.value,
    next: elements.reviewNext.value,
    completedAt: new Date().toISOString(),
  });
  persist();
  renderReview();
  showToast("今天收好了，辛苦了");
}

function exportData() {
  const content = JSON.stringify(
    {
      app: "MyDays",
      version: 2,
      storage: "sqlite",
      exportedAt: new Date().toISOString(),
      data: state,
    },
    null,
    2,
  );
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `mydays-backup-${toDateKey(new Date())}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("数据备份已导出");
}

elements.captureTabs.forEach((tab) => tab.addEventListener("click", () => setCaptureType(tab.dataset.type)));
elements.captureForm.addEventListener("submit", addCapture);

elements.captureSelects.forEach((root) => {
  const trigger = root.querySelector(".capture-select-trigger");
  const menu = root.querySelector(".capture-select-menu");
  const select = root.querySelector("select");
  syncCaptureSelect(root);
  select.addEventListener("change", () => syncCaptureSelect(root));
  trigger.addEventListener("click", () => {
    if (menu.hidden) openCaptureSelect(root);
    else closeCaptureSelect(root, { restoreFocus: true });
  });
  trigger.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const focus = event.key === "ArrowUp" || event.key === "End" ? "last" : "first";
    openCaptureSelect(root, { focus });
  });
  menu.addEventListener("click", (event) => {
    const manageButton = event.target.closest("[data-manage-projects]");
    if (manageButton) {
      openProjectDialog();
      return;
    }
    const option = event.target.closest(".capture-select-option");
    if (option) chooseCaptureOption(root, option);
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCaptureSelect(root, { restoreFocus: true });
      return;
    }
    if (event.key === "Tab") {
      closeCaptureSelect(root);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveCaptureOptionFocus(root, event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusCaptureOption(root, event.key === "Home" ? "first" : "last");
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[role='option']")) {
      event.preventDefault();
      chooseCaptureOption(root, event.target);
    }
  });
});

elements.projectAddForm.addEventListener("submit", addProjectOption);
elements.projectDialogClose.addEventListener("click", closeProjectDialog);
elements.projectDialogDone.addEventListener("click", closeProjectDialog);
elements.projectDialog.addEventListener("click", (event) => {
  if (event.target === elements.projectDialog) closeProjectDialog();
});
elements.projectOptionList.addEventListener("change", (event) => {
  const input = event.target.closest(".project-option-row input");
  if (input) renameProjectOption(input.closest(".project-option-row"));
});
elements.projectOptionList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches(".project-option-row input")) return;
  event.preventDefault();
  renameProjectOption(event.target.closest(".project-option-row"));
});
elements.projectOptionList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-project-action]");
  if (!button) return;
  const row = button.closest(".project-option-row");
  if (button.dataset.projectAction === "up") moveProjectOption(row.dataset.name, -1);
  if (button.dataset.projectAction === "down") moveProjectOption(row.dataset.name, 1);
  if (button.dataset.projectAction === "delete") removeProjectOption(row.dataset.name);
});

elements.filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    taskFilter = tab.dataset.filter;
    elements.filterTabs.forEach((button) => button.classList.toggle("active", button === tab));
    renderTasks();
  });
});

elements.taskList.addEventListener("click", (event) => {
  const item = event.target.closest(".task-item");
  if (!item) return;
  if (event.target.closest(".task-check")) toggleTask(item.dataset.id);
  if (event.target.closest(".delete-task")) deleteTask(item.dataset.id);
});

elements.timelineList.addEventListener("click", (event) => {
  const item = event.target.closest(".timeline-item");
  if (item && event.target.closest(".delete-log")) deleteLog(item.dataset.id);
});

elements.dailyNote.addEventListener("input", () => {
  state.notes[selectedDate] = elements.dailyNote.value;
  elements.noteCount.textContent = `${elements.dailyNote.value.length} / 2000`;
  persist({ defer: true });
});

[elements.reviewWins, elements.reviewBlockers, elements.reviewNext].forEach((field) => {
  field.addEventListener("input", () => saveReviewDraft({ defer: true }));
});

elements.generateReview.addEventListener("click", generateReview);
elements.saveReview.addEventListener("click", completeReview);
elements.exportButton.addEventListener("click", exportData);
elements.accountMenuButton.addEventListener("click", () => setAccountMenu(elements.accountMenu.hidden));
elements.logoutButton.addEventListener("click", async () => {
  try {
    await requestJson("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.replace("/login");
  }
});
elements.periodTabs.forEach((tab) => tab.addEventListener("click", () => {
  summaryPeriod = tab.dataset.period;
  renderSummary();
}));
elements.summaryPrevious.addEventListener("click", () => {
  summaryAnchor = shiftPeriod(summaryPeriod, summaryAnchor, -1);
  renderSummary();
});
elements.summaryNext.addEventListener("click", () => {
  summaryAnchor = shiftPeriod(summaryPeriod, summaryAnchor, 1);
  renderSummary();
});
elements.summaryCurrent.addEventListener("click", () => {
  summaryAnchor = new Date();
  renderSummary();
});
elements.summaryProjectFilter.addEventListener("change", () => {
  summaryProject = elements.summaryProjectFilter.value;
  renderSummary();
});
[elements.summaryWins, elements.summaryBlockers, elements.summaryNextActions].forEach((field) => {
  field.addEventListener("input", () => saveSummaryReviewDraft({ defer: true }));
});
elements.generateSummaryReview.addEventListener("click", generateSummaryReview);
elements.generateAiSummary.addEventListener("click", generateAiSummary);
elements.saveSummaryReview.addEventListener("click", completeSummaryReview);
elements.aiNewProvider.addEventListener("click", resetAiProviderForm);
elements.aiProviderList.addEventListener("click", (event) => {
  const item = event.target.closest(".ai-provider-item");
  if (!item) return;
  selectedAiProviderId = item.dataset.id;
  clearAiModelOptions(selectedAiProviderId);
  elements.aiTestResult.className = "ai-test-result";
  elements.aiTestResult.textContent = "可以修改配置或发送最小连接测试。";
  renderAiSettings();
});
elements.aiProviderForm.addEventListener("submit", submitAiProvider);
elements.aiProviderProtocol.addEventListener("change", () => {
  elements.aiAnthropicOption.hidden = elements.aiProviderProtocol.value !== "anthropic";
});
elements.aiTestProvider.addEventListener("click", testSelectedAiProvider);
elements.aiFetchModels.addEventListener("click", fetchAiModels);
elements.aiModelOptions.addEventListener("change", () => {
  if (elements.aiModelOptions.value) elements.aiProviderModel.value = elements.aiModelOptions.value;
});
elements.aiSetDefault.addEventListener("click", setSelectedAiProviderDefault);
elements.aiDeleteProvider.addEventListener("click", deleteSelectedAiProvider);
elements.aiClearKey.addEventListener("click", clearSelectedAiKey);
elements.aiSummaryPrompt.addEventListener("input", () => {
  elements.aiPromptCount.textContent = `${elements.aiSummaryPrompt.value.length} / 4000`;
  if (aiSummarySettingsLoaded) elements.aiPromptState.textContent = "有未保存的修改";
});
elements.aiPromptSave.addEventListener("click", saveAiSummaryPrompt);
elements.aiPromptReset.addEventListener("click", resetAiSummaryPrompt);

elements.previousDay.addEventListener("click", () => changeDate(-1));
elements.nextDay.addEventListener("click", () => changeDate(1));
elements.todayButton.addEventListener("click", () => {
  selectedDate = toDateKey(new Date());
  render();
});
elements.datePickerButton.addEventListener("click", () => {
  if (elements.calendarPopover.hidden) openCalendar();
  else closeCalendar({ restoreFocus: true });
});
elements.calendarPreviousMonth.addEventListener("click", () => shiftCalendarMonth(-1));
elements.calendarNextMonth.addEventListener("click", () => shiftCalendarMonth(1));
elements.calendarCancel.addEventListener("click", () => closeCalendar({ restoreFocus: true }));
elements.calendarToday.addEventListener("click", () => selectCalendarDate(toDateKey(new Date())));
elements.calendarGrid.addEventListener("click", (event) => {
  const day = event.target.closest(".calendar-day");
  if (day) selectCalendarDate(day.dataset.date);
});
elements.calendarGrid.addEventListener("keydown", (event) => {
  const day = event.target.closest(".calendar-day");
  if (!day) return;
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  let offset = offsets[event.key];
  if (event.key === "PageUp") offset = -30;
  if (event.key === "PageDown") offset = 30;
  if (!offset) return;
  event.preventDefault();
  const targetDate = fromDateKey(day.dataset.date);
  targetDate.setDate(targetDate.getDate() + offset);
  focusCalendarDate(toDateKey(targetDate));
});

document.addEventListener("pointerdown", (event) => {
  if (!elements.accountMenu.hidden && !event.target.closest(".account-menu-wrap")) setAccountMenu(false);
  if (!event.target.closest("[data-capture-select]")) closeCaptureSelects();
  if (elements.calendarPopover.hidden) return;
  if (!elements.calendarPopover.contains(event.target) && !elements.datePickerButton.contains(event.target)) {
    closeCalendar();
  }
});

elements.navItems.forEach((item) => {
  item.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo(new URL(item.href).pathname);
  });
});
elements.settingsLink.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  setAccountMenu(false);
  navigateTo(new URL(elements.settingsLink.href).pathname);
});

window.addEventListener("popstate", () => {
  closeCaptureSelects();
  currentRoute = resolveRoute(window.location.pathname);
  render();
  window.scrollTo({ top: 0 });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.projectDialog.hidden) {
    event.preventDefault();
    closeProjectDialog();
    return;
  }
  const openCaptureSelectRoot = elements.captureSelects.find((root) => !root.querySelector(".capture-select-menu").hidden);
  if (event.key === "Escape" && openCaptureSelectRoot) {
    event.preventDefault();
    closeCaptureSelect(openCaptureSelectRoot, { restoreFocus: true });
    return;
  }
  if (event.key === "Escape" && !elements.accountMenu.hidden) {
    event.preventDefault();
    setAccountMenu(false, { restoreFocus: true });
    return;
  }
  if (event.key === "Escape" && !elements.calendarPopover.hidden) {
    event.preventDefault();
    closeCalendar({ restoreFocus: true });
    return;
  }
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (event.key === "/" && !isTyping) {
    event.preventDefault();
    if (["review", "summary", "ai-settings"].includes(currentRoute.key)) navigateTo("/tasks");
    window.requestAnimationFrame(() => elements.captureInput.focus());
  }
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && target === elements.dailyNote) {
    event.preventDefault();
    persist();
    showToast("临时笔记已保存");
  }
});

bootstrap();
