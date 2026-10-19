require("dotenv").config();

const { gcm } = require("@noble/ciphers/aes.js");
const { managedNonce, utf8ToBytes, bytesToUtf8 } =
  require("@noble/ciphers/utils.js");

// const PORTABLE_ENCRYPTION_KEY="7457a73c31853f81d2c04cf6788caf932fbe75a1b5d60cbd9ed7c3d05479f308"
// this is in my .env 
const keyHex = process.env.PORTABLE_ENCRYPTION_KEY;
// const keyHex = PORTABLE_ENCRYPTION_KEY;
console.log(keyHex)
if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
  throw new Error("Invalid PORTABLE_ENCRYPTION_KEY");
}

const key = Buffer.from(keyHex, "hex");
const aes = managedNonce(gcm);

const original = { test: "Zez", value: 123 };
const plaintext = utf8ToBytes(JSON.stringify(original));

const encrypted = aes(key).encrypt(plaintext);
const decrypted = aes(key).decrypt(encrypted);
const restored = JSON.parse(bytesToUtf8(decrypted));

console.log("Local encryption/decryption:", 
  JSON.stringify(restored) === JSON.stringify(original) ? "PASS" : "FAIL"
);