import { normalizeFinanceData } from "./vault/financeData.js";

export function deriveDailyAccountBalances(financeData, options = {}) {
  const data = normalizeFinanceData(financeData);
  const range = dateRange(data, options);

  if (!range) {
    return [];
  }

  const transactionsByAccount = groupBy(data.transactions, "account");
  const snapshotsByAccount = groupBy(data.balances, "accountId");

  return data.accounts.flatMap((account) =>
    deriveAccountSeries({
      account,
      transactions: transactionsByAccount.get(account.id) ?? [],
      snapshots: snapshotsByAccount.get(account.id) ?? [],
      startDate: range.startDate,
      endDate: range.endDate,
    }),
  );
}

export function deriveDailyNetWorthSeries(financeData, options = {}) {
  const data = normalizeFinanceData(financeData);
  const actualAccountIds = new Set(
    data.accounts
      .filter((account) => account.accountKind !== "virtual")
      .map((account) => account.id),
  );
  const totalsByDate = new Map();

  deriveDailyAccountBalances(data, options).forEach((point) => {
    if (!actualAccountIds.has(point.accountId)) {
      return;
    }

    totalsByDate.set(
      point.date,
      roundMoney((totalsByDate.get(point.date) ?? 0) + point.balance),
    );
  });
  deriveDailyInvestmentValues(data, options).forEach((point) => {
    totalsByDate.set(
      point.date,
      roundMoney((totalsByDate.get(point.date) ?? 0) + point.value),
    );
  });

  return [...totalsByDate.entries()]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, netWorth]) => ({ date, netWorth }));
}

export function deriveDailyAccountNetWorthStackSeries(financeData, options = {}) {
  const data = normalizeFinanceData(financeData);
  const range = dateRange(data, options);

  if (!range) {
    return emptyStackSeries();
  }

  const actualAccounts = data.accounts.filter(
    (account) => account.accountKind !== "virtual",
  );
  const accountIds = new Set(actualAccounts.map((account) => account.id));
  const accountMeta = actualAccounts.map((account) => ({
    key: accountSeriesKey(account.id),
    kind: "account",
    accountId: account.id,
    label: account.name || account.id,
    group: account.institution || account.sourceProvider || account.name || account.id,
    currency: account.currency,
  }));
  const investmentProviderSeries = deriveDailyInvestmentProviderValues(
    data,
    options,
  );
  const seriesItems = withSeriesColors([
    ...accountMeta,
    ...investmentProviderSeries.meta,
  ]);
  const keys = seriesItems.map((item) => item.key);
  const seriesMeta = Object.fromEntries(
    seriesItems.map((item) => [item.key, item]),
  );
  const rows = createStackRows(range, keys);

  deriveDailyAccountBalances(data, options).forEach((point) => {
    if (!accountIds.has(point.accountId)) {
      return;
    }

    setStackValue(rows, point.date, accountSeriesKey(point.accountId), point.balance);
  });
  investmentProviderSeries.points.forEach((point) => {
    setStackValue(rows, point.date, point.key, point.value);
  });

  return {
    data: finalizeStackRows(rows, keys),
    keys,
    seriesMeta,
  };
}

export function deriveDailyInstitutionNetWorthStackSeries(financeData, options = {}) {
  const data = normalizeFinanceData(financeData);
  const range = dateRange(data, options);

  if (!range) {
    return emptyStackSeries();
  }

  const actualAccounts = data.accounts.filter(
    (account) => account.accountKind !== "virtual",
  );
  const institutionMeta = new Map();
  const institutionKeyByAccount = new Map();

  actualAccounts.forEach((account) => {
    const label = institutionLabelForAccount(account);
    const key = institutionSeriesKey(label);

    institutionKeyByAccount.set(account.id, key);
    upsertInstitutionMeta(institutionMeta, key, {
      key,
      kind: "institution",
      label,
      group: label,
      currency: account.currency,
    });
  });

  const investmentProviderSeries = deriveDailyInvestmentProviderValues(
    data,
    options,
  );

  investmentProviderSeries.meta.forEach((meta) => {
    const label = institutionLabel(meta.provider);
    const key = institutionSeriesKey(label);

    upsertInstitutionMeta(institutionMeta, key, {
      key,
      kind: "institution",
      label,
      group: label,
      currency: meta.currency,
    });
  });

  const seriesItems = withSeriesColors(
    [...institutionMeta.values()].sort(compareInstitutionStackOrder),
  );
  const keys = seriesItems.map((item) => item.key);
  const seriesMeta = Object.fromEntries(
    seriesItems.map((item) => [item.key, item]),
  );
  const rows = createStackRows(range, keys);

  deriveDailyAccountBalances(data, options).forEach((point) => {
    const key = institutionKeyByAccount.get(point.accountId);

    if (!key) {
      return;
    }

    addStackValue(rows, point.date, key, point.balance);
  });

  investmentProviderSeries.points.forEach((point) => {
    const provider = investmentProviderSeries.meta.find(
      (meta) => meta.key === point.key,
    )?.provider;
    const key = institutionSeriesKey(institutionLabel(provider));

    addStackValue(rows, point.date, key, point.value);
  });

  return {
    data: finalizeStackRows(rows, keys),
    keys,
    seriesMeta,
  };
}

function deriveDailyInvestmentValues(financeData, options = {}) {
  const data = normalizeFinanceData(financeData);
  const range = dateRange(data, options);

  if (!range) {
    return [];
  }

  const historyByInvestment = groupBy(
    data.valueHistory.filter(
      (history) =>
        history.entityType === "investment" &&
        !history.entityId.startsWith("trading212:"),
    ),
    "entityId",
  );
  const totalsByDate = new Map();

  historyByInvestment.forEach((historyRows) => {
    const historyByDate = new Map(
      historyRows
        .map((history) => [dayKey(history.date), Number(history.value)])
        .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate)),
    );
    let currentValue = 0;

    forEachDate(range.startDate, range.endDate, (date) => {
      if (historyByDate.has(date)) {
        currentValue = historyByDate.get(date);
      }

      totalsByDate.set(date, roundMoney((totalsByDate.get(date) ?? 0) + currentValue));
    });
  });

  return [...totalsByDate.entries()].map(([date, value]) => ({ date, value }));
}

function deriveDailyInvestmentProviderValues(financeData, options = {}) {
  const data = normalizeFinanceData(financeData);
  const range = dateRange(data, options);

  if (!range) {
    return { meta: [], points: [] };
  }

  const investmentsById = new Map(
    data.investments.map((investment) => [investment.id, investment]),
  );
  const historyByInvestment = groupBy(
    data.valueHistory.filter(
      (history) =>
        history.entityType === "investment" &&
        !history.entityId.startsWith("trading212:"),
    ),
    "entityId",
  );
  const providerMeta = new Map();
  const providerTotalsByDate = new Map();

  historyByInvestment.forEach((historyRows, investmentId) => {
    const investment = investmentsById.get(investmentId);
    const provider = investment?.provider || "Investments";
    const key = investmentProviderSeriesKey(provider);
    const historyByDate = new Map(
      historyRows
        .map((history) => [dayKey(history.date), Number(history.value)])
        .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate)),
    );
    let currentValue = 0;

    providerMeta.set(key, {
      key,
      kind: "investmentProvider",
      provider,
      label: `${provider} investments`,
      group: provider,
      currency: investment?.currency || "GBP",
    });

    forEachDate(range.startDate, range.endDate, (date) => {
      if (historyByDate.has(date)) {
        currentValue = historyByDate.get(date);
      }

      const providerTotals = providerTotalsByDate.get(key) ?? new Map();

      providerTotals.set(
        date,
        roundMoney((providerTotals.get(date) ?? 0) + currentValue),
      );
      providerTotalsByDate.set(key, providerTotals);
    });
  });

  return {
    meta: [...providerMeta.values()],
    points: [...providerTotalsByDate.entries()].flatMap(([key, totals]) =>
      [...totals.entries()].map(([date, value]) => ({ date, key, value })),
    ),
  };
}

function deriveAccountSeries({ account, transactions, snapshots, startDate, endDate }) {
  if (hasManualBalance(account) && snapshots.length === 0) {
    return deriveManualBalanceSeries({
      account,
      transactions,
      startDate,
      endDate,
    });
  }

  if (usesValuationSnapshots(account) && snapshots.length > 0) {
    return deriveSnapshotValuationSeries({
      account,
      snapshots,
      startDate,
      endDate,
    });
  }

  const transactionTotalsByDate = totalTransactionsByDate(transactions);
  const snapshotsByDate = snapshotsByDay(snapshots);
  const simulationStartDate = earliestDate([
    startDate,
    ...transactionTotalsByDate.keys(),
    ...snapshotsByDate.keys(),
  ]);
  const series = [];
  let balance = Number(account.openingBalance);

  forEachDate(simulationStartDate, endDate, (date) => {
    balance = roundMoney(balance + (transactionTotalsByDate.get(date) ?? 0));

    const daySnapshots = snapshotsByDate.get(date);

    if (daySnapshots?.length) {
      balance = daySnapshots.at(-1).balance;
    }

    if (date >= startDate) {
      series.push({
        date,
        accountId: account.id,
        balance,
        currency: account.currency,
      });
    }
  });

  backfillBeforeFirstSnapshot(series, transactionTotalsByDate, snapshotsByDate);

  return series;
}

function deriveManualBalanceSeries({ account, transactions, startDate, endDate }) {
  const transactionTotalsByDate = totalTransactionsByDate(transactions);
  const dates = datesBetween(startDate, endDate);
  const series = new Array(dates.length);
  let balance = Number(account.manualBalance);

  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const date = dates[index];

    series[index] = {
      date,
      accountId: account.id,
      balance,
      currency: account.currency,
    };
    balance = roundMoney(balance - (transactionTotalsByDate.get(date) ?? 0));
  }

  return series;
}

function deriveSnapshotValuationSeries({ account, snapshots, startDate, endDate }) {
  const snapshotsByDate = snapshotsByDay(snapshots);
  const series = [];
  let balance = Number(account.openingBalance);

  forEachDate(startDate, endDate, (date) => {
    const daySnapshots = snapshotsByDate.get(date);

    if (daySnapshots?.length) {
      balance = daySnapshots.at(-1).balance;
    }

    series.push({
      date,
      accountId: account.id,
      balance,
      currency: account.currency,
    });
  });

  return series;
}

function emptyStackSeries() {
  return {
    data: [],
    keys: [],
    seriesMeta: {},
  };
}

function createStackRows(range, keys) {
  const rows = new Map();

  forEachDate(range.startDate, range.endDate, (date) => {
    const row = { date, total: 0, positiveTotal: 0, negativeTotal: 0, values: {} };

    keys.forEach((key) => {
      row[key] = 0;
      row.values[key] = 0;
    });
    rows.set(date, row);
  });

  return rows;
}

function setStackValue(rows, date, key, value) {
  const row = rows.get(date);

  if (!row) {
    return;
  }

  const roundedValue = roundMoney(value);

  row[key] = roundedValue;
  row.values[key] = roundedValue;
}

function addStackValue(rows, date, key, value) {
  const row = rows.get(date);

  if (!row) {
    return;
  }

  const roundedValue = roundMoney((row[key] ?? 0) + value);

  row[key] = roundedValue;
  row.values[key] = roundedValue;
}

function finalizeStackRows(rows, keys) {
  return [...rows.values()].map((row) => {
    const totals = keys.reduce(
      (currentTotals, key) => {
        const value = Number(row[key]) || 0;

        return {
          total: roundMoney(currentTotals.total + value),
          positiveTotal:
            value > 0
              ? roundMoney(currentTotals.positiveTotal + value)
              : currentTotals.positiveTotal,
          negativeTotal:
            value < 0
              ? roundMoney(currentTotals.negativeTotal + value)
              : currentTotals.negativeTotal,
        };
      },
      { total: 0, positiveTotal: 0, negativeTotal: 0 },
    );

    return {
      ...row,
      ...totals,
    };
  });
}

function accountSeriesKey(accountId) {
  return `account:${accountId}`;
}

function institutionSeriesKey(institution) {
  return `institution:${institution || "Unassigned"}`;
}

function investmentProviderSeriesKey(provider) {
  return `investment:${provider || "Investments"}`;
}

function withSeriesColors(seriesItems) {
  const groupCounts = new Map();

  return seriesItems.map((item) => {
    const group = item.group || item.label || item.key;
    const groupIndex = groupCounts.get(group) ?? 0;

    groupCounts.set(group, groupIndex + 1);

    return {
      ...item,
      color: seriesColor(group, groupIndex),
    };
  });
}

function seriesColor(group, groupIndex) {
  const hue = hashString(group) % 360;
  const lightness = 40 + (groupIndex % 4) * 8;

  return `hsl(${hue} 72% ${lightness}%)`;
}

function hashString(value) {
  return [...String(value)].reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
}

function upsertInstitutionMeta(meta, key, nextMeta) {
  if (!meta.has(key)) {
    meta.set(key, nextMeta);
  }
}

function institutionLabelForAccount(account) {
  return institutionLabel(
    account.institution || account.sourceProvider || account.name || account.id,
  );
}

function institutionLabel(value) {
  const label = text(value);
  const normalizedLabel = label.toLowerCase().replace(/\s+/gu, "");

  if (!label) {
    return "Unassigned";
  }

  if (["trading212", "t212"].includes(normalizedLabel)) {
    return "Trading 212";
  }

  if (normalizedLabel === "monzo") {
    return "Monzo";
  }

  return label
    .replace(/[-_]+/gu, " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function compareInstitutionStackOrder(left, right) {
  const priorityDifference =
    institutionStackPriority(left.label) - institutionStackPriority(right.label);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  return left.label.localeCompare(right.label);
}

function institutionStackPriority(label) {
  return label === "Trading 212" ? 0 : 1;
}

function usesValuationSnapshots(account) {
  const sourceProvider = text(account.sourceProvider).toLowerCase();
  const institution = text(account.institution).toLowerCase();
  const type = text(account.type).toLowerCase();

  return (
    sourceProvider === "trading212" ||
    institution === "trading 212" ||
    ["investment", "stocks-isa", "cash-isa", "cfd"].includes(type)
  );
}

function hasManualBalance(account) {
  return account.manualBalance !== null && account.manualBalance !== undefined;
}

function backfillBeforeFirstSnapshot(series, transactionTotalsByDate, snapshotsByDate) {
  const firstSnapshotDate = earliestDate([...snapshotsByDate.keys()]);

  if (!firstSnapshotDate) {
    return;
  }

  const firstSnapshot = snapshotsByDate.get(firstSnapshotDate)?.at(-1);

  if (firstSnapshot?.sourceType === "manual") {
    return;
  }

  const firstSnapshotIndex = series.findIndex(
    (point) => point.date === firstSnapshotDate,
  );

  if (firstSnapshotIndex <= 0) {
    return;
  }

  let balance = series[firstSnapshotIndex].balance;

  for (let index = firstSnapshotIndex - 1; index >= 0; index -= 1) {
    const nextDate = series[index + 1].date;

    balance = roundMoney(balance - (transactionTotalsByDate.get(nextDate) ?? 0));
    series[index].balance = balance;
  }
}

function dateRange(data, options) {
  const allDates = [
    ...data.transactions.map((transaction) => dayKey(transaction.date)),
    ...data.balances.map((balance) => dayKey(balance.date)),
    ...data.valueHistory.map((history) => dayKey(history.date)),
  ].filter(Boolean);
  const startDate = dayKey(options.startDate) || earliestDate(allDates);
  const endDate = dayKey(options.endDate) || latestDate(allDates);

  if (!startDate || !endDate || startDate > endDate) {
    return null;
  }

  return { startDate, endDate };
}

function totalTransactionsByDate(transactions) {
  const totals = new Map();

  transactions.forEach((transaction) => {
    const date = dayKey(transaction.date);

    totals.set(date, roundMoney((totals.get(date) ?? 0) + transaction.amount));
  });

  return totals;
}

function snapshotsByDay(snapshots) {
  const groups = new Map();

  snapshots.forEach((snapshot) => {
    const date = dayKey(snapshot.date);
    const daySnapshots = groups.get(date) ?? [];

    daySnapshots.push(snapshot);
    groups.set(date, daySnapshots);
  });

  groups.forEach((daySnapshots) => {
    daySnapshots.sort(compareSnapshots);
  });

  return groups;
}

function compareSnapshots(left, right) {
  const sourceDifference = sourcePriority(left) - sourcePriority(right);

  if (sourceDifference !== 0) {
    return sourceDifference;
  }

  const timeDifference = new Date(left.date).getTime() - new Date(right.date).getTime();

  if (timeDifference !== 0) {
    return timeDifference;
  }

  return left.id.localeCompare(right.id);
}

function sourcePriority(snapshot) {
  return snapshot.sourceType === "manual" ? 1 : 0;
}

function groupBy(items, key) {
  const groups = new Map();

  items.forEach((item) => {
    const groupKey = item[key];
    const groupItems = groups.get(groupKey) ?? [];

    groupItems.push(item);
    groups.set(groupKey, groupItems);
  });

  return groups;
}

function forEachDate(startDate, endDate, callback) {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  const endTime = new Date(`${endDate}T00:00:00.000Z`).getTime();

  while (date.getTime() <= endTime) {
    callback(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
}

function datesBetween(startDate, endDate) {
  const dates = [];

  forEachDate(startDate, endDate, (date) => {
    dates.push(date);
  });

  return dates;
}

function earliestDate(dates) {
  return dates.filter(Boolean).sort((left, right) => left.localeCompare(right))[0] ?? "";
}

function latestDate(dates) {
  return dates.filter(Boolean).sort((left, right) => right.localeCompare(left))[0] ?? "";
}

function dayKey(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function text(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}
