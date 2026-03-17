<script>
import { ModManager } from "@/core/mods/mod-manager";

export default {
  name: "OptionsModsTab",
  data() {
    return {
      modSourceIsUrl: true,
      modListUrl: "",
      modZipUrl: "",
      modZipFileName: "",
      modZipFile: null,
      loadedMods: [],
      modErrors: [],
      availableMods: [],
    };
  },
  methods: {
    update() {
      const modConfig = ModManager.getConfig();
      this.modSourceIsUrl = modConfig.mode !== "zip";
      this.modListUrl = modConfig.listUrl;
      this.modZipUrl = modConfig.zipUrl;
      this.loadedMods = ModManager.mods.slice();
      this.modErrors = ModManager.errors.slice();
      this.availableMods = ModManager.getAvailableMods();
    },
    setSource(mode) {
      this.modSourceIsUrl = mode === "url";
      this.applyModConfig({ mode: this.modSourceIsUrl ? "url" : "zip" });
    },
    applyModConfig(partial) {
      const next = ModManager.setConfig(partial);
      if (!player.options.modLoader) player.options.modLoader = {};
      player.options.modLoader.mode = next.mode;
      player.options.modLoader.listUrl = next.listUrl;
      player.options.modLoader.zipUrl = next.zipUrl;
    },
    handleModListUrlChange(event) {
      const value = event.target.value.trim();
      this.modListUrl = value;
      this.applyModConfig({ listUrl: value });
    },
    handleModZipUrlChange(event) {
      const value = event.target.value.trim();
      this.modZipUrl = value;
      this.applyModConfig({ zipUrl: value });
    },
    async reloadMods() {
      await ModManager.reload();
      if (GameUI?.notify?.info) GameUI.notify.info("Mods reloaded");
      this.loadedMods = ModManager.mods.slice();
      this.modErrors = ModManager.errors.slice();
      this.availableMods = ModManager.getAvailableMods();
    },
    onZipFileSelected(event) {
      if (!event.target.files || event.target.files.length === 0) return;
      this.modZipFile = event.target.files[0];
      this.modZipFileName = this.modZipFile.name;
    },
    async loadZipFile() {
      if (!this.modZipFile) return;
      await ModManager.loadZipFile(this.modZipFile);
      if (GameUI?.notify?.info) GameUI.notify.info("ZIP mod loaded");
      this.availableMods = ModManager.getAvailableMods();
    },
    isModEnabled(id) {
      return !ModManager.isModDisabled(id);
    },
    async setModEnabled(id, enabled) {
      const next = ModManager.setModDisabled(id, !enabled);
      if (!player.options.modLoader) player.options.modLoader = {};
      player.options.modLoader.disabledMods = next.disabledMods;
      await this.reloadMods();
    },
    toggleMod(id) {
      const enabled = !this.isModEnabled(id);
      this.setModEnabled(id, enabled);
    },
    formatErrorMessage(err) {
      if (!err) return "Unknown error";
      if (err.error && err.error.message) return err.error.message;
      if (err.message) return err.message;
      return "Unknown error";
    }
  }
};
</script>

<template>
  <div class="mod-menu">
    <div class="mod-menu__header">
      <div class="mod-menu__title">MOD MENU</div>
      <div class="mod-menu__subtitle">Manage sources, load order, and enable states</div>
    </div>

    <div class="mod-menu__section mod-menu__section--controls">
      <div class="mod-menu__block">
        <div class="mod-menu__label">Source</div>
        <div class="mod-menu__toggle">
          <button
            class="mod-menu__toggle-btn"
            :class="{ 'is-active': modSourceIsUrl }"
            @click="setSource('url')"
          >
            URL
          </button>
          <button
            class="mod-menu__toggle-btn"
            :class="{ 'is-active': !modSourceIsUrl }"
            @click="setSource('zip')"
          >
            ZIP
          </button>
        </div>
      </div>
      <div class="mod-menu__block">
        <div class="mod-menu__label">Actions</div>
        <button class="mod-menu__btn" @click="reloadMods">
          Reload Mods
        </button>
      </div>
    </div>

    <div v-if="modSourceIsUrl" class="mod-menu__section">
      <div class="mod-menu__field">
        <label class="mod-menu__label">Mod list URL</label>
        <input
          class="mod-menu__input"
          type="text"
          placeholder="mods/mods.json or https://..."
          :value="modListUrl"
          @change="handleModListUrlChange"
        >
      </div>
    </div>

    <div v-else class="mod-menu__section">
      <div class="mod-menu__field">
        <label class="mod-menu__label">ZIP URL</label>
        <input
          class="mod-menu__input"
          type="text"
          placeholder="https://example.com/mods.zip"
          :value="modZipUrl"
          @change="handleModZipUrlChange"
        >
      </div>
      <div class="mod-menu__zip-row">
        <label class="mod-menu__file">
          <input
            class="mod-menu__file-input"
            type="file"
            accept=".zip"
            @change="onZipFileSelected"
          >
          <span>Choose ZIP</span>
        </label>
        <button class="mod-menu__btn" @click="loadZipFile">
          Load ZIP {{ modZipFileName ? "(" + modZipFileName + ")" : "" }}
        </button>
      </div>
    </div>

    <div class="mod-menu__section mod-menu__section--lists">
      <div class="mod-menu__panel">
        <div class="mod-menu__panel-title">
          Loaded Mods <span>({{ loadedMods.length }})</span>
        </div>
        <div v-if="loadedMods.length === 0" class="mod-menu__empty">
          No mods loaded
        </div>
        <div v-else class="mod-menu__list">
          <div
            v-for="mod in loadedMods"
            :key="mod.id"
            class="mod-menu__item"
          >
            <div class="mod-menu__item-title">
              {{ mod.name }} <span v-if="mod.version">({{ mod.version }})</span>
            </div>
            <div v-if="mod.description" class="mod-menu__item-desc">
              {{ mod.description }}
            </div>
            <div class="mod-menu__item-meta">
              id: {{ mod.id }}
            </div>
          </div>
        </div>
      </div>

      <div v-if="modErrors.length > 0" class="mod-menu__panel">
        <div class="mod-menu__panel-title mod-menu__panel-title--warn">
          Mod Errors <span>({{ modErrors.length }})</span>
        </div>
        <div class="mod-menu__list">
          <div
            v-for="(err, index) in modErrors"
            :key="`err-${err.id || 'unknown'}-${index}`"
            class="mod-menu__item mod-menu__item--warn"
          >
            <div class="mod-menu__item-title">
              {{ err.id || "unknown" }}
            </div>
            <div class="mod-menu__item-desc">
              {{ formatErrorMessage(err) }}
            </div>
          </div>
        </div>
      </div>

      <div class="mod-menu__panel mod-menu__panel--wide">
        <div class="mod-menu__panel-title">
          Available Mods <span>({{ availableMods.length }})</span>
        </div>
        <div v-if="availableMods.length === 0" class="mod-menu__empty">
          No mods found
        </div>
        <div v-else class="mod-menu__list">
          <div
            v-for="mod in availableMods"
            :key="`available-${mod.id}`"
            class="mod-menu__item mod-menu__item--row"
          >
            <div class="mod-menu__item-info">
              <div class="mod-menu__item-title">
                {{ mod.name || mod.id }} <span v-if="mod.version">({{ mod.version }})</span>
              </div>
              <div v-if="mod.description" class="mod-menu__item-desc">
                {{ mod.description }}
              </div>
              <div class="mod-menu__item-meta">
                id: {{ mod.id }}
              </div>
            </div>
            <button
              class="mod-menu__toggle-btn mod-menu__toggle-btn--small"
              :class="{ 'is-active': isModEnabled(mod.id) }"
              @click="toggleMod(mod.id)"
            >
              {{ isModEnabled(mod.id) ? "ON" : "OFF" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mod-menu {
  --mod-bg: #141419;
  --mod-card: #1f2229;
  --mod-ink: #f2f2f2;
  --mod-muted: #a6a6b3;
  --mod-accent: #f6c453;
  --mod-accent-2: #5ed5ff;
  --mod-danger: #ff6b6b;
  min-height: 100%;
  padding: 2rem 2.4rem 3rem;
  background: radial-gradient(1200px 500px at 10% -10%, #2a2d35, transparent),
    radial-gradient(900px 500px at 110% 0%, #262029, transparent),
    var(--mod-bg);
  color: var(--mod-ink);
  font-family: "PT Mono", monospace;
}

.mod-menu__header {
  margin-bottom: 2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 1rem;
}

.mod-menu__title {
  font-size: 2.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.mod-menu__subtitle {
  margin-top: 0.4rem;
  color: var(--mod-muted);
  font-size: 1.2rem;
}

.mod-menu__section {
  background: var(--mod-card);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 1.6rem 1.8rem;
  margin-bottom: 1.6rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
}

.mod-menu__section--controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1.4rem;
  align-items: flex-end;
}

.mod-menu__block {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.mod-menu__label {
  font-size: 1.1rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--mod-muted);
}

.mod-menu__toggle {
  display: flex;
  gap: 0.6rem;
}

.mod-menu__toggle-btn,
.mod-menu__btn {
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: #1a1d24;
  color: var(--mod-ink);
  padding: 0.7rem 1.4rem;
  border-radius: 999px;
  font-size: 1.2rem;
  letter-spacing: 0.05em;
  transition: all 0.2s ease;
}

.mod-menu__toggle-btn.is-active {
  background: linear-gradient(135deg, #f6c453, #f1a44b);
  color: #1b1b1b;
  border-color: rgba(246, 196, 83, 0.8);
  box-shadow: 0 8px 18px rgba(246, 196, 83, 0.3);
}

.mod-menu__toggle-btn--small {
  min-width: 76px;
  text-align: center;
}

.mod-menu__btn {
  background: linear-gradient(135deg, #1f2732, #141820);
  border-color: rgba(94, 213, 255, 0.35);
  color: var(--mod-accent-2);
}

.mod-menu__btn:hover,
.mod-menu__toggle-btn:hover {
  transform: translateY(-1px);
}

.mod-menu__field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.mod-menu__input {
  background: #11131a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--mod-ink);
  padding: 0.7rem 1rem;
  border-radius: 10px;
  font-size: 1.2rem;
  outline: none;
}

.mod-menu__input:focus {
  border-color: rgba(246, 196, 83, 0.7);
  box-shadow: 0 0 0 2px rgba(246, 196, 83, 0.2);
}

.mod-menu__zip-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
}

.mod-menu__file {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  padding: 0.6rem 1.2rem;
  border-radius: 10px;
  color: var(--mod-muted);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
}

.mod-menu__file-input {
  display: none;
}

.mod-menu__section--lists {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.2rem;
}

.mod-menu__panel {
  background: #161922;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 1.2rem;
  min-height: 120px;
}

.mod-menu__panel--wide {
  grid-column: 1 / -1;
}

.mod-menu__panel-title {
  font-size: 1.2rem;
  letter-spacing: 0.06em;
  color: var(--mod-accent);
  text-transform: uppercase;
  margin-bottom: 1rem;
}

.mod-menu__panel-title--warn {
  color: var(--mod-danger);
}

.mod-menu__list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  max-height: 32rem;
  overflow: auto;
}

.mod-menu__item {
  padding-bottom: 0.8rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.mod-menu__item:last-child {
  border-bottom: none;
}

.mod-menu__item-title {
  font-size: 1.3rem;
  font-weight: bold;
}

.mod-menu__item-desc {
  font-size: 1.1rem;
  color: var(--mod-muted);
}

.mod-menu__item-meta {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.45);
}

.mod-menu__item--row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}

.mod-menu__item-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.mod-menu__item--warn .mod-menu__item-title {
  color: var(--mod-danger);
}

.mod-menu__empty {
  font-size: 1.1rem;
  color: var(--mod-muted);
}

@media (max-width: 900px) {
  .mod-menu__section--controls {
    flex-direction: column;
    align-items: stretch;
  }
  .mod-menu__section--lists {
    grid-template-columns: 1fr;
  }
  .mod-menu__item--row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
