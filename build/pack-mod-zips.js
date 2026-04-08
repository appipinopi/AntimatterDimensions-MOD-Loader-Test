const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const ROOT_DIR = path.resolve(__dirname, "..");
const MODS_DIR = path.resolve(ROOT_DIR, "public", "mods");

function isIgnoredFile(name) {
  return name === ".DS_Store" || name === "Thumbs.db";
}

function shouldSkipDirectory(name) {
  return name === "sdk" || name.startsWith(".") || name.startsWith("_");
}

function collectFiles(baseDir, currentDir = "") {
  const absoluteDir = path.join(baseDir, currentDir);
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.endsWith(".zip")) continue;
    if (isIgnoredFile(entry.name)) continue;

    const relativePath = currentDir ? `${currentDir}/${entry.name}` : entry.name;
    const absolutePath = path.join(baseDir, relativePath);

    if (entry.isDirectory()) {
      files.push(...collectFiles(baseDir, relativePath));
      continue;
    }

    files.push({ relativePath: relativePath.replace(/\\/g, "/"), absolutePath });
  }

  return files;
}

async function packMod(modId) {
  const modDir = path.join(MODS_DIR, modId);
  const manifestPath = path.join(modDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return false;

  const files = collectFiles(modDir);
  if (files.length === 0) return false;

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.relativePath, fs.readFileSync(file.absolutePath));
  }

  const zipPath = path.join(MODS_DIR, `${modId}.zip`);
  const content = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  fs.writeFileSync(zipPath, content);
  return true;
}

async function packAllMods() {
  if (!fs.existsSync(MODS_DIR)) {
    console.warn(`[mods-pack] Mods directory not found: ${MODS_DIR}`);
    return;
  }

  const entries = fs.readdirSync(MODS_DIR, { withFileTypes: true });
  const modIds = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !shouldSkipDirectory(name));

  let packed = 0;
  for (const modId of modIds) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await packMod(modId);
    if (ok) packed++;
  }

  console.log(`[mods-pack] Packed ${packed} mods into ZIP archives.`);
}

if (require.main === module) {
  packAllMods().catch(error => {
    console.error("[mods-pack] Failed to pack mods.", error);
    process.exit(1);
  });
}

module.exports = { packAllMods };
