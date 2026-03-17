# Mod Loader

## Enable Mods
Edit `public/mods/mods.json` and add entries to the `mods` array in the order you want them loaded.

## CDN List
If you want to load additional mods from external URLs, add them to `public/mods/cdn.json`.
Each entry should be either:
- A full URL to a `mods.json`
- A base URL which contains a `mods.json` file

## Manifest
Each mod folder must include a `manifest.json` with at least:
- `id`
- `name`
- `version`
- `apiVersion`
- `entry`

## Entry API
The entry module must export a `register(api)` function (default or named). The `api` provides:
- `api.hooks.onPreInit(fn)`
- `api.hooks.onInit(fn)`
- `api.hooks.onGameLoad(fn)`
- `api.hooks.onTick(fn)`
- `api.hooks.onUIUpdate(fn)`
- `api.events.onLogic(event, fn)`
- `api.events.onUI(event, fn)`
- `api.storage.get/set/remove`
- `api.ui.createContainer(suffix, parentSelector)`

These hooks run after core logic to avoid changing the base calculation flow.

## Mod SDK (Web)
For browser-first mod development, use the helper library:

```
import { defineMod, addStyle } from "../sdk/mod-sdk.js";

export default defineMod({
  onInit(api) {
    addStyle(".my-mod { color: #fff; }");
  },
});
```

See `public/mods/sdk/.docs/README.md` for more helpers.
