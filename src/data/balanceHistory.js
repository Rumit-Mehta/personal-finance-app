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

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}
