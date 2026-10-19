
import { gcm } from "@noble/ciphers/aes.js";
import {
  bytesToHex,
  hexToBytes,
  utf8ToBytes,
  bytesToUtf8,
  managedNonce,
  randomBytes,
} from "@noble/ciphers/utils.js";

const NONCE_MANAGED_GCM = managedNonce(gcm);

/**
 * Generates a random AES-256 key.
 * Save this key securely. Do not generate a new key for each record.
 */
export function generateEncryptionKey(): string {
  return bytesToHex(randomBytes(32));
}

/**
 * Encrypts any JSON-serializable value.
 * Returns a portable hex string containing the nonce and ciphertext/tag.
 */
export function encryptData<T>(
  data: T,
  keyHex: string
): string {
  validateKey(keyHex);

  const key = hexToBytes(keyHex);
  const plaintext = utf8ToBytes(JSON.stringify(data));

  const encrypted = NONCE_MANAGED_GCM(key).encrypt(plaintext);

  return bytesToHex(encrypted);
}

/**
 * Decrypts data produced by encryptData().
 * Throws if the key is wrong or the encrypted data was modified.
 */
export function decryptData<T = unknown>(
  encryptedHex: string,
  keyHex: string
): T {
  validateKey(keyHex);

  if (!/^(?:[0-9a-fA-F]{2})+$/.test(encryptedHex)) {
    throw new Error("Invalid encrypted-data format.");
  }

  const key = hexToBytes(keyHex);
  const encrypted = hexToBytes(encryptedHex);

  const plaintext = NONCE_MANAGED_GCM(key).decrypt(encrypted);
  const json = bytesToUtf8(plaintext);

  return JSON.parse(json) as T;
}

function validateKey(keyHex: string): void {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      "Invalid key. AES-256 requires exactly 64 hexadecimal characters."
    );
  }
}
