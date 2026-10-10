const crypto = require('node:crypto');

function getKey() {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error('ENCRYPTION_KEY is not configured.');
  }

  const decoded = Buffer.from(key, 'base64');

  if (
    decoded.length !== 32 ||
    decoded.toString('base64') !== key
  ) {
    throw new Error(
      'ENCRYPTION_KEY must be a valid base64-encoded 32-byte key.'
    );
  }

  return decoded;
}

function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    getKey(),
    iv
  );

  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    version: 1,
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    data: ciphertext.toString('base64')
  });
}

function decryptJson(encrypted) {
  const envelope = JSON.parse(encrypted);

  if (
    envelope.version !== 1 ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.tag !== 'string' ||
    typeof envelope.data !== 'string'
  ) {
    throw new Error('Invalid encrypted record format.');
  }

  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.data, 'base64');

  if (
    iv.length !== 12 ||
    tag.length !== 16 ||
    ciphertext.length === 0
  ) {
    throw new Error('Invalid encrypted record.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getKey(),
    iv
  );

  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = { encryptJson, decryptJson };