<script>
import OptionsButton from "@/components/OptionsButton";
import PrimaryToggleButton from "@/components/PrimaryToggleButton";
import { ModManager } from "@/core/mods/mod-manager";

export default {
  name: "OptionsModsTab",
  components: {
    OptionsButton,
    PrimaryToggleButton,
  },
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
  watch: {
    modSourceIsUrl(newValue) {
      const mode = newValue ? "url" : "zip";
      this.applyModConfig({ mode });
    },
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
    }
  }
};
</script>

<template>
  <div class="l-options-tab">
    <div class="l-options-grid">
      <div class="l-options-grid__row">
        <PrimaryToggleButton
          v-model="modSourceIsUrl"
          class="o-primary-btn--option l-options-grid__button l-toggle-button"
          label="Mod source:"
          on="URL"
          off="ZIP"
        />
        <OptionsButton
          class="o-primary-btn--option l-options-grid__button"
          @click="reloadMods"
        >
          Reload Mods
        </OptionsButton>
      </div>
      <div
        v-if="modSourceIsUrl"
        class="l-options-grid__row"
      >
        <div class="o-primary-btn o-primary-btn--option o-primary-btn--input l-options-grid__button c-mod-loader-input">
          <b>Mod list URL:</b>
          <input
            class="c-mod-loader-input__field"
            type="text"
            placeholder="mods/mods.json or https://..."
            :value="modListUrl"
            @change="handleModListUrlChange"
          >
        </div>
      </div>
      <div
        v-else
        class="l-options-grid__row"
      >
        <div class="o-primary-btn o-primary-btn--option o-primary-btn--input l-options-grid__button c-mod-loader-input">
          <b>ZIP URL:</b>
          <input
            class="c-mod-loader-input__field"
            type="text"
            placeholder="https://example.com/mods.zip"
            :value="modZipUrl"
            @change="handleModZipUrlChange"
          >
        </div>
        <OptionsButton class="c-file-import-button">
          <input
            class="c-file-import"
            type="file"
            accept=".zip"
            @change="onZipFileSelected"
          >
          <label for="file">Choose ZIP</label>
        </OptionsButton>
        <OptionsButton
          class="o-primary-btn--option l-options-grid__button"
          @click="loadZipFile"
        >
          Load ZIP {{ modZipFileName ? `(${modZipFileName})` : "" }}
        </OptionsButton>
      </div>
      <div class="l-options-grid__row">
        <div class="o-primary-btn o-primary-btn--option l-options-grid__button c-mod-loader-list">
          <b>Loaded Mods ({{ loadedMods.length }})</b>
          <div v-if="loadedMods.length === 0" class="c-mod-loader-list__empty">
            No mods loaded
          </div>
          <div v-else class="c-mod-loader-list__items">
            <div
              v-for="mod in loadedMods"
              :key="mod.id"
              class="c-mod-loader-list__item"
            >
              <div class="c-mod-loader-list__title">
                {{ mod.name }} ({{ mod.version }})
              </div>
              <div v-if="mod.description" class="c-mod-loader-list__desc">
                {{ mod.description }}
              </div>
              <div class="c-mod-loader-list__meta">
                id: {{ mod.id }}
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="modErrors.length > 0"
          class="o-primary-btn o-primary-btn--option l-options-grid__button c-mod-loader-list"
        >
          <b>Mod Errors ({{ modErrors.length }})</b>
          <div class="c-mod-loader-list__items">
            <div
              v-for="(err, index) in modErrors"
              :key="`${err.id || 'unknown'}-${index}`"
              class="c-mod-loader-list__item"
            >
              <div class="c-mod-loader-list__title">
                {{ err.id || "unknown" }}
              </div>
              <div class="c-mod-loader-list__desc">
                {{ err.error?.message || "Unknown error" }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="l-options-grid__row">
        <div class="o-primary-btn o-primary-btn--option l-options-grid__button c-mod-loader-list">
          <b>Available Mods ({{ availableMods.length }})</b>
          <div v-if="availableMods.length === 0" class="c-mod-loader-list__empty">
            No mods found
          </div>
          <div v-else class="c-mod-loader-list__items">
            <div
              v-for="mod in availableMods"
              :key="`available-${mod.id}`"
              class="c-mod-loader-list__item c-mod-loader-list__item--row"
            >
              <div class="c-mod-loader-list__info">
                <div class="c-mod-loader-list__title">
                  {{ mod.name || mod.id }} <span v-if="mod.version">({{ mod.version }})</span>
                </div>
                <div v-if="mod.description" class="c-mod-loader-list__desc">
                  {{ mod.description }}
                </div>
                <div class="c-mod-loader-list__meta">
                  id: {{ mod.id }}
                </div>
              </div>
              <PrimaryToggleButton
                :value="isModEnabled(mod.id)"
                class="o-primary-btn--option l-options-grid__button"
                label="Enabled:"
                on="ON"
                off="OFF"
                @input="setModEnabled(mod.id, $event)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.l-toggle-button {
  font-size: 12px;
}

.c-mod-loader-input {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.c-mod-loader-input__field {
  text-align: center;
  font-family: Typewriter;
  font-size: 1.2rem;
  font-weight: bold;
  border: 0.1rem solid black;
  border-radius: var(--var-border-radius, 0.3rem);
}

.c-mod-loader-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  text-align: left;
  max-height: 40rem;
  overflow: auto;
}

.c-mod-loader-list__items {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.c-mod-loader-list__item {
  padding: 0.4rem 0.2rem;
  border-bottom: 0.1rem solid rgba(0, 0, 0, 0.2);
}

.c-mod-loader-list__item:last-child {
  border-bottom: none;
}

.c-mod-loader-list__title {
  font-weight: bold;
}

.c-mod-loader-list__desc {
  font-size: 1.2rem;
  opacity: 0.85;
}

.c-mod-loader-list__meta {
  font-size: 1.1rem;
  opacity: 0.7;
}

.c-mod-loader-list__empty {
  font-size: 1.2rem;
  opacity: 0.7;
}

.c-mod-loader-list__item--row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.c-mod-loader-list__info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
</style>
