import JSZip from "jszip";
import { DEV } from "@/env";

const MOD_API_VERSION = 1;
const CONFIG_KEY = "admod:config";
const CORS_LIST_URL = "mods/cors.json";
const ZIP_STORAGE_DB = "admod";
const ZIP_STORAGE_STORE = "zip-mods";
const ZIP_STORAGE_KEY = "last";
const LEGACY_SPEED_SOURCE = "__legacy__";
const DEFAULT_CONFIG = Object.freeze({
  mode: "url",
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
  next.mode = next.mode === "zip" ? "zip" : "url";
  next.zipUrl = typeof next.zipUrl === "string" ? next.zipUrl.trim() : "";
  next.disabledMods = Array.isArray(next.disabledMods)
    ? next.disabledMods.filter(id => typeof id === "string" && id.trim()).map(id => id.trim())
    : [];
  if ("listUrl" in next) delete next.listUrl;
  return next;
}

function normalizeModSize(size) {
  if (typeof size !== "string") return "medium";
  const normalized = size.trim().toLowerCase();
  if (normalized === "large" || normalized === "medium" || normalized === "small") return normalized;
  return "medium";
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
  availableMods: new Map(),

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
      enabled: !this.isModDisabled(info.id),
    }));
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

    const config = this.getConfig();
    if (config.mode === "zip") {
      await this._loadFromZipConfig(config);
      this.loaded = true;
      return;
    }

    await this._loadFromUrlConfig(config);
    this.loaded = true;
  },

  async _loadFromUrlConfig(config) {
    const seen = new Set();
    const corsListUrl = resolveUrl(CORS_LIST_URL, window.location.href);
    const corsUrls = await this._loadCorsUrls(corsListUrl);
    for (const corsUrl of corsUrls) {
      const normalized = corsUrl.trim();
      if (!normalized) continue;
      const listFromCors = normalized.endsWith(".json")
        ? normalized
        : resolveUrl("mods.json", ensureTrailingSlash(normalized));
      await this._loadListFromUrl(listFromCors, seen);
    }
  },

  async _loadCorsUrls(listUrl) {
    let data;
    try {
      data = await fetchJson(withCacheBust(listUrl));
    } catch (error) {
      return [];
    }
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.cors)) return data.cors;
    if (data && Array.isArray(data.cdns)) return data.cdns;
    return [];
  },

  async _loadListFromUrl(listUrl, seen) {
    let modList;
    try {
      modList = await fetchJson(withCacheBust(listUrl));
    } catch (error) {
      console.warn(`[ModManager] No mod list found or failed to load. (${listUrl})`, error);
      return;
    }

    if (!modList || !Array.isArray(modList.mods)) {
      console.warn(`[ModManager] Invalid mod list format. (${listUrl})`);
      return;
    }

    const candidates = [];
    for (const entry of modList.mods) {
      if (!entry || entry.enabled === false) continue;
      const id = entry.id;
      if (!id || typeof id !== "string") continue;
      this._registerAvailableEntry(entry, listUrl);
      if (seen.has(id)) {
        console.warn(`[ModManager] Duplicate mod id skipped: ${id}`);
        continue;
      }
      seen.add(id);
      if (this.isModDisabled(id)) continue;
      const candidate = await this._buildUrlCandidate(entry, listUrl);
      if (candidate) candidates.push(candidate);
    }
    await this._loadPreparedCandidates(candidates);
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

  async _buildUrlCandidate(entry, listUrl) {
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

    const modMeta = {
      id: manifest.id || entry.id,
      name: manifest.name || entry.id,
      version: manifest.version || "0.0.0",
      description: manifest.description || "",
      manifestUrl,
      size: normalizeModSize(manifest.modSize || manifest.size || entry.size),
      dependencies: normalizeDependencyList(manifest),
      author: manifest.author || "",
      tags: Array.isArray(manifest.tags) ? manifest.tags.filter(tag => typeof tag === "string") : [],
      repo: manifest.repo || manifest.homepage || "",
      affectsStyle: manifest.affectsStyle === true,
      affectsGameplay: manifest.affectsGameplay === true || manifest.affectsBlocks === true,
    };
    this._updateAvailableMeta(modMeta);
    const dependencies = normalizeDependencyList(manifest);
    const size = normalizeModSize(manifest.modSize || manifest.size || entry.size);

    return {
      id: modMeta.id,
      size,
      requiredDeps: dependencies.required,
      optionalDeps: dependencies.optional,
      loadAfterDeps: dependencies.loadAfter,
      load: () => this._loadSingleFromUrl(entry, listUrl, manifest, manifestUrl),
    };
  },

  async _buildZipCandidate(entry, source) {
    const manifestPath = normalizeZipPath(entry.manifest || `mods/${entry.id}/manifest.json`);
    let manifest;
    try {
      manifest = await source.getJson(manifestPath);
    } catch (error) {
      console.warn(`[ModManager] Failed to load manifest for ${entry.id} from zip.`, error);
      this.errors.push({ id: entry.id, error });
      return null;
    }

    const modMeta = {
      id: manifest.id || entry.id,
      name: manifest.name || entry.id,
      version: manifest.version || "0.0.0",
      description: manifest.description || "",
      manifestUrl: manifestPath,
      size: normalizeModSize(manifest.modSize || manifest.size || entry.size),
      dependencies: normalizeDependencyList(manifest),
      author: manifest.author || "",
      tags: Array.isArray(manifest.tags) ? manifest.tags.filter(tag => typeof tag === "string") : [],
      repo: manifest.repo || manifest.homepage || "",
      affectsStyle: manifest.affectsStyle === true,
      affectsGameplay: manifest.affectsGameplay === true || manifest.affectsBlocks === true,
    };
    this._updateAvailableMeta(modMeta);
    const dependencies = normalizeDependencyList(manifest);
    const size = normalizeModSize(manifest.modSize || manifest.size || entry.size);

    return {
      id: modMeta.id,
      size,
      requiredDeps: dependencies.required,
      optionalDeps: dependencies.optional,
      loadAfterDeps: dependencies.loadAfter,
      load: () => this._loadSingleFromZip(entry, source, manifest, manifestPath),
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

  async _loadSingleFromUrl(entry, listUrl, preparedManifest = undefined, preparedManifestUrl = undefined) {
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

    const modMeta = {
      id: manifest.id || entry.id,
      name: manifest.name || entry.id,
      version: manifest.version || "0.0.0",
      description: manifest.description || "",
      manifestUrl,
    };
    this._updateAvailableMeta(modMeta);
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

  async _loadSingleFromZip(entry, source, preparedManifest = undefined, preparedManifestPath = undefined) {
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

    const modMeta = {
      id: manifest.id || entry.id,
      name: manifest.name || entry.id,
      version: manifest.version || "0.0.0",
      description: manifest.description || "",
      manifestUrl: manifestPath,
    };
    this._updateAvailableMeta(modMeta);
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
      this.mods.push({ ...modMeta, api, entryUrl, manifest, unload, logger });
      logger.info("Loaded");
    } catch (error) {
      logger.error("Mod registration failed.", error);
      this.errors.push({ id: modMeta.id, error });
    }
  },

  _registerAvailableEntry(entry, listUrl) {
    if (!entry?.id) return;
    const id = entry.id;
    let info = this.availableMods.get(id);
    if (!info) {
      info = {
        id,
        name: id,
        version: "",
        description: "",
        size: normalizeModSize(entry.size),
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
        manifest: entry.manifest || "",
      };
    }
    info.sources.add(listUrl);
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
      };
    }
    info.name = modMeta.name || info.name || modMeta.id;
    info.version = modMeta.version || info.version || "";
    info.description = modMeta.description || info.description || "";
    info.size = normalizeModSize(modMeta.size || info.size);
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
