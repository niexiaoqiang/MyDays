const form = document.querySelector("#login-form");
const password = document.querySelector("#login-password");
const errorState = document.querySelector("#login-error");

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? "暂时无法登录");
  return body;
}

(async () => {
  try {
    const status = await request("/api/auth/status");
    if (!status.enabled || status.authenticated) window.location.replace("/");
  } catch {}
})();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  errorState.textContent = "正在验证…";
  try {
    await request("/api/auth/login", { method: "POST", body: JSON.stringify({ password: password.value }) });
    password.value = "";
    window.location.replace("/");
  } catch (error) {
    password.value = "";
    errorState.textContent = error.message;
    password.focus();
  } finally {
    button.disabled = false;
  }
});
