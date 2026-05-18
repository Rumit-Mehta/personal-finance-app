import { createImportRecord, normalizeFinanceData } from "../financeData.js";
import { hashInput } from "../hash.js";

export async function monzoJsonFileToFinanceData(file) {
  const text = await file.text();
  const monzoData = JSON.parse(text);
  const fileHash = await hashInput(file);

  return monzoJsonToFinanceData(monzoData, {
    fileHash,
    fileName: file?.name,
  });
}

export function monzoJsonToFinanceData(monzoData, importOptions = {}) {
  const fetchedAt = monzoData.fetchedAt || new Date().toISOString();
  const accounts = [];
  const balances = [];
  const transactions = [];

  for (const monzoAccount of monzoData.accounts || []) {
    const accountId = monzoAccountId(monzoAccount.id);
    const currency = monzoAccount.balance?.currency || "GBP";

    accounts.push({
      id: accountId,
      name: monzoAccount.description || monzoAccount.id,
      type: monzoAccount.type || "current",
      institution: "Monzo",
      accountKind: "actual",
      parentAccountId: "",
      currency,
      openingBalance: 0,
      manualBalance: monzoMoneyValue(
        monzoAccount.balance?.balance_major,
        monzoAccount.balance?.balance,
      ),
      sourceProvider: "monzo",
      sourceId: monzoAccount.id,
    });

    balances.push({
      id: `${accountId}:${fetchedAt}`,
      accountId,
      date: fetchedAt,
      balance: monzoMoneyValue(
        monzoAccount.balance?.balance_major,
        monzoAccount.balance?.balance,
      ),
      totalBalance: monzoMoneyValue(
        monzoAccount.balance?.total_balance_major,
        monzoAccount.balance?.total_balance,
      ),
      spendToday: monzoMoneyValue(
        monzoAccount.balance?.spend_today_major,
        monzoAccount.balance?.spend_today,
      ),
      currency,
      sourceProvider: "monzo",
      sourceId: monzoAccount.id,
    });

    for (const pot of monzoAccount.pots || []) {
      accounts.push({
        id: monzoPotId(pot.id),
        name: pot.name || pot.id,
        type: "pot",
        institution: "Monzo",
        accountKind: "actual",
        parentAccountId: accountId,
        currency: pot.currency || currency,
        openingBalance: 0,
        manualBalance: monzoMoneyValue(pot.balance_major, pot.balance),
        sourceProvider: "monzo",
        sourceId: pot.id,
      });
    }

    for (const transaction of monzoAccount.transactions || []) {
      transactions.push(normalizeMonzoTransaction(transaction, accountId));
    }
  }

  const importRecord = createImportRecord({
    sourceType: "monzo-json",
    fileHash: importOptions.fileHash,
    fileName: importOptions.fileName,
    provider: "monzo",
    accountIds: accounts.map((account) => account.id),
    transactionCount: transactions.length,
    importedAt: fetchedAt,
  });

  return normalizeFinanceData({
    metadata: {
      source: "monzo-json",
      provider: "monzo",
      fetchedAt,
      monzoUserId: monzoData.whoami?.user_id || "",
    },
    user: {},
    accounts,
    balances,
    transactions,
    tags: [],
    investments: [],
    debts: [],
    valueHistory: [],
    imports: [importRecord],
  });
}

function normalizeMonzoTransaction(transaction, fallbackAccountId) {
  const sourceId = transaction.id;
  const merchantName =
    transaction.merchant?.name ||
    transaction.counterparty?.name ||
    transaction.description ||
    "";

  return {
    id: monzoTransactionId(sourceId),
    account: monzoAccountId(transaction.account_id) || fallbackAccountId,
    date: transaction.settled || transaction.created,
    description: transaction.description || merchantName,
    amount: monzoMoneyValue(transaction.amount_major, transaction.amount),
    category: transaction.category,
    tag: "",
    merchant: merchantName,
    notes: transaction.notes,
    sourceProvider: "monzo",
    sourceType: "monzo-json",
    sourceId,
  };
}

function monzoAccountId(id) {
  return id ? `monzo:${id}` : "";
}

function monzoPotId(id) {
  return id ? `monzo:pot:${id}` : "";
}

function monzoTransactionId(id) {
  return id ? `monzo:${id}` : "";
}

function monzoMoneyValue(majorValue, minorValue) {
  if (majorValue !== null && majorValue !== undefined) {
    return Number(majorValue || 0);
  }

  return Number(minorValue || 0) / 100;
}
