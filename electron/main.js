// main.js
const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const spawn = require('cross-spawn');

const isDev = !app.isPackaged;

let rProc = null;
let win = null;

// ---------- log file in userData ----------
let logPath;
(function initLogging() {
  try {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
    logPath = path.join(dir, `golem-electron-debug-${stamp}.log`);
    fs.appendFileSync(logPath, `\n=== Launch ${new Date().toISOString()} ===\n`);
  } catch {
    logPath = path.join(app.getPath('temp'), 'golem-electron-fallback.log');
    try { fs.appendFileSync(logPath, `\n=== Launch (fallback) ===\n`); } catch {}
  }
})();
const log = (m) => { try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${m}\n`); } catch {} };

function safeQuit() {
  try {
    if (rProc && !rProc.killed) {
      rProc.kill('SIGTERM');
      log('Killed R process with SIGTERM');
    }
  } catch (e) { log(`Kill error: ${e}`); }
  app.quit();
}

// ---------- find vendored/system Rscript ----------
function preferRscript() {
  const resPath = process.resourcesPath || '.';
  log(`resourcesPath: ${resPath}`);

  // Our packaging convention:
  //   extraResources:
  //     - from: r-runtime  -> .../resources/r-runtime
  //     - from: app        -> .../resources/app (contains run_app.R)
  //
  // So R lives under: <resourcesPath>/r-runtime
  const vendoredBase = path.join(resPath, 'r-runtime');

  if (process.platform === 'darwin') {
    // If you vendored the official framework, keep this (optional).
    // Otherwise, prefer our unified r-runtime layout.
    const frameworkR = path.join(resPath, 'R.framework', 'Resources', 'bin', 'Rscript');
    log(`probe mac(framework): ${frameworkR} -> ${fs.existsSync(frameworkR)}`);
    if (fs.existsSync(frameworkR)) return frameworkR;

    const mac = path.join(vendoredBase, 'bin', 'Rscript');
    log(`probe mac(r-runtime): ${mac} -> ${fs.existsSync(mac)}`);
    if (fs.existsSync(mac)) return mac;
  }

  if (process.platform === 'win32') {
    const candidates = [
      path.join(vendoredBase, 'bin', 'x64', 'Rscript.exe'),
      path.join(vendoredBase, 'bin', 'Rscript.exe'),
      path.join(vendoredBase, 'bin', 'x64', 'Rscript'),
      path.join(vendoredBase, 'bin', 'Rscript'),
    ];
    for (const p of candidates) {
      const ok = fs.existsSync(p);
      log(`probe win: ${p} -> ${ok}`);
      if (ok) return p;
    }
  }

  if (process.platform === 'linux') {
    const lin = path.join(vendoredBase, 'bin', 'Rscript');
    log(`probe linux: ${lin} -> ${fs.existsSync(lin)}`);
    if (fs.existsSync(lin)) return lin;
  }

  log('Falling back to plain "Rscript" (dev/system PATH)');
  return 'Rscript';
}

async function createWindow() {
  // IMPORTANT: put run_app.R into extraResources under "app/run_app.R"
  const rScriptFile = isDev
    ? path.join(__dirname, 'app', 'run_app.R') // dev repo layout
    : path.join(process.resourcesPath, 'app', 'run_app.R'); // unpacked, accessible to R

  const rPath = preferRscript();
  log(`Rscript Path: ${rPath}`);
  log(`run_app.R: ${rScriptFile}`);

  // fail fast if vendored binary was expected but missing
  if (!isDev && !fs.existsSync(rPath)) {
    const base = path.dirname(path.dirname(rPath)); // .../r-runtime/bin[/x64]
    let listing = '(bin folder missing)';
    const binDir = path.dirname(rPath);
    try { listing = fs.existsSync(binDir) ? fs.readdirSync(binDir).join('\n') : listing; } catch {}
    const msg = `Rscript not found at:\n${rPath}\n\nBin listing:\n${listing}\n\nExpected r-runtime base:\n${base}`;
      log(msg);
      dialog.showErrorBox('Rscript not found', msg);
      return safeQuit();
    }

  if (!fs.existsSync(rScriptFile)) {
    const msg = `run_app.R not found at:\n${rScriptFile}\n\nPlace it under extraResources "app/run_app.R".`;
    log(msg);
    dialog.showErrorBox('Missing run_app.R', msg);
    return safeQuit();
  }

  // Shiny prints a few variants; support "Listening on ..." and "Running on ..."
  const urlRegex = /(Listening|Running)\s+on\s+(https?:\/\/[0-9.:]+(?:\/[^\s]*)?)/i;

  // Prefer ephemeral port; you can pin if you want
  const rArgs = [rScriptFile, '--port', '0', '--host', '127.0.0.1'];

  // Environment for child process
  const extraEnv = {};
  if (!isDev && process.platform === 'darwin') {
    // If using the framework layout
    const frameworkHome = path.join(process.resourcesPath, 'R.framework', 'Resources');
    const unifiedHome = path.join(process.resourcesPath, 'r-runtime');
    if (fs.existsSync(frameworkHome)) {
      extraEnv.R_HOME = frameworkHome;
      extraEnv.PATH = [path.join(frameworkHome, 'bin'), process.env.PATH || ''].join(path.delimiter);
    } else {
      extraEnv.R_HOME = unifiedHome;
      extraEnv.PATH = [path.join(unifiedHome, 'bin'), process.env.PATH || ''].join(path.delimiter);
    }
  }

  if (!isDev && process.platform === 'win32') {
    const base = path.join(process.resourcesPath, 'r-runtime');
    extraEnv.R_HOME = base;
    extraEnv.PATH = [
      path.join(base, 'bin'),
      path.join(base, 'bin', 'x64'),
      path.join(base, 'bin'),
      process.env.PATH || ''
    ].join(path.delimiter);
    // Use bundled packages if present
    extraEnv.R_LIBS_USER = path.join(base, 'library');
    extraEnv.R_LIBS_SITE = extraEnv.R_LIBS_USER;
    extraEnv.R_ARCH = '/x64';
  }

  if (!isDev && process.platform === 'linux') {
    const base = path.join(process.resourcesPath, 'r-runtime');
    extraEnv.R_HOME = base;
    extraEnv.LD_LIBRARY_PATH = [
      path.join(base, 'lib'),
      process.env.LD_LIBRARY_PATH || ''
    ].join(path.delimiter);
    extraEnv.PATH = [
      path.join(base, 'bin'),
      process.env.PATH || ''
    ].join(path.delimiter);
  }
  log(`Env extras: ${JSON.stringify(extraEnv)}`);

  try {
    rProc = spawn(rPath, rArgs, { env: { ...process.env, ...extraEnv } });
  } catch (err) {
    log(`Failed to spawn R: ${err}`);
    dialog.showErrorBox('Rscript Error', `Could not start Rscript.\n${String(err)}`);
    return safeQuit();
  }

  let targetURL = null;

  rProc.on('error', (e) => {
    log(`R process error: ${e?.message || e}`);
    dialog.showErrorBox('Rscript Spawn Error', String(e));
    safeQuit();
  });

  rProc.stdout.on('data', (buf) => {
    const s = buf.toString();
    log(`R stdout: ${s.trim()}`);
    const m = s.match(urlRegex);
    if (m && !targetURL) {
      targetURL = m[2]; // the URL
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

      win.on('closed', () => safeQuit());
    }
  });

  rProc.stderr.on('data', d => log(`R stderr: ${d.toString().trim()}`));
  rProc.on('close', code => { log(`R exited with code ${code}`); safeQuit(); });

  // allow more time while debugging; adjust as needed
  setTimeout(() => {
    if (!targetURL) {
      log('Timeout: Shiny did not start in 120s');
      dialog.showErrorBox('Startup Timeout', `App did not print "Listening on ..." in time.\nSee log: ${logPath}`);
      try { if (rProc && !rProc.killed) rProc.kill('SIGTERM'); } catch {}
      safeQuit();
    }
  }, 120000);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') safeQuit(); });
app.on('before-quit', () => safeQuit());
