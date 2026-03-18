const fs = require("fs");
const path = require("path");
const proc = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_REPO_DIR = path.resolve(ROOT_DIR, "..", "AntimatterDimensions-MOD-Repo");
const MODS_REPO_DIR = process.env.MODS_REPO_PATH
  ? path.resolve(process.env.MODS_REPO_PATH)
  : DEFAULT_REPO_DIR;

function resolveModsSourceDir() {
  const distMods = path.resolve(ROOT_DIR, "dist", "mods");
  if (fs.existsSync(distMods)) return distMods;
  return path.resolve(ROOT_DIR, "public", "mods");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clearDirExceptGit(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (entry === ".git") continue;
    const target = path.join(dir, entry);
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function ensureGitRepo(dir) {
  const gitDir = path.join(dir, ".git");
  if (fs.existsSync(gitDir)) return;
  proc.execSync("git init", { cwd: dir, stdio: "ignore" });
}

function syncModsRepo() {
  const sourceDir = resolveModsSourceDir();
  if (!fs.existsSync(sourceDir)) {
    console.warn(`[mods-repo] Source not found: ${sourceDir}`);
    return;
  }
  ensureDir(MODS_REPO_DIR);
  ensureGitRepo(MODS_REPO_DIR);
  clearDirExceptGit(MODS_REPO_DIR);
  copyRecursive(sourceDir, MODS_REPO_DIR);
  console.log(`[mods-repo] Synced mods to ${MODS_REPO_DIR}`);
}

if (require.main === module) {
  syncModsRepo();
}

module.exports = { syncModsRepo };
