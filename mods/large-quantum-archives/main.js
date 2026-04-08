import { addStyle, createPanel, defineMod } from "../sdk/mod-common.js";

function infinityPointsLog() {
  const ip = window.player?.infinityPoints;
  if (!ip) return 0;
  if (typeof ip.log10 === "function") return ip.log10();
  return Math.log10(Number(ip) || 1);
}

export default defineMod({
  stages: [
    {
      id: "archives-scan",
      name: "Archives Scan",
      description: "Reach 1e3 Infinity Points.",
      unlockCondition: () => true,
      completeCondition: () => infinityPointsLog() >= 3,
    },
    {
      id: "archives-core",
      name: "Archives Core",
      description: "Reach 1e8 Infinity Points.",
      unlockCondition: () => infinityPointsLog() >= 3,
      completeCondition: () => infinityPointsLog() >= 8,
    },
  ],
  achievements: [
    {
      id: "archives-awakened",
      name: "Archives Awakened",
      description: "Reach 1e5 Infinity Points.",
      condition: () => infinityPointsLog() >= 5,
    },
    {
      id: "archives-overclock",
      name: "Archives Overclock",
      description: "Reach 1e10 Infinity Points.",
      condition: () => infinityPointsLog() >= 10,
    },
  ],
  onInit(api) {
    addStyle(
      `
      .archives-panel {
        position: fixed;
        left: 12px;
        bottom: 102px;
        z-index: 9997;
        background: rgba(0, 0, 0, 0.72);
        border: 1px solid rgba(200, 120, 255, 0.8);
        color: #fff;
        font-family: "PT Mono", monospace;
        font-size: 12px;
        border-radius: 4px;
        padding: 8px 10px;
        min-width: 220px;
      }
      .archives-panel__title {
        color: #dc97ff;
        font-weight: bold;
        margin-bottom: 4px;
      }
      `,
      "archives-panel-style"
    );
    const panel = createPanel(api, { suffix: "archives-panel", parentSelector: "body", className: "archives-panel" });
    panel.innerHTML = `
      <div class="archives-panel__title">Large Quantum Archives</div>
      <div id="archives-ip-log">IP Log10: 0</div>
    `;
  },
  onUIUpdate() {
    const node = document.getElementById("archives-ip-log");
    if (!node) return;
    node.textContent = `IP Log10: ${infinityPointsLog().toFixed(2)}`;
  },
});
