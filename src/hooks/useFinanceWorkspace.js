import { useEffect, useMemo, useRef, useState } from "react";

import {
  deriveDailyAccountNetWorthStackSeries,
  deriveDailyNetWorthSeries,
} from "@/data/balanceHistory";
import {
  applyRulesToImportBatch,
  assignImportBatchAccount,
  combineImportBatches,
  countImportRuleMatches,
  createImportRule,
  financeDataFromEditedImport,
  importFileToEditedBatch,
} from "@/data/imports";
import { downloadUpdatedSpreadsheet } from "@/data/updateSpreadsheet";
import {
  appDataFromFinanceData,
  createEmptyFinanceData,
  createManualBalanceSnapshot,
  createPfaVault,
  DuplicateImportError,
  financeDataFromAppData,
  isDuplicateImport,
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
  const importInputRef = useRef(null);
  const pfaInputRef = useRef(null);
  const vaultPasswordInputRef = useRef(null);
  const vaultPasswordRef = useRef("");
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
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const currentFinanceData = useMemo(() => {
    if (vaultData) {
      return { ...vaultData, importRules };
    }

    if (parsedData) {
      return {
        ...financeDataFromAppData(parsedData),
        importRules,
      };
    }

    return null;
  }, [importRules, parsedData, vaultData]);
  const accounts = useMemo(
    () => (parsedData ? [...parsedData.accounts.values()] : []),
    [parsedData],
  );
  const balanceSnapshots = useMemo(
    () =>
      parsedData
        ? [...parsedData.balances].sort(compareBalanceSnapshotsDescending)
        : [],
    [parsedData],
  );
  const importAccountOptions = useMemo(
    () => accountOptionsFromParsedData(parsedData),
    [parsedData],
  );
  const accountNames = useMemo(
    () => (parsedData ? parsedData.accounts : new Map()),
    [parsedData],
  );
  const transactions = useMemo(
    () =>
      parsedData
        ? [...parsedData.transactions]
            .sort(compareTransactionsNewestFirst)
            .slice(0, 25)
        : [],
    [parsedData],
  );
  const balanceSnapshotDraftWithDefaults = useMemo(
    () => ({
      ...balanceSnapshotDraft,
      accountId:
        balanceSnapshotDraft.accountId || firstActualAccountId(accounts),
      date: balanceSnapshotDraft.date || todayDate(),
    }),
    [accounts, balanceSnapshotDraft],
  );
  const netWorthSeries = useMemo(
    () =>
      currentFinanceData ? deriveDailyNetWorthSeries(currentFinanceData) : [],
    [currentFinanceData],
  );
  const accountNetWorthStackSeries = useMemo(
    () =>
      currentFinanceData
        ? deriveDailyAccountNetWorthStackSeries(currentFinanceData)
        : { data: [], keys: [], seriesMeta: {} },
    [currentFinanceData],
  );
  const importPreviewAccountNames = useMemo(
    () => createImportPreviewAccountNames(importPreview),
    [importPreview],
  );
  const categorySuggestions = useMemo(
    () => createCategorySuggestions(parsedData, importPreview, importRules),
    [importPreview, importRules, parsedData],
  );
  const draftRule = useMemo(
    () =>
      importPreview
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
        : null,
    [importPreview, ruleDraft],
  );
  const bulkRuleMatchCount = useMemo(
    () => (draftRule ? countImportRuleMatches(importPreview, draftRule) : 0),
    [draftRule, importPreview],
  );

  function handleThemeToggle() {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }

  async function handleImportFileChange(event) {
    const files = [...(event.target.files ?? [])];

    if (files.length === 0) {
      return;
    }

    try {
      if (files.length === 1) {
        await importSingleFile(files[0]);
        return;
      }

      await importMultipleFiles(files);
    } catch (parseError) {
      if (files.length === 1 && isExcelImportFile(files[0])) {
        clearCurrentData();
        setError(parseError.message);
        return;
      }

      if (files.length === 1 && isJsonImportFile(files[0])) {
        handleImportError(
          parseError,
          "That Monzo JSON file has already been imported.",
        );
        return;
      }

      setImportPreview(null);
      handleImportError(
        parseError,
        "That import file has already been imported.",
      );
    } finally {
      event.target.value = "";
    }
  }

  async function importSingleFile(file) {
    if (isExcelImportFile(file)) {
      const nextVaultData = await excelFileToFinanceData(file);

      setCurrentData(
        nextVaultData,
        "Loaded Excel data into the vault model.",
      );
      setImportPreview(null);
      return;
    }

    if (isJsonImportFile(file)) {
      const incomingVaultData = await monzoJsonFileToFinanceData(file);
      const nextVaultData = vaultData
        ? mergeFinanceData(currentVaultData(), incomingVaultData)
        : incomingVaultData;

      setCurrentData(
        nextVaultData,
        "Imported Monzo JSON into the vault model.",
      );
      setImportPreview(null);
      return;
    }

    const editedBatch = await importFileToEditedBatch(file, importRules);

    stageImportPreview(editedBatch);
  }

  async function importMultipleFiles(files) {
    const directFiles = files.filter(isDirectFinanceImportFile);
    const stagedFiles = files.filter((file) => !isDirectFinanceImportFile(file));

    if (directFiles.length > 0 && stagedFiles.length > 0) {
      throw new Error(
        "Choose either Excel/JSON files or CSV/PDF files in one bulk import.",
      );
    }

    if (directFiles.length > 0) {
      const incomingFiles = await Promise.all(
        directFiles.map((file) =>
          isExcelImportFile(file)
            ? excelFileToFinanceData(file)
            : monzoJsonFileToFinanceData(file),
        ),
      );
      const { importedCount, nextVaultData, skippedDuplicateCount } =
        mergeIncomingFinanceFiles(incomingFiles);

      setImportPreview(null);
      setCurrentData(
        nextVaultData,
        createBulkImportMessage(importedCount, skippedDuplicateCount),
      );
      return;
    }

    const editedBatches = await Promise.all(
      stagedFiles.map((file) => importFileToEditedBatch(file, importRules)),
    );
    const { importableBatches, skippedDuplicateCount } =
      filterDuplicateImportBatches(editedBatches);

    if (importableBatches.length === 0) {
      setImportPreview(null);
      setError("");
      setMessage(createBulkImportMessage(0, skippedDuplicateCount));
      return;
    }

    stageImportPreview(combineImportBatches(importableBatches), {
      skippedDuplicateCount,
    });
  }

  async function handlePfaFileChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    try {
      requireVaultPassword();

      const nextVaultData = await openPfaVault(file, currentVaultPassword());

      setCurrentData(nextVaultData, "Opened encrypted PFA vault.");
      setImportPreview(null);
    } catch (openError) {
      setError(openError.message);
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
        importPreview.allowAccountRetarget === false
          ? null
          : activeImportAccount(),
      );
      const incomingVaultData = financeDataFromEditedImport(assignedPreview, {
        importRules,
      });
      const existingVaultData = vaultData
        ? currentVaultData()
        : parsedData
          ? financeDataFromAppData(parsedData)
          : null;
      const baseVaultData = existingVaultData
        ? { ...existingVaultData, importRules }
        : createEmptyFinanceData({
            metadata: incomingVaultData.metadata,
            importRules,
          });
      const nextVaultData = mergeFinanceData(baseVaultData, incomingVaultData);

      setCurrentData(
        nextVaultData,
        createSavedImportMessage(incomingVaultData.imports.length),
      );
      setImportPreview(null);
    } catch (importError) {
      handleImportError(
        importError,
        "That import file has already been imported.",
      );
    }
  }

  async function handleDownloadPfa() {
    try {
      requireVaultPassword();

      const nextVaultData = currentVaultData();
      const buffer = await createPfaVault(nextVaultData, currentVaultPassword());

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

  function stageImportPreview(editedBatch, options = {}) {
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
      createPreparedImportMessage(editedBatch, options.skippedDuplicateCount),
    );
  }

  function mergeIncomingFinanceFiles(incomingFiles) {
    let nextVaultData = currentFinanceData
      ? { ...currentVaultData(), importRules }
      : createEmptyFinanceData({ importRules });
    const importedFileHashes = new Set(
      nextVaultData.imports
        .map((importRecord) => importRecord.fileHash)
        .filter(Boolean),
    );
    let importedCount = 0;
    let skippedDuplicateCount = 0;

    incomingFiles.forEach((incomingFile) => {
      const fileHashes = incomingFile.imports
        .map((importRecord) => importRecord.fileHash)
        .filter(Boolean);
      const hasDuplicate = incomingFile.imports.some(
        (importRecord) =>
          isDuplicateImport(nextVaultData, importRecord) ||
          importedFileHashes.has(importRecord.fileHash),
      );

      if (hasDuplicate) {
        skippedDuplicateCount += 1;
        return;
      }

      nextVaultData = mergeFinanceData(nextVaultData, {
        ...incomingFile,
        importRules,
      });
      importedCount += 1;
      fileHashes.forEach((fileHash) => importedFileHashes.add(fileHash));
    });

    return { importedCount, nextVaultData, skippedDuplicateCount };
  }

  function filterDuplicateImportBatches(editedBatches) {
    const baseVaultData = currentFinanceData ?? createEmptyFinanceData();
    const importedFileHashes = new Set(
      baseVaultData.imports
        .map((importRecord) => importRecord.fileHash)
        .filter(Boolean),
    );
    const importableBatches = [];
    let skippedDuplicateCount = 0;

    editedBatches.forEach((editedBatch) => {
      const importSources = importSourcesFromEditedBatch(editedBatch);
      const hasDuplicate = importSources.some(
        (importSource) =>
          importSource.fileHash &&
          (importedFileHashes.has(importSource.fileHash) ||
            isDuplicateImport(baseVaultData, importSource)),
      );

      if (hasDuplicate) {
        skippedDuplicateCount += 1;
        return;
      }

      importableBatches.push(editedBatch);
      importSources.forEach((importSource) => {
        if (importSource.fileHash) {
          importedFileHashes.add(importSource.fileHash);
        }
      });
    });

    return { importableBatches, skippedDuplicateCount };
  }

  function handleApplyDraftRule(nextRuleDraft = ruleDraft) {
    try {
      const rule = createRuleFromDraft(nextRuleDraft);
      const matchCount = countImportRuleMatches(importPreview, rule);

      setRuleDraft(nextRuleDraft);
      setImportPreview((currentPreview) =>
        currentPreview
          ? applyRulesToImportBatch(currentPreview, [rule])
          : currentPreview,
      );
      setError("");
      setMessage(`Applied rule to ${matchCount} staged transactions.`);
    } catch (ruleError) {
      setError(ruleError.message);
      setMessage("");
    }
  }

  function handleSaveDraftRule(nextRuleDraft = ruleDraft) {
    try {
      const rule = createRuleFromDraft(nextRuleDraft);
      const matchCount = countImportRuleMatches(importPreview, rule);

      setRuleDraft(nextRuleDraft);
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
        `Saved reusable rule and applied it to ${matchCount} staged transactions.`,
      );
    } catch (ruleError) {
      setError(ruleError.message);
      setMessage("");
    }
  }

  function createRuleFromDraft(nextRuleDraft = ruleDraft) {
    if (!importPreview) {
      throw new Error("Import a transaction file before creating a rule.");
    }

    const set = importRuleSetFromDraft(nextRuleDraft);

    if (!nextRuleDraft.field || !nextRuleDraft.value.trim()) {
      throw new Error("Choose a match field and value before applying a rule.");
    }

    if (Object.keys(set).length === 0) {
      throw new Error("Set at least one editable field for the rule.");
    }

    return createImportRule({
      name: `${nextRuleDraft.field} ${nextRuleDraft.operator} ${nextRuleDraft.value}`,
      sourceType: importPreview.sourceType,
      sourceProvider: importPreview.sourceProvider,
      order: importRules.length,
      match: {
        field: nextRuleDraft.field,
        operator: nextRuleDraft.operator,
        value: nextRuleDraft.value,
      },
      set,
    });
  }

  function currentVaultData() {
    if (currentFinanceData) {
      return currentFinanceData;
    }

    throw new Error("Load an import file or a PFA vault first.");
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
    if (!currentVaultPassword()) {
      throw new Error("Enter a vault password first.");
    }
  }

  function currentVaultPassword() {
    return vaultPasswordInputRef.current?.value ?? vaultPasswordRef.current;
  }

  function handleVaultPasswordChange(password) {
    vaultPasswordRef.current = password;
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
    accountNetWorthStackSeries,
    accounts,
    balanceSnapshotDraft: balanceSnapshotDraftWithDefaults,
    balanceSnapshots,
    bulkRuleMatchCount,
    categorySuggestions,
    currentFinanceData,
    error,
    handleApplyDraftRule,
    handleDownloadExcel,
    handleDownloadPfa,
    handleImportFileChange,
    handleImportAccountModeChange,
    handleNewAccountDraftChange,
    handlePfaFileChange,
    handlePreviewFieldChange,
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
    importInputRef,
    message,
    newAccountDraft,
    netWorthSeries,
    parsedData,
    pfaInputRef,
    ruleDraft,
    selectedImportAccountId,
    handleVaultPasswordChange,
    theme,
    transactions,
    vaultPasswordInputRef,
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

function compareTransactionsNewestFirst(left, right) {
  return new Date(right.date).getTime() - new Date(left.date).getTime();
}

function isExcelImportFile(file = {}) {
  return (
    importFileName(file).endsWith(".xlsx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function isJsonImportFile(file = {}) {
  return (
    importFileName(file).endsWith(".json") || file.type === "application/json"
  );
}

function isDirectFinanceImportFile(file = {}) {
  return isExcelImportFile(file) || isJsonImportFile(file);
}

function importSourcesFromEditedBatch(batch) {
  if (Array.isArray(batch.importSources) && batch.importSources.length > 0) {
    return batch.importSources;
  }

  return [
    {
      sourceType: batch.sourceType,
      sourceProvider: batch.sourceProvider,
      fileHash: batch.fileHash,
      fileName: batch.fileName,
      transactionCount: batch.rows?.length ?? 0,
      importedAt: batch.importedAt,
    },
  ];
}

function createPreparedImportMessage(batch, skippedDuplicateCount = 0) {
  const fileCount = batch.sourceFileCount ?? batch.importSources?.length ?? 1;
  const source = batch.sourceProvider || "file";
  const fileSummary =
    fileCount > 1 ? ` from ${fileCount} ${pluralize(fileCount, "file")}` : "";
  const investmentSummary = batch.investments?.length
    ? ` ${batch.investments.length} ${pluralize(
        batch.investments.length,
        "investment position",
      )} staged.`
    : "";

  return [
    `Prepared ${batch.rows.length} ${source} import ${pluralize(
      batch.rows.length,
      "transaction",
    )}${fileSummary} for review.`,
    investmentSummary.trim(),
    skippedDuplicateSummary(skippedDuplicateCount),
  ]
    .filter(Boolean)
    .join(" ");
}

function createSavedImportMessage(importCount) {
  if (importCount <= 1) {
    return "Saved edited import into the vault model.";
  }

  return `Saved edited imports from ${importCount} ${pluralize(
    importCount,
    "file",
  )} into the vault model.`;
}

function createBulkImportMessage(importedCount, skippedDuplicateCount = 0) {
  if (importedCount === 0) {
    return `No new files imported.${prefixedDuplicateSummary(
      skippedDuplicateCount,
    )}`;
  }

  return `Imported ${importedCount} ${pluralize(
    importedCount,
    "file",
  )} into the vault model.${prefixedDuplicateSummary(skippedDuplicateCount)}`;
}

function skippedDuplicateSummary(count) {
  if (count <= 0) {
    return "";
  }

  return `Skipped ${count} duplicate ${pluralize(count, "file")}.`;
}

function prefixedDuplicateSummary(count) {
  const summary = skippedDuplicateSummary(count);

  return summary ? ` ${summary}` : "";
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function importFileName(file = {}) {
  return String(file.name ?? "").toLowerCase();
}
