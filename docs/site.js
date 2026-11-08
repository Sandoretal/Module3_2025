(() => {
  const STORAGE_KEYS = {
    colorMode: "module3-color-mode",
    contrastMode: "module3-contrast-mode",
    darkMode: "module3-dark-mode",
    toolbarCollapsed: "module3-toolbar-collapsed",
    zoom: "module3-zoom",
    magnifierPower: "module3-magnifier-power"
  };

  const MAGNIFIER = { size: 240, min: 1.5, max: 5, step: 0.5, defaultPower: 2.5 };
  const THEME_VARS = ["--bg", "--bg-2", "--surface", "--surface-strong", "--ink", "--muted", "--line",
    "--coral", "--teal", "--gold", "--navy", "--berry", "--pill-end", "--shadow", "--radius"];

  function ensureToolbar() {
    if (document.querySelector(".accessibility-toolbar")) {
      return;
    }

    const toolbar = document.createElement("div");
    toolbar.className = "accessibility-toolbar";
    toolbar.innerHTML = `
      <button type="button" class="toolbar-button toolbar-toggle" data-action="toggle-collapse" aria-expanded="true" aria-label="Minimize accessibility bar">
      </button>
      <div class="toolbar-controls">
        <button type="button" class="toolbar-button" data-action="toggle-contrast" aria-pressed="false">
          Color-blind friendly
        </button>
        <button type="button" class="toolbar-button" data-action="toggle-high-contrast" aria-pressed="false">
          Contrast
        </button>
        <button type="button" class="toolbar-button" data-action="toggle-dark" aria-pressed="false" aria-label="Dark mode">
          Dark
        </button>
        <button type="button" class="toolbar-button" data-action="zoom-out" aria-label="Zoom out">
          A-
        </button>
        <button type="button" class="toolbar-button" data-action="zoom-reset" aria-label="Reset zoom">
          100%
        </button>
        <button type="button" class="toolbar-button" data-action="zoom-in" aria-label="Zoom in">
          A+
        </button>
        <button type="button" class="toolbar-button magnifier-toggle" data-action="toggle-magnifier" aria-pressed="false" aria-label="Magnifying glass">
          🔍
        </button>
        <button type="button" class="toolbar-button toolbar-reset" data-action="reset-all" title="Turn every display setting back to normal">
          Reset
        </button>
        <button type="button" class="toolbar-button" data-action="toggle-help" aria-expanded="false" aria-label="Keyboard shortcuts">
          ?
        </button>
        <div class="shortcut-panel" hidden>
          <strong>Keyboard shortcuts</strong>
          <ul>
            <li><kbd>Tab</kbd> move through controls</li>
            <li><kbd>Enter</kbd> activate selected button or link</li>
            <li><kbd>+</kbd> zoom in</li>
            <li><kbd>-</kbd> zoom out</li>
            <li><kbd>0</kbd> reset zoom</li>
            <li><kbd>C</kbd> toggle color-blind friendly mode</li>
            <li><kbd>H</kbd> toggle high contrast mode</li>
            <li><kbd>D</kbd> toggle dark mode</li>
            <li><kbd>R</kbd> reset all display settings</li>
            <li><kbd>M</kbd> magnifying glass on or off</li>
            <li><kbd>]</kbd> / <kbd>[</kbd> or <kbd>Shift</kbd> + scroll: magnify more or less</li>
            <li><kbd>Esc</kbd> close the magnifying glass</li>
            <li><kbd>?</kbd> open or close shortcuts</li>
          </ul>
        </div>
      </div>
    `;

    document.body.appendChild(toolbar);
  }

  function applyColorMode(mode) {
    document.body.classList.toggle("colorblind-friendly", mode === "friendly");
    const toggleButton = document.querySelector('[data-action="toggle-contrast"]');
    if (toggleButton) {
      toggleButton.setAttribute("aria-pressed", String(mode === "friendly"));
    }
  }

  function applyContrastMode(mode) {
    document.body.classList.toggle("high-contrast", mode === "high");
    const contrastButton = document.querySelector('[data-action="toggle-high-contrast"]');
    if (contrastButton) {
      contrastButton.setAttribute("aria-pressed", String(mode === "high"));
    }
  }

  function applyDarkMode(mode) {
    document.body.classList.toggle("dark-mode", mode === "dark");
    const button = document.querySelector('[data-action="toggle-dark"]');
    if (button) {
      button.setAttribute("aria-pressed", String(mode === "dark"));
    }
  }

  function toggleDarkMode() {
    const next = document.body.classList.contains("dark-mode") ? "light" : "dark";
    applyDarkMode(next);
    localStorage.setItem(STORAGE_KEYS.darkMode, next);
  }

  function applyZoom(level) {
    const clamped = Math.max(0.8, Math.min(2, level));
    document.documentElement.style.setProperty("--user-zoom", clamped.toFixed(2));
    const resetButton = document.querySelector('[data-action="zoom-reset"]');
    if (resetButton) {
      resetButton.textContent = `${Math.round(clamped * 100)}%`;
    }
    return clamped;
  }

  function applyToolbarCollapsed(collapsed) {
    const toolbar = document.querySelector(".accessibility-toolbar");
    if (!toolbar) {
      return;
    }

    toolbar.classList.toggle("is-collapsed", collapsed);
    const toggleButton = toolbar.querySelector('[data-action="toggle-collapse"]');
    if (toggleButton) {
      toggleButton.setAttribute("aria-expanded", String(!collapsed));
      const tip = collapsed ? "Show display settings" : "Hide display settings";
      toggleButton.setAttribute("aria-label", tip);
      // The visible "Aa" + colour wheel is drawn in styles.css;
      // the span is the tooltip shown on hover and keyboard focus.
      toggleButton.innerHTML = `<span class="toolbar-tip" aria-hidden="true">${tip}</span>`;
    }

    if (collapsed) {
      const helpButton = toolbar.querySelector('[data-action="toggle-help"]');
      const panel = toolbar.querySelector(".shortcut-panel");
      if (helpButton) {
        helpButton.setAttribute("aria-expanded", "false");
      }
      if (panel) {
        panel.hidden = true;
      }
    }
  }

  // Magnifying glass: a round lens that follows the pointer and shows an
  // enlarged copy of the page underneath. The copy is refreshed whenever the
  // lens is switched on and after the page changes.
  const magnifier = {
    on: false,
    power: MAGNIFIER.defaultPower,
    lens: null,
    content: null,
    label: null,
    x: 0,
    y: 0,
    refreshTimer: null
  };

  function readPower() {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEYS.magnifierPower));
      if (saved >= MAGNIFIER.min && saved <= MAGNIFIER.max) {
        return saved;
      }
    } catch (error) {
      /* storage unavailable */
    }
    return MAGNIFIER.defaultPower;
  }

  function buildLens() {
    const lens = document.createElement("div");
    lens.className = "magnifier-lens";
    lens.setAttribute("aria-hidden", "true");
    lens.style.width = `${MAGNIFIER.size}px`;
    lens.style.height = `${MAGNIFIER.size}px`;
    const content = document.createElement("div");
    content.className = "magnifier-content";
    const label = document.createElement("span");
    label.className = "magnifier-power";
    lens.append(content, label);
    document.body.appendChild(lens);
    magnifier.lens = lens;
    magnifier.content = content;
    magnifier.label = label;
  }

  function refreshLensContent() {
    if (!magnifier.content) {
      return;
    }
    const bodyStyle = getComputedStyle(document.body);
    const content = magnifier.content;
    content.replaceChildren();
    THEME_VARS.forEach((name) => {
      content.style.setProperty(name, bodyStyle.getPropertyValue(name));
    });
    content.style.width = `${document.documentElement.clientWidth}px`;
    content.style.minHeight = `${document.documentElement.scrollHeight}px`;
    content.style.backgroundColor = bodyStyle.backgroundColor;
    content.style.backgroundImage = bodyStyle.backgroundImage;
    content.style.color = bodyStyle.color;
    content.style.fontFamily = bodyStyle.fontFamily;
    content.style.fontSize = bodyStyle.fontSize;
    content.style.lineHeight = bodyStyle.lineHeight;

    Array.from(document.body.children).forEach((child) => {
      if (child === magnifier.lens || child.matches(".accessibility-toolbar, script")) {
        return;
      }
      const copy = child.cloneNode(true);
      copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      copy.removeAttribute("id");
      copy.querySelectorAll("img[loading]").forEach((img) => img.removeAttribute("loading"));
      content.appendChild(copy);
    });
    // Keep typed values (e.g. search boxes) visible in the copy.
    const originals = document.body.querySelectorAll("input, textarea");
    const copies = content.querySelectorAll("input, textarea");
    originals.forEach((el, index) => {
      if (copies[index]) {
        copies[index].value = el.value;
      }
    });
    positionLens();
  }

  function scheduleRefresh() {
    if (!magnifier.on) {
      return;
    }
    clearTimeout(magnifier.refreshTimer);
    magnifier.refreshTimer = setTimeout(refreshLensContent, 150);
  }

  function positionLens() {
    if (!magnifier.on || !magnifier.lens) {
      return;
    }
    const radius = MAGNIFIER.size / 2;
    const k = magnifier.power;
    const pageX = magnifier.x + window.scrollX;
    const pageY = magnifier.y + window.scrollY;
    magnifier.lens.style.transform = `translate(${magnifier.x - radius}px, ${magnifier.y - radius}px)`;
    magnifier.content.style.transform =
      `translate(${radius - pageX * k}px, ${radius - pageY * k}px) scale(${k})`;
    magnifier.label.textContent = `${k}×`;
  }

  function setMagnifierPower(power) {
    const rounded = Math.round(power / MAGNIFIER.step) * MAGNIFIER.step;
    magnifier.power = Math.max(MAGNIFIER.min, Math.min(MAGNIFIER.max, rounded));
    try {
      localStorage.setItem(STORAGE_KEYS.magnifierPower, String(magnifier.power));
    } catch (error) {
      /* storage unavailable */
    }
    positionLens();
  }

  function setMagnifier(on) {
    magnifier.on = on;
    const button = document.querySelector('[data-action="toggle-magnifier"]');
    if (button) {
      button.setAttribute("aria-pressed", String(on));
    }
    if (on && !magnifier.lens) {
      buildLens();
    }
    if (magnifier.lens) {
      magnifier.lens.hidden = !on;
    }
    document.body.classList.toggle("magnifier-active", on);
    if (on) {
      if (!magnifier.x && !magnifier.y) {
        magnifier.x = window.innerWidth / 2;
        magnifier.y = window.innerHeight / 2;
      }
      refreshLensContent();
    }
  }

  function initMagnifier() {
    magnifier.power = readPower();

    document.addEventListener("pointermove", (event) => {
      magnifier.x = event.clientX;
      magnifier.y = event.clientY;
      if (magnifier.on) {
        positionLens();
      }
    }, { passive: true });

    window.addEventListener("scroll", positionLens, { passive: true });
    window.addEventListener("resize", scheduleRefresh);
    document.addEventListener("input", scheduleRefresh);
    document.addEventListener("click", scheduleRefresh);
    document.addEventListener("toggle", scheduleRefresh, true);

    document.addEventListener("wheel", (event) => {
      if (!magnifier.on || !event.shiftKey) {
        return;
      }
      event.preventDefault();
      const delta = event.deltaY || event.deltaX;
      setMagnifierPower(magnifier.power + (delta < 0 ? MAGNIFIER.step : -MAGNIFIER.step));
    }, { passive: false });
  }

  // "Back to top" button: appears once you have scrolled down a long page.
  function initBackToTop() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "back-to-top";
    button.hidden = true;
    button.innerHTML = '<span aria-hidden="true">↑</span> Back to top';
    document.body.appendChild(button);

    const update = () => {
      const longPage = document.documentElement.scrollHeight > window.innerHeight * 2;
      button.hidden = !(longPage && window.scrollY > window.innerHeight * 0.8);
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();

    button.addEventListener("click", () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      // Move keyboard focus to the top too, so Tab continues from the menu.
      const first = document.querySelector(".site-nav a");
      if (first) {
        first.focus({ preventScroll: true });
      }
    });
  }

  // "Last updated" date in the footer, from when the page was last published.
  function initLastUpdated() {
    const footer = document.querySelector("footer");
    const modified = new Date(document.lastModified);
    // Pages without a real date report the current time; show nothing then.
    if (!footer || Number.isNaN(modified.getTime()) || Date.now() - modified.getTime() < 60000) {
      return;
    }
    const line = document.createElement("span");
    line.className = "last-updated";
    line.textContent = `Last updated ${modified.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
    footer.appendChild(line);
  }

  function init() {
    ensureToolbar();
    initBackToTop();
    initLastUpdated();

    const savedMode = localStorage.getItem(STORAGE_KEYS.colorMode) || "default";
    const savedContrast = localStorage.getItem(STORAGE_KEYS.contrastMode) || "default";
    const savedCollapsed = localStorage.getItem(STORAGE_KEYS.toolbarCollapsed) === "1";
    const savedZoom = Number(localStorage.getItem(STORAGE_KEYS.zoom) || "1");

    applyColorMode(savedMode);
    applyContrastMode(savedContrast);
    // No saved choice yet: follow the computer's light/dark setting.
    const savedDark = localStorage.getItem(STORAGE_KEYS.darkMode) ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyDarkMode(savedDark);

    // "Reset": back to the defaults for every display setting.
    const resetAll = () => {
      [STORAGE_KEYS.colorMode, STORAGE_KEYS.contrastMode, STORAGE_KEYS.darkMode,
        STORAGE_KEYS.zoom, STORAGE_KEYS.magnifierPower].forEach((key) => localStorage.removeItem(key));
      applyColorMode("default");
      applyContrastMode("default");
      applyDarkMode(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      zoomLevel = applyZoom(1);
      magnifier.power = MAGNIFIER.defaultPower;
      setMagnifier(false);
    };
    // On phones and touch screens the bar is a round "Aa" button that always
    // starts closed (must match the media query in styles.css).
    const phoneQuery = window.matchMedia("(max-width: 700px), (pointer: coarse)");
    applyToolbarCollapsed(phoneQuery.matches ? true : savedCollapsed);

    document.addEventListener("click", (event) => {
      const toolbar = document.querySelector(".accessibility-toolbar");
      if (phoneQuery.matches && !toolbar.classList.contains("is-collapsed") && !toolbar.contains(event.target)) {
        applyToolbarCollapsed(true);
      }
    });
    let zoomLevel = applyZoom(savedZoom);
    initMagnifier();

    document.querySelector(".accessibility-toolbar").addEventListener("click", (event) => {
      const button = event.target.closest(".toolbar-button");
      if (!button) {
        return;
      }

      const action = button.dataset.action;

      if (action === "toggle-collapse") {
        const collapsed = !document.querySelector(".accessibility-toolbar").classList.contains("is-collapsed");
        applyToolbarCollapsed(collapsed);
        if (!phoneQuery.matches) {
          localStorage.setItem(STORAGE_KEYS.toolbarCollapsed, collapsed ? "1" : "0");
        }
        return;
      }

      if (action === "toggle-contrast") {
        const nextMode = document.body.classList.contains("colorblind-friendly") ? "default" : "friendly";
        applyColorMode(nextMode);
        localStorage.setItem(STORAGE_KEYS.colorMode, nextMode);
        return;
      }

      if (action === "toggle-high-contrast") {
        const nextMode = document.body.classList.contains("high-contrast") ? "default" : "high";
        applyContrastMode(nextMode);
        localStorage.setItem(STORAGE_KEYS.contrastMode, nextMode);
        return;
      }

      if (action === "reset-all") {
        resetAll();
        return;
      }

      if (action === "toggle-dark") {
        toggleDarkMode();
        return;
      }

      if (action === "toggle-magnifier") {
        setMagnifier(!magnifier.on);
        return;
      }

      if (action === "toggle-help") {
        const panel = document.querySelector(".shortcut-panel");
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        panel.hidden = expanded;
        return;
      }

      if (action === "zoom-in") {
        zoomLevel = applyZoom(zoomLevel + 0.1);
      } else if (action === "zoom-out") {
        zoomLevel = applyZoom(zoomLevel - 0.1);
      } else if (action === "zoom-reset") {
        zoomLevel = applyZoom(1);
      }

      localStorage.setItem(STORAGE_KEYS.zoom, String(zoomLevel));
      scheduleRefresh();
    });

    document.addEventListener("keydown", (event) => {
      const activeTag = document.activeElement && document.activeElement.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "Escape" && magnifier.on) {
        setMagnifier(false);
        return;
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        setMagnifier(!magnifier.on);
        return;
      } else if (magnifier.on && (event.key === "]" || event.key === "[")) {
        event.preventDefault();
        setMagnifierPower(magnifier.power + (event.key === "]" ? MAGNIFIER.step : -MAGNIFIER.step));
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomLevel = applyZoom(zoomLevel + 0.1);
        localStorage.setItem(STORAGE_KEYS.zoom, String(zoomLevel));
      } else if (event.key === "-") {
        event.preventDefault();
        zoomLevel = applyZoom(zoomLevel - 0.1);
        localStorage.setItem(STORAGE_KEYS.zoom, String(zoomLevel));
      } else if (event.key === "0") {
        event.preventDefault();
        zoomLevel = applyZoom(1);
        localStorage.setItem(STORAGE_KEYS.zoom, String(zoomLevel));
      } else if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        const nextMode = document.body.classList.contains("colorblind-friendly") ? "default" : "friendly";
        applyColorMode(nextMode);
        localStorage.setItem(STORAGE_KEYS.colorMode, nextMode);
      } else if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        const nextMode = document.body.classList.contains("high-contrast") ? "default" : "high";
        applyContrastMode(nextMode);
        localStorage.setItem(STORAGE_KEYS.contrastMode, nextMode);
        scheduleRefresh();
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        resetAll();
      } else if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        toggleDarkMode();
      } else if (event.key === "?") {
        event.preventDefault();
        if (document.querySelector(".accessibility-toolbar").classList.contains("is-collapsed")) {
          return;
        }
        const button = document.querySelector('[data-action="toggle-help"]');
        const panel = document.querySelector(".shortcut-panel");
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        panel.hidden = expanded;
      }

      scheduleRefresh();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
