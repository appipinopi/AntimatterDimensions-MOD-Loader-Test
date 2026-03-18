const fs = require("fs");
const path = require("path");
const os = require("os");
const proc = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const MODS_ROOT = path.resolve(ROOT_DIR, "public", "mods");
const DEFAULT_OWNER = "appipinopi";
const OWNER = process.env.MODS_GITHUB_OWNER || DEFAULT_OWNER;
const TOKEN = process.env.MODS_GH_TOKEN;
const GIT_EMAIL = process.env.MODS_GIT_EMAIL || "mods-bot@users.noreply.github.com";
const GIT_NAME = process.env.MODS_GIT_NAME || "mods-bot";

function run(command, options = {}) {
  return proc.execSync(command, { stdio: "pipe", ...options }).toString().trim();
}

function runQuiet(command, options = {}) {
  proc.execSync(command, { stdio: "ignore", ...options });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      if (entry === ".git") continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function slugifyRepoName(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const ascii = trimmed
    .replace(/\s+/gu, "-")
    .replace(/[^A-Za-z0-9._-]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii.toLowerCase();
}

function findManifestFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findManifestFiles(full));
    } else if (entry.isFile() && entry.name === "manifest.json") {
      results.push(full);
    }
  }
  return results;
}

function loadManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, "utf8");
  return JSON.parse(raw);
}

function ensureRemoteRepo(owner, repo, token) {
  const apiUrl = "https://api.github.com/user/repos";
  const payload = JSON.stringify({
    name: repo,
    private: false
  });
  const command = [
    "curl -s -o /dev/null -w \"%{http_code}\"",
    `-H "Authorization: token ${token}"`,
    "-H \"Content-Type: application/json\"",
    `-d '${payload}'`,
    apiUrl
  ].join(" ");
  const status = run(command);
  if (status === "201" || status === "422") return;
  console.warn(`[publish-mods] Repo create status ${status} for ${owner}/${repo}`);
}

function publishMod(manifestPath) {
  const manifest = loadManifest(manifestPath);
  const modDir = path.dirname(manifestPath);
  const fallback = manifest.id || path.basename(modDir);
  const repoName = slugifyRepoName(manifest.name) || slugifyRepoName(fallback) || fallback;
  if (!repoName) {
    console.warn(`[publish-mods] Skipped: invalid repo name for ${manifestPath}`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `admod-${repoName}-`));
  copyRecursive(modDir, tmpDir);

  runQuiet("git init", { cwd: tmpDir });
  runQuiet(`git config user.email "${GIT_EMAIL}"`, { cwd: tmpDir });
  runQuiet(`git config user.name "${GIT_NAME}"`, { cwd: tmpDir });
  runQuiet("git add -A", { cwd: tmpDir });

  const hasChanges = run("git status --porcelain", { cwd: tmpDir });
  if (!hasChanges) {
    console.log(`[publish-mods] No changes for ${repoName}`);
    return;
  }

  runQuiet(`git commit -m "Update ${manifest.name || repoName}"`, { cwd: tmpDir });
  runQuiet("git branch -M main", { cwd: tmpDir });

  const remoteUrl = `https://x-access-token:${TOKEN}@github.com/${OWNER}/${repoName}.git`;
  runQuiet(`git remote add origin ${remoteUrl}`, { cwd: tmpDir });
  runQuiet("git push -f origin main", { cwd: tmpDir });
  console.log(`[publish-mods] Pushed ${OWNER}/${repoName}`);
}

function publishAll() {
  if (!TOKEN) {
    console.warn("[publish-mods] MODS_GH_TOKEN is not set. Skipping.");
    return;
  }
  const manifests = findManifestFiles(MODS_ROOT);
  for (const manifestPath of manifests) {
    publishMod(manifestPath);
  }
}

if (require.main === module) {
  publishAll();
}

module.exports = { publishAll };
