const { ipcRenderer } = require('electron');

const wiredForms = new WeakSet();

function fieldValue(field) {
  return field ? String(field.value || '').trim() : '';
}

function loginForms() {
  const forms = [...document.querySelectorAll('form')];
  if (!forms.length && document.querySelector('input[type="password"]')) {
    forms.push(document.body);
  }
  return forms;
}

function pickFields(container) {
  const password = container.querySelector('input[type="password"]');
  if (!password) {
    return null;
  }

  const username = container.querySelector(
    'input[autocomplete="username"], input[type="email"], input[name*="user" i], input[name*="login" i], input[name*="mail" i], input[type="text"]'
  );

  return { username, password };
}

function notifyForm() {
  if (document.querySelector('input[type="password"]')) {
    ipcRenderer.sendToHost('password-form-detected', { url: window.location.href });
  }
}

function sendCapture(container) {
  const fields = pickFields(container);
  if (!fields) {
    return;
  }

  const username = fieldValue(fields.username);
  const password = fieldValue(fields.password);

  if (!username || !password) {
    return;
  }

  ipcRenderer.sendToHost('password-captured', {
    url: window.location.href,
    username,
    password
  });
}

function wireForm(container) {
  if (wiredForms.has(container)) {
    return;
  }

  const fields = pickFields(container);
  if (!fields) {
    return;
  }

  wiredForms.add(container);
  notifyForm();

  container.addEventListener('submit', () => sendCapture(container), true);
  container.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.matches('button[type="submit"], input[type="submit"]')) {
      sendCapture(container);
    }
  }, true);

  fields.password.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      sendCapture(container);
    }
  });
}

function scan() {
  loginForms().forEach(wireForm);
  notifyForm();
}

window.addEventListener('DOMContentLoaded', () => {
  scan();

  new MutationObserver(scan).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  setInterval(scan, 1500);
});
