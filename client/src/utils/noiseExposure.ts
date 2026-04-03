/** Matches server tertiles on distance-weighted road noise (dB) within the seeded listing batch. */
export function noiseExposureLabel(level: 'low' | 'medium' | 'high' | undefined): string {
  if (level == null) return 'Road noise n/a';
  if (level === 'medium') return 'Moderate road noise';
  if (level === 'high') return 'High road noise';
  return 'Low road noise';
}
