(() => {
  const themeKey = "layerlabs-theme-mode";

  const safeStorage = {
    get() {
      try { return localStorage.getItem(themeKey); } catch { return null; }
    },
    set(value) {
      try { localStorage.setItem(themeKey, value); } catch {}
    },
  };

  function applyTheme(mode) {
    const theme = mode === "dark" ? "dark" : "light";
    document.documentElement.dataset.themeMode = theme;
    document.documentElement.style.colorScheme = theme;
    safeStorage.set(theme);

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = theme === "dark" ? "#111419" : "#f8f8f6";

    document.querySelectorAll(".theme-toggle-button").forEach((button) => {
      const next = theme === "dark" ? "light" : "dark";
      button.textContent = theme === "dark" ? "☀" : "☾";
      button.setAttribute("aria-label", "Switch to " + next + " theme");
      button.setAttribute("title", "Switch to " + next + " theme");
      button.setAttribute("aria-pressed", String(theme === "dark"));
    });
  }

  function attachThemeButton(button) {
    if (button.dataset.themeWired === "true") return;
    button.dataset.themeWired = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyTheme(document.documentElement.dataset.themeMode === "dark" ? "light" : "dark");
    });
  }

  function ensureThemeButton() {
    const actions = document.querySelector(".site-header .header-actions");
    if (!actions) return;

    let button = actions.querySelector(".theme-toggle-button");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "theme-toggle-button";
      button.textContent = "☾";
      button.setAttribute("aria-label", "Switch to dark theme");
      button.setAttribute("title", "Switch to dark theme");
      button.setAttribute("aria-pressed", "false");

      const menuToggle = actions.querySelector(".menu-toggle");
      if (menuToggle) actions.insertBefore(button, menuToggle);
      else actions.appendChild(button);
    }
    attachThemeButton(button);
  }

  function start() {
    applyTheme(safeStorage.get() === "dark" ? "dark" : "light");
    ensureThemeButton();

    // The recovery shell does not intercept ordinary links or mutate React-managed page text.
    // Reinsert the theme control only if the app recreates its header.
    const observer = new MutationObserver(() => {
      const actions = document.querySelector(".site-header .header-actions");
      if (actions && !actions.querySelector(".theme-toggle-button")) ensureThemeButton();
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
