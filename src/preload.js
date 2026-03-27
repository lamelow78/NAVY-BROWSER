const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('navyAPI', {
  onProtectionStats: (callback) => {
    ipcRenderer.on('protection-stats', (event, stats) => callback(stats));
  },
  getProtectionStats: () => ipcRenderer.invoke('get-protection-stats'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getSearchEngines: () => ipcRenderer.invoke('get-search-engines'),
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (bookmark) => ipcRenderer.invoke('add-bookmark', bookmark),
  deleteBookmark: (index) => ipcRenderer.invoke('delete-bookmark', index),
  getPasswordVaultStatus: () => ipcRenderer.invoke('get-password-vault-status'),
  setupPasswordVault: (masterPassword) => ipcRenderer.invoke('setup-password-vault', masterPassword),
  unlockPasswordVault: (masterPassword) => ipcRenderer.invoke('unlock-password-vault', masterPassword),
  lockPasswordVault: () => ipcRenderer.invoke('lock-password-vault'),
  savePassword: (data) => ipcRenderer.invoke('save-password', data),
  getPassword: (url) => ipcRenderer.invoke('get-password', url),
  getAllPasswords: () => ipcRenderer.invoke('get-all-passwords'),
  deletePassword: (id) => ipcRenderer.invoke('delete-password', id)
});
