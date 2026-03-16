# Mod Loader

## Enable Mods
Edit `public/mods/mods.json` and add entries to the `mods` array in the order you want them loaded.

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
