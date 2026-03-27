const crypto = require('crypto');
const Store = require('electron-store');

const VAULT_PROOF = 'NAVY_VAULT_UNLOCK_CHECK';

class PasswordManager {
  constructor() {
    this.store = new Store({
      name: 'navy-vault',
      defaults: {
        vault: {
          configured: false,
          salt: null,
          verification: null,
          items: []
        }
      }
    });

    this.sessionKey = null;
  }

  get vault() {
    return this.store.get('vault');
  }

  set vault(value) {
    this.store.set('vault', value);
  }

  getStatus() {
    return {
      configured: Boolean(this.vault.configured),
      unlocked: Boolean(this.sessionKey),
      entryCount: Array.isArray(this.vault.items) ? this.vault.items.length : 0
    };
  }

  deriveKey(masterPassword, salt) {
    return crypto.scryptSync(masterPassword, salt, 32);
  }

  encryptText(plainText, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decryptText(encryptedText, key) {
    const [ivHex, tagHex, dataHex] = encryptedText.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  }

  validateMasterPassword(masterPassword) {
    if (typeof masterPassword !== 'string' || masterPassword.length < 8) {
      return {
        success: false,
        error: 'Le mot de passe maitre doit contenir au moins 8 caracteres.'
      };
    }

    return { success: true };
  }

  setupMasterPassword(masterPassword) {
    const validation = this.validateMasterPassword(masterPassword);

    if (!validation.success) {
      return validation;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const key = this.deriveKey(masterPassword, salt);
    const verification = this.encryptText(VAULT_PROOF, key);

    this.vault = {
      configured: true,
      salt,
      verification,
      items: []
    };

    this.sessionKey = key;
    return {
      success: true,
      status: this.getStatus()
    };
  }

  unlock(masterPassword) {
    const vault = this.vault;

    if (!vault.configured || !vault.salt || !vault.verification) {
      return {
        success: false,
        error: 'Aucun coffre-fort de mots de passe n\'est configure.'
      };
    }

    try {
      const key = this.deriveKey(masterPassword, vault.salt);
      const proof = this.decryptText(vault.verification, key);

      if (proof !== VAULT_PROOF) {
        throw new Error('Le mot de passe maitre est incorrect.');
      }

      this.sessionKey = key;
      return {
        success: true,
        status: this.getStatus()
      };
    } catch (error) {
      this.sessionKey = null;
      return {
        success: false,
        error: 'Mot de passe maitre incorrect.'
      };
    }
  }

  lock() {
    this.sessionKey = null;
    return {
      success: true,
      status: this.getStatus()
    };
  }

  ensureUnlocked() {
    if (!this.sessionKey) {
      throw new Error('Le coffre-fort est verrouille.');
    }
  }

  parseUrl(url) {
    const parsed = new URL(url);
    return {
      origin: parsed.origin,
      domain: parsed.hostname
    };
  }

  baseDomain(domain = '') {
    const parts = String(domain || '')
      .toLowerCase()
      .split('.')
      .filter(Boolean);

    if (parts.length <= 2) {
      return parts.join('.');
    }

    return parts.slice(-2).join('.');
  }

  savePassword(data) {
    try {
      this.ensureUnlocked();

      const { url, username, password } = data || {};

      if (!url || !username || !password) {
        return {
          success: false,
          error: 'URL, identifiant et mot de passe sont requis.'
        };
      }

      const { origin, domain } = this.parseUrl(url);
      const vault = this.vault;
      const items = Array.isArray(vault.items) ? [...vault.items] : [];
      const now = new Date().toISOString();
      const existingIndex = items.findIndex((item) => item.domain === domain && item.origin === origin && item.usernameHash === username);

      const record = {
        id: existingIndex >= 0 ? items[existingIndex].id : crypto.randomUUID(),
        domain,
        origin,
        createdAt: existingIndex >= 0 ? items[existingIndex].createdAt : now,
        updatedAt: now,
        usernameHash: username,
        usernameEncrypted: this.encryptText(username, this.sessionKey),
        passwordEncrypted: this.encryptText(password, this.sessionKey)
      };

      if (existingIndex >= 0) {
        items[existingIndex] = record;
      } else {
        items.unshift(record);
      }

      this.vault = {
        ...vault,
        items
      };

      return {
        success: true,
        status: this.getStatus()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  getPassword(url) {
    try {
      this.ensureUnlocked();
      const { origin, domain } = this.parseUrl(url);
      const items = Array.isArray(this.vault.items) ? this.vault.items : [];
      const domainRoot = this.baseDomain(domain);
      const match = items.find((item) => item.origin === origin)
        || items.find((item) => item.domain === domain)
        || items.find((item) => this.baseDomain(item.domain) === domainRoot);

      if (!match) {
        return null;
      }

      return {
        id: match.id,
        domain: match.domain,
        origin: match.origin,
        username: this.decryptText(match.usernameEncrypted, this.sessionKey),
        password: this.decryptText(match.passwordEncrypted, this.sessionKey)
      };
    } catch (error) {
      return null;
    }
  }

  getAllPasswords() {
    try {
      this.ensureUnlocked();
      const items = Array.isArray(this.vault.items) ? this.vault.items : [];

      return items
        .slice()
        .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
        .map((item) => ({
          id: item.id,
          domain: item.domain,
          origin: item.origin,
          username: this.decryptText(item.usernameEncrypted, this.sessionKey),
          password: this.decryptText(item.passwordEncrypted, this.sessionKey),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }));
    } catch (error) {
      return [];
    }
  }

  deletePassword(id) {
    try {
      this.ensureUnlocked();
      const vault = this.vault;
      const items = Array.isArray(vault.items) ? vault.items.filter((item) => item.id !== id) : [];

      this.vault = {
        ...vault,
        items
      };

      return {
        success: true,
        status: this.getStatus()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = PasswordManager;
