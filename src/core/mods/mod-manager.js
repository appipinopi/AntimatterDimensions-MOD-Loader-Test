import JSZip from "jszip";
import { DEV } from "@/env";

const MOD_API_VERSION = 1;
const CONFIG_KEY = "admod:config";
const REPOSITORY_LIST_URL = "mods/repositories.json";
const SETTINGS_STORAGE_PREFIX = "admod:settings:";
const ZIP_STORAGE_DB = "admod";
const ZIP_STORAGE_STORE = "zip-mods";
const ZIP_STORAGE_KEY = "last";
const LEGACY_SPEED_SOURCE = "__legacy__";
const DEFAULT_CONFIG = Object.freeze({
  mode: "repository",
  zipUrl: "",
  disabledMods: [],
});

const SIZE_PRIORITY = Object.freeze({
  large: 0,
  medium: 1,
  small: 2,
});

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

function isAbsoluteUrl(value) {
  return /^[a-z][a-z0-9+.-]*:/iu.test(value);
}

function withCacheBust(url) {
  return DEV ? `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}` : url;
}

function resolveUrl(path, base) {
  return new URL(path, base).toString();
}

function ensureTrailingSlash(url) {
  if (!url) return url;
  return url.endsWith("/") ? url : `${url}/`;
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

function normalizeConfig(raw) {
  const next = { ...DEFAULT_CONFIG, ...(raw || {}) };
  // Legacy migration: "url" mode is now called "repository".
  if (next.mode === "url") next.mode = "repository";
  next.mode = next.mode === "zip" ? "zip" : "repository";
  next.zipUrl = typeof next.zipUrl === "string" ? next.zipUrl.trim() : "";
  next.disabledMods = Array.isArray(next.disabledMods)
    ? next.disabledMods.filter(id => typeof id === "string" && id.trim()).map(id => id.trim())
    : [];
  if ("listUrl" in next) delete next.listUrl;
  return next;
}

function normalizeRepositoryId(value, fallbackIndex = 0) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/giu, "-");
  }
  return `repository-${fallbackIndex + 1}`;
}

function normalizeStringList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(item => typeof item === "string" && item.trim())
    .map(item => item.trim());
}

function normalizeSettingType(type, fallbackValue = undefined) {
  if (typeof type === "string") {
    const normalized = type.trim().toLowerCase();
    if (normalized === "number" || normalized === "boolean" || normalized === "string" || normalized === "select") {
      return normalized;
    }
  }

  if (typeof fallbackValue === "boolean") return "boolean";
  if (typeof fallbackValue === "number") return "number";
  return "string";
}

function normalizeSettingOption(option, index) {
  if (option && typeof option === "object" && "value" in option) {
    return {
      value: option.value,
      label: typeof option.label === "string" && option.label.trim()
        ? option.label.trim()
        : String(option.value),
    };
  }
  return {
    value: option,
    label: String(option ?? `option-${index + 1}`),
  };
}

function normalizeManifestSettings(rawSettings) {
  if (!rawSettings) return [];

  const rows = [];
  if (Array.isArray(rawSettings)) {
    for (const item of rawSettings) {
      if (item && typeof item === "object") rows.push(item);
    }
  } else if (typeof rawSettings === "object") {
    for (const key of Object.keys(rawSettings)) {
      const item = rawSettings[key];
      if (item && typeof item === "object") rows.push({ key, ...item });
      else rows.push({ key, default: item });
    }
  }

  const settings = [];
  const usedKeys = new Set();
  for (const row of rows) {
    const key = typeof row.key === "string" && row.key.trim() ? row.key.trim() : "";
    if (!key || usedKeys.has(key)) continue;
    usedKeys.add(key);

    const type = normalizeSettingType(row.type, row.default);
    const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : key;
    const description = typeof row.description === "string" ? row.description.trim() : "";
    const required = row.required === true;

    let defaultValue = row.default;
    let options = [];
    if (type === "boolean") {
      if (defaultValue !== undefined) defaultValue = Boolean(defaultValue);
    } else if (type === "number") {
      if (defaultValue !== undefined) {
        const numeric = Number(defaultValue);
        defaultValue = Number.isFinite(numeric) ? numeric : undefined;
      }
    } else if (type === "string") {
      if (defaultValue !== undefined && defaultValue !== null) defaultValue = String(defaultValue);
    } else if (type === "select") {
      const rawOptions = Array.isArray(row.options) ? row.options : [];
      options = rawOptions
        .map((option, index) => normalizeSettingOption(option, index))
        .filter(option => option.label && option.value !== undefined);
      if (defaultValue === undefined && options.length > 0) {
        defaultValue = options[0].value;
      }
    }

    const setting = {
      key,
      type,
      label,
      description,
      required,
      defaultValue,
    };

    if (type === "number") {
      if (Number.isFinite(Number(row.min))) setting.min = Number(row.min);
      if (Number.isFinite(Number(row.max))) setting.max = Number(row.max);
      if (Number.isFinite(Number(row.step)) && Number(row.step) > 0) setting.step = Number(row.step);
    }
    if (type === "select") setting.options = options;

    settings.push(setting);
  }

  return settings;
}

function isSettingMissing(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function normalizeModSize(size) {
  if (typeof size !== "string") return "medium";
  const normalized = size.trim().toLowerCase();
  if (normalized === "large" || normalized === "medium" || normalized === "small") return normalized;
  return "medium";
}

function inferModSizeFromId(modId) {
  if (typeof modId !== "string") return "medium";
  const normalized = modId.trim().toLowerCase();
  if (normalized.startsWith("large-") || normalized.startsWith("large_")) return "large";
  if (normalized.startsWith("small-") || normalized.startsWith("small_")) return "small";
  if (normalized.startsWith("medium-") || normalized.startsWith("medium_")) return "medium";
  return "medium";
}

function resolveModSize(primarySize, modId, secondarySize = undefined) {
  if (typeof primarySize === "string" && primarySize.trim()) return normalizeModSize(primarySize);
  if (typeof secondarySize === "string" && secondarySize.trim()) return normalizeModSize(secondarySize);
  return inferModSizeFromId(modId);
}

function normalizeDependencyList(manifest) {
  const required = [];
  const optional = [];
  const loadAfter = [];
  const pushDep = (value, isOptional = false) => {
    if (typeof value !== "string" || !value.trim()) return;
    const id = value.trim();
    (isOptional ? optional : required).push(id);
  };

  if (Array.isArray(manifest?.dependencies)) {
    for (const dep of manifest.dependencies) {
      if (typeof dep === "string") pushDep(dep, false);
      else if (dep && typeof dep === "object") {
        pushDep(dep.id, dep.optional === true);
      }
    }
  }

  if (Array.isArray(manifest?.requiredPlugins)) {
    for (const dep of manifest.requiredPlugins) {
      if (typeof dep === "string") pushDep(dep, false);
      else if (dep && typeof dep === "object") pushDep(dep.id, false);
    }
  }

  if (Array.isArray(manifest?.optionalDependencies)) {
    for (const dep of manifest.optionalDependencies) {
      if (typeof dep === "string") pushDep(dep, true);
      else if (dep && typeof dep === "object") pushDep(dep.id, true);
    }
  }

  if (Array.isArray(manifest?.loadAfter)) {
    for (const dep of manifest.loadAfter) {
      if (typeof dep === "string" && dep.trim()) loadAfter.push(dep.trim());
      else if (dep && typeof dep === "object" && typeof dep.id === "string" && dep.id.trim()) {
        loadAfter.push(dep.id.trim());
      }
    }
  }

  return {
    required: Array.from(new Set(required)),
    optional: Array.from(new Set(optional)).filter(id => !required.includes(id)),
    loadAfter: Array.from(new Set(loadAfter)).filter(id => !required.includes(id)),
  };
}

function openZipStorage() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB is not available"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ZIP_STORAGE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ZIP_STORAGE_STORE)) {
        db.createObjectStore(ZIP_STORAGE_STORE);
      }
    };
    request.onerror = () => reject(request.error || new Error("Failed to open zip storage"));
    request.onsuccess = () => resolve(request.result);
  });
}

async function loadStoredZipEntry() {
  const db = await openZipStorage();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ZIP_STORAGE_STORE, "readonly");
    const store = tx.objectStore(ZIP_STORAGE_STORE);
    const request = store.get(ZIP_STORAGE_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve(request.result || null);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Failed to read zip storage"));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Zip storage transaction aborted"));
    };
  });
}

async function saveStoredZipEntry(entry) {
  const db = await openZipStorage();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ZIP_STORAGE_STORE, "readwrite");
    const store = tx.objectStore(ZIP_STORAGE_STORE);
    store.put(entry, ZIP_STORAGE_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Failed to write zip storage"));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Zip storage transaction aborted"));
    };
  });
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

  const gameSpeed = {
    set(multiplier, scope = "default") {
      ModManager.setGameSpeedMultiplier(multiplier, `${modMeta.id}:${scope}`);
    },
    reset(scope = "default") {
      ModManager.clearGameSpeedMultiplier(`${modMeta.id}:${scope}`);
    },
    get() {
      return ModManager.getGameSpeedMultiplier();
    }
  };

  const settings = {
    get(key, fallback = undefined) {
      return ModManager.getModSetting(modMeta.id, key, fallback);
    },
    set(key, value) {
      return ModManager.setModSetting(modMeta.id, key, value);
    },
    getAll() {
      return ModManager.getModSettings(modMeta.id);
    },
    getSchema() {
      return ModManager.getModSettingsSchema(modMeta.id);
    },
    onChange(handler) {
      return ModManager.registerSettingsListener(modMeta.id, handler);
    },
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
    gameSpeed,
    settings,
  });
}

function stripLeadingSlash(value) {
  return value.replace(/^[\\/]+/gu, "");
}

function normalizeZipPath(value) {
  return stripLeadingSlash(value.replace(/\\/gu, "/"));
}

function inferIdFromManifestPath(path) {
  const normalized = normalizeZipPath(path);
  const parts = normalized.split("/");
  if (parts.length >= 2) return parts[parts.length - 2];
  return "mod";
}

function zipDirname(path) {
  const normalized = normalizeZipPath(path);
  const index = normalized.lastIndexOf("/");
  if (index === -1) return "";
  return normalized.slice(0, index + 1);
}

function resolveZipPath(basePath, relPath) {
  if (isAbsoluteUrl(relPath)) return relPath;
  const rel = normalizeZipPath(relPath);
  if (relPath.startsWith("/")) return rel;
  const baseDir = zipDirname(basePath);
  return normalizeZipPath(`${baseDir}${rel}`);
}

class ZipSource {
  constructor(zip) {
    this.zip = zip;
    this.blobUrls = new Map();
  }

  static async fromArrayBuffer(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    return new ZipSource(zip);
  }

  static async fromUrl(url) {
    const response = await fetch(url, { cache: DEV ? "no-store" : "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const buffer = await response.arrayBuffer();
    return ZipSource.fromArrayBuffer(buffer);
  }

  getFile(path) {
    const normalized = normalizeZipPath(path);
    const file = this.zip.file(normalized);
    if (!file) throw new Error(`Missing file in zip: ${normalized}`);
    return file;
  }

  async getText(path) {
    return this.getFile(path).async("text");
  }

  async getJson(path) {
    const text = await this.getText(path);
    return JSON.parse(text);
  }

  async getBlobUrl(path, mime = "text/javascript") {
    const normalized = normalizeZipPath(path);
    if (this.blobUrls.has(normalized)) return this.blobUrls.get(normalized);
    const data = await this.getFile(normalized).async("uint8array");
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    this.blobUrls.set(normalized, url);
    return url;
  }

  revokeAll() {
    for (const url of this.blobUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls.clear();
  }
}

export const ModManager = {
  apiVersion: MOD_API_VERSION,
  loaded: false,
  mods: [],
  errors: [],
  _gameSpeedMultipliers: new Map(),
  _hooks: {
    [HOOKS.PRE_INIT]: [],
    [HOOKS.POST_INIT]: [],
    [HOOKS.GAME_LOAD]: [],
    [HOOKS.TICK]: [],
    [HOOKS.UI_UPDATE]: [],
  },
  _eventBridgeInstalled: false,
  _zipSource: null,
  _settingsListeners: new Map(),
  availableMods: new Map(),
  repositories: [],
  repositoryTopicSearchUrl: "",

  setGameSpeedMultiplier(value, sourceId = LEGACY_SPEED_SOURCE) {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) return;
    this._gameSpeedMultipliers.set(String(sourceId || LEGACY_SPEED_SOURCE), next);
  },

  clearGameSpeedMultiplier(sourceId = LEGACY_SPEED_SOURCE) {
    this._gameSpeedMultipliers.delete(String(sourceId || LEGACY_SPEED_SOURCE));
  },

  getGameSpeedMultiplier() {
    let result = 1;
    for (const value of this._gameSpeedMultipliers.values()) {
      result *= value;
    }
    return result;
  },

  getConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return normalizeConfig(raw ? JSON.parse(raw) : undefined);
    } catch (error) {
      console.warn("[ModManager] Failed to read config.", error);
      return { ...DEFAULT_CONFIG };
    }
  },

  setConfig(partial) {
    const next = normalizeConfig({ ...this.getConfig(), ...(partial || {}) });
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    return next;
  },

  isModDisabled(id) {
    return this.getConfig().disabledMods.includes(id);
  },

  setModDisabled(id, disabled) {
    const config = this.getConfig();
    const set = new Set(config.disabledMods || []);
    if (disabled) set.add(id);
    else set.delete(id);
    return this.setConfig({ disabledMods: Array.from(set) });
  },

  getAvailableMods() {
    return Array.from(this.availableMods.values()).map(info => ({
      ...info,
      sources: Array.from(info.sources || []),
      repositoryIds: Array.from(info.repositoryIds || []),
      repositoryNames: Array.from(info.repositoryNames || []),
      settingsSchema: Array.isArray(info.settingsSchema) ? info.settingsSchema.map(item => ({ ...item })) : [],
      requiredSettingsMissing: Array.isArray(info.requiredSettingsMissing) ? [...info.requiredSettingsMissing] : [],
      enabled: !this.isModDisabled(info.id),
    }));
  },

  getRepositories() {
    return this.repositories.map(repo => ({ ...repo }));
  },

  getRepositoryTopicSearchUrl() {
    return this.repositoryTopicSearchUrl || "";
  },

  _getSettingsStorageKey(modId) {
    return `${SETTINGS_STORAGE_PREFIX}${modId}`;
  },

  _readModSettingsRaw(modId) {
    if (!modId) return {};
    try {
      const raw = localStorage.getItem(this._getSettingsStorageKey(modId));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return parsed;
    } catch (error) {
      console.warn(`[ModManager] Failed to read settings for ${modId}`, error);
      return {};
    }
  },

  _writeModSettingsRaw(modId, values) {
    if (!modId) return;
    try {
      localStorage.setItem(this._getSettingsStorageKey(modId), JSON.stringify(values || {}));
    } catch (error) {
      console.warn(`[ModManager] Failed to save settings for ${modId}`, error);
    }
  },

  _coerceSettingValue(schema, value) {
    if (!schema) return value;
    if (value === undefined || value === null) return undefined;
    switch (schema.type) {
      case "boolean":
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
          const normalized = value.trim().toLowerCase();
          if (normalized === "true" || normalized === "1" || normalized === "on") return true;
          if (normalized === "false" || normalized === "0" || normalized === "off") return false;
        }
        return Boolean(value);
      case "number": {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return undefined;
        if (Number.isFinite(schema.min) && numeric < schema.min) return schema.min;
        if (Number.isFinite(schema.max) && numeric > schema.max) return schema.max;
        return numeric;
      }
      case "select": {
        const options = Array.isArray(schema.options) ? schema.options : [];
        if (options.length === 0) return value;
        const match = options.find(option => String(option.value) === String(value));
        return match ? match.value : undefined;
      }
      case "string":
      default:
        return String(value);
    }
  },

  _buildSettingsState(modId, schemaInput = undefined) {
    const schema = (schemaInput || this.getModSettingsSchema(modId)).map(item => ({ ...item }));
    const schemaMap = new Map(schema.map(item => [item.key, item]));
    const raw = this._readModSettingsRaw(modId);
    const values = {};

    for (const field of schema) {
      const hasStored = Object.prototype.hasOwnProperty.call(raw, field.key);
      const candidate = hasStored ? raw[field.key] : field.defaultValue;
      const coerced = this._coerceSettingValue(field, candidate);
      if (coerced !== undefined) values[field.key] = coerced;
    }

    for (const key of Object.keys(raw)) {
      if (schemaMap.has(key)) continue;
      values[key] = raw[key];
    }

    const missingRequired = schema
      .filter(field => field.required)
      .map(field => field.key)
      .filter(key => isSettingMissing(values[key]));

    return {
      modId,
      schema,
      values,
      missingRequired,
      valid: missingRequired.length === 0,
    };
  },

  getModSettingsSchema(modId) {
    if (!modId) return [];
    const info = this.availableMods.get(modId);
    if (info && Array.isArray(info.settingsSchema)) {
      return info.settingsSchema.map(item => ({ ...item }));
    }
    const loaded = this.mods.find(mod => mod.id === modId);
    if (loaded?.manifest?.settings) {
      return normalizeManifestSettings(loaded.manifest.settings);
    }
    return [];
  },

  getModSettingsState(modId) {
    return this._buildSettingsState(modId);
  },

  getModSettings(modId) {
    return this._buildSettingsState(modId).values;
  },

  getModSetting(modId, key, fallback = undefined) {
    const state = this._buildSettingsState(modId);
    if (!Object.prototype.hasOwnProperty.call(state.values, key)) return fallback;
    const value = state.values[key];
    return value === undefined ? fallback : value;
  },

  setModSettings(modId, updates) {
    if (!modId || !updates || typeof updates !== "object") {
      return this._buildSettingsState(modId);
    }
    const schema = this.getModSettingsSchema(modId);
    const schemaMap = new Map(schema.map(item => [item.key, item]));
    const raw = this._readModSettingsRaw(modId);

    for (const key of Object.keys(updates)) {
      const schemaField = schemaMap.get(key);
      const incoming = updates[key];
      if (incoming === undefined || incoming === null || incoming === "") {
        delete raw[key];
        continue;
      }
      const coerced = this._coerceSettingValue(schemaField, incoming);
      if (coerced === undefined) {
        delete raw[key];
        continue;
      }
      raw[key] = coerced;
    }

    this._writeModSettingsRaw(modId, raw);
    const state = this._buildSettingsState(modId, schema);
    const info = this.availableMods.get(modId);
    if (info) {
      info.requiredSettingsMissing = [...state.missingRequired];
      this.availableMods.set(modId, info);
    }
    this._emitSettingsChanged(modId, state);
    return state;
  },

  setModSetting(modId, key, value) {
    return this.setModSettings(modId, { [key]: value });
  },

  resetModSettings(modId) {
    if (!modId) return this._buildSettingsState(modId);
    localStorage.removeItem(this._getSettingsStorageKey(modId));
    const state = this._buildSettingsState(modId);
    const info = this.availableMods.get(modId);
    if (info) {
      info.requiredSettingsMissing = [...state.missingRequired];
      this.availableMods.set(modId, info);
    }
    this._emitSettingsChanged(modId, state);
    return state;
  },

  registerSettingsListener(modId, handler) {
    if (!modId || typeof handler !== "function") return () => {};
    const key = String(modId);
    let listeners = this._settingsListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this._settingsListeners.set(key, listeners);
    }
    listeners.add(handler);
    return () => {
      const current = this._settingsListeners.get(key);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this._settingsListeners.delete(key);
    };
  },

  _emitSettingsChanged(modId, state = undefined) {
    const listeners = this._settingsListeners.get(String(modId));
    if (!listeners || listeners.size === 0) return;
    const payload = state || this._buildSettingsState(modId);
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        console.warn(`[ModManager] Settings listener failed for ${modId}`, error);
      }
    }
  },

  resetHooks() {
    this._hooks = {
      [HOOKS.PRE_INIT]: [],
      [HOOKS.POST_INIT]: [],
      [HOOKS.GAME_LOAD]: [],
      [HOOKS.TICK]: [],
      [HOOKS.UI_UPDATE]: [],
    };
  },

  unload() {
    const transientZipSources = new Set();
    for (const mod of this.mods) {
      if (typeof mod.unload === "function") {
        try {
          mod.unload();
        } catch (error) {
          mod.logger?.error?.("Mod unload callback failed.", error);
        }
      }
      if (mod.api?.events) mod.api.events.offAll();
      if (window.ModCommon?.unregisterModRuntime) {
        try {
          window.ModCommon.unregisterModRuntime(mod.id);
        } catch (error) {
          console.warn(`[ModManager] Failed to unregister runtime for ${mod.id}`, error);
        }
      }
      this._settingsListeners.delete(String(mod.id));
      if (mod.zipSource && mod.zipSource !== this._zipSource) {
        transientZipSources.add(mod.zipSource);
      }
    }
    for (const source of transientZipSources) {
      try {
        source.revokeAll();
      } catch (error) {
        console.warn("[ModManager] Failed to release zip source.", error);
      }
    }
    this.mods = [];
    this.errors = [];
    this._gameSpeedMultipliers.clear();
    this.resetHooks();
  },

  async reload() {
    this.unload();
    this.loaded = false;
    await this.load();
  },

  async loadZipFile(file) {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const source = await ZipSource.fromArrayBuffer(buffer);
    this._setZipSource(source);
    await this._storeZipLocally(file, file.name || "local.zip");
    await this.reload();
  },

  async loadZipUrl(url) {
    if (!url) return;
    const response = await fetch(withCacheBust(url), { cache: DEV ? "no-store" : "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const buffer = await response.arrayBuffer();
    const source = await ZipSource.fromArrayBuffer(buffer);
    this._setZipSource(source);
    await this._storeZipLocally(new Blob([buffer]), url);
    await this.reload();
  },

  _setZipSource(source) {
    if (this._zipSource && this._zipSource !== source) {
      this._zipSource.revokeAll();
    }
    this._zipSource = source;
  },

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
    this.availableMods = new Map();
    this.repositories = [];
    this.repositoryTopicSearchUrl = "";

    const config = this.getConfig();
    if (config.mode === "zip") {
      await this._loadFromZipConfig(config);
      this.loaded = true;
      return;
    }

    await this._loadFromRepositoryConfig();
    this.loaded = true;
  },

  async _loadFromRepositoryConfig() {
    const seen = new Set();
    const repositoryListUrl = resolveUrl(REPOSITORY_LIST_URL, window.location.href);
    const { repositories, topicSearchUrl } = await this._loadRepositoryEntries(repositoryListUrl);
    this.repositories = repositories;
    this.repositoryTopicSearchUrl = topicSearchUrl || "";
    for (const repository of repositories) {
      if (!repository.enabled) continue;
      await this._loadListFromUrl(repository.listUrl, seen, repository);
    }
  },

  async _loadRepositoryEntries(listUrl) {
    let data;
    try {
      data = await fetchJson(withCacheBust(listUrl));
    } catch (error) {
      return { repositories: [], topicSearchUrl: "" };
    }

    let rawEntries = [];
    if (Array.isArray(data)) rawEntries = data;
    else if (Array.isArray(data?.repositories)) rawEntries = data.repositories;
    else if (Array.isArray(data?.repos)) rawEntries = data.repos;
    else if (Array.isArray(data?.cors)) rawEntries = data.cors;
    else if (Array.isArray(data?.cdns)) rawEntries = data.cdns;
    else if (data?.repository) rawEntries = [data.repository];

    let topicSearchUrl = "";
    if (data && typeof data === "object") {
      const rawTopicUrl = typeof data.topicSearchUrl === "string" ? data.topicSearchUrl : (
        typeof data.searchTopicUrl === "string" ? data.searchTopicUrl : (
          typeof data.topicUrl === "string" ? data.topicUrl : ""
        )
      );
      topicSearchUrl = rawTopicUrl.trim();
    }

    const repositories = [];
    const usedIds = new Set();

    for (let index = 0; index < rawEntries.length; index++) {
      const entry = rawEntries[index];
      let idSource = "";
      let name = "";
      let description = "";
      let homepage = "";
      let listPath = "";
      let enabled = true;
      let tags = [];

      if (typeof entry === "string") {
        const value = entry.trim();
        if (!value) continue;
        if (value.endsWith(".json")) listPath = value;
        else listPath = `${ensureTrailingSlash(value)}mods.json`;
        idSource = value;
        name = value;
        homepage = value;
      } else if (entry && typeof entry === "object") {
        enabled = entry.enabled !== false;
        description = typeof entry.description === "string" ? entry.description.trim() : "";
        tags = normalizeStringList(entry.tags);
        const rawList = typeof entry.listUrl === "string" ? entry.listUrl : (
          typeof entry.list === "string" ? entry.list : (
            typeof entry.modsUrl === "string" ? entry.modsUrl : (
              typeof entry.mods === "string" ? entry.mods : (
                typeof entry.modList === "string" ? entry.modList : ""
              )
            )
          )
        );
        let rawBase = typeof entry.baseUrl === "string" ? entry.baseUrl : (
          typeof entry.base === "string" ? entry.base : (
            typeof entry.repositoryUrl === "string" ? entry.repositoryUrl : (
              typeof entry.repository === "string" ? entry.repository : (
                typeof entry.rootUrl === "string" ? entry.rootUrl : ""
              )
            )
          )
        );
        const rawUrl = typeof entry.url === "string" ? entry.url.trim() : "";
        if (!rawBase && !rawList && rawUrl) {
          if (rawUrl.endsWith(".json")) listPath = rawUrl;
          else rawBase = rawUrl;
        }
        if (!listPath && rawList?.trim()) listPath = rawList.trim();
        if (!listPath && rawBase?.trim()) {
          listPath = `${ensureTrailingSlash(rawBase.trim())}mods.json`;
        }
        homepage = typeof entry.homepage === "string" && entry.homepage.trim()
          ? entry.homepage.trim()
          : (typeof entry.repo === "string" && entry.repo.trim()
            ? entry.repo.trim()
            : (rawBase || rawUrl || listPath));
        idSource = entry.id || entry.slug || entry.name || rawBase || rawList || rawUrl || listPath;
        name = typeof entry.name === "string" && entry.name.trim()
          ? entry.name.trim()
          : normalizeRepositoryId(idSource || "", index);
      }

      if (!listPath) continue;

      let id = normalizeRepositoryId(idSource, index);
      while (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);

      repositories.push({
        id,
        name,
        description,
        homepage,
        tags,
        enabled,
        listUrl: resolveUrl(listPath, listUrl),
        status: enabled ? "pending" : "disabled",
        error: "",
        modCount: 0,
      });
    }

    return { repositories, topicSearchUrl };
  },

  async _loadListFromUrl(listUrl, seen, repository = undefined) {
    let modList;
    try {
      modList = await fetchJson(withCacheBust(listUrl));
    } catch (error) {
      console.warn(`[ModManager] No mod list found or failed to load. (${listUrl})`, error);
      if (repository) {
        repository.status = "error";
        repository.error = error.message || "Failed to fetch";
      }
      return;
    }

    if (!modList || !Array.isArray(modList.mods)) {
      console.warn(`[ModManager] Invalid mod list format. (${listUrl})`);
      if (repository) {
        repository.status = "error";
        repository.error = "Invalid mod list format";
      }
      return;
    }

    if (repository) {
      repository.status = "loaded";
      repository.error = "";
      repository.modCount = 0;
    }

    const candidates = [];
    for (const entry of modList.mods) {
      if (!entry || entry.enabled === false) continue;
      const id = entry.id;
      if (!id || typeof id !== "string") continue;
      this._registerAvailableEntry(entry, repository || listUrl);
      if (repository) repository.modCount++;
      if (seen.has(id)) {
        console.warn(`[ModManager] Duplicate mod id skipped: ${id}`);
        continue;
      }
      seen.add(id);
      if (this.isModDisabled(id)) continue;
      const hasZipSource = typeof entry.zip === "string" && entry.zip.trim();
      const candidate = hasZipSource
        ? await this._buildRemoteZipCandidate(entry, listUrl, repository)
        : await this._buildUrlCandidate(entry, listUrl, repository);
      if (candidate) candidates.push(candidate);
    }
    await this._loadPreparedCandidates(candidates);
  },

  async _buildRemoteZipCandidate(entry, listUrl, repository = undefined) {
    const zipPath = typeof entry.zip === "string" ? entry.zip.trim() : "";
    if (!zipPath) return null;
    const zipUrl = resolveUrl(zipPath, listUrl);
    let source;
    try {
      source = await ZipSource.fromUrl(withCacheBust(zipUrl));
    } catch (error) {
      const id = entry.id || zipPath;
      console.warn(`[ModManager] Failed to load zip source for ${id}.`, error);
      this.errors.push({ id, error });
      return null;
    }

    const zipEntry = {
      ...entry,
      id: entry.id || undefined,
      manifest: entry.manifest || "manifest.json",
    };
    const candidate = await this._buildZipCandidate(zipEntry, source, repository, zipUrl);
    if (!candidate) {
      source.revokeAll();
      return null;
    }
    return candidate;
  },

  async _loadFromZipConfig(config) {
    let source = this._zipSource;
    if (!source && config.zipUrl) {
      try {
        source = await ZipSource.fromUrl(withCacheBust(config.zipUrl));
      } catch (error) {
        console.warn("[ModManager] Failed to load zip from URL.", error);
      }
    }

    if (!source) {
      source = await this._loadStoredZipSource();
    }

    if (!source) {
      console.warn("[ModManager] ZIP mode enabled but no zip source is available.");
      return;
    }

    this._setZipSource(source);

    let modList;
    try {
      modList = await source.getJson("mods.json");
    } catch (error) {
      modList = await this._buildZipListFromManifest(source);
      if (!modList) {
        console.warn("[ModManager] Failed to read mods.json from zip.", error);
        return;
      }
    }

    if (!modList || !Array.isArray(modList.mods)) {
      console.warn("[ModManager] Invalid mod list format in zip.");
      return;
    }

    const seen = new Set();
    const candidates = [];
    for (const entry of modList.mods) {
      if (!entry || entry.enabled === false) continue;
      const id = entry.id;
      if (!id || typeof id !== "string") continue;
      this._registerAvailableEntry(entry, "zip://mods.json");
      if (seen.has(id)) {
        console.warn(`[ModManager] Duplicate mod id skipped: ${id}`);
        continue;
      }
      seen.add(id);
      if (this.isModDisabled(id)) continue;
      const candidate = await this._buildZipCandidate(entry, source);
      if (candidate) candidates.push(candidate);
    }
    await this._loadPreparedCandidates(candidates);
  },

  async _buildUrlCandidate(entry, listUrl, repository = undefined) {
    const manifestPath = entry.manifest || `mods/${entry.id}/manifest.json`;
    const manifestUrl = resolveUrl(manifestPath, listUrl);
    let manifest;
    try {
      manifest = await fetchJson(withCacheBust(manifestUrl));
    } catch (error) {
      console.warn(`[ModManager] Failed to load manifest for ${entry.id}.`, error);
      this.errors.push({ id: entry.id, error });
      return null;
    }

    const settingsSchema = normalizeManifestSettings(manifest.settings);
    const settingsState = this._buildSettingsState(manifest.id || entry.id, settingsSchema);
    const modMeta = {
      id: manifest.id || entry.id,
      name: manifest.name || entry.id,
      version: manifest.version || "0.0.0",
      description: manifest.description || "",
      manifestUrl,
      size: resolveModSize(manifest.modSize || manifest.size, manifest.id || entry.id, entry.size),
      dependencies: normalizeDependencyList(manifest),
      author: manifest.author || "",
      tags: Array.isArray(manifest.tags) ? manifest.tags.filter(tag => typeof tag === "string") : [],
      repo: manifest.repo || manifest.homepage || "",
      affectsStyle: manifest.affectsStyle === true,
      affectsGameplay: manifest.affectsGameplay === true || manifest.affectsBlocks === true,
      repositoryId: repository?.id || "",
      repositoryName: repository?.name || "",
      settingsSchema,
      requiredSettingsMissing: settingsState.missingRequired,
    };
    this._updateAvailableMeta(modMeta);
    if (!settingsState.valid) {
      this.errors.push({
        id: modMeta.id,
        error: new Error(`Required settings missing: ${settingsState.missingRequired.join(", ")}`),
      });
      return null;
    }
    const dependencies = normalizeDependencyList(manifest);
    const size = resolveModSize(manifest.modSize || manifest.size, manifest.id || entry.id, entry.size);

    return {
      id: modMeta.id,
      size,
      requiredDeps: dependencies.required,
      optionalDeps: dependencies.optional,
      loadAfterDeps: dependencies.loadAfter,
      load: () => this._loadSingleFromUrl(entry, listUrl, manifest, manifestUrl, repository),
    };
  },

  async _buildZipCandidate(entry, source, repository = undefined, sourceLabel = "ZIP Archive") {
    const manifestPath = normalizeZipPath(entry.manifest || `mods/${entry.id}/manifest.json`);
    let manifest;
    try {
      manifest = await source.getJson(manifestPath);
    } catch (error) {
      console.warn(`[ModManager] Failed to load manifest for ${entry.id} from zip.`, error);
      this.errors.push({ id: entry.id, error });
      return null;
    }

    const settingsSchema = normalizeManifestSettings(manifest.settings);
    const settingsState = this._buildSettingsState(manifest.id || entry.id, settingsSchema);
    const modMeta = {
      id: manifest.id || entry.id,
      name: manifest.name || entry.id,
      version: manifest.version || "0.0.0",
      description: manifest.description || "",
      manifestUrl: manifestPath,
      size: resolveModSize(manifest.modSize || manifest.size, manifest.id || entry.id, entry.size),
      dependencies: normalizeDependencyList(manifest),
      author: manifest.author || "",
      tags: Array.isArray(manifest.tags) ? manifest.tags.filter(tag => typeof tag === "string") : [],
      repo: manifest.repo || manifest.homepage || "",
      affectsStyle: manifest.affectsStyle === true,
      affectsGameplay: manifest.affectsGameplay === true || manifest.affectsBlocks === true,
      repositoryId: repository?.id || "zip://mods.json",
      repositoryName: repository?.name || sourceLabel,
      settingsSchema,
      requiredSettingsMissing: settingsState.missingRequired,
    };
    this._updateAvailableMeta(modMeta);
    if (!settingsState.valid) {
      this.errors.push({
        id: modMeta.id,
        error: new Error(`Required settings missing: ${settingsState.missingRequired.join(", ")}`),
      });
      return null;
    }
    const dependencies = normalizeDependencyList(manifest);
    const size = resolveModSize(manifest.modSize || manifest.size, manifest.id || entry.id, entry.size);

    return {
      id: modMeta.id,
      size,
      requiredDeps: dependencies.required,
      optionalDeps: dependencies.optional,
      loadAfterDeps: dependencies.loadAfter,
      load: () => this._loadSingleFromZip(entry, source, manifest, manifestPath, repository, sourceLabel),
    };
  },

  async _loadPreparedCandidates(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return;

    const loadedIds = new Set(this.mods.map(mod => mod.id));
    const pending = new Map();

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (!candidate?.id) continue;
      if (pending.has(candidate.id) || loadedIds.has(candidate.id)) {
        console.warn(`[ModManager] Duplicate prepared mod id skipped: ${candidate.id}`);
        continue;
      }
      pending.set(candidate.id, { ...candidate, order: i });
    }

    while (pending.size > 0) {
      const ready = [];
      for (const candidate of pending.values()) {
        const missingRequired = candidate.requiredDeps
          .filter(dep => !loadedIds.has(dep) && !pending.has(dep));
        if (missingRequired.length > 0) {
          this.errors.push({
            id: candidate.id,
            error: new Error(`Missing required dependency: ${missingRequired.join(", ")}`)
          });
          pending.delete(candidate.id);
          continue;
        }
        const requiredSatisfied = candidate.requiredDeps.every(dep => loadedIds.has(dep));
        const loadAfterReady = (candidate.loadAfterDeps || []).every(dep => loadedIds.has(dep) || !pending.has(dep));
        if (requiredSatisfied && loadAfterReady) ready.push(candidate);
      }

      if (ready.length === 0) {
        for (const candidate of pending.values()) {
          const unmet = candidate.requiredDeps.filter(dep => !loadedIds.has(dep));
          this.errors.push({
            id: candidate.id,
            error: new Error(`Dependency cycle or unresolved dependency: ${unmet.join(", ") || "unknown"}`)
          });
        }
        break;
      }

      ready.sort((a, b) => {
        const sizeA = SIZE_PRIORITY[a.size] ?? SIZE_PRIORITY.medium;
        const sizeB = SIZE_PRIORITY[b.size] ?? SIZE_PRIORITY.medium;
        if (sizeA !== sizeB) return sizeA - sizeB;
        return a.order - b.order;
      });

      for (const candidate of ready) {
        pending.delete(candidate.id);
        await candidate.load();
        if (this.mods.some(mod => mod.id === candidate.id)) {
          loadedIds.add(candidate.id);
        }
      }
    }
  },

  async _loadSingleFromUrl(
    entry,
    listUrl,
    preparedManifest = undefined,
    preparedManifestUrl = undefined,
    repository = undefined
  ) {
    const manifestPath = entry.manifest || `mods/${entry.id}/manifest.json`;
    const manifestUrl = preparedManifestUrl || resolveUrl(manifestPath, listUrl);

    let manifest = preparedManifest;
    if (!manifest) {
      try {
        manifest = await fetchJson(withCacheBust(manifestUrl));
      } catch (error) {
        console.warn(`[ModManager] Failed to load manifest for ${entry.id}.`, error);
        this.errors.push({ id: entry.id, error });
        return;
      }
    }

    const settingsSchema = normalizeManifestSettings(manifest.settings);
    const settingsState = this._buildSettingsState(manifest.id || entry.id, settingsSchema);
    const modMeta = {
      id: manifest.id || entry.id,
      name: manifest.name || entry.id,
      version: manifest.version || "0.0.0",
      description: manifest.description || "",
      manifestUrl,
      repositoryId: repository?.id || "",
      repositoryName: repository?.name || "",
      settingsSchema,
      requiredSettingsMissing: settingsState.missingRequired,
    };
    this._updateAvailableMeta(modMeta);
    if (!settingsState.valid) {
      this.errors.push({
        id: modMeta.id,
        error: new Error(`Required settings missing: ${settingsState.missingRequired.join(", ")}`),
      });
      return;
    }
    const logger = createLogger(modMeta.id, modMeta.name);

    if (manifest.apiVersion !== undefined && manifest.apiVersion !== MOD_API_VERSION) {
      logger.warn(`API version mismatch. Mod=${manifest.apiVersion} Loader=${MOD_API_VERSION}`);
    }

    const entryFile = manifest.entry || "main.js";
    const entryUrl = resolveUrl(entryFile, manifestUrl);
    const entryUrlWithCache = withCacheBust(entryUrl);

    let modModule;
    try {
      modModule = await import(/* webpackIgnore: true */ entryUrlWithCache);
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
      const unloadCallback = await Promise.resolve(register(api));
      const unload = typeof unloadCallback === "function"
        ? unloadCallback
        : (typeof unloadCallback?.onUnload === "function" ? () => unloadCallback.onUnload(api) : null);
      this.mods.push({ ...modMeta, api, entryUrl: entryUrlWithCache, manifest, unload, logger });
      logger.info("Loaded");
    } catch (error) {
      logger.error("Mod registration failed.", error);
      this.errors.push({ id: modMeta.id, error });
    }
  },

  async _loadSingleFromZip(
    entry,
    source,
    preparedManifest = undefined,
    preparedManifestPath = undefined,
    repository = undefined,
    sourceLabel = "ZIP Archive"
  ) {
    const manifestPath = normalizeZipPath(preparedManifestPath || entry.manifest || `mods/${entry.id}/manifest.json`);
    let manifest = preparedManifest;
    if (!manifest) {
      try {
        manifest = await source.getJson(manifestPath);
      } catch (error) {
        console.warn(`[ModManager] Failed to load manifest for ${entry.id} from zip.`, error);
        this.errors.push({ id: entry.id, error });
        return;
      }
    }

    const settingsSchema = normalizeManifestSettings(manifest.settings);
    const settingsState = this._buildSettingsState(manifest.id || entry.id, settingsSchema);
    const modMeta = {
      id: manifest.id || entry.id,
      name: manifest.name || entry.id,
      version: manifest.version || "0.0.0",
      description: manifest.description || "",
      manifestUrl: manifestPath,
      repositoryId: repository?.id || "zip://mods.json",
      repositoryName: repository?.name || sourceLabel,
      settingsSchema,
      requiredSettingsMissing: settingsState.missingRequired,
    };
    this._updateAvailableMeta(modMeta);
    if (!settingsState.valid) {
      this.errors.push({
        id: modMeta.id,
        error: new Error(`Required settings missing: ${settingsState.missingRequired.join(", ")}`),
      });
      return;
    }
    const logger = createLogger(modMeta.id, modMeta.name);

    if (manifest.apiVersion !== undefined && manifest.apiVersion !== MOD_API_VERSION) {
      logger.warn(`API version mismatch. Mod=${manifest.apiVersion} Loader=${MOD_API_VERSION}`);
    }

    const entryFile = manifest.entry || "main.js";
    const entryPath = resolveZipPath(manifestPath, entryFile);
    const entryUrl = isAbsoluteUrl(entryPath)
      ? entryPath
      : await source.getBlobUrl(entryPath);

    let modModule;
    try {
      modModule = await import(/* webpackIgnore: true */ entryUrl);
    } catch (error) {
      logger.error("Failed to import mod entry.", error);
      this.errors.push({ id: modMeta.id, error });
      if (source && source !== this._zipSource) source.revokeAll();
      return;
    }

    const register = resolveRegister(modModule);
    if (!register) {
      logger.warn("No register() function found in mod entry.");
      if (source && source !== this._zipSource) source.revokeAll();
      return;
    }

    const api = createModApi(modMeta);
    try {
      const unloadCallback = await Promise.resolve(register(api));
      const unload = typeof unloadCallback === "function"
        ? unloadCallback
        : (typeof unloadCallback?.onUnload === "function" ? () => unloadCallback.onUnload(api) : null);
      this.mods.push({ ...modMeta, api, entryUrl, manifest, unload, logger, zipSource: source });
      logger.info("Loaded");
    } catch (error) {
      logger.error("Mod registration failed.", error);
      this.errors.push({ id: modMeta.id, error });
      if (source && source !== this._zipSource) source.revokeAll();
    }
  },

  _registerAvailableEntry(entry, source) {
    if (!entry?.id) return;
    const sourceId = typeof source === "string" ? source : source?.id || "unknown";
    const sourceName = typeof source === "string" ? source : source?.name || sourceId;
    const id = entry.id;
    let info = this.availableMods.get(id);
    if (!info) {
      info = {
        id,
        name: id,
        version: "",
        description: "",
        size: resolveModSize(undefined, id, entry.size),
        dependencies: {
          required: [],
          optional: [],
          loadAfter: [],
        },
        author: "",
        tags: [],
        repo: "",
        affectsStyle: false,
        affectsGameplay: false,
        sources: new Set(),
        repositoryIds: new Set(),
        repositoryNames: new Set(),
        settingsSchema: [],
        requiredSettingsMissing: [],
        manifest: entry.manifest || "",
      };
    }
    info.sources.add(sourceId);
    if (sourceId) info.repositoryIds.add(sourceId);
    if (sourceName) info.repositoryNames.add(sourceName);
    if (entry.manifest) info.manifest = entry.manifest;
    this.availableMods.set(id, info);
  },

  _updateAvailableMeta(modMeta) {
    if (!modMeta?.id) return;
    let info = this.availableMods.get(modMeta.id);
    if (!info) {
      info = {
        id: modMeta.id,
        size: "medium",
        dependencies: {
          required: [],
          optional: [],
          loadAfter: [],
        },
        author: "",
        tags: [],
        repo: "",
        affectsStyle: false,
        affectsGameplay: false,
        sources: new Set(),
        repositoryIds: new Set(),
        repositoryNames: new Set(),
        settingsSchema: [],
        requiredSettingsMissing: [],
      };
    }
    info.name = modMeta.name || info.name || modMeta.id;
    info.version = modMeta.version || info.version || "";
    info.description = modMeta.description || info.description || "";
    info.size = resolveModSize(modMeta.size, modMeta.id || info.id, info.size);
    if (modMeta.dependencies) {
      info.dependencies = {
        required: Array.from(new Set(modMeta.dependencies.required || [])),
        optional: Array.from(new Set(modMeta.dependencies.optional || [])),
        loadAfter: Array.from(new Set(modMeta.dependencies.loadAfter || [])),
      };
    }
    info.author = modMeta.author || info.author || "";
    info.tags = Array.isArray(modMeta.tags) ? Array.from(new Set(modMeta.tags)) : (info.tags || []);
    info.repo = modMeta.repo || info.repo || "";
    info.affectsStyle = modMeta.affectsStyle === true || info.affectsStyle === true;
    info.affectsGameplay = modMeta.affectsGameplay === true || info.affectsGameplay === true;
    if (Array.isArray(modMeta.settingsSchema)) {
      info.settingsSchema = modMeta.settingsSchema.map(item => ({ ...item }));
    }
    if (Array.isArray(modMeta.requiredSettingsMissing)) {
      info.requiredSettingsMissing = Array.from(new Set(modMeta.requiredSettingsMissing));
    }
    if (modMeta.repositoryId) info.repositoryIds.add(modMeta.repositoryId);
    if (modMeta.repositoryName) info.repositoryNames.add(modMeta.repositoryName);
    this.availableMods.set(modMeta.id, info);
  },

  async _buildZipListFromManifest(source) {
    const manifestFiles = source?.zip?.file?.(/manifest\.json$/u) || [];
    if (manifestFiles.length === 0) return null;
    const mods = [];
    for (const file of manifestFiles) {
      const manifestPath = normalizeZipPath(file.name);
      try {
        const manifest = await source.getJson(manifestPath);
        const id = manifest?.id || inferIdFromManifestPath(manifestPath);
        if (!id) continue;
        mods.push({ id, manifest: manifestPath });
      } catch (error) {
        console.warn(`[ModManager] Failed to read manifest in zip: ${manifestPath}`, error);
      }
    }
    if (mods.length === 0) return null;
    return { mods };
  },

  async _storeZipLocally(blob, name) {
    try {
      await saveStoredZipEntry({
        blob,
        name,
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.warn("[ModManager] Failed to store zip locally.", error);
    }
  },

  async _loadStoredZipSource() {
    try {
      const entry = await loadStoredZipEntry();
      if (!entry?.blob) return null;
      const buffer = await entry.blob.arrayBuffer();
      return ZipSource.fromArrayBuffer(buffer);
    } catch (error) {
      console.warn("[ModManager] Failed to load stored zip.", error);
      return null;
    }
  },
};

window.ModManager = ModManager;
