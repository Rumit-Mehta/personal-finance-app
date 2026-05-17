import { useEffect, useRef, useState } from "react";

import { deriveDailyNetWorthSeries } from "@/data/balanceHistory";
import {
  applyRulesToImportBatch,
  assignImportBatchAccount,
  countImportRuleMatches,
  createImportRule,
  financeDataFromEditedImport,
  importFileToEditedBatch,
} from "@/data/imports";
import { downloadUpdatedSpreadsheet } from "@/data/updateSpreadsheet";
import {
  appDataFromFinanceData,
  createManualBalanceSnapshot,
  createPfaVault,
  DuplicateImportError,
  financeDataFromAppData,
  mergeFinanceData,
  openPfaVault,
} from "@/data/vault";
import { excelFileToFinanceData } from "@/data/vault/adapters/excel";
import { monzoJsonFileToFinanceData } from "@/data/vault/adapters/monzo";
import { downloadArrayBuffer } from "@/utils/downloads";
import {
  accountOptionsFromParsedData,
  chooseInitialImportAccount,
  createCategorySuggestions,
  createImportPreviewAccountNames,
  DEFAULT_NEW_ACCOUNT_DRAFT,
  DEFAULT_RULE_DRAFT,
  defaultImportAccountFromBatch,
  importRuleSetFromDraft,
  newAccountFromDraft,
} from "@/utils/importPreview";

export function useFinanceWorkspace() {
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
  const [newAccountDraft, setNewAccountDraft] = useState(
    DEFAULT_NEW_ACCOUNT_DRAFT,
  );
  const [balanceSnapshotDraft, setBalanceSnapshotDraft] = useState({
    accountId: "",
    date: todayDate(),
    balance: "",
    notes: "",
  });
  const [ruleDraft, setRuleDraft] = useState(DEFAULT_RULE_DRAFT);
  const [vaultPassword, setVaultPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const accounts = parsedData ? [...parsedData.accounts.values()] : [];
  const balanceSnapshots = parsedData
    ? [...parsedData.balances].sort(compareBalanceSnapshotsDescending)
    : [];
  const importAccountOptions = accountOptionsFromParsedData(parsedData);
  const accountNames = parsedData ? parsedData.accounts : new Map();
  const transactions = parsedData ? parsedData.transactions.slice(0, 25) : [];
  const balanceSnapshotDraftWithDefaults = {
    ...balanceSnapshotDraft,
    accountId: balanceSnapshotDraft.accountId || firstActualAccountId(accounts),
    date: balanceSnapshotDraft.date || todayDate(),
  };
  const netWorthSeries = parsedData
    ? deriveDailyNetWorthSeries(currentVaultData())
    : [];
  const importPreviewAccountNames =
    createImportPreviewAccountNames(importPreview);
  const categorySuggestions = createCategorySuggestions(
    parsedData,
    importPreview,
    importRules,
  );
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

  function handleThemeToggle() {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
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

      setCurrentData(
        nextVaultData,
        "Imported Monzo JSON into the vault model.",
      );
    } catch (importError) {
      handleImportError(
        importError,
        "That Monzo JSON file has already been imported.",
      );
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

      setCurrentData(
        nextVaultData,
        "Saved edited CSV import into the vault model.",
      );
      setImportPreview(null);
    } catch (importError) {
      handleImportError(
        importError,
        "That CSV file has already been imported.",
      );
    }
  }

  async function handleDownloadPfa() {
    try {
      requireVaultPassword();

      const nextVaultData = currentVaultData();
      const buffer = await createPfaVault(nextVaultData, vaultPassword);

      downloadArrayBuffer(
        buffer,
        "my-finances.pfa",
        "application/octet-stream",
      );
      setCurrentData(nextVaultData, "Exported encrypted PFA vault.");
    } catch (downloadError) {
      setError(downloadError.message);
      setMessage("");
    }
  }

  async function handleDownloadExcel() {
    try {
      await downloadUpdatedSpreadsheet(
        appDataFromFinanceData(currentVaultData()),
      );
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
    const account = importAccountOptions.find(
      (option) => option.id === accountId,
    );

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

  function handleBalanceSnapshotDraftChange(field, value) {
    setBalanceSnapshotDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  }

  function handleSaveBalanceSnapshot() {
    try {
      const account = accounts.find(
        (currentAccount) =>
          currentAccount.id === balanceSnapshotDraftWithDefaults.accountId,
      );

      if (!account) {
        throw new Error("Choose an account before saving a balance correction.");
      }

      if (!balanceSnapshotDraftWithDefaults.date) {
        throw new Error("Choose a date before saving a balance correction.");
      }

      if (String(balanceSnapshotDraft.balance).trim() === "") {
        throw new Error("Enter a balance before saving a correction.");
      }

      const currentData = currentVaultData();
      const snapshot = createManualBalanceSnapshot({
        accountId: account.id,
        date: balanceSnapshotDraftWithDefaults.date,
        balance: balanceSnapshotDraft.balance,
        currency: account.currency,
        notes: balanceSnapshotDraft.notes,
      });
      const nextVaultData = {
        ...currentData,
        balances: upsertById(currentData.balances, snapshot),
      };

      setCurrentData(
        nextVaultData,
        `Saved balance correction for ${account.name || account.id}.`,
      );
      setBalanceSnapshotDraft((currentDraft) => ({
        ...currentDraft,
        accountId: account.id,
        balance: "",
        notes: "",
      }));
    } catch (snapshotError) {
      setError(snapshotError.message);
      setMessage("");
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
        currentPreview
          ? applyRulesToImportBatch(currentPreview, [rule])
          : currentPreview,
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
        currentPreview
          ? applyRulesToImportBatch(currentPreview, [rule])
          : currentPreview,
      );
      setError("");
      setMessage(
        `Saved reusable rule and applied it to ${bulkRuleMatchCount} staged transactions.`,
      );
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

  return {
    accountNames,
    accounts,
    balanceSnapshotDraft: balanceSnapshotDraftWithDefaults,
    balanceSnapshots,
    bulkRuleMatchCount,
    categorySuggestions,
    csvInputRef,
    error,
    fileInputRef,
    handleApplyDraftRule,
    handleCsvFileChange,
    handleDownloadExcel,
    handleDownloadPfa,
    handleFileChange,
    handleImportAccountModeChange,
    handleMonzoJsonChange,
    handleNewAccountDraftChange,
    handlePfaFileChange,
    handlePreviewFieldChange,
    handleRuleDraftChange,
    handleBalanceSnapshotDraftChange,
    handleSaveDraftRule,
    handleSaveBalanceSnapshot,
    handleSaveImportPreview,
    handleSelectedImportAccountChange,
    handleThemeToggle,
    importAccountMode,
    importAccountOptions,
    importPreview,
    importPreviewAccountNames,
    importRules,
    message,
    monzoJsonInputRef,
    newAccountDraft,
    netWorthSeries,
    parsedData,
    pfaInputRef,
    ruleDraft,
    selectedImportAccountId,
    setVaultPassword,
    theme,
    transactions,
    vaultPassword,
  };
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function firstActualAccountId(accounts) {
  return (
    accounts.find((account) => account.isActual)?.id ||
    accounts[0]?.id ||
    ""
  );
}

function upsertById(items, nextItem) {
  const merged = new Map(items.map((item) => [item.id, item]));

  merged.set(nextItem.id, nextItem);

  return [...merged.values()];
}

function compareBalanceSnapshotsDescending(left, right) {
  return new Date(right.date).getTime() - new Date(left.date).getTime();
}
