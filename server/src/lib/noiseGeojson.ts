/**
 * Road noise GeoJSON: keep LineString/MultiLineString geometry for map line layer.
 * `noise_level` (dB) → `intensity` 0–1 and `noise_db_bin` for stepped line-color (MapView).
 */
export function noiseGeojsonWithIntensity(raw: { type?: string; features?: unknown[] }): {
  type: 'FeatureCollection';
  features: unknown[];
} {
  const featuresIn = Array.isArray(raw.features) ? raw.features : [];
  const features = featuresIn.map((f: unknown) => {
    const feat = f as { type?: string; geometry?: unknown; properties?: Record<string, unknown> };
    const nl = feat.properties?.noise_level;
    const n = typeof nl === 'number' ? nl : parseFloat(String(nl ?? ''));
    const intensity = Number.isFinite(n) ? Math.min(1, Math.max(0, (n - 55) / 40)) : 0.5;
    // Bin for a discrete "by decibel" palette (actual map colors are in MapView).
    // <60, 60-65, 65-70, 70-75, >=75
    const noise_db_bin = Number.isFinite(n)
      ? n < 60
        ? 0
        : n < 65
          ? 1
          : n < 70
            ? 2
            : n < 75
              ? 3
              : 4
      : 2;
    return {
      ...feat,
      properties: {
        ...feat.properties,
        intensity,
        noise_db_bin,
      },
    };
  });
  return { type: 'FeatureCollection', features };
}
