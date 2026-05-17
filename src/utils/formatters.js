export function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

export function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB").format(value);
}
