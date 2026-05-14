import { unzipSync, zipSync } from "fflate";
import { decryptBytes, encryptBytes } from "./crypto.js";
import {
  bytesToArrayBuffer,
  bytesToJson,
  inputToBytes,
  jsonToBytes,
} from "./encoding.js";
import {
  createEmptyFinanceData,
  FINANCE_DATA_SCHEMA_VERSION,
  normalizeFinanceData,
  validateFinanceData,
} from "./financeData.js";

export {
  appDataFromFinanceData,
  createEmptyFinanceData,
  createImportRecord,
  DuplicateImportError,
  financeDataFromAppData,
  isDuplicateImport,
  mergeFinanceData,
  normalizeFinanceData,
  validateFinanceData,
} from "./financeData.js";

const PFA_FORMAT = "personal-finance-app-vault";
const PFA_VERSION = 1;

export async function createPfaVault(financeData, password) {
  const normalizedData = normalizeFinanceData(financeData);
  const innerZip = zipFinanceData(normalizedData);
  const encrypted = await encryptBytes(innerZip, password);
  const manifest = {
    format: PFA_FORMAT,
    version: PFA_VERSION,
    schemaVersion: FINANCE_DATA_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    payload: {
      file: "vault.bin",
      compression: "zip",
    },
    crypto: encrypted.metadata,
  };
  const outerZip = zipSync({
    "manifest.json": jsonToBytes(manifest),
    "vault.bin": encrypted.bytes,
  });

  return bytesToArrayBuffer(outerZip);
}

export async function openPfaVault(fileOrBuffer, password) {
  const outerZip = unzipSync(await inputToBytes(fileOrBuffer));
  const manifest = readJsonFile(outerZip, "manifest.json");
  const encryptedVault = outerZip["vault.bin"];

  validateManifest(manifest);

  if (!encryptedVault) {
    throw new Error("Invalid PFA vault: missing vault.bin.");
  }

  const innerZipBytes = await decryptBytes(
    encryptedVault,
    password,
    manifest.crypto,
  );
  const innerZip = unzipSync(innerZipBytes);
  const financeData = {
    schemaVersion: readJsonFile(innerZip, "metadata.json").schemaVersion,
    metadata: readJsonFile(innerZip, "metadata.json"),
    user: readOptionalJsonFile(innerZip, "user.json", {}),
    accounts: readOptionalJsonFile(innerZip, "accounts.json", []),
    balances: readOptionalJsonFile(innerZip, "balances.json", []),
    transactions: readOptionalJsonFile(innerZip, "transactions.json", []),
    tags: readOptionalJsonFile(innerZip, "tags.json", []),
    investments: readOptionalJsonFile(innerZip, "investments.json", []),
    debts: readOptionalJsonFile(innerZip, "debts.json", []),
    valueHistory: readOptionalJsonFile(innerZip, "valueHistory.json", []),
    imports: readOptionalJsonFile(innerZip, "imports.json", []),
    importRules: readOptionalJsonFile(innerZip, "importRules.json", []),
  };

  validateFinanceData(financeData);
  return normalizeFinanceData(financeData);
}

function zipFinanceData(data) {
  return zipSync({
    "metadata.json": jsonToBytes({
      ...data.metadata,
      schemaVersion: data.schemaVersion,
    }),
    "user.json": jsonToBytes(data.user),
    "accounts.json": jsonToBytes(data.accounts),
    "balances.json": jsonToBytes(data.balances),
    "transactions.json": jsonToBytes(data.transactions),
    "tags.json": jsonToBytes(data.tags),
    "investments.json": jsonToBytes(data.investments),
    "debts.json": jsonToBytes(data.debts),
    "valueHistory.json": jsonToBytes(data.valueHistory),
    "imports.json": jsonToBytes(data.imports),
    "importRules.json": jsonToBytes(data.importRules),
  });
}

function readJsonFile(files, fileName) {
  const file = files[fileName];

  if (!file) {
    throw new Error(`Invalid PFA vault: missing ${fileName}.`);
  }

  return bytesToJson(file);
}

function readOptionalJsonFile(files, fileName, fallback) {
  const file = files[fileName];

  return file ? bytesToJson(file) : fallback;
}

function validateManifest(manifest) {
  if (
    manifest?.format !== PFA_FORMAT ||
    manifest?.version !== PFA_VERSION ||
    manifest?.payload?.file !== "vault.bin" ||
    manifest?.payload?.compression !== "zip" ||
    !manifest?.crypto
  ) {
    throw new Error("Unsupported PFA vault format.");
  }
}

export function createNewFinanceData(overrides = {}) {
  return createEmptyFinanceData(overrides);
}
