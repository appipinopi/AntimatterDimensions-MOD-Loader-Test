import { addStyle, defineMod } from "../sdk/mod-sdk.js";

export default defineMod({
  onInit(api) {
    api.logger.info("Registering");
    addStyle(
      `
      .mod-badge-container {
        position: fixed;
        right: 10px;
        bottom: 10px;
        padding: 6px 10px;
        background: rgba(0, 0, 0, 0.65);
        color: #ffffff;
        font-family: "PT Mono", monospace;
        font-size: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        z-index: 9999;
        pointer-events: none;
      }
      `,
      `mod-style-${api.mod.id}`
    );

    const container = api.ui.createContainer("badge", "body");
    container.className = "mod-badge-container";
    container.textContent = `${api.mod.name} active`;
  },
  onGameLoad(api) {
    api.logger.info("Game loaded");
  },
});
