#!/usr/bin/env node
// MyDays MCP server: lets AI agents (Claude Code, Codex, ...) read your MyDays records over stdio.
// Read-only and dependency-free. Configure with MYDAYS_URL and a read-scoped MYDAYS_TOKEN.
import { createInterface } from "node:readline";
import { readFileSync, existsSync } from "node:fs";

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const REQUEST_TIMEOUT_MS = 15000;

const url = (process.env.MYDAYS_URL ?? "http://localhost:4173").replace(/\/+$/, "");
const token = process.env.MYDAYS_TOKEN_FILE && existsSync(process.env.MYDAYS_TOKEN_FILE)
  ? readFileSync(process.env.MYDAYS_TOKEN_FILE, "utf8").trim()
  : (process.env.MYDAYS_TOKEN ?? "").trim();

const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

const TOOLS = [
  {
    name: "mydays_search",
    description: "Search the user's MyDays work records (tasks, work logs including AI-generated daily digests, notes, daily reviews, period reviews and period reports). Multiple keywords are ANDed. Results are newest first.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords separated by spaces, e.g. \"websocket 断线\"" },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Maximum results (default 30)" },
      },
      required: ["query"],
    },
    path: (args) => `/api/agent/search?${new URLSearchParams({ q: String(args.query ?? ""), limit: String(args.limit ?? 30) })}`,
  },
  {
    name: "mydays_get_days",
    description: "Get what the user did on a day or a date range (at most 31 days): completed and open tasks, work logs, the scratch note and the daily review (problems and plan for tomorrow). Days without any record are omitted.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", pattern: DATE_PATTERN, description: "First date, YYYY-MM-DD (the user's local date)" },
        to: { type: "string", pattern: DATE_PATTERN, description: "Last date, YYYY-MM-DD; defaults to from" },
      },
      required: ["from"],
    },
    path: (args) => `/api/agent/days?${new URLSearchParams({ from: String(args.from ?? ""), ...(args.to ? { to: String(args.to) } : {}) })}`,
  },
  {
    name: "mydays_get_period",
    description: "Get an overview of a week, month, quarter or year: metrics, every achievement with its date, open items, AI collaboration time per directory, the saved period report and notes. Use it to draft weekly/monthly reports or performance reviews.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["week", "month", "quarter", "year"], description: "Period type (default week)" },
        date: { type: "string", pattern: DATE_PATTERN, description: "Any date inside the period, YYYY-MM-DD; defaults to today" },
        project: { type: "string", description: "Optional MyDays project name to filter by" },
      },
    },
    path: (args) => `/api/agent/period?${new URLSearchParams({
      period: String(args.period ?? "week"),
      ...(args.date ? { date: String(args.date) } : {}),
      ...(args.project ? { project: String(args.project) } : {}),
    })}`,
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function callTool(name, args) {
  const tool = TOOLS.find((entry) => entry.name === name);
  if (!tool) return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  if (!token) {
    return { isError: true, content: [{ type: "text", text: "MYDAYS_TOKEN is not set. Create a read token in MyDays (设置 → 连接与令牌)." }] };
  }
  try {
    const response = await fetch(`${url}${tool.path(args ?? {})}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { isError: true, content: [{ type: "text", text: `MyDays returned ${response.status}: ${body?.error?.message ?? "request failed"}` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: `Cannot reach MyDays at ${url} (${error.name}). Is it running?` }] };
  }
}

async function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      reply(id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "mydays", version: "1.0.0" },
        instructions: "Read-only access to the user's MyDays work journal. Dates are the user's local dates (YYYY-MM-DD).",
      });
      return;
    }
    case "ping":
      if (isRequest) reply(id, {});
      return;
    case "tools/list":
      reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      return;
    case "tools/call":
      reply(id, await callTool(params?.name, params?.arguments));
      return;
    default:
      // Notifications (no id) such as notifications/initialized need no response.
      if (isRequest) fail(id, -32601, `Method not found: ${method}`);
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    fail(null, -32700, "Parse error");
    return;
  }
  handle(message).catch((error) => {
    if (message?.id !== undefined) fail(message.id, -32603, error.message);
  });
});
