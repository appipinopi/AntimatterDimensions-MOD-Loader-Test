import { addStyle, createPanel, createSpeedController, defineMod } from "../sdk/mod-common.js";

const STORAGE_KEY = "speedOption";
const OPTIONS = [1, 1.5, 2, 3];

export default defineMod({
  onInit(api) {
    const speed = createSpeedController(api, "small-safe-speed");

    addStyle(
      `
      .small-speed-panel {
        position: fixed;
        right: 12px;
        bottom: 12px;
        z-index: 9997;
        background: rgba(0, 0, 0, 0.72);
        border: 1px solid rgba(255, 170, 80, 0.8);
        color: #fff;
        font-family: "PT Mono", monospace;
        font-size: 12px;
        border-radius: 4px;
        padding: 8px 10px;
        min-width: 200px;
      }
      .small-speed-title {
        color: #ffc47d;
        font-weight: bold;
        margin-bottom: 6px;
      }
      .small-speed-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .small-speed-btn {
        border: 1px solid rgba(255, 140, 80, 0.9);
        background: rgba(120, 30, 20, 0.85);
        color: #fff;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        padding: 4px 8px;
      }
      `,
      "small-safe-speed-style"
    );

    const panel = createPanel(api, { suffix: "small-speed-panel", parentSelector: "body", className: "small-speed-panel" });
    const title = document.createElement("div");
    title.className = "small-speed-title";
    title.textContent = "Small Safe Speed";

    const status = document.createElement("div");
    status.id = "small-safe-speed-status";
    status.textContent = `Current total speed: ${speed.get().toFixed(2)}x`;

    const buttons = document.createElement("div");
    buttons.className = "small-speed-buttons";

    const apply = value => {
      speed.set(value);
      api.storage.set(STORAGE_KEY, value);
      status.textContent = `Current total speed: ${speed.get().toFixed(2)}x`;
    };

    for (const value of OPTIONS) {
      const button = document.createElement("button");
      button.className = "small-speed-btn";
      button.textContent = `${value}x`;
      button.addEventListener("click", () => apply(value));
      buttons.appendChild(button);
    }

    panel.innerHTML = "";
    panel.appendChild(title);
    panel.appendChild(status);
    panel.appendChild(buttons);

    const stored = Number(api.storage.get(STORAGE_KEY, 1));
    if (OPTIONS.includes(stored)) apply(stored);
  },
});
