const el = (id) => document.getElementById(id);
const tabsList = el('tabs-list');
const webviewStack = el('webview-stack');
const urlInput = el('url-input');
const bookmarksRoot = el('bookmarks-root');
const bookmarkFolderStrip = el('bookmark-folder-strip');
const bookmarkManagerTree = el('bookmark-manager-tree');
const toast = el('toast');

const state = {
  settings: {},
  engines: {},
  tabs: [],
  activeTabId: null,
  bookmarks: [],
  activeFolderId: null,
  draggedNodeId: null,
  vault: { configured: false, unlocked: false, entryCount: 0 },
  passwords: [],
  recentCaptures: new Map()
};

let seq = 0;
let toastTimer = null;

function uid(prefix = 'id') { seq += 1; return `${prefix}-${Date.now()}-${seq}`; }
function esc(v) { return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function activeTab() { return state.tabs.find((tab) => tab.id === state.activeTabId) || null; }
function activeWebview() { const tab = activeTab(); return tab ? tab.webview : null; }
function engineMeta(id) { return state.engines[id] || state.engines['google-fr']; }
function favicon(url) { try { return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(new URL(url).hostname)}`; } catch (error) { return ''; } }
function currentUrl() { const tab = activeTab(); return tab ? tab.url : state.settings.homePage; }

function toastMsg(message, kind = 'info') {
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function resolveUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) { return state.settings.homePage; }
  const looksLikeUrl = raw.includes('.') || raw.startsWith('localhost') || raw.startsWith('http://') || raw.startsWith('https://');
  if (!looksLikeUrl) { return `${state.settings.searchEngine}${encodeURIComponent(raw)}`; }
  return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
}

function setAddress(url) {
  urlInput.value = url || '';
  const secure = String(url || '').startsWith('https://');
  el('security-lock').textContent = secure ? 'Securise' : 'Standard';
  el('security-lock').classList.toggle('warning', !secure);
}

function applySettings() {
  document.body.setAttribute('data-theme', state.settings.theme);
  document.body.classList.toggle('mode-optimization', Boolean(state.settings.optimizationMode));
  document.body.classList.toggle('compact-buttons', Boolean(state.settings.compactButtons));
  document.body.classList.toggle('reduce-motion', Boolean(state.settings.reduceMotion));
  el('bookmarks-bar').classList.toggle('hidden', !state.settings.showBookmarkBar);
  el('optimization-chip').classList.toggle('active', Boolean(state.settings.optimizationMode));
  el('adblock-toggle').classList.toggle('active', Boolean(state.settings.adBlockEnabled));
  el('optimization-toggle').classList.toggle('active', Boolean(state.settings.optimizationMode));
  urlInput.placeholder = `Rechercher avec ${engineMeta(state.settings.searchEngineId).label} ou entrer une URL`;
}

async function refreshSettings() {
  state.settings = await window.navyAPI.getSettings();
  applySettings();
}

function closePanels() {
  ['shields-panel', 'password-panel', 'bookmarks-panel'].forEach((id) => el(id).classList.remove('active'));
}

function updateNavButtons() {
  const view = activeWebview();
  el('back-btn').disabled = !view || !view.canGoBack();
  el('forward-btn').disabled = !view || !view.canGoForward();
}

function renderTabs() {
  tabsList.innerHTML = state.tabs.map((tab) => `
    <button class="tab-chip ${tab.id === state.activeTabId ? 'active' : ''} ${tab.loading ? 'loading' : ''}" data-tab="${tab.id}" type="button">
      ${tab.favicon ? `<img class="tab-favicon" src="${esc(tab.favicon)}" alt="">` : `<span class="tab-avatar">${esc((tab.title || 'N').slice(0, 1))}</span>`}
      <span class="tab-title">${esc(tab.title || 'Nouvel onglet')}</span>
      <span class="tab-close" data-close="${tab.id}">x</span>
    </button>
  `).join('');
  tabsList.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', (event) => {
    if (event.target.dataset.close) { return; }
    activateTab(button.dataset.tab);
  }));
  tabsList.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    closeTab(button.dataset.close);
  }));
}

function updateTab(id, patch) {
  const tab = state.tabs.find((item) => item.id === id);
  if (!tab) { return; }
  Object.assign(tab, patch);
  if (!tab.favicon) { tab.favicon = favicon(tab.url); }
  renderTabs();
  if (id === state.activeTabId) {
    setAddress(tab.url);
    updateNavButtons();
    seedManualPasswordUrl();
  }
}

function bindWebview(tab) {
  const view = tab.webview;
  view.addEventListener('did-start-loading', () => updateTab(tab.id, { loading: true }));
  view.addEventListener('did-stop-loading', () => {
    const url = view.getURL() || tab.url;
    updateTab(tab.id, { loading: false, url, title: view.getTitle() || tab.title, favicon: tab.favicon || favicon(url) });
    if (tab.id === state.activeTabId) { autoFill(view, url, 0); }
  });
  view.addEventListener('did-navigate', (event) => updateTab(tab.id, { url: event.url, favicon: favicon(event.url) }));
  view.addEventListener('did-navigate-in-page', (event) => updateTab(tab.id, { url: event.url }));
  view.addEventListener('page-title-updated', (event) => updateTab(tab.id, { title: event.title || 'Nouvel onglet' }));
  view.addEventListener('page-favicon-updated', (event) => { if (event.favicons && event.favicons[0]) { updateTab(tab.id, { favicon: event.favicons[0] }); } });
  view.addEventListener('did-fail-load', (event) => { if (event.errorCode !== -3) { toastMsg(`Chargement impossible : ${event.errorDescription}`, 'error'); updateTab(tab.id, { loading: false }); } });
  view.addEventListener('dom-ready', () => { if (tab.id === state.activeTabId) { autoFill(view, view.getURL() || tab.url, 0); } });
  view.addEventListener('ipc-message', async (event) => {
    const payload = event.args[0] || {};
    if (event.channel === 'password-form-detected') { await autoFill(view, payload.url || tab.url, 0); }
    if (event.channel === 'password-captured') { await capturePassword(payload); }
  });
}

function createTab(url = state.settings.homePage, activate = true) {
  const id = uid('tab');
  const view = document.createElement('webview');
  const target = resolveUrl(url);
  view.className = 'browser-webview';
  view.dataset.tabId = id;
  view.src = target;
  webviewStack.appendChild(view);
  const tab = { id, title: 'Nouvel onglet', url: target, favicon: favicon(target), loading: true, webview: view };
  state.tabs.push(tab);
  bindWebview(tab);
  if (activate) { activateTab(id); } else { renderTabs(); }
}

function activateTab(id) {
  state.activeTabId = id;
  state.tabs.forEach((tab) => tab.webview.classList.toggle('active', tab.id === id));
  const tab = activeTab();
  renderTabs();
  if (tab) {
    setAddress(tab.url);
    updateNavButtons();
    seedManualPasswordUrl();
  }
}

function closeTab(id) {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index === -1) { return; }
  const [removed] = state.tabs.splice(index, 1);
  removed.webview.remove();
  if (!state.tabs.length) { createTab(state.settings.homePage, true); return; }
  if (state.activeTabId === id) { activateTab((state.tabs[index - 1] || state.tabs[0]).id); } else { renderTabs(); }
}

function goTo(target) {
  const tab = activeTab();
  if (!tab) { return; }
  const url = resolveUrl(target);
  tab.webview.loadURL(url);
  updateTab(tab.id, { url, loading: true });
  closePanels();
}

function topFolders() { return state.bookmarks.filter((node) => node.type === 'folder'); }
function rootBookmarks() { return state.bookmarks.filter((node) => node.type === 'bookmark'); }

function findNode(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) { return node; }
    if (node.type === 'folder') {
      const nested = findNode(node.items, id);
      if (nested) { return nested; }
    }
  }
  return null;
}

function folderPath(nodes, id, path = []) {
  for (const node of nodes) {
    if (node.type !== 'folder') { continue; }
    const next = [...path, node];
    if (node.id === id) { return next; }
    const nested = folderPath(node.items, id, next);
    if (nested.length) { return nested; }
  }
  return [];
}

function currentFolder() { return state.activeFolderId ? findNode(state.bookmarks, state.activeFolderId) : null; }
function currentFolderTrail() { return state.activeFolderId ? folderPath(state.bookmarks, state.activeFolderId) : []; }
function currentTopFolderId() { const top = currentFolderTrail()[0]; return top ? top.id : null; }

function ensureFolder() {
  const folder = currentFolder();
  if (folder && folder.type === 'folder') { return; }
  state.activeFolderId = topFolders()[0] ? topFolders()[0].id : null;
}

function renderBookmarkBar() {
  ensureFolder();
  bookmarksRoot.innerHTML = [
    ...rootBookmarks().map((node) => `<button class="bookmark-item-chip" data-open-bookmark="${node.id}" type="button"><img class="favicon" src="${esc(favicon(node.url))}" alt=""><span>${esc(node.title)}</span></button>`),
    ...topFolders().map((folder) => `<button class="bookmark-folder-chip ${folder.id === currentTopFolderId() ? 'active' : ''}" data-folder="${folder.id}" type="button"><span class="folder-badge">D</span><span>${esc(folder.title)}</span><small>${folder.items.length}</small></button>`)
  ].join('');

  bookmarksRoot.querySelectorAll('[data-open-bookmark]').forEach((button) => button.addEventListener('click', () => {
    const node = findNode(state.bookmarks, button.dataset.openBookmark);
    if (node && node.url) { goTo(node.url); }
  }));

  bookmarksRoot.querySelectorAll('[data-folder]').forEach((button) => button.addEventListener('click', () => {
    state.activeFolderId = button.dataset.folder;
    renderBookmarks();
  }));

  const folder = currentFolder();
  if (!folder) {
    bookmarkFolderStrip.classList.add('hidden');
    bookmarkFolderStrip.innerHTML = '';
    return;
  }

  const trail = currentFolderTrail();
  const parent = trail.length > 1 ? trail[trail.length - 2] : null;
  bookmarkFolderStrip.classList.remove('hidden');
  bookmarkFolderStrip.innerHTML = `
    <div class="folder-strip-shell">
      <div class="folder-strip-header">
        <div class="folder-strip-title">
          ${parent ? `<button class="folder-strip-action" data-folder-back="${parent.id}" title="Dossier parent" aria-label="Dossier parent"><svg viewBox="0 0 24 24" class="icon"><path d="M15 18l-6-6 6-6"></path></svg></button>` : ''}
          <div><strong>${esc(folder.title)}</strong><span>${folder.items.length} element(s)</span></div>
        </div>
        <button class="folder-strip-action" data-folder-close="1" title="Fermer le dossier" aria-label="Fermer le dossier"><svg viewBox="0 0 24 24" class="icon"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg></button>
      </div>
      <div class="folder-strip-items">
        ${folder.items.length ? folder.items.map((node) => `
          <button class="bookmark-item-chip ${node.type === 'folder' ? 'folder-child' : ''}" data-folder-item="${node.id}" type="button">
            ${node.type === 'bookmark' ? `<img class="favicon" src="${esc(favicon(node.url))}" alt="">` : '<span class="folder-badge">D</span>'}
            <span>${esc(node.title)}</span>
          </button>
        `).join('') : '<span class="bookmark-empty">Ce dossier est vide.</span>'}
      </div>
    </div>
  `;

  bookmarkFolderStrip.querySelectorAll('[data-folder-item]').forEach((button) => button.addEventListener('click', () => {
    const node = findNode(state.bookmarks, button.dataset.folderItem);
    if (!node) { return; }
    if (node.type === 'folder') { state.activeFolderId = node.id; renderBookmarks(); return; }
    if (node.url) { goTo(node.url); }
  }));
  const closeFolderButton = bookmarkFolderStrip.querySelector('[data-folder-close]');
  if (closeFolderButton) {
    closeFolderButton.addEventListener('click', () => { state.activeFolderId = null; renderBookmarks(); });
  }

  const backFolderButton = bookmarkFolderStrip.querySelector('[data-folder-back]');
  if (backFolderButton) {
    backFolderButton.addEventListener('click', (event) => { state.activeFolderId = event.currentTarget.dataset.folderBack; renderBookmarks(); });
  }
}

function renderBookmarkManager() {
  const columns = [{ id: '__root__', title: 'Barre principale', items: rootBookmarks() }, ...topFolders().map((folder) => ({ id: folder.id, title: folder.title, items: folder.items }))];
  bookmarkManagerTree.innerHTML = columns.map((column) => `
    <div class="bookmark-column" data-drop="${column.id}">
      <div class="bookmark-column-head"><strong>${esc(column.title)}</strong><span>${column.items.length}</span></div>
      <div class="bookmark-column-body">
        ${column.items.length ? column.items.map((node) => `
          <div class="bookmark-card" draggable="true" data-drag="${node.id}">
            <div class="bookmark-card-main"><strong>${esc(node.title)}</strong><small>${node.type === 'bookmark' ? esc(node.url) : 'Dossier'}</small></div>
            <div class="bookmark-card-actions">
              ${node.type === 'bookmark' ? `<button class="tiny-btn" data-open="${node.id}">Ouvrir</button>` : `<button class="tiny-btn" data-focus-folder="${node.id}">Voir</button>`}
              <button class="tiny-btn danger" data-delete="${node.id}">Supprimer</button>
            </div>
          </div>
        `).join('') : '<div class="bookmark-drop-placeholder">Depose ici des favoris</div>'}
      </div>
    </div>
  `).join('');

  bookmarkManagerTree.querySelectorAll('[data-drag]').forEach((card) => card.addEventListener('dragstart', () => { state.draggedNodeId = card.dataset.drag; }));
  bookmarkManagerTree.querySelectorAll('[data-drop]').forEach((column) => {
    column.addEventListener('dragover', (event) => { event.preventDefault(); column.classList.add('drag-over'); });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', async (event) => { event.preventDefault(); column.classList.remove('drag-over'); await moveBookmark(state.draggedNodeId, column.dataset.drop); });
  });
  bookmarkManagerTree.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => {
    const node = findNode(state.bookmarks, button.dataset.open);
    if (node && node.url) { goTo(node.url); el('bookmarks-panel').classList.remove('active'); }
  }));
  bookmarkManagerTree.querySelectorAll('[data-focus-folder]').forEach((button) => button.addEventListener('click', () => {
    state.activeFolderId = button.dataset.focusFolder;
    renderBookmarks();
    el('bookmarks-panel').classList.remove('active');
  }));
  bookmarkManagerTree.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm('Supprimer cet element ?')) { return; }
    await window.navyAPI.deleteBookmark(button.dataset.delete);
    await loadBookmarks();
  }));
}

function renderBookmarks() { renderBookmarkBar(); renderBookmarkManager(); }
async function loadBookmarks() { state.bookmarks = await window.navyAPI.getBookmarks(); renderBookmarks(); }

function removeNode(nodes, id) {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.id === id) { return nodes.splice(i, 1)[0]; }
    if (node.type === 'folder') { const nested = removeNode(node.items, id); if (nested) { return nested; } }
  }
  return null;
}

function insertNode(nodes, folderId, node) {
  if (folderId === '__root__') { nodes.push(node); return true; }
  const folder = nodes.find((item) => item.type === 'folder' && item.id === folderId);
  if (!folder) { return false; }
  folder.items.push(node);
  return true;
}

async function moveBookmark(nodeId, folderId) {
  if (!nodeId || !folderId) { return; }
  const next = clone(state.bookmarks);
  const node = removeNode(next, nodeId);
  if (!node) { return; }
  if (!insertNode(next, folderId, node)) { next.push(node); }
  state.bookmarks = await window.navyAPI.saveBookmarksTree(next);
  renderBookmarks();
}

async function addCurrentBookmark() {
  const tab = activeTab();
  if (!tab || !tab.url) { return; }
  await window.navyAPI.addBookmark({ title: tab.title || 'Nouvel onglet', url: tab.url, folderId: state.activeFolderId || (topFolders()[0] && topFolders()[0].id) });
  await loadBookmarks();
  toastMsg('Favori ajoute.', 'success');
}

async function createFolder() {
  const title = String(el('new-folder-input').value || window.prompt('Nom du dossier', 'Nouveau dossier') || '').trim();
  if (!title) { return; }
  const next = clone(state.bookmarks);
  next.push({ id: uid('folder'), type: 'folder', title, items: [] });
  el('new-folder-input').value = '';
  state.bookmarks = await window.navyAPI.saveBookmarksTree(next);
  state.activeFolderId = topFolders()[topFolders().length - 1] ? topFolders()[topFolders().length - 1].id : state.activeFolderId;
  renderBookmarks();
  toastMsg('Dossier cree.', 'success');
}

function mask(password) { return '*'.repeat(Math.max(8, String(password || '').length)); }
function vaultMsg(message = '', kind = 'info') { el('vault-feedback').textContent = message; el('vault-feedback').dataset.kind = message ? kind : ''; }
function seedManualPasswordUrl() { const input = el('manual-password-url'); if (input && !input.value.trim()) { input.value = currentUrl() || state.settings.homePage || ''; } }

async function refreshVault() {
  state.vault = await window.navyAPI.getPasswordVaultStatus();
  el('vault-lock-btn').classList.toggle('hidden', !state.vault.unlocked);
  el('vault-setup-view').classList.toggle('hidden', state.vault.configured);
  el('vault-unlock-view').classList.toggle('hidden', !state.vault.configured || state.vault.unlocked);
  el('vault-list-view').classList.toggle('hidden', !state.vault.unlocked);
  el('vault-status-text').textContent = !state.vault.configured ? 'Configure un mot de passe maitre pour proteger tes identifiants en local.' : state.vault.unlocked ? `Coffre deverrouille. ${state.vault.entryCount} identifiant(s) disponibles.` : `Coffre configure. ${state.vault.entryCount} identifiant(s) disponibles apres deverrouillage.`;
  if (state.vault.unlocked) { await loadPasswords(); seedManualPasswordUrl(); }
}

async function loadPasswords() { state.passwords = await window.navyAPI.getAllPasswords(); renderPasswords(); }

function renderPasswords() {
  const filter = String(el('vault-filter').value || '').trim().toLowerCase();
  const list = state.passwords.filter((item) => !filter || item.domain.toLowerCase().includes(filter) || item.username.toLowerCase().includes(filter) || item.origin.toLowerCase().includes(filter));
  el('password-list').innerHTML = !list.length ? '<div class="empty-state">Aucun mot de passe ne correspond a cette recherche.</div>' : list.map((item) => `
    <article class="password-item">
      <div class="password-item-header"><div><div class="password-item-domain">${esc(item.domain)}</div><div class="password-item-origin">${esc(item.origin)}</div></div><button class="danger-btn" data-del-pwd="${item.id}">Supprimer</button></div>
      <div class="password-meta">Identifiant</div><div class="password-value">${esc(item.username)}</div>
      <div class="password-meta">Mot de passe</div><div class="password-secret">${mask(item.password)}</div>
      <div class="password-actions"><button class="secondary-btn" data-reveal="${item.id}">Afficher</button><button class="secondary-btn" data-open-pwd="${item.origin}">Ouvrir</button><button class="primary-btn" data-fill="${item.id}">Remplir</button></div>
    </article>
  `).join('');
  el('password-list').querySelectorAll('[data-del-pwd]').forEach((button) => button.addEventListener('click', async () => { await window.navyAPI.deletePassword(button.dataset.delPwd); await refreshVault(); toastMsg('Mot de passe supprime.', 'success'); }));
  el('password-list').querySelectorAll('[data-open-pwd]').forEach((button) => button.addEventListener('click', () => goTo(button.dataset.openPwd)));
  el('password-list').querySelectorAll('[data-reveal]').forEach((button) => button.addEventListener('click', () => {
    const item = state.passwords.find((pwd) => pwd.id === button.dataset.reveal);
    const secret = button.closest('.password-item').querySelector('.password-secret');
    const masked = secret.textContent.includes('*');
    secret.textContent = masked ? item.password : mask(item.password);
    button.textContent = masked ? 'Masquer' : 'Afficher';
  }));
  el('password-list').querySelectorAll('[data-fill]').forEach((button) => button.addEventListener('click', async () => {
    const item = state.passwords.find((pwd) => pwd.id === button.dataset.fill);
    await fillCreds(activeWebview(), item);
  }));
}

async function fillCreds(view, cred) {
  if (!view || !cred) { return false; }
  const ok = await view.executeJavaScript(`(() => {
    const forms = [...document.querySelectorAll('form')];
    if (!forms.length) { forms.push(document); }
    const selectors = 'input[autocomplete="username"], input[autocomplete="email"], input[type="email"], input[name*="user" i], input[name*="login" i], input[name*="mail" i], input[name*="ident" i], input[id*="user" i], input[id*="login" i], input[id*="mail" i], input[type="text"]';
    const username = ${JSON.stringify(cred.username)};
    const password = ${JSON.stringify(cred.password)};
    for (const form of forms) {
      const pass = form.querySelector('input[type="password"], input[autocomplete="current-password"], input[autocomplete="new-password"]');
      if (!pass) { continue; }
      const user = form.querySelector(selectors);
      if (user) {
        user.focus();
        user.value = username;
        user.dispatchEvent(new Event('input', { bubbles: true }));
        user.dispatchEvent(new Event('change', { bubbles: true }));
      }
      pass.focus();
      pass.value = password;
      pass.dispatchEvent(new Event('input', { bubbles: true }));
      pass.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  })();`, true);
  if (ok) { toastMsg('Identifiants remplis automatiquement.', 'success'); }
  return Boolean(ok);
}

async function autoFill(view, url, attempt = 0) {
  if (!state.settings.passwordManagerEnabled || !state.settings.autoFillPasswords || !state.vault.unlocked || !view || !url) { return; }
  const cred = await window.navyAPI.getPassword(url);
  if (!cred) { return; }
  const filled = await fillCreds(view, cred);
  if (!filled && attempt < 4) { setTimeout(() => autoFill(view, url, attempt + 1), 500 * (attempt + 1)); }
}

async function capturePassword(data) {
  if (!state.settings.passwordManagerEnabled || !state.settings.autoSavePasswords || !data || !data.url || !data.username || !data.password) { return; }
  const signature = `${data.url}|${data.username}|${data.password}`;
  if (state.recentCaptures.has(signature)) { return; }
  state.recentCaptures.set(signature, Date.now());
  setTimeout(() => state.recentCaptures.delete(signature), 5000);
  await refreshVault();
  if (!state.vault.configured) { toastMsg('Configure le coffre-fort pour la sauvegarde auto.', 'warning'); return; }
  if (!state.vault.unlocked) { toastMsg('Deverrouille le coffre-fort pour la sauvegarde auto.', 'warning'); return; }
  const current = await window.navyAPI.getPassword(data.url);
  if (current && current.username === data.username && current.password === data.password) { return; }
  const result = await window.navyAPI.savePassword(data);
  if (result.success) { await refreshVault(); toastMsg('Mot de passe enregistre automatiquement.', 'success'); }
}

async function saveManualPassword() {
  if (!state.vault.configured) { vaultMsg('Cree d abord le coffre-fort.', 'error'); return; }
  if (!state.vault.unlocked) { vaultMsg('Deverrouille le coffre-fort avant un ajout manuel.', 'error'); return; }
  const url = String(el('manual-password-url').value || '').trim();
  const username = String(el('manual-password-username').value || '').trim();
  const password = String(el('manual-password-value').value || '').trim();
  if (!url || !username || !password) { vaultMsg('URL, identifiant et mot de passe sont requis.', 'error'); return; }
  const result = await window.navyAPI.savePassword({ url, username, password });
  if (!result.success) { vaultMsg(result.error || 'Enregistrement manuel impossible.', 'error'); return; }
  el('manual-password-username').value = '';
  el('manual-password-value').value = '';
  vaultMsg('Identifiant enregistre dans le coffre.', 'success');
  await refreshVault();
  const tab = activeTab();
  if (tab && tab.url) { await autoFill(activeWebview(), tab.url, 0); }
}

function bind() {
  urlInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { goTo(urlInput.value); } });
  el('back-btn').addEventListener('click', () => { const view = activeWebview(); if (view && view.canGoBack()) { view.goBack(); } });
  el('forward-btn').addEventListener('click', () => { const view = activeWebview(); if (view && view.canGoForward()) { view.goForward(); } });
  el('reload-btn').addEventListener('click', () => { const view = activeWebview(); if (view) { view.reload(); } });
  el('home-btn').addEventListener('click', () => goTo(state.settings.homePage));
  el('new-tab-btn').addEventListener('click', () => createTab(state.settings.homePage, true));
  el('bookmark-add-btn').addEventListener('click', addCurrentBookmark);
  el('optimization-chip').addEventListener('click', async () => {
    state.settings = await window.navyAPI.saveSettings({ ...state.settings, optimizationMode: !state.settings.optimizationMode });
    applySettings();
    toastMsg(state.settings.optimizationMode ? 'Mode optimisation active.' : 'Mode optimisation desactive.', 'success');
  });
  el('shields-btn').addEventListener('click', () => { el('shields-panel').classList.toggle('active'); el('password-panel').classList.remove('active'); el('bookmarks-panel').classList.remove('active'); });
  el('passwords-btn').addEventListener('click', async () => { el('password-panel').classList.toggle('active'); el('shields-panel').classList.remove('active'); el('bookmarks-panel').classList.remove('active'); seedManualPasswordUrl(); await refreshVault(); });
  el('manage-bookmarks-btn').addEventListener('click', () => { el('bookmarks-panel').classList.toggle('active'); el('password-panel').classList.remove('active'); el('shields-panel').classList.remove('active'); renderBookmarkManager(); });
  el('settings-btn').addEventListener('click', () => { window.location.href = 'settings.html'; });
  el('new-folder-btn').addEventListener('click', createFolder);
  el('create-folder-btn').addEventListener('click', createFolder);
  el('adblock-toggle').addEventListener('click', async () => { state.settings = await window.navyAPI.saveSettings({ ...state.settings, adBlockEnabled: !state.settings.adBlockEnabled }); applySettings(); });
  el('optimization-toggle').addEventListener('click', async () => { state.settings = await window.navyAPI.saveSettings({ ...state.settings, optimizationMode: !state.settings.optimizationMode }); applySettings(); });
  el('bookmark-root-dropzone').addEventListener('dragover', (event) => { event.preventDefault(); el('bookmark-root-dropzone').classList.add('drag-over'); });
  el('bookmark-root-dropzone').addEventListener('dragleave', () => el('bookmark-root-dropzone').classList.remove('drag-over'));
  el('bookmark-root-dropzone').addEventListener('drop', async (event) => { event.preventDefault(); el('bookmark-root-dropzone').classList.remove('drag-over'); await moveBookmark(state.draggedNodeId, '__root__'); });
  document.querySelectorAll('[data-close-panel]').forEach((button) => button.addEventListener('click', closePanels));
  el('vault-create-btn').addEventListener('click', async () => {
    const password = el('vault-master-password').value;
    const confirm = el('vault-master-confirm').value;
    if (password !== confirm) { vaultMsg('Les deux mots de passe ne correspondent pas.', 'error'); return; }
    const result = await window.navyAPI.setupPasswordVault(password);
    if (!result.success) { vaultMsg(result.error || 'Creation impossible.', 'error'); return; }
    const tab = activeTab();
    el('vault-master-password').value = '';
    el('vault-master-confirm').value = '';
    vaultMsg('Coffre cree et deverrouille.', 'success');
    await refreshVault();
    await autoFill(activeWebview(), tab ? tab.url : '', 0);
  });
  el('vault-unlock-btn').addEventListener('click', async () => {
    const result = await window.navyAPI.unlockPasswordVault(el('vault-unlock-password').value);
    if (!result.success) { vaultMsg(result.error || 'Deverrouillage impossible.', 'error'); return; }
    const tab = activeTab();
    el('vault-unlock-password').value = '';
    vaultMsg('Coffre deverrouille.', 'success');
    await refreshVault();
    await autoFill(activeWebview(), tab ? tab.url : '', 0);
  });
  el('vault-lock-btn').addEventListener('click', async () => { await window.navyAPI.lockPasswordVault(); vaultMsg('Coffre verrouille.', 'info'); await refreshVault(); });
  el('vault-refresh-btn').addEventListener('click', refreshVault);
  el('vault-filter').addEventListener('input', renderPasswords);
  el('manual-password-current-btn').addEventListener('click', () => { el('manual-password-url').value = currentUrl() || state.settings.homePage || ''; });
  el('manual-password-save-btn').addEventListener('click', saveManualPassword);
  window.navyAPI.onProtectionStats((stats) => {
    el('blocked-count').textContent = String(stats.total || 0);
    el('total-blocked').textContent = String(stats.total || 0);
    el('ads-blocked').textContent = String(stats.ads || 0);
    el('trackers-blocked').textContent = String(stats.trackers || 0);
    el('optimization-blocked').textContent = String(stats.optimization || 0);
  });
  document.addEventListener('click', (event) => {
    if (!el('shields-panel').contains(event.target) && !el('shields-btn').contains(event.target)) { el('shields-panel').classList.remove('active'); }
    if (!el('password-panel').contains(event.target) && !el('passwords-btn').contains(event.target)) { el('password-panel').classList.remove('active'); }
    if (!el('bookmarks-panel').contains(event.target) && !el('manage-bookmarks-btn').contains(event.target)) { el('bookmarks-panel').classList.remove('active'); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 't') { event.preventDefault(); createTab(state.settings.homePage, true); }
    if (event.ctrlKey && event.key.toLowerCase() === 'w') { event.preventDefault(); closeTab(state.activeTabId); }
    if (event.ctrlKey && event.key.toLowerCase() === 'l') { event.preventDefault(); urlInput.focus(); urlInput.select(); }
  });
}

async function init() {
  state.engines = await window.navyAPI.getSearchEngines();
  await refreshSettings();
  await loadBookmarks();
  await refreshVault();
  const stats = await window.navyAPI.getProtectionStats();
  el('blocked-count').textContent = String(stats.total || 0);
  el('total-blocked').textContent = String(stats.total || 0);
  el('ads-blocked').textContent = String(stats.ads || 0);
  el('trackers-blocked').textContent = String(stats.trackers || 0);
  el('optimization-blocked').textContent = String(stats.optimization || 0);
  bind();
  createTab(state.settings.launchToHomePage ? state.settings.homePage : 'about:blank', true);
}

init();
