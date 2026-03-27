const { ipcRenderer } = require('electron');

const wiredContainers = new WeakSet();
const wiredFields = new WeakSet();

const identitySelector = [
  'input[autocomplete="username"]',
  'input[autocomplete="email"]',
  'input[type="email"]',
  'input[name*="user" i]',
  'input[name*="login" i]',
  'input[name*="mail" i]',
  'input[name*="ident" i]',
  'input[id*="user" i]',
  'input[id*="login" i]',
  'input[id*="mail" i]',
  'input[type="text"]'
].join(', ');

const passwordSelector = 'input[type="password"], input[autocomplete="current-password"], input[autocomplete="new-password"]';

let rememberedIdentity = '';
let lastCaptureSignature = '';
let lastCaptureAt = 0;

function fieldValue(field) {
  return field ? String(field.value || '').trim() : '';
}

function visible(field) {
  if (!field) {
    return false;
  }

  const style = window.getComputedStyle(field);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function identityFields(scope = document) {
  return [...scope.querySelectorAll(identitySelector)]
    .filter((field) => field.type !== 'password');
}

function passwordFields(scope = document) {
  return [...scope.querySelectorAll(passwordSelector)];
}

function pickIdentity(scope = document) {
  const scoped = identityFields(scope).find((field) => fieldValue(field));
  if (scoped) {
    rememberedIdentity = fieldValue(scoped);
    return rememberedIdentity;
  }

  const global = identityFields(document).find((field) => fieldValue(field));
  if (global) {
    rememberedIdentity = fieldValue(global);
    return rememberedIdentity;
  }

  return rememberedIdentity;
}

function pickPassword(scope = document) {
  const preferred = passwordFields(scope).find((field) => visible(field) && fieldValue(field));
  if (preferred) {
    return fieldValue(preferred);
  }

  const fallback = passwordFields(scope).find((field) => fieldValue(field));
  return fieldValue(fallback);
}

function notifyForm() {
  if (document.querySelector(passwordSelector)) {
    ipcRenderer.sendToHost('password-form-detected', { url: window.location.href });
  }
}

function sendCapture(scope = document, reason = 'unknown') {
  const username = pickIdentity(scope);
  const password = pickPassword(scope);

  if (!username || !password) {
    return;
  }

  const signature = `${window.location.href}|${username}|${password}|${reason}`;
  const now = Date.now();
  if (signature === lastCaptureSignature && now - lastCaptureAt < 2200) {
    return;
  }

  lastCaptureSignature = signature;
  lastCaptureAt = now;

  ipcRenderer.sendToHost('password-captured', {
    url: window.location.href,
    username,
    password,
    reason
  });
}

function watchField(field) {
  if (!field || wiredFields.has(field)) {
    return;
  }

  wiredFields.add(field);

  field.addEventListener('input', () => {
    const value = fieldValue(field);
    if (value) {
      rememberedIdentity = value;
    }
  }, true);

  field.addEventListener('change', () => {
    const value = fieldValue(field);
    if (value) {
      rememberedIdentity = value;
    }
  }, true);

  field.addEventListener('blur', () => {
    const value = fieldValue(field);
    if (value) {
      rememberedIdentity = value;
    }
  }, true);
}

function wireContainer(container) {
  if (!container || wiredContainers.has(container)) {
    return;
  }

  if (!passwordFields(container).length) {
    return;
  }

  wiredContainers.add(container);
  notifyForm();

  container.addEventListener('submit', () => sendCapture(container, 'submit'), true);
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      sendCapture(container, 'enter');
    }
  }, true);
  container.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.matches('button, input[type="submit"], [role="button"]')) {
      setTimeout(() => sendCapture(container, 'click'), 80);
    }
  }, true);

  passwordFields(container).forEach((field) => {
    watchField(field);
    field.addEventListener('change', () => sendCapture(container, 'password-change'), true);
    field.addEventListener('blur', () => sendCapture(container, 'password-blur'), true);
  });

  identityFields(container).forEach(watchField);
}

function scan() {
  const forms = [...document.querySelectorAll('form')];
  if (!forms.length && document.querySelector(passwordSelector)) {
    forms.push(document.body);
  }

  forms.forEach(wireContainer);
  identityFields(document).forEach(watchField);
  passwordFields(document).forEach(watchField);
  notifyForm();
}

window.addEventListener('DOMContentLoaded', () => {
  scan();

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.matches('button, input[type="submit"], [role="button"]')) {
      setTimeout(() => sendCapture(document.body, 'document-click'), 120);
    }
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      sendCapture(document.body, 'visibility-change');
    }
  }, true);

  window.addEventListener('beforeunload', () => sendCapture(document.body, 'beforeunload'));

  new MutationObserver(scan).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  setInterval(scan, 1200);
});
