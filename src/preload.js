const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('navyAPI', {
  // Pubs bloquées
  onAdBlocked: (callback) => ipcRenderer.on('ad-blocked', callback),
  getBlockedCount: () => ipcRenderer.invoke('get-blocked-count'),
  
  // Paramètres
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // Mots de passe
  savePassword: (data) => ipcRenderer.invoke('save-password', data),
  getPassword: (url) => ipcRenderer.invoke('get-password', url),
  getAllPasswords: () => ipcRenderer.invoke('get-all-passwords'),
  deletePassword: (url) => ipcRenderer.invoke('delete-password', url),
  
  // Favoris
  addBookmark: (bookmark) => ipcRenderer.invoke('add-bookmark', bookmark),
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  deleteBookmark: (index) => ipcRenderer.invoke('delete-bookmark', index)
});