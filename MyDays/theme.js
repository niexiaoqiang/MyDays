(() => {
  const STORAGE_KEY = "mydays.theme";
  const THEME_COLORS = { light: "#f6f5f1", dark: "#141512" };

  function readTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : "system";
    } catch {
      return "system";
    }
  }

  function applyTheme(theme) {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      const systemScheme = meta.media.includes("dark") ? "dark" : "light";
      meta.content = THEME_COLORS[theme === "system" ? systemScheme : theme];
    });
  }

  window.MyDaysTheme = {
    get: readTheme,
    set(theme) {
      const next = theme === "light" || theme === "dark" ? theme : "system";
      try {
        if (next === "system") localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      applyTheme(next);
    },
  };

  applyTheme(readTheme());
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    applyTheme(readTheme());
    window.dispatchEvent(new Event("mydays-theme-change"));
  });
})();
