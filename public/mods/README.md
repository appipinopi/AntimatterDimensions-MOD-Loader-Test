# Mod Loader

## Enable Mods
Use `public/mods/repositories.json` for repository-based loading, or ZIP mode for local bundles.

## Repository Catalog
Add repositories to `public/mods/repositories.json`.
Each repository entry can be:
- A string URL to a `mods.json` file (or a base URL containing `mods.json`)
- An object with fields like `id`, `name`, `listUrl` (or `baseUrl`), `description`, `homepage`, `enabled`, and `tags`

## Mod List
Each repository serves a `mods.json` file:

```json
{
  "schemaVersion": 1,
  "mods": [
    { "id": "my-mod", "enabled": true }
  ]
}
```

## Manifest
Each mod folder must include a `manifest.json` with at least:
- `id`
- `name`
- `version`
- `apiVersion`
- `entry`

Optional fields for large-scale packs:
- `modSize`: `"large" | "medium" | "small"` (load priority)
- `dependencies`: required mod IDs (medium packs can depend on large packs)
- `optionalDependencies`: optional load-after IDs
- `requiredPlugins`: alias of required dependencies (Easy-BDP style metadata)
- `author`, `tags`, `repo`, `affectsStyle`, `affectsGameplay`

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

The loader resolves dependencies before loading and isolates runtime errors per mod.
If a mod returns a cleanup function from `register(api)`, it is called on reload/unload.

## Mod SDK (Web)
For browser-first mod development, use the helper library:

```js
import { defineMod, addStyle } from "../sdk/mod-common.js";

export default defineMod({
  onInit(api) {
    addStyle(".my-mod { color: #fff; }");
  },
});
```

`mod-common.js` re-exports everything from `mod-sdk.js` and exposes `window.ModCommon`.
See `public/mods/sdk/.docs/README.md` for more helpers.

## Sample Packs
- `public/mods/large-celestial-frontier`
- `public/mods/large-quantum-archives`
- `public/mods/medium-fusion-link` (depends on both large packs)
- `public/mods/small-safe-speed` (scoped speed utility)
