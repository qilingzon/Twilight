/* Download Decap CMS bundle into public/admin/decap-cms.js (best-effort).
 * Keeps it same-origin to improve loading speed and reduce tracking-prevention issues.
 */

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const VERSION = "3.9.0";
const DEST_PATH = path.join(process.cwd(), "public", "admin", "decap-cms.js");

const SOURCES = [
  `https://unpkg.com/decap-cms@${VERSION}/dist/decap-cms.js`,
  `https://cdn.jsdelivr.net/npm/decap-cms@${VERSION}/dist/decap-cms.js`,
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
  // If file already exists and looks non-empty, keep it.
  try {
    const st = fs.statSync(DEST_PATH);
    if (st.isFile() && st.size > 100_000) {
      console.log(`✅ Decap CMS bundle already present: ${path.relative(process.cwd(), DEST_PATH)}`);
      return;
    }
  } catch {}

  ensureDir(DEST_PATH);

  for (const url of SOURCES) {
    try {
      console.log(`⬇️  Downloading Decap CMS ${VERSION} from ${url}`);
      await download(url, DEST_PATH);
      console.log(`✅ Saved: ${path.relative(process.cwd(), DEST_PATH)}`);
      return;
    } catch (err) {
      console.warn(`⚠️  Download failed from ${url}: ${err && err.message ? err.message : String(err)}`);
    }
  }

  console.warn("⚠️  Could not download Decap CMS bundle; /admin will fall back to CDN if configured.");
}

main().catch((err) => {
  console.warn(`⚠️  fetch-decap-cms failed: ${err && err.message ? err.message : String(err)}`);
});
