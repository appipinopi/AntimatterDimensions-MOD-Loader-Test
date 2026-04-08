const ACH_STORAGE_PREFIX = "admod:ach:";
const ACH_UI_ID = "mod-achievements-root";
const ACH_TARGET_ID = "mod-sdk-achievements";

const STAGE_STORAGE_PREFIX = "admod:stage:";
const STAGE_UI_ID = "mod-stages-root";
const STAGE_TARGET_ID = "mod-sdk-stages";

export const ModSDK = {
  version: "1.2.0",
};

const achievementState = {
  initialized: false,
  achievements: [],
  achievementMap: new Map(),
  ui: null,
};

const stageState = {
  initialized: false,
  stages: [],
  stageMap: new Map(),
  ui: null,
};

function getAchievementKey(modId, id) {
  return `${ACH_STORAGE_PREFIX}${modId}:${id}`;
}

function isAchievementUnlocked(modId, id) {
  return localStorage.getItem(getAchievementKey(modId, id)) === "1";
}

function markAchievementUnlocked(modId, id) {
  localStorage.setItem(getAchievementKey(modId, id), "1");
}

function getStageKey(modId, id, field) {
  return `${STAGE_STORAGE_PREFIX}${modId}:${id}:${field}`;
}

function getStoredStageFlag(modId, id, field) {
  return localStorage.getItem(getStageKey(modId, id, field)) === "1";
}

function setStoredStageFlag(modId, id, field) {
  localStorage.setItem(getStageKey(modId, id, field), "1");
}

function ensureAchievementUI() {
  if (achievementState.ui) return achievementState.ui;
  if (document.getElementById(ACH_UI_ID)) return achievementState.ui;

  addStyle(
    `
    #${ACH_UI_ID} {
      position: fixed;
      right: 12px;
      top: 12px;
      z-index: 9999;
      font-family: "PT Mono", monospace;
    }
    #${ACH_UI_ID} .mod-ach-toggle {
      background: rgba(0,0,0,0.7);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
    }
    #${ACH_UI_ID} .mod-ach-panel {
      margin-top: 6px;
      max-height: 60vh;
      overflow: auto;
      background: rgba(0,0,0,0.85);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      padding: 8px;
      min-width: 260px;
      display: none;
    }
    #${ACH_UI_ID}.is-open .mod-ach-panel {
      display: block;
    }
    #${ACH_UI_ID} .mod-ach-group {
      margin-bottom: 8px;
    }
    #${ACH_UI_ID} .mod-ach-title {
      font-weight: bold;
      font-size: 12px;
      margin-bottom: 4px;
      color: #ffd700;
    }
    #${ACH_UI_ID} .mod-ach-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    #${ACH_UI_ID} .mod-ach-item:last-child {
      border-bottom: none;
    }
    #${ACH_UI_ID} .mod-ach-name {
      font-size: 12px;
    }
    #${ACH_UI_ID} .mod-ach-desc {
      font-size: 11px;
      color: rgba(255,255,255,0.7);
    }
    #${ACH_UI_ID} .mod-ach-unlocked .mod-ach-name {
      color: #7cff7c;
    }
    `,
    "mod-achievements-style"
  );

  const root = document.createElement("div");
  root.id = ACH_UI_ID;

  const toggle = document.createElement("button");
  toggle.className = "mod-ach-toggle";
  toggle.textContent = "Mod Achievements";
  toggle.addEventListener("click", () => {
    root.classList.toggle("is-open");
  });

  const panel = document.createElement("div");
  panel.className = "mod-ach-panel";

  root.appendChild(toggle);
  root.appendChild(panel);
  document.body.appendChild(root);

  achievementState.ui = { root, panel };
  return achievementState.ui;
}

function renderAchievementUI() {
  if (!achievementState.achievements.length) {
    if (achievementState.ui?.panel) achievementState.ui.panel.innerHTML = "";
    return;
  }
  const ui = ensureAchievementUI();
  const panel = ui.panel;
  panel.innerHTML = "";

  const grouped = new Map();
  for (const ach of achievementState.achievements) {
    if (!grouped.has(ach.modId)) grouped.set(ach.modId, []);
    grouped.get(ach.modId).push(ach);
  }

  for (const [modId, items] of grouped.entries()) {
    const group = document.createElement("div");
    group.className = "mod-ach-group";

    const title = document.createElement("div");
    title.className = "mod-ach-title";
    title.textContent = modId;
    group.appendChild(title);

    for (const ach of items) {
      const item = document.createElement("div");
      item.className = `mod-ach-item${ach.unlocked ? " mod-ach-unlocked" : ""}`;

      const name = document.createElement("div");
      name.className = "mod-ach-name";
      name.textContent = ach.name;

      const desc = document.createElement("div");
      desc.className = "mod-ach-desc";
      desc.textContent = ach.description || "";

      item.appendChild(name);
      item.appendChild(desc);
      group.appendChild(item);
    }

    panel.appendChild(group);
  }
}

function ensureAchievementSystem() {
  if (achievementState.initialized) return;
  achievementState.initialized = true;
  if (window.EventHub && window.GAME_EVENT) {
    EventHub.logic.on(GAME_EVENT.GAME_TICK_AFTER, () => evaluateAchievements(), ACH_TARGET_ID);
    EventHub.ui.on(GAME_EVENT.UPDATE, () => renderAchievementUI(), ACH_TARGET_ID);
  }
}

function evaluateAchievements() {
  for (const ach of achievementState.achievements) {
    if (ach.unlocked || typeof ach.condition !== "function") continue;
    let result = false;
    try {
      result = ach.condition(ach.api);
    } catch (error) {
      ach.api?.logger?.error?.(`Achievement check failed: ${ach.id}`, error);
      continue;
    }
    if (result) unlockAchievement(ach.api, ach.id);
  }
}

function ensureStageUI() {
  if (stageState.ui) return stageState.ui;
  if (document.getElementById(STAGE_UI_ID)) return stageState.ui;

  addStyle(
    `
    #${STAGE_UI_ID} {
      position: fixed;
      right: 12px;
      top: 52px;
      z-index: 9998;
      font-family: "PT Mono", monospace;
    }
    #${STAGE_UI_ID} .mod-stage-toggle {
      background: rgba(0,0,0,0.7);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
    }
    #${STAGE_UI_ID} .mod-stage-panel {
      margin-top: 6px;
      max-height: 60vh;
      overflow: auto;
      background: rgba(0,0,0,0.85);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      padding: 8px;
      min-width: 280px;
      display: none;
    }
    #${STAGE_UI_ID}.is-open .mod-stage-panel {
      display: block;
    }
    #${STAGE_UI_ID} .mod-stage-group {
      margin-bottom: 8px;
    }
    #${STAGE_UI_ID} .mod-stage-title {
      font-weight: bold;
      font-size: 12px;
      margin-bottom: 4px;
      color: #7cc0ff;
    }
    #${STAGE_UI_ID} .mod-stage-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    #${STAGE_UI_ID} .mod-stage-item:last-child {
      border-bottom: none;
    }
    #${STAGE_UI_ID} .mod-stage-name {
      font-size: 12px;
    }
    #${STAGE_UI_ID} .mod-stage-desc {
      font-size: 11px;
      color: rgba(255,255,255,0.7);
    }
    #${STAGE_UI_ID} .mod-stage-status {
      font-size: 11px;
      color: rgba(255,255,255,0.85);
    }
    #${STAGE_UI_ID} .mod-stage-unlocked .mod-stage-name {
      color: #ffe07c;
    }
    #${STAGE_UI_ID} .mod-stage-completed .mod-stage-name {
      color: #7cff7c;
    }
    `,
    "mod-stages-style"
  );

  const root = document.createElement("div");
  root.id = STAGE_UI_ID;

  const toggle = document.createElement("button");
  toggle.className = "mod-stage-toggle";
  toggle.textContent = "Mod Stages";
  toggle.addEventListener("click", () => {
    root.classList.toggle("is-open");
  });

  const panel = document.createElement("div");
  panel.className = "mod-stage-panel";

  root.appendChild(toggle);
  root.appendChild(panel);
  document.body.appendChild(root);

  stageState.ui = { root, panel };
  return stageState.ui;
}

function renderStageUI() {
  if (!stageState.stages.length) {
    if (stageState.ui?.panel) stageState.ui.panel.innerHTML = "";
    return;
  }
  const ui = ensureStageUI();
  const panel = ui.panel;
  panel.innerHTML = "";

  const grouped = new Map();
  for (const stage of stageState.stages) {
    if (!grouped.has(stage.modId)) grouped.set(stage.modId, []);
    grouped.get(stage.modId).push(stage);
  }

  for (const [modId, items] of grouped.entries()) {
    const group = document.createElement("div");
    group.className = "mod-stage-group";

    const title = document.createElement("div");
    title.className = "mod-stage-title";
    title.textContent = modId;
    group.appendChild(title);

    for (const stage of items) {
      const classNames = ["mod-stage-item"];
      if (stage.unlocked) classNames.push("mod-stage-unlocked");
      if (stage.completed) classNames.push("mod-stage-completed");
      const item = document.createElement("div");
      item.className = classNames.join(" ");

      const name = document.createElement("div");
      name.className = "mod-stage-name";
      name.textContent = stage.name;

      const desc = document.createElement("div");
      desc.className = "mod-stage-desc";
      desc.textContent = stage.description || "";

      const status = document.createElement("div");
      status.className = "mod-stage-status";
      status.textContent = stage.completed
        ? "completed"
        : (stage.unlocked ? "unlocked" : "locked");

      item.appendChild(name);
      item.appendChild(desc);
      item.appendChild(status);
      group.appendChild(item);
    }

    panel.appendChild(group);
  }
}

function ensureStageSystem() {
  if (stageState.initialized) return;
  stageState.initialized = true;
  if (window.EventHub && window.GAME_EVENT) {
    EventHub.logic.on(GAME_EVENT.GAME_TICK_AFTER, () => evaluateStages(), STAGE_TARGET_ID);
    EventHub.ui.on(GAME_EVENT.UPDATE, () => renderStageUI(), STAGE_TARGET_ID);
  }
}

function evaluateStages() {
  for (const stage of stageState.stages) {
    if (!stage.unlocked && typeof stage.unlockCondition === "function") {
      try {
        if (stage.unlockCondition(stage.api)) {
          unlockStage(stage.api, stage.id);
        }
      } catch (error) {
        stage.api?.logger?.error?.(`Stage unlock check failed: ${stage.id}`, error);
      }
    }

    if (!stage.completed && typeof stage.completeCondition === "function") {
      try {
        if (stage.completeCondition(stage.api)) {
          completeStage(stage.api, stage.id);
        }
      } catch (error) {
        stage.api?.logger?.error?.(`Stage completion check failed: ${stage.id}`, error);
      }
    }
  }
}

function removePanelsForMod(modId) {
  const selector = `[id^="mod-${modId}-"]`;
  const nodes = document.querySelectorAll(selector);
  for (const node of nodes) node.remove();
}

export function unregisterModRuntime(modId) {
  if (!modId || typeof modId !== "string") return;

  achievementState.achievements = achievementState.achievements.filter(ach => ach.modId !== modId);
  for (const key of Array.from(achievementState.achievementMap.keys())) {
    if (key.startsWith(`${modId}:`)) achievementState.achievementMap.delete(key);
  }

  stageState.stages = stageState.stages.filter(stage => stage.modId !== modId);
  for (const key of Array.from(stageState.stageMap.keys())) {
    if (key.startsWith(`${modId}:`)) stageState.stageMap.delete(key);
  }

  removePanelsForMod(modId);
  renderAchievementUI();
  renderStageUI();
}

function resolveSpeedSource(apiOrScope, maybeScope) {
  if (apiOrScope && typeof apiOrScope === "object" && apiOrScope.mod?.id) {
    return `${apiOrScope.mod.id}:${String(maybeScope || "default")}`;
  }
  return String(apiOrScope || "legacy");
}

export function registerAchievement(api, definition) {
  ensureAchievementSystem();
  const def = definition || {};
  if (!def.id || !def.name) throw new Error("Achievement requires id and name");

  const key = `${api.mod.id}:${def.id}`;
  if (achievementState.achievementMap.has(key)) return;

  const unlocked = isAchievementUnlocked(api.mod.id, def.id);
  const entry = {
    id: def.id,
    name: def.name,
    description: def.description || "",
    modId: api.mod.id,
    unlocked,
    condition: typeof def.condition === "function" ? def.condition : null,
    api,
  };

  achievementState.achievementMap.set(key, entry);
  achievementState.achievements.push(entry);
  renderAchievementUI();
}

export function unlockAchievement(api, id) {
  const key = `${api.mod.id}:${id}`;
  const entry = achievementState.achievementMap.get(key);
  if (!entry || entry.unlocked) return;
  entry.unlocked = true;
  markAchievementUnlocked(api.mod.id, id);
  if (window.GameUI?.notify?.success) {
    GameUI.notify.success(`Mod Achievement: ${entry.name}`);
  }
  renderAchievementUI();
}

export function registerStage(api, definition) {
  ensureStageSystem();
  const def = definition || {};
  if (!def.id || !def.name) throw new Error("Stage requires id and name");

  const key = `${api.mod.id}:${def.id}`;
  if (stageState.stageMap.has(key)) return;

  const unlocked = getStoredStageFlag(api.mod.id, def.id, "unlocked");
  const completed = getStoredStageFlag(api.mod.id, def.id, "completed");
  const entry = {
    id: def.id,
    name: def.name,
    description: def.description || "",
    modId: api.mod.id,
    unlocked,
    completed,
    unlockCondition: typeof def.unlockCondition === "function" ? def.unlockCondition : (() => true),
    completeCondition: typeof def.completeCondition === "function" ? def.completeCondition : null,
    onUnlock: typeof def.onUnlock === "function" ? def.onUnlock : null,
    onComplete: typeof def.onComplete === "function" ? def.onComplete : null,
    api,
  };

  stageState.stageMap.set(key, entry);
  stageState.stages.push(entry);
  renderStageUI();
}

export function unlockStage(api, id) {
  const key = `${api.mod.id}:${id}`;
  const entry = stageState.stageMap.get(key);
  if (!entry || entry.unlocked) return;
  entry.unlocked = true;
  setStoredStageFlag(api.mod.id, id, "unlocked");
  if (entry.onUnlock) {
    try {
      entry.onUnlock(api);
    } catch (error) {
      api?.logger?.error?.(`Stage unlock callback failed: ${id}`, error);
    }
  }
  renderStageUI();
}

export function completeStage(api, id) {
  const key = `${api.mod.id}:${id}`;
  const entry = stageState.stageMap.get(key);
  if (!entry || entry.completed) return;
  entry.unlocked = true;
  entry.completed = true;
  setStoredStageFlag(api.mod.id, id, "unlocked");
  setStoredStageFlag(api.mod.id, id, "completed");
  if (entry.onComplete) {
    try {
      entry.onComplete(api);
    } catch (error) {
      api?.logger?.error?.(`Stage completion callback failed: ${id}`, error);
    }
  }
  if (window.GameUI?.notify?.success) {
    GameUI.notify.success(`Mod Stage Complete: ${entry.name}`);
  }
  renderStageUI();
}

export function getStageState(api, id) {
  const key = `${api.mod.id}:${id}`;
  const entry = stageState.stageMap.get(key);
  if (!entry) return null;
  return {
    unlocked: entry.unlocked,
    completed: entry.completed,
  };
}

export function setGameSpeed(apiOrMultiplier, maybeMultiplier, maybeScope) {
  let source = "legacy";
  let multiplier = apiOrMultiplier;
  if (apiOrMultiplier && typeof apiOrMultiplier === "object" && apiOrMultiplier.mod?.id) {
    source = resolveSpeedSource(apiOrMultiplier, maybeScope);
    multiplier = maybeMultiplier;
  }
  const value = Number(multiplier);
  if (!Number.isFinite(value) || value <= 0) return;
  if (window.ModManager?.setGameSpeedMultiplier) {
    window.ModManager.setGameSpeedMultiplier(value, source);
  }
}

export function resetGameSpeed(apiOrScope = "legacy", maybeScope) {
  const source = resolveSpeedSource(apiOrScope, maybeScope);
  if (window.ModManager?.clearGameSpeedMultiplier) {
    window.ModManager.clearGameSpeedMultiplier(source);
  }
}

export function getGameSpeed() {
  if (window.ModManager?.getGameSpeedMultiplier) {
    return window.ModManager.getGameSpeedMultiplier();
  }
  return 1;
}

export async function withGameSpeed(apiOrMultiplier, maybeMultiplier, maybeFn, maybeScope) {
  const hasApi = apiOrMultiplier && typeof apiOrMultiplier === "object" && apiOrMultiplier.mod?.id;
  if (hasApi) {
    const api = apiOrMultiplier;
    const multiplier = maybeMultiplier;
    const fn = maybeFn;
    const scope = maybeScope || "temp";
    const source = resolveSpeedSource(api, scope);
    const current = getGameSpeed();
    setGameSpeed(api, multiplier, scope);
    try {
      return await fn();
    } finally {
      resetGameSpeed(source);
      if (!window.ModManager?.getGameSpeedMultiplier && window.ModManager?.setGameSpeedMultiplier) {
        window.ModManager.setGameSpeedMultiplier(current, source);
      }
    }
  }

  const multiplier = apiOrMultiplier;
  const fn = maybeMultiplier;
  const current = getGameSpeed();
  setGameSpeed(multiplier);
  try {
    return await fn();
  } finally {
    if (window.ModManager?.setGameSpeedMultiplier) {
      window.ModManager.setGameSpeedMultiplier(current, "legacy");
    }
  }
}

export function createSpeedController(api, scope = "default") {
  const source = resolveSpeedSource(api, scope);
  return Object.freeze({
    set(multiplier) {
      setGameSpeed(api, multiplier, scope);
    },
    reset() {
      resetGameSpeed(source);
    },
    get() {
      return getGameSpeed();
    },
  });
}

export function defineMod(definition) {
  return function register(api) {
    if (!definition || typeof definition !== "object") {
      throw new Error("defineMod requires a definition object");
    }

    const def = definition;

    if (Array.isArray(def.achievements)) {
      for (const ach of def.achievements) {
        registerAchievement(api, ach);
      }
    }

    if (Array.isArray(def.stages)) {
      for (const stage of def.stages) {
        registerStage(api, stage);
      }
    }

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

    return () => {
      if (typeof def.onUnload === "function") {
        try {
          def.onUnload(api);
        } catch (error) {
          api?.logger?.error?.("onUnload failed", error);
        }
      }
    };
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
