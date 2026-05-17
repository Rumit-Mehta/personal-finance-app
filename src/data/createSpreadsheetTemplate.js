import ExcelJS from "exceljs";

const MONEY_COLUMNS = new Set([
  "amount",
  "balance",
  "openingBalance",
  "manualBalance",
  "currentValue",
  "value",
]);
const DATE_COLUMNS = new Set(["date"]);
const MONEY_FORMAT = '"GBP" #,##0.00;[Red]-"GBP" #,##0.00';

const SHEETS = {
  user: {
    name: "User",
    columns: ["firstName", "lastName", "age"],
    rows: [["", "", ""]],
  },
  accounts: {
    name: "Accounts",
    columns: [
      "accountId",
      "name",
      "type",
      "institution",
      "accountKind",
      "parentAccountId",
      "currency",
      "openingBalance",
      "manualBalance",
    ],
    rows: [
      ["acc_001", "Current Account", "current", "", "actual", "", "GBP", 0, ""],
    ],
  },
  transactions: {
    name: "Transactions",
    columns: [
      "transactionId",
      "accountId",
      "date",
      "description",
      "amount",
      "category",
      "tagId",
      "merchant",
      "notes",
    ],
    rows: [["txn_001", "acc_001", "2026-05-10", "", 0, "", "tag_001", "", ""]],
  },
  balances: {
    name: "Balances",
    columns: [
      "balanceId",
      "accountId",
      "date",
      "balance",
      "currency",
      "sourceType",
      "sourceProvider",
      "sourceId",
      "notes",
    ],
    rows: [
      [
        "manual:acc_001:2026-05-10",
        "acc_001",
        "2026-05-10",
        0,
        "GBP",
        "manual",
        "user",
        "manual:acc_001:2026-05-10",
        "",
      ],
    ],
  },
  tags: {
    name: "Tags",
    columns: ["tagId", "name", "description"],
    rows: [
      ["tag_001", "Essential", "Required spending"],
      ["tag_002", "Optional", "Non-essential spending"],
      ["tag_003", "Recurring", "Repeats on a schedule"],
    ],
  },
  investments: {
    name: "Investments",
    columns: [
      "investmentId",
      "name",
      "type",
      "provider",
      "currency",
      "currentValue",
    ],
    rows: [["inv_001", "ISA", "ISA", "", "GBP", 0]],
  },
  valueHistory: {
    name: "ValueHistory",
    columns: ["historyId", "entityType", "entityId", "date", "value"],
    rows: [
      ["hist_001", "investment", "inv_001", "2026-05-10", 0],
      ["hist_002", "debt", "debt_001", "2026-05-10", 0],
    ],
  },
  debts: {
    name: "Debts",
    columns: ["debtId", "name", "type", "provider", "currency", "currentValue"],
    rows: [["debt_001", "", "", "", "GBP", 0]],
  },
};

export function createSpreadsheetTemplate() {
  return createWorkbook(Object.values(SHEETS));
}

export function createDummySpreadsheet() {
  const dummySheets = createDummySheetConfigs();

  return createWorkbook(dummySheets);
}

export async function downloadSpreadsheetTemplate(name = "template") {
  const workbook = createSpreadsheetTemplate();
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = createSpreadsheetTemplateFileName(name);
  link.click();

  URL.revokeObjectURL(url);
}

export async function downloadDummySpreadsheet(name = "dummy-data") {
  const workbook = createDummySpreadsheet();
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = createSpreadsheetTemplateFileName(name);
  link.click();

  URL.revokeObjectURL(url);
}

export async function createSpreadsheetTemplateArrayBuffer() {
  const workbook = createSpreadsheetTemplate();

  return workbook.xlsx.writeBuffer();
}

export async function createDummySpreadsheetArrayBuffer() {
  const workbook = createDummySpreadsheet();

  return workbook.xlsx.writeBuffer();
}

export function createSpreadsheetTemplateFileName(name = "template") {
  const safeName = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "")
    .replace(/[-:T]/g, "");

  return `pf-${safeName || "template"}-${timestamp}.xlsx`;
}

function createWorkbook(sheetConfigs) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Personal Finance App";
  workbook.created = new Date();

  sheetConfigs.forEach((sheetConfig) => {
    createWorksheet(workbook, sheetConfig);
  });

  return workbook;
}

function createWorksheet(workbook, { name, columns, rows }) {
  const worksheet = workbook.addWorksheet(name);

  worksheet.columns = columns.map((column) => ({
    header: column,
    key: column,
    width: Math.max(column.length + 2, 14),
  }));

  worksheet.addRows(rows);
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  formatWorksheet(worksheet, columns);

  return worksheet;
}

function formatWorksheet(worksheet, columns) {
  const headerRow = worksheet.getRow(1);

  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 22;

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  columns.forEach((columnName, index) => {
    const column = worksheet.getColumn(index + 1);

    if (MONEY_COLUMNS.has(columnName)) {
      column.numFmt = MONEY_FORMAT;
    }

    if (DATE_COLUMNS.has(columnName)) {
      column.numFmt = "yyyy-mm-dd";
    }
  });

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });

    if (rowNumber > 1) {
      row.alignment = { vertical: "middle" };
    }
  });

  formatTransactionAmounts(worksheet, columns);
}

function formatTransactionAmounts(worksheet, columns) {
  const amountColumnIndex = columns.indexOf("amount") + 1;

  if (worksheet.name !== "Transactions" || amountColumnIndex === 0) {
    return;
  }

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const amountCell = worksheet.getRow(rowNumber).getCell(amountColumnIndex);
    const amount = Number(amountCell.value);

    if (amount < 0) {
      amountCell.font = { color: { argb: "FFC0392B" } };
    }

    if (amount > 0) {
      amountCell.font = { color: { argb: "FF1E8449" } };
    }
  }

  if (typeof worksheet.addConditionalFormatting === "function") {
    const amountColumnLetter = columnNumberToName(amountColumnIndex);
    const amountRange = `${amountColumnLetter}2:${amountColumnLetter}${Math.max(
      worksheet.rowCount,
      2,
    )}`;

    worksheet.addConditionalFormatting({
      ref: amountRange,
      rules: [
        {
          type: "cellIs",
          operator: "lessThan",
          formulae: ["0"],
          style: { font: { color: { argb: "FFC0392B" } } },
        },
        {
          type: "cellIs",
          operator: "greaterThan",
          formulae: ["0"],
          style: { font: { color: { argb: "FF1E8449" } } },
        },
      ],
    });
  }
}

function columnNumberToName(columnNumber) {
  let name = "";
  let currentNumber = columnNumber;

  while (currentNumber > 0) {
    const remainder = (currentNumber - 1) % 26;

    name = String.fromCharCode(65 + remainder) + name;
    currentNumber = Math.floor((currentNumber - 1) / 26);
  }

  return name;
}

function createDummySheetConfigs() {
  const tags = [
    ["tag_001", "Essential", "Required spending"],
    ["tag_002", "Optional", "Non-essential spending"],
    ["tag_003", "Recurring", "Repeats on a schedule"],
    ["tag_004", "Work", "Employment or work-related money"],
    ["tag_005", "Travel", "Trips, commuting, and holidays"],
    ["tag_006", "Family", "Family-related spending"],
  ];
  const accounts = createDummyAccounts();
  const investments = createDummyInvestments();
  const debts = createDummyDebts();
  const transactions = createDummyTransactions(accounts, tags);
  const valueHistory = createDummyValueHistory(investments, debts);

  return [
    {
      ...SHEETS.user,
      rows: [["Rumit", "Mehta", 30]],
    },
    {
      ...SHEETS.accounts,
      rows: accounts,
    },
    {
      ...SHEETS.transactions,
      rows: transactions,
    },
    {
      ...SHEETS.balances,
      rows: [],
    },
    {
      ...SHEETS.tags,
      rows: tags,
    },
    {
      ...SHEETS.investments,
      rows: investments,
    },
    {
      ...SHEETS.valueHistory,
      rows: valueHistory,
    },
    {
      ...SHEETS.debts,
      rows: debts,
    },
  ];
}

function createDummyAccounts() {
  return [
    [
      "acc_001",
      "Monzo Current",
      "current",
      "Monzo",
      "actual",
      "",
      "GBP",
      1250,
      "",
    ],
    [
      "acc_002",
      "Monzo Holiday Pot",
      "pot",
      "Monzo",
      "virtual",
      "acc_001",
      "GBP",
      400,
      "",
    ],
    [
      "acc_003",
      "Starling Bills",
      "current",
      "Starling",
      "actual",
      "",
      "GBP",
      850,
      "",
    ],
    [
      "acc_004",
      "Barclays Salary",
      "current",
      "Barclays",
      "actual",
      "",
      "GBP",
      2100,
      "",
    ],
    [
      "acc_005",
      "Chase Spending",
      "current",
      "Chase",
      "actual",
      "",
      "GBP",
      600,
      "",
    ],
    [
      "acc_006",
      "Emergency Fund",
      "savings",
      "Marcus",
      "actual",
      "",
      "GBP",
      9000,
      "",
    ],
    [
      "acc_007",
      "Holiday Savings",
      "savings",
      "Monzo",
      "actual",
      "",
      "GBP",
      2400,
      "",
    ],
    [
      "acc_008",
      "House Deposit",
      "savings",
      "Nationwide",
      "actual",
      "",
      "GBP",
      18500,
      "",
    ],
    [
      "acc_009",
      "Cash ISA",
      "isa",
      "Virgin Money",
      "actual",
      "",
      "GBP",
      7000,
      "",
    ],
    [
      "acc_010",
      "Amex Cashback",
      "creditCard",
      "American Express",
      "actual",
      "",
      "GBP",
      0,
      "",
    ],
    [
      "acc_011",
      "Barclaycard",
      "creditCard",
      "Barclays",
      "actual",
      "",
      "GBP",
      0,
      "",
    ],
    [
      "acc_012",
      "Joint Account",
      "current",
      "Lloyds",
      "actual",
      "",
      "GBP",
      3200,
      "",
    ],
    [
      "acc_013",
      "Business Account",
      "business",
      "Revolut",
      "actual",
      "",
      "GBP",
      4800,
      "",
    ],
  ];
}

function createDummyInvestments() {
  return [
    ["inv_001", "Stocks and Shares ISA", "ISA", "Vanguard", "GBP", 18500],
    ["inv_002", "Workplace Pension", "Pension", "Aviva", "GBP", 42000],
    ["inv_003", "SIPP", "SIPP", "AJ Bell", "GBP", 9800],
    ["inv_004", "General Investment Account", "GIA", "Trading 212", "GBP", 7600],
    ["inv_005", "S&P 500 ETF", "ETF", "Vanguard", "GBP", 12300],
    ["inv_006", "Global All Cap", "Fund", "Vanguard", "GBP", 15400],
    ["inv_007", "Emerging Markets Fund", "Fund", "Fidelity", "GBP", 4300],
    ["inv_008", "Crypto Wallet", "Crypto", "Coinbase", "GBP", 2600],
    ["inv_009", "Premium Bonds", "Savings", "NS&I", "GBP", 5000],
    ["inv_010", "Company Shares", "Stocks", "Equiniti", "GBP", 6900],
    ["inv_011", "Lifetime ISA", "LISA", "Moneybox", "GBP", 11200],
    ["inv_012", "Junior ISA", "JISA", "Hargreaves Lansdown", "GBP", 3200],
  ];
}

function createDummyDebts() {
  return [
    ["debt_001", "Student Loan", "loan", "SLC", "GBP", 18500],
    ["debt_002", "Car Finance", "loan", "VW Finance", "GBP", 7200],
    ["debt_003", "Credit Card Balance", "creditCard", "Amex", "GBP", 950],
    ["debt_004", "Personal Loan", "loan", "Zopa", "GBP", 4200],
    ["debt_005", "Mortgage", "mortgage", "Nationwide", "GBP", 245000],
  ];
}

function createDummyTransactions(accounts, tags) {
  const merchants = [
    ["Salary", "Income", "tag_004", 3200, 5200],
    ["Tesco", "Groceries", "tag_001", -15, -140],
    ["Sainsbury's", "Groceries", "tag_001", -12, -130],
    ["TfL", "Transport", "tag_005", -2.8, -18],
    ["Shell", "Fuel", "tag_005", -35, -95],
    ["Netflix", "Subscriptions", "tag_003", -10.99, -17.99],
    ["Spotify", "Subscriptions", "tag_003", -9.99, -19.99],
    ["Rent", "Housing", "tag_001", -950, -1850],
    ["Council Tax", "Bills", "tag_001", -120, -260],
    ["Octopus Energy", "Bills", "tag_001", -70, -220],
    ["Pret", "Eating Out", "tag_002", -4.5, -18],
    ["Amazon", "Shopping", "tag_002", -8, -160],
    ["Gym", "Health", "tag_003", -25, -65],
    ["Freelance Client", "Income", "tag_004", 150, 1200],
    ["Trainline", "Travel", "tag_005", -18, -180],
    ["Pharmacy", "Health", "tag_001", -5, -45],
    ["Family Gift", "Family", "tag_006", -20, -250],
  ];
  const rows = [];
  const random = createSeededRandom(20260510);
  const startDate = new Date("2024-01-01T00:00:00.000Z");
  const dayCount = 850;

  for (let index = 0; index < 720; index += 1) {
    const account = pick(accounts, random);
    const merchantConfig = pick(merchants, random);
    const date = addDays(startDate, Math.floor(random() * dayCount));
    const amount = randomMoney(merchantConfig[3], merchantConfig[4], random);

    rows.push([
      `txn_${String(index + 1).padStart(4, "0")}`,
      account[0],
      formatDate(date),
      merchantConfig[0],
      amount,
      merchantConfig[1],
      merchantConfig[2] ?? pick(tags, random)[0],
      merchantConfig[0],
      "",
    ]);
  }

  rows.sort((a, b) => a[2].localeCompare(b[2]));

  return rows;
}

function createDummyValueHistory(investments, debts) {
  const rows = [];
  const random = createSeededRandom(10052026);
  let historyIndex = 1;

  investments.forEach((investment) => {
    const currentValue = Number(investment[5]);
    const monthlyValues = createMonthlyValues(currentValue, 36, 0.012, random);

    monthlyValues.forEach(([date, value]) => {
      rows.push([
        `hist_${String(historyIndex).padStart(4, "0")}`,
        "investment",
        investment[0],
        date,
        value,
      ]);
      historyIndex += 1;
    });
  });

  debts.forEach((debt) => {
    const currentValue = Number(debt[5]);
    const monthlyValues = createMonthlyValues(currentValue, 36, -0.006, random);

    monthlyValues.forEach(([date, value]) => {
      rows.push([
        `hist_${String(historyIndex).padStart(4, "0")}`,
        "debt",
        debt[0],
        date,
        value,
      ]);
      historyIndex += 1;
    });
  });

  return rows;
}

function createMonthlyValues(currentValue, monthCount, monthlyTrend, random) {
  const rows = [];
  const today = new Date();
  let value = currentValue / (1 + monthlyTrend * monthCount);

  for (let index = monthCount - 1; index >= 0; index -= 1) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - index, 1),
    );
    const movement = 1 + monthlyTrend + (random() - 0.5) * 0.04;

    value = Math.max(0, value * movement);
    rows.push([formatDate(date), roundMoney(value)]);
  }

  rows[rows.length - 1][1] = currentValue;

  return rows;
}

function createSeededRandom(seed) {
  let value = seed;

  return function random() {
    value = (value * 1664525 + 1013904223) % 4294967296;

    return value / 4294967296;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

function addDays(date, days) {
  const nextDate = new Date(date);

  nextDate.setUTCDate(nextDate.getUTCDate() + days);

  return nextDate;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function randomMoney(min, max, random) {
  return roundMoney(min + random() * (max - min));
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}
