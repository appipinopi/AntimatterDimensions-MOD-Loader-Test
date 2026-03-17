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
</style>
