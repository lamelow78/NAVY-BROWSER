const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();
let mainWindow;
let blockedAdsCount = 0;

// Listes de blocage
const blockPatterns = [
  'doubleclick.net', 'googlesyndication', 'googleadservices',
  'ad.', 'ads.', 'adservice', 'adsystem', 'adserver',
  'advertising', 'analytics', 'tracker', 'pixel',
  'facebook.com/tr', 'connect.facebook.net',
  'google-analytics', 'googletagmanager'
];

function createWindow() {
  const settings = store.get('settings', {
    theme: 'dark',
    searchEngine: 'https://www.google.fr/search?q=',
    optimizationMode: false,
    showBookmarkBar: true,
    homePage: 'https://www.google.fr'
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: settings.theme === 'dark' ? '#000814' : '#FFFFFF',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../assets/logo.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'ui/index.html'));
}

// Bloqueur de pub
async function setupAdBlocker() {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const url = details.url.toLowerCase();
    const shouldBlock = blockPatterns.some(pattern => url.includes(pattern));

    if (shouldBlock) {
      blockedAdsCount++;
      if (mainWindow) {
        mainWindow.webContents.send('ad-blocked', blockedAdsCount);
      }
      callback({ cancel: true });
    } else {
      callback({ cancel: false });
    }
  });
}

// IPC Handlers
ipcMain.handle('get-settings', () => {
  return store.get('settings', {});
});

ipcMain.handle('save-settings', (event, newSettings) => {
  store.set('settings', newSettings);
  return { success: true };
});

ipcMain.handle('get-bookmarks', () => {
  return store.get('bookmarks', []);
});

ipcMain.handle('add-bookmark', (event, bookmark) => {
  const bookmarks = store.get('bookmarks', []);
  bookmarks.push(bookmark);
  store.set('bookmarks', bookmarks);
  return { success: true };
});

ipcMain.handle('delete-bookmark', (event, index) => {
  const bookmarks = store.get('bookmarks', []);
  bookmarks.splice(index, 1);
  store.set('bookmarks', bookmarks);
  return { success: true };
});

ipcMain.handle('get-blocked-count', () => {
  return blockedAdsCount;
});

app.whenReady().then(async () => {
  await setupAdBlocker();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});