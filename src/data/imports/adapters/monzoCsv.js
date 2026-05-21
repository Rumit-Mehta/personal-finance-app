const ACCOUNT_ID = "monzo:csv";
const ACCOUNT_NAME = "Monzo Current Account";
const REQUIRED_HEADERS = [
  "Transaction ID",
  "Date",
  "Time",
  "Type",
  "Name",
  "Category",
  "Amount",
  "Currency",
  "Notes and #tags",
  "Description",
];
const BALANCE_HEADERS = [
  "Balance",
  "Running Balance",
  "Running balance",
  "Balance after transaction",
  "Balance After Transaction",
  "Account Balance",
];

export const monzoCsvAdapter = {
  id: "monzo-csv",
  sourceType: "monzo-csv",
  sourceProvider: "monzo",

  /**
   * Checks whether parsed CSV headers match the Monzo export format.
   */
  detect({ headers }) {
    const headerSet = new Set(headers);

    return REQUIRED_HEADERS.every((header) => headerSet.has(header));
  },

  /**
   * Wraps parsed CSV rows with Monzo-specific import metadata.
   */
  createRawBatch({ parsedCsv, file, fileHash, importedAt }) {
    validateHeaders(parsedCsv.headers);

    return {
      adapterId: this.id,
      sourceType: this.sourceType,
      sourceProvider: this.sourceProvider,
      fileName: file?.name || "",
      fileHash,
      importedAt,
      headers: parsedCsv.headers,
      rows: parsedCsv.rows,
    };
  },

  /**
   * Maps Monzo raw rows into staged import rows and generated pot rows.
   */
  normalize(rawBatch) {
    return {
      adapterId: this.id,
      sourceType: this.sourceType,
      sourceProvider: this.sourceProvider,
      fileName: rawBatch.fileName,
      fileHash: rawBatch.fileHash,
      importedAt: rawBatch.importedAt,
      ...normalizeMonzoCsvRows(rawBatch),
    };
  },
};

/**
 * Fails early when a CSV looks like Monzo but is missing required columns.
 */
function validateHeaders(headers) {
  const headerSet = new Set(headers);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerSet.has(header));

  if (missingHeaders.length > 0) {
    throw new Error(`Monzo CSV is missing columns: ${missingHeaders.join(", ")}`);
  }
}

/**
 * Normalizes all Monzo CSV rows and adds actual child accounts for pot transfers.
 */
function normalizeMonzoCsvRows(rawBatch) {
  const potAccounts = new Map();
  const rows = rawBatch.rows.flatMap((row) => {
    const normalizedRow = normalizeMonzoCsvRow(row, rawBatch);
    const potTransfer = monzoPotTransfer(normalizedRow);

    if (!potTransfer) {
      return [normalizedRow];
    }

    if (!potAccounts.has(potTransfer.account.id)) {
      potAccounts.set(potTransfer.account.id, potTransfer.account);
    }

    return [
      {
        ...normalizedRow,
        transferAccount: potTransfer.account.id,
      },
      createPotMirrorRow(normalizedRow, potTransfer),
    ];
  });
  const balances = rows
    .filter((row) => row.accountRole === "main")
    .map(createBalanceSnapshotForRow)
    .filter(Boolean);

  return {
    accounts: [
      {
        id: ACCOUNT_ID,
        name: ACCOUNT_NAME,
        type: "current",
        institution: "Monzo",
        accountKind: "actual",
        parentAccountId: "",
        currency: "GBP",
        openingBalance: 0,
        manualBalance: null,
        sourceProvider: rawBatch.sourceProvider,
        sourceId: ACCOUNT_ID,
        accountRole: "main",
      },
      ...potAccounts.values(),
    ],
    balances,
    rows,
  };
}

/**
 * Maps one original Monzo CSV row into the canonical staged transaction shape.
 */
function normalizeMonzoCsvRow(row, rawBatch) {
  const raw = row.raw;
  const sourceId = text(raw["Transaction ID"]);
  const merchant = text(raw.Name);
  const description = text(raw.Description) || merchant || text(raw.Type);

  return {
    id: sourceId ? `monzo:csv:${sourceId}` : `monzo:csv:row-${row.rowNumber}`,
    sourceId: sourceId || `row-${row.rowNumber}`,
    sourceType: rawBatch.sourceType,
    sourceProvider: rawBatch.sourceProvider,
    rowNumber: row.rowNumber,
    account: ACCOUNT_ID,
    date: monzoDateToIsoDate(raw.Date),
    amount: number(raw.Amount),
    description,
    merchant,
    category: text(raw.Category),
    tag: "",
    notes: text(raw["Notes and #tags"]),
    currency: text(raw.Currency) || "GBP",
    balance: optionalMoney(rawBalanceValue(raw)),
    type: text(raw.Type),
    isGenerated: false,
    generatedFromId: "",
    accountRole: "main",
    raw,
    appliedRuleIds: [],
  };
}

/**
 * Detects a Monzo pot transfer row and returns the corresponding pot account.
 */
function monzoPotTransfer(row) {
  if (row.type !== "Pot transfer") {
    return null;
  }

  const potName = potNameFromMerchant(row.merchant);

  if (!potName) {
    return null;
  }

  const slug = slugify(potName);

  if (!slug) {
    return null;
  }

  const accountId = `monzo:pot:${slug}`;

  return {
    slug,
    account: {
      id: accountId,
      name: potName,
      type: "pot",
      institution: "Monzo",
      accountKind: "actual",
      parentAccountId: ACCOUNT_ID,
      currency: row.currency || "GBP",
      openingBalance: 0,
      manualBalance: null,
      sourceProvider: row.sourceProvider,
      sourceId: accountId,
      accountRole: "pot",
    },
  };
}

/**
 * Creates the generated opposite-side transaction for a Monzo pot movement.
 */
function createPotMirrorRow(row, potTransfer) {
  return {
    ...row,
    id: `${row.id}:pot:${potTransfer.slug}`,
    sourceId: `${row.sourceId}:pot:${potTransfer.slug}`,
    account: potTransfer.account.id,
    amount: -row.amount,
    description: `${potTransfer.account.name} pot transfer`,
    merchant: potTransfer.account.name,
    notes: row.notes,
    isGenerated: true,
    generatedFromId: row.id,
    accountRole: "pot",
    transferAccount: ACCOUNT_ID,
    appliedRuleIds: [...row.appliedRuleIds],
  };
}

/**
 * Creates a bank-reported balance snapshot when the CSV has a running balance.
 */
function createBalanceSnapshotForRow(row) {
  if (row.balance === null) {
    return null;
  }

  return {
    id: `${row.id}:balance`,
    accountId: row.account,
    accountRole: row.accountRole,
    date: row.date,
    balance: row.balance,
    currency: row.currency,
    sourceType: row.sourceType,
    sourceProvider: row.sourceProvider,
    sourceId: row.sourceId,
    notes: "Imported from CSV running balance",
  };
}

function rawBalanceValue(raw) {
  const header = BALANCE_HEADERS.find((columnName) => text(raw[columnName]));

  return header ? raw[header] : "";
}

/**
 * Extracts the display account name from Monzo names like "Wardrobe Pot".
 */
function potNameFromMerchant(value) {
  const match = text(value).match(/^(.+?)\s+pot$/iu);

  return match ? match[1].trim() : "";
}

/**
 * Converts Monzo's UK date string into an ISO date string.
 */
function monzoDateToIsoDate(value) {
  const [day, month, year] = text(value).split("/");

  if (!day || !month || !year) {
    return "";
  }

  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Converts nullable values into trimmed strings for stable comparisons.
 */
function text(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

/**
 * Converts CSV numeric strings into finite numbers with a safe zero fallback.
 */
function number(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalMoney(value) {
  const rawValue = text(value);

  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue.replace(/[£,\s]/gu, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converts a display name into a stable lowercase id segment.
 */
function slugify(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}
