import { addStyle, createPanel, defineMod } from "../sdk/mod-common.js";

function antimatterLog() {
  const am = window.player?.antimatter;
  if (!am) return 0;
  if (typeof am.log10 === "function") return am.log10();
  return Math.log10(Number(am) || 1);
}

export default defineMod({
  stages: [
    {
      id: "frontier-scout",
      name: "Frontier Scout",
      description: "Reach 1e12 antimatter.",
      unlockCondition: () => true,
      completeCondition: () => antimatterLog() >= 12,
    },
    {
      id: "frontier-master",
      name: "Frontier Master",
      description: "Reach 1e30 antimatter.",
      unlockCondition: () => antimatterLog() >= 12,
      completeCondition: () => antimatterLog() >= 30,
    },
  ],
  achievements: [
    {
      id: "frontier-launch",
      name: "Frontier Launch",
      description: "Reach 1e15 antimatter.",
      condition: () => antimatterLog() >= 15,
    },
    {
      id: "frontier-zenith",
      name: "Frontier Zenith",
      description: "Reach 1e40 antimatter.",
      condition: () => antimatterLog() >= 40,
    },
  ],
  onInit(api) {
    addStyle(
      `
      .frontier-panel {
        position: fixed;
        left: 12px;
        bottom: 12px;
        z-index: 9997;
        background: rgba(0, 0, 0, 0.72);
        border: 1px solid rgba(60, 200, 255, 0.8);
        color: #fff;
        font-family: "PT Mono", monospace;
        font-size: 12px;
        border-radius: 4px;
        padding: 8px 10px;
        min-width: 220px;
      }
      .frontier-panel__title {
        color: #7dd5ff;
        font-weight: bold;
        margin-bottom: 4px;
      }
      `,
      "frontier-panel-style"
    );
    const panel = createPanel(api, { suffix: "frontier-panel", parentSelector: "body", className: "frontier-panel" });
    panel.innerHTML = `
      <div class="frontier-panel__title">Large Celestial Frontier</div>
      <div id="frontier-am-log">AM Log10: 0</div>
    `;
  },
  onUIUpdate() {
    const node = document.getElementById("frontier-am-log");
    if (!node) return;
    node.textContent = `AM Log10: ${antimatterLog().toFixed(2)}`;
  },
});
