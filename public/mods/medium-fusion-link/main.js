import { addStyle, createPanel, defineMod } from "../sdk/mod-common.js";

function hasLargeModsLoaded() {
  const loaded = window.ModManager?.mods || [];
  const ids = new Set(loaded.map(mod => mod.id));
  return ids.has("large-celestial-frontier") && ids.has("large-quantum-archives");
}

function antimatterLog() {
  const am = window.player?.antimatter;
  if (!am) return 0;
  if (typeof am.log10 === "function") return am.log10();
  return Math.log10(Number(am) || 1);
}

export default defineMod({
  stages: [
    {
      id: "fusion-boot",
      name: "Fusion Boot",
      description: "Requires both large packs and 1e20 antimatter.",
      unlockCondition: () => hasLargeModsLoaded(),
      completeCondition: () => hasLargeModsLoaded() && antimatterLog() >= 20,
    },
  ],
  achievements: [
    {
      id: "fusion-online",
      name: "Fusion Online",
      description: "Load both large packs at once.",
      condition: () => hasLargeModsLoaded(),
    },
  ],
  onInit(api) {
    addStyle(
      `
      .fusion-panel {
        position: fixed;
        left: 12px;
        bottom: 192px;
        z-index: 9997;
        background: rgba(0, 0, 0, 0.72);
        border: 1px solid rgba(120, 255, 170, 0.8);
        color: #fff;
        font-family: "PT Mono", monospace;
        font-size: 12px;
        border-radius: 4px;
        padding: 8px 10px;
        min-width: 220px;
      }
      .fusion-panel__title {
        color: #9effc8;
        font-weight: bold;
        margin-bottom: 4px;
      }
      `,
      "fusion-panel-style"
    );
    const panel = createPanel(api, { suffix: "fusion-panel", parentSelector: "body", className: "fusion-panel" });
    panel.innerHTML = `
      <div class="fusion-panel__title">Medium Fusion Link</div>
      <div id="fusion-status">Dependencies: waiting</div>
    `;
  },
  onUIUpdate() {
    const node = document.getElementById("fusion-status");
    if (!node) return;
    node.textContent = hasLargeModsLoaded() ? "Dependencies: ready" : "Dependencies: waiting";
  },
});
