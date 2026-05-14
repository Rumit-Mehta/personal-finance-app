import { createImportRecord, normalizeFinanceData } from "../vault/financeData.js";
import { hashInput } from "../vault/hash.js";
import { findImportAdapter, findImportAdapterById } from "./adapters/index.js";
import { parseCsv } from "./csv.js";
import { applyImportRules } from "./rules.js";

/**
 * Reads an uploaded file, parses it as CSV, and wraps it in a raw import batch.
 */
export async function parseImportFile(file) {
  const importedAt = new Date().toISOString();
  const [text, fileHash] = await Promise.all([file.text(), hashInput(file)]);
  const parsedCsv = parseCsv(text);
  const adapter = findImportAdapter(parsedCsv);

  if (!adapter) {
    throw new Error("Unsupported CSV format. No bank adapter matched this file.");
  }

  return adapter.createRawBatch({
    parsedCsv,
    file,
    fileHash,
    importedAt,
  });
}

/**
 * Uses the raw batch's adapter to map bank-specific rows into staged rows.
 */
export function normalizeImportBatch(rawBatch) {
  const adapter = findImportAdapterById(rawBatch.adapterId);

  if (!adapter) {
    throw new Error(`Unsupported import adapter: ${rawBatch.adapterId}`);
  }

  return adapter.normalize(rawBatch);
}

/**
 * Runs reusable import rules against staged rows.
 */
export function applyRulesToImportBatch(stagedBatch, rules = []) {
  return applyImportRules(stagedBatch, rules);
}

/**
 * Assigns user-selected main-account details while preserving generated child rows.
 */
export function assignImportBatchAccount(batch, account) {
  const normalizedAccount = {
    ...importAccount(account),
    accountRole: "main",
  };

  if (!normalizedAccount.id) {
    throw new Error("Choose or create an account before saving the import.");
  }

  const childAccounts = (batch.accounts ?? [])
    .filter((batchAccount) => batchAccount.accountRole !== "main")
    .filter((batchAccount) => batchAccount.id !== normalizedAccount.id)
    .map((batchAccount) => ({
      ...batchAccount,
      parentAccountId:
        batchAccount.accountRole === "pot"
          ? normalizedAccount.id
          : batchAccount.parentAccountId,
    }));

  return {
    ...batch,
    accounts: [normalizedAccount, ...childAccounts],
    rows: batch.rows.map((row) => ({
      ...row,
      account: row.accountRole === "pot" ? row.account : normalizedAccount.id,
      transferAccount:
        row.accountRole === "pot" ? normalizedAccount.id : row.transferAccount,
    })),
  };
}

/**
 * Converts edited import rows and accounts into normalized vault finance data.
 */
export function financeDataFromEditedImport(editedBatch, options = {}) {
  const accounts = editedBatch.accounts ?? [];
  const accountIds = accounts.map((account) => account.id);
  const importRecord = createImportRecord({
    sourceType: editedBatch.sourceType,
    fileHash: editedBatch.fileHash,
    fileName: editedBatch.fileName,
    provider: editedBatch.sourceProvider,
    accountIds,
    transactionCount: editedBatch.rows.length,
    importedAt: editedBatch.importedAt,
  });

  return normalizeFinanceData({
    metadata: {
      source: editedBatch.sourceType,
      provider: editedBatch.sourceProvider,
      importedAt: editedBatch.importedAt,
      fileName: editedBatch.fileName,
    },
    user: {},
    accounts,
    balances: [],
    transactions: editedBatch.rows.map(importRowToTransaction),
    tags: [],
    investments: [],
    debts: [],
    valueHistory: [],
    imports: [importRecord],
    importRules: options.importRules ?? [],
  });
}

/**
 * Convenience helper that parses, normalizes, and applies rules in one step.
 */
export async function importFileToEditedBatch(file, rules = []) {
  const rawBatch = await parseImportFile(file);
  const stagedBatch = normalizeImportBatch(rawBatch);

  return applyRulesToImportBatch(stagedBatch, rules);
}

/**
 * Maps a staged import row into the transaction shape stored in the vault.
 */
function importRowToTransaction(row) {
  return {
    id: row.id,
    account: row.account,
    date: row.date,
    description: row.description,
    amount: row.amount,
    category: row.category,
    tag: row.tag,
    merchant: row.merchant,
    notes: row.notes,
    sourceProvider: row.sourceProvider,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
  };
}

/**
 * Normalizes account-like objects from the UI or adapters before vault conversion.
 */
function importAccount(account = {}) {
  return {
    id: text(account.id),
    name: text(account.name),
    type: text(account.type),
    institution: text(account.institution),
    accountKind: text(account.accountKind) || "actual",
    parentAccountId: text(account.parentAccountId),
    currency: text(account.currency) || "GBP",
    openingBalance: number(account.openingBalance),
    manualBalance:
      account.manualBalance === null || account.manualBalance === undefined
        ? null
        : number(account.manualBalance),
    sourceProvider: text(account.sourceProvider),
    sourceId: text(account.sourceId),
    accountRole: text(account.accountRole),
  };
}

/**
 * Converts nullable values into trimmed strings for normalized import data.
 */
function text(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

/**
 * Converts user-entered or imported numeric values into finite numbers.
 */
function number(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}
