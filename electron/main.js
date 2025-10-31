// main.js
const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const spawn = require('cross-spawn');
const isDev = require('electron-is-dev');

let rProc = null;
let win = null;

// ---- Robust log to userData (writable on macOS) ----
let logPath;
(function initLogging() {
  try {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
    logPath = path.join(dir, `golem-electron-debug-${stamp}.log`);
    fs.appendFileSync(logPath, `\n=== Launching App at ${new Date().toISOString()} ===\n`);
  } catch (e) {
    // last resort
    logPath = path.join(app.getPath('temp'), 'golem-electron-fallback.log');
    fs.appendFileSync(logPath, `\n=== Launching (fallback log) ===\n`);
  }
})();
const log = (m) => { try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${m}\n`); } catch {} };

function safeQuit() {
  if (rProc && !rProc.killed) {
    try { rProc.kill('SIGTERM'); log('Killed R process with SIGTERM'); } catch (e) { log(`Kill error: ${e}`); }
  }
  app.quit();
}

// ---- Use flat R.framework under Contents/Resources ----
function preferRscript() {
  const resPath = process.resourcesPath || '.';
  const macBundled   = path.join(resPath, 'R.framework', 'Resources', 'bin', 'Rscript');  // fixed (no extra "resources")
  const winBundled   = path.join(resPath, 'resources', 'R-Portable', 'bin', 'Rscript.exe');
  const linuxBundled = path.join(resPath, 'resources', 'R-Linux', 'bin', 'Rscript');

  if (process.platform === 'darwin' && fs.existsSync(macBundled)) return macBundled;
  if (process.platform === 'win32' && fs.existsSync(winBundled)) return winBundled;
  if (process.platform === 'linux'  && fs.existsSync(linuxBundled)) return linuxBundled;
  return 'Rscript'; // dev fallback
}

async function createWindow() {
  const rScriptFile = isDev
    ? path.join(__dirname, 'app', 'run_app.R')
    : path.join(process.resourcesPath, 'app', 'run_app.R');

  const rPath = preferRscript();
  log(`Rscript Path: ${rPath}`);
  log(`run_app.R: ${rScriptFile}`);

  // Let Shiny choose/accept a port; you can pin if needed
  const rArgs = [rScriptFile, '--port', '0', '--host', '127.0.0.1'];

  const extraEnv = {};
  if (!isDev && process.platform === 'darwin') {
    extraEnv.R_HOME = path.join(process.resourcesPath, 'R.framework', 'Resources'); // fixed (no extra "resources")
  }
  if (!isDev && process.platform === 'win32') {
    extraEnv.R_HOME = path.join(process.resourcesPath, 'resources', 'R-Portable');
    extraEnv.PATH = [
      path.join(extraEnv.R_HOME, 'bin'),
      path.join(extraEnv.R_HOME, 'bin', 'x64'),
      process.env.PATH
    ].join(path.delimiter);
  }
  if (!isDev && process.platform === 'linux') {
    extraEnv.R_HOME = path.join(process.resourcesPath, 'resources', 'R-Linux');
    extraEnv.LD_LIBRARY_PATH = [
      path.join(extraEnv.R_HOME, 'lib'),
      process.env.LD_LIBRARY_PATH || ''
    ].join(':');
    extraEnv.PATH = [
      path.join(extraEnv.R_HOME, 'bin'),
      process.env.PATH
    ].join(':');
  }
  log(`Env extras: ${JSON.stringify(extraEnv)}`);

  try {
    rProc = spawn(rPath, rArgs, { env: { ...process.env, ...extraEnv } });
  } catch (err) {
    log(`Failed to spawn R: ${err}`);
    dialog.showErrorBox('Rscript Error', `Could not start Rscript.\n${String(err)}`);
    safeQuit();
    return;
  }

  const urlRegex = /Listening on (http:\/\/[0-9.:]+(?:\/[^\s]*)?)/i;
  let targetURL = null;

  rProc.stdout.on('data', (buf) => {
    const s = buf.toString();
    log(`R stdout: ${s.trim()}`);
    const m = s.match(urlRegex);
    if (m && !targetURL) {
      targetURL = m[1];
      log(`Detected URL: ${targetURL}`);

      win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: { contextIsolation: true, nodeIntegration: false }
      });

      win.loadURL(targetURL).catch(err => {
        dialog.showErrorBox('Load Failed', `Could not load ${targetURL}\n${err?.message || err}`);
        safeQuit();
      });

      win.on('closed', () => {
        // Close the app when window closes (mac keeps app active otherwise)
        safeQuit();
      });
    }
  });

  rProc.stderr.on('data', d => log(`R stderr: ${d.toString().trim()}`));
  rProc.on('close', code => { log(`R exited with code ${code}`); safeQuit(); });

  setTimeout(() => {
    if (!targetURL) {
      log('Timeout: Shiny did not start in 60s');
      dialog.showErrorBox('Startup Timeout', `App did not print "Listening on ..." in time.\nSee log: ${logPath}`);
      try { if (rProc && !rProc.killed) rProc.kill('SIGTERM'); } catch {}
      safeQuit();
    }
  }, 60000);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') safeQuit(); });
app.on('before-quit', () => safeQuit());
