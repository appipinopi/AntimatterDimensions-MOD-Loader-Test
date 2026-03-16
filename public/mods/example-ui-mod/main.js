export default function register(api) {
  api.logger.info("Registering");

  api.hooks.onInit(() => {
    const styleId = `mod-style-${api.mod.id}`;
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
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
      `;
      document.head.appendChild(style);
    }

    const container = api.ui.createContainer("badge", "body");
    container.className = "mod-badge-container";
    container.textContent = `${api.mod.name} active`;
  });

  api.hooks.onGameLoad(() => {
    api.logger.info("Game loaded");
  });
}
