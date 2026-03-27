const themeSelect = document.getElementById('theme-select');
const searchEngineSelect = document.getElementById('search-engine-select');
const homePageInput = document.getElementById('home-page-input');
const bookmarkBarToggle = document.getElementById('bookmark-bar-toggle');
const adblockToggle = document.getElementById('adblock-toggle');
const optimizationToggle = document.getElementById('optimization-toggle');
const passwordManagerToggle = document.getElementById('password-manager-toggle');
const settingsStatus = document.getElementById('settings-status');

let currentSettings = {};
let searchEngines = {};

function setToggleState(button, enabled) {
  button.classList.toggle('active', Boolean(enabled));
}

function updateStatus(message, kind = 'info') {
  settingsStatus.textContent = message;
  settingsStatus.dataset.kind = kind;
}

function bindBooleanToggle(button, key) {
  button.addEventListener('click', () => {
    currentSettings[key] = !currentSettings[key];
    setToggleState(button, currentSettings[key]);
  });
}

async function loadSettingsPage() {
  searchEngines = await window.navyAPI.getSearchEngines();
  currentSettings = await window.navyAPI.getSettings();

  document.body.setAttribute('data-theme', currentSettings.theme);

  themeSelect.innerHTML = `
    <option value="dark">Sombre NAVY</option>
    <option value="light">Clair</option>
    <option value="blue">Bleu ocean</option>
    <option value="green">Vert foret</option>
  `;

  searchEngineSelect.innerHTML = Object.values(searchEngines)
    .map((engine) => `<option value="${engine.id}">${engine.label}</option>`)
    .join('');

  themeSelect.value = currentSettings.theme;
  searchEngineSelect.value = currentSettings.searchEngineId;
  homePageInput.value = currentSettings.homePage;
  setToggleState(bookmarkBarToggle, currentSettings.showBookmarkBar);
  setToggleState(adblockToggle, currentSettings.adBlockEnabled);
  setToggleState(optimizationToggle, currentSettings.optimizationMode);
  setToggleState(passwordManagerToggle, currentSettings.passwordManagerEnabled);
}

themeSelect.addEventListener('change', () => {
  currentSettings.theme = themeSelect.value;
  document.body.setAttribute('data-theme', currentSettings.theme);
});

searchEngineSelect.addEventListener('change', () => {
  currentSettings.searchEngineId = searchEngineSelect.value;
});

bindBooleanToggle(bookmarkBarToggle, 'showBookmarkBar');
bindBooleanToggle(adblockToggle, 'adBlockEnabled');
bindBooleanToggle(optimizationToggle, 'optimizationMode');
bindBooleanToggle(passwordManagerToggle, 'passwordManagerEnabled');

document.getElementById('back-btn').addEventListener('click', () => {
  window.location.href = 'index.html';
});

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  const homePage = homePageInput.value.trim();

  const saved = await window.navyAPI.saveSettings({
    ...currentSettings,
    homePage: homePage || searchEngines[currentSettings.searchEngineId].homeUrl
  });

  currentSettings = saved;
  document.body.setAttribute('data-theme', saved.theme);
  updateStatus('Parametres enregistres avec succes.', 'success');
});

loadSettingsPage().catch(() => {
  updateStatus('Impossible de charger les parametres.', 'error');
});
