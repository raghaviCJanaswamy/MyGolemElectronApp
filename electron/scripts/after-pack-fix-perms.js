// scripts/after-pack-fix-perms.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function chmodFile(p, mode) {
  try { fs.chmodSync(p, mode); } catch {}
}

function walk(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st;
    try { st = fs.lstatSync(p); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(p, onFile);
    else onFile(p, name);
  }
}

function fixPermissionsForRFramework(root) {
  // 1) bin/* should always be executable
  const binDir = path.join(root, 'R.framework', 'Resources', 'bin');
  if (fs.existsSync(binDir)) {
    walk(binDir, (p) => chmodFile(p, 0o755));
  }

  // 2) Mark dynamic libs executable (some tools expect +x on Mach-O files)
  const resourcesDir = path.join(root, 'R.framework', 'Resources');
  const librariesDir = path.join(root, 'R.framework', 'Libraries'); // sometimes present

  const markIfDynlib = (p, name) => {
    if (/\.(dylib|so)$/.test(name)) chmodFile(p, 0o755);
    // Optional: shell scripts shipped with R
    if (/\.(sh|bash)$/.test(name)) chmodFile(p, 0o755);
  };

  if (fs.existsSync(resourcesDir)) walk(resourcesDir, markIfDynlib);
  if (fs.existsSync(librariesDir)) walk(librariesDir, markIfDynlib);
}

function removeQuarantine(root) {
  // Safe no-op if xattr isn’t available
  try {
    spawnSync('xattr', ['-dr', 'com.apple.quarantine', root], { stdio: 'ignore' });
  } catch {}
}

exports.default = async function (context) {
  if (process.platform !== 'darwin') return;

  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;

  const macResources = path.join(appOutDir, `${appName}.app`, 'Contents', 'Resources');
  const macArm = path.join(macResources, 'r-runtime', 'mac-arm64');
  const macX64 = path.join(macResources, 'r-runtime', 'mac-x64');

  if (fs.existsSync(macArm)) {
    removeQuarantine(macArm);
    fixPermissionsForRFramework(macArm);
  }
  if (fs.existsSync(macX64)) {
    removeQuarantine(macX64);
    fixPermissionsForRFramework(macX64);
  }
};
