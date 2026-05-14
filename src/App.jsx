import { useEffect, useRef, useState } from "react";
import {
  downloadDummySpreadsheet,
  downloadSpreadsheetTemplate,
} from "./data/createSpreadsheetTemplate";
import { downloadUpdatedSpreadsheet } from "./data/updateSpreadsheet";
import {
  appDataFromFinanceData,
  createPfaVault,
  DuplicateImportError,
  financeDataFromAppData,
  mergeFinanceData,
  openPfaVault,
} from "./data/vault";
import {
  applyRulesToImportBatch,
  assignImportBatchAccount,
  countImportRuleMatches,
  createImportRule,
  financeDataFromEditedImport,
  importFileToEditedBatch,
} from "./data/imports";
import { excelFileToFinanceData } from "./data/vault/adapters/excel";
import { monzoJsonFileToFinanceData } from "./data/vault/adapters/monzo";
import { BarChartInteractive } from "@/components/charts/BarChartInteractive";
import { Button } from "@/components/ui/button";

const DEFAULT_RULE_DRAFT = {
  field: "merchant",
  operator: "wildcard",
  value: "grab*",
  category: "transport",
  tag: "",
  merchant: "",
  notes: "",
};
const DEFAULT_NEW_ACCOUNT_DRAFT = {
  id: "monzo:csv",
  name: "Monzo CSV",
  type: "current",
  institution: "Monzo",
  currency: "GBP",
};
const EDITABLE_IMPORT_FIELDS = ["category", "tag", "merchant", "notes"];

function App() {
  const fileInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const monzoJsonInputRef = useRef(null);
  const pfaInputRef = useRef(null);
  const [parsedData, setParsedData] = useState(null);
  const [vaultData, setVaultData] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importRules, setImportRules] = useState([]);
  const [importAccountMode, setImportAccountMode] = useState("create");
  const [selectedImportAccountId, setSelectedImportAccountId] = useState("");
  const [newAccountDraft, setNewAccountDraft] = useState(DEFAULT_NEW_ACCOUNT_DRAFT);
  const [ruleDraft, setRuleDraft] = useState(DEFAULT_RULE_DRAFT);
  const [vaultPassword, setVaultPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  function handleThemeToggle() {
    setTheme((currentTheme) =>
      currentTheme === "dark" ? "light" : "dark",
    );
  }

  async function handleFileChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    try {
      const nextVaultData = await excelFileToFinanceData(file);

      setCurrentData(nextVaultData, "Loaded Excel data into the vault model.");
      setImportPreview(null);
    } catch (parseError) {
      clearCurrentData();
      setError(parseError.message);
    } finally {
      event.target.value = "";
    }
  }

  async function handlePfaFileChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    try {
      requireVaultPassword();

      const nextVaultData = await openPfaVault(file, vaultPassword);

      setCurrentData(nextVaultData, "Opened encrypted PFA vault.");
      setImportPreview(null);
    } catch (openError) {
      setError(openError.message);
      setMessage("");
    } finally {
      event.target.value = "";
    }
  }

  async function handleMonzoJsonChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    try {
      const incomingVaultData = await monzoJsonFileToFinanceData(file);
      const nextVaultData = vaultData
        ? mergeFinanceData(
            currentVaultData(),
            incomingVaultData,
            incomingVaultData.imports[0],
          )
        : incomingVaultData;

      setCurrentData(nextVaultData, "Imported Monzo JSON into the vault model.");
    } catch (importError) {
      handleImportError(importError, "That Monzo JSON file has already been imported.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleCsvFileChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    try {
      const editedBatch = await importFileToEditedBatch(file, importRules);
      const suggestedAccount = defaultImportAccountFromBatch(editedBatch);
      const existingAccounts = accountOptionsFromParsedData(parsedData);
      const initialAccount = chooseInitialImportAccount(
        existingAccounts,
        suggestedAccount,
      );
      const initialMode = existingAccounts.length > 0 ? "existing" : "create";

      setImportAccountMode(initialMode);
      setSelectedImportAccountId(
        initialMode === "existing" ? initialAccount.id : "",
      );
      setNewAccountDraft(suggestedAccount);
      setImportPreview(assignImportBatchAccount(editedBatch, initialAccount));
      setError("");
      setMessage(
        `Prepared ${editedBatch.rows.length} ${editedBatch.sourceProvider} CSV transactions for review.`,
      );
    } catch (importError) {
      setImportPreview(null);
      setError(importError.message);
      setMessage("");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSaveImportPreview() {
    if (!importPreview) {
      return;
    }

    try {
      const assignedPreview = assignImportBatchAccount(
        importPreview,
        activeImportAccount(),
      );
      const incomingVaultData = financeDataFromEditedImport(assignedPreview, {
        importRules,
      });
      const existingVaultData = vaultData
        ? currentVaultData()
        : parsedData
          ? financeDataFromAppData(parsedData)
          : null;
      const nextVaultData = existingVaultData
        ? mergeFinanceData(
            { ...existingVaultData, importRules },
            incomingVaultData,
            incomingVaultData.imports[0],
          )
        : incomingVaultData;

      setCurrentData(nextVaultData, "Saved edited CSV import into the vault model.");
      setImportPreview(null);
    } catch (importError) {
      handleImportError(importError, "That CSV file has already been imported.");
    }
  }

  async function handleDownloadPfa() {
    try {
      requireVaultPassword();

      const nextVaultData = currentVaultData();
      const buffer = await createPfaVault(nextVaultData, vaultPassword);

      downloadArrayBuffer(buffer, "my-finances.pfa", "application/octet-stream");
      setCurrentData(nextVaultData, "Exported encrypted PFA vault.");
    } catch (downloadError) {
      setError(downloadError.message);
      setMessage("");
    }
  }

  async function handleDownloadExcel() {
    try {
      await downloadUpdatedSpreadsheet(appDataFromFinanceData(currentVaultData()));
      setError("");
      setMessage("Exported Excel workbook.");
    } catch (downloadError) {
      setError(downloadError.message);
      setMessage("");
    }
  }

  function handlePreviewFieldChange(rowId, field, value) {
    setImportPreview((currentPreview) => {
      if (!currentPreview) {
        return currentPreview;
      }

      return {
        ...currentPreview,
        rows: currentPreview.rows.map((row) =>
          row.id === rowId ? { ...row, [field]: value } : row,
        ),
      };
    });
  }

  function handleImportAccountModeChange(mode) {
    setImportAccountMode(mode);

    if (mode === "existing") {
      const account = importAccountOptions.find(
        (option) => option.id === selectedImportAccountId,
      );

      if (account) {
        retargetImportPreview(account);
      }

      return;
    }

    if (newAccountDraft.id.trim()) {
      retargetImportPreview(newAccountFromDraft(newAccountDraft));
    }
  }

  function handleSelectedImportAccountChange(accountId) {
    const account = importAccountOptions.find((option) => option.id === accountId);

    setSelectedImportAccountId(accountId);

    if (account) {
      retargetImportPreview(account);
    }
  }

  function handleNewAccountDraftChange(field, value) {
    const nextDraft = {
      ...newAccountDraft,
      [field]: value,
    };

    setNewAccountDraft(nextDraft);

    if (importAccountMode === "create" && nextDraft.id.trim()) {
      retargetImportPreview(newAccountFromDraft(nextDraft));
    }
  }

  function retargetImportPreview(account) {
    setImportPreview((currentPreview) =>
      currentPreview
        ? assignImportBatchAccount(currentPreview, account)
        : currentPreview,
    );
  }

  function handleRuleDraftChange(field, value) {
    setRuleDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  }

  function handleApplyDraftRule() {
    try {
      const rule = createRuleFromDraft();

      setImportPreview((currentPreview) =>
        currentPreview ? applyRulesToImportBatch(currentPreview, [rule]) : currentPreview,
      );
      setError("");
      setMessage(`Applied rule to ${bulkRuleMatchCount} staged transactions.`);
    } catch (ruleError) {
      setError(ruleError.message);
      setMessage("");
    }
  }

  function handleSaveDraftRule() {
    try {
      const rule = createRuleFromDraft();

      setImportRules((currentRules) => [
        ...currentRules,
        { ...rule, order: currentRules.length },
      ]);
      setImportPreview((currentPreview) =>
        currentPreview ? applyRulesToImportBatch(currentPreview, [rule]) : currentPreview,
      );
      setError("");
      setMessage(`Saved reusable rule and applied it to ${bulkRuleMatchCount} staged transactions.`);
    } catch (ruleError) {
      setError(ruleError.message);
      setMessage("");
    }
  }

  function createRuleFromDraft() {
    if (!importPreview) {
      throw new Error("Import a CSV file before creating a rule.");
    }

    const set = importRuleSetFromDraft(ruleDraft);

    if (!ruleDraft.field || !ruleDraft.value.trim()) {
      throw new Error("Choose a match field and value before applying a rule.");
    }

    if (Object.keys(set).length === 0) {
      throw new Error("Set at least one editable field for the rule.");
    }

    return createImportRule({
      name: `${ruleDraft.field} ${ruleDraft.operator} ${ruleDraft.value}`,
      sourceType: importPreview.sourceType,
      sourceProvider: importPreview.sourceProvider,
      order: importRules.length,
      match: {
        field: ruleDraft.field,
        operator: ruleDraft.operator,
        value: ruleDraft.value,
      },
      set,
    });
  }

  function currentVaultData() {
    if (vaultData) {
      return { ...vaultData, importRules };
    }

    if (parsedData) {
      return {
        ...financeDataFromAppData(parsedData),
        importRules,
      };
    }

    throw new Error("Load Excel, Monzo JSON, Monzo CSV, or a PFA vault first.");
  }

  function activeImportAccount() {
    if (importAccountMode === "existing") {
      const account = importAccountOptions.find(
        (option) => option.id === selectedImportAccountId,
      );

      if (!account) {
        throw new Error("Choose an existing account before saving the import.");
      }

      return account;
    }

    const account = newAccountFromDraft(newAccountDraft);

    if (importAccountOptions.some((option) => option.id === account.id)) {
      throw new Error(
        "That account id already exists. Choose the existing account or use a different id.",
      );
    }

    return account;
  }

  function setCurrentData(nextVaultData, nextMessage) {
    const normalizedRules = nextVaultData.importRules ?? [];

    setVaultData({ ...nextVaultData, importRules: normalizedRules });
    setParsedData(appDataFromFinanceData(nextVaultData));
    setImportRules(normalizedRules);
    setError("");
    setMessage(nextMessage);
  }

  function clearCurrentData() {
    setParsedData(null);
    setVaultData(null);
    setImportRules([]);
    setMessage("");
  }

  function requireVaultPassword() {
    if (!vaultPassword) {
      throw new Error("Enter a vault password first.");
    }
  }

  function handleImportError(importError, duplicateMessage) {
    if (importError instanceof DuplicateImportError) {
      setMessage(duplicateMessage);
      setError("");
      return;
    }

    setError(importError.message);
    setMessage("");
  }

  const accounts = parsedData ? [...parsedData.accounts.values()] : [];
  const importAccountOptions = accountOptionsFromParsedData(parsedData);
  const accountNames = parsedData ? parsedData.accounts : new Map();
  const transactions = parsedData ? parsedData.transactions.slice(0, 25) : [];
  const importPreviewAccountNames = createImportPreviewAccountNames(importPreview);
  const categorySuggestions = createCategorySuggestions(parsedData, importPreview, importRules);
  const draftRule = importPreview
    ? {
        sourceType: importPreview.sourceType,
        sourceProvider: importPreview.sourceProvider,
        match: {
          field: ruleDraft.field,
          operator: ruleDraft.operator,
          value: ruleDraft.value,
        },
        set: importRuleSetFromDraft(ruleDraft),
      }
    : null;
  const bulkRuleMatchCount = draftRule
    ? countImportRuleMatches(importPreview, draftRule)
    : 0;

  return (
    <main>
      <p className="mb-3 text-sm font-semibold text-muted-foreground">
        Welcome back, Rumit
      </p>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">
            Personal finance import
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Stage bank files, apply reusable rules, then save the edited data.
          </p>
        </div>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          onClick={handleThemeToggle}
          type="button"
        >
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </Button>
      </div>

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
        <Button onClick={handleDownloadPfa} disabled={!parsedData}>
          Save PFA
        </Button>
        <Button
          variant="secondary"
          onClick={handleDownloadExcel}
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
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
        hidden
      />
      <input
        accept=".csv"
        onChange={handleCsvFileChange}
        ref={csvInputRef}
        type="file"
        hidden
      />
      <input
        accept=".pfa"
        onChange={handlePfaFileChange}
        ref={pfaInputRef}
        type="file"
        hidden
      />
      <input
        accept=".json"
        onChange={handleMonzoJsonChange}
        ref={monzoJsonInputRef}
        type="file"
        hidden
      />

      <section>
        <h2>Charts</h2>
        <div className="grid gap-4">
          <BarChartInteractive />
        </div>
      </section>

      {message && <p className="status-message">{message}</p>}
      {error && <p className="status-error">{error}</p>}

      {importPreview && (
        <section>
          <div className="section-heading">
            <div>
              <h2>CSV Import Preview</h2>
              <p>
                {importPreview.rows.length} staged transactions from{" "}
                {importPreview.sourceProvider}.
              </p>
            </div>
            <Button onClick={handleSaveImportPreview}>Save Import</Button>
          </div>

          <div className="account-panel">
            <label>
              <span>Import account</span>
              <select
                onChange={(event) =>
                  handleImportAccountModeChange(event.target.value)
                }
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
                    handleSelectedImportAccountChange(event.target.value)
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
                      handleNewAccountDraftChange("id", event.target.value)
                    }
                    value={newAccountDraft.id}
                  />
                </label>
                <label>
                  <span>Name</span>
                  <input
                    onChange={(event) =>
                      handleNewAccountDraftChange("name", event.target.value)
                    }
                    value={newAccountDraft.name}
                  />
                </label>
                <label>
                  <span>Type</span>
                  <input
                    onChange={(event) =>
                      handleNewAccountDraftChange("type", event.target.value)
                    }
                    value={newAccountDraft.type}
                  />
                </label>
                <label>
                  <span>Institution</span>
                  <input
                    onChange={(event) =>
                      handleNewAccountDraftChange("institution", event.target.value)
                    }
                    value={newAccountDraft.institution}
                  />
                </label>
                <label>
                  <span>Currency</span>
                  <input
                    onChange={(event) =>
                      handleNewAccountDraftChange("currency", event.target.value)
                    }
                    value={newAccountDraft.currency}
                  />
                </label>
              </>
            )}
          </div>

          <div className="rule-panel">
            <label>
              <span>Match field</span>
              <select
                onChange={(event) => handleRuleDraftChange("field", event.target.value)}
                value={ruleDraft.field}
              >
                <option value="merchant">Merchant</option>
                <option value="description">Description</option>
                <option value="category">Category</option>
                <option value="type">Type</option>
                <option value="notes">Notes</option>
              </select>
            </label>
            <label>
              <span>Operator</span>
              <select
                onChange={(event) =>
                  handleRuleDraftChange("operator", event.target.value)
                }
                value={ruleDraft.operator}
              >
                <option value="wildcard">Wildcard</option>
                <option value="startsWith">Starts with</option>
                <option value="contains">Contains</option>
                <option value="equals">Equals</option>
              </select>
            </label>
            <label>
              <span>Match value</span>
              <input
                onChange={(event) => handleRuleDraftChange("value", event.target.value)}
                value={ruleDraft.value}
              />
            </label>
            <label>
              <span>Set category</span>
              <input
                list="category-suggestions"
                onChange={(event) =>
                  handleRuleDraftChange("category", event.target.value)
                }
                value={ruleDraft.category}
              />
            </label>
            <label>
              <span>Set tag</span>
              <input
                onChange={(event) => handleRuleDraftChange("tag", event.target.value)}
                value={ruleDraft.tag}
              />
            </label>
            <label>
              <span>Set merchant</span>
              <input
                onChange={(event) =>
                  handleRuleDraftChange("merchant", event.target.value)
                }
                value={ruleDraft.merchant}
              />
            </label>
            <label>
              <span>Set notes</span>
              <input
                onChange={(event) => handleRuleDraftChange("notes", event.target.value)}
                value={ruleDraft.notes}
              />
            </label>
            <div className="rule-panel-actions">
              <span>{bulkRuleMatchCount} matches</span>
              <Button variant="outline" onClick={handleApplyDraftRule}>
                Apply
              </Button>
              <Button variant="secondary" onClick={handleSaveDraftRule}>
                Save Rule
              </Button>
            </div>
          </div>

          {importRules.length > 0 && (
            <div className="saved-rules">
              <h3>Reusable rules</h3>
              <ul>
                {importRules.map((rule) => (
                  <li key={rule.id}>{formatRuleSummary(rule)}</li>
                ))}
              </ul>
            </div>
          )}

          <datalist id="category-suggestions">
            {categorySuggestions.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th>Tag</th>
                  <th>Merchant</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.description}</td>
                    <td>{formatCurrency(row.amount)}</td>
                    <td>{importPreviewAccountNames.get(row.account) ?? row.account}</td>
                    {EDITABLE_IMPORT_FIELDS.map((field) => (
                      <td key={field}>
                        <input
                          list={field === "category" ? "category-suggestions" : undefined}
                          onChange={(event) =>
                            handlePreviewFieldChange(row.id, field, event.target.value)
                          }
                          value={row[field]}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {parsedData && (
        <>
          <section>
            <h2>User</h2>
            <dl>
              <dt>Name</dt>
              <dd>{parsedData.user.fullName || "Unknown"}</dd>
              <dt>Accounts</dt>
              <dd>{parsedData.accounts.size}</dd>
              <dt>Transactions</dt>
              <dd>{parsedData.transactions.length}</dd>
              <dt>Reusable import rules</dt>
              <dd>{importRules.length}</dd>
              <dt>Net worth</dt>
              <dd>{formatCurrency(parsedData.user.netWorth)}</dd>
            </dl>
          </section>

          <section>
            <h2>Accounts</h2>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Institution</th>
                  <th>Kind</th>
                  <th>Parent</th>
                  <th>Balance</th>
                  <th>Transactions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td>{account.type}</td>
                    <td>{account.institution}</td>
                    <td>{account.accountKind}</td>
                    <td>
                      {account.parentAccountId
                        ? accountNames.get(account.parentAccountId)?.name ??
                          account.parentAccountId
                        : ""}
                    </td>
                    <td>{formatCurrency(account.balance)}</td>
                    <td>{account.transactionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Transactions Preview</h2>
            <p>Showing first {transactions.length} transactions.</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th>Tag</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.date)}</td>
                    <td>{transaction.description}</td>
                    <td>{transaction.account}</td>
                    <td>{transaction.category}</td>
                    <td>{transaction.tag}</td>
                    <td>{formatCurrency(transaction.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}

function importRuleSetFromDraft(ruleDraft) {
  const set = {};

  EDITABLE_IMPORT_FIELDS.forEach((field) => {
    const value = text(ruleDraft[field]);

    if (value) {
      set[field] = value;
    }
  });

  return set;
}

function createCategorySuggestions(parsedData, importPreview, importRules) {
  const categories = new Set();

  parsedData?.transactions.forEach((transaction) => {
    if (transaction.category) {
      categories.add(transaction.category);
    }
  });
  importPreview?.rows.forEach((row) => {
    if (row.category) {
      categories.add(row.category);
    }
  });
  importRules.forEach((rule) => {
    if (rule.set?.category) {
      categories.add(rule.set.category);
    }
  });

  return [...categories].sort((left, right) => left.localeCompare(right));
}

function createImportPreviewAccountNames(importPreview) {
  return new Map(
    (importPreview?.accounts ?? []).map((account) => [
      account.id,
      account.name || account.id,
    ]),
  );
}

function accountOptionsFromParsedData(parsedData) {
  if (!parsedData) {
    return [];
  }

  return [...parsedData.accounts.values()].map(accountToImportAccount);
}

function accountToImportAccount(account) {
  return {
    id: text(account.id),
    name: text(account.name),
    type: text(account.type),
    institution: text(account.institution),
    accountKind: text(account.accountKind) || "actual",
    parentAccountId: text(account.parentAccountId),
    currency: text(account.currency) || "GBP",
    openingBalance: number(account.openingBalance),
    manualBalance:
      account.manualBalance === null || account.manualBalance === undefined
        ? null
        : number(account.manualBalance),
  };
}

function defaultImportAccountFromBatch(batch) {
  const account = batch.accounts?.[0];

  if (account) {
    return accountToImportAccount(account);
  }

  return DEFAULT_NEW_ACCOUNT_DRAFT;
}

function chooseInitialImportAccount(existingAccounts, suggestedAccount) {
  return (
    existingAccounts.find((account) => account.id === suggestedAccount.id) ||
    existingAccounts.find(
      (account) =>
        account.institution &&
        account.institution.toLowerCase() === suggestedAccount.institution.toLowerCase(),
    ) ||
    existingAccounts[0] ||
    suggestedAccount
  );
}

function newAccountFromDraft(draft) {
  const account = accountToImportAccount({
    ...DEFAULT_NEW_ACCOUNT_DRAFT,
    ...draft,
  });

  if (!account.id) {
    throw new Error("Enter an account id before saving the import.");
  }

  if (!account.name) {
    throw new Error("Enter an account name before saving the import.");
  }

  return account;
}

function formatRuleSummary(rule) {
  const updates = Object.entries(rule.set ?? {})
    .filter(([, value]) => text(value))
    .map(([field, value]) => `${field}: ${value}`)
    .join(", ");

  return `${rule.match?.field} ${rule.match?.operator} ${rule.match?.value} -> ${updates}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB").format(value);
}

function downloadArrayBuffer(buffer, fileName, type) {
  const blob = new Blob([buffer], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

function text(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function number(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

export default App;
