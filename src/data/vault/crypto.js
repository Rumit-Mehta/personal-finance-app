import { base64UrlToBytes, bytesToBase64Url } from "./encoding.js";

const KEY_ALGORITHM = "PBKDF2";
const HASH_ALGORITHM = "SHA-256";
const ENCRYPTION_ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const DEFAULT_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export async function encryptBytes(plainBytes, password) {
  requirePassword(password);

  const crypto = getCrypto();
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(password, salt, DEFAULT_ITERATIONS);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    plainBytes,
  );

  return {
    bytes: new Uint8Array(encryptedBuffer),
    metadata: {
      algorithm: ENCRYPTION_ALGORITHM,
      keyAlgorithm: KEY_ALGORITHM,
      hash: HASH_ALGORITHM,
      keyLength: KEY_LENGTH,
      iterations: DEFAULT_ITERATIONS,
      salt: bytesToBase64Url(salt),
      iv: bytesToBase64Url(iv),
    },
  };
}

export async function decryptBytes(encryptedBytes, password, metadata) {
  requirePassword(password);
  validateCryptoMetadata(metadata);

  const crypto = getCrypto();
  const salt = base64UrlToBytes(metadata.salt);
  const iv = base64UrlToBytes(metadata.iv);
  const key = await deriveKey(password, salt, metadata.iterations);

  try {
    const plainBuffer = await crypto.subtle.decrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      encryptedBytes,
    );

    return new Uint8Array(plainBuffer);
  } catch {
    throw new Error("Unable to open PFA vault. Check the password and file.");
  }
}

async function deriveKey(password, salt, iterations) {
  const crypto = getCrypto();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    KEY_ALGORITHM,
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: KEY_ALGORITHM,
      hash: HASH_ALGORITHM,
      salt,
      iterations,
    },
    passwordKey,
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return bytes;
}

function requirePassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("A vault password is required.");
  }
}

function validateCryptoMetadata(metadata) {
  if (
    metadata?.algorithm !== ENCRYPTION_ALGORITHM ||
    metadata?.keyAlgorithm !== KEY_ALGORITHM ||
    metadata?.hash !== HASH_ALGORITHM ||
    metadata?.keyLength !== KEY_LENGTH ||
    !Number.isInteger(metadata?.iterations) ||
    !metadata?.salt ||
    !metadata?.iv
  ) {
    throw new Error("Unsupported PFA vault crypto metadata.");
  }
}

function getCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error("Web Crypto is required to encrypt and decrypt PFA vaults.");
  }

  return globalThis.crypto;
}
