#!/usr/bin/env node
// MyDays collector: reads local AI agent session files and pushes trimmed, redacted turns to a MyDays server.
// It has no dependencies and never sends tool calls, tool output, or thinking content.
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_LIMITS = { maxPromptChars: 600, maxReplyChars: 1500, windowDays: 8 };

export function readConfig(env = process.env) {
  const home = os.homedir();
  const token = env.MYDAYS_TOKEN_FILE && existsSync(env.MYDAYS_TOKEN_FILE)
    ? readFileSync(env.MYDAYS_TOKEN_FILE, "utf8").trim()
    : (env.MYDAYS_TOKEN ?? "").trim();
  return {
    url: (env.MYDAYS_URL ?? "http://localhost:4173").replace(/\/+$/, ""),
    token,
    tokenFile: env.MYDAYS_TOKEN_FILE ?? "",
    claudeDir: env.CLAUDE_PROJECTS_DIR ?? path.join(home, ".claude", "projects"),
    codexDir: env.CODEX_SESSIONS_DIR ?? path.join(home, ".codex", "sessions"),
    gitDir: env.GIT_REPOS_DIR ?? "",
    home,
    gitAuthorEmails: (env.GIT_AUTHOR_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
    stateDir: env.COLLECTOR_STATE_DIR ?? path.join(home, ".mydays", "collector"),
    intervalSeconds: Math.max(10, Number.parseInt(env.COLLECTOR_INTERVAL_SECONDS ?? "300", 10) || 300),
  };
}

const REDACTIONS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:sk-ant-|sk-|ghp_|gho_|ghu_|ghs_|github_pat_|glpat-|xox[abprs]-|mdk_)[A-Za-z0-9_\-]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
];
const ASSIGNMENT_REDACTION = /((?:api[_-]?key|token|secret|password|passwd|密码|密钥)["']?\s*[:=：]\s*["']?)([^\s"',;，。]{8,})/gi;

// Best-effort only: pattern matching cannot recognize every secret.
export function redact(text) {
  let result = text;
  for (const pattern of REDACTIONS) result = result.replace(pattern, "[已隐藏]");
  return result.replace(ASSIGNMENT_REDACTION, "$1[已隐藏]");
}

export function clipMiddle(text, limit) {
  if (text.length <= limit) return text;
  const head = Math.ceil((limit - 3) / 2);
  return `${text.slice(0, head)}[…]${text.slice(text.length - (limit - 3 - head))}`;
}

async function* readJsonLines(filePath) {
  const lines = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch {
      yield null;
    }
  }
}

const TEXT_BLOCK_TYPES = new Set(["text", "input_text", "output_text"]);

function textOfBlocks(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  if (content.some((block) => block?.type === "tool_result")) return "";
  return content
    .filter((block) => TEXT_BLOCK_TYPES.has(block?.type) && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

// Slash commands arrive wrapped in tags; keep the command and its arguments, drop every other injected wrapper.
function humanPromptText(raw) {
  const text = raw.trim();
  if (!text || text.startsWith("[Request interrupted")) return "";
  if (!text.startsWith("<")) return text;
  const command = /<command-name>([^<]*)<\/command-name>/.exec(text)?.[1]?.trim();
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim();
  return command && args ? `${command} ${args}` : "";
}

export async function parseClaudeFile(filePath) {
  const turns = [];
  let current = null;
  let skipped = 0;
  for await (const entry of readJsonLines(filePath)) {
    if (!entry) {
      skipped += 1;
      continue;
    }
    if (entry.isSidechain || entry.isMeta) continue;
    if (entry.type === "user") {
      if (entry.origin?.kind && entry.origin.kind !== "human") continue;
      const prompt = humanPromptText(textOfBlocks(entry.message?.content));
      if (!prompt || !entry.timestamp || !entry.sessionId) continue;
      current = {
        agent: "claude-code",
        sessionId: String(entry.sessionId),
        turnKey: String(entry.uuid ?? entry.timestamp),
        cwd: entry.cwd ?? "",
        startedAt: entry.timestamp,
        endedAt: entry.timestamp,
        prompt,
        reply: "",
      };
      turns.push(current);
    } else if (entry.type === "assistant" && current) {
      const text = textOfBlocks(entry.message?.content).trim();
      if (text) {
        current.reply = text;
        if (entry.timestamp) current.endedAt = entry.timestamp;
      }
    }
  }
  return { turns, skipped };
}

export async function parseCodexFile(filePath) {
  const turns = [];
  let current = null;
  let skipped = 0;
  let sessionId = "";
  let cwd = "";
  let first = true;
  for await (const entry of readJsonLines(filePath)) {
    if (!entry) {
      skipped += 1;
      continue;
    }
    const payload = entry.payload && typeof entry.payload === "object" ? entry.payload : {};
    if (first) {
      first = false;
      // Sub-agent threads carry an object here and programmatic runs use "exec"; only interactive sessions count.
      if (entry.type !== "session_meta" || typeof payload.source !== "string" || payload.source === "exec") {
        return { turns: [], skipped, ignored: true };
      }
      sessionId = String(payload.id ?? payload.session_id ?? path.basename(filePath, ".jsonl"));
      cwd = payload.cwd ?? "";
      continue;
    }
    if (entry.type === "turn_context" && typeof payload.cwd === "string") cwd = payload.cwd;
    // Desktop sessions record prompts as response items; CLI/exec sessions also emit user_message events. Accept both without duplicating.
    const isUserItem = entry.type === "response_item" && payload.type === "message" && payload.role === "user";
    const isUserEvent = entry.type === "event_msg" && payload.type === "user_message";
    if (isUserItem || isUserEvent) {
      const prompt = humanPromptText(isUserItem ? textOfBlocks(payload.content) : String(payload.message ?? ""));
      if (!prompt || !entry.timestamp || prompt === current?.prompt) continue;
      current = {
        agent: "codex", sessionId, turnKey: String(entry.timestamp), cwd, startedAt: entry.timestamp, endedAt: entry.timestamp, prompt, reply: "",
      };
      turns.push(current);
      continue;
    }
    if (!current) continue;
    let reply = "";
    if (entry.type === "response_item" && payload.type === "message" && payload.role === "assistant") {
      reply = textOfBlocks(payload.content);
    } else if (entry.type === "event_msg" && payload.type === "agent_message") {
      reply = String(payload.message ?? "");
    } else if (entry.type === "event_msg" && payload.type === "task_complete") {
      reply = String(payload.last_agent_message ?? "");
    }
    if (reply.trim()) {
      current.reply = reply.trim();
      if (entry.timestamp) current.endedAt = entry.timestamp;
    }
  }
  return { turns, skipped };
}

function listClaudeFiles(dir) {
  const files = [];
  for (const project of safeReaddir(dir)) {
    if (!project.isDirectory()) continue;
    for (const entry of safeReaddir(path.join(dir, project.name))) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(path.join(dir, project.name, entry.name));
    }
  }
  return files;
}

// Codex stores sessions under YYYY/MM/DD by start date. Long-running threads live in old directories, so walk the
// whole tree (directory entries only; a few thousand stats) and let the caller filter by modification time.
function listCodexFiles(dir, depth = 0) {
  const files = [];
  for (const entry of safeReaddir(dir)) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory() && depth < 3) files.push(...listCodexFiles(entryPath, depth + 1));
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(entryPath);
  }
  return files;
}

const SKIPPED_DIRECTORIES = new Set(["node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "Library"]);

// Expands "~" in a directory configured in MyDays; the collector runs on the machine that holds the repositories.
export function resolveGitDir(config, hostPath) {
  const expanded = hostPath === "~" || hostPath.startsWith("~/") ? path.join(config.home, hostPath.slice(1)) : hostPath;
  return { path: expanded, state: existsSync(expanded) ? "ok" : "missing" };
}

export function gitDirectories(config, limits = DEFAULT_LIMITS) {
  const configured = (limits.gitRepoDirs ?? []).map((hostPath) => ({ hostPath, ...resolveGitDir(config, hostPath) }));
  if (config.gitDir) configured.push({ hostPath: config.gitDir, path: config.gitDir, state: existsSync(config.gitDir) ? "ok" : "missing" });
  return configured;
}

// A repository is recognised by .git/logs/HEAD, whose modification time changes whenever HEAD moves (commit, checkout,
// pull). Returning that file lets the generic scan skip repositories that have not changed since the last round.
function listGitRepos(dir, depth = 0) {
  if (!dir) return [];
  const head = path.join(dir, ".git", "logs", "HEAD");
  if (existsSync(head)) return [head];
  if (depth >= 3) return [];
  const found = [];
  for (const entry of safeReaddir(dir)) {
    if (entry.isDirectory() && !entry.name.startsWith(".") && !SKIPPED_DIRECTORIES.has(entry.name)) {
      found.push(...listGitRepos(path.join(dir, entry.name), depth + 1));
    }
  }
  return found;
}

function escapeGitPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let gitUnavailableReported = false;

export function parseGitLog(output, repoPath) {
  const turns = [];
  for (const record of output.split("\x1e")) {
    if (!record.trim()) continue;
    const [hash, date, subject, rest = ""] = record.replace(/^\n+/, "").split("\x1f");
    if (!hash || !date || !subject) continue;
    const stat = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(rest);
    const body = rest.replace(/\n\s*\d+ files? changed[\s\S]*$/, "").trim();
    const size = stat ? `（${stat[1]} 个文件，+${stat[2] ?? 0} -${stat[3] ?? 0}）` : "";
    turns.push({
      agent: "git",
      sessionId: `git:${path.basename(repoPath)}`,
      turnKey: hash.trim(),
      cwd: repoPath,
      startedAt: date.trim(),
      endedAt: date.trim(),
      prompt: subject.trim(),
      reply: `${body}${body && size ? " " : ""}${size}`.trim(),
    });
  }
  return turns;
}

function gitAdapterParse(authorEmails, windowDays) {
  return async (headFile) => {
    const repoPath = path.dirname(path.dirname(path.dirname(headFile)));
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();
    const result = spawnSync("git", [
      "-c", "safe.directory=*", "-C", repoPath, "log", "--all", "--no-merges", `--since=${since}`,
      ...authorEmails.map((email) => `--author=<${escapeGitPattern(email)}>`),
      "--format=%x1e%H%x1f%aI%x1f%s%x1f%b", "--shortstat",
    ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 20000 });
    if (result.error?.code === "ENOENT") {
      if (!gitUnavailableReported) console.log(`${new Date().toISOString()} git is not installed; skipping Git repositories`);
      gitUnavailableReported = true;
      return { turns: [], skipped: 0 };
    }
    if (result.status !== 0) return { turns: [], skipped: 1 };
    return { turns: parseGitLog(result.stdout, repoPath), skipped: 0 };
  };
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function adaptersFor(config, limits = DEFAULT_LIMITS) {
  const authorEmails = config.gitAuthorEmails.length ? config.gitAuthorEmails : limits.gitAuthorEmails ?? [];
  const gitDirs = gitDirectories(config, limits).filter((dir) => dir.state === "ok").map((dir) => dir.path);
  return [
    { name: "claude-code", dir: config.claudeDir, list: () => listClaudeFiles(config.claudeDir), parse: parseClaudeFile },
    { name: "codex", dir: config.codexDir, list: () => listCodexFiles(config.codexDir), parse: parseCodexFile },
    // Only the user's own commits are collected, so the Git source stays off until author emails are configured.
    ...(authorEmails.length && gitDirs.length ? [{
      name: "git",
      dir: gitDirs[0],
      list: () => [...new Set(gitDirs.flatMap((dir) => listGitRepos(dir)))],
      parse: gitAdapterParse(authorEmails, limits.windowDays),
    }] : []),
  ].filter((adapter) => adapter.dir && existsSync(adapter.dir));
}

export function prepareTurns(turns, limits = DEFAULT_LIMITS, now = Date.now()) {
  const earliest = now - limits.windowDays * 86400000;
  const prepared = [];
  for (const turn of turns) {
    const startedAt = Date.parse(turn.startedAt);
    if (Number.isNaN(startedAt) || startedAt < earliest) continue;
    const endedAt = Date.parse(turn.endedAt);
    prepared.push({
      agent: turn.agent,
      sessionId: turn.sessionId.slice(0, 128),
      turnKey: turn.turnKey.slice(0, 128),
      project: path.basename(turn.cwd || "").slice(0, 80),
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(Number.isNaN(endedAt) ? startedAt : Math.max(endedAt, startedAt)).toISOString(),
      prompt: clipMiddle(redact(turn.prompt), limits.maxPromptChars),
      reply: clipMiddle(redact(turn.reply), limits.maxReplyChars),
    });
  }
  return prepared;
}

function loadState(stateDir) {
  try {
    return JSON.parse(readFileSync(path.join(stateDir, "state.json"), "utf8"));
  } catch {
    return { files: {} };
  }
}

function saveState(stateDir, state) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(path.join(stateDir, "state.json"), JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
}

async function requestJson(config, resourcePath, options = {}) {
  const response = await fetch(`${config.url}${resourcePath}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? `HTTP ${response.status}`);
    error.code = body?.error?.code ?? `HTTP_${response.status}`;
    throw error;
  }
  return body;
}

// Returns per-adapter statistics. With `send`, changed files are parsed and pushed; unchanged files are not opened.
export async function scan(config, { limits = DEFAULT_LIMITS, send = null, state = { files: {} } } = {}) {
  const cutoff = Date.now() - limits.windowDays * 86400000;
  const seen = new Set();
  const stats = [];
  for (const adapter of adaptersFor(config, limits)) {
    const stat = { agent: adapter.name, files: 0, changedFiles: 0, sessions: 0, turns: 0, chars: 0, unreadableLines: 0, sent: 0 };
    for (const filePath of adapter.list()) {
      let info;
      try {
        info = statSync(filePath);
      } catch {
        continue;
      }
      if (info.mtimeMs < cutoff) continue;
      stat.files += 1;
      seen.add(filePath);
      const known = state.files[filePath];
      if (send && known && known.size === info.size && known.mtimeMs === info.mtimeMs) continue;
      stat.changedFiles += 1;
      const { turns, skipped } = await adapter.parse(filePath);
      const prepared = prepareTurns(turns, limits);
      stat.unreadableLines += skipped;
      stat.turns += prepared.length;
      stat.chars += prepared.reduce((total, turn) => total + turn.prompt.length + turn.reply.length, 0);
      if (prepared.length) stat.sessions += 1;
      if (send) {
        for (let offset = 0; offset < prepared.length; offset += BATCH_SIZE) {
          stat.sent += (await send(prepared.slice(offset, offset + BATCH_SIZE))).accepted ?? 0;
        }
        // Only remember the file once every batch went through, so a failed push is retried next round.
        state.files[filePath] = { size: info.size, mtimeMs: info.mtimeMs };
      }
    }
    stats.push(stat);
  }
  for (const filePath of Object.keys(state.files)) {
    if (!seen.has(filePath)) delete state.files[filePath];
  }
  return stats;
}

export async function runOnce(config, log = console.log) {
  if (!config.token) {
    const fresh = readConfig();
    if (!fresh.token) {
      log("waiting: no token yet (enable the feature in MyDays, or set MYDAYS_TOKEN)");
      return "no-token";
    }
    config.token = fresh.token;
  }
  let remote;
  try {
    remote = await requestJson(config, "/api/agent/config");
  } catch (error) {
    if (error.code === "AGENT_TOKEN_INVALID" && config.tokenFile) config.token = "";
    log(`waiting: server not ready (${error.code ?? error.name})`);
    return "unreachable";
  }
  // While the feature is off, no session file is opened at all.
  if (!remote.enabled) return "disabled";
  const limits = { ...DEFAULT_LIMITS, ...remote };
  const state = loadState(config.stateDir);
  try {
    const stats = await scan(config, {
      limits,
      state,
      send: (turns) => requestJson(config, "/api/agent/turns", { method: "POST", body: JSON.stringify({ turns }) }),
    });
    await reportStatus(config, limits).catch(() => {});
    const sent = stats.reduce((total, stat) => total + stat.sent, 0);
    if (sent) log(`sent ${sent} new or updated turns (${stats.map((stat) => `${stat.agent}: ${stat.sent}`).join(", ")})`);
    return "ok";
  } catch (error) {
    log(`push failed, will retry (${error.code ?? error.name})`);
    return "failed";
  } finally {
    saveState(config.stateDir, state);
  }
}

export function collectorStatus(config, limits = DEFAULT_LIMITS) {
  const hasEmails = Boolean(config.gitAuthorEmails.length || limits.gitAuthorEmails?.length);
  return {
    gitDirs: gitDirectories(config, limits).slice(0, 20).map((dir) => ({
      path: dir.hostPath.slice(0, 300),
      state: dir.state === "ok" && !hasEmails ? "no-emails" : dir.state,
      repos: dir.state === "ok" ? listGitRepos(dir.path).length : 0,
    })),
  };
}

// Tells MyDays which configured Git directories this collector can see, so the settings page can explain problems.
async function reportStatus(config, limits) {
  const status = collectorStatus(config, limits);
  const key = JSON.stringify(status);
  if (key === lastReportedStatus && Date.now() - lastReportedAt < 3600000) return;
  await requestJson(config, "/api/agent/collector-status", { method: "POST", body: key });
  lastReportedStatus = key;
  lastReportedAt = Date.now();
}

let lastReportedStatus = "";
let lastReportedAt = 0;

async function main() {
  const args = new Set(process.argv.slice(2));
  const config = readConfig();
  const log = (message) => console.log(`${new Date().toISOString()} ${message}`);
  if (args.has("--dry-run")) {
    const stats = await scan(config);
    console.log(`Session directories: claude=${config.claudeDir} codex=${config.codexDir} git=${gitDirectories(config).map((dir) => dir.path).join(",") || "(not set)"}`);
    if (!stats.length) console.log("No supported session directory was found.");
    for (const stat of stats) {
      console.log(`${stat.agent}: ${stat.files} recent files, ${stat.sessions} sessions with human turns, ${stat.turns} turns, ${stat.chars} chars after trimming, ${stat.unreadableLines} unreadable lines`);
    }
    return;
  }
  if (args.has("--once")) {
    const outcome = await runOnce(config, log);
    process.exitCode = outcome === "ok" || outcome === "disabled" ? 0 : 1;
    return;
  }
  log(`collector started: server=${config.url} interval=${config.intervalSeconds}s`);
  let lastMessage = "";
  let timer;
  const stop = () => {
    clearTimeout(timer);
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  // Repeated "waiting"/"off" lines are logged once per change so an idle collector stays quiet.
  const logOnChange = (message) => {
    if (message.startsWith("sent") || message !== lastMessage) log(message);
    lastMessage = message;
  };
  for (;;) {
    const outcome = await runOnce(config, logOnChange).catch((error) => {
      logOnChange(`unexpected error: ${error.name}`);
      return "failed";
    });
    if (outcome === "disabled") logOnChange("feature is off in MyDays; not reading any session files");
    if (outcome === "ok" && !lastMessage.startsWith("sent")) logOnChange("watching session files");
    await new Promise((resolve) => { timer = setTimeout(resolve, config.intervalSeconds * 1000); });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
