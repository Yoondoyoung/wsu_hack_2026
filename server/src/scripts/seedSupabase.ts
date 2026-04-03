import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import proj4 from 'proj4';
import { supabase } from '../lib/supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const UTAH_CENTRAL =
  '+proj=lcc +lat_0=38.3333333333333 +lon_0=-111.5 +lat_1=40.65 +lat_2=39.0166666666667 +x_0=500000.00001016 +y_0=2000000.00001016 +datum=NAD83 +units=us-ft +no_defs';

const CRIME_RISK_RADIUS_MILES = 0.5;

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is string => Boolean(item));
}

function numOrZero(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function sqftFromListing(l: any, det: any, info: any): number {
  const candidates = [l.sqft, l.raw?.area, info.livingArea, info.livingAreaValue, det.livingArea];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return c;
    if (typeof c === 'string' && c.trim() !== '') {
      const n = parseFloat(c);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return 0;
}

function photoKeyFromUrl(url: string): string | null {
  const match = url.match(/\/fp\/([^-/.]+)-/);
  return match ? match[1] : null;
}

function photoQualityScore(url: string): number {
  const ccFt = url.match(/-cc_ft_(\d+)\./);
  if (ccFt) return parseInt(ccFt[1]!, 10);

  const uncropped = url.match(/-uncropped_scaled_within_(\d+)_\d+\./);
  if (uncropped) return parseInt(uncropped[1]!, 10) + 100;

  if (url.includes('-o_a.')) return 5000;
  if (url.includes('-p_f.')) return 4500;
  if (url.includes('-p_d.')) return 4300;
  if (url.includes('-d_d.')) return 4200;
  return 0;
}

function bestPhotosByKey(urls: string[]): string[] {
  const bestByKey = new Map<string, { url: string; score: number; firstIndex: number }>();

  urls.forEach((url, index) => {
    const key = photoKeyFromUrl(url) ?? `url:${url}`;
    const score = photoQualityScore(url);
    const existing = bestByKey.get(key);

    if (!existing) {
      bestByKey.set(key, { url, score, firstIndex: index });
      return;
    }

    if (score > existing.score) {
      bestByKey.set(key, { url, score, firstIndex: existing.firstIndex });
    }
  });

  return Array.from(bestByKey.values())
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((item) => item.url);
}

function extractPhotoUrls(listing: any): string[] {
  const detailImages = (Array.isArray(listing.detail?.images) ? listing.detail.images : []).filter(
    (img: unknown): img is string => typeof img === 'string' && img.includes('/fp/')
  );

  if (detailImages.length > 0) {
    return bestPhotosByKey(detailImages).slice(0, 20);
  }

  const carouselPhotoData = Array.isArray(listing.raw?.carouselPhotosComposable?.photoData)
    ? listing.raw.carouselPhotosComposable.photoData
    : [];

  const carouselPhotos: string[] = carouselPhotoData
    .map((photo: any) =>
      typeof photo?.photoKey === 'string'
        ? `https://photos.zillowstatic.com/fp/${photo.photoKey}-cc_ft_768.jpg`
        : null
    )
    .filter((url: string | null): url is string => Boolean(url));

  return Array.from(new Set<string>(carouselPhotos)).slice(0, 20);
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function countCrimesWithinMiles(
  homeLng: number,
  homeLat: number,
  points: [number, number][],
  radiusMiles: number
): number {
  const padLat = radiusMiles / 69;
  const cosLat = Math.cos((homeLat * Math.PI) / 180);
  const padLng = radiusMiles / (69 * Math.max(0.2, Math.abs(cosLat)));
  let n = 0;
  for (const [plng, plat] of points) {
    if (Math.abs(plat - homeLat) > padLat) continue;
    if (Math.abs(plng - homeLng) > padLng) continue;
    if (haversineMiles(homeLat, homeLng, plat, plng) <= radiusMiles) n++;
  }
  return n;
}

function tertileThresholds(counts: number[]): { lowMax: number; medMax: number } {
  if (counts.length === 0) return { lowMax: 0, medMax: 0 };
  const sorted = [...counts].sort((a, b) => a - b);
  const n = sorted.length;
  const lowMax = sorted[Math.floor(0.33 * (n - 1))];
  const medMax = sorted[Math.floor(0.66 * (n - 1))];
  return { lowMax, medMax };
}

function crimeRiskLevelFromTertiles(
  count: number,
  lowMax: number,
  medMax: number
): 'low' | 'medium' | 'high' {
  if (count <= lowMax) return 'low';
  if (count <= medMax) return 'medium';
  return 'high';
}

function loadCrimeRows() {
  const filePath = join(__dirname, '..', 'data', 'overlays', 'crime_slc.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  const features = raw.layers[0].features as {
    geometry: { x: number; y: number };
    attributes: { crime_type?: string; crime?: string; division?: string; date_t?: string };
  }[];
  return features.map((f) => {
    const [lng, lat] = proj4(UTAH_CENTRAL, 'EPSG:4326', [f.geometry.x, f.geometry.y]);
    return {
      lng,
      lat,
      intensity: f.attributes.crime_type === 'Violent' ? 1 : 0.6,
      crime_type: f.attributes.crime_type ?? '',
      crime: f.attributes.crime ?? '',
      division: f.attributes.division ?? '',
      occurred_at: f.attributes.date_t ?? '',
    };
  });
}

function mapProperties(listings: any[], crimePoints: [number, number][]) {
  const mapped = listings.map((l: any) => {
    const det = l.detail || {};
    const info = l.raw?.hdpData?.homeInfo || {};
    const photos = extractPhotoUrls(l);
    const latitude =
      typeof l.latitude === 'number'
        ? l.latitude
        : typeof info.latitude === 'number'
          ? info.latitude
          : 40.7608;
    const longitude =
      typeof l.longitude === 'number'
        ? l.longitude
        : typeof info.longitude === 'number'
          ? info.longitude
          : -111.891;

    return {
      id: String(l.zpid),
      address: l.address,
      streetAddress: l.raw?.addressStreet || l.address.split(',')[0],
      city: l.raw?.addressCity || 'Salt Lake City',
      state: l.raw?.addressState || 'UT',
      zip: l.raw?.addressZipcode || '',
      price: l.price,
      beds: numOrZero(l.beds ?? info.bedrooms ?? l.raw?.beds),
      baths: numOrZero(l.baths ?? info.bathrooms ?? l.raw?.baths),
      sqft: sqftFromListing(l, det, info),
      yearBuilt: det.yearBuilt || 0,
      coordinates: [longitude, latitude] as [number, number],
      homeType: det.propertyTypeDimension || info.homeType || 'Unknown',
      imageUrl: l.raw?.imgSrc || photos[0] || '',
      photos,
      detailUrl: det.detailUrl || l.detailUrl || '',
      description: det.description || '',
      lotSize: det.lotSize || null,
      pricePerSqft: det.pricePerSquareFoot || null,
      daysOnZillow: det.daysOnZillow || 0,
      pageViews: det.pageViewCount || 0,
      favorites: det.favoriteCount || 0,
      heating: normalizeArray(det.heating),
      cooling: normalizeArray(det.cooling),
      parking: normalizeArray(det.parkingFeatures),
      appliances: normalizeArray(det.appliances),
      basement: det.basement || null,
      constructionMaterials: normalizeArray(det.constructionMaterials),
      brokerName: l.raw?.brokerName || det.brokerageName || '',
      agentName: det.agentName || '',
      agentPhone: det.agentPhone || '',
      hoaFee: det.monthlyHoaFee || null,
      zestimate: det.zestimate || null,
      rentZestimate: det.rentZestimate || null,
      schools: (det.schools || []).map((s: any) => ({
        name: s.name || '',
        rating: s.rating || 0,
        distance: s.distance || 0,
        level: s.level || s.grades || '',
        type: s.type || s.grades || '',
        link: s.link || '',
      })),
      priceHistory: (det.priceHistory || []).map((p: any) => ({
        date: p.date || '',
        event: p.event || '',
        price: p.price || 0,
        source: p.source || '',
      })),
      statusText: l.raw?.statusText || 'For Sale',
      flexText: l.raw?.flexFieldText || '',
    };
  });

  const counts = mapped.map((p) => {
    const [lng, lat] = p.coordinates;
    return countCrimesWithinMiles(lng, lat, crimePoints, CRIME_RISK_RADIUS_MILES);
  });
  const { lowMax, medMax } = tertileThresholds(counts);

  return mapped.map((p, i) => {
    const crimeIncidentCount = counts[i]!;
    return {
      ...p,
      crimeIncidentCount,
      crimeRiskRadiusMiles: CRIME_RISK_RADIUS_MILES,
      crimeRiskLevel: crimeRiskLevelFromTertiles(crimeIncidentCount, lowMax, medMax),
    };
  });
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function hashStringToUInt32(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pseudoSchoolCoordinates(seed: string): [number, number] {
  const centerLng = -111.891;
  const centerLat = 40.7608;
  const h = hashStringToUInt32(seed);
  const angle = (h % 360) * (Math.PI / 180);
  const radiusMiles = 0.4 + ((h >>> 8) % 95) / 10;
  const dLat = (radiusMiles / 69) * Math.sin(angle);
  const dLng =
    (radiusMiles / (69 * Math.max(0.2, Math.cos((centerLat * Math.PI) / 180)))) * Math.cos(angle);
  return [centerLng + dLng, centerLat + dLat];
}

async function insertInChunks(table: string, rows: Record<string, unknown>[], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
    console.log(`[seed] ${table}: inserted ${Math.min(i + chunk.length, rows.length)}/${rows.length}`);
  }
}

async function main() {
  console.log('[seed] starting Supabase seed...');

  const houseFile = join(__dirname, '..', 'data', 'houseList', 'salt-lake-city-for-sale.enriched.json');
  const houseRaw = JSON.parse(readFileSync(houseFile, 'utf-8')) as { listings: any[] };

  const crimeRows = loadCrimeRows();
  const crimePoints: [number, number][] = crimeRows.map((r) => [r.lng as number, r.lat as number]);
  const properties = mapProperties(houseRaw.listings, crimePoints);

  const schoolFile = join(
    __dirname,
    '..',
    'data',
    'schools',
    'salt-lake-city-best-schools.geocoded.json'
  );
  const schoolsRaw = JSON.parse(readFileSync(schoolFile, 'utf-8')) as { schools?: any[] };
  const schoolRows = (Array.isArray(schoolsRaw.schools) ? schoolsRaw.schools : []).map((s, idx) => {
    const hasLng = typeof s.longitude === 'number' && Number.isFinite(s.longitude);
    const hasLat = typeof s.latitude === 'number' && Number.isFinite(s.latitude);
    const [lng, lat] = hasLng && hasLat
      ? [s.longitude, s.latitude]
      : pseudoSchoolCoordinates(`${s.name || ''}|${s.address || ''}|${idx}`);
    const rating = typeof s.rating === 'number' && Number.isFinite(s.rating) ? s.rating : null;
    return {
      lng,
      lat,
      intensity: clamp01((rating ?? 0) / 10),
      name: s.name || '',
      type: s.schoolType || s.sector || 'school',
      rating,
      grade_levels: s.gradeLevels || '',
      level_code: s.levelCode || '',
      address: s.address || '',
      link: s.detailUrl || '',
      page: s.page || 0,
      geocoded: hasLng && hasLat,
    };
  });

  const groceryFile = join(__dirname, '..', 'data', 'groceryList', 'slcGrocery.geojson');
  const groceryRaw = JSON.parse(readFileSync(groceryFile, 'utf-8')) as { features?: any[] };
  const groceryRows = (Array.isArray(groceryRaw.features) ? groceryRaw.features : []).map((feature) => {
    const coords = feature?.geometry?.coordinates ?? [0, 0];
    return {
      lng: Number(coords[0]) || 0,
      lat: Number(coords[1]) || 0,
      type: String(feature?.properties?.TYPE ?? feature?.properties?.type ?? ''),
      name: String(feature?.properties?.NAME ?? feature?.properties?.name ?? ''),
      address: String(feature?.properties?.STREETADDR ?? feature?.properties?.address ?? ''),
      feature,
    };
  });

  const overlayTypes = ['population', 'noise', 'structures'] as const;
  const overlayRows = overlayTypes.map((type) => {
    const filePath = join(__dirname, '..', 'data', 'overlays', `${type}.geojson`);
    const geojson = JSON.parse(readFileSync(filePath, 'utf-8'));
    return { type, geojson };
  });

  // Reset tables for deterministic seed.
  await supabase.from('property_records').delete().neq('id', '');
  await supabase.from('overlay_crime_points').delete().gt('id', 0);
  await supabase.from('overlay_schools_points').delete().gt('id', 0);
  await supabase.from('overlay_grocery_points').delete().gt('id', 0);
  await supabase.from('overlay_geojson').delete().neq('type', '');

  await insertInChunks(
    'property_records',
    properties.map((p) => ({
      id: p.id,
      lng: p.coordinates[0],
      lat: p.coordinates[1],
      payload: p,
    })),
    300
  );
  await insertInChunks('overlay_crime_points', crimeRows, 1000);
  await insertInChunks('overlay_schools_points', schoolRows, 1000);
  await insertInChunks('overlay_grocery_points', groceryRows, 500);

  const { error: overlayError } = await supabase.from('overlay_geojson').upsert(overlayRows, {
    onConflict: 'type',
  });
  if (overlayError) throw overlayError;

  const [{ count: propertiesCount }, { count: crimeCount }, { count: schoolsCount }, { count: groceryCount }] =
    await Promise.all([
      supabase.from('property_records').select('*', { count: 'exact', head: true }),
      supabase.from('overlay_crime_points').select('*', { count: 'exact', head: true }),
      supabase.from('overlay_schools_points').select('*', { count: 'exact', head: true }),
      supabase.from('overlay_grocery_points').select('*', { count: 'exact', head: true }),
    ]);

  console.log('[seed] done');
  console.log(
    JSON.stringify(
      {
        properties: propertiesCount ?? 0,
        crime: crimeCount ?? 0,
        schools: schoolsCount ?? 0,
        grocery: groceryCount ?? 0,
        overlays: overlayRows.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});

