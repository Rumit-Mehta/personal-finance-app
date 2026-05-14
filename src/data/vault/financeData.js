import { Account } from "../../models/Account.js";
import { Transaction } from "../../models/Transaction.js";
import { User } from "../../models/User.js";

export const FINANCE_DATA_SCHEMA_VERSION = 1;

const ARRAY_KEYS = [
  "accounts",
  "balances",
  "transactions",
  "tags",
  "investments",
  "debts",
  "valueHistory",
  "imports",
  "importRules",
];

export class DuplicateImportError extends Error {
  constructor(importRecord) {
    super("This source file has already been imported into the vault.");
    this.name = "DuplicateImportError";
    this.importRecord = importRecord;
  }
}

export function createEmptyFinanceData(overrides = {}) {
  const now = new Date().toISOString();

  return normalizeFinanceData({
    schemaVersion: FINANCE_DATA_SCHEMA_VERSION,
    metadata: {
      createdAt: now,
      updatedAt: now,
      app: "personal-finance-app",
      ...overrides.metadata,
    },
    user: {},
    accounts: [],
    balances: [],
    transactions: [],
    tags: [],
    investments: [],
    debts: [],
    valueHistory: [],
    imports: [],
    importRules: [],
    ...overrides,
  });
}

export function normalizeFinanceData(data = {}) {
  const now = new Date().toISOString();
  const normalized = {
    schemaVersion: Number(data.schemaVersion || FINANCE_DATA_SCHEMA_VERSION),
    metadata: {
      createdAt: data.metadata?.createdAt || now,
      updatedAt: data.metadata?.updatedAt || now,
      app: data.metadata?.app || "personal-finance-app",
      ...data.metadata,
    },
    user: normalizeUser(data.user),
    accounts: toArray(data.accounts).map(normalizeAccount),
    balances: toArray(data.balances).map(normalizeBalance),
    transactions: toArray(data.transactions).map(normalizeTransaction),
    tags: toArray(data.tags).map(normalizeTag),
    investments: normalizeValueEntities(data.investments, "investment"),
    debts: normalizeValueEntities(data.debts, "debt"),
    valueHistory: toArray(data.valueHistory).map(normalizeValueHistory),
    imports: toArray(data.imports).map(normalizeImportRecord),
    importRules: toArray(data.importRules).map(normalizeImportRule),
  };

  validateFinanceData(normalized);
  return normalized;
}

export function validateFinanceData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Finance data must be an object.");
  }

  if (data.schemaVersion !== FINANCE_DATA_SCHEMA_VERSION) {
    throw new Error(`Unsupported finance data schema: ${data.schemaVersion}`);
  }

  ARRAY_KEYS.forEach((key) => {
    if (!Array.isArray(data[key])) {
      throw new Error(`Finance data field must be an array: ${key}`);
    }
  });

  const accountIds = new Set();

  data.accounts.forEach((account) => {
    if (!account.id) {
      throw new Error("Every account must have an id.");
    }

    accountIds.add(account.id);
  });

  data.transactions.forEach((transaction) => {
    if (!transaction.id) {
      throw new Error("Every transaction must have an id.");
    }

    if (!transaction.account) {
      throw new Error(`Transaction ${transaction.id} is missing an account.`);
    }

    if (!accountIds.has(transaction.account)) {
      throw new Error(
        `Transaction ${transaction.id} uses unknown account ${transaction.account}.`,
      );
    }
  });
}

export function financeDataFromAppData(appData, metadata = {}) {
  const rawRows = appData?.rawRows ?? {};

  return normalizeFinanceData({
    metadata,
    user: {
      firstName: text(appData?.user?.firstName),
      lastName: text(appData?.user?.lastName),
      age: text(appData?.user?.age),
    },
    accounts: collectionValues(appData?.accounts).map((account) => ({
      id: text(account.id),
      name: text(account.name),
      type: text(account.type),
      institution: text(account.institution),
      accountKind: text(account.accountKind) || "actual",
      parentAccountId: text(account.parentAccountId),
      currency: text(account.currency) || "GBP",
      openingBalance: number(account.openingBalance),
      manualBalance: optionalNumber(account.manualBalance),
    })),
    transactions: toArray(appData?.transactions).map((transaction) => ({
      id: text(transaction.id),
      account: text(transaction.account),
      date: isoDate(transaction.date),
      description: text(transaction.description),
      amount: number(transaction.amount),
      category: text(transaction.category),
      tag: text(transaction.tag),
      merchant: text(transaction.merchant),
      notes: text(transaction.notes),
      sourceProvider: text(transaction.sourceProvider),
      sourceType: text(transaction.sourceType),
      sourceId: text(transaction.sourceId),
      fingerprint: text(transaction.fingerprint),
      possibleDuplicate: Boolean(transaction.possibleDuplicate),
      duplicateOf: text(transaction.duplicateOf),
    })),
    tags: collectionValues(appData?.tags).map((tag) => ({
      id: text(tag.id),
      name: text(tag.name),
      description: text(tag.description),
    })),
    investments: investmentRowsFromAppData(appData, rawRows),
    debts: debtRowsFromAppData(appData, rawRows),
    valueHistory: toArray(appData?.valueHistory).map((history) => ({
      id: text(history.id),
      entityType: text(history.entityType),
      entityId: text(history.entityId),
      date: isoDate(history.date),
      value: number(history.value),
    })),
    imports: toArray(appData?.imports),
    importRules: toArray(appData?.importRules),
  });
}

export function appDataFromFinanceData(financeData) {
  const data = normalizeFinanceData(financeData);
  const accounts = new Map();

  data.accounts.forEach((account) => {
    accounts.set(
      account.id,
      new Account({
        id: account.id,
        name: account.name,
        type: account.type,
        institution: account.institution,
        accountKind: account.accountKind,
        parentAccountId: account.parentAccountId,
        openingBalance: account.openingBalance,
        manualBalance: account.manualBalance,
        currency: account.currency,
      }),
    );
  });

  const transactions = data.transactions.map((transaction) => {
    const model = new Transaction({
      id: transaction.id,
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      category: transaction.category,
      tag: transaction.tag,
      account: transaction.account,
      merchant: transaction.merchant,
      notes: transaction.notes,
    });

    const account = accounts.get(transaction.account);

    if (account) {
      account.addTransaction(model);
    }

    return model;
  });
  const investments = new Map(
    data.investments.map((investment) => [
      investment.id,
      investment.currentValue,
    ]),
  );
  const debts = new Map(data.debts.map((debt) => [debt.id, debt.currentValue]));

  return {
    user: new User({
      firstName: data.user.firstName,
      lastName: data.user.lastName,
      age: data.user.age,
      accounts,
      investments,
      debts,
    }),
    accounts,
    transactions,
    tags: new Map(data.tags.map((tag) => [tag.id, tag])),
    investments,
    debts,
    valueHistory: data.valueHistory.map((history) => ({
      ...history,
      date: new Date(history.date),
    })),
    imports: data.imports,
    importRules: data.importRules,
    rawRows: rawRowsFromFinanceData(data),
  };
}

export function mergeFinanceData(existingData, incomingData, importRecord) {
  const existing = normalizeFinanceData(existingData);
  const incoming = normalizeFinanceData(incomingData);
  const normalizedImport = importRecord
    ? normalizeImportRecord(importRecord)
    : incoming.imports[0];

  if (normalizedImport && isDuplicateImport(existing, normalizedImport)) {
    throw new DuplicateImportError(normalizedImport);
  }

  const now = new Date().toISOString();
  const merged = normalizeFinanceData({
    ...existing,
    metadata: {
      ...existing.metadata,
      updatedAt: now,
    },
    user: mergeUser(existing.user, incoming.user),
    accounts: mergeById(existing.accounts, incoming.accounts),
    balances: mergeById(existing.balances, incoming.balances),
    tags: mergeById(existing.tags, incoming.tags),
    investments: mergeById(existing.investments, incoming.investments),
    debts: mergeById(existing.debts, incoming.debts),
    valueHistory: mergeById(existing.valueHistory, incoming.valueHistory),
    transactions: mergeTransactions(
      existing.transactions,
      incoming.transactions,
    ),
    imports: mergeImports(
      existing.imports,
      normalizedImport ? [...incoming.imports, normalizedImport] : incoming.imports,
    ),
    importRules: mergeById(existing.importRules, incoming.importRules),
  });

  validateFinanceData(merged);
  return merged;
}

export function isDuplicateImport(financeData, importRecord) {
  if (!importRecord?.fileHash) {
    return false;
  }

  return normalizeFinanceData(financeData).imports.some((existingImport) => {
    return existingImport.fileHash === importRecord.fileHash;
  });
}

export function createImportRecord({
  sourceType,
  fileHash = "",
  fileName = "",
  provider = "",
  accountIds = [],
  transactionCount = 0,
  importedAt = new Date().toISOString(),
} = {}) {
  const safeSourceType = text(sourceType);

  if (!safeSourceType) {
    throw new Error("Import record sourceType is required.");
  }

  return normalizeImportRecord({
    id: `${safeSourceType}:${fileHash || importedAt}`,
    sourceType: safeSourceType,
    fileHash,
    fileName,
    provider,
    accountIds,
    transactionCount,
    importedAt,
  });
}

function mergeTransactions(existingTransactions, incomingTransactions) {
  const merged = [];
  const byStableKey = new Map();
  const byFingerprint = new Map();
  const usedIds = new Set();

  existingTransactions.forEach((transaction) => {
    const normalized = normalizeTransaction(transaction);
    merged.push(normalized);
    byStableKey.set(transactionMergeKey(normalized), normalized);
    byFingerprint.set(transactionFingerprint(normalized), normalized);
    usedIds.add(normalized.id);
  });

  incomingTransactions.forEach((transaction) => {
    let normalized = normalizeTransaction(transaction);
    const stableKey = transactionMergeKey(normalized);

    if (!stableKey.startsWith("fingerprint:")) {
      const existing = byStableKey.get(stableKey);

      if (existing) {
        Object.assign(existing, normalized);
        return;
      }

      if (usedIds.has(normalized.id)) {
        normalized = {
          ...normalized,
          id: uniqueTransactionId(normalized.id, usedIds),
        };
      }

      merged.push(normalized);
      byStableKey.set(stableKey, normalized);
      byFingerprint.set(transactionFingerprint(normalized), normalized);
      usedIds.add(normalized.id);
      return;
    }

    const fingerprint = transactionFingerprint(normalized);
    const possibleDuplicate = byFingerprint.get(fingerprint);

    if (possibleDuplicate) {
      const flagged = {
        ...normalized,
        id: uniqueTransactionId(normalized.id, usedIds),
        possibleDuplicate: true,
        duplicateOf: possibleDuplicate.id,
        fingerprint,
      };

      merged.push(flagged);
      byStableKey.set(transactionMergeKey(flagged), flagged);
      usedIds.add(flagged.id);
      return;
    }

    normalized.fingerprint = fingerprint;
    merged.push(normalized);
    byStableKey.set(stableKey, normalized);
    byFingerprint.set(fingerprint, normalized);
    usedIds.add(normalized.id);
  });

  return merged;
}

function mergeById(existingItems, incomingItems) {
  const merged = new Map();

  existingItems.forEach((item) => merged.set(item.id, item));
  incomingItems.forEach((item) => merged.set(item.id, item));

  return [...merged.values()];
}

function mergeImports(existingImports, incomingImports) {
  const merged = new Map();

  existingImports.forEach((item) => {
    merged.set(importMergeKey(item), item);
  });
  incomingImports.forEach((item) => {
    merged.set(importMergeKey(item), normalizeImportRecord(item));
  });

  return [...merged.values()];
}

function mergeUser(existingUser, incomingUser) {
  return {
    firstName: incomingUser.firstName || existingUser.firstName,
    lastName: incomingUser.lastName || existingUser.lastName,
    age: incomingUser.age || existingUser.age,
  };
}

function transactionMergeKey(transaction) {
  if (transaction.sourceProvider && transaction.sourceId) {
    return `source:${transaction.sourceProvider}:${transaction.sourceId}`;
  }

  if (transaction.sourceType && transaction.sourceId) {
    return `source:${transaction.sourceType}:${transaction.sourceId}`;
  }

  return `fingerprint:${transactionFingerprint(transaction)}`;
}

function transactionFingerprint(transaction) {
  return [
    transaction.account,
    transaction.date,
    transaction.amount,
    text(transaction.description).toLowerCase(),
    text(transaction.merchant).toLowerCase(),
  ].join("|");
}

function uniqueTransactionId(baseId, usedIds) {
  let index = 2;
  let id = `${baseId || "txn"}-possible-duplicate`;

  while (usedIds.has(id)) {
    id = `${baseId || "txn"}-possible-duplicate-${index}`;
    index += 1;
  }

  return id;
}

function importMergeKey(importRecord) {
  return importRecord.fileHash || importRecord.id;
}

function normalizeUser(user = {}) {
  return {
    firstName: text(user.firstName),
    lastName: text(user.lastName),
    age: text(user.age),
  };
}

function normalizeAccount(account = {}) {
  return {
    id: text(account.id),
    name: text(account.name),
    type: text(account.type),
    institution: text(account.institution),
    accountKind: text(account.accountKind) || "actual",
    parentAccountId: text(account.parentAccountId),
    currency: text(account.currency) || "GBP",
    openingBalance: number(account.openingBalance),
    manualBalance: optionalNumber(account.manualBalance),
    sourceProvider: text(account.sourceProvider),
    sourceId: text(account.sourceId),
  };
}

function normalizeBalance(balance = {}) {
  return {
    id: text(balance.id),
    accountId: text(balance.accountId),
    date: isoDateTime(balance.date),
    balance: number(balance.balance),
    totalBalance: number(balance.totalBalance),
    spendToday: number(balance.spendToday),
    currency: text(balance.currency) || "GBP",
    sourceProvider: text(balance.sourceProvider),
    sourceId: text(balance.sourceId),
  };
}

function normalizeTransaction(transaction = {}) {
  const normalized = {
    id: text(transaction.id),
    account: text(transaction.account),
    date: isoDate(transaction.date),
    description: text(transaction.description),
    amount: number(transaction.amount),
    category: text(transaction.category),
    tag: text(transaction.tag),
    merchant: text(transaction.merchant),
    notes: text(transaction.notes),
    sourceProvider: text(transaction.sourceProvider),
    sourceType: text(transaction.sourceType),
    sourceId: text(transaction.sourceId),
    fingerprint: text(transaction.fingerprint),
    possibleDuplicate: Boolean(transaction.possibleDuplicate),
    duplicateOf: text(transaction.duplicateOf),
  };

  if (!normalized.fingerprint) {
    normalized.fingerprint = transactionFingerprint(normalized);
  }

  return normalized;
}

function normalizeTag(tag = {}) {
  return {
    id: text(tag.id),
    name: text(tag.name),
    description: text(tag.description),
  };
}

function normalizeValueHistory(history = {}) {
  return {
    id: text(history.id),
    entityType: text(history.entityType),
    entityId: text(history.entityId),
    date: isoDate(history.date),
    value: number(history.value),
  };
}

function normalizeValueEntities(value, entityType) {
  if (value instanceof Map) {
    return [...value.entries()].map(([id, currentValue]) => ({
      id: text(id),
      name: "",
      type: "",
      provider: "",
      currency: "GBP",
      currentValue: number(currentValue),
    }));
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValueEntity(item, entityType));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, currentValue]) => ({
      id: text(id),
      name: "",
      type: "",
      provider: "",
      currency: "GBP",
      currentValue: number(currentValue),
    }));
  }

  return [];
}

function normalizeValueEntity(item = {}, entityType) {
  const idKey = entityType === "investment" ? "investmentId" : "debtId";

  return {
    id: text(item.id || item[idKey]),
    name: text(item.name),
    type: text(item.type),
    provider: text(item.provider),
    currency: text(item.currency) || "GBP",
    currentValue: number(item.currentValue),
  };
}

function normalizeImportRecord(importRecord = {}) {
  return {
    id: text(importRecord.id),
    sourceType: text(importRecord.sourceType),
    fileHash: text(importRecord.fileHash),
    fileName: text(importRecord.fileName),
    provider: text(importRecord.provider),
    accountIds: toArray(importRecord.accountIds).map(text),
    transactionCount: number(importRecord.transactionCount),
    importedAt: isoDateTime(importRecord.importedAt),
  };
}

function normalizeImportRule(rule = {}) {
  const set = {};

  ["category", "tag", "merchant", "notes"].forEach((field) => {
    if (rule.set?.[field] !== undefined) {
      set[field] = text(rule.set[field]);
    }
  });

  return {
    id: text(rule.id),
    name: text(rule.name),
    enabled: rule.enabled !== false,
    sourceType: text(rule.sourceType),
    sourceProvider: text(rule.sourceProvider),
    order: number(rule.order),
    match: {
      field: text(rule.match?.field),
      operator: text(rule.match?.operator) || "contains",
      value: text(rule.match?.value),
    },
    set,
  };
}

function investmentRowsFromAppData(appData, rawRows) {
  if (toArray(rawRows?.investments).length > 0) {
    return rawRows.investments.map((row) => ({
      id: text(row.investmentId),
      name: text(row.name),
      type: text(row.type),
      provider: text(row.provider),
      currency: text(row.currency) || "GBP",
      currentValue: number(row.currentValue),
    }));
  }

  return [...toMap(appData?.investments).entries()].map(
    ([id, currentValue]) => ({
      id: text(id),
      name: "",
      type: "",
      provider: "",
      currency: "GBP",
      currentValue: number(currentValue),
    }),
  );
}

function debtRowsFromAppData(appData, rawRows) {
  if (toArray(rawRows?.debts).length > 0) {
    return rawRows.debts.map((row) => ({
      id: text(row.debtId),
      name: text(row.name),
      type: text(row.type),
      provider: text(row.provider),
      currency: text(row.currency) || "GBP",
      currentValue: number(row.currentValue),
    }));
  }

  return [...toMap(appData?.debts).entries()].map(([id, currentValue]) => ({
    id: text(id),
    name: "",
    type: "",
    provider: "",
    currency: "GBP",
    currentValue: number(currentValue),
  }));
}

function rawRowsFromFinanceData(data) {
  return {
    user: [data.user],
    accounts: data.accounts.map((account) => ({
      accountId: account.id,
      name: account.name,
      type: account.type,
      institution: account.institution,
      accountKind: account.accountKind,
      parentAccountId: account.parentAccountId,
      currency: account.currency,
      openingBalance: account.openingBalance,
      manualBalance: account.manualBalance,
    })),
    transactions: data.transactions.map((transaction) => ({
      transactionId: transaction.id,
      accountId: transaction.account,
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      category: transaction.category,
      tagId: transaction.tag,
      merchant: transaction.merchant,
      notes: transaction.notes,
    })),
    tags: data.tags.map((tag) => ({
      tagId: tag.id,
      name: tag.name,
      description: tag.description,
    })),
    investments: data.investments.map((investment) => ({
      investmentId: investment.id,
      name: investment.name,
      type: investment.type,
      provider: investment.provider,
      currency: investment.currency,
      currentValue: investment.currentValue,
    })),
    debts: data.debts.map((debt) => ({
      debtId: debt.id,
      name: debt.name,
      type: debt.type,
      provider: debt.provider,
      currency: debt.currency,
      currentValue: debt.currentValue,
    })),
    valueHistory: data.valueHistory.map((history) => ({
      historyId: history.id,
      entityType: history.entityType,
      entityId: history.entityId,
      date: history.date,
      value: history.value,
    })),
  };
}

function collectionValues(value) {
  if (value instanceof Map) {
    return [...value.values()];
  }

  return toArray(value);
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value instanceof Map) {
    return [...value.values()];
  }

  if (value && typeof value === "object") {
    return Object.values(value);
  }

  return [];
}

function toMap(value) {
  if (value instanceof Map) {
    return value;
  }

  return new Map(Object.entries(value ?? {}));
}

function text(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value) {
  return text(value) === "" ? null : number(value);
}

function isoDate(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function isoDateTime(value) {
  if (!value) {
    return new Date().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
