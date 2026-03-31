import { Router } from 'express';
import properties from '../data/properties.json' with { type: 'json' };
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import proj4 from 'proj4';

const __dirname = dirname(fileURLToPath(import.meta.url));

// EPSG:3566 (NAD83 / Utah Central, ft) → WGS84
const UTAH_CENTRAL =
  '+proj=lcc +lat_0=38.3333333333333 +lon_0=-111.5 +lat_1=40.65 +lat_2=39.0166666666667 +x_0=500000.00001016 +y_0=2000000.00001016 +datum=NAD83 +units=us-ft +no_defs';

export const propertiesRouter = Router();

// Cache processed crime GeoJSON
let crimeGeoJSON: object | null = null;

function loadCrimeGeoJSON() {
  if (crimeGeoJSON) return crimeGeoJSON;

  const filePath = join(__dirname, '..', 'data', 'overlays', 'crime_slc.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  const features = raw.layers[0].features;

  const points = features
    .map((f: { geometry: { x: number; y: number }; attributes: Record<string, unknown> }) => {
      const [lng, lat] = proj4(UTAH_CENTRAL, 'EPSG:4326', [f.geometry.x, f.geometry.y]);
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
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
  console.log(`Loaded ${points.length} real crime incidents from crime_slc.json`);
  return crimeGeoJSON;
}

propertiesRouter.get('/', (_req, res) => {
  res.json(properties);
});

propertiesRouter.get('/overlays/:type', (req, res) => {
  const { type } = req.params;
  const validTypes = ['crime', 'schools', 'population', 'noise'];

  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid overlay type. Must be one of: ${validTypes.join(', ')}` });
    return;
  }

  // Use real crime data from crime_slc.json
  if (type === 'crime') {
    try {
      const data = loadCrimeGeoJSON();
      res.json(data);
      return;
    } catch (e) {
      console.error('Failed to load real crime data, falling back to mock:', e);
    }
  }

  // Other overlays use mock geojson files
  try {
    const filePath = join(__dirname, '..', 'data', 'overlays', `${type}.geojson`);
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch {
    res.status(404).json({ error: `Overlay data for '${type}' not found` });
  }
});
