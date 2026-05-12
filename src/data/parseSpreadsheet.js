import ExcelJS from "exceljs";
import { Account } from "../models/Account.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";

const REQUIRED_SHEETS = [
  "User",
  "Accounts",
  "Transactions",
  "Tags",
  "Investments",
  "ValueHistory",
  "Debts",
];
const SPREADSHEET_FILE_NAME_PATTERN =
  /^pf-[a-z0-9]+(?:-[a-z0-9]+)*-\d{14}\.xlsx$/i;

export async function parseSpreadsheet(file) {
  validateSpreadsheetFile(file);

  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();

  await workbook.xlsx.load(buffer);

  return parseWorkbook(workbook);
}

export function validateSpreadsheetFile(file) {
  const fileName = stringValue(file?.name);

  if (!fileName) {
    throw new Error("Missing spreadsheet file name.");
  }

  if (!SPREADSHEET_FILE_NAME_PATTERN.test(fileName)) {
    throw new Error(
      "Invalid spreadsheet file name. Expected pf-{name}-{YYYYMMDDHHMMSS}.xlsx",
    );
  }
}

export function parseWorkbook(workbook) {
  validateRequiredSheets(workbook);

  const userRow = readSheetRows(workbook, "User")[0] ?? {};
  const accountRows = readSheetRows(workbook, "Accounts");
  const transactionRows = readSheetRows(workbook, "Transactions");
  const tagRows = readSheetRows(workbook, "Tags");
  const investmentRows = readSheetRows(workbook, "Investments");
  const debtRows = readSheetRows(workbook, "Debts");
  const valueHistory = readSheetRows(workbook, "ValueHistory").map(
    parseHistoryRow,
  );
  const accounts = createAccounts(accountRows);
  const transactions = createTransactions(transactionRows, accounts);
  const investments = createValueMap(
    investmentRows,
    "investmentId",
    "currentValue",
  );
  const debts = createValueMap(debtRows, "debtId", "currentValue");
  const user = new User({
    firstName: stringValue(userRow.firstName),
    lastName: stringValue(userRow.lastName),
    age: stringValue(userRow.age),
    accounts,
    investments,
    debts,
  });

  return {
    user,
    accounts,
    transactions,
    tags: createTags(tagRows),
    investments,
    debts,
    valueHistory,
    rawRows: {
      user: userRow,
      accounts: accountRows,
      transactions: transactionRows,
      tags: tagRows,
      investments: investmentRows,
      debts: debtRows,
      valueHistory,
    },
  };
}

function validateRequiredSheets(workbook) {
  const missingSheets = REQUIRED_SHEETS.filter((sheetName) => {
    return !workbook.getWorksheet(sheetName);
  });

  if (missingSheets.length > 0) {
    throw new Error(`Missing spreadsheet sheets: ${missingSheets.join(", ")}`);
  }
}

function readSheetRows(workbook, sheetName) {
  const worksheet = workbook.getWorksheet(sheetName);
  const headerRow = worksheet.getRow(1);
  const headers = headerRow.values
    .slice(1)
    .map((header) => stringValue(header));
  const rows = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || isEmptyRow(row)) {
      return;
    }

    const rowObject = {};

    headers.forEach((header, index) => {
      rowObject[header] = cellValue(row.getCell(index + 1).value);
    });

    rows.push(rowObject);
  });

  return rows;
}

function createAccounts(accountRows) {
  const accounts = new Map();

  accountRows.forEach((row) => {
    const accountId = requiredString(row.accountId, "Accounts.accountId");
    const account = new Account({
      id: accountId,
      name: stringValue(row.name),
      type: stringValue(row.type),
      institution: stringValue(row.institution),
      currency: stringValue(row.currency) || "GBP",
      openingBalance: numberValue(row.openingBalance),
      manualBalance: optionalNumberValue(row.manualBalance),
    });

    accounts.set(accountId, account);
  });

  return accounts;
}

function createTransactions(transactionRows, accounts) {
  return transactionRows.map((row) => {
    const transactionId = requiredString(
      row.transactionId,
      "Transactions.transactionId",
    );
    const accountId = requiredString(row.accountId, "Transactions.accountId");
    const account = accounts.get(accountId);

    if (!account) {
      throw new Error(
        `Transaction ${transactionId} uses unknown account ${accountId}`,
      );
    }

    const transaction = new Transaction({
      id: transactionId,
      date: dateValue(row.date),
      description: stringValue(row.description),
      amount: numberValue(row.amount),
      category: stringValue(row.category),
      tag: stringValue(row.tagId),
      account: accountId,
      merchant: stringValue(row.merchant),
      notes: stringValue(row.notes),
    });

    account.addTransaction(transaction);

    return transaction;
  });
}

function createTags(tagRows) {
  return new Map(
    tagRows.map((row) => [
      requiredString(row.tagId, "Tags.tagId"),
      {
        id: stringValue(row.tagId),
        name: stringValue(row.name),
        description: stringValue(row.description),
      },
    ]),
  );
}

function createValueMap(rows, idColumn, valueColumn) {
  return new Map(
    rows.map((row) => [
      requiredString(row[idColumn], `${idColumn}`),
      numberValue(row[valueColumn]),
    ]),
  );
}

function parseHistoryRow(row) {
  return {
    id: requiredString(row.historyId, "ValueHistory.historyId"),
    entityType: requiredString(row.entityType, "ValueHistory.entityType"),
    entityId: requiredString(row.entityId, "ValueHistory.entityId"),
    date: dateValue(row.date),
    value: numberValue(row.value),
  };
}

function isEmptyRow(row) {
  return row.values
    .slice(1)
    .every((value) => stringValue(cellValue(value)) === "");
}

function cellValue(value) {
  if (value && typeof value === "object") {
    if ("result" in value) {
      return value.result;
    }

    if ("text" in value) {
      return value.text;
    }

    if ("hyperlink" in value) {
      return value.hyperlink;
    }

    if (value instanceof Date) {
      return value;
    }
  }

  return value;
}

function requiredString(value, label) {
  const text = stringValue(value);

  if (!text) {
    throw new Error(`Missing required value: ${label}`);
  }

  return text;
}

function stringValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function numberValue(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function optionalNumberValue(value) {
  if (stringValue(value) === "") {
    return null;
  }

  return numberValue(value);
}

function dateValue(value) {
  if (value instanceof Date) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return date;
}
