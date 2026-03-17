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
  <div class="mod-modern">
    <div class="mod-modern__header">
      <div class="mod-modern__title">MOD MENU</div>
      <div class="mod-modern__subtitle">Manage sources, load order, and enable states</div>
    </div>

    <div class="mod-modern__row">
      <div class="mod-modern__card mod-modern__card--tight">
        <div class="mod-modern__label">Source</div>
        <div class="mod-modern__toggle">
          <button
            class="mod-modern__pill"
            :class="{ 'is-active': modSourceIsUrl }"
            @click="setSource('url')"
          >
            URL
          </button>
          <button
            class="mod-modern__pill"
            :class="{ 'is-active': !modSourceIsUrl }"
            @click="setSource('zip')"
          >
            ZIP
          </button>
        </div>
      </div>
      <div class="mod-modern__card mod-modern__card--tight">
        <div class="mod-modern__label">Actions</div>
        <button class="mod-modern__btn" @click="reloadMods">Reload Mods</button>
      </div>
    </div>

    <div v-if="modSourceIsUrl" class="mod-modern__card">
      <div class="mod-modern__label">Mod list URL</div>
      <input
        class="mod-modern__input"
        type="text"
        placeholder="mods/mods.json or https://..."
        :value="modListUrl"
        @change="handleModListUrlChange"
      >
    </div>

    <div v-else class="mod-modern__card">
      <div class="mod-modern__label">ZIP URL</div>
      <input
        class="mod-modern__input"
        type="text"
        placeholder="https://example.com/mods.zip"
        :value="modZipUrl"
        @change="handleModZipUrlChange"
      >
      <div class="mod-modern__zip-row">
        <label class="mod-modern__file">
          <input
            class="mod-modern__file-input"
            type="file"
            accept=".zip"
            @change="onZipFileSelected"
          >
          <span>Choose ZIP</span>
        </label>
        <button class="mod-modern__btn mod-modern__btn--ghost" @click="loadZipFile">
          Load ZIP {{ modZipFileName ? "(" + modZipFileName + ")" : "" }}
        </button>
      </div>
    </div>

    <div class="mod-modern__row">
      <div class="mod-modern__card">
        <div class="mod-modern__card-title">Loaded Mods ({{ loadedMods.length }})</div>
        <div v-if="loadedMods.length === 0" class="mod-modern__empty">No mods loaded</div>
        <div v-else class="mod-modern__list">
          <div v-for="mod in loadedMods" :key="mod.id" class="mod-modern__item">
            <div class="mod-modern__item-title">
              {{ mod.name }} <span v-if="mod.version">({{ mod.version }})</span>
            </div>
            <div v-if="mod.description" class="mod-modern__item-desc">{{ mod.description }}</div>
            <div class="mod-modern__item-meta">id: {{ mod.id }}</div>
          </div>
        </div>
      </div>
      <div v-if="modErrors.length > 0" class="mod-modern__card">
        <div class="mod-modern__card-title mod-modern__card-title--warn">Mod Errors ({{ modErrors.length }})</div>
        <div class="mod-modern__list">
          <div v-for="(err, index) in modErrors" :key="`err-${err.id || 'unknown'}-${index}`" class="mod-modern__item">
            <div class="mod-modern__item-title mod-modern__item-title--warn">{{ err.id || "unknown" }}</div>
            <div class="mod-modern__item-desc">{{ formatErrorMessage(err) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="mod-modern__card mod-modern__card--wide">
      <div class="mod-modern__card-title">Available Mods ({{ availableMods.length }})</div>
      <div v-if="availableMods.length === 0" class="mod-modern__empty">No mods found</div>
      <div v-else class="mod-modern__list">
        <div v-for="mod in availableMods" :key="`available-${mod.id}`" class="mod-modern__item mod-modern__item--row">
          <div class="mod-modern__item-info">
            <div class="mod-modern__item-title">
              {{ mod.name || mod.id }} <span v-if="mod.version">({{ mod.version }})</span>
            </div>
            <div v-if="mod.description" class="mod-modern__item-desc">{{ mod.description }}</div>
            <div class="mod-modern__item-meta">id: {{ mod.id }}</div>
          </div>
          <button
            class="mod-modern__pill mod-modern__pill--small"
            :class="{ 'is-active': isModEnabled(mod.id) }"
            @click="toggleMod(mod.id)"
          >
            {{ isModEnabled(mod.id) ? "ON" : "OFF" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mod-modern {
  padding: 2rem 2.4rem 3rem;
  color: #ffffff;
  font-family: Typewriter, "PT Mono", monospace;
}

.mod-modern__header {
  text-align: center;
  margin-bottom: 1.4rem;
}

.mod-modern__title {
  font-size: 2.2rem;
  letter-spacing: 0.16em;
  color: #ffffff;
}

.mod-modern__subtitle {
  margin-top: 0.4rem;
  font-size: 1.2rem;
  color: #ffffff;
}

.mod-modern__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.2rem;
  margin-bottom: 1.2rem;
}

.mod-modern__card {
  background: rgba(20, 22, 28, 0.92);
  border: 1px solid rgba(90, 255, 140, 0.6);
  border-radius: 12px;
  padding: 1.4rem 1.6rem;
}

.mod-modern__card--tight {
  padding: 1.2rem 1.4rem;
}

.mod-modern__card--wide {
  margin-top: 0.6rem;
}

.mod-modern__label {
  font-size: 1.1rem;
  color: #ffffff;
  margin-bottom: 0.7rem;
}

.mod-modern__toggle {
  display: flex;
  gap: 0.6rem;
}

.mod-modern__pill,
.mod-modern__btn {
  border-radius: 999px;
  padding: 0.6rem 1.3rem;
  font-size: 1.2rem;
  border: 1px solid rgba(90, 255, 140, 0.6);
  background: rgba(25, 26, 34, 0.9);
  color: #ffffff;
  transition: all 0.2s ease;
}

.mod-modern__pill.is-active {
  background: linear-gradient(135deg, #49d46b, #8be86b);
  color: #ffffff;
  border-color: rgba(90, 255, 140, 0.9);
  box-shadow: 0 6px 16px rgba(90, 255, 140, 0.35);
}

.mod-modern__pill--small {
  min-width: 72px;
  text-align: center;
}

.mod-modern__btn {
  background: linear-gradient(135deg, #2a3b2f, #1a2a1f);
  color: #ffffff;
  border-color: rgba(90, 255, 140, 0.6);
}

.mod-modern__btn--ghost {
  background: rgba(90, 255, 140, 0.12);
  color: #ffffff;
}

.mod-modern__input {
  width: 100%;
  background: rgba(14, 15, 19, 0.95);
  border: 1px solid rgba(90, 255, 140, 0.6);
  color: #ffffff;
  padding: 0.7rem 1rem;
  border-radius: 10px;
  font-size: 1.2rem;
}

.mod-modern__input:focus {
  outline: none;
  border-color: rgba(90, 255, 140, 0.9);
  box-shadow: 0 0 0 2px rgba(90, 255, 140, 0.2);
}

.mod-modern__zip-row {
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 1rem;
}

.mod-modern__file {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.6rem 1.2rem;
  border-radius: 10px;
  border: 1px dashed rgba(90, 255, 140, 0.6);
  color: #ffffff;
  cursor: pointer;
}

.mod-modern__file-input {
  display: none;
}

.mod-modern__card-title {
  font-size: 1.2rem;
  color: #ffffff;
  margin-bottom: 0.9rem;
}

.mod-modern__card-title--warn {
  color: #ffffff;
}

.mod-modern__list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  max-height: 30rem;
  overflow: auto;
}

.mod-modern__item {
  padding-bottom: 0.8rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mod-modern__item:last-child {
  border-bottom: none;
}

.mod-modern__item-title {
  font-size: 1.3rem;
  font-weight: bold;
}

.mod-modern__item-title--warn {
  color: #ffffff;
}

.mod-modern__item-desc {
  font-size: 1.1rem;
  color: #ffffff;
}

.mod-modern__item-meta {
  font-size: 1rem;
  color: #ffffff;
}

.mod-modern__item--row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}

.mod-modern__item-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.mod-modern__empty {
  font-size: 1.1rem;
  color: #ffffff;
}

@media (max-width: 900px) {
  .mod-modern__row {
    grid-template-columns: 1fr;
  }
  .mod-modern__item--row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
