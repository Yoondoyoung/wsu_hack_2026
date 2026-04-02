import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import proj4 from 'proj4';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';

const __dirname = dirname(fileURLToPath(import.meta.url));

const UTAH_CENTRAL =
  '+proj=lcc +lat_0=38.3333333333333 +lon_0=-111.5 +lat_1=40.65 +lat_2=39.0166666666667 +x_0=500000.00001016 +y_0=2000000.00001016 +datum=NAD83 +units=us-ft +no_defs';

export const propertiesRouter = Router();

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

/** Sqft is sometimes null in source JSON; fall back to raw/homeInfo/detail. */
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

/**
 * Local neighborhood radius for incident counts. The crime overlay is a long-run
 * cumulative layer, so raw counts inside a large radius (e.g. 2 mi) are huge for
 * almost every listing; 0.5 mi keeps a walkable “nearby” scale.
 */
const CRIME_RISK_RADIUS_MILES = 0.5;

/** Great-circle distance in miles (WGS84). */
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

/** Crime points as [lng, lat] from the same source as the crime overlay. */
function getCrimeLngLatPoints(): [number, number][] {
  const filePath = join(__dirname, '..', 'data', 'overlays', 'crime_slc.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  const features = raw.layers[0].features as { geometry: { x: number; y: number } }[];
  return features.map((f) => {
    const [lng, lat] = proj4(UTAH_CENTRAL, 'EPSG:4326', [f.geometry.x, f.geometry.y]);
    return [lng, lat] as [number, number];
  });
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

/** Tertile cutoffs on sorted counts (same batch): ~33% low / ~33% medium / ~33% high. */
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

function enrichWithCrimeRisk(listings: any[]): any[] {
  let points: [number, number][];
  try {
    points = getCrimeLngLatPoints();
  } catch (e) {
    console.warn('Crime file missing; crimeRiskLevel defaults to low.', e);
    return listings.map((p) => ({
      ...p,
      crimeIncidentCount: 0,
      crimeRiskRadiusMiles: CRIME_RISK_RADIUS_MILES,
      crimeRiskLevel: 'low' as const,
    }));
  }
  console.log(
    `Crime risk: ${points.length} incidents in indexer, radius ${CRIME_RISK_RADIUS_MILES} mi, tertiles within batch`
  );
  const counts = listings.map((p) => {
    const [lng, lat] = p.coordinates as [number, number];
    return countCrimesWithinMiles(lng, lat, points, CRIME_RISK_RADIUS_MILES);
  });
  const { lowMax, medMax } = tertileThresholds(counts);
  return listings.map((p, i) => {
    const crimeIncidentCount = counts[i]!;
    return {
      ...p,
      crimeIncidentCount,
      crimeRiskRadiusMiles: CRIME_RISK_RADIUS_MILES,
      crimeRiskLevel: crimeRiskLevelFromTertiles(crimeIncidentCount, lowMax, medMax),
    };
  });
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

// Load and transform enriched Zillow data
function loadProperties() {
  const filePath = join(__dirname, '..', 'data', 'houseList', 'salt-lake-city-for-sale.enriched.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));

  const mapped = raw.listings.map((l: any) => {
    const det = l.detail || {};
    const info = l.raw?.hdpData?.homeInfo || {};
    const photos = extractPhotoUrls(l);
    const latitude = typeof l.latitude === 'number' ? l.latitude : typeof info.latitude === 'number' ? info.latitude : 40.7608;
    const longitude = typeof l.longitude === 'number' ? l.longitude : typeof info.longitude === 'number' ? info.longitude : -111.891;

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
      coordinates: [longitude, latitude],
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

  return enrichWithCrimeRisk(mapped);
}

let cachedProperties: any[] | null = null;

propertiesRouter.get('/', (_req, res) => {
  if (!cachedProperties) {
    const loadedProperties = loadProperties();
    cachedProperties = loadedProperties;
    console.log(`Loaded ${loadedProperties.length} properties from enriched Zillow data`);
  }
  const properties = cachedProperties ?? [];
  res.json(properties);
});

// Overlay routes
let crimeGeoJSON: object | null = null;
let schoolsGeoJSON: object | null = null;
let structuresTileIndex: any | null = null;

function loadCrimeGeoJSON() {
  if (crimeGeoJSON) return crimeGeoJSON;
  const filePath = join(__dirname, '..', 'data', 'overlays', 'crime_slc.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  const features = raw.layers[0].features;
  const points = features.map((f: any) => {
    const [lng, lat] = proj4(UTAH_CENTRAL, 'EPSG:4326', [f.geometry.x, f.geometry.y]);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        intensity: f.attributes.crime_type === 'Violent' ? 1.0 : 0.6,
        crime_type: f.attributes.crime_type,
        crime: f.attributes.crime,
        division: f.attributes.division,
        date: f.attributes.date_t,
      },
    };
  });
  crimeGeoJSON = { type: 'FeatureCollection', features: points };
  console.log(`Loaded ${points.length} real crime incidents`);
  return crimeGeoJSON;
}

type BestSchoolRecord = {
  name?: string;
  detailUrl?: string;
  rating?: number;
  address?: string;
  schoolType?: string;
  sector?: string;
  gradeLevels?: string;
  levelCode?: string;
  page?: number;
  longitude?: number;
  latitude?: number;
};

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

/**
 * The GreatSchools dump currently has no lat/lng, so we create stable pseudo-points
 * around Salt Lake City center until a true geocoding step is added.
 */
function pseudoSchoolCoordinates(seed: string): [number, number] {
  const centerLng = -111.891;
  const centerLat = 40.7608;
  const h = hashStringToUInt32(seed);
  const angle = (h % 360) * (Math.PI / 180);
  const radiusMiles = 0.4 + ((h >>> 8) % 95) / 10; // 0.4 ~ 9.8 mi
  const dLat = (radiusMiles / 69) * Math.sin(angle);
  const dLng = (radiusMiles / (69 * Math.max(0.2, Math.cos((centerLat * Math.PI) / 180)))) * Math.cos(angle);
  return [centerLng + dLng, centerLat + dLat];
}

function loadSchoolsGeoJSON() {
  if (schoolsGeoJSON) return schoolsGeoJSON;
  const filePath = join(__dirname, '..', 'data', 'schools', 'salt-lake-city-best-schools.geocoded.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as { schools?: BestSchoolRecord[] };
  const schools = Array.isArray(raw.schools) ? raw.schools : [];
  const features = schools.map((s, idx) => {
    const rating = typeof s.rating === 'number' && Number.isFinite(s.rating) ? s.rating : null;
    const hasLng = typeof s.longitude === 'number' && Number.isFinite(s.longitude);
    const hasLat = typeof s.latitude === 'number' && Number.isFinite(s.latitude);
    const [lng, lat] = hasLng && hasLat
      ? [s.longitude, s.latitude]
      : pseudoSchoolCoordinates(`${s.name || ''}|${s.address || ''}|${idx}`);
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        intensity: clamp01((rating ?? 0) / 10),
        name: s.name || '',
        type: s.schoolType || s.sector || 'school',
        rating: rating ?? undefined,
        gradeLevels: s.gradeLevels || '',
        levelCode: s.levelCode || '',
        address: s.address || '',
        link: s.detailUrl || '',
        page: s.page || 0,
        geocoded: hasLng && hasLat,
      },
    };
  });
  schoolsGeoJSON = { type: 'FeatureCollection', features };
  console.log(`Loaded ${features.length} schools from geocoded best-schools dataset`);
  return schoolsGeoJSON;
}

function loadStructuresTileIndex() {
  if (structuresTileIndex) return structuresTileIndex;
  const fullPath = join(__dirname, '..', 'data', 'overlays', 'structures_polygons.full.geojson');
  const fallbackPath = join(__dirname, '..', 'data', 'overlays', 'structures_polygons.geojson');
  const filePath = existsSync(fullPath) ? fullPath : fallbackPath;
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  structuresTileIndex = geojsonvt(data, {
    maxZoom: 18,
    indexMaxZoom: 15,
    indexMaxPoints: 0,
    tolerance: 1,
    extent: 4096,
    buffer: 128,
    lineMetrics: false,
    generateId: false,
  });
  console.log(`Loaded structures vector-tile index from ${filePath.split('/').pop()}`);
  return structuresTileIndex;
}

propertiesRouter.get('/overlays/structures/tiles/:z/:x/:y.pbf', (req, res) => {
  try {
    const z = Number.parseInt(req.params.z, 10);
    const x = Number.parseInt(req.params.x, 10);
    const y = Number.parseInt(req.params.y, 10);

    if ([z, x, y].some(Number.isNaN)) {
      res.status(400).json({ error: 'Invalid tile coordinates' });
      return;
    }

    const tileIndex = loadStructuresTileIndex();
    const tile = tileIndex.getTile(z, x, y);

    if (!tile) {
      res.status(204).end();
      return;
    }

    const buffer = vtpbf.fromGeojsonVt({ structures: tile });
    res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Failed to generate structure vector tile:', error);
    res.status(500).json({ error: 'Failed to generate structure vector tile' });
  }
});

const NEARBY_GROCERY_TYPES = new Set([
  'Grocery Store',
  'Supermarket',
  'Health Food',
  'Specialty Grocery',
]);

propertiesRouter.get('/nearby-grocery', (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const miles = parseFloat((req.query.miles as string) ?? '1.0');

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat and lng are required' });
    return;
  }

  try {
    const filePath = join(__dirname, '..', 'data', 'groceryList', 'slcGrocery.geojson');
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      features: { type: string; geometry: { coordinates: [number, number] }; properties: Record<string, unknown> }[];
    };

    const results = raw.features
      .filter((f) => {
        const type = f.properties?.TYPE as string | undefined;
        return type && NEARBY_GROCERY_TYPES.has(type);
      })
      .map((f) => {
        const [fLng, fLat] = f.geometry.coordinates;
        return {
          ...f,
          properties: {
            ...f.properties,
            distanceMiles: Math.round(haversineMiles(lat, lng, fLat, fLng) * 100) / 100,
          },
        };
      })
      .filter((f) => (f.properties.distanceMiles as number) <= miles)
      .sort((a, b) => (a.properties.distanceMiles as number) - (b.properties.distanceMiles as number))
      .slice(0, 8);

    res.json({ type: 'FeatureCollection', features: results });
  } catch (e) {
    console.error('nearby-grocery error:', e);
    res.status(500).json({ error: 'Failed to query nearby grocery' });
  }
});

propertiesRouter.get('/overlays/:type', (req, res) => {
  const { type } = req.params;
  const validTypes = ['crime', 'schools', 'grocery', 'population', 'noise', 'structures'];

  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid overlay type` });
    return;
  }

  if (type === 'crime') {
    try {
      res.json(loadCrimeGeoJSON());
      return;
    } catch (e) {
      console.error('Failed to load real crime data:', e);
    }
  }

  if (type === 'schools') {
    try {
      res.json(loadSchoolsGeoJSON());
      return;
    } catch (e) {
      console.error('Failed to load schools data from best-schools JSON:', e);
    }
  }

  if (type === 'grocery') {
    try {
      const path = join(__dirname, '..', 'data', 'groceryList', 'slcGrocery.geojson');
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
      // RFC 7946 / Mapbox: omit legacy `crs` member from huge file
      const { crs: _omit, ...geo } = raw;
      res.json(geo);
      return;
    } catch (e) {
      console.error('Failed to load grocery GeoJSON:', e);
      res.status(404).json({ error: 'Grocery overlay data not found' });
      return;
    }
  }

  try {
    const filePath = join(__dirname, '..', 'data', 'overlays', `${type}.geojson`);
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch {
    res.status(404).json({ error: `Overlay data for '${type}' not found` });
  }
});
