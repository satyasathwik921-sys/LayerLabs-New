(() => {
  const themeKey = "layerlabs-theme-mode";
  const introCopy = "A useful idea deserves more than a good render. We help you think it through, make it tangible, and get the details right.";

  const safeStorage = {
    get() { try { return localStorage.getItem(themeKey); } catch { return null; } },
    set(value) { try { localStorage.setItem(themeKey, value); } catch {} },
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
      const mode = document.documentElement.dataset.themeMode === "dark" ? "light" : "dark";
      applyTheme(mode);
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

  function simplifyIntro() {
    document.querySelectorAll(".intro-strip p").forEach((node) => {
      if (node.textContent !== introCopy) node.textContent = introCopy;
    });
  }

  function keepGalleryDataIntact() {
    // Gallery card 2 is hidden in CSS; don't remove React-owned nodes here.
  }

  function enhance() {
    ensureThemeButton();
    keepGalleryDataIntact();
  }

  function start() {
    applyTheme(safeStorage.get() === "dark" ? "dark" : "light");
    enhance();
    const observer = new MutationObserver(() => {
      // Only run when the header needs the theme button. Avoid rewriting React content.
      const actions = document.querySelector(".site-header .header-actions");
      if (actions && !actions.querySelector(".theme-toggle-button")) enhance();
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
