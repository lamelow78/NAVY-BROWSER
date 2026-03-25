const Store = require('electron-store');

class SettingsManager {
  constructor() {
    this.store = new Store({
      name: 'navy-settings',
      defaults: {
        theme: 'dark', // dark, light, blue, green
        searchEngine: 'https://www.google.fr/search?q=',
        optimizationMode: false,
        adBlockEnabled: true,
        showBookmarkBar: true,
        bookmarks: [],
        homePage: 'https://www.google.fr'
      }
    });
  }

  getSettings() {
    return this.store.store;
  }

  saveSettings(newSettings) {
    for (const [key, value] of Object.entries(newSettings)) {
      this.store.set(key, value);
    }
  }

  getBookmarks() {
    return this.store.get('bookmarks', []);
  }

  saveBookmarks(bookmarks) {
    this.store.set('bookmarks', bookmarks);
  }
}

module.exports = SettingsManager;