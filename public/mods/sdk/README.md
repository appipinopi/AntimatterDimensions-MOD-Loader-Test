# Mod SDK (Web)

This is a small helper library intended for web-based mod development.

## Usage
In your mod entry file:

```js
import { defineMod, addStyle, createPanel } from "../sdk/mod-sdk.js";

export default defineMod({
  onInit(api) {
    addStyle(".my-mod { color: #fff; }");
    const panel = createPanel(api, { suffix: "panel", html: "<div class=\"my-mod\">Hello</div>" });
    panel.style.position = "fixed";
    panel.style.right = "10px";
    panel.style.top = "10px";
  },
});
```

## Helpers
- `defineMod(def)` registers hook handlers in one place
- `addStyle(cssText, id)` injects CSS
- `addStylesheet(url, id)` injects external CSS
- `createPanel(api, options)` creates a container under `#ui` (or custom parent)
- `waitForElement(selector, options)` waits for DOM element to appear
