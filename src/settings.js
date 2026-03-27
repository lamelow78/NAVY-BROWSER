const crypto = require('crypto');
const Store = require('electron-store');

const SEARCH_ENGINES = {
  'google-fr': {
    id: 'google-fr',
    label: 'Google France',
    queryUrl: 'https://www.google.fr/search?q=',
    homeUrl: 'https://www.google.fr'
  },
  google: {
    id: 'google',
    label: 'Google',
    queryUrl: 'https://www.google.com/search?q=',
    homeUrl: 'https://www.google.com'
  },
  duckduckgo: {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    queryUrl: 'https://duckduckgo.com/?q=',
    homeUrl: 'https://duckduckgo.com'
  },
  bing: {
    id: 'bing',
    label: 'Bing',
    queryUrl: 'https://www.bing.com/search?q=',
    homeUrl: 'https://www.bing.com'
  },
  qwant: {
    id: 'qwant',
    label: 'Qwant',
    queryUrl: 'https://www.qwant.com/?q=',
    homeUrl: 'https://www.qwant.com'
  },
  startpage: {
    id: 'startpage',
    label: 'Startpage',
    queryUrl: 'https://www.startpage.com/sp/search?query=',
    homeUrl: 'https://www.startpage.com'
  }
};

const DEFAULT_SETTINGS = {
  theme: 'dark',
  searchEngineId: 'google-fr',
  searchEngine: SEARCH_ENGINES['google-fr'].queryUrl,
  optimizationMode: false,
  adBlockEnabled: true,
  showBookmarkBar: true,
  passwordManagerEnabled: true,
  homePage: SEARCH_ENGINES['google-fr'].homeUrl
};

function createBookmarkFolder(title = 'Nouveau dossier', id = crypto.randomUUID(), items = []) {
  return {
    id,
    type: 'folder',
    title,
    items
  };
}

function createBookmarkItem(bookmark = {}) {
  return {
    id: bookmark.id || crypto.randomUUID(),
    type: 'bookmark',
    title: bookmark.title || 'Nouvel onglet',
    url: bookmark.url,
    createdAt: bookmark.createdAt || new Date().toISOString()
  };
}

function normalizeBookmarkNode(node) {
  if (!node || typeof node !== 'object') {
    return null;
  }

  if (node.type === 'folder' || Array.isArray(node.items)) {
    return createBookmarkFolder(
      node.title || 'Dossier',
      node.id || crypto.randomUUID(),
      (node.items || [])
        .map((item) => normalizeBookmarkNode(item))
        .filter(Boolean)
    );
  }

  if (typeof node.url === 'string' && node.url.trim()) {
    return createBookmarkItem(node);
  }

  return null;
}

function normalizeBookmarks(bookmarks = []) {
  if (!Array.isArray(bookmarks) || !bookmarks.length) {
    return [createBookmarkFolder('Favoris')];
  }

  if (bookmarks.every((item) => item && typeof item.url === 'string' && !item.type)) {
    return [
      createBookmarkFolder(
        'Favoris',
        crypto.randomUUID(),
        bookmarks.map((bookmark) => createBookmarkItem(bookmark))
      )
    ];
  }

  const normalized = bookmarks
    .map((item) => normalizeBookmarkNode(item))
    .filter(Boolean);

  return normalized.length ? normalized : [createBookmarkFolder('Favoris')];
}

function normalizeSettings(settings = {}) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...settings
  };

  if (!SEARCH_ENGINES[merged.searchEngineId]) {
    merged.searchEngineId = DEFAULT_SETTINGS.searchEngineId;
  }

  merged.searchEngine = SEARCH_ENGINES[merged.searchEngineId].queryUrl;

  if (typeof merged.homePage !== 'string' || !merged.homePage.trim()) {
    merged.homePage = SEARCH_ENGINES[merged.searchEngineId].homeUrl;
  }

  return merged;
}

function createSettingsStore() {
  return new Store({
    name: 'navy-preferences',
    defaults: {
      settings: DEFAULT_SETTINGS,
      bookmarks: [createBookmarkFolder('Favoris')]
    }
  });
}

module.exports = {
  SEARCH_ENGINES,
  DEFAULT_SETTINGS,
  createBookmarkFolder,
  createBookmarkItem,
  normalizeBookmarks,
  normalizeSettings,
  createSettingsStore
};
