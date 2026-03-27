const urlInput = document.getElementById('url-input');
const browserView = document.getElementById('browser-view');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const homeBtn = document.getElementById('home-btn');
const shieldsBtn = document.getElementById('shields-btn');
const shieldsPanel = document.getElementById('shields-panel');
const passwordsBtn = document.getElementById('passwords-btn');
const passwordPanel = document.getElementById('password-panel');
const settingsBtn = document.getElementById('settings-btn');
const blockedCount = document.getElementById('blocked-count');
const bookmarksBar = document.getElementById('bookmarks-bar');
const bookmarksContainer = document.getElementById('bookmarks-container');
const bookmarkAddBtn = document.getElementById('bookmark-add-btn');
const engineSelect = document.getElementById('engine-select');
const pageTitleEl = document.getElementById('page-title');
const pageHostEl = document.getElementById('page-host');
const securityLock = document.getElementById('security-lock');
const optimizationChip = document.getElementById('optimization-chip');
const adblockToggle = document.getElementById('adblock-toggle');
const optimizationToggle = document.getElementById('optimization-toggle');
const passwordSavePopup = document.getElementById('password-save-popup');
const toast = document.getElementById('toast');
const vaultStatusText = document.getElementById('vault-status-text');
const vaultFeedback = document.getElementById('vault-feedback');
const vaultSetupView = document.getElementById('vault-setup-view');
const vaultUnlockView = document.getElementById('vault-unlock-view');
const vaultListView = document.getElementById('vault-list-view');
const vaultLockBtn = document.getElementById('vault-lock-btn');
const vaultFilter = document.getElementById('vault-filter');
const passwordList = document.getElementById('password-list');

let currentSettings = {};
let searchEngines = {};
let currentUrl = '';
let pendingPasswordSave = null;
let vaultStatus = {
  configured: false,
  unlocked: false,
  entryCount: 0
};
let passwordsCache = [];
let toastTimer = null;

function showToast(message, kind = 'info') {
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getEngineMeta(engineId) {
  return searchEngines[engineId] || searchEngines['google-fr'];
}

function normalizeInputToUrl(value) {
  const raw = value.trim();

  if (!raw) {
    return currentSettings.homePage;
  }

  const looksLikeUrl =
    raw.includes('.') ||
    raw.startsWith('localhost') ||
    raw.startsWith('http://') ||
    raw.startsWith('https://');

  if (!looksLikeUrl) {
    return `${currentSettings.searchEngine}${encodeURIComponent(raw)}`;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }

  return `https://${raw}`;
}

function closePanels() {
  shieldsPanel.classList.remove('active');
  passwordPanel.classList.remove('active');
}

async function refreshSettings() {
  currentSettings = await window.navyAPI.getSettings();
  document.body.setAttribute('data-theme', currentSettings.theme);
  bookmarksBar.classList.toggle('hidden', !currentSettings.showBookmarkBar);
  optimizationChip.classList.toggle('active', Boolean(currentSettings.optimizationMode));
  adblockToggle.classList.toggle('active', Boolean(currentSettings.adBlockEnabled));
  optimizationToggle.classList.toggle('active', Boolean(currentSettings.optimizationMode));
  renderSearchEngines();
}

function renderSearchEngines() {
  const currentId = currentSettings.searchEngineId || 'google-fr';

  if (!engineSelect.children.length) {
    engineSelect.innerHTML = Object.values(searchEngines)
      .map((engine) => `<option value="${engine.id}">${engine.label}</option>`)
      .join('');
  }

  engineSelect.value = currentId;

  document.querySelectorAll('.engine-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.engine === currentId);
  });
}

function updateProtectionStats(stats) {
  blockedCount.textContent = String(stats.total || 0);
  document.getElementById('total-blocked').textContent = String(stats.total || 0);
  document.getElementById('ads-blocked').textContent = String(stats.ads || 0);
  document.getElementById('trackers-blocked').textContent = String(stats.trackers || 0);
  document.getElementById('optimization-blocked').textContent = String(stats.optimization || 0);
}

async function loadBookmarks() {
  const bookmarks = await window.navyAPI.getBookmarks();
  bookmarksContainer.innerHTML = '';

  if (!bookmarks.length) {
    bookmarksContainer.innerHTML = '<span class="bookmark-empty">Ajoute tes sites favoris pour les ouvrir en un clic.</span>';
    return;
  }

  bookmarks.forEach((bookmark, index) => {
    const item = document.createElement('button');
    item.className = 'bookmark-item';
    item.type = 'button';
    item.innerHTML = `
      <img class="favicon" src="https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(bookmark.url)}" alt="">
      <span>${escapeHtml(bookmark.title)}</span>
      <span class="delete-bookmark" data-index="${index}">x</span>
    `;

    item.addEventListener('click', (event) => {
      if (!event.target.classList.contains('delete-bookmark')) {
        navigateTo(bookmark.url);
      }
    });

    bookmarksContainer.appendChild(item);
  });

  bookmarksContainer.querySelectorAll('.delete-bookmark').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await window.navyAPI.deleteBookmark(Number(button.dataset.index));
      loadBookmarks();
    });
  });
}

function updateSecurityIndicator(url) {
  const isSecure = url.startsWith('https://');
  securityLock.textContent = isSecure ? 'Securise' : 'Standard';
  securityLock.classList.toggle('warning', !isSecure);
}

function updateAddress(url) {
  currentUrl = url;
  urlInput.value = url;
  updateSecurityIndicator(url);

  try {
    pageHostEl.textContent = new URL(url).hostname;
  } catch (error) {
    pageHostEl.textContent = 'Navigation locale';
  }
}

function updateNavButtons() {
  backBtn.disabled = !browserView.canGoBack();
  forwardBtn.disabled = !browserView.canGoForward();
}

function navigateTo(target) {
  const url = normalizeInputToUrl(target);
  browserView.src = url;
  updateAddress(url);
  closePanels();
}

async function savePartialSettings(partialSettings) {
  currentSettings = await window.navyAPI.saveSettings({
    ...currentSettings,
    ...partialSettings
  });

  await refreshSettings();
  return currentSettings;
}

function maskPassword(password) {
  return '*'.repeat(Math.max(8, password.length));
}

async function fillCurrentPage(credential) {
  if (!credential || !currentUrl) {
    return;
  }

  let sameSite = false;

  try {
    const currentDomain = new URL(currentUrl).hostname;
    sameSite = currentDomain === credential.domain || currentDomain.endsWith(`.${credential.domain}`);
  } catch (error) {
    sameSite = false;
  }

  if (!sameSite) {
    showToast('Ouvre le site correspondant avant de remplir les champs.', 'warning');
    return;
  }

  const result = await browserView.executeJavaScript(
    `(() => {
      const passwordField = document.querySelector('input[type="password"]');
      if (!passwordField) {
        return false;
      }

      const form = passwordField.closest('form') || document;
      const userField = form.querySelector('input[type="email"], input[name*="user" i], input[name*="login" i], input[name*="mail" i], input[autocomplete="username"]');
      const username = ${JSON.stringify(credential.username)};
      const password = ${JSON.stringify(credential.password)};

      if (userField) {
        userField.value = username;
        userField.dispatchEvent(new Event('input', { bubbles: true }));
        userField.dispatchEvent(new Event('change', { bubbles: true }));
      }

      passwordField.value = password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    })();`,
    true
  );

  if (result) {
    showToast('Identifiants remplis automatiquement.', 'success');
  }
}

function renderPasswords() {
  const filter = vaultFilter.value.trim().toLowerCase();
  const visiblePasswords = passwordsCache.filter((item) => {
    if (!filter) {
      return true;
    }

    return item.domain.toLowerCase().includes(filter) || item.username.toLowerCase().includes(filter);
  });

  if (!visiblePasswords.length) {
    passwordList.innerHTML = '<div class="empty-state">Aucun mot de passe ne correspond a cette recherche.</div>';
    return;
  }

  passwordList.innerHTML = visiblePasswords
    .map((item) => `
      <article class="password-item" data-id="${item.id}">
        <div class="password-item-header">
          <div>
            <div class="password-item-domain">${escapeHtml(item.domain)}</div>
            <div class="password-item-origin">${escapeHtml(item.origin)}</div>
          </div>
          <button class="danger-btn delete-password-btn" data-id="${item.id}">Supprimer</button>
        </div>
        <div class="password-meta">Identifiant</div>
        <div class="password-value">${escapeHtml(item.username)}</div>
        <div class="password-meta">Mot de passe</div>
        <div class="password-secret">${maskPassword(item.password)}</div>
        <div class="password-actions">
          <button class="secondary-btn reveal-password-btn" data-id="${item.id}">Afficher</button>
          <button class="secondary-btn open-password-site-btn" data-origin="${escapeHtml(item.origin)}">Ouvrir</button>
          <button class="primary-btn fill-password-btn" data-id="${item.id}">Remplir</button>
        </div>
      </article>
    `)
    .join('');

  passwordList.querySelectorAll('.reveal-password-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const item = passwordsCache.find((entry) => entry.id === button.dataset.id);
      const secret = button.closest('.password-item').querySelector('.password-secret');
      const isMasked = secret.textContent.includes('*');
      secret.textContent = isMasked ? item.password : maskPassword(item.password);
      button.textContent = isMasked ? 'Masquer' : 'Afficher';
    });
  });

  passwordList.querySelectorAll('.delete-password-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const result = await window.navyAPI.deletePassword(button.dataset.id);

      if (!result.success) {
        showToast(result.error || 'Suppression impossible.', 'error');
        return;
      }

      await refreshVaultStatus();
      await loadPasswords();
      showToast('Mot de passe supprime.', 'success');
    });
  });

  passwordList.querySelectorAll('.open-password-site-btn').forEach((button) => {
    button.addEventListener('click', () => {
      navigateTo(button.dataset.origin);
    });
  });

  passwordList.querySelectorAll('.fill-password-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const credential = passwordsCache.find((item) => item.id === button.dataset.id);
      await fillCurrentPage(credential);
    });
  });
}

async function loadPasswords() {
  passwordsCache = await window.navyAPI.getAllPasswords();
  renderPasswords();
}

function setVaultFeedback(message = '', kind = 'info') {
  vaultFeedback.textContent = message;
  vaultFeedback.dataset.kind = message ? kind : '';
}

async function refreshVaultStatus() {
  vaultStatus = await window.navyAPI.getPasswordVaultStatus();
  vaultLockBtn.classList.toggle('hidden', !vaultStatus.unlocked);

  vaultSetupView.classList.toggle('hidden', vaultStatus.configured);
  vaultUnlockView.classList.toggle('hidden', !vaultStatus.configured || vaultStatus.unlocked);
  vaultListView.classList.toggle('hidden', !vaultStatus.unlocked);

  if (!vaultStatus.configured) {
    vaultStatusText.textContent = 'Configure un mot de passe maitre pour proteger tes identifiants en local.';
    setVaultFeedback('');
    return;
  }

  if (!vaultStatus.unlocked) {
    vaultStatusText.textContent = `Coffre configure. ${vaultStatus.entryCount} identifiant(s) disponibles apres deverrouillage.`;
    return;
  }

  vaultStatusText.textContent = `Coffre deverrouille. ${vaultStatus.entryCount} identifiant(s) proteges et disponibles.`;
  await loadPasswords();
}

function showPasswordSavePopup(url, username, password) {
  pendingPasswordSave = { url, username, password };
  document.getElementById('popup-site').textContent = new URL(url).hostname;
  document.getElementById('popup-username').textContent = username;
  passwordSavePopup.classList.add('active');
}

async function handlePasswordCapture(data) {
  if (!currentSettings.passwordManagerEnabled) {
    return;
  }

  await refreshVaultStatus();

  if (!vaultStatus.configured) {
    showToast('Configure le coffre-fort pour enregistrer tes mots de passe.', 'warning');
    return;
  }

  if (!vaultStatus.unlocked) {
    showToast('Deverrouille le coffre-fort pour enregistrer ce mot de passe.', 'warning');
    return;
  }

  const existing = await window.navyAPI.getPassword(data.url);

  if (existing && existing.username === data.username && existing.password === data.password) {
    return;
  }

  showPasswordSavePopup(data.url, data.username, data.password);
}

async function maybeAutofill(url) {
  if (!currentSettings.passwordManagerEnabled || !vaultStatus.unlocked) {
    return;
  }

  const credential = await window.navyAPI.getPassword(url);

  if (credential) {
    await fillCurrentPage(credential);
  }
}

function bindBrowserEvents() {
  browserView.addEventListener('did-navigate', (event) => {
    updateAddress(event.url);
    updateNavButtons();
  });

  browserView.addEventListener('did-navigate-in-page', (event) => {
    updateAddress(event.url);
    updateNavButtons();
  });

  browserView.addEventListener('page-title-updated', (event) => {
    pageTitleEl.textContent = event.title || 'NAVY';
  });

  browserView.addEventListener('did-stop-loading', async () => {
    updateNavButtons();

    const url = browserView.getURL();
    if (url) {
      updateAddress(url);
    }

    const title = browserView.getTitle();
    pageTitleEl.textContent = title || 'NAVY';
  });

  browserView.addEventListener('did-fail-load', (event) => {
    if (event.errorCode !== -3) {
      showToast(`Chargement impossible : ${event.errorDescription}`, 'error');
    }
  });

  browserView.addEventListener('ipc-message', async (event) => {
    const payload = event.args[0] || {};

    if (event.channel === 'password-form-detected') {
      await maybeAutofill(payload.url);
    }

    if (event.channel === 'password-captured') {
      await handlePasswordCapture(payload);
    }
  });
}

function bindStaticEvents() {
  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      navigateTo(urlInput.value);
    }
  });

  backBtn.addEventListener('click', () => {
    if (browserView.canGoBack()) {
      browserView.goBack();
    }
  });

  forwardBtn.addEventListener('click', () => {
    if (browserView.canGoForward()) {
      browserView.goForward();
    }
  });

  reloadBtn.addEventListener('click', () => browserView.reload());
  homeBtn.addEventListener('click', () => navigateTo(currentSettings.homePage));

  bookmarkAddBtn.addEventListener('click', async () => {
    await window.navyAPI.addBookmark({
      title: browserView.getTitle() || 'Nouvelle page',
      url: currentUrl || currentSettings.homePage
    });
    await loadBookmarks();
    showToast('Favori ajoute.', 'success');
  });

  shieldsBtn.addEventListener('click', () => {
    shieldsPanel.classList.toggle('active');
    passwordPanel.classList.remove('active');
  });

  passwordsBtn.addEventListener('click', async () => {
    passwordPanel.classList.toggle('active');
    shieldsPanel.classList.remove('active');
    await refreshVaultStatus();
  });

  settingsBtn.addEventListener('click', () => {
    window.location.href = 'settings.html';
  });

  engineSelect.addEventListener('change', async () => {
    const engine = getEngineMeta(engineSelect.value);
    await savePartialSettings({ searchEngineId: engine.id });
    showToast(`Moteur actif : ${engine.label}`, 'success');
  });

  document.querySelectorAll('.engine-chip').forEach((button) => {
    button.addEventListener('click', async () => {
      const engine = getEngineMeta(button.dataset.engine);
      await savePartialSettings({ searchEngineId: engine.id });
      renderSearchEngines();
      showToast(`Recherche rapide : ${engine.label}`, 'success');
    });
  });

  optimizationChip.addEventListener('click', async () => {
    await savePartialSettings({ optimizationMode: !currentSettings.optimizationMode });
    showToast(currentSettings.optimizationMode ? 'Mode optimisation active.' : 'Mode optimisation desactive.', 'success');
  });

  adblockToggle.addEventListener('click', async () => {
    await savePartialSettings({ adBlockEnabled: !currentSettings.adBlockEnabled });
    showToast(currentSettings.adBlockEnabled ? 'Blocage pub active.' : 'Blocage pub desactive.', 'success');
  });

  optimizationToggle.addEventListener('click', async () => {
    await savePartialSettings({ optimizationMode: !currentSettings.optimizationMode });
    showToast(currentSettings.optimizationMode ? 'Mode optimisation active.' : 'Mode optimisation desactive.', 'success');
  });

  document.querySelectorAll('[data-close-panel]').forEach((button) => {
    button.addEventListener('click', closePanels);
  });

  document.addEventListener('click', (event) => {
    if (!shieldsPanel.contains(event.target) && !shieldsBtn.contains(event.target)) {
      shieldsPanel.classList.remove('active');
    }

    if (!passwordPanel.contains(event.target) && !passwordsBtn.contains(event.target)) {
      passwordPanel.classList.remove('active');
    }
  });

  document.getElementById('vault-create-btn').addEventListener('click', async () => {
    const password = document.getElementById('vault-master-password').value;
    const confirmation = document.getElementById('vault-master-confirm').value;

    if (password !== confirmation) {
      setVaultFeedback('Les deux mots de passe ne correspondent pas.', 'error');
      return;
    }

    const result = await window.navyAPI.setupPasswordVault(password);

    if (!result.success) {
      setVaultFeedback(result.error || 'Creation impossible.', 'error');
      return;
    }

    document.getElementById('vault-master-password').value = '';
    document.getElementById('vault-master-confirm').value = '';
    setVaultFeedback('Coffre-fort cree et deverrouille.', 'success');
    await refreshVaultStatus();
  });

  document.getElementById('vault-unlock-btn').addEventListener('click', async () => {
    const password = document.getElementById('vault-unlock-password').value;
    const result = await window.navyAPI.unlockPasswordVault(password);

    if (!result.success) {
      setVaultFeedback(result.error || 'Deverrouillage impossible.', 'error');
      return;
    }

    document.getElementById('vault-unlock-password').value = '';
    setVaultFeedback('Coffre-fort deverrouille.', 'success');
    await refreshVaultStatus();
    await maybeAutofill(currentUrl);
  });

  vaultLockBtn.addEventListener('click', async () => {
    await window.navyAPI.lockPasswordVault();
    setVaultFeedback('Coffre-fort verrouille.', 'info');
    await refreshVaultStatus();
  });

  document.getElementById('vault-refresh-btn').addEventListener('click', async () => {
    await refreshVaultStatus();
    showToast('Coffre mis a jour.', 'success');
  });

  vaultFilter.addEventListener('input', renderPasswords);

  document.getElementById('save-password-btn').addEventListener('click', async () => {
    if (!pendingPasswordSave) {
      return;
    }

    const result = await window.navyAPI.savePassword(pendingPasswordSave);

    if (!result.success) {
      showToast(result.error || 'Sauvegarde impossible.', 'error');
      return;
    }

    passwordSavePopup.classList.remove('active');
    pendingPasswordSave = null;
    await refreshVaultStatus();
    showToast('Mot de passe enregistre.', 'success');
  });

  document.getElementById('cancel-password-btn').addEventListener('click', () => {
    pendingPasswordSave = null;
    passwordSavePopup.classList.remove('active');
  });

  window.navyAPI.onProtectionStats((stats) => {
    updateProtectionStats(stats);
  });
}

async function initialize() {
  searchEngines = await window.navyAPI.getSearchEngines();
  await refreshSettings();
  await loadBookmarks();
  updateProtectionStats(await window.navyAPI.getProtectionStats());
  await refreshVaultStatus();
  bindBrowserEvents();
  bindStaticEvents();
  navigateTo(currentSettings.homePage);
}

initialize();
