export class Account {
  constructor({
    id = crypto.randomUUID(),
    name = "",
    type = "",
    institution = "",
    openingBalance = 0,
    manualBalance = null,
    currency = "GBP",
    transactions = [],
  } = {}) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.institution = institution;
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

  get hasManualBalance() {
    return this.manualBalance !== null;
  }

  get transactionCount() {
    return this.transactions.length;
  }
}
