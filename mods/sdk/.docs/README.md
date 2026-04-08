# Mod SDK (Web)

This is a small helper library intended for web-based mod development.

## Usage
In your mod entry file:

```js
import { defineMod, addStyle, createPanel } from "../sdk/mod-common.js";

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

`mod-common.js` re-exports everything from `mod-sdk.js` and exposes `window.ModCommon`.

## Helpers
- `defineMod(def)` registers hook handlers in one place
- `registerAchievement(api, def)` registers a mod achievement with UI display
- `unlockAchievement(api, id)` manually unlocks a mod achievement
- `registerStage(api, def)` registers stage flow with lock/unlock/complete states
- `unlockStage(api, id)` unlocks a stage
- `completeStage(api, id)` completes a stage
- `getStageState(api, id)` gets stage state
- `setGameSpeed(api, multiplier, scope)` sets speed using mod-local scope
- `resetGameSpeed(api, scope)` clears a mod speed scope
- `getGameSpeed()` reads current game speed multiplier
- `withGameSpeed(api, multiplier, fn, scope)` runs a function with scoped speed
- `createSpeedController(api, scope)` returns isolated set/reset/get helpers
- `unregisterModRuntime(modId)` clears SDK runtime state for one mod
- `addStyle(cssText, id)` injects CSS
- `addStylesheet(url, id)` injects external CSS
- `createPanel(api, options)` creates a container under `#ui` (or custom parent)
- `waitForElement(selector, options)` waits for DOM element to appear

## Mod Achievements
You can register achievements with UI display and a condition:

```js
export default defineMod({
  achievements: [
    {
      id: "fast-start",
      name: "Fast Start",
      description: "Reach 1e6 antimatter",
      condition: () => player.antimatter?.log10?.() >= 6,
    },
  ],
});
```

Achievements are stored in localStorage under `admod:ach:*`.

## Stage Example

```js
export default defineMod({
  stages: [
    {
      id: "phase-1",
      name: "Phase 1",
      description: "Reach 1e10 antimatter",
      unlockCondition: () => true,
      completeCondition: () => player.antimatter?.log10?.() >= 10,
    },
  ],
});
```

## Unload Example

```js
export default defineMod({
  onInit(api) {
    // setup
  },
  onUnload(api) {
    api.logger.info("cleaning up");
  },
});
```
