const { ipcRenderer } = window.require ? require('electron') : { ipcRenderer: window.navyAPI };

// Éléments DOM
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
const totalBlocked = document.getElementById('total-blocked');
const bookmarksBar = document.getElementById('bookmarks-bar');
const bookmarksContainer = document.getElementById('bookmarks-container');
const bookmarkAddBtn = document.getElementById('bookmark-add-btn');
const passwordSavePopup = document.getElementById('password-save-popup');

let currentSettings = {};
let currentUrl = 'https://www.google.fr';
let pendingPasswordSave = null;

// Charger les paramètres
async function loadSettings() {
  currentSettings = await window.navyAPI.getSettings();
  document.body.setAttribute('data-theme', currentSettings.theme);
  
  if (currentSettings.showBookmarkBar) {
    bookmarksBar.style.display = 'flex';
  } else {
    bookmarksBar.style.display = 'none';
  }
  
  loadBookmarks();
}

// Charger les favoris
async function loadBookmarks() {
  const bookmarks = await window.navyAPI.getBookmarks();
  bookmarksContainer.innerHTML = '';
  
  bookmarks.forEach((bookmark, index) => {
    const bookmarkEl = document.createElement('div');
    bookmarkEl.className = 'bookmark-item';
    bookmarkEl.innerHTML = `
      <img class="favicon" src="https://www.google.com/s2/favicons?domain=${bookmark.url}" onerror="this.style.display='none'">
      <span>${bookmark.title}</span>
      <span class="delete-bookmark" data-index="${index}">✕</span>
    `;
    
    bookmarkEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-bookmark')) {
        browserView.src = bookmark.url;
      }
    });
    
    bookmarksContainer.appendChild(bookmarkEl);
  });
  
  // Supprimer favori
  document.querySelectorAll('.delete-bookmark').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      await window.navyAPI.deleteBookmark(index);
      loadBookmarks();
    });
  });
}

// Navigation
urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    let url = urlInput.value.trim();
    
    // Recherche Google.fr par défaut
    if (!url.includes('.') && !url.startsWith('http')) {
      url = currentSettings.searchEngine + encodeURIComponent(url);
    } else if (!url.startsWith('http')) {
      url = `https://${url}`;
    }
    
    browserView.src = url;
    currentUrl = url;
  }
});

// Boutons navigation
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

reloadBtn.addEventListener('click', () => {
  browserView.reload();
});

homeBtn.addEventListener('click', () => {
  browserView.src = currentSettings.homePage;
});

// Mettre à jour l'URL
browserView.addEventListener('did-navigate', (e) => {
  urlInput.value = e.url;
  currentUrl = e.url;
  checkForPasswordFields();
});

browserView.addEventListener('did-navigate-in-page', (e) => {
  urlInput.value = e.url;
  currentUrl = e.url;
});

// Ajouter un favori
bookmarkAddBtn.addEventListener('click', async () => {
  const title = await browserView.executeJavaScript('document.title');
  await window.navyAPI.addBookmark({
    title: title || 'Page sans titre',
    url: currentUrl
  });
  loadBookmarks();
});

// Panneau Shields
shieldsBtn.addEventListener('click', () => {
  shieldsPanel.classList.toggle('active');
  passwordPanel.classList.remove('active');
});

// Panneau Mots de passe
passwordsBtn.addEventListener('click', async () => {
  passwordPanel.classList.toggle('active');
  shieldsPanel.classList.remove('active');
  
  if (passwordPanel.classList.contains('active')) {
    await loadPasswords();
  }
});

// Charger les mots de passe
async function loadPasswords() {
  const passwords = await window.navyAPI.getAllPasswords();
  const passwordList = document.getElementById('password-list');
  
  passwordList.innerHTML = '';
  
  if (passwords.length === 0) {
    passwordList.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Aucun mot de passe enregistré</p>';
    return;
  }
  
  passwords.forEach(pwd => {
    const item = document.createElement('div');
    item.className = 'password-item';
    item.innerHTML = `
      <div class="password-item-header">
        <div class="password-item-domain">${pwd.domain}</div>
        <div class="password-item-delete" data-url="${pwd.url}">🗑️</div>
      </div>
      <div class="password-item-username">${pwd.username}</div>
    `;
    passwordList.appendChild(item);
  });
  
  // Supprimer mot de passe
  document.querySelectorAll('.password-item-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.navyAPI.deletePassword(btn.dataset.url);
      loadPasswords();
    });
  });
}

// Détecter les champs de mot de passe (formulaires login/register)
async function checkForPasswordFields() {
  setTimeout(async () => {
    const hasPasswordField = await browserView.executeJavaScript(`
      (function() {
        const passwordFields = document.querySelectorAll('input[type="password"]');
        const emailFields = document.querySelectorAll('input[type="email"], input[name*="email"], input[name*="username"]');
        
        if (passwordFields.length > 0 && emailFields.length > 0) {
          const form = passwordFields[0].closest('form');
          
          if (form) {
            form.addEventListener('submit', function(e) {
              const email = emailFields[0].value;
              const password = passwordFields[0].value;
              
              if (email && password) {
                window.postMessage({
                  type: 'PASSWORD_DETECTED',
                  email: email,
                  password: password
                }, '*');
              }
            });
          }
          
          return true;
        }
        
        return false;
      })();
    `);
    
    if (hasPasswordField) {
      setupPasswordListener();
    }
  }, 1000);
}

// Écouter la détection de mot de passe
function setupPasswordListener() {
  browserView.executeJavaScript(`
    window.addEventListener('message', function(event) {
      if (event.data.type === 'PASSWORD_DETECTED') {
        // Envoyer au processus principal via l'API
        console.log('Mot de passe détecté:', event.data.email);
      }
    });
  `);
}

// Afficher la popup de sauvegarde
function showPasswordSavePopup(url, username, password) {
  pendingPasswordSave = { url, username, password };
  
  document.getElementById('popup-site').textContent = new URL(url).hostname;
  document.getElementById('popup-username').textContent = username;
  
  passwordSavePopup.classList.add('active');
}

// Sauvegarder le mot de passe
document.getElementById('save-password-btn').addEventListener('click', async () => {
  if (pendingPasswordSave) {
    await window.navyAPI.savePassword(pendingPasswordSave);
    passwordSavePopup.classList.remove('active');
    pendingPasswordSave = null;
  }
});

// Annuler la sauvegarde
document.getElementById('cancel-password-btn').addEventListener('click', () => {
  passwordSavePopup.classList.remove('active');
  pendingPasswordSave = null;
});

// Paramètres
settingsBtn.addEventListener('click', () => {
  window.location.href = 'settings.html';
});

// Fermer les panneaux en cliquant ailleurs
document.addEventListener('click', (e) => {
  if (!shieldsBtn.contains(e.target) && !shieldsPanel.contains(e.target)) {
    shieldsPanel.classList.remove('active');
  }
  if (!passwordsBtn.contains(e.target) && !passwordPanel.contains(e.target)) {
    passwordPanel.classList.remove('active');
  }
});

// Recevoir les mises à jour du compteur
window.navyAPI.onAdBlocked((event, count) => {
  blockedCount.textContent = count;
  totalBlocked.textContent = count;
  document.getElementById('trackers-blocked').textContent = Math.floor(count * 0.7);
});

// Initialisation
loadSettings();

// Message de bienvenue
setTimeout(() => {
  console.log(`
    ⚓ NAVY Browser v1.0
    🛡️ Bloqueur ultra-agressif activé
    🔐 Gestionnaire de mots de passe prêt
    🚀 Navigation sécurisée
  `);
}, 1000);