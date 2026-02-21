/* Download Mermaid bundle into public/assets/js/mermaid.min.js (best-effort).
 * Keeps it same-origin to reduce CDN risk and improve loading reliability.
 */

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const VERSION = "11";
const DEST_PATH = path.join(process.cwd(), "public", "assets", "js", "mermaid.min.js");

const SOURCES = [
  `https://cdn.jsdelivr.net/npm/mermaid@${VERSION}/dist/mermaid.min.js`,
  `https://unpkg.com/mermaid@${VERSION}/dist/mermaid.min.js`,
];

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function download(url, filePath) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, filePath));
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const tmpPath = `${filePath}.tmp`;
      const file = fs.createWriteStream(tmpPath);
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          fs.renameSync(tmpPath, filePath);
          resolve();
        });
      });
      file.on("error", (err) => {
        try {
          fs.unlinkSync(tmpPath);
        } catch {}
        reject(err);
      });
    });

    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

async function main() {
  try {
    const st = fs.statSync(DEST_PATH);
    if (st.isFile() && st.size > 100_000) {
      console.log(`✅ Mermaid bundle already present: ${path.relative(process.cwd(), DEST_PATH)}`);
      return;
    }
  } catch {}

  ensureDir(DEST_PATH);

  for (const url of SOURCES) {
    try {
      console.log(`⬇️  Downloading Mermaid ${VERSION} from ${url}`);
      await download(url, DEST_PATH);
      console.log(`✅ Saved: ${path.relative(process.cwd(), DEST_PATH)}`);
      return;
    } catch (err) {
      console.warn(`⚠️  Download failed from ${url}: ${err && err.message ? err.message : String(err)}`);
    }
  }

  console.warn("⚠️  Could not download Mermaid bundle; runtime will fall back to CDN.");
}

main().catch((err) => {
  console.warn(`⚠️  fetch-mermaid failed: ${err && err.message ? err.message : String(err)}`);
});
