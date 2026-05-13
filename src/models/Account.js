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

  get balance() {
    return this.manualBalance ?? this.calculatedBalance;
  }

  get isVirtual() {
    return this.accountKind === "virtual";
  }

  get isActual() {
    return !this.isVirtual;
  }

  get hasManualBalance() {
    return this.manualBalance !== null;
  }

  get transactionCount() {
    return this.transactions.length;
  }
}
