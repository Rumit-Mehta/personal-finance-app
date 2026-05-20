import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import {
  applyImportRules,
  assignImportBatchAccount,
  combineImportBatches,
  createImportRule,
  financeDataFromEditedImport,
  normalizeImportBatch,
  parseImportFile,
} from "../src/data/imports/index.js";
import { deriveDailyNetWorthSeries } from "../src/data/balanceHistory.js";
import { parseCsv } from "../src/data/imports/csv.js";
import {
  appDataFromFinanceData,
  createManualBalanceSnapshot,
  createPfaVault,
  DuplicateImportError,
  mergeFinanceData,
  normalizeFinanceData,
  openPfaVault,
} from "../src/data/vault/index.js";
import { monzoJsonToFinanceData } from "../src/data/vault/adapters/monzo.js";
import { normalizeTrading212Statement } from "../src/data/imports/adapters/trading212Pdf.js";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
  });
}

test("parseCsv handles quoted fields, multiline values, escaped quotes, and emoji", () => {
  const parsed = parseCsv(
    'Name,Notes,Emoji\r\n"Grab, Taxi","line one\nline ""two""",🚕\r\n,,\r\n',
  );

  assert.deepEqual(parsed.headers, ["Name", "Notes", "Emoji"]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].raw.Name, "Grab, Taxi");
  assert.equal(parsed.rows[0].raw.Notes, 'line one\nline "two"');
  assert.equal(parsed.rows[0].raw.Emoji, "🚕");
});

test("Monzo CSV adapter stages raw rows into canonical import fields", async () => {
  const rawBatch = await parseImportFile(fileFromText(monzoCsvText()));
  const stagedBatch = normalizeImportBatch(rawBatch);

  assert.equal(rawBatch.sourceType, "monzo-csv");
  assert.equal(rawBatch.rows[0].raw["Transaction ID"], "tx_1");
  assert.equal(stagedBatch.accounts[0].id, "monzo:csv");
  assert.equal(stagedBatch.rows[0].id, "monzo:csv:tx_1");
  assert.equal(stagedBatch.rows[0].date, "2023-10-15");
  assert.equal(stagedBatch.rows[0].amount, -3.21);
  assert.equal(stagedBatch.rows[0].merchant, "Grab");
  assert.equal(stagedBatch.rows[0].description, "Grab* A-123");
  assert.equal(stagedBatch.rows[0].category, "Eating out");
  assert.equal(stagedBatch.rows[0].notes, "ride, late");
});

test("applyImportRules supports case-insensitive wildcard matching and ordering", async () => {
  const stagedBatch = normalizeImportBatch(
    await parseImportFile(fileFromText(monzoCsvText())),
  );
  const rules = [
    createImportRule({
      sourceType: "monzo-csv",
      order: 0,
      match: { field: "merchant", operator: "wildcard", value: "grab*" },
      set: { category: "transport" },
    }),
    createImportRule({
      sourceType: "monzo-csv",
      order: 1,
      match: { field: "description", operator: "contains", value: "a-123" },
      set: { category: "taxis", notes: "matched by description" },
    }),
    createImportRule({
      enabled: false,
      sourceType: "monzo-csv",
      order: 2,
      match: { field: "merchant", operator: "equals", value: "grab" },
      set: { category: "disabled" },
    }),
  ];

  const editedBatch = applyImportRules(stagedBatch, rules);

  assert.equal(editedBatch.rows[0].category, "taxis");
  assert.equal(editedBatch.rows[0].notes, "matched by description");
  assert.deepEqual(
    editedBatch.rows[0].appliedRuleIds,
    [rules[0].id, rules[1].id],
  );
});

test("financeDataFromEditedImport converts edited batches into normalized finance data", async () => {
  const stagedBatch = normalizeImportBatch(
    await parseImportFile(fileFromText(monzoCsvText())),
  );
  const rule = createImportRule({
    sourceType: "monzo-csv",
    match: { field: "merchant", operator: "startsWith", value: "gra" },
    set: { category: "transport" },
  });
  const editedBatch = applyImportRules(stagedBatch, [rule]);
  const financeData = financeDataFromEditedImport(editedBatch, {
    importRules: [rule],
  });

  assert.equal(financeData.accounts[0].id, "monzo:csv");
  assert.equal(financeData.transactions[0].sourceProvider, "monzo");
  assert.equal(financeData.transactions[0].sourceType, "monzo-csv");
  assert.equal(financeData.transactions[0].sourceId, "tx_1");
  assert.equal(financeData.transactions[0].category, "transport");
  assert.equal(financeData.balances.length, 0);
  assert.equal(financeData.imports[0].transactionCount, 1);
  assert.equal(financeData.importRules[0].id, rule.id);
});

test("CSV imports with a running balance column create balance snapshots", async () => {
  const stagedBatch = normalizeImportBatch(
    await parseImportFile(fileFromText(monzoCsvWithBalanceText())),
  );
  const assignedBatch = assignImportBatchAccount(stagedBatch, {
    id: "acc_main",
    name: "Main Current Account",
    type: "current",
    institution: "Monzo",
    accountKind: "actual",
    currency: "GBP",
  });
  const financeData = financeDataFromEditedImport(assignedBatch);

  assert.equal(stagedBatch.balances.length, 1);
  assert.equal(stagedBatch.balances[0].balance, 96.79);
  assert.equal(financeData.balances.length, 1);
  assert.equal(financeData.balances[0].accountId, "acc_main");
  assert.equal(financeData.balances[0].sourceType, "monzo-csv");
  assert.equal(financeData.balances[0].sourceProvider, "monzo");
});

test("assignImportBatchAccount retargets staged rows to an existing account", async () => {
  const stagedBatch = normalizeImportBatch(
    await parseImportFile(fileFromText(monzoCsvText())),
  );
  const assignedBatch = assignImportBatchAccount(stagedBatch, {
    id: "acc_main",
    name: "Main Current Account",
    type: "current",
    institution: "Monzo",
    accountKind: "actual",
    currency: "GBP",
  });
  const financeData = financeDataFromEditedImport(assignedBatch);

  assert.equal(assignedBatch.accounts[0].id, "acc_main");
  assert.equal(assignedBatch.rows[0].account, "acc_main");
  assert.equal(financeData.accounts[0].id, "acc_main");
  assert.equal(financeData.transactions[0].account, "acc_main");
  assert.equal(financeData.imports[0].accountIds[0], "acc_main");
});

test("assignImportBatchAccount supports a newly created account", async () => {
  const stagedBatch = normalizeImportBatch(
    await parseImportFile(fileFromText(monzoCsvText())),
  );
  const assignedBatch = assignImportBatchAccount(stagedBatch, {
    id: "monzo:personal",
    name: "Monzo Personal",
    type: "current",
    institution: "Monzo",
    currency: "GBP",
  });
  const financeData = financeDataFromEditedImport(assignedBatch);

  assert.equal(financeData.accounts[0].name, "Monzo Personal");
  assert.equal(financeData.transactions[0].account, "monzo:personal");
});

test("combineImportBatches keeps one import record per selected file", async () => {
  const firstBatch = normalizeImportBatch(
    await parseImportFile(fileFromText(monzoCsvText("tx_1"), "october.csv")),
  );
  const secondBatch = normalizeImportBatch(
    await parseImportFile(fileFromText(monzoCsvText("tx_2"), "november.csv")),
  );
  const combinedBatch = assignImportBatchAccount(
    combineImportBatches([firstBatch, secondBatch]),
    {
      id: "acc_main",
      name: "Main Current Account",
      type: "current",
      institution: "Monzo",
      accountKind: "actual",
      currency: "GBP",
    },
  );
  const financeData = financeDataFromEditedImport(combinedBatch);

  assert.equal(combinedBatch.sourceFileCount, 2);
  assert.equal(combinedBatch.rows.length, 2);
  assert.equal(financeData.imports.length, 2);
  assert.deepEqual(
    financeData.imports.map((importRecord) => importRecord.fileName),
    ["october.csv", "november.csv"],
  );
  assert.deepEqual(
    financeData.imports.map((importRecord) => importRecord.transactionCount),
    [1, 1],
  );
});

test("mergeFinanceData checks every import record from a combined import", async () => {
  const firstBatch = assignImportBatchAccount(
    normalizeImportBatch(
      await parseImportFile(fileFromText(monzoCsvText("tx_1"), "october.csv")),
    ),
    {
      id: "acc_main",
      name: "Main Current Account",
      type: "current",
      institution: "Monzo",
      accountKind: "actual",
      currency: "GBP",
    },
  );
  const secondBatch = normalizeImportBatch(
    await parseImportFile(fileFromText(monzoCsvText("tx_2"), "november.csv")),
  );
  const existingData = financeDataFromEditedImport(firstBatch);
  const combinedData = financeDataFromEditedImport(
    assignImportBatchAccount(
      combineImportBatches([firstBatch, secondBatch]),
      {
        id: "acc_main",
        name: "Main Current Account",
        type: "current",
        institution: "Monzo",
        accountKind: "actual",
        currency: "GBP",
      },
    ),
  );

  assert.throws(
    () => mergeFinanceData(existingData, combinedData),
    DuplicateImportError,
  );
});

test("Monzo CSV pot transfers create actual child accounts and mirror transactions", async () => {
  const stagedBatch = normalizeImportBatch(
    await parseImportFile(fileFromText(monzoPotCsvText())),
  );
  const potAccount = stagedBatch.accounts.find(
    (account) => account.id === "monzo:pot:wardrobe",
  );
  const mainRows = stagedBatch.rows.filter((row) => row.accountRole === "main");
  const potRows = stagedBatch.rows.filter((row) => row.accountRole === "pot");

  assert.equal(potAccount.name, "Wardrobe");
  assert.equal(potAccount.type, "pot");
  assert.equal(potAccount.accountKind, "actual");
  assert.equal(potAccount.parentAccountId, "monzo:csv");
  assert.equal(mainRows.length, 2);
  assert.equal(potRows.length, 2);
  assert.equal(mainRows[0].amount, -200);
  assert.equal(potRows[0].amount, 200);
  assert.equal(mainRows[1].amount, 50);
  assert.equal(potRows[1].amount, -50);
  assert.equal(potRows[0].isGenerated, true);
  assert.equal(potRows[0].generatedFromId, mainRows[0].id);
});

test("assignImportBatchAccount preserves pot rows and reparents pot accounts", async () => {
  const stagedBatch = normalizeImportBatch(
    await parseImportFile(fileFromText(monzoPotCsvText())),
  );
  const assignedBatch = assignImportBatchAccount(stagedBatch, {
    id: "acc_main",
    name: "Main Current Account",
    type: "current",
    institution: "Monzo",
    accountKind: "actual",
    currency: "GBP",
  });
  const potAccount = assignedBatch.accounts.find(
    (account) => account.id === "monzo:pot:wardrobe",
  );
  const mainRow = assignedBatch.rows.find((row) => row.accountRole === "main");
  const potRow = assignedBatch.rows.find((row) => row.accountRole === "pot");
  const financeData = financeDataFromEditedImport(assignedBatch);

  assert.equal(potAccount.parentAccountId, "acc_main");
  assert.equal(mainRow.account, "acc_main");
  assert.equal(mainRow.transferAccount, "monzo:pot:wardrobe");
  assert.equal(potRow.account, "monzo:pot:wardrobe");
  assert.equal(potRow.transferAccount, "acc_main");
  assert.equal(financeData.accounts.length, 2);
  assert.equal(financeData.transactions.length, 4);
});

test("Monzo JSON pots import as actual child accounts", () => {
  const financeData = monzoJsonToFinanceData({
    fetchedAt: "2026-05-14T12:00:00.000Z",
    accounts: [
      {
        id: "acc_1",
        description: "Monzo Main",
        type: "uk_retail",
        balance: {
          currency: "GBP",
          balance_major: 100,
          total_balance_major: 300,
          spend_today_major: 0,
        },
        pots: [
          {
            id: "pot_1",
            name: "Wardrobe",
            currency: "GBP",
            balance_major: 200,
          },
        ],
        transactions: [],
      },
    ],
  });
  const potAccount = financeData.accounts.find(
    (account) => account.id === "monzo:pot:pot_1",
  );

  assert.equal(potAccount.accountKind, "actual");
  assert.equal(potAccount.parentAccountId, "monzo:acc_1");
  assert.equal(potAccount.manualBalance, 200);
});

test("manual balance snapshots override bank snapshots on the same day", async () => {
  const bankData = financeDataFromEditedImport(
    assignImportBatchAccount(
      normalizeImportBatch(await parseImportFile(fileFromText(monzoCsvWithBalanceText()))),
      {
        id: "acc_main",
        name: "Main Current Account",
        type: "current",
        institution: "Monzo",
        accountKind: "actual",
        currency: "GBP",
      },
    ),
  );
  const manualSnapshot = createManualBalanceSnapshot({
    accountId: "acc_main",
    date: "2023-10-15",
    balance: 120,
    currency: "GBP",
    notes: "Corrected against bank app",
  });
  const correctedData = normalizeFinanceData({
    ...bankData,
    balances: [...bankData.balances, manualSnapshot],
  });
  const appData = appDataFromFinanceData(correctedData);
  const account = appData.accounts.get("acc_main");
  const series = deriveDailyNetWorthSeries(correctedData, {
    startDate: "2023-10-15",
    endDate: "2023-10-15",
  });

  assert.equal(account.balance, 120);
  assert.equal(series[0].netWorth, 120);
});

test("account activity is derived from the current balance", () => {
  const appData = appDataFromFinanceData({
    accounts: [
      {
        id: "active_account",
        name: "Active Account",
        accountKind: "actual",
        currency: "GBP",
        openingBalance: 25,
      },
      {
        id: "inactive_account",
        name: "Inactive Account",
        accountKind: "actual",
        currency: "GBP",
        openingBalance: 25,
      },
    ],
    balances: [
      {
        id: "inactive_account:balance",
        accountId: "inactive_account",
        date: "2026-01-31",
        balance: 0,
        currency: "GBP",
        sourceType: "manual",
      },
    ],
  });

  assert.equal(appData.accounts.get("active_account").isActive, true);
  assert.equal(appData.accounts.get("active_account").isInactive, false);
  assert.equal(appData.accounts.get("inactive_account").balance, 0);
  assert.equal(appData.accounts.get("inactive_account").isActive, false);
  assert.equal(appData.accounts.get("inactive_account").isInactive, true);
});

test("daily net worth anchors forward from manual balance corrections", () => {
  const financeData = normalizeFinanceData({
    accounts: [
      {
        id: "acc_1",
        name: "Current Account",
        accountKind: "actual",
        currency: "GBP",
        openingBalance: 0,
      },
      {
        id: "acc_2",
        name: "Savings",
        accountKind: "actual",
        currency: "GBP",
        openingBalance: 100,
      },
    ],
    transactions: [
      {
        id: "txn_1",
        account: "acc_1",
        date: "2026-01-01",
        amount: 100,
      },
      {
        id: "txn_2",
        account: "acc_1",
        date: "2026-01-02",
        amount: -25,
      },
      {
        id: "txn_3",
        account: "acc_1",
        date: "2026-01-03",
        amount: 10,
      },
      {
        id: "txn_4",
        account: "acc_2",
        date: "2026-01-03",
        amount: -10,
      },
    ],
    balances: [
      {
        id: "bank:acc_1:2026-01-02",
        accountId: "acc_1",
        date: "2026-01-02",
        balance: 75,
        currency: "GBP",
        sourceType: "csv",
        sourceProvider: "bank",
        sourceId: "row_2",
      },
      createManualBalanceSnapshot({
        accountId: "acc_1",
        date: "2026-01-02",
        balance: 50,
        currency: "GBP",
      }),
    ],
  });
  const series = deriveDailyNetWorthSeries(financeData, {
    startDate: "2026-01-01",
    endDate: "2026-01-03",
  });

  assert.deepEqual(series, [
    { date: "2026-01-01", netWorth: 200 },
    { date: "2026-01-02", netWorth: 150 },
    { date: "2026-01-03", netWorth: 150 },
  ]);
});

test("PFA vault round trip preserves importRules", async () => {
  const stagedBatch = normalizeImportBatch(
    await parseImportFile(fileFromText(monzoCsvText())),
  );
  const rule = createImportRule({
    sourceType: "monzo-csv",
    match: { field: "merchant", operator: "wildcard", value: "grab*" },
    set: { category: "transport" },
  });
  const financeData = financeDataFromEditedImport(
    applyImportRules(stagedBatch, [rule]),
    { importRules: [rule] },
  );

  const vault = await createPfaVault(financeData, "test-password");
  const opened = await openPfaVault(vault, "test-password");

  assert.equal(opened.importRules.length, 1);
  assert.equal(opened.importRules[0].set.category, "transport");
});

test("PFA vault round trip preserves balance snapshots", async () => {
  const financeData = normalizeFinanceData({
    accounts: [
      {
        id: "acc_1",
        name: "Current Account",
        accountKind: "actual",
        currency: "GBP",
      },
    ],
    balances: [
      createManualBalanceSnapshot({
        accountId: "acc_1",
        date: "2026-05-10",
        balance: 123.45,
        currency: "GBP",
        notes: "Manual correction",
      }),
    ],
    transactions: [],
  });

  const vault = await createPfaVault(financeData, "test-password");
  const opened = await openPfaVault(vault, "test-password");

  assert.equal(opened.balances.length, 1);
  assert.equal(opened.balances[0].balance, 123.45);
  assert.equal(opened.balances[0].sourceType, "manual");
  assert.equal(opened.balances[0].notes, "Manual correction");
});

test("Trading 212 PDF adapter normalizes statement activity and snapshots", () => {
  const stagedBatch = normalizeTrading212Statement(trading212RawBatch());

  assert.equal(stagedBatch.sourceType, "trading212-pdf");
  assert.equal(stagedBatch.allowAccountRetarget, false);
  assert.equal(stagedBatch.accounts.length, 3);
  assert.equal(stagedBatch.balances.length, 3);
  assert.equal(stagedBatch.balances[0].balance, 4567.79);
  assert.match(stagedBatch.balances[0].notes, /Cash balance: GBP 4537\.24/u);
  assert.equal(stagedBatch.balances[1].balance, 50730.03);
  assert.match(stagedBatch.balances[0].notes, /QMMFs:/u);
  assert.equal(stagedBatch.rows.length, 5);
  assert.equal(stagedBatch.rows[0].description, "Interest on cash");
  assert.equal(stagedBatch.rows[0].amount, 0.5);
  assert.equal(stagedBatch.rows[1].description, "Card purchase");
  assert.equal(stagedBatch.rows[1].amount, -8);
  assert.equal(stagedBatch.rows[2].description, "Buy 10 SGLN");
  assert.equal(stagedBatch.rows[2].amount, -642.3);
  assert.equal(stagedBatch.investments.length, 2);
  assert.equal(stagedBatch.investments[0].id, "trading212:3266446:isin:IE00B4ND3602");
  assert.equal(stagedBatch.investments[0].currentValue, 2116.5);
  assert.equal(stagedBatch.valueHistory[0].date, "2026-01-31");
});

test("Trading 212 edited import persists investments and value history", () => {
  const stagedBatch = normalizeTrading212Statement(trading212RawBatch());
  const financeData = financeDataFromEditedImport(stagedBatch);
  const appData = appDataFromFinanceData(financeData);

  assert.equal(financeData.accounts.length, 3);
  assert.equal(financeData.transactions.length, 5);
  assert.equal(financeData.investments.length, 2);
  assert.equal(financeData.valueHistory.length, 2);
  assert.equal(financeData.imports[0].sourceType, "trading212-pdf");
  assert.equal(financeData.imports[0].fileHash, "hash-212");
  assert.equal(appData.user.netWorth, 55307.74);
});

test("PFA vault round trip preserves Trading 212 investment snapshots", async () => {
  const financeData = financeDataFromEditedImport(
    normalizeTrading212Statement(trading212RawBatch()),
  );
  const vault = await createPfaVault(financeData, "test-password");
  const opened = await openPfaVault(vault, "test-password");

  assert.equal(opened.investments.length, 2);
  assert.equal(opened.valueHistory.length, 2);
  assert.equal(opened.investments[0].provider, "Trading 212");
});

test("daily net worth includes investment value history", () => {
  const financeData = normalizeFinanceData({
    accounts: [
      {
        id: "cash",
        name: "Cash",
        accountKind: "actual",
        currency: "GBP",
      },
    ],
    balances: [
      {
        id: "cash:2026-01-31",
        accountId: "cash",
        date: "2026-01-31",
        balance: 100,
        currency: "GBP",
      },
    ],
    transactions: [],
    investments: [
      {
        id: "inv_1",
        name: "ETF",
        provider: "Trading 212",
        currency: "GBP",
        currentValue: 50,
      },
    ],
    valueHistory: [
      {
        id: "hist_1",
        entityType: "investment",
        entityId: "inv_1",
        date: "2026-01-31",
        value: 50,
      },
    ],
  });
  const series = deriveDailyNetWorthSeries(financeData, {
    startDate: "2026-01-31",
    endDate: "2026-01-31",
  });

  assert.deepEqual(series, [{ date: "2026-01-31", netWorth: 150 }]);
});

test("daily net worth does not double count Trading 212 account-valued positions", () => {
  const financeData = financeDataFromEditedImport(
    normalizeTrading212Statement(trading212RawBatch()),
  );
  const series = deriveDailyNetWorthSeries(financeData, {
    startDate: "2026-01-31",
    endDate: "2026-01-31",
  });

  assert.deepEqual(series, [{ date: "2026-01-31", netWorth: 55307.74 }]);
});

function monzoCsvText(transactionId = "tx_1") {
  return [
    "Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In",
    `${transactionId},15/10/2023,02:09:11,Card payment,Grab,🚕,Eating out,-3.21,GBP,-61000.00,IDR,"ride, late",Gedung,,Grab* A-123,,-3.21,`,
  ].join("\n");
}

function monzoCsvWithBalanceText() {
  return [
    "Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In,Balance",
    'tx_1,15/10/2023,02:09:11,Card payment,Grab,🚕,Eating out,-3.21,GBP,-61000.00,IDR,"ride, late",Gedung,,Grab* A-123,,-3.21,,96.79',
  ].join("\n");
}

function monzoPotCsvText() {
  return [
    "Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In",
    "tx_pot_1,01/01/2026,10:00:00,Pot transfer,Wardrobe Pot,,Transfers,-200.00,GBP,-200.00,GBP,,,,Moved to pot,,-200.00,",
    "tx_pot_2,02/01/2026,10:00:00,Pot transfer,Wardrobe Pot,,Transfers,50.00,GBP,50.00,GBP,,,,Moved from pot,,,50.00",
  ].join("\n");
}

function fileFromText(text, name = "monzo.csv") {
  const bytes = new TextEncoder().encode(text);

  return {
    name,
    text: async () => text,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function trading212RawBatch() {
  const pages = [
    [
      "Trading 212 Invest",
      "Account ID: 3104719",
      "Monthly statement",
      "Generated by Trading 212 UK Ltd. on 2 February 2026, covering from 31.12.2025 22:00 (UTC) to 31.01.2026 21:59 (UTC).",
      "Overview",
      "Trading 212 Stocks ISA Trading 212 Cash ISA",
      "Account ID: 3266446 Account ID: 32376833",
      "Trading 212 CFD",
      "Account ID: 3305085",
      "CUSTOMER ID",
      "0000000",
      "CUSTOMER NAME",
      "Example User",
      "Deposits £1,000.00",
      "Withdrawals £-1,300.27",
      "Dividends £0.00",
      "Interest on cash £14.34",
      "Cashback £15.00",
      "FX Fee £-0.02",
      "Third-party fees £0.00",
      "Account value £4,567.79",
      "Deposits £500.00",
      "Withdrawals £0.00",
      "Dividends £2.63",
      "Interest on cash £22.68",
      "FX Fee £-0.62",
      "Third-party fees £-0.29",
      "Account value £50,730.03",
      "Deposits £0.00",
      "Withdrawals £0.00",
      "Interest paid £0.03",
      "Account balance £9.92",
    ].join("\n"),
    [
      "Invest account - cash breakdown",
      "Total cash",
      "GBP cash 4537.24",
      "Settled cash in QMMFs",
      "JPMorgan Liquidity Funds - GBP Liquidity LVNAV Fund LU1747646625 GBP 717.74 1 717.74",
    ].join("\n"),
    [
      "Invest account - transactions and dividends",
      "Transactions",
      "TIME TYPE CURRENCY AMOUNT",
      "2026-01-01 02:01:50 Interest on cash GBP 0.50",
      "2026-01-07 14:36:21 Card purchase GBP -8.00",
      "Dividends",
      "INSTRUMENT ISIN",
      "No data available",
    ].join("\n"),
    [
      "Stocks ISA account - executed trades",
      "EXECUTION TIME INSTRUMENT ISIN INSTRUMENT CURRENCY ORDER ID DIRECTION QUANTITY EXECUTION PRICE VALUE FX RATE FX FEE RETURN VALUE",
      "2026-01-07 10:18:26 SGLN IE00B4ND3602 GBX 44550665211 Buy 10 6423 64230 100 0 0 642.30",
    ].join("\n"),
    [
      "Stocks ISA account - open positions summary",
      "INSTRUMENT ISIN INSTRUMENT CURRENCY QUANTITY AVERAGE PRICE PRICE RETURN VALUE FX RATE RETURN (GBP) VALUE (GBP)",
      "SGLN IE00B4ND3602 GBX 30 6304.66666667 7055 22510 2116.50",
      "AAPL US0378331005 USD 1.00673359 227.73651568 258.99 31.46 260.7339 1.36962 19.65 190.37",
    ].join("\n"),
    [
      "Stocks ISA account - cash breakdown",
      "Total cash",
      "GBP cash 7177.08",
    ].join("\n"),
    [
      "Cash ISA account - transactions",
      "Transactions",
      "TIME TYPE CURRENCY AMOUNT",
      "2026-01-03 02:25:56 Interest on cash GBP 0.03",
    ].join("\n"),
    [
      "Cash ISA account - cash breakdown",
      "Total cash",
      "GBP cash 9.92",
    ].join("\n"),
  ];

  return {
    adapterId: "trading212-pdf",
    sourceType: "trading212-pdf",
    sourceProvider: "trading212",
    fileName: "Trading 212 Monthly Statement Jan 2026.pdf",
    fileHash: "hash-212",
    importedAt: "2026-02-02T12:00:00.000Z",
    pageCount: pages.length,
    pages,
    statementText: pages.join("\n\n"),
  };
}
