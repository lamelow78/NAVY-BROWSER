const Store = require('electron-store');
const crypto = require('crypto');

class PasswordManager {
  constructor() {
    this.store = new Store({
      name: 'navy-passwords',
      encryptionKey: 'navy-secure-key-2025' // En production, utilise une clé générée
    });
  }

  // Chiffrer le mot de passe
  encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync('navy-master-password', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  // Déchiffrer le mot de passe
  decrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync('navy-master-password', 'salt', 32);
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Sauvegarder un mot de passe
  savePassword(url, username, password) {
    try {
      const domain = new URL(url).hostname;
      const encryptedPassword = this.encrypt(password);
      
      const passwords = this.store.get('passwords', {});
      passwords[domain] = {
        username,
        password: encryptedPassword,
        url,
        savedAt: new Date().toISOString()
      };
      
      this.store.set('passwords', passwords);
      return { success: true };
    } catch (error) {
      console.error('Erreur sauvegarde mot de passe:', error);
      return { success: false, error: error.message };
    }
  }

  // Récupérer un mot de passe
  getPassword(url) {
    try {
      const domain = new URL(url).hostname;
      const passwords = this.store.get('passwords', {});
      
      if (passwords[domain]) {
        return {
          username: passwords[domain].username,
          password: this.decrypt(passwords[domain].password)
        };
      }
      
      return null;
    } catch (error) {
      console.error('Erreur récupération mot de passe:', error);
      return null;
    }
  }

  // Récupérer tous les mots de passe
  getAllPasswords() {
    try {
      const passwords = this.store.get('passwords', {});
      const result = [];
      
      for (const [domain, data] of Object.entries(passwords)) {
        result.push({
          domain,
          username: data.username,
          url: data.url,
          savedAt: data.savedAt
        });
      }
      
      return result;
    } catch (error) {
      console.error('Erreur récupération mots de passe:', error);
      return [];
    }
  }

  // Supprimer un mot de passe
  deletePassword(url) {
    try {
      const domain = new URL(url).hostname;
      const passwords = this.store.get('passwords', {});
      delete passwords[domain];
      this.store.set('passwords', passwords);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = PasswordManager;