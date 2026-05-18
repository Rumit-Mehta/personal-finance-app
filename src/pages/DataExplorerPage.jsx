import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Database,
  FileText,
  History,
  Info,
  Receipt,
  Search,
  SlidersHorizontal,
  Table2,
  Tags,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EMPTY_ARRAY = [];

const DATASETS = [
  {
    id: "metadata",
    icon: Info,
    label: "Metadata",
    path: "financeData.metadata",
    preferredColumns: [
      "schemaVersion",
      "createdAt",
      "updatedAt",
      "app",
      "source",
      "provider",
      "importedAt",
      "fileName",
    ],
    rows: (data) => [{ schemaVersion: data.schemaVersion, ...data.metadata }],
  },
  {
    id: "user",
    icon: UserRound,
    label: "User",
    path: "financeData.user",
    preferredColumns: ["firstName", "lastName", "age"],
    rows: (data) => [data.user ?? {}],
  },
  {
    id: "accounts",
    icon: Wallet,
    label: "Accounts",
    path: "financeData.accounts",
    preferredColumns: [
      "id",
      "name",
      "type",
      "institution",
      "accountKind",
      "parentAccountId",
      "currency",
      "openingBalance",
      "manualBalance",
      "sourceProvider",
      "sourceId",
    ],
    rows: (data) => data.accounts ?? EMPTY_ARRAY,
  },
  {
    id: "balances",
    icon: Table2,
    label: "Balances",
    path: "financeData.balances",
    preferredColumns: [
      "id",
      "accountId",
      "date",
      "balance",
      "totalBalance",
      "spendToday",
      "currency",
      "sourceType",
      "sourceProvider",
      "sourceId",
      "notes",
    ],
    rows: (data) => sortByDateDescending(data.balances ?? EMPTY_ARRAY),
  },
  {
    id: "transactions",
    icon: Receipt,
    label: "Transactions",
    path: "financeData.transactions",
    preferredColumns: [
      "id",
      "date",
      "description",
      "amount",
      "account",
      "category",
      "tag",
      "merchant",
      "notes",
      "sourceProvider",
      "sourceType",
      "sourceId",
      "fingerprint",
      "possibleDuplicate",
      "duplicateOf",
    ],
    rows: (data) => sortByDateDescending(data.transactions ?? EMPTY_ARRAY),
  },
  {
    id: "tags",
    icon: Tags,
    label: "Tags",
    path: "financeData.tags",
    preferredColumns: ["id", "name", "description"],
    rows: (data) => data.tags ?? EMPTY_ARRAY,
  },
  {
    id: "investments",
    icon: TrendingUp,
    label: "Investments",
    path: "financeData.investments",
    preferredColumns: [
      "id",
      "name",
      "type",
      "provider",
      "currency",
      "currentValue",
    ],
    rows: (data) => data.investments ?? EMPTY_ARRAY,
  },
  {
    id: "debts",
    icon: Database,
    label: "Debts",
    path: "financeData.debts",
    preferredColumns: [
      "id",
      "name",
      "type",
      "provider",
      "currency",
      "currentValue",
    ],
    rows: (data) => data.debts ?? EMPTY_ARRAY,
  },
  {
    id: "valueHistory",
    icon: History,
    label: "Value History",
    path: "financeData.valueHistory",
    preferredColumns: ["id", "entityType", "entityId", "date", "value"],
    rows: (data) => sortByDateDescending(data.valueHistory ?? EMPTY_ARRAY),
  },
  {
    id: "imports",
    icon: FileText,
    label: "Imports",
    path: "financeData.imports",
    preferredColumns: [
      "id",
      "sourceType",
      "provider",
      "fileName",
      "fileHash",
      "accountIds",
      "transactionCount",
      "importedAt",
    ],
    rows: (data) => sortByDateDescending(data.imports ?? EMPTY_ARRAY, "importedAt"),
  },
  {
    id: "importRules",
    icon: SlidersHorizontal,
    label: "Import Rules",
    path: "financeData.importRules",
    preferredColumns: [
      "id",
      "name",
      "enabled",
      "sourceType",
      "sourceProvider",
      "order",
      "match",
      "set",
    ],
    rows: (data) => data.importRules ?? EMPTY_ARRAY,
  },
];

const STAGED_DATASETS = [
  {
    id: "stagedImport",
    icon: FileText,
    label: "Staged Import",
    path: "importPreview",
    preferredColumns: [
      "sourceType",
      "sourceProvider",
      "fileName",
      "fileHash",
      "importedAt",
      "rowCount",
      "allowAccountRetarget",
    ],
    rows: (preview) => [
      {
        sourceType: preview.sourceType,
        sourceProvider: preview.sourceProvider,
        fileName: preview.fileName,
        fileHash: preview.fileHash,
        importedAt: preview.importedAt,
        rowCount: preview.rows?.length ?? 0,
        allowAccountRetarget: preview.allowAccountRetarget,
      },
    ],
  },
  {
    id: "stagedAccounts",
    icon: Wallet,
    label: "Staged Accounts",
    path: "importPreview.accounts",
    preferredColumns: [
      "id",
      "name",
      "type",
      "institution",
      "accountKind",
      "accountRole",
      "parentAccountId",
      "currency",
      "openingBalance",
      "manualBalance",
      "sourceProvider",
      "sourceId",
    ],
    rows: (preview) => preview.accounts ?? EMPTY_ARRAY,
  },
  {
    id: "stagedBalances",
    icon: Table2,
    label: "Staged Balances",
    path: "importPreview.balances",
    preferredColumns: [
      "id",
      "accountId",
      "accountRole",
      "date",
      "balance",
      "currency",
      "sourceType",
      "sourceProvider",
      "sourceId",
      "notes",
    ],
    rows: (preview) => sortByDateDescending(preview.balances ?? EMPTY_ARRAY),
  },
  {
    id: "stagedRows",
    icon: Receipt,
    label: "Staged Rows",
    path: "importPreview.rows",
    preferredColumns: [
      "id",
      "date",
      "description",
      "amount",
      "account",
      "transferAccount",
      "accountRole",
      "category",
      "tag",
      "merchant",
      "notes",
      "sourceProvider",
      "sourceType",
      "sourceId",
      "isGenerated",
      "generatedFromId",
      "appliedRuleIds",
    ],
    rows: (preview) => sortByDateDescending(preview.rows ?? EMPTY_ARRAY),
  },
  {
    id: "stagedInvestments",
    icon: TrendingUp,
    label: "Staged Investments",
    path: "importPreview.investments",
    preferredColumns: [
      "id",
      "name",
      "type",
      "provider",
      "currency",
      "currentValue",
    ],
    rows: (preview) => preview.investments ?? EMPTY_ARRAY,
  },
  {
    id: "stagedValueHistory",
    icon: History,
    label: "Staged Value History",
    path: "importPreview.valueHistory",
    preferredColumns: ["id", "entityType", "entityId", "date", "value"],
    rows: (preview) => sortByDateDescending(preview.valueHistory ?? EMPTY_ARRAY),
  },
];

export function DataExplorerPage({ financeData, importPreview, onDashboard }) {
  const [activeDatasetId, setActiveDatasetId] = useState("accounts");
  const [query, setQuery] = useState("");

  const datasets = useMemo(
    () => createDatasets(financeData, importPreview),
    [financeData, importPreview],
  );
  const activeDataset =
    datasets.find((dataset) => dataset.id === activeDatasetId) ?? datasets[0];
  const filteredRows = useMemo(() => {
    if (!activeDataset) {
      return EMPTY_ARRAY;
    }

    return activeDataset.rows.filter((row) => rowMatchesQuery(row, query));
  }, [activeDataset, query]);
  const summaryStats = useMemo(
    () => createSummaryStats(financeData, importPreview),
    [financeData, importPreview],
  );
  const hasData = Boolean(financeData || importPreview);

  if (!hasData) {
    return (
      <section className="mx-auto mt-10 max-w-2xl rounded-md border border-border bg-card p-6">
        <div className="mb-5 flex size-11 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Database aria-hidden="true" className="size-5" />
        </div>
        <h1 className="text-3xl font-semibold tracking-normal">All Data</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No PFA vault or imported finance data is loaded.
        </p>
        <Button className="mt-5" onClick={onDashboard} type="button">
          <ArrowLeft />
          Dashboard
        </Button>
      </section>
    );
  }

  const ActiveIcon = activeDataset.icon;

  function handleDatasetSelect(datasetId) {
    setActiveDatasetId(datasetId);
    setQuery("");
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">
            Data vault
          </p>
          <h1 className="text-3xl font-semibold tracking-normal">All Data</h1>
        </div>
        <Button onClick={onDashboard} type="button" variant="outline">
          <ArrowLeft />
          Dashboard
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryStats.map((stat) => (
          <article
            className="rounded-md border border-border bg-card p-4"
            key={stat.label}
          >
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
          </article>
        ))}
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex gap-2 overflow-x-auto rounded-md border border-border bg-muted/40 p-1">
          {datasets.map((dataset) => {
            const DatasetIcon = dataset.icon;
            const isActive = dataset.id === activeDataset.id;

            return (
              <button
                aria-pressed={isActive}
                className={cn(
                  "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-sm px-3 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                )}
                key={dataset.id}
                onClick={() => handleDatasetSelect(dataset.id)}
                title={dataset.path}
                type="button"
              >
                <DatasetIcon aria-hidden="true" className="size-4" />
                <span>{dataset.label}</span>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {formatCount(dataset.rows.length)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ActiveIcon aria-hidden="true" className="size-5" />
              <h2 className="text-xl font-semibold">{activeDataset.label}</h2>
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {activeDataset.path}
            </p>
          </div>

          <label className="relative block w-full max-w-sm">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <span className="sr-only">Search {activeDataset.label}</span>
            <input
              className="w-full pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search current section"
              type="search"
              value={query}
            />
          </label>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Showing {formatCount(filteredRows.length)} of{" "}
          {formatCount(activeDataset.rows.length)} records
        </p>

        <DataTable columns={activeDataset.columns} rows={filteredRows} />
      </div>
    </section>
  );
}

function DataTable({ columns, rows }) {
  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No records match this view.
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-border">
      <div className="max-h-[70vh] overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 border-border bg-muted px-3 py-2 text-left">
                #
              </th>
              {columns.map((column) => (
                <th
                  className="sticky top-0 z-10 whitespace-nowrap border-border bg-muted px-3 py-2 text-left"
                  key={column}
                >
                  {labelFromKey(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr className="odd:bg-background even:bg-muted/25" key={rowKey(row, index)}>
                <td className="sticky left-0 z-10 border-border bg-inherit px-3 py-2 text-muted-foreground">
                  {formatCount(index + 1)}
                </td>
                {columns.map((column) => (
                  <td
                    className="max-w-[28rem] border-border px-3 py-2 align-top"
                    key={column}
                  >
                    <ValueCell field={column} row={row} value={row[column]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValueCell({ field, row, value }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">Empty</span>;
  }

  if (typeof value === "boolean") {
    return (
      <span
        className={cn(
          "inline-flex rounded-sm px-2 py-0.5 text-xs font-semibold",
          value
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            : "bg-muted text-muted-foreground",
        )}
      >
        {value ? "Yes" : "No"}
      </span>
    );
  }

  if (typeof value === "number") {
    const isMoney = isMonetaryField(field);

    return (
      <span
        className={cn(
          "whitespace-nowrap",
          isMoney && value < 0 && "text-destructive",
          isMoney &&
            value > 0 &&
            "text-emerald-700 dark:text-emerald-300",
        )}
      >
        {isMoney ? formatMoney(value, row.currency) : formatCount(value)}
      </span>
    );
  }

  if (Array.isArray(value) || typeof value === "object") {
    return <CompoundValue value={value} />;
  }

  if (isDateField(field, value)) {
    return (
      <time className="whitespace-nowrap" dateTime={value} title={value}>
        {formatDateValue(value, field)}
      </time>
    );
  }

  return (
    <span
      className={cn(
        "break-words",
        isIdentifierField(field) && "font-mono text-xs",
      )}
      title={value}
    >
      {value}
    </span>
  );
}

function CompoundValue({ value }) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground">None</span>;
    }

    if (value.every(isPrimitiveValue)) {
      return (
        <div className="flex max-w-md flex-wrap gap-1">
          {value.map((item, index) => (
            <span
              className="rounded-sm bg-muted px-2 py-1 font-mono text-xs"
              key={`${item}-${index}`}
            >
              {String(item)}
            </span>
          ))}
        </div>
      );
    }
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index + 1), item])
    : Object.entries(value);

  if (entries.length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }

  return (
    <div className="grid min-w-56 gap-1">
      {entries.map(([key, entry]) => (
        <div className="rounded-sm bg-muted/70 px-2 py-1" key={key}>
          <span className="font-semibold">{labelFromKey(key)}:</span>{" "}
          <span className="break-words">{inlineValue(entry)}</span>
        </div>
      ))}
    </div>
  );
}

function createDatasets(financeData, importPreview) {
  const configuredDatasets = [
    ...(financeData ? DATASETS.map((dataset) => [dataset, financeData]) : []),
    ...(importPreview
      ? STAGED_DATASETS.map((dataset) => [dataset, importPreview])
      : []),
  ];

  return configuredDatasets.map(([dataset, data]) => {
    const rows = dataset.rows(data).map((row) => row ?? {});

    return {
      ...dataset,
      columns: createColumns(rows, dataset.preferredColumns),
      rows,
    };
  });
}

function createColumns(rows, preferredColumns) {
  const columns = new Set();

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => columns.add(key));
  });

  if (columns.size === 0) {
    return preferredColumns;
  }

  return [
    ...preferredColumns.filter((key) => columns.has(key)),
    ...[...columns]
      .filter((key) => !preferredColumns.includes(key))
      .sort((left, right) => left.localeCompare(right)),
  ];
}

function createSummaryStats(financeData, importPreview) {
  const stats = [];

  if (financeData) {
    stats.push(
      {
        label: "Schema",
        value: `v${financeData.schemaVersion ?? "?"}`,
      },
      {
        label: "Accounts",
        value: formatCount(financeData.accounts?.length ?? 0),
      },
      {
        label: "Transactions",
        value: formatCount(financeData.transactions?.length ?? 0),
      },
      {
        label: "Imports",
        value: formatCount(financeData.imports?.length ?? 0),
      },
    );
  }

  if (importPreview) {
    stats.push(
      {
        label: "Staged Source",
        value: importPreview.sourceProvider || importPreview.sourceType,
      },
      {
        label: "Staged Rows",
        value: formatCount(importPreview.rows?.length ?? 0),
      },
    );
  }

  return stats.length > 0 ? stats : EMPTY_ARRAY;
}

function rowMatchesQuery(row, query) {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  return searchText(row).includes(needle);
}

function searchText(value) {
  if (Array.isArray(value)) {
    return value.map(searchText).join(" ").toLowerCase();
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, entry]) => `${key} ${searchText(entry)}`)
      .join(" ")
      .toLowerCase();
  }

  return String(value ?? "").toLowerCase();
}

function sortByDateDescending(rows, field = "date") {
  return [...rows].sort((left, right) => {
    return new Date(right[field]).getTime() - new Date(left[field]).getTime();
  });
}

function rowKey(row, index) {
  return `${row.id || row.name || "row"}-${index}`;
}

function labelFromKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function isPrimitiveValue(value) {
  return (
    value === null ||
    value === undefined ||
    ["string", "number", "boolean"].includes(typeof value)
  );
}

function inlineValue(value) {
  if (Array.isArray(value)) {
    return value.map(inlineValue).join(", ") || "None";
  }

  if (value && typeof value === "object") {
    return (
      Object.entries(value)
        .map(([key, entry]) => `${labelFromKey(key)}: ${inlineValue(entry)}`)
        .join(", ") || "None"
    );
  }

  if (value === null || value === undefined || value === "") {
    return "Empty";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function isDateField(field, value) {
  const normalizedField = String(field).toLowerCase();

  return (
    typeof value === "string" &&
    value.length >= 8 &&
    (normalizedField === "date" ||
      normalizedField.endsWith("at") ||
      normalizedField.includes("date")) &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function formatDateValue(value, field) {
  const includeTime = String(field).toLowerCase().endsWith("at");
  const options = includeTime
    ? {
        dateStyle: "medium",
        timeStyle: "short",
      }
    : {
        dateStyle: "medium",
      };

  return new Intl.DateTimeFormat("en-GB", options).format(new Date(value));
}

function isIdentifierField(field) {
  const normalizedField = String(field).toLowerCase();

  return (
    normalizedField === "id" ||
    normalizedField.endsWith("id") ||
    normalizedField.includes("hash") ||
    normalizedField.includes("fingerprint")
  );
}

function isMonetaryField(field) {
  return [
    "amount",
    "balance",
    "currentValue",
    "manualBalance",
    "openingBalance",
    "spendToday",
    "totalBalance",
    "value",
  ].includes(field);
}

function formatMoney(value, currency = "GBP") {
  try {
    return new Intl.NumberFormat("en-GB", {
      currency: currency || "GBP",
      style: "currency",
    }).format(value);
  } catch {
    return formatCount(value);
  }
}

function formatCount(value) {
  return new Intl.NumberFormat("en-GB").format(value);
}
