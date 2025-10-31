// electron/scripts/macos-notarize.js
const path = require('path');
const { notarize } = require('@electron/notarize');
const { spawnSync } = require('child_process');

const log = (m) => console.log(`[notarize] ${m}`);

exports.default = async function notarizeHook(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  // Always present (required by builder), but no-op on non-mac builds
  if (electronPlatformName !== 'darwin') {
    log('Non-macOS build — skipping.');
    return;
  }

  if (process.env.SKIP_NOTARIZE === 'true') {
    log('SKIP_NOTARIZE=true — skipping.');
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    log('Missing APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID — skipping.');
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appBundleId = packager.appInfo.bundleId;
  const appPath = path.join(appOutDir, `${appName}.app`);

  log(`Submitting ${appPath} (bundleId=${appBundleId}) to Apple...`);
  await notarize({
    tool: 'notarytool',
    appBundleId,
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });

  log('Notarization succeeded. Stapling...');
  const staple = spawnSync('xcrun', ['stapler', 'staple', '-v', appPath], { stdio: 'inherit' });
  if (staple.status !== 0) throw new Error(`Stapling failed with code ${staple.status}`);
  log('Stapled.');
};
