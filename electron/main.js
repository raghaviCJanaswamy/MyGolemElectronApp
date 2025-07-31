const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const waitOn = require('wait-on')
const path = require('path')
const os = require('os')

function createWindow () {
  const win = new BrowserWindow({ width: 1000, height: 800 })
  const runAppPath = path.join(__dirname, '..', 'run_app.R')

  const isDev = require('electron-is-dev');
  if (!isDev) {
    process.env.ELECTRON_PROD = "1";
  }
  let appPort = isDev ? null : 12345; // Fixed port in production

  const path = require('path');

  let rPath;
  if (isDev) {
    rPath = 'Rscript'; // Dev mode: use system R
  } else {
    rPath = path.join(
      process.resourcesPath,
      'R.framework',
      'Resources',
      'bin',
      'Rscript'
    );
  }


  const Rproc = spawn(rPath, [runAppPath])

  Rproc.stderr.on('data', (data) => {
    console.error(`R Error: ${data}`)
  });


  if (os.platform() === 'win32') {
    rPath = path.join(__dirname, 'resources', 'r-portable', 'bin', 'Rscript.exe')
  } else if (os.platform() === 'darwin') {
    rPath = path.join(__dirname, 'resources', 'R.framework', 'Resources', 'bin', 'Rscript')
  } else {
    rPath = path.join(__dirname, 'resources', 'r-linux', 'bin', 'Rscript')
  }


  Rproc.stdout.on('data', (data) => {
    const msg = data.toString()
    console.log('R Output:', msg)
    const portMatch = msg.match(/PORT:(\d+)/)
    if (portMatch) {
      const appPort = portMatch[1]
      console.log(`Detected Shiny port: ${appPort}`)
      waitOn({ resources: [`http://localhost:${appPort}`], timeout: 30000 }, (err) => {
        if (err) {
          console.error('Shiny server did not start in time:', err)
        } else {
          win.loadURL(`http://localhost:${appPort}`)
        }
      })
    }
  })

  Rproc.stderr.on('data', (data) => {
    console.error(`R Error: ${data}`)
  })
}

app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
app.whenReady().then(createWindow)
