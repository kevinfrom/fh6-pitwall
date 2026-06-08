// Electron main process for FH6 Pitwall.
//
// Pitwall is a Nuxt/Nitro app: a Vue SPA served by a Node server that opens a
// UDP socket to receive Forza Horizon 6 telemetry. We can't ship a static page —
// the server has to run. So here we:
//   1. pick a free local HTTP port,
//   2. launch the built Nitro server (.output/server/index.mjs) as a child
//      process using Electron's bundled Node (no system Node required),
//   3. wait until it's accepting connections,
//   4. point a BrowserWindow at it.
//
// Written as CommonJS (.cjs) on purpose: the repo is "type": "module", and a
// .cjs extension lets us use require('electron') without ESM-main edge cases.

const { app, BrowserWindow, utilityProcess, dialog } = require('electron')
const path = require('node:path')
const net = require('node:net')
const http = require('node:http')

// The game is configured to send Data Out here; this is fixed, not negotiable.
const FH6_UDP_PORT = '9999'
// How long to wait for the Nitro server to come up before giving up.
const SERVER_READY_TIMEOUT_MS = 15_000

let mainWindow = null
let serverProc = null
let httpPort = 0
let quitting = false

// Splash shown in the window while the server boots. Self-contained because there
// is no static index.html to load (the SPA shell is server-rendered by Nitro).
const SPLASH_HTML = `data:text/html,${encodeURIComponent(`
  <html><head><meta charset="utf-8"><style>
    html,body{height:100%;margin:0}
    body{display:flex;align-items:center;justify-content:center;
      background:#0b0b0c;color:#e7e7e9;
      font:500 15px system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
    .box{text-align:center;opacity:.85}
    .dot{display:inline-block;width:8px;height:8px;border-radius:50%;
      background:#6ee7b7;margin-right:8px;animation:p 1s ease-in-out infinite}
    @keyframes p{0%,100%{opacity:.3}50%{opacity:1}}
  </style></head><body>
    <div class="box"><span class="dot"></span>Starting Pitwall…</div>
  </body></html>
`)}`

/** Ask the OS for a free TCP port by binding to 0 and reading what we got. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

/** Absolute path to the built Nitro server entry, dev vs packaged. */
function resolveServerEntry() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'output', 'server', 'index.mjs')
    : path.join(__dirname, '..', '.output', 'server', 'index.mjs')
}

/** Fork the Nitro server as a child process under Electron's bundled Node. */
function startServer(port) {
  const entry = resolveServerEntry()
  const proc = utilityProcess.fork(entry, [], {
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      // Nitro's node-server preset reads NITRO_PORT || PORT (not NUXT_PORT).
      NITRO_PORT: String(port),
      PORT: String(port),
      NITRO_HOST: '127.0.0.1', // loopback only — no LAN exposure, no extra firewall surface
      NUXT_PUBLIC_FH6_UDP_PORT: FH6_UDP_PORT,
    },
  })

  // Surface the server's logs for diagnostics (UDP bind errors, etc.).
  proc.stdout?.on('data', d => process.stdout.write(`[pitwall-server] ${d}`))
  proc.stderr?.on('data', d => process.stderr.write(`[pitwall-server] ${d}`))

  proc.on('exit', (code) => {
    if (quitting) return
    // The server died on its own — that's fatal; tell the user and quit.
    dialog.showErrorBox(
      'Pitwall server stopped',
      `The telemetry server exited unexpectedly (code ${code}).\n`
      + 'Pitwall will now close. If this keeps happening, please report an issue.',
    )
    quitting = true
    app.quit()
  })

  return proc
}

/** Resolve once the HTTP server answers, or reject after a timeout. */
function waitForServer(port) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error('Timed out waiting for the Pitwall server to start.'))
        }
        else {
          setTimeout(tryOnce, 150)
        }
      })
    }
    tryOnce()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0b0b0c',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadURL(SPLASH_HTML)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function boot() {
  createWindow()
  try {
    httpPort = await getFreePort()
    serverProc = startServer(httpPort)
    await waitForServer(httpPort)
    // Swap the splash for the live app once the server is ready.
    if (mainWindow) await mainWindow.loadURL(`http://127.0.0.1:${httpPort}/`)
  }
  catch (err) {
    dialog.showErrorBox(
      'Pitwall failed to start',
      `${err && err.message ? err.message : err}`,
    )
    quitting = true
    app.quit()
  }
}

// Prevent a second instance from fighting over the UDP port. If the user launches
// the .exe again, focus the existing window instead of spawning another server.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(boot)

  app.on('window-all-closed', () => {
    quitting = true
    serverProc?.kill()
    app.quit()
  })

  app.on('before-quit', () => {
    quitting = true
    serverProc?.kill()
  })
}
