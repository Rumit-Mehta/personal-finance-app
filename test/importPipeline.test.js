import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import {
  applyImportRules,
  assignImportBatchAccount,
  createImportRule,
  financeDataFromEditedImport,
  normalizeImportBatch,
  parseImportFile,
} from "../src/data/imports/index.js";
import {
  deriveDailyAccountNetWorthStackSeries,
  deriveDailyNetWorthSeries,
} from "../src/data/balanceHistory.js";
import { parseCsv } from "../src/data/imports/csv.js";
import {
  appDataFromFinanceData,
  createManualBalanceSnapshot,
  createPfaVault,
  mergeFinanceData,
  normalizeFinanceData,
  openPfaVault,
} from "../src/data/vault/index.js";
import { monzoJsonToFinanceData } from "../src/data/vault/adapters/monzo.js";
import {
  normalizeTrading212Statement,
  trading212PdfAdapter,
} from "../src/data/imports/adapters/trading212Pdf.js";

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
      {
        id: "rounded_zero_account",
        name: "Rounded Zero Account",
        accountKind: "actual",
        currency: "GBP",
        openingBalance: 0.1 + 0.2 - 0.3,
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
  assert.equal(appData.accounts.get("rounded_zero_account").balance > 0, true);
  assert.equal(appData.accounts.get("rounded_zero_account").isActive, false);
  assert.equal(appData.accounts.get("rounded_zero_account").isInactive, true);
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

test("daily account net worth stack keeps accounts separate with institution metadata", () => {
  const financeData = normalizeFinanceData({
    accounts: [
      {
        id: "acc_current",
        name: "Current",
        institution: "Monzo",
        accountKind: "actual",
        currency: "GBP",
        openingBalance: 100,
      },
      {
        id: "acc_pot",
        name: "Holiday Pot",
        institution: "Monzo",
        accountKind: "actual",
        currency: "GBP",
        openingBalance: 20,
      },
      {
        id: "budget",
        name: "Budget envelope",
        institution: "Planning",
        accountKind: "virtual",
        currency: "GBP",
        openingBalance: 999,
      },
    ],
    transactions: [
      {
        id: "txn_current",
        account: "acc_current",
        date: "2026-01-02",
        amount: -25,
      },
      {
        id: "txn_pot",
        account: "acc_pot",
        date: "2026-01-02",
        amount: 5,
      },
      {
        id: "txn_virtual",
        account: "budget",
        date: "2026-01-02",
        amount: 1000,
      },
    ],
    balances: [
      createManualBalanceSnapshot({
        accountId: "acc_current",
        date: "2026-01-02",
        balance: 60,
        currency: "GBP",
      }),
    ],
  });
  const stack = deriveDailyAccountNetWorthStackSeries(financeData, {
    startDate: "2026-01-01",
    endDate: "2026-01-02",
  });

  assert.deepEqual(stack.keys, ["account:acc_current", "account:acc_pot"]);
  assert.equal(stack.seriesMeta["account:acc_current"].label, "Current");
  assert.equal(stack.seriesMeta["account:acc_current"].group, "Monzo");
  assert.equal(stack.seriesMeta["account:acc_pot"].group, "Monzo");
  assert.match(stack.seriesMeta["account:acc_current"].color, /^hsl\(\d+ 72% 40%\)$/u);
  assert.match(stack.seriesMeta["account:acc_pot"].color, /^hsl\(\d+ 72% 48%\)$/u);
  assert.equal(stack.data[0]["account:acc_current"], 100);
  assert.equal(stack.data[0]["account:acc_pot"], 20);
  assert.equal(stack.data[0].values["account:acc_current"], 100);
  assert.equal(stack.data[0].total, 120);
  assert.equal(stack.data[1]["account:acc_current"], 60);
  assert.equal(stack.data[1]["account:acc_pot"], 25);
  assert.equal(stack.data[1].total, 85);
});

test("daily account net worth stack includes investment providers without Trading 212 double counting", () => {
  const financeData = normalizeFinanceData({
    accounts: [
      {
        id: "cash",
        name: "Cash",
        institution: "Bank",
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
    investments: [
      {
        id: "inv_1",
        name: "ETF",
        provider: "Vanguard",
        currency: "GBP",
        currentValue: 50,
      },
      {
        id: "inv_2",
        name: "Bond",
        provider: "Vanguard",
        currency: "GBP",
        currentValue: 25,
      },
      {
        id: "trading212:position",
        name: "Trading 212 position",
        provider: "Trading 212",
        currency: "GBP",
        currentValue: 999,
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
      {
        id: "hist_2",
        entityType: "investment",
        entityId: "inv_2",
        date: "2026-01-31",
        value: 25,
      },
      {
        id: "hist_3",
        entityType: "investment",
        entityId: "trading212:position",
        date: "2026-01-31",
        value: 999,
      },
    ],
  });
  const stack = deriveDailyAccountNetWorthStackSeries(financeData, {
    startDate: "2026-01-31",
    endDate: "2026-01-31",
  });

  assert.deepEqual(stack.keys, ["account:cash", "investment:Vanguard"]);
  assert.equal(stack.seriesMeta["investment:Vanguard"].label, "Vanguard investments");
  assert.equal(stack.data[0]["investment:Vanguard"], 75);
  assert.equal(stack.data[0].total, 175);
  assert.equal(stack.seriesMeta["investment:Trading 212"], undefined);
});

test("daily account net worth stack preserves negative account totals", () => {
  const financeData = normalizeFinanceData({
    accounts: [
      {
        id: "savings",
        name: "Savings",
        institution: "Bank",
        accountKind: "actual",
        currency: "GBP",
      },
      {
        id: "overdraft",
        name: "Overdraft",
        institution: "Bank",
        accountKind: "actual",
        currency: "GBP",
      },
    ],
    balances: [
      {
        id: "savings:2026-01-31",
        accountId: "savings",
        date: "2026-01-31",
        balance: 100,
        currency: "GBP",
      },
      {
        id: "overdraft:2026-01-31",
        accountId: "overdraft",
        date: "2026-01-31",
        balance: -50,
        currency: "GBP",
      },
    ],
  });
  const stack = deriveDailyAccountNetWorthStackSeries(financeData, {
    startDate: "2026-01-31",
    endDate: "2026-01-31",
  });

  assert.equal(stack.data[0].positiveTotal, 100);
  assert.equal(stack.data[0].negativeTotal, -50);
  assert.equal(stack.data[0].total, 50);
  assert.equal(stack.data[0]["account:overdraft"], -50);
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

test("Trading 212 PDF adapter dates monthly activity statements at month end", () => {
  const rawBatch = trading212RawBatch();
  rawBatch.pages[0] = rawBatch.pages[0].replace(
    "Generated by Trading 212 UK Ltd. on 2 February 2026, covering from 31.12.2025 22:00 (UTC) to 31.01.2026 21:59 (UTC).",
    "Generated by Trading 212 UK Ltd. on 1 February 2025, covering all January 2025 activity and accurate to 22:00 (UTC) on the last day of the month.",
  );
  rawBatch.statementText = rawBatch.pages.join("\n\n");

  const stagedBatch = normalizeTrading212Statement(rawBatch);

  assert.equal(stagedBatch.statement.generatedAt, "2025-02-01");
  assert.equal(stagedBatch.statement.periodStart, "2025-01-01T00:00:00.000Z");
  assert.equal(stagedBatch.statement.periodEnd, "2025-01-31T22:00:00.000Z");
  assert.equal(stagedBatch.statement.statementDate, "2025-01-31");
  assert.equal(stagedBatch.balances[0].date, "2025-01-31");
  assert.equal(stagedBatch.valueHistory[0].date, "2025-01-31");
});

test("Trading 212 PDF adapter detects monthly and annual statements", () => {
  assert.equal(trading212PdfAdapter.detect({ text: trading212RawBatch().statementText }), true);
  assert.equal(trading212PdfAdapter.detect({ text: trading212AnnualRawBatch().statementText }), true);
});

test("Trading 212 annual PDF adapter normalizes year-end balances only", () => {
  const stagedBatch = normalizeTrading212Statement(trading212AnnualRawBatch());
  const balancesByAccountId = new Map(
    stagedBatch.balances.map((balance) => [balance.accountId, balance]),
  );

  assert.equal(stagedBatch.sourceType, "trading212-pdf");
  assert.equal(stagedBatch.allowAccountRetarget, false);
  assert.equal(stagedBatch.statement.periodStart, "2022-04-05T22:00:00.000Z");
  assert.equal(stagedBatch.statement.periodEnd, "2023-04-05T22:00:00.000Z");
  assert.equal(stagedBatch.statement.statementDate, "2023-04-05");
  assert.equal(stagedBatch.accounts.length, 4);
  assert.equal(stagedBatch.balances.length, 4);
  assert.equal(balancesByAccountId.get("trading212:3104719").balance, 7.16);
  assert.equal(balancesByAccountId.get("trading212:3305085").balance, 0.03);
  assert.equal(balancesByAccountId.get("trading212:3266446").balance, 28523.17);
  assert.equal(balancesByAccountId.get("trading212:32376833").balance, 0);
  assert.equal(balancesByAccountId.get("trading212:3104719").date, "2023-04-05");
  assert.match(balancesByAccountId.get("trading212:3104719").notes, /annual statement/u);
  assert.equal(stagedBatch.rows.length, 0);
  assert.equal(stagedBatch.investments.length, 0);
  assert.equal(stagedBatch.valueHistory.length, 0);
});

test("Trading 212 annual and monthly imports merge into the same accounts", () => {
  const monthlyData = financeDataFromEditedImport(
    normalizeTrading212Statement(trading212RawBatch()),
  );
  const annualData = financeDataFromEditedImport(
    normalizeTrading212Statement(trading212AnnualRawBatch()),
  );
  const merged = mergeFinanceData(monthlyData, annualData);
  const tradingAccounts = merged.accounts.filter((account) =>
    account.id.startsWith("trading212:"),
  );
  const investBalances = merged.balances.filter(
    (balance) => balance.accountId === "trading212:3104719",
  );

  assert.equal(tradingAccounts.length, 4);
  assert.equal(
    tradingAccounts.filter((account) => account.id === "trading212:3104719").length,
    1,
  );
  assert.equal(investBalances.length, 2);
  assert.equal(
    investBalances.some(
      (balance) => balance.date.slice(0, 10) === "2023-04-05" && balance.balance === 7.16,
    ),
    true,
  );
});

test("Trading 212 annual imports absorb legacy monthly fallback accounts", () => {
  const monthlyData = financeDataFromEditedImport(
    normalizeTrading212Statement(trading212RawBatchWithoutAccountIds()),
  );
  const annualData = financeDataFromEditedImport(
    normalizeTrading212Statement(trading212AnnualRawBatch()),
  );
  const merged = mergeFinanceData(monthlyData, annualData);
  const tradingAccounts = merged.accounts.filter((account) =>
    account.id.startsWith("trading212:"),
  );

  assert.equal(tradingAccounts.length, 4);
  assert.equal(merged.accounts.some((account) => account.id === "trading212:invest"), false);
  assert.equal(
    merged.balances.some((balance) => balance.accountId === "trading212:invest"),
    false,
  );
  assert.equal(
    merged.transactions.some((transaction) => transaction.account === "trading212:invest"),
    false,
  );
  assert.equal(
    merged.investments.some((investment) => investment.id.startsWith("trading212:stocks-isa:")),
    false,
  );
  assert.equal(
    merged.valueHistory.some((history) =>
      history.entityId.startsWith("trading212:stocks-isa:"),
    ),
    false,
  );
  assert.equal(
    merged.balances.some(
      (balance) =>
        balance.accountId === "trading212:3104719" &&
        balance.date.slice(0, 10) === "2026-01-31",
    ),
    true,
  );
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

function monzoCsvText() {
  return [
    "Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In",
    'tx_1,15/10/2023,02:09:11,Card payment,Grab,🚕,Eating out,-3.21,GBP,-61000.00,IDR,"ride, late",Gedung,,Grab* A-123,,-3.21,',
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

function trading212RawBatchWithoutAccountIds() {
  const rawBatch = trading212RawBatch();

  rawBatch.pages = rawBatch.pages.map((page) =>
    page
      .split("\n")
      .filter((line) => !line.includes("Account ID:"))
      .join("\n"),
  );
  rawBatch.statementText = rawBatch.pages.join("\n\n");

  return rawBatch;
}

function trading212AnnualRawBatch() {
  const pageRows = [
    [
      layoutRow(521, [[250, "Annual Statement - 2022 / 2023"]]),
      layoutRow(496, [[386, "Overview"]]),
      layoutRow(476, [
        [
          188,
          "This statement covers the period from 05.04.2022 at 22:00 (UTC) to 05.04.2023 at 22:00 (UTC). Results include applicable FX and third-party fees.",
        ],
      ]),
      layoutRow(429, [
        [30, "Trading 212 Invest"],
        [231, "Trading 212 CFD"],
        [432, "Trading 212 Stocks ISA"],
        [633, "Trading 212 Cash ISA"],
      ]),
      layoutRow(416, [
        [30, "Account ID: 3104719"],
        [231, "Account ID: 3305085"],
        [432, "Account ID: 3266446"],
        [633, "Account ID: 32376833"],
      ]),
      layoutRow(397, [
        [35, "Closed result"],
        [154, "\u00a3-0.02"],
        [236, "Closed result"],
        [356, "\u00a30.00"],
        [437, "Closed result"],
        [549, "\u00a3-6,828.37"],
        [638, "Account value"],
        [758, "\u00a30.00"],
      ]),
      layoutRow(376, [
        [35, "Net Dividends"],
        [156, "\u00a30.00"],
        [236, "Dividend adjustments"],
        [356, "\u00a30.00"],
        [437, "Net Dividends"],
        [557, "\u00a30.00"],
      ]),
      layoutRow(355, [
        [35, "Net distributions"],
        [156, "\u00a30.00"],
        [249, "Received"],
        [357, "\u00a30.00"],
        [437, "Net distributions"],
        [553, "\u00a3248.96"],
      ]),
      layoutRow(334, [
        [35, "Bonus"],
        [156, "\u00a37.20"],
        [249, "Deducted"],
        [357, "\u00a30.00"],
        [437, "Open result"],
        [549, "\u00a3-5,940.88"],
      ]),
      layoutRow(313, [
        [35, "Open result"],
        [156, "\u00a30.00"],
        [236, "Open result"],
        [356, "\u00a30.00"],
        [437, "Open result change"],
        [549, "\u00a3-1,620.62"],
      ]),
      layoutRow(293, [
        [35, "Open result change"],
        [156, "\u00a30.00"],
        [236, "Open result change"],
        [356, "\u00a30.00"],
        [437, "Number of disposals"],
        [562, "13"],
      ]),
      layoutRow(271, [
        [35, "Number of disposals"],
        [162, "1"],
        [236, "Overnight interest"],
        [356, "\u00a30.00"],
        [437, "Account value"],
        [548, "\u00a328,523.17"],
      ]),
      layoutRow(250, [
        [35, "Account value"],
        [155, "\u00a37.16"],
        [236, "Number of disposals"],
        [363, "0"],
      ]),
      layoutRow(231, [
        [236, "Account value"],
        [356, "\u00a30.03"],
      ]),
    ],
  ];
  const pages = pageRows.map((rows) =>
    rows
      .map((row) => row.items.map((item) => item.text).join(" "))
      .join("\n"),
  );

  return {
    adapterId: "trading212-pdf",
    sourceType: "trading212-pdf",
    sourceProvider: "trading212",
    fileName: "Trading 212 Annual Statement 2022.pdf",
    fileHash: "hash-212-annual",
    importedAt: "2023-04-06T12:00:00.000Z",
    pageCount: pages.length,
    pages,
    pageRows,
    statementText: pages.join("\n\n"),
  };
}

function layoutRow(y, entries) {
  return {
    y,
    items: entries.map(([x, text]) => ({ text, x, y })),
  };
}
