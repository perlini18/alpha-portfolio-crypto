export function formatNumber(value: number, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0";
}

export function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value || 0);
}
