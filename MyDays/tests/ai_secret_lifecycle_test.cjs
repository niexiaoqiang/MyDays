const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mydays-ai-secret-"));
const basePort = 43177;
const projectDir = path.resolve(__dirname, "..");

function startServer(port, extraEnv = {}) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectDir,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  return { child, output: () => output };
}

async function waitForServer(instance, port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (instance.child.exitCode !== null) throw new Error(`Server exited early:\n${instance.output()}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start:\n${instance.output()}`);
}

async function stopServer(instance) {
  if (instance.child.exitCode !== null) return;
  instance.child.kill("SIGTERM");
  await new Promise((resolve) => instance.child.once("exit", resolve));
}

async function request(port, url, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  return { response, body: await response.json().catch(() => null) };
}

(async () => {
  let server = startServer(basePort);
  try {
    await waitForServer(server, basePort);
    const secretPath = path.join(dataDir, ".ai-config-secret");
    assert.equal(fs.existsSync(secretPath), true, "未设置环境变量时应自动生成主密钥文件");
    assert.equal(fs.statSync(secretPath).mode & 0o777, 0o600, "主密钥文件权限必须为 0600");
    const secretBefore = fs.readFileSync(secretPath, "utf8");

    const key = "persistent-secret-key";
    let result = await request(basePort, "/api/ai/providers", {
      method: "POST",
      body: JSON.stringify({
        name: "Persistent provider",
        protocol: "openai",
        baseUrl: "http://127.0.0.1:9/v1",
        model: "test-model",
        timeoutMs: 1000,
        apiKey: key,
      }),
    });
    assert.equal(result.response.status, 201);
    const providerId = result.body.provider.id;
    assert.equal(JSON.stringify(result.body).includes(key), false);

    await stopServer(server);
    server = startServer(basePort + 1);
    await waitForServer(server, basePort + 1);
    assert.equal(fs.readFileSync(secretPath, "utf8"), secretBefore, "重启必须复用同一个主密钥");
    assert.equal(fs.statSync(secretPath).mode & 0o777, 0o600, "重启后仍应收紧主密钥权限");
    result = await request(basePort + 1, `/api/ai/providers/${providerId}/test`, { method: "POST" });
    assert.equal(result.body.error.code, "AI_CONNECTION_FAILED", "原密钥应可解密并进入连接阶段");

    await stopServer(server);
    server = startServer(basePort + 2, { AI_CONFIG_SECRET: "different-master-key" });
    await waitForServer(server, basePort + 2);
    result = await request(basePort + 2, `/api/ai/providers/${providerId}/test`, { method: "POST" });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, "AI_KEY_UNREADABLE", "错误主密钥必须返回稳定脱敏错误");
    assert.equal(JSON.stringify(result.body).includes(key), false);

    console.log("MyDays AI secret lifecycle test passed");
  } finally {
    await stopServer(server);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
