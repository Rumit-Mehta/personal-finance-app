import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { MonzoClient } from "./client.js";

export async function fetchMonzoData(options = {}) {
  const client = new MonzoClient();
  const [whoami, accountsResponse] = await Promise.all([
    client.whoAmI(),
    client.listAccounts({ accountType: options.accountType }),
  ]);

  const accounts = accountsResponse.accounts || [];
  const accountData = await Promise.all(
    accounts.map(async (account) => {
      const [balance, pots, transactions] = await Promise.all([
        client.getBalance(account.id),
        client.listPots(account.id),
        client.listTransactions(account.id, {
          since: options.since,
          before: options.before,
          limit: options.limit,
          expandMerchant: options.expandMerchant,
        }),
      ]);

      return {
        ...account,
        balance: normalizeMoneyFields(balance),
        pots: (pots.pots || []).map(normalizePot),
        transactions: (transactions.transactions || []).map(
          normalizeTransaction,
        ),
      };
    }),
  );

  return {
    fetchedAt: new Date().toISOString(),
    whoami,
    accounts: accountData,
  };
}

export async function writeMonzoData(data, outputPath = config.outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`);
  return outputPath;
}

export function parseFetchArgs(argv) {
  const options = {
    expandMerchant: true,
    limit: 100,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--since") {
      options.since = next;
      index += 1;
    } else if (arg === "--before") {
      options.before = next;
      index += 1;
    } else if (arg === "--limit") {
      options.limit = Number(next);
      index += 1;
    } else if (arg === "--account-type") {
      options.accountType = next;
      index += 1;
    } else if (arg === "--no-expand-merchant") {
      options.expandMerchant = false;
    }
  }

  return options;
}

function normalizeTransaction(transaction) {
  return {
    ...transaction,
    amount_major: minorToMajor(transaction.amount),
  };
}

function normalizePot(pot) {
  return {
    ...pot,
    balance_major: minorToMajor(pot.balance),
  };
}

function normalizeMoneyFields(balance) {
  return {
    ...balance,
    balance_major: minorToMajor(balance.balance),
    total_balance_major: minorToMajor(balance.total_balance),
    spend_today_major: minorToMajor(balance.spend_today),
  };
}

function minorToMajor(value) {
  return Number(value || 0) / 100;
}
