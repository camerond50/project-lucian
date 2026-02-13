const crypto = require('crypto');

const memoryStore = new Map();

function encrypt(value) {
  const key = crypto
    .createHash('sha256')
    .update(process.env.USER || 'lucian-user')
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(serialized) {
  const payload = Buffer.from(serialized, 'base64');
  const key = crypto
    .createHash('sha256')
    .update(process.env.USER || 'lucian-user')
    .digest();
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8'
  );
}

const secureKeyStore = {
  set(provider, keyValue) {
    if (!provider || !keyValue) {
      throw new Error('Provider and key value are required.');
    }
    memoryStore.set(provider, encrypt(keyValue));
    return true;
  },
  get(provider) {
    if (!memoryStore.has(provider)) {
      return null;
    }
    return decrypt(memoryStore.get(provider));
  },
  status() {
    return Array.from(memoryStore.keys());
  }
};

module.exports = {
  secureKeyStore
};
