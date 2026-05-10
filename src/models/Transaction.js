export class Transaction {
  constructor({
    id = crypto.randomUUID(),
    date = new Date(),
    description = "",
    amount = 0,
    category = "",
    tag = "",
    account = "",
    merchant = "",
    notes = "",
  } = {}) {
    this.id = id;
    this.date = toDate(date);
    this.description = description;
    this.amount = Number(amount);
    this.category = category;
    this.tag = tag;
    this.account = account;
    this.merchant = merchant;
    this.notes = notes;
  }

  get isIncome() {
    return this.amount > 0;
  }

  get isExpense() {
    return this.amount < 0;
  }

  get absoluteAmount() {
    return Math.abs(this.amount);
  }
}

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  return new Date(value);
}
