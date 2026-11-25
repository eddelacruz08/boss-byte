export function formatCurrency(
  value: number,
  { currency = 'USD', locale = 'en-US', maximumFractionDigits = 2 } = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits,
  }).format(value);
}

export function formatNumber(value: number, { locale = 'en-US', maximumFractionDigits = 2 } = {}) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

/** Formats a fraction (0.125) as a percentage ("12.5%"). */
export function formatPercent(value: number, { locale = 'en-US', maximumFractionDigits = 1 } = {}) {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits }).format(value);
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Formats a byte count using binary multiples: 1536 → "1.5 KB". */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : Number(value.toFixed(fractionDigits))} ${BYTE_UNITS[exponent]}`;
}
