/**
 * Road noise LineString edges → per-property distance-weighted exposure (seed-time).
 */

export type NoiseEdge = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
  intensity: number;
};

const CELL = 0.012;

function cellKey(i: number, j: number): string {
  return `${i},${j}`;
}

function toIJ(lng: number, lat: number): [number, number] {
  return [Math.floor(lng / CELL), Math.floor(lat / CELL)];
}

/** Local plane miles: x east, y north, origin at (lng0, lat0). */
function toLocalMiles(lng0: number, lat0: number, lng: number, lat: number): { x: number; y: number } {
  const x = (lng - lng0) * Math.cos((lat0 * Math.PI) / 180) * 69;
  const y = (lat - lat0) * 69;
  return { x, y };
}

/** Shortest distance in miles from point P to segment AB (local plane at P). */
function pointSegmentDistMiles(
  plng: number,
  plat: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const a = toLocalMiles(plng, plat, ax, ay);
  const b = toLocalMiles(plng, plat, bx, by);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = -a.x;
  const apy = -a.y;
  const denom = abx * abx + aby * aby;
  const t = denom < 1e-18 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(cx, cy);
}

export function edgesFromNoiseGeojson(geojson: {
  type?: string;
  features?: unknown[];
}): NoiseEdge[] {
  const featuresIn = Array.isArray(geojson.features) ? geojson.features : [];
  const edges: NoiseEdge[] = [];

  for (const f of featuresIn) {
    const feat = f as {
      geometry?: { type?: string; coordinates?: unknown };
      properties?: { intensity?: unknown };
    };
    const intRaw = feat.properties?.intensity;
    const intensity =
      typeof intRaw === 'number' && Number.isFinite(intRaw)
        ? Math.min(1, Math.max(0, intRaw))
        : 0.5;
    const geom = feat.geometry;
    if (!geom?.type || !geom.coordinates) continue;

    const pushRing = (ring: [number, number][]) => {
      for (let i = 0; i < ring.length - 1; i++) {
        const [aLng, aLat] = ring[i]!;
        const [bLng, bLat] = ring[i + 1]!;
        if (![aLng, aLat, bLng, bLat].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
        const minLng = Math.min(aLng, bLng);
        const maxLng = Math.max(aLng, bLng);
        const minLat = Math.min(aLat, bLat);
        const maxLat = Math.max(aLat, bLat);
        edges.push({
          ax: aLng,
          ay: aLat,
          bx: bLng,
          by: bLat,
          minLng,
          maxLng,
          minLat,
          maxLat,
          intensity,
        });
      }
    };

    if (geom.type === 'LineString') {
      const coords = geom.coordinates as [number, number][];
      if (Array.isArray(coords) && coords.length >= 2) pushRing(coords);
    } else if (geom.type === 'MultiLineString') {
      const multi = geom.coordinates as [number, number][][];
      if (Array.isArray(multi)) {
        for (const line of multi) {
          if (Array.isArray(line) && line.length >= 2) pushRing(line);
        }
      }
    }
  }

  return edges;
}

export function buildNoiseEdgeGrid(edges: NoiseEdge[]): Map<string, number[]> {
  const grid = new Map<string, number[]>();
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei]!;
    const i0 = Math.floor(e.minLng / CELL);
    const i1 = Math.floor(e.maxLng / CELL);
    const j0 = Math.floor(e.minLat / CELL);
    const j1 = Math.floor(e.maxLat / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = cellKey(i, j);
        let arr = grid.get(k);
        if (!arr) {
          arr = [];
          grid.set(k, arr);
        }
        arr.push(ei);
      }
    }
  }
  return grid;
}

function collectCandidateIndices(
  lng: number,
  lat: number,
  radiusMiles: number,
  grid: Map<string, number[]>
): Set<number> {
  let r = radiusMiles;
  for (let attempt = 0; attempt < 10; attempt++) {
    const padDegLat = r / 69;
    const cosLat = Math.max(0.2, Math.abs(Math.cos((lat * Math.PI) / 180)));
    const padDegLng = r / (69 * cosLat);
    const di = Math.ceil(padDegLng / CELL) + 1;
    const dj = Math.ceil(padDegLat / CELL) + 1;
    const [ic, jc] = toIJ(lng, lat);
    const out = new Set<number>();
    for (let i = ic - di; i <= ic + di; i++) {
      for (let j = jc - dj; j <= jc + dj; j++) {
        const list = grid.get(cellKey(i, j));
        if (!list) continue;
        for (const idx of list) out.add(idx);
      }
    }
    if (out.size > 0) return out;
    r *= 2;
  }
  return new Set<number>();
}

/**
 * Distance-weighted average intensity, then dB = 55 + intensity * 40 (matches noiseGeojson mapping).
 */
export function noiseExposureDbAvgAt(
  lng: number,
  lat: number,
  edges: NoiseEdge[],
  grid: Map<string, number[]>,
  opts: { searchRadiusMiles: number; decayMiles: number }
): number {
  const { searchRadiusMiles, decayMiles } = opts;
  let candidates = collectCandidateIndices(lng, lat, searchRadiusMiles, grid);
  if (candidates.size === 0) {
    candidates = new Set<number>();
    for (let i = 0; i < edges.length; i++) candidates.add(i);
  }

  let sumW = 0;
  let sumWI = 0;
  let minD = Infinity;
  let minI = 0.5;

  for (const ei of candidates) {
    const e = edges[ei]!;
    const d = pointSegmentDistMiles(lng, lat, e.ax, e.ay, e.bx, e.by);
    if (d < minD) {
      minD = d;
      minI = e.intensity;
    }
    if (d > searchRadiusMiles) continue;
    const w = Math.exp(-d / decayMiles);
    sumW += w;
    sumWI += w * e.intensity;
  }

  let intensityAvg: number;
  if (sumW > 1e-12) {
    intensityAvg = sumWI / sumW;
  } else if (Number.isFinite(minD) && minD < Infinity) {
    intensityAvg = minI;
  } else {
    intensityAvg = 0.5;
  }

  return intensityAvg * 40 + 55;
}
