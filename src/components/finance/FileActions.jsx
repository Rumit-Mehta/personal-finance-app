import { Button } from "@/components/ui/button";

export function FileActions({
  onDownloadExcel,
  onDownloadPfa,
  onImportFileChange,
  onPfaFileChange,
  onVaultPasswordChange,
  importInputRef,
  parsedData,
  pfaInputRef,
  vaultPasswordInputRef,
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => importInputRef.current.click()}>
          Import Files
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
          onChange={(event) => onVaultPasswordChange(event.target.value)}
          ref={vaultPasswordInputRef}
          type="password"
        />
      </label>

      <input
        accept=".xlsx,.csv,.pdf,.json"
        multiple
        onChange={onImportFileChange}
        ref={importInputRef}
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
    </>
  );
}
