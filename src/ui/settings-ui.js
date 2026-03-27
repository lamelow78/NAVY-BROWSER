const themeSelect = document.getElementById('theme-select');
const searchEngineSelect = document.getElementById('search-engine-select');
const homePageInput = document.getElementById('home-page-input');
const bookmarkBarToggle = document.getElementById('bookmark-bar-toggle');
const compactButtonsToggle = document.getElementById('compact-buttons-toggle');
const reduceMotionToggle = document.getElementById('reduce-motion-toggle');
const launchHomeToggle = document.getElementById('launch-home-toggle');
const adblockToggle = document.getElementById('adblock-toggle');
const optimizationToggle = document.getElementById('optimization-toggle');
const passwordManagerToggle = document.getElementById('password-manager-toggle');
const autoSavePasswordsToggle = document.getElementById('auto-save-passwords-toggle');
const autoFillPasswordsToggle = document.getElementById('auto-fill-passwords-toggle');
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
  setToggleState(compactButtonsToggle, currentSettings.compactButtons);
  setToggleState(reduceMotionToggle, currentSettings.reduceMotion);
  setToggleState(launchHomeToggle, currentSettings.launchToHomePage);
  setToggleState(adblockToggle, currentSettings.adBlockEnabled);
  setToggleState(optimizationToggle, currentSettings.optimizationMode);
  setToggleState(passwordManagerToggle, currentSettings.passwordManagerEnabled);
  setToggleState(autoSavePasswordsToggle, currentSettings.autoSavePasswords);
  setToggleState(autoFillPasswordsToggle, currentSettings.autoFillPasswords);
}

themeSelect.addEventListener('change', () => {
  currentSettings.theme = themeSelect.value;
  document.body.setAttribute('data-theme', currentSettings.theme);
});

searchEngineSelect.addEventListener('change', () => {
  currentSettings.searchEngineId = searchEngineSelect.value;
});

bindBooleanToggle(bookmarkBarToggle, 'showBookmarkBar');
bindBooleanToggle(compactButtonsToggle, 'compactButtons');
bindBooleanToggle(reduceMotionToggle, 'reduceMotion');
bindBooleanToggle(launchHomeToggle, 'launchToHomePage');
bindBooleanToggle(adblockToggle, 'adBlockEnabled');
bindBooleanToggle(optimizationToggle, 'optimizationMode');
bindBooleanToggle(passwordManagerToggle, 'passwordManagerEnabled');
bindBooleanToggle(autoSavePasswordsToggle, 'autoSavePasswords');
bindBooleanToggle(autoFillPasswordsToggle, 'autoFillPasswords');

document.getElementById('back-btn').addEventListener('click', () => {
  window.location.href = 'index.html';
});

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  const homePage = homePageInput.value.trim();
  const nextSettings = {
    ...currentSettings,
    homePage: homePage || searchEngines[currentSettings.searchEngineId].homeUrl
  };

  const saved = await window.navyAPI.saveSettings(nextSettings);
  currentSettings = saved;
  document.body.setAttribute('data-theme', saved.theme);
  updateStatus('Parametres enregistres avec succes.', 'success');
});

loadSettingsPage().catch(() => {
  updateStatus('Impossible de charger les parametres.', 'error');
});
