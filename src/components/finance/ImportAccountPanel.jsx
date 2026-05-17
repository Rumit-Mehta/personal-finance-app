export function ImportAccountPanel({
  importAccountMode,
  importAccountOptions,
  newAccountDraft,
  onImportAccountModeChange,
  onNewAccountDraftChange,
  onSelectedImportAccountChange,
  selectedImportAccountId,
}) {
  return (
    <div className="account-panel">
      <label>
        <span>Import account</span>
        <select
          onChange={(event) => onImportAccountModeChange(event.target.value)}
          value={importAccountMode}
        >
          <option disabled={importAccountOptions.length === 0} value="existing">
            Existing account
          </option>
          <option value="create">New account</option>
        </select>
      </label>

      {importAccountMode === "existing" ? (
        <label className="account-panel-wide">
          <span>Account</span>
          <select
            onChange={(event) =>
              onSelectedImportAccountChange(event.target.value)
            }
            value={selectedImportAccountId}
          >
            {importAccountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name || account.id}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label>
            <span>Account ID</span>
            <input
              onChange={(event) =>
                onNewAccountDraftChange("id", event.target.value)
              }
              value={newAccountDraft.id}
            />
          </label>
          <label>
            <span>Name</span>
            <input
              onChange={(event) =>
                onNewAccountDraftChange("name", event.target.value)
              }
              value={newAccountDraft.name}
            />
          </label>
          <label>
            <span>Type</span>
            <input
              onChange={(event) =>
                onNewAccountDraftChange("type", event.target.value)
              }
              value={newAccountDraft.type}
            />
          </label>
          <label>
            <span>Institution</span>
            <input
              onChange={(event) =>
                onNewAccountDraftChange("institution", event.target.value)
              }
              value={newAccountDraft.institution}
            />
          </label>
          <label>
            <span>Currency</span>
            <input
              onChange={(event) =>
                onNewAccountDraftChange("currency", event.target.value)
              }
              value={newAccountDraft.currency}
            />
          </label>
        </>
      )}
    </div>
  );
}
