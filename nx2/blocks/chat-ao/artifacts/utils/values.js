export function resolveDisplayValue(value) {
  if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
    return value;
  }
  if (!value || Array.isArray(value) || value.call !== 'formatCurrency') {
    throw new Error('Unsupported artifact display value.');
  }
  const { args } = value;
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Invalid formatCurrency arguments.');
  }
  const { value: amount, currency, decimals } = args;
  if (!Number.isFinite(amount) || typeof currency !== 'string' || !/^[a-z]{3}$/i.test(currency)
    || (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0 || decimals > 20))) {
    throw new Error('Invalid formatCurrency arguments.');
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
