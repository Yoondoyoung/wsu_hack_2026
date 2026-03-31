export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/** Safe for API data where sqft may be null/undefined. */
export function formatSqft(sqft: number | null | undefined): string {
  if (sqft == null || Number.isNaN(Number(sqft))) return '—';
  const n = Number(sqft);
  return n > 0 ? n.toLocaleString() : '—';
}
