import { addStyle, createSpeedController, defineMod, getGameSpeed } from "../sdk/mod-common.js";

const SPEED_OPTIONS = [1.5, 2, 3, 5, 10, 20, 100];
const STORAGE_KEY = "speedMultiplier";

function formatSpeed(value) {
  return `${value}x`;
}

export default defineMod({
  onInit(api) {
    const speed = createSpeedController(api, "speed-multiplier");
    addStyle(
      `
      .mod-speed-panel {
        position: fixed;
        right: 12px;
        bottom: 12px;
        background: rgba(0, 0, 0, 0.65);
        border: 1px solid rgba(80, 255, 120, 0.85);
        border-radius: 4px;
        padding: 8px 10px;
        color: #ffffff;
        font-family: "PT Mono", monospace;
        font-size: 12px;
        z-index: 9999;
      }
      .mod-speed-title {
        font-weight: bold;
        margin-bottom: 6px;
        letter-spacing: 0.06em;
      }
      .mod-speed-current {
        margin-bottom: 6px;
      }
      .mod-speed-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .mod-speed-btn {
        padding: 4px 8px;
        border-radius: 4px;
        border: 1px solid rgba(255, 80, 80, 0.85);
        background: rgba(110, 20, 20, 0.9);
        color: #ffffff;
        font-size: 12px;
        cursor: pointer;
      }
      .mod-speed-btn.is-active {
        background: rgba(20, 120, 40, 0.95);
        border-color: rgba(80, 255, 120, 0.95);
      }
      `,
      `mod-speed-style-${api.mod.id}`
    );

    const panel = api.ui.createContainer("speed-panel", "body");
    panel.className = "mod-speed-panel";

    const title = document.createElement("div");
    title.className = "mod-speed-title";
    title.textContent = "Speed Multiplier";

    const current = document.createElement("div");
    current.className = "mod-speed-current";

    const buttons = document.createElement("div");
    buttons.className = "mod-speed-buttons";

    const buttonNodes = new Map();

    function updateUI(activeValue) {
      current.textContent = `Current: ${formatSpeed(activeValue || getGameSpeed())}`;
      for (const [value, button] of buttonNodes.entries()) {
        button.classList.toggle("is-active", value === activeValue);
      }
    }

    function applySpeed(value) {
      if (!SPEED_OPTIONS.includes(value)) return;
      speed.set(value);
      api.storage.set(STORAGE_KEY, value);
      updateUI(value);
    }

    for (const value of SPEED_OPTIONS) {
      const button = document.createElement("button");
      button.className = "mod-speed-btn";
      button.textContent = formatSpeed(value);
      button.addEventListener("click", () => applySpeed(value));
      buttonNodes.set(value, button);
      buttons.appendChild(button);
    }

    panel.appendChild(title);
    panel.appendChild(current);
    panel.appendChild(buttons);

    const stored = api.storage.get(STORAGE_KEY, null);
    const initial = SPEED_OPTIONS.includes(stored) ? stored : null;
    if (initial) speed.set(initial);
    updateUI(initial);
  },
  onGameLoad(api) {
    const speed = createSpeedController(api, "speed-multiplier");
    const stored = api.storage.get(STORAGE_KEY, null);
    if (SPEED_OPTIONS.includes(stored)) {
      speed.set(stored);
    }
  }
});
