import { bytesToHex, inputToArrayBuffer } from "./encoding.js";

export async function hashInput(input) {
  const crypto = getCrypto();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await inputToArrayBuffer(input),
  );

  return bytesToHex(new Uint8Array(digest));
}

function getCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is required to hash vault inputs.");
  }

  return globalThis.crypto;
}
