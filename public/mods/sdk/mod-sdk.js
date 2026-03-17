export const ModSDK = {
  version: "1.0.0",
};

export function defineMod(definition) {
  return function register(api) {
    if (!definition || typeof definition !== "object") {
      throw new Error("defineMod requires a definition object");
    }

    const def = definition;

    if (typeof def.onPreInit === "function") {
      api.hooks.onPreInit(() => def.onPreInit(api));
    }
    if (typeof def.onInit === "function") {
      api.hooks.onInit(() => def.onInit(api));
    }
    if (typeof def.onGameLoad === "function") {
      api.hooks.onGameLoad(() => def.onGameLoad(api));
    }
    if (typeof def.onTick === "function") {
      api.hooks.onTick(() => def.onTick(api));
    }
    if (typeof def.onUIUpdate === "function") {
      api.hooks.onUIUpdate(() => def.onUIUpdate(api));
    }

    if (def.events && typeof def.events === "object") {
      const logicEvents = def.events.logic || {};
      const uiEvents = def.events.ui || {};
      for (const eventName of Object.keys(logicEvents)) {
        const handler = logicEvents[eventName];
        if (typeof handler === "function") api.events.onLogic(eventName, (...args) => handler(api, ...args));
      }
      for (const eventName of Object.keys(uiEvents)) {
        const handler = uiEvents[eventName];
        if (typeof handler === "function") api.events.onUI(eventName, (...args) => handler(api, ...args));
      }
    }
  };
}

export function addStyle(cssText, id = undefined) {
  if (id && document.getElementById(id)) return document.getElementById(id);
  const style = document.createElement("style");
  if (id) style.id = id;
  style.textContent = cssText;
  document.head.appendChild(style);
  return style;
}

export function addStylesheet(url, id = undefined) {
  if (id && document.getElementById(id)) return document.getElementById(id);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  if (id) link.id = id;
  document.head.appendChild(link);
  return link;
}

export function createPanel(api, options = {}) {
  const suffix = options.suffix || "panel";
  const parentSelector = options.parentSelector || "#ui";
  const className = options.className || "";
  const html = options.html || "";
  const container = api.ui.createContainer(suffix, parentSelector);
  if (className) container.className = className;
  if (html) container.innerHTML = html;
  return container;
}

export function waitForElement(selector, options = {}) {
  const root = options.root || document;
  const timeoutMs = options.timeoutMs || 0;
  const existing = root.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const found = root.querySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(root === document ? document.documentElement : root, {
      childList: true,
      subtree: true,
    });

    if (timeoutMs > 0) {
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`waitForElement timed out: ${selector}`));
      }, timeoutMs);
    }
  });
}
