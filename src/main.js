const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

const PasswordManager = require('./password-manager');
const {
  SEARCH_ENGINES,
  DEFAULT_SETTINGS,
  createSettingsStore,
  normalizeSettings
} = require('./settings');

const settingsStore = createSettingsStore();
const passwordManager = new PasswordManager();

let mainWindow;
const protectionStats = {
  total: 0,
  ads: 0,
  trackers: 0,
  optimization: 0
};

const blockedHostFragments = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adnxs.com',
  'taboola.com',
  'outbrain.com',
  'criteo.com',
  'scorecardresearch.com',
  'adsrvr.org',
  'amazon-adsystem.com',
  'zedo.com',
  'teads.tv'
];

const trackerHostFragments = [
  'google-analytics.com',
  'googletagmanager.com',
  'facebook.net',
  'facebook.com',
  'hotjar.com',
  'segment.io',
  'mixpanel.com',
  'matomo.cloud',
  'newrelic.com',
  'sentry.io'
];

const blockedUrlFragments = [
  '/ads/',
  '/adservice',
  '/advert',
  '/banner',
  '/pixel',
  'tracking',
  'analytics',
  'beacon'
];

const optimizationResourceTypes = new Set(['font', 'media']);

function getSettings() {
  return normalizeSettings(settingsStore.get('settings', DEFAULT_SETTINGS));
}

function saveSettings(newSettings = {}) {
  const merged = normalizeSettings({
    ...getSettings(),
    ...newSettings
  });

  settingsStore.set('settings', merged);
  return merged;
}

function sendProtectionStats() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('protection-stats', protectionStats);
  }
}

function matchesHost(hostname, fragments) {
  return fragments.some((fragment) => hostname === fragment || hostname.endsWith(`.${fragment}`));
}

function classifyRequest(details) {
  const settings = getSettings();

  if (!settings.adBlockEnabled || details.resourceType === 'mainFrame') {
    return null;
  }

  let hostname = '';

  try {
    hostname = new URL(details.url).hostname.toLowerCase();
  } catch (error) {
    return null;
  }

  const normalizedUrl = details.url.toLowerCase();

  if (matchesHost(hostname, blockedHostFragments)) {
    return 'ads';
  }

  if (matchesHost(hostname, trackerHostFragments) || blockedUrlFragments.some((fragment) => normalizedUrl.includes(fragment))) {
    return 'trackers';
  }

  if (settings.optimizationMode && optimizationResourceTypes.has(details.resourceType)) {
    return 'optimization';
  }

  return null;
}

function setupSessionProtections() {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const category = classifyRequest(details);

    if (!category) {
      callback({ cancel: false });
      return;
    }

    protectionStats.total += 1;
    protectionStats[category] += 1;
    sendProtectionStats();
    callback({ cancel: true });
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const deniedPermissions = new Set(['camera', 'microphone', 'geolocation', 'midi', 'pointerLock']);
    callback(!deniedPermissions.has(permission));
  });
}

function createWindow() {
  const settings = getSettings();

  mainWindow = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: settings.theme === 'light' ? '#f4f7fb' : '#07111f',
    icon: path.join(__dirname, '../assets/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: true
    }
  });

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.preload = path.join(__dirname, 'guest-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = false;
    params.allowpopups = false;
  });

  mainWindow.loadFile(path.join(__dirname, 'ui/index.html'));

  mainWindow.once('ready-to-show', () => {
    sendProtectionStats();
  });
}

ipcMain.handle('get-settings', () => getSettings());
ipcMain.handle('save-settings', (event, newSettings) => saveSettings(newSettings));
ipcMain.handle('get-search-engines', () => SEARCH_ENGINES);

ipcMain.handle('get-bookmarks', () => settingsStore.get('bookmarks', []));

ipcMain.handle('add-bookmark', (event, bookmark) => {
  const bookmarks = settingsStore.get('bookmarks', []);
  const nextBookmark = {
    title: bookmark.title || 'Nouvel onglet',
    url: bookmark.url,
    createdAt: new Date().toISOString()
  };

  const deduped = bookmarks.filter((item) => item.url !== nextBookmark.url);
  deduped.unshift(nextBookmark);
  settingsStore.set('bookmarks', deduped.slice(0, 20));
  return deduped.slice(0, 20);
});

ipcMain.handle('delete-bookmark', (event, index) => {
  const bookmarks = settingsStore.get('bookmarks', []);
  bookmarks.splice(index, 1);
  settingsStore.set('bookmarks', bookmarks);
  return bookmarks;
});

ipcMain.handle('get-protection-stats', () => protectionStats);

ipcMain.handle('get-password-vault-status', () => passwordManager.getStatus());
ipcMain.handle('setup-password-vault', (event, masterPassword) => passwordManager.setupMasterPassword(masterPassword));
ipcMain.handle('unlock-password-vault', (event, masterPassword) => passwordManager.unlock(masterPassword));
ipcMain.handle('lock-password-vault', () => passwordManager.lock());
ipcMain.handle('save-password', (event, data) => passwordManager.savePassword(data));
ipcMain.handle('get-password', (event, url) => passwordManager.getPassword(url));
ipcMain.handle('get-all-passwords', () => passwordManager.getAllPasswords());
ipcMain.handle('delete-password', (event, id) => passwordManager.deletePassword(id));

app.whenReady().then(() => {
  setupSessionProtections();
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
