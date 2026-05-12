import ExcelJS from "exceljs";
import { createSpreadsheetTemplateFileName } from "./createSpreadsheetTemplate.js";

const SHEETS = {
  user: {
    name: "User",
    columns: ["firstName", "lastName", "age"],
  },
  accounts: {
    name: "Accounts",
    columns: [
      "accountId",
      "name",
      "type",
      "institution",
      "currency",
      "openingBalance",
      "manualBalance",
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
  },
  tags: {
    name: "Tags",
    columns: ["tagId", "name", "description"],
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
  },
  valueHistory: {
    name: "ValueHistory",
    columns: ["historyId", "entityType", "entityId", "date", "value"],
  },
  debts: {
    name: "Debts",
    columns: ["debtId", "name", "type", "provider", "currency", "currentValue"],
  },
};
const MONEY_COLUMNS = new Set([
  "amount",
  "openingBalance",
  "manualBalance",
  "currentValue",
  "value",
]);
const DATE_COLUMNS = new Set(["date"]);
const MONEY_FORMAT = '"GBP" #,##0.00;[Red]-"GBP" #,##0.00';

export function createUpdatedSpreadsheet(data) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Personal Finance App";
  workbook.modified = new Date();

  createWorksheet(workbook, SHEETS.user, createUserRows(data));
  createWorksheet(workbook, SHEETS.accounts, createAccountRows(data));
  createWorksheet(workbook, SHEETS.transactions, createTransactionRows(data));
  createWorksheet(workbook, SHEETS.tags, createTagRows(data));
  createWorksheet(workbook, SHEETS.investments, createInvestmentRows(data));
  createWorksheet(workbook, SHEETS.valueHistory, createValueHistoryRows(data));
  createWorksheet(workbook, SHEETS.debts, createDebtRows(data));

  return workbook;
}

export async function createUpdatedSpreadsheetArrayBuffer(data) {
  const workbook = createUpdatedSpreadsheet(data);

  return workbook.xlsx.writeBuffer();
}

export async function downloadUpdatedSpreadsheet(data, name = "updated") {
  const buffer = await createUpdatedSpreadsheetArrayBuffer(data);
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

function createUserRows({ user } = {}) {
  return [[user?.firstName ?? "", user?.lastName ?? "", user?.age ?? ""]];
}

function createAccountRows({ accounts } = {}) {
  return [...toMap(accounts).values()].map((account) => [
    account.id,
    account.name,
    account.type,
    account.institution,
    account.currency,
    account.openingBalance,
    account.manualBalance ?? "",
  ]);
}

function createTransactionRows({ transactions } = {}) {
  return toArray(transactions).map((transaction) => [
    transaction.id,
    transaction.account,
    formatDate(transaction.date),
    transaction.description,
    transaction.amount,
    transaction.category,
    transaction.tag,
    transaction.merchant,
    transaction.notes,
  ]);
}

function createTagRows({ tags, rawRows } = {}) {
  if (toMap(tags).size > 0) {
    return [...toMap(tags).values()].map((tag) => [
      tag.id,
      tag.name,
      tag.description,
    ]);
  }

  return rowsFromRaw(rawRows?.tags, SHEETS.tags.columns);
}

function createInvestmentRows({ investments, rawRows } = {}) {
  const investmentMap = toMap(investments);
  const rawInvestmentRows = rowsFromRaw(
    rawRows?.investments,
    SHEETS.investments.columns,
  );

  if (rawInvestmentRows.length > 0) {
    return rawInvestmentRows.map((row) => {
      const investmentId = row[0];
      const currentValue = investmentMap.has(investmentId)
        ? investmentMap.get(investmentId)
        : row[5];

      return [...row.slice(0, 5), currentValue];
    });
  }

  return [...investmentMap.entries()].map(([investmentId, currentValue]) => [
    investmentId,
    "",
    "",
    "",
    "GBP",
    currentValue,
  ]);
}

function createValueHistoryRows({ valueHistory, rawRows } = {}) {
  const historyRows = toArray(valueHistory);

  if (historyRows.length > 0) {
    return historyRows.map((history) => [
      history.id,
      history.entityType,
      history.entityId,
      formatDate(history.date),
      history.value,
    ]);
  }

  return rowsFromRaw(rawRows?.valueHistory, SHEETS.valueHistory.columns);
}

function createDebtRows({ debts, rawRows } = {}) {
  const debtMap = toMap(debts);
  const rawDebtRows = rowsFromRaw(rawRows?.debts, SHEETS.debts.columns);

  if (rawDebtRows.length > 0) {
    return rawDebtRows.map((row) => {
      const debtId = row[0];
      const currentValue = debtMap.has(debtId) ? debtMap.get(debtId) : row[5];

      return [...row.slice(0, 5), currentValue];
    });
  }

  return [...debtMap.entries()].map(([debtId, currentValue]) => [
    debtId,
    "",
    "",
    "",
    "GBP",
    currentValue,
  ]);
}

function createWorksheet(workbook, { name, columns }, rows) {
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

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
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
}

function rowsFromRaw(rawRows = [], columns) {
  return rawRows.map((row) => columns.map((column) => row[column] ?? ""));
}

function toMap(value) {
  if (value instanceof Map) {
    return value;
  }

  return new Map(Object.entries(value ?? {}));
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}
