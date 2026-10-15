const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-security-"));
const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-secrets-"));
const passwordFile = path.join(secretDir, "password");
const aiFile = path.join(secretDir, "ai-secret");
fs.writeFileSync(passwordFile, "correct horse battery staple\n", { mode: 0o600 });
fs.writeFileSync(aiFile, "separate-ai-master-key\n", { mode: 0o600 });
const port = 43178;
const baseUrl = `http://127.0.0.1:${port}`;
const projectDir = path.resolve(__dirname, "..");
function startServer(serverPort, extraEnv = {}) {
  return spawn(process.execPath, ["server.js"], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: String(serverPort),
      DATA_DIR: dataDir,
      MYDAYS_ACCESS_PASSWORD_FILE: passwordFile,
      AI_CONFIG_SECRET_FILE: aiFile,
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

let child = startServer(port);
let output = "";
function captureOutput(instance) {
  instance.stdout.on("data", (chunk) => { output += chunk; });
  instance.stderr.on("data", (chunk) => { output += chunk; });
}
captureOutput(child);

async function wait() {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`${baseUrl}/healthz`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(output);
}

async function stop(instance) {
  if (instance.exitCode !== null) return;
  instance.kill("SIGTERM");
  await new Promise((resolve) => instance.once("exit", resolve));
}

async function expectStartupFailure(env, expectedText) {
  const failed = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, PORT: "43179", DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "mydays-empty-secret-")), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let failedOutput = "";
  failed.stdout.on("data", (chunk) => { failedOutput += chunk; });
  failed.stderr.on("data", (chunk) => { failedOutput += chunk; });
  const code = await new Promise((resolve) => failed.on("exit", resolve));
  assert.notEqual(code, 0, "空秘密配置必须导致启动失败");
  assert.match(failedOutput, expectedText);
}

(async () => {
  try {
    await wait();
    let response = await fetch(`${baseUrl}/api/state`, { redirect: "manual" });
    assert.equal(response.status, 401);
    response = await fetch(`${baseUrl}/api/ai/models`, { method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl }, body: "{}" });
    assert.equal(response.status, 401, "临时模型发现接口必须受登录保护");
    response = await fetch(`${baseUrl}/api/ai/period-report`, { method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl }, body: "{}" });
    assert.equal(response.status, 401, "周期 AI 汇报接口必须受登录保护");
    response = await fetch(`${baseUrl}/api/ai/polish-entry`, { method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl }, body: "{}" });
    assert.equal(response.status, 401, "AI 润色接口必须受登录保护");
    response = await fetch(`${baseUrl}/api/ai/summary-settings`, { method: "PUT", headers: { "Content-Type": "application/json", Origin: baseUrl }, body: "{}" });
    assert.equal(response.status, 401, "AI 总结偏好接口必须受登录保护");
    response = await fetch(`${baseUrl}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify({ name: "未登录项目" }) });
    assert.equal(response.status, 401, "项目配置接口必须受登录保护");
    response = await fetch(`${baseUrl}/api/state`, { headers: { Cookie: "mydays_session=%E0%A4%A" } });
    assert.equal(response.status, 401, "畸形 Cookie 应按未登录处理而不是触发服务端错误");
    response = await fetch(`${baseUrl}/`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/login");
    assert.equal((await fetch(`${baseUrl}/app.js`, { redirect: "manual" })).status, 302);
    assert.equal((await fetch(`${baseUrl}/api/not-a-real-route`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/login`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/theme.js`)).status, 200, "登录页依赖的主题脚本必须允许匿名访问");
    assert.deepEqual(await (await fetch(`${baseUrl}/api/auth/status`)).json(), { enabled: true, authenticated: false });
    response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ password: "correct horse battery staple" }) });
    assert.equal(response.status, 403);
    response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify({ password: "wrong" }) });
    assert.equal(response.status, 401);
    assert.equal(JSON.stringify(await response.json()).includes("correct horse"), false);
    response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify({ password: "correct horse battery staple" }) });
    assert.equal(response.status, 200);
    const cookieHeader = response.headers.get("set-cookie");
    const cookie = cookieHeader.split(";")[0];
    assert.match(cookieHeader, /HttpOnly/i);
    assert.match(cookieHeader, /SameSite=Strict/i);
    assert.doesNotMatch(cookieHeader, /Secure/i);
    response = await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const state = await response.json();
    response = await fetch(`${baseUrl}/api/ai/summary-settings`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ promptExcerpt: "evil" }) });
    assert.equal(response.status, 403, "AI 总结偏好写入必须受同源保护");
    response = await fetch(`${baseUrl}/api/projects`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ name: "跨站项目" }) });
    assert.equal(response.status, 403, "项目配置写入必须受同源保护");
    response = await fetch(`${baseUrl}/api/state`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ data: state.data, revision: state.revision }) });
    assert.equal(response.status, 403);
    response = await fetch(`${baseUrl}/api/state`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ data: state.data, revision: state.revision }) });
    assert.equal(response.status, 403, "启用认证时无 Origin/Referer 的修改请求必须拒绝");
    response = await fetch(`${baseUrl}/api/state`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "null" }, body: JSON.stringify({ data: state.data, revision: state.revision }) });
    assert.equal(response.status, 403, "Origin: null 必须拒绝");
    response = await fetch(`${baseUrl}/api/state`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json", Referer: `${baseUrl}/tasks` }, body: JSON.stringify({ data: state.data, revision: state.revision }) });
    assert.equal(response.status, 200, "同源 Referer 应作为 Origin 缺失时的回退");
    const refererState = await response.json();
    response = await fetch(`${baseUrl}/api/state`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify({ data: state.data, revision: state.revision }) });
    assert.equal(response.status, 409, "旧 revision 应继续受到并发控制保护");
    response = await fetch(`${baseUrl}/api/state`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify({ data: refererState.data, revision: refererState.revision }) });
    assert.equal(response.status, 200, "同源 Origin 的修改请求应成功");
    assert.equal((await fetch(`${baseUrl}/api/agent-tokens`)).status, 401, "令牌管理必须要求登录");
    response = await fetch(`${baseUrl}/api/agent-tokens`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ name: "跨站令牌" }) });
    assert.equal(response.status, 403, "令牌创建必须受同源保护");
    response = await fetch(`${baseUrl}/api/agent-tokens`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify({ name: "采集器" }) });
    assert.equal(response.status, 201);
    const agentToken = (await response.json()).token;
    const bearer = { Authorization: `Bearer ${agentToken}` };
    assert.equal((await fetch(`${baseUrl}/api/agent/config`, { headers: bearer })).status, 200, "采集器令牌不需要登录会话");
    for (const route of ["/api/state", "/api/agent-tokens", "/api/agent-digest/settings", "/api/agent-digest/status", "/api/ai/providers", "/api/projects"]) {
      assert.equal((await fetch(`${baseUrl}${route}`, { headers: bearer })).status, 401, `采集器令牌不得访问 ${route}`);
    }
    assert.equal((await fetch(`${baseUrl}/`, { headers: bearer, redirect: "manual" })).status, 302, "采集器令牌不得访问页面");
    response = await fetch(`${baseUrl}/api/agent/turns`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify({ turns: [] }) });
    assert.equal(response.status, 401, "登录会话不能代替采集器令牌");
    response = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie, Origin: baseUrl } });
    assert.equal(response.status, 200);
    assert.equal((await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } })).status, 401);
    const health = await fetch(`${baseUrl}/healthz`, { headers: { "X-Forwarded-Proto": "https" } });
    assert.equal(health.headers.get("strict-transport-security"), null);
    assert.match(health.headers.get("permissions-policy"), /camera=\(\)/);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify({ password: "wrong" }) });
      assert.equal(response.status, 401);
    }
    response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify({ password: "wrong" }) });
    assert.equal(response.status, 429, "登录失败次数超限后必须稳定限流");

    await stop(child);
    child = startServer(port, { TRUST_PROXY: "1" });
    captureOutput(child);
    await wait();
    assert.equal((await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } })).status, 401, "服务重启后旧会话必须失效");
    const forwardedHeaders = {
      "Content-Type": "application/json",
      Origin: "https://mydays.example.com",
      "X-Forwarded-Proto": "https",
      "X-Forwarded-Host": "mydays.example.com",
      "X-Forwarded-For": "203.0.113.7",
    };
    response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: forwardedHeaders, body: JSON.stringify({ password: "correct horse battery staple" }) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie"), /; Secure/i);
    assert.match(response.headers.get("strict-transport-security"), /max-age=31536000/);
    response = await fetch(`${baseUrl}/healthz`, { headers: { "X-Forwarded-Proto": "https,http", "X-Forwarded-Host": "mydays.example.com", "X-Forwarded-For": "203.0.113.7" } });
    assert.equal(response.status, 400, "歧义的多值代理协议头必须拒绝");
    response = await fetch(`${baseUrl}/healthz`, { headers: { "X-Forwarded-Proto": "https", "X-Forwarded-Host": "good.example,evil.example", "X-Forwarded-For": "203.0.113.7" } });
    assert.equal(response.status, 400, "歧义的多值代理主机头必须拒绝");
    response = await fetch(`${baseUrl}/healthz`, { headers: { "X-Forwarded-Proto": "https", "X-Forwarded-Host": "mydays.example.com", "X-Forwarded-For": "203.0.113.7, 198.51.100.9" } });
    assert.equal(response.status, 400, "歧义的多值来源地址必须拒绝");

    const emptyFile = path.join(secretDir, "empty");
    fs.writeFileSync(emptyFile, "\n", { mode: 0o600 });
    await expectStartupFailure({ MYDAYS_ACCESS_PASSWORD_FILE: emptyFile, AI_CONFIG_SECRET: "valid" }, /empty secret/);
    await expectStartupFailure({ MYDAYS_ACCESS_PASSWORD: "valid", AI_CONFIG_SECRET_FILE: emptyFile }, /empty secret/);
    await expectStartupFailure({ MYDAYS_ACCESS_PASSWORD: "", AI_CONFIG_SECRET: "valid" }, /must not be empty/);
    await expectStartupFailure({ AI_CONFIG_SECRET: "" }, /must not be empty/);
    console.log("MyDays public security test passed");
  } finally { await stop(child); }
})().catch((error) => { console.error(error); console.error(output); child.kill("SIGKILL"); process.exitCode = 1; });
