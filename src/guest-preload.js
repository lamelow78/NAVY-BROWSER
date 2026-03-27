const { ipcRenderer } = require('electron');

let wiredForms = new WeakSet();

function getFieldValue(field) {
  return field ? String(field.value || '').trim() : '';
}

function findLoginFields(root = document) {
  const passwordField = root.querySelector('input[type="password"]');

  if (!passwordField) {
    return null;
  }

  const form = passwordField.closest('form') || root;
  const userField = form.querySelector(
    'input[type="email"], input[name*="user" i], input[name*="login" i], input[name*="mail" i], input[autocomplete="username"]'
  );

  return {
    form,
    passwordField,
    userField
  };
}

function notifyFormPresence() {
  const fields = findLoginFields();

  if (fields) {
    ipcRenderer.sendToHost('password-form-detected', {
      url: window.location.href
    });
  }

  return fields;
}

function wireFormDetection() {
  const fields = notifyFormPresence();

  if (!fields || wiredForms.has(fields.form)) {
    return;
  }

  wiredForms.add(fields.form);

  fields.form.addEventListener(
    'submit',
    () => {
      const username = getFieldValue(fields.userField);
      const password = getFieldValue(fields.passwordField);

      if (!username || !password) {
        return;
      }

      ipcRenderer.sendToHost('password-captured', {
        url: window.location.href,
        username,
        password
      });
    },
    true
  );
}

window.addEventListener('DOMContentLoaded', () => {
  wireFormDetection();

  const observer = new MutationObserver(() => {
    wireFormDetection();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
});
