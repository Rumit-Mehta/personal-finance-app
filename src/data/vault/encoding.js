import { strFromU8, strToU8 } from "fflate";

export function jsonToBytes(value) {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

export function bytesToJson(bytes) {
  return JSON.parse(strFromU8(bytes));
}

export async function inputToArrayBuffer(input) {
  if (input instanceof ArrayBuffer) {
    return input;
  }

  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength,
    );
  }

  if (input && typeof input.arrayBuffer === "function") {
    return input.arrayBuffer();
  }

  throw new Error("Expected a File, Blob, ArrayBuffer, or Uint8Array.");
}

export async function inputToBytes(input) {
  return new Uint8Array(await inputToArrayBuffer(input));
}

export function bytesToArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
}

export function bytesToBase64Url(bytes) {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 8192) {
    const chunk = bytes.subarray(index, index + 8192);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function base64UrlToBytes(value) {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function bytesToHex(bytes) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
