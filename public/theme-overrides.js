(() => {
  const key = "layerlabs-theme-mode";
  const copy = "Good ideas deserve more than a great render. We help you refine the design, make it real, and get every detail right.";

  function applyTheme(mode) {
    const resolved = mode === "dark" ? "dark" : "light";
    document.documentElement.dataset.themeMode = resolved;
    try { localStorage.setItem(key, resolved); } catch {}
    const themeColor = document.querySelector('meta[name="theme-color"]') || (() => {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
      return meta;
    })();
    themeColor.content = resolved === "dark" ? "#111318" : "#f8f8f6";
    const button = document.querySelector(".theme-toggle-button");
    if (button) {
      const next = resolved === "dark" ? "light" : "dark";
      button.textContent = resolved === "dark" ? "☀" : "☾";
      button.setAttribute("aria-label", "Switch to " + next + " theme");
      button.setAttribute("title", "Switch to " + next + " theme");
      button.setAttribute("aria-pressed", String(resolved === "dark"));
    }
  }

  function applyIntroCopy() {
    document.querySelectorAll(".intro-strip p").forEach((node) => {
      if (node.textContent !== copy) node.textContent = copy;
    });
  }

  function removeSecondGalleryCard() {
    document.querySelectorAll(".projects-page .projects-gallery").forEach((grid) => {
      const cards = grid.querySelectorAll(":scope > .projects-gallery-item");
      if (cards.length > 1) cards[1].remove();
    });
  }

  function insertThemeButton() {
    const actions = document.querySelector(".site-header .header-actions");
    if (!actions || actions.querySelector(".theme-toggle-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle-button";
    button.textContent = "☾";
    button.setAttribute("aria-label", "Switch to dark theme");
    button.setAttribute("title", "Switch to dark theme");
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      const current = document.documentElement.dataset.themeMode === "dark" ? "dark" : "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
    const menuToggle = actions.querySelector(".menu-toggle");
    if (menuToggle) actions.insertBefore(button, menuToggle);
    else actions.appendChild(button);
    const saved = (() => { try { return localStorage.getItem(key); } catch { return null; } })();
    applyTheme(saved === "dark" ? "dark" : "light");
  }

  function enhance() {
    insertThemeButton();
    applyIntroCopy();
    removeSecondGalleryCard();
  }

  const start = () => {
    const saved = (() => { try { return localStorage.getItem(key); } catch { return null; } })();
    applyTheme(saved === "dark" ? "dark" : "light");
    enhance();
    const observer = new MutationObserver(() => enhance());
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
