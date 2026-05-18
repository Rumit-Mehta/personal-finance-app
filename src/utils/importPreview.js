export const DEFAULT_RULE_DRAFT = {
  field: "merchant",
  operator: "wildcard",
  value: "grab*",
  category: "transport",
  tag: "",
  merchant: "",
  notes: "",
};

export const DEFAULT_NEW_ACCOUNT_DRAFT = {
  id: "monzo:csv",
  name: "Monzo CSV",
  type: "current",
  institution: "Monzo",
  currency: "GBP",
};

export const EDITABLE_IMPORT_FIELDS = ["category", "tag", "merchant", "notes"];

export function importRuleSetFromDraft(ruleDraft) {
  const set = {};

  EDITABLE_IMPORT_FIELDS.forEach((field) => {
    const value = text(ruleDraft[field]);

    if (value) {
      set[field] = value;
    }
  });

  return set;
}

export function createCategorySuggestions(parsedData, importPreview, importRules) {
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

export function createImportPreviewAccountNames(importPreview) {
  return new Map(
    (importPreview?.accounts ?? []).map((account) => [
      account.id,
      account.name || account.id,
    ]),
  );
}

export function accountOptionsFromParsedData(parsedData) {
  if (!parsedData) {
    return [];
  }

  return [...parsedData.accounts.values()].map(accountToImportAccount);
}

export function accountToImportAccount(account) {
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

export function defaultImportAccountFromBatch(batch) {
  const account = batch.accounts?.[0];

  if (account) {
    return accountToImportAccount(account);
  }

  return DEFAULT_NEW_ACCOUNT_DRAFT;
}

export function chooseInitialImportAccount(existingAccounts, suggestedAccount) {
  return (
    existingAccounts.find((account) => account.id === suggestedAccount.id) ||
    existingAccounts.find(
      (account) =>
        account.institution &&
        account.institution.toLowerCase() ===
          suggestedAccount.institution.toLowerCase(),
    ) ||
    existingAccounts[0] ||
    suggestedAccount
  );
}

export function newAccountFromDraft(draft) {
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

export function formatRuleSummary(rule) {
  const updates = Object.entries(rule.set ?? {})
    .filter(([, value]) => text(value))
    .map(([field, value]) => `${field}: ${value}`)
    .join(", ");

  return `${rule.match?.field} ${rule.match?.operator} ${rule.match?.value} -> ${updates}`;
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
