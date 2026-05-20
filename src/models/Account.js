export class Account {
  constructor({
    id = crypto.randomUUID(),
    name = "",
    type = "",
    institution = "",
    accountKind = "actual",
    parentAccountId = "",
    openingBalance = 0,
    manualBalance = null,
    currency = "GBP",
    balanceSnapshots = [],
    transactions = [],
  } = {}) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.institution = institution;
    this.accountKind = accountKind || "actual";
    this.parentAccountId = parentAccountId;
    this.openingBalance = Number(openingBalance);
    this.manualBalance = manualBalance === null ? null : Number(manualBalance);
    this.currency = currency;
    this.balanceSnapshots = balanceSnapshots;
    this.transactions = transactions;
  }

  addTransaction(transaction) {
    this.transactions.push(transaction);
  }

  setManualBalance(balance) {
    this.manualBalance = Number(balance);
  }

  clearManualBalance() {
    this.manualBalance = null;
  }

  get calculatedBalance() {
    return this.transactions.reduce(
      (total, transaction) => total + Number(transaction.amount),
      this.openingBalance,
    );
  }

  get latestBalanceSnapshot() {
    return [...this.balanceSnapshots].sort(compareBalanceSnapshots).at(-1) ?? null;
  }

  get balance() {
    return this.latestBalanceSnapshot?.balance ?? this.manualBalance ?? this.calculatedBalance;
  }

  get isVirtual() {
    return this.accountKind === "virtual";
  }

  get isActual() {
    return !this.isVirtual;
  }

  get isActive() {
    return roundedCurrencyValue(this.balance) !== 0;
  }

  get isInactive() {
    return !this.isActive;
  }

  get hasManualBalance() {
    return this.manualBalance !== null;
  }

  get balanceSnapshotCount() {
    return this.balanceSnapshots.length;
  }

  get transactionCount() {
    return this.transactions.length;
  }
}

function compareBalanceSnapshots(left, right) {
  const leftDay = dayKey(left.date);
  const rightDay = dayKey(right.date);

  if (leftDay !== rightDay) {
    return leftDay.localeCompare(rightDay);
  }

  const priorityDifference = sourcePriority(left) - sourcePriority(right);

  if (priorityDifference !== 0) {
    return priorityDifference;
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

function roundedCurrencyValue(value) {
  return Math.round(Number(value) * 100) / 100;
}

function dayKey(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}
