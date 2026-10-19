
const PORTABLE_KEY = process.env.EXPO_PUBLIC_PORTABLE_ENCRYPTION_KEY;

function validateKey(key: string | undefined): string {
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "EXPO_PUBLIC_PORTABLE_ENCRYPTION_KEY must be a 64-character hex key."
    );
  }

  return key;
}

export async function getOrCreateEncryptionKey(): Promise<string> {
  return validateKey(PORTABLE_KEY);
}

export async function exportEncryptionKeyForBackup(): Promise<string> {
  return validateKey(PORTABLE_KEY);
}
