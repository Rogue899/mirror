const { app, BrowserWindow } = require('electron')
const path = require('path')

const isDev = process.argv.includes('--dev')

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 1920,
    fullscreen: !isDev,
    kiosk: !isDev,
    frame: isDev,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    // In development, load from Vite dev server
    win.loadURL('http://localhost:3000')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    // In production, load built files
    win.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'))
  }

  // Hide cursor for mirror kiosk mode
  if (!isDev) {
    win.webContents.on('did-finish-load', () => {
      win.webContents.insertCSS('* { cursor: none !important; }')
    })
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
