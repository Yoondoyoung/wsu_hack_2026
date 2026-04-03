/** Tier colors: low = quieter (green), medium (orange), high = louder (red) — same idea as crime risk styling. */
export const NOISE_EXPOSURE_COLORS: Record<'low' | 'medium' | 'high', string> = {
  low: '#4ade80',
  medium: '#fb923c',
  high: '#f87171',
};

/** Text/icon color for noise tier; muted when unknown (no seed data). */
export function noiseExposureColor(level: 'low' | 'medium' | 'high' | undefined): string {
  if (level === 'medium' || level === 'high') return NOISE_EXPOSURE_COLORS[level];
  if (level === 'low') return NOISE_EXPOSURE_COLORS.low;
  return 'rgba(255,255,255,0.38)';
}

/** Matches server tertiles on distance-weighted road noise (dB) within the seeded listing batch. */
export function noiseExposureLabel(level: 'low' | 'medium' | 'high' | undefined): string {
  if (level == null) return 'Road noise n/a';
  if (level === 'medium') return 'Moderate road noise';
  if (level === 'high') return 'High road noise';
  return 'Low road noise';
}
