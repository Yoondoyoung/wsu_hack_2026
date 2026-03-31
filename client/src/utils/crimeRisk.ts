/** Matches server tiers: ≤1 low, 2–9 moderate, ≥10 high (2-mile radius). */
export const CRIME_RISK_LABELS: Record<'low' | 'medium' | 'high', string> = {
  low: 'Low risk',
  medium: 'Moderate risk',
  high: 'High risk',
};

export function crimeRiskLabel(level: 'low' | 'medium' | 'high' | undefined): string {
  if (level === 'medium' || level === 'high') return CRIME_RISK_LABELS[level];
  return CRIME_RISK_LABELS.low;
}
