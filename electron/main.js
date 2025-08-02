const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const waitOn = require('wait-on');
const path = require('path');
const fs = require('fs');

let logPath = path.join(app.getPath('temp'), 'golem-electron-debug.log');
fs.appendFileSync(logPath, `\n=== Launching App at ${new Date()} ===\n`);

let rPath = isDev
  ? 'Rscript'
  : path.join(process.resourcesPath, 'R.framework', 'Resources', 'bin', 'Rscript');

fs.appendFileSync(logPath, `Rscript Path: ${rPath}\n`);

function createWindow() {
  const win = new BrowserWindow({ width: 1000, height: 800 });

  let appPort = isDev ? 3000 : 12345;
  fs.appendFileSync(logPath, `App Port: ${appPort}\n`);

  const rScriptFile = path.join(process.resourcesPath, 'app', 'run_app.R');
  const rScriptArgs = [rScriptFile, appPort];
  if (!isDev) process.env.ELECTRON_PROD = "1";

  try {
    const rProcess = spawn(rPath, rScriptArgs, {
      env: {
        ...process.env,
        R_HOME: path.join(process.resourcesPath, 'R.framework', 'Resources')
      }
    });

    rProcess.stdout.on('data', data => fs.appendFileSync(logPath, `R stdout: ${data}\n`));
    rProcess.stderr.on('data', data => fs.appendFileSync(logPath, `R stderr: ${data}\n`));
    rProcess.on('close', code => fs.appendFileSync(logPath, `R exited with code ${code}\n`));

    waitOn({ resources: [`http://localhost:${appPort}`], timeout: 60000 })
      .then(() => {
        fs.appendFileSync(logPath, `Loading URL: http://localhost:${appPort}\n`);
        win.loadURL(`http://localhost:${appPort}`);
      })
      .catch(err => {
        fs.appendFileSync(logPath, `waitOn failed: ${err}\n`);
        win.loadFile(path.join(process.resourcesPath, 'error.html')).catch(e =>
          fs.appendFileSync(logPath, `Error loading fallback: ${e}\n`)
        );
      });
  } catch (err) {
    fs.appendFileSync(logPath, `createWindow error: ${err}\n`);
  }
}

app.whenReady().then(createWindow);
