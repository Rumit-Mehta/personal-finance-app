import { createImportRecord, normalizeFinanceData } from "../vault/financeData.js";
import { hashInput } from "../vault/hash.js";
import { findImportAdapter, findImportAdapterById } from "./adapters/index.js";
import { parseCsv } from "./csv.js";
import { extractPdfText } from "./pdf.js";
import { applyImportRules } from "./rules.js";

/**
 * Reads an uploaded file, parses it, and wraps it in a raw import batch.
 */
export async function parseImportFile(file) {
  const importedAt = new Date().toISOString();
  const fileHash = await hashInput(file);

  if (isPdfFile(file)) {
    const parsedPdf = await extractPdfText(file);
    const adapter = findImportAdapter(parsedPdf);

    if (!adapter) {
      throw new Error("Unsupported PDF format. No adapter matched this file.");
    }

    return adapter.createRawBatch({
      parsedPdf,
      file,
      fileHash,
      importedAt,
    });
  }

  const text = await file.text();
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
  if (batch.allowAccountRetarget === false) {
    return batch;
  }

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
    balances: (batch.balances ?? []).map((balance) => ({
      ...balance,
      accountId:
        balance.accountRole === "main" ? normalizedAccount.id : balance.accountId,
    })),
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
  const importRecords = importSourcesFromBatch(editedBatch).map((source) =>
    createImportRecord({
      sourceType: source.sourceType || editedBatch.sourceType,
      fileHash: source.fileHash,
      fileName: source.fileName,
      provider: source.sourceProvider || editedBatch.sourceProvider,
      accountIds,
      transactionCount: source.transactionCount ?? editedBatch.rows.length,
      importedAt: source.importedAt || editedBatch.importedAt,
    }),
  );

  return normalizeFinanceData({
    metadata: {
      source: editedBatch.sourceType,
      provider: editedBatch.sourceProvider,
      importedAt: editedBatch.importedAt,
      fileName: editedBatch.fileName,
    },
    user: {},
    accounts,
    balances: (editedBatch.balances ?? []).map(importBalanceSnapshot),
    transactions: editedBatch.rows.map(importRowToTransaction),
    tags: [],
    investments: (editedBatch.investments ?? []).map(importValueEntity),
    debts: [],
    valueHistory: (editedBatch.valueHistory ?? []).map(importValueHistory),
    imports: importRecords,
    importRules: options.importRules ?? [],
  });
}

/**
 * Maps a staged balance into the snapshot shape stored in the vault.
 */
function importBalanceSnapshot(balance) {
  return {
    id: balance.id,
    accountId: balance.accountId,
    date: balance.date,
    balance: balance.balance,
    currency: balance.currency,
    sourceType: balance.sourceType,
    sourceProvider: balance.sourceProvider,
    sourceId: balance.sourceId,
    notes: balance.notes,
  };
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
 * Combines same-source staged batches so a user can review several files at once.
 */
export function combineImportBatches(batches = []) {
  if (batches.length === 0) {
    throw new Error("Choose at least one import file.");
  }

  if (batches.length === 1) {
    return batches[0];
  }

  const [firstBatch] = batches;
  const incompatibleBatch = batches.find(
    (batch) =>
      batch.adapterId !== firstBatch.adapterId ||
      batch.sourceType !== firstBatch.sourceType ||
      batch.sourceProvider !== firstBatch.sourceProvider ||
      batch.allowAccountRetarget === false !==
        (firstBatch.allowAccountRetarget === false),
  );

  if (incompatibleBatch) {
    throw new Error(
      "Bulk import review supports files from one source type at a time.",
    );
  }

  return {
    ...firstBatch,
    fileName: `${batches.length} files`,
    fileHash: "",
    importedAt: firstBatch.importedAt,
    sourceFileCount: batches.length,
    importSources: batches.flatMap(importSourcesFromBatch),
    accounts: mergeById(batches.flatMap((batch) => batch.accounts ?? [])),
    balances: mergeById(batches.flatMap((batch) => batch.balances ?? [])),
    rows: uniqueRows(batches.flatMap((batch) => batch.rows ?? [])),
    investments: mergeById(batches.flatMap((batch) => batch.investments ?? [])),
    valueHistory: mergeById(
      batches.flatMap((batch) => batch.valueHistory ?? []),
    ),
    warnings: batches.flatMap((batch) => batch.warnings ?? []),
  };
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

function importSourcesFromBatch(batch) {
  if (Array.isArray(batch.importSources) && batch.importSources.length > 0) {
    return batch.importSources;
  }

  return [
    {
      sourceType: batch.sourceType,
      sourceProvider: batch.sourceProvider,
      fileHash: batch.fileHash,
      fileName: batch.fileName,
      transactionCount: batch.rows?.length ?? 0,
      importedAt: batch.importedAt,
    },
  ];
}

function mergeById(items) {
  const merged = new Map();

  items.forEach((item) => {
    if (item?.id) {
      merged.set(item.id, item);
    }
  });

  return [...merged.values()];
}

function uniqueRows(rows) {
  const usedIds = new Set();

  return rows.map((row, index) => {
    const baseId = text(row.id) || `bulk-row-${index + 1}`;
    let id = baseId;
    let duplicateIndex = 2;

    while (usedIds.has(id)) {
      id = `${baseId}:bulk-${duplicateIndex}`;
      duplicateIndex += 1;
    }

    usedIds.add(id);

    return id === row.id ? row : { ...row, id };
  });
}

/**
 * Maps staged investment/debt-like rows into the current vault value entity shape.
 */
function importValueEntity(entity = {}) {
  return {
    id: text(entity.id),
    name: text(entity.name),
    type: text(entity.type),
    provider: text(entity.provider),
    currency: text(entity.currency) || "GBP",
    currentValue: number(entity.currentValue),
  };
}

/**
 * Maps staged value history rows into the vault shape.
 */
function importValueHistory(history = {}) {
  return {
    id: text(history.id),
    entityType: text(history.entityType),
    entityId: text(history.entityId),
    date: text(history.date),
    value: number(history.value),
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

function isPdfFile(file = {}) {
  const name = text(file.name).toLowerCase();
  const type = text(file.type).toLowerCase();

  return type === "application/pdf" || name.endsWith(".pdf");
}
