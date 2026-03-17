<script>
import OpenModalHotkeysButton from "@/components/OpenModalHotkeysButton";
import OptionsButton from "@/components/OptionsButton";
import PrimaryToggleButton from "@/components/PrimaryToggleButton";
import SliderComponent from "@/components/SliderComponent";
import { ModManager } from "@/core/mods/mod-manager";

export default {
  name: "OptionsGameplayTab",
  components: {
    OpenModalHotkeysButton,
    OptionsButton,
    PrimaryToggleButton,
    SliderComponent
  },
  data() {
    return {
      offlineProgress: false,
      hibernationCatchup: false,
      hotkeys: false,
      offlineSlider: 0,
      offlineTicks: 0,
      automaticTabSwitching: false,
      infinityUnlocked: false,
      automatorUnlocked: false,
      automatorLogSize: 0,
      modSourceIsUrl: true,
      modListUrl: "",
      modCdnBaseUrl: "",
      modZipUrl: "",
      modZipFileName: "",
      modZipFile: null,
    };
  },
  computed: {
    sliderPropsOfflineTicks() {
      return {
        min: 22,
        max: 54,
        interval: 1,
        width: "100%",
        tooltip: false
      };
    },
    sliderPropsAutomatorLogSize() {
      return {
        min: 50,
        max: 500,
        interval: 50,
        width: "100%",
        tooltip: false
      };
    }
  },
  watch: {
    offlineProgress(newValue) {
      player.options.offlineProgress = newValue;
    },
    hibernationCatchup(newValue) {
      player.options.hibernationCatchup = newValue;
    },
    hotkeys(newValue) {
      player.options.hotkeys = newValue;
    },
    offlineSlider(newValue) {
      player.options.offlineTicks = this.parseOfflineSlider(newValue);
    },
    automaticTabSwitching(newValue) {
      player.options.automaticTabSwitching = newValue;
    },
    automatorLogSize(newValue) {
      player.options.automatorEvents.maxEntries = parseInt(newValue, 10);
    },
    modSourceIsUrl(newValue) {
      const mode = newValue ? "url" : "zip";
      this.applyModConfig({ mode });
    },
  },
  // This puts the slider in the right spot on initialization
  created() {
    const ticks = player.options.offlineTicks;
    const exponent = Math.floor(Math.log10(ticks));
    const mantissa = (ticks / Math.pow(10, exponent)) - 1;
    this.offlineSlider = 9 * exponent + mantissa;
  },
  methods: {
    update() {
      const options = player.options;
      this.offlineProgress = options.offlineProgress;
      this.hibernationCatchup = options.hibernationCatchup;
      this.hotkeys = options.hotkeys;
      this.offlineTicks = player.options.offlineTicks;
      this.automaticTabSwitching = options.automaticTabSwitching;
      this.infinityUnlocked = PlayerProgress.current.isInfinityUnlocked;
      this.automatorUnlocked = Player.automatorUnlocked;
      this.automatorLogSize = options.automatorEvents.maxEntries;
      const modConfig = ModManager.getConfig();
      this.modSourceIsUrl = modConfig.mode !== "zip";
      this.modListUrl = modConfig.listUrl;
      this.modCdnBaseUrl = modConfig.cdnBaseUrl;
      this.modZipUrl = modConfig.zipUrl;
    },
    // Given the endpoints of 22-54, this produces 500, 600, ... , 900, 1000, 2000, ... , 1e6 ticks
    // It's essentially 10^(x/10) but with the mantissa spaced linearly instead of logarithmically
    parseOfflineSlider(str) {
      const value = parseInt(str, 10);
      return (1 + value % 9) * Math.pow(10, Math.floor(value / 9));
    },
    adjustSliderValueOfflineTicks(value) {
      this.offlineSlider = value;
      player.options.offlineTicks = this.parseOfflineSlider(value);
    },
    adjustSliderValueAutomatorLogSize(value) {
      this.automatorLogSize = value;
      player.options.automatorEvents.maxEntries = this.automatorLogSize;
    },
    applyModConfig(partial) {
      const next = ModManager.setConfig(partial);
      if (!player.options.modLoader) player.options.modLoader = {};
      player.options.modLoader.mode = next.mode;
      player.options.modLoader.listUrl = next.listUrl;
      player.options.modLoader.cdnBaseUrl = next.cdnBaseUrl;
      player.options.modLoader.zipUrl = next.zipUrl;
    },
    handleModListUrlChange(event) {
      const value = event.target.value.trim();
      this.modListUrl = value;
      this.applyModConfig({ listUrl: value });
    },
    handleModCdnBaseUrlChange(event) {
      const value = event.target.value.trim();
      this.modCdnBaseUrl = value;
      this.applyModConfig({ cdnBaseUrl: value });
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
        <OptionsButton
          class="o-primary-btn--option"
          onclick="Modal.confirmationOptions.show()"
        >
          Open Confirmation Options
        </OptionsButton>
        <PrimaryToggleButton
          v-model="hotkeys"
          class="o-primary-btn--option l-options-grid__button"
          label="Hotkeys:"
          on="Enabled"
          off="Disabled"
        />
        <PrimaryToggleButton
          v-model="automaticTabSwitching"
          class="o-primary-btn--option l-options-grid__button l-toggle-button"
          label="Switch tabs on some events (e.g. entering challenges):"
        />
      </div>
      <div class="l-options-grid__row">
        <PrimaryToggleButton
          v-model="offlineProgress"
          class="o-primary-btn--option l-options-grid__button"
          label="Offline progress:"
        />
        <div class="o-primary-btn o-primary-btn--option o-primary-btn--slider l-options-grid__button">
          <b>Offline ticks: {{ formatInt(offlineTicks) }}</b>
          <SliderComponent
            class="o-primary-btn--slider__slider"
            v-bind="sliderPropsOfflineTicks"
            :value="offlineSlider"
            @input="adjustSliderValueOfflineTicks($event)"
          />
        </div>
        <PrimaryToggleButton
          v-model="hibernationCatchup"
          class="o-primary-btn--option l-options-grid__button"
          label="Run suspended time as offline:"
        />
      </div>
      <div class="l-options-grid__row">
        <div
          v-if="automatorUnlocked"
          class="o-primary-btn o-primary-btn--option o-primary-btn--slider l-options-grid__button"
        >
          <b>Automator Log Max: {{ formatInt(parseInt(automatorLogSize)) }}</b>
          <SliderComponent
            class="o-primary-btn--slider__slider"
            v-bind="sliderPropsAutomatorLogSize"
            :value="automatorLogSize"
            @input="adjustSliderValueAutomatorLogSize($event)"
          />
        </div>
      </div>
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
        <div class="o-primary-btn o-primary-btn--option o-primary-btn--input l-options-grid__button c-mod-loader-input">
          <b>CDN base URL:</b>
          <input
            class="c-mod-loader-input__field"
            type="text"
            placeholder="https://cdn.example.com/"
            :value="modCdnBaseUrl"
            @change="handleModCdnBaseUrlChange"
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
      <OpenModalHotkeysButton />
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
