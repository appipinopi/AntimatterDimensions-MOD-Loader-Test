import "drag-drop-touch";
import "./shims";
import "./merge-globals";
import { browserCheck, init } from "./game";
import { DEV } from "./env";
import { watchLatestCommit } from "./commit-watcher";
import { ModManager } from "./core/mods/mod-manager";

async function start() {
  if (browserCheck()) {
    await ModManager.load();
    init();
  }
  if (DEV) watchLatestCommit();
}

start();
