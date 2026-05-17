import {
  downloadDummySpreadsheet,
  downloadSpreadsheetTemplate,
} from "@/data/createSpreadsheetTemplate";

import { Button } from "@/components/ui/button";

export function FileActions({
  csvInputRef,
  fileInputRef,
  monzoJsonInputRef,
  onCsvFileChange,
  onDownloadExcel,
  onDownloadPfa,
  onExcelFileChange,
  onMonzoJsonChange,
  onPfaFileChange,
  parsedData,
  pfaInputRef,
  setVaultPassword,
  vaultPassword,
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => downloadSpreadsheetTemplate("Rumit Mehta")}>
          Download template
        </Button>
        <Button
          variant="secondary"
          onClick={() => downloadDummySpreadsheet("Rumit Mehta Dummy")}
        >
          Download dummy spreadsheet
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current.click()}>
          Upload Excel
        </Button>
        <Button variant="outline" onClick={() => csvInputRef.current.click()}>
          Import CSV
        </Button>
        <Button
          variant="outline"
          onClick={() => monzoJsonInputRef.current.click()}
        >
          Import Monzo JSON
        </Button>
        <Button variant="outline" onClick={() => pfaInputRef.current.click()}>
          Open PFA
        </Button>
        <Button onClick={onDownloadPfa} disabled={!parsedData}>
          Save PFA
        </Button>
        <Button
          variant="secondary"
          onClick={onDownloadExcel}
          disabled={!parsedData}
        >
          Export Excel
        </Button>
      </div>

      <label className="mt-4 block max-w-sm text-sm">
        <span className="mb-1 block font-medium">Vault password</span>
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          onChange={(event) => setVaultPassword(event.target.value)}
          type="password"
          value={vaultPassword}
        />
      </label>

      <input
        accept=".xlsx"
        onChange={onExcelFileChange}
        ref={fileInputRef}
        type="file"
        hidden
      />
      <input
        accept=".csv"
        onChange={onCsvFileChange}
        ref={csvInputRef}
        type="file"
        hidden
      />
      <input
        accept=".pfa"
        onChange={onPfaFileChange}
        ref={pfaInputRef}
        type="file"
        hidden
      />
      <input
        accept=".json"
        onChange={onMonzoJsonChange}
        ref={monzoJsonInputRef}
        type="file"
        hidden
      />
    </>
  );
}
