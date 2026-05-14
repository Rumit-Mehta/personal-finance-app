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
import { parseCsv } from "../src/data/imports/csv.js";
import {
  createPfaVault,
  openPfaVault,
} from "../src/data/vault/index.js";
import { monzoJsonToFinanceData } from "../src/data/vault/adapters/monzo.js";

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
  assert.equal(financeData.imports[0].transactionCount, 1);
  assert.equal(financeData.importRules[0].id, rule.id);
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

function monzoCsvText() {
  return [
    "Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In",
    'tx_1,15/10/2023,02:09:11,Card payment,Grab,🚕,Eating out,-3.21,GBP,-61000.00,IDR,"ride, late",Gedung,,Grab* A-123,,-3.21,',
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
