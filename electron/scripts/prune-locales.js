// scripts/prune-locales.js
// Remove macOS *.lproj and Chromium locale .pak files we don't want.
// Keeps only Base.lproj + en.lproj by default, and en-US.pak for Chromium.
// You can override via env: KEEP_LPROJ="en.lproj,Base.lproj,te.lproj" KEEP_PAK="en-US.pak"

const fs = require("fs");
const path = require("path");

module.exports = async function (context) {
  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;

  const contents = path.join(appOutDir, `${appName}.app`, "Contents");
  const resources = path.join(contents, "Resources");

  const keepLproj = new Set(
    (process.env.KEEP_LPROJ || "en.lproj,Base.lproj")
      .split(",").map(s => s.trim()).filter(Boolean)
  );
  const keepPak = new Set(
    (process.env.KEEP_PAK || "en-US.pak")
      .split(",").map(s => s.trim()).filter(Boolean)
  );

  function pruneLprojRec(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.endsWith(".lproj") && !keepLproj.has(entry.name)) {
          try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
        } else {
          pruneLprojRec(p);
        }
      }
    }
  }

  function pruneChromiumLocales(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (name.endsWith(".pak") && !keepPak.has(name)) {
        try { fs.rmSync(p, { force: true }); } catch {}
      }
    }
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {}
  }

  // 1) Prune *.lproj anywhere under Contents/Resources (recursive)
  pruneLprojRec(resources);

  // 2) Prune Chromium locale .pak files
  pruneChromiumLocales(path.join(resources, "locales"));

  // 3) Also prune locales inside Electron Framework bundle (Chromium resources)
  pruneChromiumLocales(path.join(
    contents, "Frameworks", "Electron Framework.framework", "Versions", "A", "Resources", "locales"
  ));

  // 4) If you previously had nested Resources/resources (older config), remove it:
  const nested = path.join(resources, "resources");
  if (fs.existsSync(nested)) {
    try { fs.rmSync(nested, { recursive: true, force: true }); } catch {}
  }

  console.log("✔ prune-locales.js: kept", {
    lproj: Array.from(keepLproj),
    pak: Array.from(keepPak)
  });
};
