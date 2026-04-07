<script>
import { ModManager } from "@/core/mods/mod-manager";

export default {
  name: "OptionsModsTab",
  data() {
    return {
      modSourceIsUrl: true,
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
      this.modZipUrl = modConfig.zipUrl;
      this.loadedMods = ModManager.mods.slice();
      this.modErrors = ModManager.errors.slice();
      this.availableMods = ModManager.getAvailableMods();
    },
    setSource(mode) {
      this.modSourceIsUrl = mode === "url";
      this.applyModConfig({
        mode: this.modSourceIsUrl ? "url" : "zip"
      });
    },
    applyModConfig(partial) {
      const next = ModManager.setConfig(partial);
      if (!player.options.modLoader) player.options.modLoader = {};
      player.options.modLoader.mode = next.mode;
      player.options.modLoader.zipUrl = next.zipUrl;
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
      if (this.modSourceIsUrl) {
        this.modSourceIsUrl = false;
        this.applyModConfig({ mode: "zip" });
      }
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
  <div class="mod-classic">
    <div class="mod-classic__header">
      <div class="mod-classic__title">MOD MENU</div>
      <div class="mod-classic__subtitle">Manage sources, load order, and enable states</div>
    </div>

    <div class="mod-classic__row">
      <div class="mod-classic__card mod-classic__card--tight">
        <div class="mod-classic__label">Source</div>
        <div class="mod-classic__toggle">
          <button
            class="mod-classic__btn mod-classic__btn--toggle"
            :class="{ 'is-active': modSourceIsUrl }"
            @click="setSource('url')"
          >
            URL
          </button>
          <button
            class="mod-classic__btn mod-classic__btn--toggle"
            :class="{ 'is-active': !modSourceIsUrl }"
            @click="setSource('zip')"
          >
            ZIP
          </button>
        </div>
      </div>
      <div class="mod-classic__card mod-classic__card--tight">
        <div class="mod-classic__label">Actions</div>
        <button class="mod-classic__btn" @click="reloadMods">Reload Mods</button>
      </div>
    </div>

    <div v-if="!modSourceIsUrl" class="mod-classic__card">
      <div class="mod-classic__label">ZIP URL</div>
      <input
        class="mod-classic__input"
        type="text"
        placeholder="https://example.com/mods.zip"
        :value="modZipUrl"
        @change="handleModZipUrlChange"
      >
      <div class="mod-classic__zip-row">
        <label class="mod-classic__file">
          <input
            class="mod-classic__file-input"
            type="file"
            accept=".zip"
            @change="onZipFileSelected"
          >
          <span>Choose ZIP</span>
        </label>
        <button class="mod-classic__btn mod-classic__btn--ghost" @click="loadZipFile">
          Load ZIP {{ modZipFileName ? "(" + modZipFileName + ")" : "" }}
        </button>
      </div>
    </div>

    <div class="mod-classic__row">
      <div class="mod-classic__card">
        <div class="mod-classic__card-title">Loaded Mods ({{ loadedMods.length }})</div>
        <div v-if="loadedMods.length === 0" class="mod-classic__empty">No mods loaded</div>
        <div v-else class="mod-classic__list">
          <div v-for="mod in loadedMods" :key="mod.id" class="mod-classic__item">
            <div class="mod-classic__item-title">
              {{ mod.name }} <span v-if="mod.version">({{ mod.version }})</span>
            </div>
            <div v-if="mod.description" class="mod-classic__item-desc">{{ mod.description }}</div>
            <div class="mod-classic__item-meta">
              id: {{ mod.id }} | size: {{ mod.size || "medium" }}
            </div>
            <div v-if="mod.dependencies && mod.dependencies.required && mod.dependencies.required.length > 0" class="mod-classic__item-meta">
              depends: {{ mod.dependencies.required.join(", ") }}
            </div>
          </div>
        </div>
      </div>
      <div v-if="modErrors.length > 0" class="mod-classic__card">
        <div class="mod-classic__card-title mod-classic__card-title--warn">Mod Errors ({{ modErrors.length }})</div>
        <div class="mod-classic__list">
          <div v-for="(err, index) in modErrors" :key="`err-${err.id || 'unknown'}-${index}`" class="mod-classic__item">
            <div class="mod-classic__item-title mod-classic__item-title--warn">{{ err.id || "unknown" }}</div>
            <div class="mod-classic__item-desc">{{ formatErrorMessage(err) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="mod-classic__card mod-classic__card--wide">
      <div class="mod-classic__card-title">Available Mods ({{ availableMods.length }})</div>
      <div v-if="availableMods.length === 0" class="mod-classic__empty">No mods found</div>
      <div v-else class="mod-classic__list">
        <div v-for="mod in availableMods" :key="`available-${mod.id}`" class="mod-classic__item mod-classic__item--row">
          <div class="mod-classic__item-info">
            <div class="mod-classic__item-title">
              {{ mod.name || mod.id }} <span v-if="mod.version">({{ mod.version }})</span>
            </div>
            <div v-if="mod.description" class="mod-classic__item-desc">{{ mod.description }}</div>
            <div class="mod-classic__item-meta">
              id: {{ mod.id }} | size: {{ mod.size || "medium" }}
            </div>
            <div v-if="mod.dependencies && mod.dependencies.required && mod.dependencies.required.length > 0" class="mod-classic__item-meta">
              depends: {{ mod.dependencies.required.join(", ") }}
            </div>
          </div>
          <button
            class="mod-classic__btn mod-classic__btn--toggle mod-classic__btn--small"
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
.mod-classic {
  padding: 1.8rem 2.2rem 2.8rem;
  color: #ffffff;
  font-family: Typewriter, serif;
  background: transparent;
}

.mod-classic__header {
  text-align: center;
  margin-bottom: 1.2rem;
}

.mod-classic__title {
  font-size: 1.8rem;
  letter-spacing: 0.08em;
  color: #ffffff;
}

.mod-classic__subtitle {
  margin-top: 0.3rem;
  font-size: 1.1rem;
  color: #ffffff;
}

.mod-classic__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.2rem;
  margin-bottom: 1.2rem;
}

.mod-classic__card {
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(80, 255, 120, 0.8);
  border-radius: 4px;
  padding: 1.3rem 1.5rem;
}

.mod-classic__card--tight {
  padding: 1.1rem 1.3rem;
}

.mod-classic__card--wide {
  margin-top: 0.4rem;
}

.mod-classic__label {
  font-size: 1.1rem;
  color: #ffffff;
  margin-bottom: 0.6rem;
  letter-spacing: 0.04em;
}

.mod-classic__toggle {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.mod-classic__btn {
  border-radius: 4px;
  padding: 0.5rem 1.2rem;
  font-size: 1.2rem;
  border: 1px solid rgba(255, 80, 80, 0.9);
  background: rgba(110, 20, 20, 0.9);
  color: #ffffff;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  cursor: pointer;
}

.mod-classic__btn.is-active {
  background: rgba(20, 120, 40, 0.95);
  border-color: rgba(80, 255, 120, 0.95);
}

.mod-classic__btn--small {
  min-width: 72px;
  text-align: center;
}

.mod-classic__btn--ghost {
  background: rgba(110, 20, 20, 0.35);
  color: #ffffff;
}

.mod-classic__input {
  width: 100%;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(80, 255, 120, 0.8);
  color: #ffffff;
  padding: 0.7rem 1rem;
  border-radius: 4px;
  font-size: 1.2rem;
}

.mod-classic__input:focus {
  outline: none;
  border-color: rgba(120, 255, 140, 1);
}

.mod-classic__zip-row {
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 0.9rem;
}

.mod-classic__file {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1.1rem;
  border-radius: 4px;
  border: 1px dashed rgba(80, 255, 120, 0.8);
  color: #ffffff;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.6);
}

.mod-classic__file-input {
  display: none;
}

.mod-classic__card-title {
  font-size: 1.2rem;
  color: #ffffff;
  margin-bottom: 0.8rem;
  letter-spacing: 0.05em;
}

.mod-classic__card-title--warn {
  color: #ffffff;
}

.mod-classic__list {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  max-height: 30rem;
  overflow: auto;
}

.mod-classic__item {
  padding-bottom: 0.7rem;
  border-bottom: 1px solid rgba(80, 255, 120, 0.35);
}

.mod-classic__item:last-child {
  border-bottom: none;
}

.mod-classic__item-title {
  font-size: 1.2rem;
  font-weight: bold;
}

.mod-classic__item-title--warn {
  color: #ffffff;
}

.mod-classic__item-desc {
  font-size: 1.1rem;
  color: #ffffff;
}

.mod-classic__item-meta {
  font-size: 1rem;
  color: #ffffff;
}

.mod-classic__item--row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}

.mod-classic__item-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.mod-classic__empty {
  font-size: 1.1rem;
  color: #ffffff;
}

@media (max-width: 900px) {
  .mod-classic__row {
    grid-template-columns: 1fr;
  }
  .mod-classic__item--row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
