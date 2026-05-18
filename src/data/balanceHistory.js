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
