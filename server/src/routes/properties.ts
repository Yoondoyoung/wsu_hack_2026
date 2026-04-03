import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
import { supabase } from '../lib/supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const propertiesRouter = Router();

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

const PAGE_SIZE = 1000;

type GenericRow = Record<string, unknown>;

async function selectAllRows(table: string, columns: string): Promise<GenericRow[]> {
  const rows: GenericRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase.from(table).select(columns).range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as GenericRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

let cachedProperties: GenericRow[] | null = null;

async function loadPropertiesFromSupabase(): Promise<GenericRow[]> {
  if (cachedProperties) return cachedProperties;
  const rows = await selectAllRows('property_records', 'payload');
  cachedProperties = rows
    .map((row) => row.payload)
    .filter((payload): payload is GenericRow => Boolean(payload && typeof payload === 'object'));
  console.log(`Loaded ${cachedProperties.length} properties from Supabase`);
  return cachedProperties;
}

propertiesRouter.get('/', async (_req, res) => {
  try {
    const properties = await loadPropertiesFromSupabase();
    res.json(properties);
  } catch (error) {
    console.error('Failed to load properties from Supabase:', error);
    res.status(500).json({ error: 'Failed to load properties' });
  }
});

// Overlay routes
let crimeGeoJSON: object | null = null;
let schoolsGeoJSON: object | null = null;
let groceryGeoJSON: object | null = null;
const geojsonByType = new Map<string, object>();
let structuresTileIndex: any | null = null;

async function loadCrimeGeoJSON() {
  if (crimeGeoJSON) return crimeGeoJSON;
  const rows = await selectAllRows(
    'overlay_crime_points',
    'lng, lat, intensity, crime_type, crime, division, occurred_at'
  );
  const features = rows.map((row) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.lng, row.lat] },
      properties: {
        intensity: row.intensity,
        crime_type: row.crime_type,
        crime: row.crime,
        division: row.division,
        date: row.occurred_at,
      },
    }));
  crimeGeoJSON = { type: 'FeatureCollection', features };
  console.log(`Loaded ${features.length} crime incidents from Supabase`);
  return crimeGeoJSON;
}

async function loadSchoolsGeoJSON() {
  if (schoolsGeoJSON) return schoolsGeoJSON;
  const rows = await selectAllRows(
    'overlay_schools_points',
    'lng, lat, intensity, name, type, rating, grade_levels, level_code, address, link, page, geocoded'
  );
  const features = rows.map((row) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.lng, row.lat] },
      properties: {
        intensity: row.intensity,
        name: row.name,
        type: row.type,
        rating: row.rating ?? undefined,
        gradeLevels: row.grade_levels,
        levelCode: row.level_code,
        address: row.address,
        link: row.link,
        page: row.page,
        geocoded: row.geocoded,
      },
    }));
  schoolsGeoJSON = { type: 'FeatureCollection', features };
  console.log(`Loaded ${features.length} schools from Supabase`);
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

propertiesRouter.get('/nearby-grocery', async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const miles = parseFloat((req.query.miles as string) ?? '1.0');

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat and lng are required' });
    return;
  }

  try {
    const rows = await selectAllRows('overlay_grocery_points', 'id, lng, lat, feature, type');

    const results = rows
      .filter((f) => {
        const type = typeof f.type === 'string' ? f.type : undefined;
        return type && NEARBY_GROCERY_TYPES.has(type);
      })
      .map((f) => {
        const fLng = Number(f.lng);
        const fLat = Number(f.lat);
        const feature = (f.feature ?? {}) as {
          type?: string;
          geometry?: { type?: string; coordinates?: [number, number] };
          properties?: Record<string, unknown>;
        };
        return {
          id: f.id,
          type: feature.type ?? 'Feature',
          geometry: feature.geometry ?? { type: 'Point', coordinates: [fLng, fLat] },
          properties: {
            ...(feature.properties ?? {}),
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

propertiesRouter.get('/overlays/:type', async (req, res) => {
  const { type } = req.params;
  const validTypes = ['crime', 'schools', 'grocery', 'population', 'noise', 'structures'];

  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid overlay type` });
    return;
  }

  if (type === 'crime') {
    try {
      res.json(await loadCrimeGeoJSON());
      return;
    } catch (e) {
      console.error('Failed to load crime data from Supabase:', e);
      res.status(500).json({ error: 'Failed to load crime overlay' });
      return;
    }
  }

  if (type === 'schools') {
    try {
      res.json(await loadSchoolsGeoJSON());
      return;
    } catch (e) {
      console.error('Failed to load schools data from Supabase:', e);
      res.status(500).json({ error: 'Failed to load schools overlay' });
      return;
    }
  }

  if (type === 'grocery') {
    try {
      if (!groceryGeoJSON) {
        const rows = await selectAllRows('overlay_grocery_points', 'feature');
        groceryGeoJSON = {
          type: 'FeatureCollection',
          features: rows
            .map((row) => row.feature)
            .filter((feature): feature is object => Boolean(feature && typeof feature === 'object')),
        };
      }
      res.json(groceryGeoJSON);
      return;
    } catch (e) {
      console.error('Failed to load grocery overlay from Supabase:', e);
      res.status(404).json({ error: 'Grocery overlay data not found' });
      return;
    }
  }

  try {
    if (!geojsonByType.has(type)) {
      const { data, error } = await supabase
        .from('overlay_geojson')
        .select('geojson')
        .eq('type', type)
        .maybeSingle();
      if (error) throw error;
      if (!data?.geojson) {
        res.status(404).json({ error: `Overlay data for '${type}' not found` });
        return;
      }
      geojsonByType.set(type, data.geojson as object);
    }
    const data = geojsonByType.get(type)!;
    res.json(data);
  } catch (error) {
    console.error(`Failed to load '${type}' overlay from Supabase:`, error);
    res.status(404).json({ error: `Overlay data for '${type}' not found` });
  }
});
