const MAX_PATCH_OPS = 500;
const MAX_KEEPALIVE_BODY_BYTES = 60000;
const ROUTES = Object.freeze({
  "/": {
    key: "today",
    title: "MyDays · 工作台",
    eyebrow: "TODAY",
    copy: "把重要的事留在这里，让大脑轻一点。",
  },
  "/upcoming": {
    key: "upcoming",
    title: "MyDays · 即将到期",
    eyebrow: "UPCOMING",
    heading: "接下来要到期的事",
    copy: "已逾期、今天到期和之后两周的待办。",
  },
  "/summary": {
    key: "summary",
    title: "MyDays · 周期汇总",
    eyebrow: "PERIOD SUMMARY",
    heading: "回顾一段时间，看见持续的进展",
    copy: "按周、月、季度、年度或任意时间段整理成果，并为下一阶段留下清晰的方向。",
  },
  "/settings": {
    key: "ai-settings",
    title: "MyDays · 设置",
    eyebrow: "SETTINGS",
    heading: "设置",
    copy: "外观、项目、数据备份、AI 服务和 Agent 工作汇总。",
  },
});

// Old links land on their new place: /ai-settings on the AI settings tab, the former
// tasks / timeline / review pages on the matching section of the today page.
const ROUTE_ALIASES = Object.freeze({
  "/ai-settings": ["/settings", "ai"],
  "/tasks": ["/", "tasks"],
  "/timeline": ["/", "timeline"],
  "/review": ["/", "review"],
});

const PERIODS = Object.freeze({
  day: { reportLabel: "日报" },
  week: { reportLabel: "周报" },
  month: { reportLabel: "月报" },
  quarter: { reportLabel: "季报" },
  year: { reportLabel: "年报" },
  range: { reportLabel: "成果总结" },
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
  scoreLabel: document.querySelector("#score-label"),
  captureForm: document.querySelector("#capture-form"),
  captureInput: document.querySelector("#capture-input"),
  captureTabs: [...document.querySelectorAll(".capture-tab")],
  capturePolishButton: document.querySelector("#capture-polish-button"),
  capturePolishSuggestion: document.querySelector("#capture-polish-suggestion"),
  capturePolishText: document.querySelector("#capture-polish-text"),
  capturePolishMeta: document.querySelector("#capture-polish-meta"),
  capturePolishAdopt: document.querySelector("#capture-polish-adopt"),
  capturePolishCancel: document.querySelector("#capture-polish-cancel"),
  projectSelect: document.querySelector("#project-select"),
  projectSelectMenu: document.querySelector("#project-select-menu"),
  prioritySelect: document.querySelector("#priority-select"),
  priorityField: document.querySelector(".priority-field"),
  captureSelects: [...document.querySelectorAll("[data-capture-select]")],
  taskList: document.querySelector("#task-list"),
  taskCount: document.querySelector("#task-count"),
  filterTabs: [...document.querySelectorAll("[data-filter]")],
  timelineList: document.querySelector("#timeline-list"),
  logCount: document.querySelector("#log-count"),
  reviewDaySummary: document.querySelector("#review-day-summary"),
  reviewContent: document.querySelector("#review-content"),
  reviewState: document.querySelector("#review-state"),
  searchTrigger: document.querySelector("#search-trigger"),
  searchShortcuts: [...document.querySelectorAll("[data-search-shortcut]")],
  sidebarSearch: document.querySelector("#sidebar-search"),
  navTodayCount: document.querySelector("#nav-today-count"),
  navUpcomingCount: document.querySelector("#nav-upcoming-count"),
  sidebarProjectList: document.querySelector("#sidebar-project-list"),
  heatmapTitle: document.querySelector("#heatmap-title"),
  heatmapGrid: document.querySelector("#heatmap-grid"),
  heatmapLegend: document.querySelector("#heatmap-legend"),
  heatmapPrevious: document.querySelector("#heatmap-previous"),
  heatmapNext: document.querySelector("#heatmap-next"),
  upcomingList: document.querySelector("#upcoming-list"),
  planCard: document.querySelector("#plan-card"),
  planList: document.querySelector("#plan-list"),
  planAddAll: document.querySelector("#plan-add-all"),
  planDismiss: document.querySelector("#plan-dismiss"),
  goalCount: document.querySelector("#goal-count"),
  goalsWeek: document.querySelector("#goals-week"),
  goalList: document.querySelector("#goal-list"),
  goalAddForm: document.querySelector("#goal-add-form"),
  goalNewTitle: document.querySelector("#goal-new-title"),
  captureGoal: document.querySelector("#capture-goal"),
  summaryGoalsCard: document.querySelector("#summary-goals-card"),
  summaryGoalList: document.querySelector("#summary-goal-list"),
  summaryGoalsTotal: document.querySelector("#summary-goals-total"),
  searchDialog: document.querySelector("#search-dialog"),
  searchInput: document.querySelector("#search-input"),
  searchResults: document.querySelector("#search-results"),
  searchFooter: document.querySelector("#search-footer"),
  importFile: document.querySelector("#import-file"),
  settingsExportButton: document.querySelector("#settings-export-button"),
  settingsImportButton: document.querySelector("#settings-import-button"),
  settingsTabs: [...document.querySelectorAll("[data-settings-tab]")],
  settingsPanels: [...document.querySelectorAll("[data-settings-panel]")],
  accountMenuButton: document.querySelector("#account-menu-button"),
  accountMenu: document.querySelector("#account-menu"),
  logoutButton: document.querySelector("#logout-button"),
  themeOptions: [...document.querySelectorAll("[data-theme-option]")],
  agentDigestEnabled: document.querySelector("#agent-digest-enabled"),
  agentDigestEnabledLabel: document.querySelector("#agent-digest-enabled-label"),
  agentDigestTime: document.querySelector("#agent-digest-time"),
  agentDigestDayStart: document.querySelector("#agent-digest-day-start"),
  agentDigestTimezone: document.querySelector("#agent-digest-timezone"),
  agentDigestTimezoneHint: document.querySelector("#agent-digest-timezone-hint"),
  agentDigestProvider: document.querySelector("#agent-digest-provider"),
  agentDigestMaxInput: document.querySelector("#agent-digest-max-input"),
  agentDigestExcluded: document.querySelector("#agent-digest-excluded"),
  agentDigestGitEmails: document.querySelector("#agent-digest-git-emails"),
  agentDigestGitDirs: document.querySelector("#agent-digest-git-dirs"),
  captureMoreButton: document.querySelector("#capture-more-button"),
  captureDueQuick: document.querySelector("#capture-due-quick"),
  captureDueQuickButtons: [...document.querySelectorAll("#capture-due-quick [data-due-quick]")],
  captureMoreLabel: document.querySelector("#capture-more-label"),
  captureExtra: document.querySelector("#capture-extra"),
  captureDueDateField: document.querySelector("#capture-due-date-field"),
  captureDueDate: document.querySelector("#capture-due-date"),
  captureDueTime: document.querySelector("#capture-due-time"),
  captureDueTimeLabel: document.querySelector("#capture-due-time-label"),
  captureRemind: document.querySelector("#capture-remind"),
  captureRepeat: document.querySelector("#capture-repeat"),
  taskSettingsOpen: document.querySelector("#task-settings-open"),
  taskSettingsDialog: document.querySelector("#task-settings-dialog"),
  taskSettingsClose: document.querySelector("#task-settings-close"),
  taskRollover: document.querySelector("#task-rollover"),
  taskRolloverLabel: document.querySelector("#task-rollover-label"),
  taskNotifyState: document.querySelector("#task-notify-state"),
  taskNotifyEnable: document.querySelector("#task-notify-enable"),
  recurrenceList: document.querySelector("#recurrence-list"),
  recurrenceCount: document.querySelector("#recurrence-count"),
  agentGitStatus: document.querySelector("#agent-git-status"),
  agentDigestInstructions: document.querySelector("#agent-digest-instructions"),
  agentDigestState: document.querySelector("#agent-digest-state"),
  agentDigestRefresh: document.querySelector("#agent-digest-refresh"),
  agentDigestSave: document.querySelector("#agent-digest-save"),
  agentDigestDays: document.querySelector("#agent-digest-days"),
  agentDigestStored: document.querySelector("#agent-digest-stored"),
  agentDigestClear: document.querySelector("#agent-digest-clear"),
  agentTokenForm: document.querySelector("#agent-token-form"),
  agentTokenName: document.querySelector("#agent-token-name"),
  agentTokenScope: document.querySelector("#agent-token-scope"),
  agentTokenCreated: document.querySelector("#agent-token-created"),
  agentTokenValue: document.querySelector("#agent-token-value"),
  agentTokenCopy: document.querySelector("#agent-token-copy"),
  agentTokenList: document.querySelector("#agent-token-list"),
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
  summaryRangeControls: document.querySelector("#summary-range-controls"),
  summaryRangePresets: [...document.querySelectorAll("[data-range]")],
  summaryRangeFrom: document.querySelector("#summary-range-from"),
  summaryRangeTo: document.querySelector("#summary-range-to"),
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
  summaryTimeCard: document.querySelector("#summary-time-card"),
  summaryTimeTotal: document.querySelector("#summary-time-total"),
  summaryTimeProjects: document.querySelector("#summary-time-projects"),
  summaryTimeNote: document.querySelector("#summary-time-note"),
  summaryAchievements: document.querySelector("#summary-achievements"),
  summaryAchievementsPager: document.querySelector("#summary-achievements-pager"),
  summaryAchievementsPrev: document.querySelector("#summary-achievements-prev"),
  summaryAchievementsNext: document.querySelector("#summary-achievements-next"),
  summaryAchievementsPage: document.querySelector("#summary-achievements-page"),
  summaryAchievementsCount: document.querySelector("#summary-achievements-count"),
  summaryExportTrigger: document.querySelector("#summary-export-trigger"),
  summaryExportMenu: document.querySelector("#summary-export-menu"),
  summaryExportItems: [...document.querySelectorAll("#summary-export-menu [role='menuitem']")],
  summaryOpenItems: document.querySelector("#summary-open-items"),
  summaryReviewTitle: document.querySelector("#summary-review-title"),
  summaryReviewCopy: document.querySelector("#summary-review-copy"),
  summaryReportLabel: document.querySelector("#summary-report-label"),
  downloadSummaryReport: document.querySelector("#download-summary-report"),
  summaryBlockers: document.querySelector("#summary-blockers"),
  summaryReviewState: document.querySelector("#summary-review-state"),
  generateAiSummary: document.querySelector("#generate-ai-summary"),
  copySummaryReport: document.querySelector("#copy-summary-report"),
  summaryAiReport: document.querySelector("#summary-ai-report"),
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
  projectAddForm: document.querySelector("#project-add-form"),
  projectNewName: document.querySelector("#project-new-name"),
  projectOptionList: document.querySelector("#project-option-list"),
  projectState: document.querySelector("#project-state"),
};

const defaultState = {
  tasks: [],
  recurrences: [],
  logs: [],
  goals: [],
  reviews: {},
  periodReviews: {},
};

let state = structuredClone(defaultState);
let syncedState = structuredClone(defaultState);
let revision = 0;
let currentRoute = resolveRoute(window.location.pathname);
let selectedDate = toDateKey(new Date());
let summaryPeriod = "week";
let summaryAnchor = new Date();
let summaryProject = "";
let summaryRange = null;
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let heatmapCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let captureType = "task";
let capturePolishLoading = false;
let capturePolishRequestVersion = 0;
let taskFilter = "all";
let saveQueue = Promise.resolve();
let deferredSave = null;
let saveStateTimer;
let toastTimer;
let summarySaveVersion = 0;
let summaryAchievementPage = 0;
let aiSummaryLoading = false;
let aiProviders = [];
let selectedAiProviderId = null;
let aiProvidersLoaded = false;
let aiModelsProviderId = null;
let aiModelsRequestVersion = 0;
let aiSummarySettingsLoaded = false;
let projectOptions = [];
let entryEdit = null;
let agentDigest = null;
let agentDigestRunningDate = null;
let taskSettings = { taskRollover: true };
let preparedTaskDate = null;

function setAccountMenu(open, { restoreFocus = false } = {}) {
  if (open) closeSummaryExportMenu();
  elements.accountMenu.hidden = !open;
  elements.accountMenuButton.setAttribute("aria-expanded", String(open));
  if (open) elements.settingsLink.focus();
  else if (restoreFocus) elements.accountMenuButton.focus();
}

function logOriginLabel(log) {
  if (log.sourceTaskId) return "完成待办";
  return log.source === "agent-digest" ? '<span class="origin-chip">AI 整理</span>' : "手动记录";
}

function renderThemeSwitch() {
  const theme = window.MyDaysTheme?.get() ?? "system";
  elements.themeOptions.forEach((option) => {
    option.setAttribute("aria-pressed", String(option.dataset.themeOption === theme));
  });
}

const AGENT_DIGEST_ERRORS = {
  AI_UPSTREAM_ERROR: "AI 服务出错",
  AI_TIMEOUT: "AI 服务超时",
  AI_CONNECTION_FAILED: "无法连接 AI 服务",
  AI_AUTH_FAILED: "API Key 被拒绝",
  AI_RATE_LIMITED: "AI 服务限流",
  AI_RESPONSE_TRUNCATED: "输出被截断",
  AI_RESPONSE_INVALID: "返回格式无效",
  AI_KEY_UNREADABLE: "API Key 无法解密",
  AGENT_DIGEST_PROVIDER_REQUIRED: "未配置可用的 AI 服务",
};

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

async function loadAgentDigest({ fillForm = true } = {}) {
  agentDigest = await requestJson("/api/agent-digest/status");
  renderAgentDigest({ fillForm });
}

function renderAgentDigest({ fillForm = false } = {}) {
  if (!agentDigest) return;
  const { settings } = agentDigest;
  elements.agentDigestEnabled.checked = settings.enabled;
  elements.agentDigestEnabledLabel.textContent = settings.enabled ? "已开启" : "已关闭";
  const providerOptions = [
    new Option("跟随默认服务", ""),
    ...aiProviders.map((provider) => new Option(`${provider.name} · ${provider.model}`, provider.id)),
  ];
  const selectedProvider = fillForm ? settings.providerId ?? "" : elements.agentDigestProvider.value;
  elements.agentDigestProvider.replaceChildren(...providerOptions);
  elements.agentDigestProvider.value = providerOptions.some((option) => option.value === selectedProvider) ? selectedProvider : "";
  if (fillForm) {
    elements.agentDigestTime.value = settings.summaryTime;
    elements.agentDigestDayStart.value = settings.dayStartHour;
    elements.agentDigestTimezone.value = settings.updatedAt ? settings.timezone : browserTimeZone();
    elements.agentDigestMaxInput.value = settings.maxInputChars;
    elements.agentDigestExcluded.value = settings.excludedProjects.join("，");
    elements.agentDigestGitEmails.value = (settings.gitAuthorEmails ?? []).join("，");
    elements.agentDigestGitDirs.value = (settings.gitRepoDirs ?? []).join("\n");
    elements.agentDigestInstructions.value = settings.instructions;
    elements.agentDigestState.textContent = agentDigest.providerReady
      ? "设置已载入"
      : "开启前需要先在「AI 服务」中配置带 API Key 的服务";
  }
  const zone = browserTimeZone();
  elements.agentDigestTimezoneHint.textContent = elements.agentDigestTimezone.value === zone ? "与当前浏览器一致" : `当前浏览器时区：${zone}`;

  elements.agentDigestDays.innerHTML = agentDigest.days.map((day) => {
    const run = day.run;
    let status = day.turnCount ? "待整理" : "—";
    let tone = "";
    if (run?.status === "ok") status = `已整理 ${run.itemCount} 条${run.finalized ? "" : "（次日定稿）"}`;
    if (run?.status === "empty") status = day.turnCount ? "没有需要记录的主要工作" : "—";
    if (run?.status === "failed") {
      status = `失败：${AGENT_DIGEST_ERRORS[run.errorCode] ?? run.errorCode ?? "未知错误"}（第 ${run.attempts} 次）`;
      tone = " failed";
    }
    const running = agentDigestRunningDate === day.date;
    const detail = run && run.inputChars ? `输入 ${run.inputChars.toLocaleString("zh-CN")} 字` : "";
    return `
      <div class="agent-digest-day${tone}" role="row">
        <strong role="cell">${escapeHtml(day.date.slice(5).replace("-", "/"))}</strong>
        <span role="cell">${day.turnCount} 轮${day.agents.length ? ` · ${escapeHtml(day.agents.join("、"))}` : ""}</span>
        <span role="cell" class="agent-digest-day-status">${escapeHtml(status)}${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span>
        <span role="cell"><button class="text-button" type="button" data-digest-run="${escapeAttribute(day.date)}" ${!settings.enabled || !day.turnCount || agentDigestRunningDate ? "disabled" : ""}>${running ? "整理中…" : "重新整理"}</button></span>
      </div>`;
  }).join("");
  renderAgentGitStatus();
  elements.agentDigestStored.textContent = `已暂存 ${agentDigest.storedTurns} 轮素材，保留 ${agentDigest.retentionDays} 天后自动清理`;
  elements.agentDigestClear.disabled = !agentDigest.storedTurns;

  const active = agentDigest.tokens.filter((token) => !token.revokedAt);
  elements.agentTokenList.innerHTML = active.length
    ? active.map((token) => `
      <div class="agent-token-row">
        <span><strong>${escapeHtml(token.name)}</strong><i class="origin-chip${token.scope === "read" ? " read" : ""}">${token.scope === "read" ? "读取" : "采集"}</i>${token.builtin ? '<i class="origin-chip">自动</i>' : ""}<small><code>${escapeHtml(token.prefix)}…</code> · ${token.lastUsedAt ? `最近连接 ${escapeHtml(formatDateTime(token.lastUsedAt))}` : "尚未连接"}</small></span>
        <button class="text-button danger-text" type="button" data-token-revoke="${escapeAttribute(token.id)}" data-token-name="${escapeAttribute(token.name)}">吊销</button>
      </div>`).join("")
    : '<div class="summary-empty">还没有采集器令牌。开启功能后会自动创建本机采集器的令牌。</div>';
}

const GIT_DIR_STATES = {
  ok: (entry) => `找到 ${entry.repos} 个仓库`,
  missing: () => "采集器找不到这个目录",
  "outside-mount": () => "不在采集器可见的范围内（Docker 只挂载主目录，可用 MYDAYS_GIT_ROOT 调整）",
  "no-emails": (entry) => `找到 ${entry.repos} 个仓库，填写作者邮箱后开始采集`,
};

function renderAgentGitStatus() {
  const configured = agentDigest.settings.gitRepoDirs ?? [];
  const reported = agentDigest.collector;
  const host = elements.agentGitStatus;
  host.hidden = !configured.length;
  if (!configured.length) return;
  const byPath = new Map((reported?.gitDirs ?? []).map((entry) => [entry.path, entry]));
  host.innerHTML = configured.map((dir) => {
    const entry = byPath.get(dir);
    const text = entry ? GIT_DIR_STATES[entry.state]?.(entry) ?? entry.state : "等待采集器下一轮检查";
    const tone = !entry ? "pending" : entry.state === "ok" ? "ok" : "warn";
    return `<div class="agent-git-dir ${tone}"><code>${escapeHtml(dir)}</code><span>${escapeHtml(text)}</span></div>`;
  }).join("") + (reported?.reportedAt ? `<small>采集器上次报告：${escapeHtml(formatDateTime(reported.reportedAt))}</small>` : "");
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(timestamp));
}

function readAgentDigestForm() {
  return {
    summaryTime: elements.agentDigestTime.value,
    dayStartHour: Number(elements.agentDigestDayStart.value),
    timezone: elements.agentDigestTimezone.value.trim(),
    providerId: elements.agentDigestProvider.value || null,
    maxInputChars: Number(elements.agentDigestMaxInput.value),
    excludedProjects: elements.agentDigestExcluded.value.split(/[,，\n]/).map((name) => name.trim()).filter(Boolean),
    gitAuthorEmails: elements.agentDigestGitEmails.value.split(/[,，\s]+/).map((email) => email.trim()).filter(Boolean),
    gitRepoDirs: elements.agentDigestGitDirs.value.split("\n").map((dir) => dir.trim()).filter(Boolean),
    instructions: elements.agentDigestInstructions.value,
  };
}

async function putAgentDigestSettings(body, successMessage) {
  await requestJson("/api/agent-digest/settings", { method: "PUT", body: JSON.stringify(body) });
  await loadAgentDigest();
  elements.agentDigestState.textContent = successMessage;
}

async function toggleAgentDigest() {
  const enable = elements.agentDigestEnabled.checked;
  if (enable) {
    const provider = aiProviders.find((entry) => entry.id === elements.agentDigestProvider.value) ?? aiProviders.find((entry) => entry.isDefault);
    const confirmed = window.confirm([
      "开启 Agent 工作汇总？",
      "",
      "采集器会读取本机 Claude Code、Codex 会话中你的提问和 agent 的最终答复，暂存在 MyDays 中，",
      `并在每天整理时发送给 AI 服务${provider ? `「${provider.name}」` : ""}。密钥隐藏只是尽力而为。`,
    ].join("\n"));
    if (!confirmed) {
      elements.agentDigestEnabled.checked = false;
      return;
    }
  }
  try {
    await putAgentDigestSettings(
      { ...readAgentDigestForm(), enabled: enable },
      enable ? "已开启，采集器将在几分钟内开始同步" : "已关闭，采集器不再读取会话，也不会再调用 AI",
    );
    showToast(enable ? "Agent 工作汇总已开启" : "Agent 工作汇总已关闭");
  } catch (error) {
    elements.agentDigestEnabled.checked = !enable;
    elements.agentDigestState.textContent = error.message;
    showToast(error.message);
  }
}

async function saveAgentDigestSettings() {
  try {
    await putAgentDigestSettings(readAgentDigestForm(), "设置已保存");
    showToast("Agent 工作汇总设置已保存");
  } catch (error) {
    elements.agentDigestState.textContent = error.message;
    showToast(`保存失败：${error.message}`);
  }
}

async function reloadIfServerChanged() {
  if (deferredSave || diffState(syncedState, state).length) return;
  const result = await requestJson("/api/state");
  if (result.revision === revision) return;
  adoptServerState(result);
  render();
}

async function runAgentDigest(date) {
  if (agentDigestRunningDate) return;
  agentDigestRunningDate = date;
  renderAgentDigest();
  try {
    agentDigest = await requestJson("/api/agent-digest/run", { method: "POST", body: JSON.stringify({ date }) });
    const run = agentDigest.days.find((day) => day.date === date)?.run;
    showToast(run?.status === "failed" ? `整理失败：${AGENT_DIGEST_ERRORS[run.errorCode] ?? run.errorCode}` : "已重新整理");
    await reloadIfServerChanged();
  } catch (error) {
    showToast(`整理失败：${error.message}`);
  } finally {
    agentDigestRunningDate = null;
    renderAgentDigest();
  }
}

async function clearAgentTurns() {
  if (!window.confirm("清除全部已采集的素材？已经写入时间线的记录不受影响；采集器之后仍会重新同步最近 8 天的会话。")) return;
  try {
    await requestJson("/api/agent-digest/turns", { method: "DELETE" });
    await loadAgentDigest({ fillForm: false });
    showToast("已清除采集的素材");
  } catch (error) {
    showToast(`清除失败：${error.message}`);
  }
}

async function createAgentToken(event) {
  event.preventDefault();
  const name = elements.agentTokenName.value.trim();
  if (!name) return;
  try {
    const created = await requestJson("/api/agent-tokens", { method: "POST", body: JSON.stringify({ name, scope: elements.agentTokenScope.value }) });
    elements.agentTokenValue.textContent = created.token;
    elements.agentTokenCreated.hidden = false;
    elements.agentTokenName.value = "";
    await loadAgentDigest({ fillForm: false });
  } catch (error) {
    showToast(`创建失败：${error.message}`);
  }
}

async function revokeAgentToken(id, name) {
  if (!window.confirm(`吊销令牌「${name}」？使用它的采集器将立即无法连接。`)) return;
  try {
    await requestJson(`/api/agent-tokens/${id}`, { method: "DELETE" });
    await loadAgentDigest({ fillForm: false });
    showToast("令牌已吊销");
  } catch (error) {
    showToast(`吊销失败：${error.message}`);
  }
}

function closeSummaryExportMenu({ restoreFocus = false } = {}) {
  if (elements.summaryExportMenu.hidden) return;
  elements.summaryExportMenu.hidden = true;
  elements.summaryExportTrigger.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.summaryExportTrigger.focus();
}

function focusSummaryExportItem(position = "first") {
  const index = position === "last" ? elements.summaryExportItems.length - 1 : 0;
  elements.summaryExportItems[index]?.focus();
}

function openSummaryExportMenu({ focus = "first" } = {}) {
  closeCaptureSelects();
  closeEntryEditSelects();
  setAccountMenu(false);
  elements.summaryExportMenu.hidden = false;
  elements.summaryExportTrigger.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(() => focusSummaryExportItem(focus));
}

function moveSummaryExportFocus(offset) {
  const currentIndex = elements.summaryExportItems.indexOf(document.activeElement);
  const nextIndex = (Math.max(0, currentIndex) + offset + elements.summaryExportItems.length) % elements.summaryExportItems.length;
  elements.summaryExportItems[nextIndex]?.focus();
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

function normalizeTask(task) {
  return {
    id: task.id,
    date: task.date,
    title: task.title,
    project: task.project ?? "",
    priority: task.priority,
    completed: Boolean(task.completed),
    createdAt: task.createdAt,
    completedAt: task.completedAt ?? null,
    originDate: task.originDate ?? null,
    dueDate: task.dueDate ?? null,
    dueTime: task.dueTime ?? null,
    remindMinutes: task.remindMinutes ?? null,
    recurrenceId: task.recurrenceId ?? null,
    focus: Boolean(task.focus),
    goalId: task.goalId ?? null,
  };
}

function normalizeGoal(goal) {
  return { id: goal.id, week: goal.week, title: goal.title, done: Boolean(goal.done), createdAt: goal.createdAt };
}

function normalizeRecurrence(recurrence) {
  return {
    id: recurrence.id,
    title: recurrence.title,
    project: recurrence.project ?? "",
    priority: recurrence.priority,
    rule: recurrence.rule,
    weekdays: recurrence.weekdays ?? 0,
    monthDay: recurrence.monthDay ?? null,
    dueTime: recurrence.dueTime ?? null,
    remindMinutes: recurrence.remindMinutes ?? null,
    startDate: recurrence.startDate,
    paused: Boolean(recurrence.paused),
    lastGeneratedDate: recurrence.lastGeneratedDate ?? null,
    createdAt: recurrence.createdAt,
  };
}

function normalizeLog(log) {
  return {
    id: log.id,
    date: log.date,
    title: log.title,
    project: log.project ?? "",
    sourceTaskId: log.sourceTaskId ?? null,
    source: log.source ?? "",
    createdAt: log.createdAt,
  };
}

function normalizeReview(review) {
  return { content: review?.content ?? "" };
}

function normalizePeriodRecord(record) {
  return { report: record?.report ?? "", notes: record?.notes ?? "" };
}

function diffEntries(base, next, normalize, kind, field) {
  const baseById = new Map(base.map((entry) => [entry.id, entry]));
  const nextIds = new Set();
  const puts = [];
  for (const entry of next) {
    nextIds.add(entry.id);
    const value = normalize(entry);
    const previous = baseById.get(entry.id);
    if (!previous || JSON.stringify(normalize(previous)) !== JSON.stringify(value)) {
      puts.push({ op: `${kind}.put`, [field]: value });
    }
  }
  const deletes = base.filter((entry) => !nextIds.has(entry.id)).map((entry) => ({ op: `${kind}.delete`, id: entry.id }));
  return { puts, deletes };
}

function diffMap(base = {}, next = {}, normalize, makePut, makeDelete) {
  const ops = [];
  for (const key of Object.keys(next)) {
    const value = normalize(next[key]);
    if (!Object.hasOwn(base, key) || JSON.stringify(normalize(base[key])) !== JSON.stringify(value)) {
      ops.push(makePut(key, value));
    }
  }
  for (const key of Object.keys(base)) {
    if (!Object.hasOwn(next, key)) ops.push(makeDelete(key));
  }
  return ops;
}

function diffProjectMap(base = {}, next = {}, normalize, kind, keyField, valueField) {
  const ops = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    ops.push(...diffMap(
      base[key],
      next[key],
      normalize,
      (project, value) => ({ op: `${kind}.put`, [keyField]: key, project, [valueField]: value }),
      (project) => ({ op: `${kind}.delete`, [keyField]: key, project }),
    ));
  }
  return ops;
}

function diffState(base, next) {
  const tasks = diffEntries(base.tasks, next.tasks, normalizeTask, "task", "task");
  const recurrences = diffEntries(base.recurrences ?? [], next.recurrences ?? [], normalizeRecurrence, "recurrence", "recurrence");
  const logs = diffEntries(base.logs, next.logs, normalizeLog, "log", "log");
  const goals = diffEntries(base.goals ?? [], next.goals ?? [], normalizeGoal, "goal", "goal");
  return [
    ...recurrences.puts,
    ...recurrences.deletes,
    // Deletes first so a week that swaps one goal for another never briefly holds more than the limit.
    ...goals.deletes,
    ...goals.puts,
    ...tasks.puts,
    ...logs.puts,
    ...logs.deletes,
    ...tasks.deletes,
    ...diffMap(base.reviews, next.reviews, normalizeReview,
      (date, review) => ({ op: "review.put", date, review }),
      (date) => ({ op: "review.delete", date })),
    ...diffProjectMap(base.periodReviews, next.periodReviews, normalizePeriodRecord, "periodReview", "key", "review"),
  ];
}

function applyOps(data, ops) {
  const putEntry = (list, entry) => {
    const index = list.findIndex((existing) => existing.id === entry.id);
    if (index >= 0) list[index] = entry;
    else list.push(entry);
  };
  const putProjectValue = (mapName, key, project, value) => {
    data[mapName] ??= {};
    if (!Object.hasOwn(data[mapName], key)) setOwnValue(data[mapName], key, Object.create(null));
    setOwnValue(data[mapName][key], project, value);
  };
  const deleteProjectValue = (mapName, key, project) => {
    if (data[mapName] && Object.hasOwn(data[mapName], key)) delete data[mapName][key][project];
  };
  for (const op of ops) {
    switch (op.op) {
      case "task.put": putEntry(data.tasks, op.task); break;
      case "task.delete": data.tasks = data.tasks.filter((task) => task.id !== op.id); break;
      case "recurrence.put": putEntry(data.recurrences, op.recurrence); break;
      case "recurrence.delete": data.recurrences = data.recurrences.filter((recurrence) => recurrence.id !== op.id); break;
      case "log.put": putEntry(data.logs, op.log); break;
      case "log.delete": data.logs = data.logs.filter((log) => log.id !== op.id); break;
      case "goal.put": putEntry(data.goals, op.goal); break;
      case "goal.delete": data.goals = data.goals.filter((goal) => goal.id !== op.id); break;
      case "review.put": data.reviews[op.date] = op.review; break;
      case "review.delete": delete data.reviews[op.date]; break;
      case "periodReview.put": putProjectValue("periodReviews", op.key, op.project, op.review); break;
      case "periodReview.delete": deleteProjectValue("periodReviews", op.key, op.project); break;
      default: break;
    }
  }
  const taskIds = new Set(data.tasks.map((task) => task.id));
  data.logs = data.logs.filter((log) => !log.sourceTaskId || taskIds.has(log.sourceTaskId));
  return data;
}

function adoptServerState(result) {
  result.data.recurrences ??= [];
  result.data.goals ??= [];
  state = result.data;
  syncedState = structuredClone(result.data);
  revision = result.revision;
  if (result.taskSettings) taskSettings = result.taskSettings;
}

function persist({ defer = false, onSaved, onError } = {}) {
  setSaveIndicator("保存中…");
  cancelDeferredSave();
  if (defer) {
    deferredSave = {
      timer: window.setTimeout(() => queueSave({ onSaved, onError }), 400),
      onSaved,
      onError,
    };
    return;
  }
  queueSave({ onSaved, onError });
}

function cancelDeferredSave() {
  if (!deferredSave) return;
  window.clearTimeout(deferredSave.timer);
  deferredSave = null;
}

function flushDeferredSave() {
  if (!deferredSave) return;
  const { onSaved, onError } = deferredSave;
  queueSave({ onSaved, onError, keepalive: true });
}

async function pushSnapshot(snapshot, { keepalive = false } = {}) {
  const ops = diffState(syncedState, snapshot);
  let stale = false;
  for (let offset = 0; offset < ops.length; offset += MAX_PATCH_OPS) {
    const body = JSON.stringify({ baseRevision: revision, ops: ops.slice(offset, offset + MAX_PATCH_OPS) });
    const result = await requestJson("/api/state", {
      method: "PATCH",
      body,
      keepalive: keepalive && body.length * 3 < MAX_KEEPALIVE_BODY_BYTES,
    });
    stale ||= result.stale;
    revision = result.revision;
  }
  syncedState = snapshot;
  return stale;
}

function queueSave({ onSaved, onError, keepalive = false } = {}) {
  cancelDeferredSave();
  const snapshot = structuredClone(state);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    try {
      const stale = await pushSnapshot(snapshot, { keepalive });
      setSaveIndicator("已保存到 SQLite");
      onSaved?.();
      window.clearTimeout(saveStateTimer);
      saveStateTimer = window.setTimeout(() => {
        setSaveIndicator("已保存到 SQLite");
      }, 450);
      if (stale) await mergeServerState();
    } catch (error) {
      setSaveIndicator("保存失败", true);
      onError?.(error);
      showToast(`保存失败：${error.message}`);
    }
  });
}

async function mergeServerState({ message = "已同步其他页面的更新" } = {}) {
  let result;
  try {
    result = await requestJson("/api/state");
  } catch {
    return;
  }
  result.data.recurrences ??= [];
  result.data.goals ??= [];
  if (result.taskSettings) taskSettings = result.taskSettings;
  const pending = diffState(syncedState, state);
  syncedState = structuredClone(result.data);
  state = applyOps(result.data, pending);
  revision = result.revision;
  if (entryEdit && !(entryEdit.kind === "task" ? state.tasks : state.logs).some((entry) => entry.id === entryEdit.id)) {
    entryEdit = null;
  }
  renderPreservingFocus();
  if (message) showToast(message);
  if (pending.length && !deferredSave) queueSave();
}

function renderPreservingFocus() {
  const active = document.activeElement;
  const editable = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  const selection = editable ? [active.selectionStart, active.selectionEnd] : null;
  const wasEntryEditTitle = editable && active.classList.contains("entry-edit-title");
  render();
  if (!editable) return;
  const target = active.isConnected ? active : wasEntryEditTitle ? document.querySelector(".entry-edit-title") : null;
  if (!target) return;
  if (document.activeElement !== target) target.focus();
  try {
    target.setSelectionRange(selection[0], selection[1]);
  } catch {}
}

async function bootstrap() {
  setSaveIndicator("正在连接 SQLite…");
  try {
    const auth = await requestJson("/api/auth/status");
    elements.accountMenuButton.hidden = false;
    elements.logoutButton.hidden = !auth.enabled;
    adoptServerState(await requestJson("/api/state"));
    await prepareTasksForToday({ initial: true });
    try {
      await Promise.all([loadAiProviders(), loadAiSummarySettings(), loadProjectOptions()]);
      await loadAgentDigest().catch((digestError) => {
        elements.agentDigestState.textContent = `读取失败：${digestError.message}`;
      });
    } catch (aiError) {
      elements.aiTestResult.textContent = `AI 配置加载失败：${aiError.message}`;
      elements.aiTestResult.className = "ai-test-result failed";
    }
    setSaveIndicator("已连接 SQLite");
    render();
    if (window.location.hash) scrollToRouteSection("instant");
    checkTaskReminders();
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
  const alias = ROUTE_ALIASES[normalizePath(pathname)];
  if (alias) {
    window.history.replaceState({}, "", `${alias[0]}#${alias[1]}`);
    return ROUTES[alias[0]];
  }
  return ROUTES[normalizePath(pathname)] ?? ROUTES["/"];
}

const SETTINGS_TABS = ["general", "data", "ai", "agent", "connect"];

function currentSettingsTab() {
  const tab = window.location.hash.slice(1);
  return SETTINGS_TABS.includes(tab) ? tab : "general";
}

function renderSettingsTabs() {
  const active = currentSettingsTab();
  elements.settingsTabs.forEach((tab) => {
    const selected = tab.dataset.settingsTab === active;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  elements.settingsPanels.forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== active;
  });
}

function selectSettingsTab(tab, { focus = false } = {}) {
  window.history.replaceState({}, "", `/settings#${tab}`);
  renderSettingsTabs();
  if (focus) elements.settingsTabs.find((entry) => entry.dataset.settingsTab === tab)?.focus();
}

function openSettings(tab) {
  navigateTo(`/settings#${tab}`);
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
  renderCaptureRepeatOptions();
  renderRoute();
  renderDate();
  renderTasks();
  renderTimeline();
  renderReview();
  renderProgress();
  renderPlan();
  renderGoals();
  renderUpcoming();
  renderSidebar();
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

function openProjectSettings() {
  closeCaptureSelects();
  elements.projectState.textContent = "";
  openSettings("general");
  window.requestAnimationFrame(() => {
    elements.projectNewName.scrollIntoView({ block: "center" });
    elements.projectNewName.focus({ preventScroll: true });
  });
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
  if (settingsActive) {
    renderSettingsTabs();
    renderProjectManager();
  }
  elements.settingsLink.classList.toggle("active", settingsActive);
  if (settingsActive) elements.settingsLink.setAttribute("aria-current", "page");
  else elements.settingsLink.removeAttribute("aria-current");
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
  clearCapturePolish();
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

function tasksForDate(date = selectedDate) {
  return state.tasks
    .filter((task) => task.date === date)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || Number(b.focus) - Number(a.focus) || dueRank(a) - dueRank(b) || priorityWeight(b.priority) - priorityWeight(a.priority) || a.createdAt.localeCompare(b.createdAt));
}

function logsForDate(date = selectedDate) {
  return state.logs
    .filter((log) => log.date === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function renderItemActions(entry, host) {
  const isTask = host === "task";
  const editKind = isTask || entry.sourceTaskId ? "task" : "log";
  const editId = isTask ? entry.id : entry.sourceTaskId || entry.id;
  const noun = isTask ? "待办" : "工作记录";
  return `
    <div class="item-actions">
      <button class="item-action edit-entry" type="button" data-edit-kind="${editKind}" data-edit-id="${escapeAttribute(editId)}" aria-label="编辑${noun}：${escapeAttribute(entry.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.5 4 4-.5L18.7 8.8a2.1 2.1 0 0 0 0-3l-.5-.5a2.1 2.1 0 0 0-3 0L4 16.5ZM13.8 6.7l3.5 3.5"/></svg>
      </button>
      <button class="item-action danger ${isTask ? "delete-task" : "delete-log"}" type="button" aria-label="删除${noun}：${escapeAttribute(entry.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13M10 11v5M14 11v5"/></svg>
      </button>
    </div>`;
}

function entryEditMatches(host, hostId) {
  return entryEdit?.host === host && entryEdit.hostId === hostId;
}

function entryEditOptions(field) {
  if (field === "priority") {
    return [
      { value: "normal", label: "普通", tone: "normal" },
      { value: "high", label: "重要", tone: "high" },
      { value: "low", label: "稍后", tone: "low" },
    ];
  }
  const current = entryEdit?.draft.project ?? "";
  const projects = [...new Set([current, ...projectOptions].filter(Boolean))];
  return [
    { value: "", label: "无项目" },
    ...projects.map((project) => ({ value: project, label: project })),
  ];
}

function renderEntryEditSelect(field, label) {
  const value = entryEdit.draft[field] ?? "";
  const options = entryEditOptions(field);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const controlId = `entry-edit-${entryEdit.host}-${entryEdit.hostId}-${field}`;
  return `
    <div class="entry-edit-control">
      <span class="entry-edit-label">${label}</span>
      <div class="capture-select entry-edit-select ${field === "priority" ? "priority-field" : "project-field"}" data-entry-edit-select data-field="${field}">
        <button class="capture-select-trigger" type="button" data-label="${label}" aria-label="${label}：${escapeAttribute(selected.label)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${escapeAttribute(controlId)}">
          <span class="capture-select-value">${escapeHtml(selected.label)}</span>
          <svg class="capture-select-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg>
        </button>
        <div class="capture-select-menu" id="${escapeAttribute(controlId)}" role="listbox" hidden>
          ${options.map((option) => `<button class="capture-select-option" type="button" role="option" data-value="${escapeAttribute(option.value)}"${option.tone ? ` data-tone="${option.tone}"` : ""} aria-selected="${option.value === value}">${escapeHtml(option.label)}</button>`).join("")}
        </div>
      </div>
    </div>`;
}

function renderEntryEditForm() {
  const sourceLabel = entryEdit.kind === "task" ? "待办内容" : "工作内容";
  const sourceHint = entryEdit.kind === "task" && entryEdit.host === "log"
    ? '<p class="entry-edit-hint">此记录来源于已完成待办，保存后会同步更新待办与时间线。</p>'
    : "";
  return `
    <form class="entry-edit-form" data-entry-edit-form>
      <label class="entry-edit-title-field">
        <span class="entry-edit-label">${sourceLabel}</span>
        <input class="entry-edit-title" name="title" maxlength="120" autocomplete="off" value="${escapeAttribute(entryEdit.draft.title)}" aria-label="${sourceLabel}" required />
      </label>
      <div class="entry-edit-options">
        ${renderEntryEditSelect("project", "所属项目")}
        ${entryEdit.kind === "task" ? renderEntryEditSelect("priority", "优先级") : ""}
      </div>
      ${entryEdit.kind === "task" ? renderEntryEditSchedule() : ""}
      ${sourceHint}
      <div class="entry-edit-actions">
        <button class="text-button cancel-entry-edit" type="button">取消</button>
        <button class="primary-button save-entry-edit" type="submit">保存修改</button>
      </div>
    </form>`;
}

function renderEntryEditSchedule() {
  const { dueDate, dueTime, remindMinutes } = entryEdit.draft;
  const remindOptions = [["", "不提醒"], ...Object.entries(REMIND_LABELS).map(([value, label]) => [value, label.replace("提醒", "") || label])];
  return `
    <div class="entry-edit-schedule">
      <div class="capture-extra-field"><span>截止日期</span><input type="date" data-edit-field="dueDate" value="${escapeAttribute(dueDate)}" aria-label="截止日期" />
        <div class="due-quick" role="group" aria-label="快捷截止">${["day", "week"].map((kind) => `<button class="due-quick-button" type="button" data-edit-due="${kind}" aria-pressed="${dueDate === quickDueDate(kind, entryEdit.draft.date)}" title="${escapeAttribute(quickDueLabel(kind, entryEdit.draft.date))}">${kind === "day" ? "今日" : "本周"}</button>`).join("")}</div>
      </div>
      <label class="capture-extra-field"><span>截止时间</span><input type="time" data-edit-field="dueTime" value="${escapeAttribute(dueTime)}" /></label>
      <label class="capture-extra-field"><span>提醒</span><select data-edit-field="remindMinutes">${remindOptions.map(([value, label]) => `<option value="${value}"${value === remindMinutes ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
      <label class="capture-extra-field"><span>关联目标</span><select data-edit-field="goalId">${goalOptionsHtml(entryEdit.draft.date, entryEdit.draft.goalId)}</select></label>
    </div>`;
}

function sameEntryEditTarget(kind, id, host, hostId) {
  return entryEdit?.kind === kind && entryEdit.id === id && entryEdit.host === host && entryEdit.hostId === hostId;
}

function startEntryEdit(kind, id, host, hostId) {
  if (sameEntryEditTarget(kind, id, host, hostId)) return;
  if (entryEdit?.dirty && !window.confirm("当前修改尚未保存，确定放弃并编辑另一条记录吗？")) return;
  const entry = kind === "task"
    ? state.tasks.find((item) => item.id === id)
    : state.logs.find((item) => item.id === id && !item.sourceTaskId);
  if (!entry) {
    showToast(kind === "task" ? "未找到来源待办，暂时无法编辑" : "未找到这条工作记录");
    return;
  }
  const original = {
    title: entry.title,
    project: entry.project ?? "",
    ...(kind === "task" ? {
      priority: entry.priority ?? "normal",
      dueDate: entry.dueDate ?? "",
      dueTime: entry.dueTime ?? "",
      remindMinutes: entry.remindMinutes === null || entry.remindMinutes === undefined ? "" : String(entry.remindMinutes),
      goalId: entry.goalId ?? "",
      date: entry.date,
    } : {}),
  };
  entryEdit = {
    kind,
    id,
    host,
    hostId,
    original,
    draft: { ...original },
    dirty: false,
  };
  closeCaptureSelects();
  render();
  window.requestAnimationFrame(() => document.querySelector(".entry-edit-title")?.focus());
}

function updateEntryEditDirty() {
  if (!entryEdit) return;
  entryEdit.dirty = Object.keys(entryEdit.original).some((field) => entryEdit.draft[field] !== entryEdit.original[field]);
}

function updateEntryEditField(field, value) {
  if (!entryEdit || !Object.hasOwn(entryEdit.draft, field)) return;
  entryEdit.draft[field] = value;
  updateEntryEditDirty();
}

function closeEntryEditSelect(root, { restoreFocus = false } = {}) {
  const trigger = root?.querySelector(".capture-select-trigger");
  const menu = root?.querySelector(".capture-select-menu");
  if (!trigger || !menu || menu.hidden) return;
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  root.classList.remove("is-open");
  if (restoreFocus) trigger.focus();
}

function closeEntryEditSelects(except = null) {
  document.querySelectorAll("[data-entry-edit-select]").forEach((root) => {
    if (root !== except) closeEntryEditSelect(root);
  });
}

function openEntryEditSelect(root) {
  closeCaptureSelects();
  closeEntryEditSelects(root);
  const trigger = root.querySelector(".capture-select-trigger");
  const menu = root.querySelector(".capture-select-menu");
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  root.classList.add("is-open");
  const selected = menu.querySelector('[aria-selected="true"]') ?? menu.querySelector("[role='option']");
  window.requestAnimationFrame(() => selected?.focus());
}

function chooseEntryEditOption(root, option) {
  const value = option.dataset.value;
  updateEntryEditField(root.dataset.field, value);
  root.querySelector(".capture-select-value").textContent = option.textContent;
  root.querySelector(".capture-select-trigger").setAttribute("aria-label", `${root.querySelector(".capture-select-trigger").dataset.label}：${option.textContent}`);
  root.querySelectorAll("[role='option']").forEach((item) => {
    item.setAttribute("aria-selected", String(item === option));
  });
  closeEntryEditSelect(root, { restoreFocus: true });
}

function handleEntryEditSelectKeydown(event) {
  const root = event.target.closest("[data-entry-edit-select]");
  if (!root) return false;
  const menu = root.querySelector(".capture-select-menu");
  const trigger = root.querySelector(".capture-select-trigger");
  const options = [...root.querySelectorAll("[role='option']")];
  if (event.target === trigger && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    openEntryEditSelect(root);
    const target = event.key === "ArrowUp" || event.key === "End" ? options.at(-1) : options[0];
    window.requestAnimationFrame(() => target?.focus());
    return true;
  }
  if (menu.hidden) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    closeEntryEditSelect(root, { restoreFocus: true });
    return true;
  }
  if (event.key === "Tab") {
    closeEntryEditSelect(root);
    return false;
  }
  if ((event.key === "Enter" || event.key === " ") && event.target.matches("[role='option']")) {
    event.preventDefault();
    chooseEntryEditOption(root, event.target);
    return true;
  }
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const currentIndex = Math.max(0, options.indexOf(document.activeElement));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    options[nextIndex]?.focus();
    return true;
  }
  return false;
}

function cancelEntryEdit() {
  if (!entryEdit) return;
  const { host, hostId } = entryEdit;
  entryEdit = null;
  render();
  window.requestAnimationFrame(() => {
    const list = host === "task" ? elements.taskList : elements.timelineList;
    [...list.querySelectorAll(host === "task" ? ".task-item" : ".timeline-item")]
      .find((item) => item.dataset.id === hostId)
      ?.querySelector(".edit-entry")
      ?.focus();
  });
}

function saveEntryEdit() {
  if (!entryEdit) return;
  const title = entryEdit.draft.title.trim();
  if (!title) {
    showToast("内容不能为空");
    document.querySelector(".entry-edit-title")?.focus();
    return;
  }
  const entry = entryEdit.kind === "task"
    ? state.tasks.find((item) => item.id === entryEdit.id)
    : state.logs.find((item) => item.id === entryEdit.id && !item.sourceTaskId);
  if (!entry) {
    showToast("记录已不存在，已退出编辑");
    entryEdit = null;
    render();
    return;
  }
  if (entryEdit.kind === "task" && entryEdit.draft.remindMinutes !== "" && !entryEdit.draft.dueDate && !entryEdit.draft.dueTime) {
    showToast("设置提醒前，先选择截止日期或时间");
    return;
  }
  entry.title = title;
  entry.project = entryEdit.draft.project;
  if (entryEdit.kind === "log") entry.source = "";
  if (entryEdit.kind === "task") {
    const { dueTime, remindMinutes } = entryEdit.draft;
    const dueDate = entryEdit.draft.dueDate || (dueTime ? entry.date : "");
    entry.dueDate = dueDate || null;
    entry.dueTime = dueTime || null;
    entry.remindMinutes = remindMinutes === "" ? null : Number(remindMinutes);
    if (entry.remindMinutes !== null) requestNotificationPermission();
    entry.priority = entryEdit.draft.priority;
    entry.goalId = entryEdit.draft.goalId || null;
    state.logs
      .filter((log) => log.sourceTaskId === entry.id)
      .forEach((log) => {
        log.title = title;
        log.project = entry.project;
      });
  }
  const editedKind = entryEdit.kind;
  entryEdit = null;
  persist();
  render();
  showToast(editedKind === "task" ? "待办已更新" : "工作记录已更新");
}

function renderTasks() {
  const tasks = tasksForDate();

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
    const editing = entryEditMatches("task", task.id);
    item.className = `task-item${task.completed ? " completed" : ""}${editing ? " editing" : ""}${task.focus ? " is-focus" : ""}`;
    item.dataset.id = task.id;
    const priorityLabel = task.priority === "high" ? "重要" : task.priority === "low" ? "稍后" : "普通";
    const project = task.project ? `<span class="project-chip"># ${escapeHtml(task.project)}</span>` : "";
    const priority = task.priority !== "normal" ? `<span class="priority-chip ${task.priority}">${priorityLabel}</span>` : "";
    item.innerHTML = editing ? `
      <button class="task-check" type="button" aria-label="${task.completed ? "已完成" : "未完成"}待办" disabled>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8"/></svg>
      </button>
      ${renderEntryEditForm()}` : `
      <button class="task-check" type="button" aria-label="${task.completed ? "恢复" : "完成"}待办：${escapeAttribute(task.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8"/></svg>
      </button>
      <div class="task-body">
        <p class="task-title" title="${escapeAttribute(task.title)}">${escapeHtml(task.title)}</p>
        <div class="task-meta">${renderTaskScheduleChips(task)}${renderGoalChip(task)}${project}${priority}<span>${formatTime(task.createdAt)}</span></div>
      </div>
      <button class="focus-toggle" type="button" aria-pressed="${task.focus}" aria-label="${task.focus ? "取消重点" : "设为今日重点"}：${escapeAttribute(task.title)}" title="${task.focus ? "取消重点" : "设为今日重点（每天最多 3 件）"}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/></svg>
      </button>
      ${renderItemActions(task, "task")}`;
    fragment.append(item);
  });
  elements.taskList.append(fragment);
}

function priorityWeight(priority) {
  return priority === "high" ? 2 : priority === "normal" ? 1 : 0;
}

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];
const REMIND_LABELS = { 0: "准时提醒", 15: "提前 15 分钟提醒", 60: "提前 1 小时提醒", 1440: "提前 1 天提醒" };
const DEFAULT_REMIND_CLOCK = "09:00";
const REMINDER_STORAGE_KEY = "mydays.reminded";
const REMINDER_GRACE_MS = 2 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 3;

function currentDateKey() {
  return toDateKey(new Date());
}

function daysBetweenKeys(from, to) {
  return Math.round((fromDateKey(to) - fromDateKey(from)) / 86400000);
}

function shortDateLabel(key) {
  const date = fromDateKey(key);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function recurrenceLabel(recurrence) {
  if (recurrence.rule === "daily") return "每天";
  if (recurrence.rule === "weekdays") return "工作日";
  if (recurrence.rule === "monthly") return `每月 ${recurrence.monthDay} 日`;
  const days = [1, 2, 3, 4, 5, 6, 0].filter((day) => recurrence.weekdays & (1 << day)).map((day) => WEEKDAY_NAMES[day]);
  return `每周${days.join("、")}`;
}

// Mirrors recurrenceMatches in server.js, which is what actually generates the daily instances.
function recurrenceMatchesDate(recurrence, dateKey) {
  if (recurrence.paused || dateKey < recurrence.startDate) return false;
  const date = fromDateKey(dateKey);
  const weekday = date.getDay();
  if (recurrence.rule === "daily") return true;
  if (recurrence.rule === "weekdays") return weekday >= 1 && weekday <= 5;
  if (recurrence.rule === "weekly") return Boolean(recurrence.weekdays & (1 << weekday));
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() === Math.min(recurrence.monthDay, lastDay);
}

function dueInfo(task) {
  if (!task.dueDate) return null;
  const time = task.dueTime ? ` ${task.dueTime}` : "";
  if (task.completed) return { tone: "", text: `截止 ${shortDateLabel(task.dueDate)}${time}` };
  const days = daysBetweenKeys(currentDateKey(), task.dueDate);
  if (days < 0) return { tone: "overdue", text: `逾期 ${-days} 天`, rank: 0 };
  if (days === 0) {
    const passed = task.dueTime && new Date(`${task.dueDate}T${task.dueTime}`) < new Date();
    return passed
      ? { tone: "overdue", text: `今天${time} 已截止`, rank: 0 }
      : { tone: "today", text: `今天${time} 截止`, rank: 0 };
  }
  if (days === 1) return { tone: "soon", text: `明天${time} 截止`, rank: 1 };
  if (days <= DUE_SOON_DAYS) return { tone: "soon", text: `还剩 ${days} 天`, rank: 1 };
  return { tone: "", text: `${shortDateLabel(task.dueDate)}${time} 截止`, rank: 2 };
}

function dueRank(task) {
  return task.completed ? 3 : dueInfo(task)?.rank ?? 2;
}

function renderTaskScheduleChips(task, chipClass = "schedule-chip") {
  const chips = [];
  const due = dueInfo(task);
  if (due) {
    const remind = task.remindMinutes !== null && task.remindMinutes !== undefined && !task.completed;
    chips.push(`<span class="${chipClass} due ${due.tone}"${remind ? ` title="${escapeAttribute(REMIND_LABELS[task.remindMinutes] ?? "已设置提醒")}"` : ""}>${remind ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20a2 2 0 0 0 4 0"/></svg>' : ""}${escapeHtml(due.text)}</span>`);
  }
  if (task.originDate && task.originDate < task.date) {
    chips.push(`<span class="${chipClass} rolled" title="最初计划于 ${escapeAttribute(task.originDate)}">顺延 ${daysBetweenKeys(task.originDate, task.date)} 天</span>`);
  }
  const recurrence = task.recurrenceId && state.recurrences.find((entry) => entry.id === task.recurrenceId);
  if (recurrence) chips.push(`<span class="${chipClass} repeat">${escapeHtml(recurrenceLabel(recurrence))}</span>`);
  return chips.join("");
}

async function prepareTasksForToday({ initial = false } = {}) {
  const date = currentDateKey();
  if (preparedTaskDate === date) return;
  const previous = preparedTaskDate;
  preparedTaskDate = date;
  let result;
  try {
    if (!initial) await waitForPendingSaves();
    result = await requestJson("/api/tasks/daily", { method: "POST", body: JSON.stringify({ date, timeZone: browserTimeZone() }) });
  } catch {
    preparedTaskDate = previous;
    return;
  }
  // Keep "today" selected across midnight when the page stays open.
  if (previous && selectedDate === previous) selectedDate = date;
  const message = [
    result.rolled ? `${result.rolled} 项未完成待办已顺延到今天` : "",
    result.generated ? `已生成 ${result.generated} 项今天的重复待办` : "",
  ].filter(Boolean).join("，");
  if (!message) {
    if (previous && selectedDate === date) render();
    return;
  }
  if (initial) {
    adoptServerState(result);
    showToast(message);
  } else {
    await mergeServerState({ message });
  }
}

function readRemindedKeys() {
  try {
    const value = JSON.parse(window.localStorage.getItem(REMINDER_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeRemindedKeys(keys) {
  try {
    window.localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(keys.slice(-300)));
  } catch {}
}

function taskReminderAt(task) {
  if (task.completed || !task.dueDate || task.remindMinutes === null || task.remindMinutes === undefined) return null;
  const due = new Date(`${task.dueDate}T${task.dueTime ?? DEFAULT_REMIND_CLOCK}`);
  return Number.isNaN(due.getTime()) ? null : new Date(due.getTime() - task.remindMinutes * 60000);
}

function checkTaskReminders() {
  const now = Date.now();
  const reminded = readRemindedKeys();
  const known = new Set(reminded);
  const due = [];
  for (const task of state.tasks) {
    const at = taskReminderAt(task);
    if (!at || at.getTime() > now || now - at.getTime() > REMINDER_GRACE_MS) continue;
    const key = `${task.id}|${at.toISOString()}`;
    if (known.has(key)) continue;
    reminded.push(key);
    due.push({ task, key });
  }
  if (!due.length) return;
  writeRemindedKeys(reminded);
  for (const { task, key } of due) {
    const body = `${task.title}${dueInfo(task) ? ` · ${dueInfo(task).text}` : ""}`;
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const notification = new Notification("MyDays 待办提醒", { body, tag: key });
        notification.addEventListener("click", () => {
          window.focus();
          selectedDate = task.date;
          navigateTo("/#tasks");
        });
      } catch {}
    }
  }
  showToast(due.length === 1 ? `提醒：${due[0].task.title}` : `有 ${due.length} 项待办到了提醒时间`);
}

function requestNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") return;
  Notification.requestPermission().then(renderTaskSettings).catch(() => {});
}

function renderCaptureRepeatOptions() {
  const date = fromDateKey(selectedDate);
  const current = elements.captureRepeat.value;
  elements.captureRepeat.replaceChildren(...[
    ["", "不重复"],
    ["daily", "每天"],
    ["weekdays", "工作日（周一至周五）"],
    ["weekly", `每周${WEEKDAY_NAMES[date.getDay()]}`],
    ["monthly", `每月 ${date.getDate()} 日`],
  ].map(([value, label]) => new Option(label, value)));
  elements.captureRepeat.value = current;
  syncCaptureExtra();
}

function setCaptureExtraOpen(open) {
  elements.captureExtra.hidden = !open;
  elements.captureMoreButton.setAttribute("aria-expanded", String(open));
  elements.captureMoreButton.classList.toggle("active", open);
}

// "This week" ends on Friday for a workday; picked on a weekend it means that Sunday.
function quickDueDate(kind, baseKey) {
  if (kind === "day") return baseKey;
  const base = fromDateKey(baseKey);
  const weekday = (base.getDay() + 6) % 7;
  return shiftDateKeyBy(baseKey, weekday <= 4 ? 4 - weekday : 6 - weekday);
}

function quickDueLabel(kind, baseKey) {
  const date = quickDueDate(kind, baseKey);
  return `${kind === "day" ? "今日截止" : "本周截止"}（${shortDateLabel(date)} ${new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(fromDateKey(date))}）`;
}

function setCaptureQuickDue(kind) {
  const date = quickDueDate(kind, selectedDate);
  elements.captureRepeat.value = "";
  elements.captureDueDate.value = elements.captureDueDate.value === date ? "" : date;
  syncCaptureExtra();
}

function syncCaptureExtra() {
  const repeat = elements.captureRepeat.value;
  elements.captureDueQuickButtons.forEach((button) => {
    const kind = button.dataset.dueQuick;
    button.setAttribute("aria-pressed", String(!repeat && elements.captureDueDate.value === quickDueDate(kind, selectedDate)));
    button.title = quickDueLabel(kind, selectedDate);
  });
  elements.captureDueDateField.hidden = Boolean(repeat);
  elements.captureDueTimeLabel.textContent = repeat ? "每次的时间" : "截止时间";
  const parts = [];
  if (repeat) parts.push(elements.captureRepeat.selectedOptions[0]?.textContent.replace(/（.*）/, "") ?? "");
  else if (elements.captureDueDate.value) parts.push(`${shortDateLabel(elements.captureDueDate.value)} 截止`);
  if (elements.captureDueTime.value) parts.push(elements.captureDueTime.value);
  if (elements.captureRemind.value !== "") parts.push("提醒");
  elements.captureMoreLabel.textContent = parts.length ? parts.join(" · ") : "截止 / 重复";
  elements.captureMoreButton.classList.toggle("has-value", parts.length > 0);
}

function resetCaptureExtra() {
  elements.captureDueDate.value = "";
  elements.captureDueTime.value = "";
  elements.captureRemind.value = "";
  elements.captureRepeat.value = "";
  setCaptureExtraOpen(false);
  syncCaptureExtra();
}

// Returns the schedule fields for a new task, a recurrence when one was chosen, or an error message.
function readCaptureSchedule() {
  const dueTime = elements.captureDueTime.value || null;
  const remindMinutes = elements.captureRemind.value === "" ? null : Number(elements.captureRemind.value);
  const rule = elements.captureRepeat.value;
  if (rule) {
    if (remindMinutes !== null && !dueTime) return { error: "重复待办要提醒的话，请设置每次的时间" };
    return { rule, dueTime, remindMinutes };
  }
  const dueDate = elements.captureDueDate.value || (dueTime ? selectedDate : null);
  if (remindMinutes !== null && !dueDate) return { error: "设置提醒前，先选择截止日期或时间" };
  return { dueDate, dueTime, remindMinutes };
}

function renderTaskSettings() {
  elements.taskRollover.checked = taskSettings.taskRollover;
  elements.taskRolloverLabel.textContent = taskSettings.taskRollover ? "已开启" : "已关闭";
  const permission = "Notification" in window ? Notification.permission : "unsupported";
  elements.taskNotifyEnable.hidden = permission !== "default";
  elements.taskNotifyState.textContent = {
    granted: "已允许。设置了提醒的待办到时会弹出系统通知；只在 MyDays 页面开着时提醒，放在后台标签页也可以。",
    denied: "浏览器已禁止 MyDays 发送通知，可以在浏览器的网站设置里重新允许。在此之前，提醒只显示在页面内。",
    default: "允许后，设置了提醒的待办到时会弹出系统通知；只在 MyDays 页面开着时提醒，放在后台标签页也可以。",
    unsupported: "当前浏览器不支持系统通知，提醒只显示在页面内。",
  }[permission];
  const recurrences = state.recurrences ?? [];
  elements.recurrenceCount.textContent = String(recurrences.length);
  elements.recurrenceList.innerHTML = recurrences.length
    ? recurrences.map((recurrence) => {
      const meta = [
        recurrenceLabel(recurrence),
        recurrence.dueTime,
        recurrence.project,
        recurrence.remindMinutes !== null ? REMIND_LABELS[recurrence.remindMinutes] : "",
        recurrence.paused ? "已暂停" : "",
      ].filter(Boolean).join(" · ");
      return `<div class="recurrence-row${recurrence.paused ? " paused" : ""}">
        <div><strong>${escapeHtml(recurrence.title)}</strong><small>${escapeHtml(meta)}</small></div>
        <div>
          <button class="text-button" type="button" data-recurrence-toggle="${escapeAttribute(recurrence.id)}">${recurrence.paused ? "恢复" : "暂停"}</button>
          <button class="text-button danger-text" type="button" data-recurrence-delete="${escapeAttribute(recurrence.id)}">删除</button>
        </div>
      </div>`;
    }).join("")
    : '<div class="summary-empty">还没有重复待办。</div>';
}

function openTaskSettings() {
  renderTaskSettings();
  elements.taskSettingsDialog.showModal();
}

async function setTaskRollover(enabled) {
  try {
    taskSettings = await requestJson("/api/tasks/settings", { method: "PUT", body: JSON.stringify({ taskRollover: enabled }) });
    renderTaskSettings();
    showToast(enabled ? "已开启自动顺延" : "已关闭自动顺延");
    if (enabled) {
      preparedTaskDate = null;
      await prepareTasksForToday();
    }
  } catch (error) {
    renderTaskSettings();
    showToast(`保存失败：${error.message}`);
  }
}

function toggleRecurrence(id) {
  const recurrence = state.recurrences.find((entry) => entry.id === id);
  if (!recurrence) return;
  recurrence.paused = !recurrence.paused;
  persist();
  renderTaskSettings();
  render();
  showToast(recurrence.paused ? "已暂停，之后不再生成" : "已恢复");
  if (!recurrence.paused) {
    preparedTaskDate = null;
    prepareTasksForToday();
  }
}

function deleteRecurrence(id) {
  const recurrence = state.recurrences.find((entry) => entry.id === id);
  if (!recurrence || !window.confirm(`删除重复待办“${recurrence.title}”？之后不再生成，已经生成的待办会保留。`)) return;
  state.recurrences = state.recurrences.filter((entry) => entry.id !== id);
  persist();
  renderTaskSettings();
  render();
  showToast("重复待办已删除");
}

function shiftDateKeyBy(key, days) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function weekKeyOf(dateKey) {
  return toDateKey(startOfPeriod("week", fromDateKey(dateKey)));
}

function goalsForWeek(week) {
  return (state.goals ?? []).filter((goal) => goal.week === week).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function goalProgress(goal) {
  const linked = state.tasks.filter((task) => task.goalId === goal.id);
  return { completed: linked.filter((task) => task.completed).length, total: linked.length };
}

function renderGoalChip(task) {
  const goal = task.goalId ? state.goals.find((entry) => entry.id === task.goalId) : null;
  return goal ? `<span class="goal-chip" title="本周目标：${escapeAttribute(goal.title)}">◎ ${escapeHtml(goal.title)}</span>` : "";
}

// Options for linking a task to a goal of its week; a link to a goal of another week is kept selectable.
function goalOptionsHtml(dateKey, selectedId = "") {
  const goals = goalsForWeek(weekKeyOf(dateKey));
  const linked = selectedId && !goals.some((goal) => goal.id === selectedId) ? state.goals.find((goal) => goal.id === selectedId) : null;
  const options = [...(linked ? [linked] : []), ...goals];
  return [
    `<option value="">${goals.length || linked ? "不关联" : "这周还没有目标"}</option>`,
    ...options.map((goal) => `<option value="${escapeAttribute(goal.id)}"${goal.id === selectedId ? " selected" : ""}>${escapeHtml(goal.title)}</option>`),
  ].join("");
}

const MAX_FOCUS_PER_DAY = 3;
const MAX_GOALS_PER_WEEK = 5;
const PLAN_DISMISS_STORAGE_KEY = "mydays.planDismissed";

function toggleFocus(id) {
  const task = state.tasks.find((entry) => entry.id === id);
  if (!task) return;
  if (!task.focus && state.tasks.filter((entry) => entry.date === task.date && entry.focus).length >= MAX_FOCUS_PER_DAY) {
    showToast(`每天最多 ${MAX_FOCUS_PER_DAY} 件重点，先取消一件再选`);
    return;
  }
  task.focus = !task.focus;
  persist();
  render();
}

function moveTaskToDate(task, date) {
  if (task.date < date && !task.originDate) task.originDate = task.date;
  task.date = date;
  // Focus is chosen per day, so it does not travel with the task.
  task.focus = false;
}

function planCandidates() {
  const today = currentDateKey();
  const soon = shiftDateKeyBy(today, DUE_SOON_DAYS);
  return state.tasks
    .filter((task) => !task.completed && task.date !== today && !(task.recurrenceId && task.date < today)
      && (task.date < today || (task.dueDate && task.dueDate <= soon)))
    .sort((a, b) => dueRank(a) - dueRank(b) || a.date.localeCompare(b.date));
}

function readPlanDismissed() {
  try {
    return window.localStorage.getItem(PLAN_DISMISS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function renderPlan() {
  const today = currentDateKey();
  const candidates = currentRoute.key === "today" && selectedDate === today && readPlanDismissed() !== today ? planCandidates() : [];
  elements.planCard.hidden = !candidates.length;
  if (!candidates.length) return;
  elements.planList.innerHTML = candidates.slice(0, 8).map((task) => {
    const origin = task.date < today ? `原定 ${shortDateLabel(task.date)}` : `计划在 ${shortDateLabel(task.date)}`;
    return `<div class="plan-item" data-id="${escapeAttribute(task.id)}">
      <div><strong title="${escapeAttribute(task.title)}">${escapeHtml(task.title)}</strong>
        <p>${renderTaskScheduleChips(task)}${task.project ? `<span class="project-chip"># ${escapeHtml(task.project)}</span>` : ""}<span>${origin}</span></p></div>
      <button class="soft-button" type="button" data-plan-add>加入今天</button>
    </div>`;
  }).join("") + (candidates.length > 8 ? `<p class="plan-more">还有 ${candidates.length - 8} 项，可在「即将到期」里查看。</p>` : "");
}

function addPlannedTasks(ids) {
  const today = currentDateKey();
  const tasks = state.tasks.filter((task) => ids.includes(task.id));
  tasks.forEach((task) => moveTaskToDate(task, today));
  if (!tasks.length) return;
  persist();
  render();
  showToast(tasks.length === 1 ? `已加入今天：${tasks[0].title}` : `已把 ${tasks.length} 项加入今天`);
}

function renderGoals() {
  const week = weekKeyOf(selectedDate);
  const goals = goalsForWeek(week);
  const end = shiftDateKeyBy(week, 6);
  elements.goalsWeek.textContent = `${shortDateLabel(week)} – ${shortDateLabel(end)}`;
  elements.goalCount.textContent = `${goals.filter((goal) => goal.done).length}/${goals.length}`;
  elements.goalAddForm.hidden = goals.length >= MAX_GOALS_PER_WEEK;
  elements.goalList.innerHTML = goals.length
    ? goals.map((goal) => {
      const { completed, total } = goalProgress(goal);
      const ratio = goal.done ? 100 : total ? Math.round((completed / total) * 100) : 0;
      return `<div class="goal-row${goal.done ? " done" : ""}" data-goal-id="${escapeAttribute(goal.id)}">
        <button class="goal-check" type="button" data-goal-toggle aria-pressed="${goal.done}" aria-label="${goal.done ? "恢复" : "完成"}目标：${escapeAttribute(goal.title)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8"/></svg>
        </button>
        <div class="goal-body">
          <p title="${escapeAttribute(goal.title)}">${escapeHtml(goal.title)}</p>
          <div class="goal-progress" aria-hidden="true"><i style="width:${ratio}%"></i></div>
          <small>${total ? `关联待办 ${completed}/${total}` : "添加待办时可在「截止 / 重复」里关联这个目标"}</small>
        </div>
        <button class="item-action danger" type="button" data-goal-delete aria-label="删除目标：${escapeAttribute(goal.title)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13M10 11v5M14 11v5"/></svg>
        </button>
      </div>`;
    }).join("")
    : '<p class="goals-empty">给这周定 1 到 3 个想达成的结果，待办可以挂到目标下，周报会对照目标写进展。</p>';
  const selected = elements.captureGoal.value;
  elements.captureGoal.innerHTML = goalOptionsHtml(selectedDate, selected);
}

function addGoal(event) {
  event.preventDefault();
  const title = elements.goalNewTitle.value.replace(/\s+/g, " ").trim();
  if (!title) return;
  const week = weekKeyOf(selectedDate);
  if (goalsForWeek(week).length >= MAX_GOALS_PER_WEEK) {
    showToast(`每周最多 ${MAX_GOALS_PER_WEEK} 个目标`);
    return;
  }
  state.goals.push({ id: makeId(), week, title, done: false, createdAt: new Date().toISOString() });
  elements.goalNewTitle.value = "";
  persist();
  render();
}

function toggleGoal(id) {
  const goal = state.goals.find((entry) => entry.id === id);
  if (!goal) return;
  goal.done = !goal.done;
  persist();
  render();
  if (goal.done) showToast(`目标达成：${goal.title}`);
}

function deleteGoal(id) {
  const goal = state.goals.find((entry) => entry.id === id);
  if (!goal || !window.confirm(`删除目标“${goal.title}”？关联的待办会保留，只是不再挂在这个目标下。`)) return;
  state.goals = state.goals.filter((entry) => entry.id !== id);
  state.tasks.filter((task) => task.goalId === id).forEach((task) => { task.goalId = null; });
  persist();
  render();
}

const UPCOMING_DAYS = 14;

// Open tasks placed by deadline: overdue, then each day of the next two weeks, then later. A task sits on its
// due date when it has one, otherwise on its planned date; plain tasks for today stay on the today page.
function upcomingEntries() {
  const today = currentDateKey();
  const horizon = shiftDateKeyBy(today, UPCOMING_DAYS);
  return state.tasks
    .filter((task) => !task.completed && !(task.recurrenceId && task.date < today))
    .flatMap((task) => {
      if (task.dueDate && task.dueDate < today) return [{ task, key: task.dueDate, group: "overdue" }];
      const key = task.dueDate ?? task.date;
      if (key < today || (key === today && !task.dueDate)) return [];
      return [{ task, key, group: key > horizon ? "later" : key }];
    })
    .sort((a, b) => a.key.localeCompare(b.key) || priorityWeight(b.task.priority) - priorityWeight(a.task.priority));
}

function upcomingGroupLabel(group) {
  if (group === "overdue") return "已逾期";
  if (group === "later") return "两周以后";
  const today = currentDateKey();
  const days = daysBetweenKeys(today, group);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(fromDateKey(group));
  const relative = days === 0 ? "今天" : days === 1 ? "明天" : days === 2 ? "后天" : `${days} 天后`;
  return `${relative} · ${shortDateLabel(group)} ${weekday}`;
}

function renderUpcoming() {
  if (currentRoute.key !== "upcoming") return;
  const entries = upcomingEntries();
  if (!entries.length) {
    elements.upcomingList.innerHTML = '<div class="panel upcoming-empty"><strong>接下来两周没有要到期的待办</strong><p>给待办设置截止日期，或者在之后的日期里添加待办，它们会出现在这里。</p></div>';
    return;
  }
  const today = currentDateKey();
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry.task);
  }
  elements.upcomingList.innerHTML = [...groups].map(([group, tasks]) => `
    <section class="panel upcoming-group${group === "overdue" ? " overdue" : ""}">
      <h2>${escapeHtml(upcomingGroupLabel(group))} <span class="count-badge">${tasks.length}</span></h2>
      ${tasks.map((task) => `
        <div class="upcoming-item" data-id="${escapeAttribute(task.id)}">
          <button class="task-check" type="button" data-upcoming-complete aria-label="完成待办：${escapeAttribute(task.title)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8"/></svg>
          </button>
          <div class="upcoming-body">
            <button class="upcoming-title" type="button" data-upcoming-open title="查看 ${escapeAttribute(task.date)} 的待办">${escapeHtml(task.title)}</button>
            <div class="task-meta">${renderTaskScheduleChips(task)}${renderGoalChip(task)}${task.project ? `<span class="project-chip"># ${escapeHtml(task.project)}</span>` : ""}<span>${task.date === today ? "已在今天" : `计划于 ${shortDateLabel(task.date)}`}</span></div>
          </div>
          ${task.date === today ? "" : '<button class="soft-button" type="button" data-upcoming-today>移到今天</button>'}
        </div>`).join("")}
    </section>`).join("");
}

function renderSidebar() {
  const today = currentDateKey();
  const openToday = state.tasks.filter((task) => task.date === today && !task.completed).length;
  elements.navTodayCount.textContent = openToday ? String(openToday) : "";
  const weekAhead = shiftDateKeyBy(today, 7);
  const pressing = upcomingEntries().filter((entry) => entry.group === "overdue" || entry.key <= weekAhead).length;
  elements.navUpcomingCount.textContent = pressing ? String(pressing) : "";
  elements.navUpcomingCount.classList.toggle("alert", upcomingEntries().some((entry) => entry.group === "overdue"));
  renderSidebarProjects();
  renderHeatmap();
}

function renderSidebarProjects() {
  const openCounts = new Map();
  for (const task of state.tasks) {
    if (!task.completed && task.project) openCounts.set(task.project, (openCounts.get(task.project) ?? 0) + 1);
  }
  const names = [...new Set([...projectOptions, ...openCounts.keys()])];
  elements.sidebarProjectList.innerHTML = names.length
    ? names.map((name, index) => {
      const active = currentRoute.key === "summary" && summaryProject === name;
      const count = openCounts.get(name) ?? 0;
      return `<a class="sidebar-project${active ? " active" : ""}" href="/summary" data-project="${escapeAttribute(name)}"${active ? ' aria-current="page"' : ""} title="在周期汇总中查看「${escapeAttribute(name)}」">
        <i class="project-color color-${index % 4}" aria-hidden="true"></i><span>${escapeHtml(name)}</span><span class="nav-count" aria-label="${count} 项未完成">${count || ""}</span>
      </a>`;
    }).join("")
    : '<p class="sidebar-empty">还没有项目</p>';
}

function activityCountsByDate() {
  const counts = new Map();
  const add = (date) => counts.set(date, (counts.get(date) ?? 0) + 1);
  state.tasks.forEach((task) => { if (task.completed) add(task.date); });
  state.logs.forEach((log) => { if (!log.sourceTaskId) add(log.date); });
  return counts;
}

function heatLevel(count) {
  return count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 7 ? 3 : 4;
}

function renderHeatmap() {
  const year = heatmapCursor.getFullYear();
  const month = heatmapCursor.getMonth();
  const counts = activityCountsByDate();
  const today = currentDateKey();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  let activeDays = 0;
  let total = 0;
  const cells = Array.from({ length: offset }, () => '<span class="heatmap-cell blank" aria-hidden="true"></span>');
  for (let day = 1; day <= days; day += 1) {
    const key = toDateKey(new Date(year, month, day));
    const count = counts.get(key) ?? 0;
    if (count) {
      activeDays += 1;
      total += count;
    }
    const classes = [`heatmap-cell level-${heatLevel(count)}`, key === today ? "today" : "", key === selectedDate ? "selected" : "", key > today ? "future" : ""].filter(Boolean).join(" ");
    cells.push(`<button class="${classes}" type="button" data-date="${key}" aria-label="${month + 1}月${day}日：${count ? `${count} 条记录` : "没有记录"}" title="${month + 1}月${day}日 · ${count} 条">${day}</button>`);
  }
  elements.heatmapGrid.innerHTML = cells.join("");
  elements.heatmapTitle.textContent = `${year} 年 ${month + 1} 月`;
  elements.heatmapLegend.textContent = activeDays ? `${activeDays} 天有记录 · 共 ${total} 条` : "这个月还没有记录";
  const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  elements.heatmapNext.disabled = heatmapCursor >= currentMonth;
}

function goToDate(dateKey) {
  selectedDate = dateKey;
  const selected = fromDateKey(dateKey);
  calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
  clearCapturePolish();
  if (currentRoute.key === "today") render();
  else navigateTo("/");
}

// Picks up writes made elsewhere (quick capture, the digest, another device) without reloading everything.
async function syncIfServerChanged() {
  if (document.visibilityState !== "visible" || deferredSave) return;
  try {
    const { revision: latest } = await requestJson("/api/revision");
    if (latest !== revision) await mergeServerState({ message: "已同步新的记录" });
  } catch {}
}

function renderTimeline() {
  const logs = logsForDate();

  elements.logCount.textContent = String(logs.length);
  elements.timelineList.replaceChildren();
  if (!logs.length) {
    elements.timelineList.append(elements.emptyLogTemplate.content.cloneNode(true));
    return;
  }

  const fragment = document.createDocumentFragment();
  logs.forEach((log) => {
    const item = document.createElement("article");
    const editing = entryEditMatches("log", log.id);
    item.className = `timeline-item${log.sourceTaskId ? " auto" : ""}${editing ? " editing" : ""}`;
    item.dataset.id = log.id;
    item.innerHTML = `
      <time class="timeline-time">${formatTime(log.createdAt)}</time>
      <i class="timeline-dot"></i>
      ${editing ? renderEntryEditForm() : `<div class="timeline-content">
        <p title="${escapeAttribute(log.title)}">${escapeHtml(log.title)}</p>
        <small>${logOriginLabel(log)}${log.project ? ` · ${escapeHtml(log.project)}` : ""}</small>
      </div>
      ${renderItemActions(log, "log")}`}`;
    fragment.append(item);
  });
  elements.timelineList.append(fragment);
}

function setFieldValue(field, value) {
  if (field.value !== value) field.value = value;
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

function readPeriodRecord(context, project = summaryProject) {
  return state.periodReviews[context.key]?.[project];
}

function writePeriodRecord(context, project, changes) {
  const record = { ...normalizePeriodRecord(readPeriodRecord(context, project)), ...changes };
  if (!record.report.trim() && !record.notes.trim()) {
    if (state.periodReviews[context.key]) delete state.periodReviews[context.key][project];
    return;
  }
  if (!Object.hasOwn(state.periodReviews, context.key)) {
    setOwnValue(state.periodReviews, context.key, Object.create(null));
  }
  setOwnValue(state.periodReviews[context.key], project, record);
}

function renderReview() {
  const review = readDailyReview() ?? {};
  const completedCount = state.tasks.filter((task) => task.date === selectedDate && task.completed).length;
  const logCount = state.logs.filter((log) => log.date === selectedDate && !log.sourceTaskId).length;
  elements.reviewDaySummary.textContent = completedCount || logCount
    ? `今天完成了 ${completedCount} 项待办，另有 ${logCount} 条工作记录，详见工作时间线。`
    : "今天还没有工作记录。";
  setFieldValue(elements.reviewContent, review.content ?? "");
}

function renderProgress() {
  const tasks = state.tasks.filter((task) => task.date === selectedDate);
  // With focus items picked, the ring tracks those; otherwise every task of the day.
  const focus = tasks.filter((task) => task.focus);
  const scope = focus.length ? focus : tasks;
  const completed = scope.filter((task) => task.completed).length;
  const progress = scope.length ? Math.round((completed / scope.length) * 100) : 0;
  const circumference = 2 * Math.PI * 31;
  elements.scoreRing.style.strokeDashoffset = String(circumference * (1 - progress / 100));
  elements.scoreNumber.textContent = focus.length ? `${completed}/${focus.length}` : `${progress}%`;
  elements.scoreLabel.textContent = focus.length ? "重点完成" : "完成度";
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
  if (type === "day") shifted.setDate(shifted.getDate() + offset);
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

const MAX_RANGE_DAYS = 366;

function rangePreset(kind) {
  const today = new Date();
  const year = today.getFullYear();
  const todayKey = toDateKey(today);
  const ranges = {
    "first-half": [`${year}-01-01`, `${year}-06-30`],
    "second-half": [`${year}-07-01`, `${year}-12-31`],
    "year-to-date": [`${year}-01-01`, todayKey],
    "last-year": [`${year - 1}-01-01`, `${year - 1}-12-31`],
  };
  const [from, to] = ranges[kind];
  return { from, to: to > todayKey && kind !== "last-year" ? todayKey : to };
}

function defaultSummaryRange() {
  return rangePreset(new Date().getMonth() < 6 ? "first-half" : "second-half");
}

function getSummaryContext() {
  const custom = summaryPeriod === "range";
  summaryRange ??= defaultSummaryRange();
  const start = custom ? fromDateKey(summaryRange.from) : startOfPeriod(summaryPeriod, summaryAnchor);
  const end = custom ? fromDateKey(summaryRange.to) : endOfPeriod(summaryPeriod, start);
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const key = custom ? `range:${startKey}:${endKey}` : `${summaryPeriod}:${startKey}`;
  const matchesProject = (item) => !summaryProject || item.project === summaryProject;
  const tasks = state.tasks.filter((task) => task.date >= startKey && task.date <= endKey && matchesProject(task));
  const logs = state.logs.filter((log) => log.date >= startKey && log.date <= endKey && matchesProject(log));
  const days = daysBetween(start, end);
  const activeDays = days.filter((date) => (
    tasks.some((task) => task.date === date)
    || logs.some((log) => log.date === date)
    || (!summaryProject && Boolean(state.reviews[date]?.content?.trim()))
  ));
  return { type: summaryPeriod, key, start, end, startKey, endKey, tasks, logs, days, activeDays };
}

function formatContextHeading(context) {
  if (context.type !== "range") return formatPeriodHeading(context.type, context.start);
  return `${formatShortDate(context.start, true)} — ${formatShortDate(context.end, true)}`;
}

function formatPeriodHeading(type, start) {
  if (type === "day") {
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(start);
    return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 · ${weekday}`;
  }
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

function trendGranularity(context) {
  if (context.type !== "range") return { day: "day", week: "day", month: "day", quarter: "week", year: "month" }[context.type];
  return context.days.length <= 31 ? "day" : context.days.length <= 120 ? "week" : "month";
}

function makeTrendBuckets(context) {
  const granularity = trendGranularity(context);
  const buckets = [];
  if (granularity === "month") {
    const cursor = new Date(context.start.getFullYear(), context.start.getMonth(), 1);
    const multiYear = context.start.getFullYear() !== context.end.getFullYear();
    while (cursor <= context.end) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      buckets.push({
        label: multiYear && cursor.getMonth() === 0 ? `${cursor.getFullYear() % 100}年1月` : `${cursor.getMonth() + 1}月`,
        start: toDateKey(cursor < context.start ? context.start : cursor),
        end: toDateKey(monthEnd > context.end ? context.end : monthEnd),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const bucketSize = granularity === "week" ? 7 : 1;
    for (let index = 0; index < context.days.length; index += bucketSize) {
      const slice = context.days.slice(index, index + bucketSize);
      const start = fromDateKey(slice[0]);
      const label = context.type === "week"
        ? new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(start)
        : context.type === "month"
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
    <div class="trend-column" title="${escapeAttribute(bucket.label)}：${bucket.value} 项">
      <span class="trend-value">${bucket.value || ""}</span>
      <i style="height:${Math.max(6, Math.round((bucket.value / maxValue) * 100))}%"></i>
      <small>${escapeHtml(bucket.label)}</small>
    </div>
  `).join("");
}

const agentTimeCache = new Map();
const AGENT_TIME_CACHE_MS = 60 * 1000;

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

async function renderAgentTime(context) {
  const card = elements.summaryTimeCard;
  if (!agentDigest?.settings.enabled) {
    card.hidden = true;
    return;
  }
  const key = `${context.startKey}:${context.endKey}`;
  card.dataset.timeRange = key;
  let cached = agentTimeCache.get(key);
  if (!cached || Date.now() - cached.at > AGENT_TIME_CACHE_MS) {
    try {
      cached = { at: Date.now(), data: await requestJson(`/api/agent-digest/time?from=${context.startKey}&to=${context.endKey}`) };
      agentTimeCache.set(key, cached);
    } catch {
      card.hidden = true;
      return;
    }
  }
  if (card.dataset.timeRange !== key) return;
  const { totalMinutes, byProject } = cached.data;
  card.hidden = !totalMinutes;
  if (!totalMinutes) return;
  elements.summaryTimeTotal.textContent = `合计 ${formatMinutes(totalMinutes)}`;
  const top = byProject.slice(0, 8);
  const max = Math.max(...top.map((entry) => entry.minutes), 1);
  elements.summaryTimeProjects.innerHTML = top.map((entry, index) => `
    <div class="project-row">
      <span><i class="project-color color-${index % 4}"></i>${escapeHtml(entry.project)}</span>
      <div><i style="width:${Math.max(2, Math.round((entry.minutes / max) * 100))}%"></i></div>
      <strong>${escapeHtml(formatMinutes(entry.minutes))}</strong>
    </div>`).join("");
  elements.summaryTimeNote.dataset.filtered = String(Boolean(summaryProject));
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

const ACHIEVEMENTS_PER_PAGE = 10;

function getAchievements(context) {
  return [
    ...context.tasks.filter((task) => task.completed).map((task) => ({
      title: task.title,
      date: task.date,
      project: task.project?.trim() || "未分类",
      type: "完成待办",
    })),
    ...context.logs.filter((log) => !log.sourceTaskId).map((log) => ({
      title: log.title,
      date: log.date,
      project: log.project?.trim() || "未分类",
      type: "工作记录",
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

function escapeMarkdownInline(value) {
  return String(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line
      .replaceAll("\\", "\\\\")
      .replace(/([`*_[\]|<>~])/g, "\\$1")
      .replace(/^(\s*)([#\-+]|\d+\.)\s/, "$1\\$2 "))
    .join("  \n   ");
}

function sanitizeFilenamePart(value) {
  const safe = String(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 64);
  return safe || "未命名";
}

function getAchievementExportSnapshot() {
  const context = getSummaryContext();
  return {
    achievements: getAchievements(context),
    periodHeading: formatContextHeading(context),
    periodIdentifier: context.key.replaceAll(":", "-"),
    dateRange: `${context.startKey} — ${context.endKey}`,
    projectScope: summaryProject || "全部项目",
    exportedAt: new Date(),
  };
}

function makeAchievementFilename(snapshot, extension) {
  return [
    "MyDays",
    "主要成果",
    sanitizeFilenamePart(snapshot.periodIdentifier),
    sanitizeFilenamePart(snapshot.projectScope),
  ].join("-") + `.${extension}`;
}

function serializeAchievementsMarkdown(snapshot) {
  const exportTime = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(snapshot.exportedAt);
  const items = snapshot.achievements.map((achievement, index) => [
    `${index + 1}. **${escapeMarkdownInline(achievement.date)}｜${escapeMarkdownInline(achievement.project)}｜${escapeMarkdownInline(achievement.type)}**  `,
    `   ${escapeMarkdownInline(achievement.title)}`,
  ].join("\n")).join("\n\n");
  return [
    `# MyDays · ${escapeMarkdownInline(snapshot.periodHeading)}主要成果`,
    "",
    `- 日期范围：${escapeMarkdownInline(snapshot.dateRange)}`,
    `- 项目范围：${escapeMarkdownInline(snapshot.projectScope)}`,
    `- 导出时间：${escapeMarkdownInline(exportTime)}`,
    "",
    "## 主要成果",
    "",
    items,
    "",
  ].join("\n");
}

function xmlEscape(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => { crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8); });
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function zipDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f),
  };
}

function createStoredZip(files, modifiedAt = new Date()) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  const { time, date } = zipDateTime(modifiedAt);
  let localOffset = 0;

  files.forEach(({ name, content }) => {
    const nameBytes = encoder.encode(name);
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localChunks.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralChunks.push(centralHeader, nameBytes);
    localOffset += localHeader.length + nameBytes.length + data.length;
  });

  const centralDirectory = concatBytes(centralChunks);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);
  return concatBytes([...localChunks, centralDirectory, endRecord]);
}

function createAchievementsWorkbook(achievements, exportedAt = new Date()) {
  const columns = ["A", "B", "C", "D"];
  const rows = [["日期", "项目", "类型", "主要成果"], ...achievements.map((achievement) => [
    achievement.date,
    achievement.project,
    achievement.type,
    achievement.title,
  ])];
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => `<c r="${columns[columnIndex]}${rowIndex + 1}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="13" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/><col min="4" max="4" width="60" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:D${rows.length}"/></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF386A52"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
  return createStoredZip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="主要成果" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", content: worksheet },
    { name: "xl/styles.xml", content: styles },
  ], exportedAt);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportSummaryAchievements(format) {
  const snapshot = getAchievementExportSnapshot();
  if (!snapshot.achievements.length) {
    showToast("当前范围没有可导出的主要成果");
    return;
  }
  if (format === "markdown") {
    downloadBlob(
      new Blob([serializeAchievementsMarkdown(snapshot)], { type: "text/markdown;charset=utf-8" }),
      makeAchievementFilename(snapshot, "md"),
    );
    showToast(`已导出 ${snapshot.achievements.length} 项 Markdown 成果`);
    return;
  }
  const workbook = createAchievementsWorkbook(snapshot.achievements, snapshot.exportedAt);
  downloadBlob(
    new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    makeAchievementFilename(snapshot, "xlsx"),
  );
  showToast(`已导出 ${snapshot.achievements.length} 项 Excel 成果`);
}

function renderAchievements(items) {
  const totalPages = Math.max(1, Math.ceil(items.length / ACHIEVEMENTS_PER_PAGE));
  if (summaryAchievementPage >= totalPages) summaryAchievementPage = totalPages - 1;
  const start = summaryAchievementPage * ACHIEVEMENTS_PER_PAGE;
  renderSummaryList(elements.summaryAchievements, items.slice(start, start + ACHIEVEMENTS_PER_PAGE), "这个周期还没有可展示的成果");
  elements.summaryAchievementsPager.hidden = items.length === 0;
  elements.summaryAchievements.classList.toggle("is-paging", items.length > ACHIEVEMENTS_PER_PAGE);
  elements.summaryAchievementsCount.textContent = `共 ${items.length} 项`;
  elements.summaryAchievementsPage.textContent = `${summaryAchievementPage + 1} / ${totalPages}`;
  elements.summaryAchievementsPrev.disabled = summaryAchievementPage <= 0;
  elements.summaryAchievementsNext.disabled = summaryAchievementPage >= totalPages - 1;
}

function reportLabel(context = getSummaryContext()) {
  return PERIODS[context.type].reportLabel;
}

function renderSummaryReview(context) {
  const record = normalizePeriodRecord(readPeriodRecord(context));
  setFieldValue(elements.summaryBlockers, record.notes);
  setFieldValue(elements.summaryAiReport, record.report);
  const label = reportLabel(context);
  elements.summaryReviewTitle.textContent = `${formatContextHeading(context)}${summaryProject ? ` · ${summaryProject}` : ""} ${label}`;
  elements.summaryReportLabel.textContent = `AI ${label}`;
  if (!aiSummaryLoading) elements.generateAiSummary.querySelector("span").textContent = `生成 AI ${label}`;
  elements.summaryReviewCopy.textContent = context.type === "range"
    ? "把这段时间的成果、周报和时间投入整理成按主题分组的总结，适合述职、绩效评估或简历素材；可直接编辑，补充说明用来记下问题与反思。"
    : "成果和未完成事项见上方列表。AI 汇报根据这段时间的记录生成，可直接编辑；补充说明用来记下问题与反思。";
}

function renderSummaryRangeControls(context) {
  const custom = context.type === "range";
  elements.summaryRangeControls.hidden = !custom;
  elements.summaryPrevious.hidden = custom;
  elements.summaryNext.hidden = custom;
  if (!custom) return;
  elements.summaryCurrent.hidden = true;
  setFieldValue(elements.summaryRangeFrom, context.startKey);
  setFieldValue(elements.summaryRangeTo, context.endKey);
  elements.summaryRangePresets.forEach((button) => {
    const preset = rangePreset(button.dataset.range);
    button.classList.toggle("active", preset.from === context.startKey && preset.to === context.endKey);
  });
}

function renderSummary() {
  if (currentRoute.key !== "summary") return;
  const context = getSummaryContext();
  const completed = context.tasks.filter((task) => task.completed).length;
  const isCurrent = context.type === "range" || context.startKey === toDateKey(startOfPeriod(summaryPeriod, new Date()));
  elements.periodTabs.forEach((tab) => {
    const active = tab.dataset.period === summaryPeriod;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
  elements.summaryPeriodLabel.textContent = context.type === "range" ? "自定义时间段" : formatPeriodHeading(summaryPeriod, context.start);
  elements.summaryPeriodRange.textContent = context.startKey === context.endKey
    ? formatShortDate(context.start, true)
    : `${formatShortDate(context.start, context.start.getFullYear() !== context.end.getFullYear())} — ${formatShortDate(context.end, true)}`;
  elements.summaryCurrent.hidden = isCurrent;
  renderSummaryRangeControls(context);
  elements.summaryCompleted.textContent = String(completed);
  elements.summaryTaskTotal.textContent = `共 ${context.tasks.length} 项`;
  elements.summaryRate.textContent = `${context.tasks.length ? Math.round((completed / context.tasks.length) * 100) : 0}%`;
  elements.summaryLogs.textContent = String(context.logs.length);
  elements.summaryActiveDays.textContent = String(context.activeDays.length);
  elements.summaryDaysTotal.textContent = `共 ${context.days.length} 天`;
  renderTrend(context);
  renderProjects(context);
  summaryAchievementPage = 0;
  const achievements = getAchievements(context);
  const openItems = context.tasks.filter((task) => !task.completed).sort((a, b) => a.date.localeCompare(b.date));
  renderAchievements(achievements);
  renderSummaryList(elements.summaryOpenItems, openItems, "这个周期没有未完成事项");
  renderSummaryReview(context);
  renderSummaryGoals(context);
  void renderAgentTime(context);
}

// Goals of the weeks that start inside the range; a project scope keeps goals with a linked task in it.
function renderSummaryGoals(context) {
  const firstWeek = weekKeyOf(context.startKey);
  const goals = (state.goals ?? [])
    .filter((goal) => goal.week >= firstWeek && goal.week <= context.endKey)
    .map((goal) => {
      const linked = state.tasks.filter((task) => task.goalId === goal.id && (!summaryProject || task.project === summaryProject));
      return { goal, completed: linked.filter((task) => task.completed).length, total: linked.length };
    })
    .filter((entry) => !summaryProject || entry.total)
    .sort((a, b) => a.goal.week.localeCompare(b.goal.week) || a.goal.createdAt.localeCompare(b.goal.createdAt));
  elements.summaryGoalsCard.hidden = !goals.length;
  if (!goals.length) return;
  elements.summaryGoalsTotal.textContent = `达成 ${goals.filter((entry) => entry.goal.done).length}/${goals.length}`;
  const multiWeek = new Set(goals.map((entry) => entry.goal.week)).size > 1;
  elements.summaryGoalList.innerHTML = goals.map(({ goal, completed, total }) => `
    <div class="summary-goal${goal.done ? " done" : ""}">
      <span class="summary-goal-state" aria-label="${goal.done ? "已达成" : "未达成"}">${goal.done ? "✓" : ""}</span>
      <div><strong>${escapeHtml(goal.title)}</strong><small>${multiWeek ? `${shortDateLabel(goal.week)} 那周 · ` : ""}${total ? `关联待办 ${completed}/${total}` : "没有关联待办"}</small></div>
    </div>`).join("");
}

function setSummaryRange(from, to) {
  if (!from || !to) return;
  const span = daysBetween(fromDateKey(from), fromDateKey(to)).length;
  if (from > to || span > MAX_RANGE_DAYS) {
    showToast(from > to ? "开始日期不能晚于结束日期" : "时间段最长一年");
    renderSummary();
    return;
  }
  summaryRange = { from, to };
  renderSummary();
}

// Saves both fields of the period record; the textareas always mirror the current scope.
function savePeriodRecordDraft({ defer = false, successMessage = "已保存到 SQLite", onSaved } = {}) {
  writePeriodRecord(getSummaryContext(), summaryProject, {
    report: elements.summaryAiReport.value,
    notes: elements.summaryBlockers.value,
  });
  const saveVersion = ++summarySaveVersion;
  elements.summaryReviewState.textContent = "保存中…";
  persist({
    defer,
    onSaved: () => {
      if (saveVersion !== summarySaveVersion) return;
      elements.summaryReviewState.textContent = successMessage;
      onSaved?.();
    },
    onError: () => {
      if (saveVersion === summarySaveVersion) elements.summaryReviewState.textContent = "保存失败，请重试";
    },
  });
}

function setAiSummaryLoading(loading) {
  aiSummaryLoading = loading;
  elements.generateAiSummary.disabled = loading;
  elements.generateAiSummary.classList.toggle("loading", loading);
  elements.generateAiSummary.querySelector("span").textContent = loading ? "AI 正在整理…" : `生成 AI ${reportLabel()}`;
  elements.generateAiSummary.setAttribute("aria-busy", String(loading));
}

async function generateAiSummary() {
  if (aiSummaryLoading) return;
  const existingValue = elements.summaryAiReport.value;
  const context = getSummaryContext();
  const label = reportLabel(context);
  if (existingValue.trim() && !window.confirm(`AI ${label}会覆盖当前「AI ${label}」编辑框的内容，是否继续？`)) return;
  const requestedProject = summaryProject;
  const scope = requestedProject ? { project: requestedProject } : {};
  setAiSummaryLoading(true);
  elements.summaryReviewState.textContent = context.type === "range"
    ? "AI 正在整理这段时间的成果，可能需要一两分钟…"
    : "AI 正在整理当前周期…";
  try {
    const result = await requestJson("/api/ai/period-report", {
      method: "POST",
      body: JSON.stringify(context.type === "range"
        ? { periodType: "range", from: context.startKey, to: context.endKey, ...scope }
        : { periodType: context.type, periodStart: context.startKey, ...scope }),
    });
    if (summaryProject !== requestedProject || getSummaryContext().key !== context.key) {
      elements.summaryReviewState.textContent = "时间范围已切换，本次 AI 结果未填入";
      showToast(`时间范围已切换，请重新生成 AI ${label}`);
      return;
    }
    if (elements.summaryAiReport.value !== existingValue) {
      elements.summaryReviewState.textContent = "内容已被编辑，本次 AI 结果未覆盖";
      showToast("检测到你正在编辑，AI 结果未覆盖当前内容");
      return;
    }
    elements.summaryAiReport.value = result.report;
    savePeriodRecordDraft({
      successMessage: `由 ${result.provider} · ${result.model} 生成并已保存`,
      onSaved: () => showToast(`AI ${label}已生成并保存`),
    });
  } catch (error) {
    elements.summaryReviewState.textContent = `AI ${label}生成失败，原内容未改变`;
    if (["AI_DEFAULT_PROVIDER_MISSING", "AI_KEY_MISSING", "AI_KEY_UNREADABLE", "AI_MODEL_MISSING"].includes(error.code)) {
      showToast(`${error.message}，请前往「设置 → AI 服务」`);
    } else {
      showToast(`AI ${label}生成失败：${error.message}`);
    }
  } finally {
    setAiSummaryLoading(false);
  }
}

function downloadSummaryReport() {
  const text = elements.summaryAiReport.value.trim();
  if (!text) {
    showToast(`还没有可下载的 AI ${reportLabel()}内容`);
    return;
  }
  const context = getSummaryContext();
  const name = ["MyDays", reportLabel(context), sanitizeFilenamePart(context.key.replaceAll(":", "-")), sanitizeFilenamePart(summaryProject || "全部项目")].join("-");
  downloadBlob(new Blob([`${text}\n`], { type: "text/markdown;charset=utf-8" }), `${name}.md`);
}

async function copySummaryReport() {
  const text = elements.summaryAiReport.value.trim();
  if (!text) {
    showToast(`还没有可复制的 AI ${reportLabel()}内容`);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    elements.summaryAiReport.focus();
    elements.summaryAiReport.select();
    const copied = document.execCommand("copy");
    elements.summaryAiReport.setSelectionRange(0, 0);
    if (!copied) throw new Error("copy-failed");
  }
  showToast(`AI ${reportLabel()}已复制`);
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
    elements.projectState.textContent = "请输入项目名称。";
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
    elements.projectState.textContent = `已添加“${result.selected}”`;
  } catch (error) {
    elements.projectState.textContent = error.message;
  }
}

async function renameProjectOption(row) {
  if (row.dataset.saving === "true") return;
  const currentName = row.dataset.name;
  const name = row.querySelector("input").value.trim();
  if (!name || name === currentName) {
    row.querySelector("input").value = currentName;
    return;
  }
  row.dataset.saving = "true";
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
    elements.projectState.textContent = `已将“${currentName}”重命名为“${result.selected}”；历史记录未修改。`;
  } catch (error) {
    row.querySelector("input").value = currentName;
    elements.projectState.textContent = error.message;
  } finally {
    if (row.isConnected) delete row.dataset.saving;
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
    elements.projectState.textContent = "项目顺序已保存";
  } catch (error) {
    elements.projectState.textContent = error.message;
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
    elements.projectState.textContent = `已删除“${name}”选项；历史记录未修改。`;
  } catch (error) {
    elements.projectState.textContent = error.message;
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
      <button class="ai-provider-item${entry.id === selectedAiProviderId ? " active" : ""}" type="button" data-id="${escapeAttribute(entry.id)}">
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
  clearCapturePolish();
  captureType = type;
  elements.captureTabs.forEach((tab) => {
    const active = tab.dataset.type === type;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  elements.priorityField.hidden = type !== "task";
  elements.captureMoreButton.hidden = type !== "task";
  elements.captureDueQuick.hidden = type !== "task";
  if (type !== "task") setCaptureExtraOpen(false);
  elements.captureInput.placeholder = type === "task"
    ? "写下需要完成的事，按 Enter 保存…"
    : "记录刚刚完成的工作，按 Enter 保存…";
  if (focus) elements.captureInput.focus();
}

function syncCapturePolishAvailability() {
  elements.capturePolishButton.disabled = capturePolishLoading || !elements.captureInput.value.trim();
}

function setCapturePolishLoading(loading) {
  capturePolishLoading = loading;
  elements.capturePolishButton.classList.toggle("loading", loading);
  elements.capturePolishButton.setAttribute("aria-busy", String(loading));
  elements.capturePolishButton.querySelector("span").textContent = loading ? "润色中…" : "AI 润色";
  syncCapturePolishAvailability();
}

function clearCapturePolish({ invalidate = true } = {}) {
  if (invalidate) capturePolishRequestVersion += 1;
  elements.capturePolishSuggestion.hidden = true;
  elements.capturePolishText.textContent = "";
  elements.capturePolishMeta.textContent = "";
  if (capturePolishLoading) setCapturePolishLoading(false);
  else syncCapturePolishAvailability();
}

async function polishCapture() {
  const sourceText = elements.captureInput.value.trim();
  if (!sourceText) {
    elements.captureInput.focus();
    showToast("先写下要润色的内容");
    return;
  }
  const requestedType = captureType;
  const requestVersion = ++capturePolishRequestVersion;
  elements.capturePolishSuggestion.hidden = true;
  elements.capturePolishText.textContent = "";
  elements.capturePolishMeta.textContent = "";
  setCapturePolishLoading(true);
  try {
    const result = await requestJson("/api/ai/polish-entry", {
      method: "POST",
      body: JSON.stringify({ type: requestedType, text: sourceText }),
    });
    if (requestVersion !== capturePolishRequestVersion
      || captureType !== requestedType
      || elements.captureInput.value.trim() !== sourceText) return;
    elements.capturePolishText.textContent = result.polished;
    elements.capturePolishMeta.textContent = `${result.provider} · ${result.model} · 仅供确认，不会自动保存`;
    elements.capturePolishSuggestion.hidden = false;
  } catch (error) {
    if (requestVersion !== capturePolishRequestVersion) return;
    if (["AI_DEFAULT_PROVIDER_MISSING", "AI_KEY_MISSING", "AI_KEY_UNREADABLE", "AI_MODEL_MISSING"].includes(error.code)) {
      showToast(`${error.message}，请前往「设置 → AI 服务」`);
    } else {
      showToast(`AI 润色失败：${error.message}`);
    }
  } finally {
    if (requestVersion === capturePolishRequestVersion) setCapturePolishLoading(false);
  }
}

function adoptCapturePolish() {
  const polished = elements.capturePolishText.textContent;
  if (!polished || elements.capturePolishSuggestion.hidden) return;
  elements.captureInput.value = polished;
  autosizeCaptureInput();
  clearCapturePolish();
  elements.captureInput.focus();
  showToast("已采用润色建议，确认后再添加");
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
  closeSummaryExportMenu();
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

// The today page keeps tasks, timeline and review as sections; a hash scrolls to one of them.
function scrollToRouteSection(behavior = "smooth") {
  const section = currentRoute.key === "today" && window.location.hash
    ? document.getElementById(window.location.hash.slice(1))
    : null;
  if (section) section.scrollIntoView({ behavior, block: "start" });
  else window.scrollTo({ top: 0, behavior });
}

function navigateTo(target, { replace = false } = {}) {
  let [pathname, hash = ""] = target.split("#");
  const alias = ROUTE_ALIASES[normalizePath(pathname)];
  if (alias) [pathname, hash] = [alias[0], hash || alias[1]];
  const normalizedPath = normalizePath(pathname);
  const nextRoute = ROUTES[normalizedPath];
  if (!nextRoute) return;
  closeSummaryExportMenu();
  closeCaptureSelects();
  const url = hash ? `${normalizedPath}#${hash}` : normalizedPath;
  if (replace) window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
  currentRoute = nextRoute;
  render();
  scrollToRouteSection();
}

function changeDate(offset) {
  clearCapturePolish();
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
  const now = new Date().toISOString();
  if (captureType === "task") {
    const schedule = readCaptureSchedule();
    if (schedule.error) {
      setCaptureExtraOpen(true);
      showToast(schedule.error);
      return;
    }
    const priority = elements.prioritySelect.value;
    const goalId = elements.captureGoal.value || null;
    const task = { date: selectedDate, title, project, priority, completed: false, createdAt: now, completedAt: null, originDate: null, focus: false, goalId };
    if (schedule.rule) {
      const date = fromDateKey(selectedDate);
      const recurrence = {
        id: makeId(),
        title,
        project,
        priority,
        rule: schedule.rule,
        weekdays: schedule.rule === "weekly" ? 1 << date.getDay() : 0,
        monthDay: schedule.rule === "monthly" ? date.getDate() : null,
        dueTime: schedule.dueTime,
        remindMinutes: schedule.remindMinutes,
        startDate: selectedDate,
        paused: false,
        lastGeneratedDate: null,
        createdAt: now,
      };
      // Today's instance is created right away; later ones are generated by the server on their day.
      if (selectedDate <= currentDateKey() && recurrenceMatchesDate(recurrence, selectedDate)) {
        recurrence.lastGeneratedDate = selectedDate;
        state.tasks.push({
          ...task,
          id: `rec-${recurrence.id}-${selectedDate}`,
          dueDate: schedule.dueTime ? selectedDate : null,
          dueTime: schedule.dueTime,
          remindMinutes: schedule.remindMinutes,
          recurrenceId: recurrence.id,
        });
      }
      state.recurrences.push(recurrence);
      showToast(`已创建重复待办：${recurrenceLabel(recurrence)}`);
    } else {
      state.tasks.push({ ...task, id: makeId(), dueDate: schedule.dueDate, dueTime: schedule.dueTime, remindMinutes: schedule.remindMinutes, recurrenceId: null });
      showToast("待办已加入今天");
    }
    if (schedule.remindMinutes !== null) requestNotificationPermission();
    resetCaptureExtra();
    elements.captureGoal.value = "";
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
  autosizeCaptureInput();
  clearCapturePolish();
  persist();
  render();
  elements.captureInput.focus();
}

function toggleTask(id) {
  const task = state.tasks.find((entry) => entry.id === id);
  if (!task) return;
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
  persist();
  render();
}

function deleteTask(id) {
  const task = state.tasks.find((entry) => entry.id === id);
  if (!task || !window.confirm(`确定删除待办“${task.title}”吗？`)) return;
  state.tasks = state.tasks.filter((entry) => entry.id !== id);
  state.logs = state.logs.filter((log) => log.sourceTaskId !== id);
  if (entryEdit?.kind === "task" && entryEdit.id === id) entryEdit = null;
  persist();
  render();
  showToast("待办已删除");
}

function deleteLog(id) {
  const log = state.logs.find((entry) => entry.id === id);
  if (!log || !window.confirm(`确定删除工作记录“${log.title}”吗？`)) return;
  state.logs = state.logs.filter((entry) => entry.id !== id);
  if ((entryEdit?.kind === "log" && entryEdit.id === id) || (entryEdit?.host === "log" && entryEdit.hostId === id)) entryEdit = null;
  persist();
  render();
  showToast("工作记录已删除");
}

function saveReviewDraft({ defer = false } = {}) {
  const content = elements.reviewContent.value;
  // An emptied review drops its row instead of keeping a blank one.
  if (content.trim()) writeDailyReview(selectedDate, { content });
  else delete state.reviews[selectedDate];
  elements.reviewState.textContent = "保存中…";
  persist({
    defer,
    onSaved: () => { elements.reviewState.textContent = "已自动保存"; },
    onError: () => { elements.reviewState.textContent = "保存失败，请重试"; },
  });
}

const SEARCH_RESULT_LIMIT = 50;
const PERIOD_KEY_PATTERN = /^(?:(day|week|month|quarter|year):(\d{4}-\d{2}-\d{2})|range:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2}))$/;
let searchMatches = [];
let searchActiveIndex = 0;

// Everything is already in memory, so search runs entirely in the browser over the current state.
function buildSearchEntries() {
  const entries = [];
  for (const task of state.tasks) {
    entries.push({ kind: task.completed ? "已完成待办" : "待办", date: task.date, title: task.title, text: `${task.title} ${task.project ?? ""}`, project: task.project, target: { route: "/#tasks", date: task.date } });
  }
  for (const log of state.logs) {
    if (log.sourceTaskId) continue;
    entries.push({ kind: log.source === "agent-digest" ? "AI 整理" : "工作记录", date: log.date, title: log.title, text: `${log.title} ${log.project ?? ""}`, project: log.project, target: { route: "/#timeline", date: log.date } });
  }
  for (const goal of state.goals ?? []) {
    entries.push({ kind: goal.done ? "已达成目标" : "本周目标", date: goal.week, title: goal.title, text: goal.title, target: { route: "/#goals", date: goal.week } });
  }
  for (const [date, review] of Object.entries(state.reviews)) {
    if (review?.content?.trim()) entries.push({ kind: "今日复盘", date, title: "今日复盘", text: review.content, target: { route: "/#review", date } });
  }
  for (const [key, projects] of Object.entries(state.periodReviews)) {
    const match = PERIOD_KEY_PATTERN.exec(key);
    if (!match) continue;
    const [type, start, end] = match[1] ? [match[1], match[2], null] : ["range", match[3], match[4]];
    const heading = end ? `${start} — ${end}` : formatPeriodHeading(type, fromDateKey(start));
    for (const [project, record] of Object.entries(projects)) {
      const target = { route: "/summary", period: type, start, end, project };
      const title = project ? `${heading} · ${project}` : heading;
      if (record?.report?.trim()) entries.push({ kind: `AI ${PERIODS[type].reportLabel}`, date: start, title, text: record.report, target });
      if (record?.notes?.trim()) entries.push({ kind: "周期补充说明", date: start, title, text: record.notes, target });
    }
  }
  return entries;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightTerms(text, terms) {
  const escaped = escapeHtml(text);
  if (!terms.length) return escaped;
  const pattern = new RegExp(terms.map((term) => escapeRegExp(escapeHtml(term))).join("|"), "gi");
  return escaped.replace(pattern, (match) => `<mark>${match}</mark>`);
}

function searchSnippet(text, terms) {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const index = Math.max(0, Math.min(...terms.map((term) => {
    const position = lower.indexOf(term);
    return position < 0 ? Infinity : position;
  })));
  const start = Number.isFinite(index) ? Math.max(0, index - 24) : 0;
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + 96)}${flat.length > start + 96 ? "…" : ""}`;
}

function runSearch() {
  const terms = elements.searchInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) {
    searchMatches = [];
    elements.searchResults.innerHTML = "";
    elements.searchFooter.textContent = "输入关键词开始搜索，多个关键词用空格分隔";
    return;
  }
  const all = buildSearchEntries()
    .filter((entry) => {
      const haystack = `${entry.title}\n${entry.text}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
  searchMatches = all.slice(0, SEARCH_RESULT_LIMIT);
  searchActiveIndex = 0;
  elements.searchResults.innerHTML = searchMatches.map((entry, index) => {
    const showSnippet = entry.text.trim() !== entry.title.trim() && !entry.text.startsWith(entry.title);
    return `
      <button class="search-result" type="button" role="option" id="search-result-${index}" data-index="${index}" aria-selected="${index === 0}">
        <span class="search-result-meta"><i>${escapeHtml(entry.kind)}</i>${escapeHtml(entry.date)}${entry.project ? ` · ${escapeHtml(entry.project)}` : ""}</span>
        <strong>${highlightTerms(entry.title, terms)}</strong>
        ${showSnippet ? `<small>${highlightTerms(searchSnippet(entry.text, terms), terms)}</small>` : ""}
      </button>`;
  }).join("");
  elements.searchFooter.textContent = all.length
    ? `共 ${all.length} 条结果${all.length > SEARCH_RESULT_LIMIT ? `，显示最近的 ${SEARCH_RESULT_LIMIT} 条` : ""} · ↑↓ 选择，回车打开`
    : "没有找到匹配的内容";
  updateSearchSelection();
}

function updateSearchSelection() {
  elements.searchResults.querySelectorAll(".search-result").forEach((item, index) => {
    const active = index === searchActiveIndex;
    item.setAttribute("aria-selected", String(active));
    if (active) item.scrollIntoView({ block: "nearest" });
  });
  elements.searchInput.setAttribute("aria-activedescendant", searchMatches.length ? `search-result-${searchActiveIndex}` : "");
}

function openSearch() {
  setAccountMenu(false);
  closeSummaryExportMenu();
  if (!elements.searchDialog.open) elements.searchDialog.showModal();
  elements.searchInput.select();
  runSearch();
}

function closeSearch() {
  if (elements.searchDialog.open) elements.searchDialog.close();
}

function openSearchResult(index) {
  const entry = searchMatches[index];
  if (!entry) return;
  closeSearch();
  const { target } = entry;
  clearCapturePolish();
  if (target.period) {
    summaryPeriod = target.period;
    if (target.end) summaryRange = { from: target.start, to: target.end };
    else summaryAnchor = fromDateKey(target.start);
    summaryProject = target.project ?? "";
  } else {
    selectedDate = target.date;
    const selected = fromDateKey(target.date);
    calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
  }
  navigateTo(target.route);
}

const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;
const STATE_MAP_KEYS = ["reviews", "periodReviews"];
// Backups exported before notes were folded into reviews; the server converts them on import.
const LEGACY_STATE_MAP_KEYS = ["notes", "reviews", "periodReviews", "projectPeriodReviews", "periodReports", "projectPeriodReports"];

// Accepts the export format ({ app: "MyDays", data }) and a bare state object; missing maps become empty so the
// import replaces everything instead of mixing with current data (the server keeps current maps when a key is absent).
function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  const data = parsed?.app === "MyDays" ? parsed.data : parsed;
  if (!data || typeof data !== "object" || !Array.isArray(data.tasks) || !Array.isArray(data.logs)) {
    throw new Error("文件不是 MyDays 导出的数据备份");
  }
  const normalized = {
    tasks: data.tasks,
    recurrences: Array.isArray(data.recurrences) ? data.recurrences : [],
    logs: data.logs,
    goals: Array.isArray(data.goals) ? data.goals : [],
  };
  const legacy = Object.hasOwn(data, "notes");
  for (const key of legacy ? LEGACY_STATE_MAP_KEYS : STATE_MAP_KEYS) {
    normalized[key] = data[key] && typeof data[key] === "object" && !Array.isArray(data[key]) ? data[key] : {};
  }
  return { data: normalized, legacy, exportedAt: typeof parsed?.exportedAt === "string" ? parsed.exportedAt : null };
}

function describeBackup(data) {
  const periodCount = (map) => Object.values(map).reduce((sum, value) => sum + (value && typeof value === "object" ? Object.keys(value).length : 0), 0);
  const legacy = Object.hasOwn(data, "notes");
  const reviewDays = new Set([...Object.keys(data.reviews), ...(legacy ? Object.keys(data.notes) : [])]).size;
  const periods = legacy
    ? Object.keys(data.periodReviews).length + Object.keys(data.periodReports).length
    : periodCount(data.periodReviews);
  return [
    `${data.tasks.length} 条待办`,
    ...(data.recurrences.length ? [`${data.recurrences.length} 个重复待办`] : []),
    `${data.logs.length} 条工作记录`,
    ...(data.goals.length ? [`${data.goals.length} 个周目标`] : []),
    `${reviewDays} 天复盘${legacy ? "（含旧版笔记）" : ""}`,
    `${periods} 份周期汇报与说明`,
  ].join("、");
}

async function waitForPendingSaves() {
  if (deferredSave) queueSave({ onSaved: deferredSave.onSaved, onError: deferredSave.onError });
  await saveQueue.catch(() => {});
}

async function importBackupFile(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    showToast("备份文件超过 20 MB，无法导入");
    return;
  }
  let backup;
  try {
    backup = parseBackup(await file.text());
  } catch (error) {
    showToast(`导入失败：${error.message}`);
    return;
  }
  const exportedAt = backup.exportedAt ? `（导出于 ${formatDateTime(backup.exportedAt)}）` : "";
  const confirmed = window.confirm([
    `导入「${file.name}」${exportedAt}？`,
    "",
    `其中包含：${describeBackup(backup.data)}。`,
    ...(backup.legacy ? ["", "这是旧版本的备份：每天的笔记和复盘会合并成一段「今日复盘」，旧内容带标签保留。"] : []),
    "",
    "导入会替换当前全部待办、记录、复盘和周期汇报；AI 设置、项目选项和 Agent 工作汇总设置不受影响。",
    "导入前会先自动下载一份当前数据的备份。",
  ].join("\n"));
  if (!confirmed) return;
  try {
    await waitForPendingSaves();
    exportData({ silent: true, filename: `mydays-before-import-${toDateKey(new Date())}.json` });
    const result = await requestJson("/api/state", {
      method: "PUT",
      body: JSON.stringify({ data: backup.data, revision }),
    });
    entryEdit = null;
    adoptServerState(result);
    render();
    showToast("备份已导入，导入前的数据已下载保存");
  } catch (error) {
    if (error.code === "STATE_CONFLICT") {
      await mergeServerState().catch(() => {});
      showToast("数据刚被其他页面更新，请重新导入一次");
      return;
    }
    showToast(`导入失败：${error.message}`);
  }
}

function exportData({ silent = false, filename = null } = {}) {
  const content = JSON.stringify(
    {
      app: "MyDays",
      version: 3,
      storage: "sqlite",
      exportedAt: new Date().toISOString(),
      data: state,
    },
    null,
    2,
  );
  downloadBlob(
    new Blob([content], { type: "application/json" }),
    filename ?? `mydays-backup-${toDateKey(new Date())}.json`,
  );
  if (!silent) showToast("数据备份已导出");
}

elements.captureTabs.forEach((tab) => tab.addEventListener("click", () => setCaptureType(tab.dataset.type)));
elements.captureForm.addEventListener("submit", addCapture);
// Items are single-line titles: Enter saves (unless an IME is composing) and pasted line breaks become spaces.
function autosizeCaptureInput() {
  const input = elements.captureInput;
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
}

elements.captureInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!event.shiftKey) elements.captureForm.requestSubmit();
});
elements.captureInput.addEventListener("input", () => {
  if (/[\r\n]/.test(elements.captureInput.value)) {
    elements.captureInput.value = elements.captureInput.value.replace(/\s*[\r\n]+\s*/g, " ");
  }
  autosizeCaptureInput();
  clearCapturePolish();
});
elements.capturePolishButton.addEventListener("click", polishCapture);
elements.capturePolishAdopt.addEventListener("click", adoptCapturePolish);
elements.capturePolishCancel.addEventListener("click", () => {
  clearCapturePolish();
  elements.captureInput.focus();
});

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
      openProjectSettings();
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
  const editSelect = event.target.closest("[data-entry-edit-select]");
  const option = event.target.closest(".capture-select-option");
  if (editSelect && option) {
    chooseEntryEditOption(editSelect, option);
    return;
  }
  if (editSelect && event.target.closest(".capture-select-trigger")) {
    const menu = editSelect.querySelector(".capture-select-menu");
    if (menu.hidden) openEntryEditSelect(editSelect);
    else closeEntryEditSelect(editSelect, { restoreFocus: true });
    return;
  }
  if (event.target.closest(".cancel-entry-edit")) {
    cancelEntryEdit();
    return;
  }
  const editButton = event.target.closest(".edit-entry");
  if (editButton) {
    startEntryEdit(editButton.dataset.editKind, editButton.dataset.editId, "task", item.dataset.id);
    return;
  }
  if (event.target.closest(".delete-task")) {
    deleteTask(item.dataset.id);
    return;
  }
  if (event.target.closest(".focus-toggle")) {
    toggleFocus(item.dataset.id);
    return;
  }
  if (event.target.closest(".task-check")) toggleTask(item.dataset.id);
});
elements.taskList.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-entry-edit-form]")) return;
  event.preventDefault();
  saveEntryEdit();
});
elements.taskList.addEventListener("input", (event) => {
  if (event.target.matches(".entry-edit-title")) updateEntryEditField("title", event.target.value);
  if (event.target.dataset.editField) updateEntryEditField(event.target.dataset.editField, event.target.value);
});
elements.taskList.addEventListener("keydown", (event) => {
  if (handleEntryEditSelectKeydown(event)) event.stopPropagation();
});

elements.timelineList.addEventListener("click", (event) => {
  const item = event.target.closest(".timeline-item");
  if (!item) return;
  const editSelect = event.target.closest("[data-entry-edit-select]");
  const option = event.target.closest(".capture-select-option");
  if (editSelect && option) {
    chooseEntryEditOption(editSelect, option);
    return;
  }
  if (editSelect && event.target.closest(".capture-select-trigger")) {
    const menu = editSelect.querySelector(".capture-select-menu");
    if (menu.hidden) openEntryEditSelect(editSelect);
    else closeEntryEditSelect(editSelect, { restoreFocus: true });
    return;
  }
  if (event.target.closest(".cancel-entry-edit")) {
    cancelEntryEdit();
    return;
  }
  const editButton = event.target.closest(".edit-entry");
  if (editButton) {
    startEntryEdit(editButton.dataset.editKind, editButton.dataset.editId, "log", item.dataset.id);
    return;
  }
  if (event.target.closest(".delete-log")) deleteLog(item.dataset.id);
});
elements.timelineList.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-entry-edit-form]")) return;
  event.preventDefault();
  saveEntryEdit();
});
elements.timelineList.addEventListener("input", (event) => {
  if (event.target.matches(".entry-edit-title")) updateEntryEditField("title", event.target.value);
  if (event.target.dataset.editField) updateEntryEditField(event.target.dataset.editField, event.target.value);
});
elements.timelineList.addEventListener("keydown", (event) => {
  if (handleEntryEditSelectKeydown(event)) event.stopPropagation();
});

elements.reviewContent.addEventListener("input", () => saveReviewDraft({ defer: true }));
elements.agentDigestEnabled.addEventListener("change", toggleAgentDigest);
elements.agentDigestSave.addEventListener("click", saveAgentDigestSettings);
elements.agentDigestRefresh.addEventListener("click", async () => {
  try {
    await loadAgentDigest();
    await reloadIfServerChanged();
    elements.agentDigestState.textContent = "状态已刷新";
  } catch (error) {
    showToast(`刷新失败：${error.message}`);
  }
});
elements.agentDigestDays.addEventListener("click", (event) => {
  const button = event.target.closest("[data-digest-run]");
  if (button) runAgentDigest(button.dataset.digestRun);
});
elements.agentDigestClear.addEventListener("click", clearAgentTurns);
elements.agentTokenForm.addEventListener("submit", createAgentToken);
elements.agentTokenCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(elements.agentTokenValue.textContent);
    showToast("令牌已复制");
  } catch {
    showToast("复制失败，请手动选择复制");
  }
});
elements.agentTokenList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-token-revoke]");
  if (button) revokeAgentToken(button.dataset.tokenRevoke, button.dataset.tokenName);
});
window.addEventListener("pagehide", flushDeferredSave);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushDeferredSave();
  else tickTasks();
});
function tickTasks() {
  prepareTasksForToday();
  checkTaskReminders();
  void syncIfServerChanged();
}
window.setInterval(tickTasks, 30000);
elements.captureMoreButton.addEventListener("click", () => setCaptureExtraOpen(elements.captureExtra.hidden));
elements.captureDueQuick.addEventListener("click", (event) => {
  const button = event.target.closest("[data-due-quick]");
  if (button) setCaptureQuickDue(button.dataset.dueQuick);
});
document.addEventListener("input", (event) => {
  if (!event.target.matches('.entry-edit-schedule [data-edit-field="dueDate"]') || !entryEdit) return;
  event.target.closest(".entry-edit-schedule").querySelectorAll("[data-edit-due]").forEach((entry) => {
    entry.setAttribute("aria-pressed", String(event.target.value === quickDueDate(entry.dataset.editDue, entryEdit.draft.date)));
  });
});
// Quick deadline buttons inside the inline edit form of a task (in the task list or the timeline).
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-due]");
  if (!button || !entryEdit || entryEdit.kind !== "task") return;
  const input = button.closest(".entry-edit-schedule").querySelector('[data-edit-field="dueDate"]');
  const date = quickDueDate(button.dataset.editDue, entryEdit.draft.date);
  input.value = input.value === date ? "" : date;
  updateEntryEditField("dueDate", input.value);
  button.closest(".due-quick").querySelectorAll("[data-edit-due]").forEach((entry) => {
    entry.setAttribute("aria-pressed", String(input.value === quickDueDate(entry.dataset.editDue, entryEdit.draft.date)));
  });
});
[elements.captureDueDate, elements.captureDueTime, elements.captureRemind, elements.captureRepeat].forEach((input) => {
  input.addEventListener("change", syncCaptureExtra);
});
elements.taskSettingsOpen.addEventListener("click", openTaskSettings);
elements.taskSettingsClose.addEventListener("click", () => elements.taskSettingsDialog.close());
elements.taskRollover.addEventListener("change", () => setTaskRollover(elements.taskRollover.checked));
elements.taskNotifyEnable.addEventListener("click", requestNotificationPermission);
elements.recurrenceList.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-recurrence-toggle]");
  if (toggle) toggleRecurrence(toggle.dataset.recurrenceToggle);
  const remove = event.target.closest("[data-recurrence-delete]");
  if (remove) deleteRecurrence(remove.dataset.recurrenceDelete);
});
elements.settingsExportButton.addEventListener("click", () => exportData());
const chooseBackupFile = () => {
  setAccountMenu(false);
  elements.importFile.value = "";
  elements.importFile.click();
};
elements.settingsImportButton.addEventListener("click", chooseBackupFile);
elements.settingsTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectSettingsTab(tab.dataset.settingsTab));
  tab.addEventListener("keydown", (event) => {
    const offset = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!offset) return;
    event.preventDefault();
    const next = elements.settingsTabs[(index + offset + elements.settingsTabs.length) % elements.settingsTabs.length];
    selectSettingsTab(next.dataset.settingsTab, { focus: true });
  });
});
elements.importFile.addEventListener("change", () => importBackupFile(elements.importFile.files[0]));
if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) elements.searchShortcuts.forEach((key) => { key.textContent = "Ctrl K"; });
elements.searchTrigger.addEventListener("click", openSearch);
elements.sidebarSearch.addEventListener("click", openSearch);
elements.sidebarProjectList.addEventListener("click", (event) => {
  const link = event.target.closest("[data-project]");
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  summaryProject = link.dataset.project;
  summaryAchievementPage = 0;
  navigateTo("/summary");
});
elements.heatmapPrevious.addEventListener("click", () => {
  heatmapCursor = new Date(heatmapCursor.getFullYear(), heatmapCursor.getMonth() - 1, 1);
  renderHeatmap();
});
elements.heatmapNext.addEventListener("click", () => {
  heatmapCursor = new Date(heatmapCursor.getFullYear(), heatmapCursor.getMonth() + 1, 1);
  renderHeatmap();
});
elements.heatmapGrid.addEventListener("click", (event) => {
  const cell = event.target.closest("[data-date]");
  if (cell) goToDate(cell.dataset.date);
});
elements.planList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-plan-add]");
  if (button) addPlannedTasks([button.closest(".plan-item").dataset.id]);
});
elements.planAddAll.addEventListener("click", () => addPlannedTasks(planCandidates().map((task) => task.id)));
elements.planDismiss.addEventListener("click", () => {
  try {
    window.localStorage.setItem(PLAN_DISMISS_STORAGE_KEY, currentDateKey());
  } catch {}
  elements.planCard.hidden = true;
});
elements.goalAddForm.addEventListener("submit", addGoal);
elements.goalList.addEventListener("click", (event) => {
  const row = event.target.closest(".goal-row");
  if (!row) return;
  if (event.target.closest("[data-goal-toggle]")) toggleGoal(row.dataset.goalId);
  if (event.target.closest("[data-goal-delete]")) deleteGoal(row.dataset.goalId);
});
elements.upcomingList.addEventListener("click", (event) => {
  const item = event.target.closest(".upcoming-item");
  const task = item && state.tasks.find((entry) => entry.id === item.dataset.id);
  if (!task) return;
  if (event.target.closest("[data-upcoming-complete]")) toggleTask(task.id);
  else if (event.target.closest("[data-upcoming-today]")) {
    moveTaskToDate(task, currentDateKey());
    persist();
    render();
    showToast(`已移到今天：${task.title}`);
  } else if (event.target.closest("[data-upcoming-open]")) goToDate(task.date);
});
elements.searchInput.addEventListener("input", runSearch);
elements.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!searchMatches.length) return;
    searchActiveIndex = (searchActiveIndex + (event.key === "ArrowDown" ? 1 : -1) + searchMatches.length) % searchMatches.length;
    updateSearchSelection();
  } else if (event.key === "Enter") {
    event.preventDefault();
    openSearchResult(searchActiveIndex);
  }
});
elements.searchResults.addEventListener("click", (event) => {
  const item = event.target.closest(".search-result");
  if (item) openSearchResult(Number(item.dataset.index));
});
elements.searchDialog.addEventListener("click", (event) => {
  if (event.target === elements.searchDialog) closeSearch();
});
elements.accountMenuButton.addEventListener("click", () => setAccountMenu(elements.accountMenu.hidden));
elements.themeOptions.forEach((option) => option.addEventListener("click", () => {
  window.MyDaysTheme?.set(option.dataset.themeOption);
  renderThemeSwitch();
}));
window.addEventListener("mydays-theme-change", renderThemeSwitch);
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
elements.summaryBlockers.addEventListener("input", () => savePeriodRecordDraft({ defer: true }));
elements.summaryRangePresets.forEach((button) => button.addEventListener("click", () => {
  const { from, to } = rangePreset(button.dataset.range);
  setSummaryRange(from, to);
}));
[elements.summaryRangeFrom, elements.summaryRangeTo].forEach((input) => input.addEventListener("change", () => {
  setSummaryRange(elements.summaryRangeFrom.value, elements.summaryRangeTo.value);
}));
elements.summaryAchievementsPrev.addEventListener("click", () => {
  if (summaryAchievementPage > 0) {
    summaryAchievementPage -= 1;
    renderAchievements(getAchievements(getSummaryContext()));
  }
});
elements.summaryAchievementsNext.addEventListener("click", () => {
  summaryAchievementPage += 1;
  renderAchievements(getAchievements(getSummaryContext()));
});
elements.summaryExportTrigger.addEventListener("click", () => {
  if (elements.summaryExportMenu.hidden) openSummaryExportMenu();
  else closeSummaryExportMenu({ restoreFocus: true });
});
elements.summaryExportTrigger.addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  openSummaryExportMenu({ focus: event.key === "ArrowUp" || event.key === "End" ? "last" : "first" });
});
elements.summaryExportMenu.addEventListener("click", (event) => {
  const item = event.target.closest("[data-export-format]");
  if (!item) return;
  const format = item.dataset.exportFormat;
  closeSummaryExportMenu({ restoreFocus: true });
  exportSummaryAchievements(format);
});
elements.summaryExportMenu.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeSummaryExportMenu({ restoreFocus: true });
    return;
  }
  if (event.key === "Tab") {
    closeSummaryExportMenu();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveSummaryExportFocus(event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    focusSummaryExportItem(event.key === "Home" ? "first" : "last");
  }
});
elements.generateAiSummary.addEventListener("click", generateAiSummary);
elements.copySummaryReport.addEventListener("click", copySummaryReport);
elements.summaryAiReport.addEventListener("input", () => savePeriodRecordDraft({ defer: true }));
elements.downloadSummaryReport.addEventListener("click", downloadSummaryReport);
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
  clearCapturePolish();
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
  if (!elements.summaryExportMenu.hidden && !event.target.closest(".summary-export-menu-wrap")) closeSummaryExportMenu();
  if (!event.target.closest("[data-capture-select]")) closeCaptureSelects();
  if (!event.target.closest("[data-entry-edit-select]")) closeEntryEditSelects();
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
document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-app-link]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = new URL(link.href);
  if (target.origin !== window.location.origin || !ROUTES[normalizePath(target.pathname)]) return;
  event.preventDefault();
  navigateTo(target.pathname);
});

window.addEventListener("popstate", () => {
  closeSummaryExportMenu();
  closeCaptureSelects();
  currentRoute = resolveRoute(window.location.pathname);
  render();
  scrollToRouteSection("instant");
});
window.addEventListener("hashchange", () => {
  if (currentRoute.key === "ai-settings") renderSettingsTabs();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.summaryExportMenu.hidden) {
    event.preventDefault();
    closeSummaryExportMenu({ restoreFocus: true });
    return;
  }
  const openCaptureSelectRoot = elements.captureSelects.find((root) => !root.querySelector(".capture-select-menu").hidden);
  if (event.key === "Escape" && openCaptureSelectRoot) {
    event.preventDefault();
    closeCaptureSelect(openCaptureSelectRoot, { restoreFocus: true });
    return;
  }
  const openEntryEditSelectRoot = [...document.querySelectorAll("[data-entry-edit-select]")]
    .find((root) => !root.querySelector(".capture-select-menu").hidden);
  if (event.key === "Escape" && openEntryEditSelectRoot) {
    event.preventDefault();
    closeEntryEditSelect(openEntryEditSelectRoot, { restoreFocus: true });
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
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (elements.searchDialog.open) closeSearch();
    else openSearch();
    return;
  }
  if (event.key === "/" && !isTyping) {
    event.preventDefault();
    if (currentRoute.key !== "today") navigateTo("/");
    window.requestAnimationFrame(() => elements.captureInput.focus());
  }
});

renderRoute();
renderThemeSwitch();
bootstrap();
