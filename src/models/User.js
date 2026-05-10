export class User {
  constructor({
    firstName = "",
    lastName = "",
    age = "",
    accounts = {},
    investments = {},
    debts = {},
  } = {}) {
    this.firstName = firstName;
    this.lastName = lastName;
    this.age = age;
    this.accounts = toMap(accounts);
    this.investments = toMap(investments);
    this.debts = toMap(debts);
  }

  get fullName() {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get totalAccountBalance() {
    return sumMapValues(this.accounts, (account) => account.balance);
  }

  get totalInvestments() {
    return sumMapValues(this.investments);
  }

  get totalDebts() {
    return sumMapValues(this.debts);
  }

  get netWorth() {
    return this.totalAccountBalance + this.totalInvestments - this.totalDebts;
  }
}

function toMap(value) {
  if (value instanceof Map) {
    return value;
  }

  return new Map(Object.entries(value ?? {}));
}

function sumMapValues(map, getValue = (value) => value) {
  return [...map.values()].reduce((total, value) => {
    return total + Number(getValue(value) ?? 0);
  }, 0);
}
