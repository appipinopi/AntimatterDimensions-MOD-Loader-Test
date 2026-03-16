import { DEV } from "@/env";

const MOD_LIST_URL = "mods/mods.json";
const MOD_API_VERSION = 1;

const HOOKS = {
  PRE_INIT: "preInit",
  POST_INIT: "postInit",
  GAME_LOAD: "gameLoad",
  TICK: "tick",
  UI_UPDATE: "uiUpdate",
};

function createLogger(modId, modName) {
  const prefix = `[Mod:${modId}${modName ? `:${modName}` : ""}]`;
  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

function safeCall(handler, mod, hook, args) {
  try {
    handler(...args);
  } catch (error) {
    mod.logger.error(`Hook failed (${hook})`, error);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: DEV ? "no-store" : "default" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

function resolveRegister(modModule) {
  if (typeof modModule?.default === "function") return modModule.default;
  if (typeof modModule?.register === "function") return modModule.register;
  if (typeof modModule?.default?.register === "function") return modModule.default.register;
  return null;
}

function createModApi(modMeta) {
  const logger = createLogger(modMeta.id, modMeta.name);
  const storagePrefix = `admod:${modMeta.id}:`;
  const storage = {
    get(key, fallback = undefined) {
      const raw = localStorage.getItem(storagePrefix + key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch (error) {
        logger.warn(`Failed to parse storage key: ${key}`, error);
        return fallback;
      }
    },
    set(key, value) {
      localStorage.setItem(storagePrefix + key, JSON.stringify(value));
    },
    remove(key) {
      localStorage.removeItem(storagePrefix + key);
    },
  };

  const hooks = {
    onPreInit(handler) {
      ModManager.registerHook(HOOKS.PRE_INIT, handler, modMeta, logger);
    },
    onInit(handler) {
      ModManager.registerHook(HOOKS.POST_INIT, handler, modMeta, logger);
    },
    onGameLoad(handler) {
      ModManager.registerHook(HOOKS.GAME_LOAD, handler, modMeta, logger);
    },
    onTick(handler) {
      ModManager.registerHook(HOOKS.TICK, handler, modMeta, logger);
    },
    onUIUpdate(handler) {
      ModManager.registerHook(HOOKS.UI_UPDATE, handler, modMeta, logger);
    },
  };

  const events = {
    onLogic(event, handler) {
      EventHub.logic.on(event, handler, modMeta.id);
    },
    onUI(event, handler) {
      EventHub.ui.on(event, handler, modMeta.id);
    },
    offAll() {
      EventHub.logic.offAll(modMeta.id);
      EventHub.ui.offAll(modMeta.id);
    },
  };

  const ui = {
    createContainer(suffix, parentSelector = "#ui") {
      const id = `mod-${modMeta.id}-${suffix}`;
      let container = document.getElementById(id);
      if (container) return container;
      const parent = document.querySelector(parentSelector) || document.body;
      container = document.createElement("div");
      container.id = id;
      parent.appendChild(container);
      return container;
    }
  };

  return Object.freeze({
    apiVersion: MOD_API_VERSION,
    mod: Object.freeze({
      id: modMeta.id,
      name: modMeta.name,
      version: modMeta.version,
      description: modMeta.description,
    }),
    logger,
    storage,
    hooks,
    events,
    ui,
  });
}

export const ModManager = {
  apiVersion: MOD_API_VERSION,
  loaded: false,
  mods: [],
  errors: [],
  _hooks: {
    [HOOKS.PRE_INIT]: [],
    [HOOKS.POST_INIT]: [],
    [HOOKS.GAME_LOAD]: [],
    [HOOKS.TICK]: [],
    [HOOKS.UI_UPDATE]: [],
  },
  _eventBridgeInstalled: false,

  registerHook(type, handler, modMeta, logger) {
    if (typeof handler !== "function") {
      logger.warn(`Hook registration ignored: ${type} is not a function`);
      return;
    }
    const hooks = this._hooks[type];
    if (!hooks) {
      logger.warn(`Hook registration ignored: unknown hook ${type}`);
      return;
    }
    hooks.push({ handler, modMeta, logger });
  },

  runHook(type, ...args) {
    const hooks = this._hooks[type];
    if (!hooks || hooks.length === 0) return;
    for (const hook of hooks) {
      safeCall(hook.handler, hook, type, args);
    }
  },

  _installEventBridge() {
    if (this._eventBridgeInstalled) return;
    EventHub.logic.on(GAME_EVENT.GAME_TICK_AFTER, () => this.runHook(HOOKS.TICK), "mod-manager");
    EventHub.ui.on(GAME_EVENT.UPDATE, () => this.runHook(HOOKS.UI_UPDATE), "mod-manager");
    EventHub.logic.on(GAME_EVENT.GAME_LOAD, () => this.runHook(HOOKS.GAME_LOAD), "mod-manager");
    this._eventBridgeInstalled = true;
  },

  async load() {
    if (this.loaded) return;
    this._installEventBridge();
    let modList;
    try {
      const listUrl = DEV ? `${MOD_LIST_URL}?t=${Date.now()}` : MOD_LIST_URL;
      modList = await fetchJson(listUrl);
    } catch (error) {
      console.warn("[ModManager] No mod list found or failed to load.", error);
      this.loaded = true;
      return;
    }

    if (!modList || !Array.isArray(modList.mods)) {
      console.warn("[ModManager] Invalid mod list format.");
      this.loaded = true;
      return;
    }

    const seen = new Set();
    for (const entry of modList.mods) {
      if (!entry || entry.enabled === false) continue;
      const id = entry.id;
      if (!id || typeof id !== "string") continue;
      if (seen.has(id)) {
        console.warn(`[ModManager] Duplicate mod id skipped: ${id}`);
        continue;
      }
      seen.add(id);
      await this._loadSingle(entry);
    }
    this.loaded = true;
  },

  async _loadSingle(entry) {
    const manifestUrl = entry.manifest || `mods/${entry.id}/manifest.json`;
    let manifest;
    try {
      const url = DEV ? `${manifestUrl}?t=${Date.now()}` : manifestUrl;
      manifest = await fetchJson(url);
    } catch (error) {
      console.warn(`[ModManager] Failed to load manifest for ${entry.id}.`, error);
      this.errors.push({ id: entry.id, error });
      return;
    }

    const modMeta = {
      id: manifest.id || entry.id,
      name: manifest.name || entry.id,
      version: manifest.version || "0.0.0",
      description: manifest.description || "",
      manifestUrl,
    };
    const logger = createLogger(modMeta.id, modMeta.name);

    if (manifest.apiVersion !== undefined && manifest.apiVersion !== MOD_API_VERSION) {
      logger.warn(`API version mismatch. Mod=${manifest.apiVersion} Loader=${MOD_API_VERSION}`);
    }

    const entryFile = manifest.entry || "main.js";
    const entryUrl = DEV
      ? `${new URL(entryFile, manifestUrl).toString()}?t=${Date.now()}`
      : new URL(entryFile, manifestUrl).toString();

    let modModule;
    try {
      modModule = await import(/* webpackIgnore: true */ entryUrl);
    } catch (error) {
      logger.error("Failed to import mod entry.", error);
      this.errors.push({ id: modMeta.id, error });
      return;
    }

    const register = resolveRegister(modModule);
    if (!register) {
      logger.warn("No register() function found in mod entry.");
      return;
    }

    const api = createModApi(modMeta);
    try {
      await Promise.resolve(register(api));
      this.mods.push({ ...modMeta, api, entryUrl, manifest });
      logger.info("Loaded");
    } catch (error) {
      logger.error("Mod registration failed.", error);
      this.errors.push({ id: modMeta.id, error });
    }
  },
};

window.ModManager = ModManager;
