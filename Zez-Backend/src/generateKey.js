const crypto = require("node:crypto");

function generateEncryptionKey() {
  // Generate 32 cryptographically secure random bytes.
  // Convert them to 64 hexadecimal characters.
  return crypto.randomBytes(32).toString("hex");
}

if (require.main === module) {
  const key = generateEncryptionKey();

  console.log("Generated AES-256 key:");
  console.log(key);
  console.log("Length:", key.length);
  console.log("Valid hex:", /^[0-9a-fA-F]{64}$/.test(key));
}

module.exports = { generateEncryptionKey };
