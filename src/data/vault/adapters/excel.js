import {
  createUpdatedSpreadsheetArrayBuffer,
  downloadUpdatedSpreadsheet,
} from "../../updateSpreadsheet.js";
import { parseSpreadsheet } from "../../parseSpreadsheet.js";
import {
  appDataFromFinanceData,
  createImportRecord,
  financeDataFromAppData,
} from "../financeData.js";
import { hashInput } from "../hash.js";

export async function excelFileToFinanceData(file) {
  const parsedData = await parseSpreadsheet(file);
  const fileHash = await hashInput(file);
  const financeData = financeDataFromAppData(parsedData, {
    source: "excel",
  });
  const importRecord = createImportRecord({
    sourceType: "excel",
    fileHash,
    fileName: file?.name,
    transactionCount: financeData.transactions.length,
    accountIds: financeData.accounts.map((account) => account.id),
  });

  return {
    ...financeData,
    transactions: financeData.transactions.map((transaction) => ({
      ...transaction,
      sourceType: transaction.sourceType || "excel",
      sourceId: transaction.sourceId || transaction.id,
    })),
    imports: [importRecord],
  };
}

export async function financeDataToExcelArrayBuffer(financeData) {
  return createUpdatedSpreadsheetArrayBuffer(appDataFromFinanceData(financeData));
}

export async function downloadFinanceDataExcel(financeData, name = "vault") {
  return downloadUpdatedSpreadsheet(appDataFromFinanceData(financeData), name);
}
