<script>
import { ModManager } from "@/core/mods/mod-manager";

export default {
  name: "OptionsModsTab",
  data() {
    return {
      modSourceMode: "repository",
      modZipFileName: "",
      modZipFile: null,
      loadedMods: [],
      modErrors: [],
      availableMods: [],
      repositories: [],
      repositoryTopicSearchUrl: "",
      modSearchQuery: "",
      selectedRepository: "all",
      settingsEditor: null,
      settingsDraft: {},
      settingsError: "",
    };
  },
  computed: {
    isRepositoryMode() {
      return this.modSourceMode !== "zip";
    },
    filteredAvailableMods() {
      const query = this.modSearchQuery.trim().toLowerCase();
      return this.availableMods
        .filter(mod => {
          if (this.selectedRepository !== "all") {
            const modRepos = Array.isArray(mod.repositoryIds) ? mod.repositoryIds : [];
            if (!modRepos.includes(this.selectedRepository)) return false;
          }

          if (!query) return true;

          const haystack = [
            mod.name,
            mod.id,
            mod.description,
            mod.author,
            mod.repo,
            ...(Array.isArray(mod.tags) ? mod.tags : []),
            ...(Array.isArray(mod.repositoryNames) ? mod.repositoryNames : []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(query);
        })
        .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    },
    activeSettingsSchema() {
      return Array.isArray(this.settingsEditor?.schema) ? this.settingsEditor.schema : [];
    },
    activeSettingsMissingRequired() {
      const schema = this.activeSettingsSchema;
      return schema
        .filter(setting => setting.required)
        .map(setting => setting.key)
        .filter(key => {
          const value = this.settingsDraft[key];
          return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
        });
    },
  },
  methods: {
    update() {
      const modConfig = ModManager.getConfig();
      this.modSourceMode = modConfig.mode === "zip" ? "zip" : "repository";
      this.loadedMods = ModManager.mods.slice();
      this.modErrors = ModManager.errors.slice();
      this.availableMods = ModManager.getAvailableMods();
      this.repositories = ModManager.getRepositories();
      this.repositoryTopicSearchUrl = ModManager.getRepositoryTopicSearchUrl();

      if (this.selectedRepository !== "all") {
        const exists = this.repositories.some(repo => repo.id === this.selectedRepository);
        if (!exists) this.selectedRepository = "all";
      }
    },
    setSource(mode) {
      if (mode !== "repository" && mode !== "zip") return;
      this.modSourceMode = mode;
      this.applyModConfig({ mode });
    },
    applyModConfig(partial) {
      const next = ModManager.setConfig(partial);
      if (!player.options.modLoader) player.options.modLoader = {};
      player.options.modLoader.mode = next.mode;
      player.options.modLoader.zipUrl = next.zipUrl;
      player.options.modLoader.disabledMods = next.disabledMods;
    },
    async reloadMods() {
      await ModManager.reload();
      if (GameUI?.notify?.info) GameUI.notify.info("Mods reloaded");
      this.loadedMods = ModManager.mods.slice();
      this.modErrors = ModManager.errors.slice();
      this.availableMods = ModManager.getAvailableMods();
      this.repositories = ModManager.getRepositories();
      this.repositoryTopicSearchUrl = ModManager.getRepositoryTopicSearchUrl();
    },
    onZipFileSelected(event) {
      if (!event.target.files || event.target.files.length === 0) return;
      this.modZipFile = event.target.files[0];
      this.modZipFileName = this.modZipFile.name;
    },
    async loadZipFile() {
      if (!this.modZipFile) return;
      if (this.modSourceMode !== "zip") {
        this.modSourceMode = "zip";
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
    },
    formatRepositoryStatus(repo) {
      if (!repo) return "unknown";
      if (repo.status === "loaded") return `loaded (${repo.modCount} mods)`;
      if (repo.status === "disabled") return "disabled";
      if (repo.status === "error") return "error";
      return repo.status || "pending";
    },
    hasModSettings(mod) {
      return Array.isArray(mod?.settingsSchema) && mod.settingsSchema.length > 0;
    },
    openModSettings(mod) {
      if (!mod || !mod.id) return;
      const state = ModManager.getModSettingsState(mod.id);
      this.settingsEditor = {
        modId: mod.id,
        modName: mod.name || mod.id,
        schema: state.schema || [],
      };
      this.settingsDraft = { ...(state.values || {}) };
      this.settingsError = "";
    },
    closeModSettings() {
      this.settingsEditor = null;
      this.settingsDraft = {};
      this.settingsError = "";
    },
    setDraftValue(key, value) {
      this.$set(this.settingsDraft, key, value);
    },
    async saveModSettings() {
      if (!this.settingsEditor?.modId) return;
      this.settingsError = "";
      try {
        ModManager.setModSettings(this.settingsEditor.modId, this.settingsDraft);
        await this.reloadMods();
        const refreshed = ModManager.getModSettingsState(this.settingsEditor.modId);
        this.settingsEditor = {
          ...this.settingsEditor,
          schema: refreshed.schema || [],
        };
        this.settingsDraft = { ...(refreshed.values || {}) };
        if (GameUI?.notify?.info) GameUI.notify.info("Mod settings saved");
      } catch (error) {
        this.settingsError = error?.message || "Failed to save settings";
      }
    },
    async resetModSettings() {
      if (!this.settingsEditor?.modId) return;
      ModManager.resetModSettings(this.settingsEditor.modId);
      await this.reloadMods();
      const refreshed = ModManager.getModSettingsState(this.settingsEditor.modId);
      this.settingsEditor = {
        ...this.settingsEditor,
        schema: refreshed.schema || [],
      };
      this.settingsDraft = { ...(refreshed.values || {}) };
      this.settingsError = "";
      if (GameUI?.notify?.info) GameUI.notify.info("Mod settings reset");
    },
    formatSettingInputId(modId, key) {
      return `mod-setting-${modId}-${key}`;
    },
  }
};
</script>

<template>
  <div class="mod-classic">
    <div class="mod-classic__header">
      <div class="mod-classic__title">MOD MENU</div>
      <div class="mod-classic__subtitle">Manage repositories, zip imports, and mod states</div>
    </div>

    <div class="mod-classic__row">
      <div class="mod-classic__card mod-classic__card--tight">
        <div class="mod-classic__label">Source Select</div>
        <div class="mod-classic__toggle">
          <button
            class="mod-classic__btn mod-classic__btn--toggle"
            :class="{ 'is-active': modSourceMode === 'repository' }"
            @click="setSource('repository')"
          >
            REPOSITORY
          </button>
          <button
            class="mod-classic__btn mod-classic__btn--toggle"
            :class="{ 'is-active': modSourceMode === 'zip' }"
            @click="setSource('zip')"
          >
            ZIP
          </button>
        </div>
      </div>
      <div class="mod-classic__card mod-classic__card--tight">
        <div class="mod-classic__label">Action</div>
        <button class="mod-classic__btn" @click="reloadMods">Reload Mods</button>
      </div>
    </div>

    <div class="mod-classic__card" v-if="isRepositoryMode">
      <div class="mod-classic__label">Repositories ({{ repositories.length }})</div>
      <div v-if="repositoryTopicSearchUrl" class="mod-classic__item-meta mod-classic__repo-topic">
        topic search:
        <a
          class="mod-classic__link"
          :href="repositoryTopicSearchUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ repositoryTopicSearchUrl }}
        </a>
      </div>
      <div v-if="repositories.length === 0" class="mod-classic__empty">
        No repositories configured. Add entries in <code>public/mods/repositories.json</code>.
      </div>
      <div v-else class="mod-classic__list">
        <div v-for="repo in repositories" :key="repo.id" class="mod-classic__item">
          <div class="mod-classic__item-title">{{ repo.name }}</div>
          <div class="mod-classic__item-meta">id: {{ repo.id }} | status: {{ formatRepositoryStatus(repo) }}</div>
          <div v-if="repo.description" class="mod-classic__item-desc">{{ repo.description }}</div>
          <div v-if="repo.homepage" class="mod-classic__item-meta">
            repo: <a class="mod-classic__link" :href="repo.homepage" target="_blank" rel="noopener noreferrer">{{ repo.homepage }}</a>
          </div>
          <div v-if="repo.error" class="mod-classic__item-meta">error: {{ repo.error }}</div>
        </div>
      </div>
    </div>

    <div class="mod-classic__card" v-else>
      <div class="mod-classic__label">ZIP Source</div>
      <div class="mod-classic__item-meta">Load a local ZIP file. The last loaded ZIP stays available on next launch.</div>
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
          Load ZIP
        </button>
      </div>
      <div class="mod-classic__item-meta" v-if="modZipFileName">
        Selected: {{ modZipFileName }}
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
            <div v-if="mod.author" class="mod-classic__item-meta">author: {{ mod.author }}</div>
            <div v-if="mod.dependencies && mod.dependencies.required && mod.dependencies.required.length > 0" class="mod-classic__item-meta">
              depends: {{ mod.dependencies.required.join(", ") }}
            </div>
            <div v-if="mod.tags && mod.tags.length > 0" class="mod-classic__item-meta">
              tags: {{ mod.tags.join(", ") }}
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
      <div class="mod-classic__card-head-row">
        <div class="mod-classic__card-title">Available Mods ({{ filteredAvailableMods.length }})</div>
        <div class="mod-classic__filters">
          <input
            class="mod-classic__input mod-classic__input--search"
            type="text"
            v-model="modSearchQuery"
            placeholder="Search AD mods by name / id / tags"
          >
          <select class="mod-classic__input mod-classic__select" v-model="selectedRepository">
            <option value="all">All repositories</option>
            <option v-for="repo in repositories" :key="`filter-${repo.id}`" :value="repo.id">
              {{ repo.name }}
            </option>
          </select>
        </div>
      </div>
      <div v-if="filteredAvailableMods.length === 0" class="mod-classic__empty">No matching mods</div>
      <div v-else class="mod-classic__list">
        <div v-for="mod in filteredAvailableMods" :key="`available-${mod.id}`" class="mod-classic__item mod-classic__item--row">
          <div class="mod-classic__item-info">
            <div class="mod-classic__item-title">
              {{ mod.name || mod.id }} <span v-if="mod.version">({{ mod.version }})</span>
            </div>
            <div v-if="mod.description" class="mod-classic__item-desc">{{ mod.description }}</div>
            <div class="mod-classic__item-meta">
              id: {{ mod.id }} | size: {{ mod.size || "medium" }}
            </div>
            <div v-if="mod.author" class="mod-classic__item-meta">author: {{ mod.author }}</div>
            <div v-if="mod.repositoryNames && mod.repositoryNames.length > 0" class="mod-classic__item-meta">
              repository: {{ mod.repositoryNames.join(", ") }}
            </div>
            <div v-if="mod.dependencies && mod.dependencies.required && mod.dependencies.required.length > 0" class="mod-classic__item-meta">
              depends: {{ mod.dependencies.required.join(", ") }}
            </div>
            <div v-if="mod.dependencies && mod.dependencies.loadAfter && mod.dependencies.loadAfter.length > 0" class="mod-classic__item-meta">
              load-after: {{ mod.dependencies.loadAfter.join(", ") }}
            </div>
            <div v-if="mod.tags && mod.tags.length > 0" class="mod-classic__item-meta">
              tags: {{ mod.tags.join(", ") }}
            </div>
            <div v-if="mod.settingsSchema && mod.settingsSchema.length > 0" class="mod-classic__item-meta">
              settings: {{ mod.settingsSchema.length }}
            </div>
            <div
              v-if="mod.requiredSettingsMissing && mod.requiredSettingsMissing.length > 0"
              class="mod-classic__item-meta mod-classic__item-meta--warn"
            >
              required settings missing: {{ mod.requiredSettingsMissing.join(", ") }}
            </div>
          </div>
          <div class="mod-classic__item-actions">
            <button
              class="mod-classic__btn mod-classic__btn--ghost mod-classic__btn--small"
              :disabled="!hasModSettings(mod)"
              @click="openModSettings(mod)"
            >
              SETTINGS
            </button>
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

    <div v-if="settingsEditor" class="mod-classic__card mod-classic__card--wide">
      <div class="mod-classic__card-head-row">
        <div class="mod-classic__card-title">Settings: {{ settingsEditor.modName }}</div>
        <div class="mod-classic__filters">
          <button class="mod-classic__btn mod-classic__btn--ghost mod-classic__btn--small" @click="resetModSettings">
            RESET
          </button>
          <button class="mod-classic__btn mod-classic__btn--small" @click="saveModSettings">
            SAVE
          </button>
          <button class="mod-classic__btn mod-classic__btn--ghost mod-classic__btn--small" @click="closeModSettings">
            CLOSE
          </button>
        </div>
      </div>
      <div
        v-if="activeSettingsMissingRequired.length > 0"
        class="mod-classic__item-meta mod-classic__item-meta--warn mod-classic__settings-warning"
      >
        required settings missing: {{ activeSettingsMissingRequired.join(", ") }}
      </div>
      <div v-if="settingsError" class="mod-classic__item-meta mod-classic__item-meta--warn mod-classic__settings-warning">
        {{ settingsError }}
      </div>
      <div v-if="activeSettingsSchema.length === 0" class="mod-classic__empty">No configurable settings in manifest</div>
      <div v-else class="mod-classic__settings-list">
        <div v-for="setting in activeSettingsSchema" :key="setting.key" class="mod-classic__settings-item">
          <label class="mod-classic__settings-label" :for="formatSettingInputId(settingsEditor.modId, setting.key)">
            {{ setting.label }}
            <span v-if="setting.required" class="mod-classic__settings-required">*</span>
          </label>
          <div v-if="setting.description" class="mod-classic__item-meta">{{ setting.description }}</div>
          <input
            v-if="setting.type === 'string'"
            :id="formatSettingInputId(settingsEditor.modId, setting.key)"
            class="mod-classic__input"
            type="text"
            :value="settingsDraft[setting.key] === undefined || settingsDraft[setting.key] === null ? '' : settingsDraft[setting.key]"
            @input="setDraftValue(setting.key, $event.target.value)"
          >
          <input
            v-else-if="setting.type === 'number'"
            :id="formatSettingInputId(settingsEditor.modId, setting.key)"
            class="mod-classic__input"
            type="number"
            :min="setting.min"
            :max="setting.max"
            :step="setting.step || 1"
            :value="settingsDraft[setting.key] === undefined || settingsDraft[setting.key] === null ? '' : settingsDraft[setting.key]"
            @input="setDraftValue(setting.key, $event.target.value)"
          >
          <select
            v-else-if="setting.type === 'select'"
            :id="formatSettingInputId(settingsEditor.modId, setting.key)"
            class="mod-classic__input mod-classic__select"
            :value="settingsDraft[setting.key] === undefined || settingsDraft[setting.key] === null ? '' : settingsDraft[setting.key]"
            @change="setDraftValue(setting.key, $event.target.value)"
          >
            <option value="">-- select --</option>
            <option v-for="option in (setting.options || [])" :key="`${setting.key}-${option.label}`" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <label v-else-if="setting.type === 'boolean'" class="mod-classic__settings-checkbox">
            <input
              :id="formatSettingInputId(settingsEditor.modId, setting.key)"
              type="checkbox"
              :checked="Boolean(settingsDraft[setting.key])"
              @change="setDraftValue(setting.key, $event.target.checked)"
            >
            <span>{{ Boolean(settingsDraft[setting.key]) ? "Enabled" : "Disabled" }}</span>
          </label>
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

.mod-classic__card-head-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  margin-bottom: 0.8rem;
  flex-wrap: wrap;
}

.mod-classic__filters {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
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

.mod-classic__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.mod-classic__input {
  width: 100%;
  min-width: 20rem;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(80, 255, 120, 0.8);
  color: #ffffff;
  padding: 0.7rem 1rem;
  border-radius: 4px;
  font-size: 1.2rem;
}

.mod-classic__input--search {
  min-width: 28rem;
}

.mod-classic__select {
  min-width: 20rem;
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

.mod-classic__item-meta--warn {
  color: #ffffff;
}

.mod-classic__repo-topic {
  margin-bottom: 0.8rem;
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

.mod-classic__item-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.mod-classic__settings-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.mod-classic__settings-item {
  border-bottom: 1px solid rgba(80, 255, 120, 0.35);
  padding-bottom: 0.8rem;
}

.mod-classic__settings-item:last-child {
  border-bottom: none;
}

.mod-classic__settings-label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
  color: #ffffff;
}

.mod-classic__settings-required {
  margin-left: 0.2rem;
}

.mod-classic__settings-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  font-size: 1rem;
  color: #ffffff;
}

.mod-classic__settings-warning {
  margin-bottom: 0.8rem;
}

.mod-classic__link {
  color: #ffffff;
  word-break: break-all;
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

  .mod-classic__item-actions {
    width: 100%;
  }

  .mod-classic__input,
  .mod-classic__input--search,
  .mod-classic__select {
    min-width: 100%;
  }
}
</style>
