import { useRef, useState, useEffect, useCallback, memo, useMemo } from 'react';
import Map, { Source, Layer, Marker, Popup, type MapRef } from 'react-map-gl/mapbox';
import type { LayerProps } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapViewMode, OverlayType } from '../../types/map';
import type { Property } from '../../types/property';
import type { MapPriceMode } from '../../App';
import { fetchOverlay } from '../../services/api';
import { formatPrice, formatPriceCompact, formatSqft } from '../../utils/formatters';
import { crimeRiskLabel } from '../../utils/crimeRisk';
import { colors, glass } from '../../design';

/** Matches `structures-fill` OCC_CLS → fill-color in this file */
const STRUCTURE_FOOTPRINT_LEGEND: { label: string; color: string }[] = [
  { label: 'Residential', color: '#22c55e' },
  { label: 'Government', color: '#3b82f6' },
  { label: 'Commercial', color: '#ef4444' },
  { label: 'Education', color: '#facc15' },
  { label: 'Industrial', color: '#6b7280' },
  { label: 'Other / unknown', color: '#4b5563' },
];

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

const SLC_CENTER = { longitude: -111.891, latitude: 40.7608, zoom: 12 };

const MAP_STYLES: Record<MapViewMode, string> = {
  default: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  '3d': 'mapbox://styles/mapbox/dark-v11',
};

/** Large statewide file: load via URL so Mapbox fetches/parses off the React state path (avoids freezing other layers). */
const GROCERY_GEOJSON_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/properties/overlays/grocery`
    : '/api/properties/overlays/grocery';

// Heatmap color ramps aligned with design.ts
const OVERLAY_COLORS: Record<OverlayType, string[]> = {
  crime:      ['rgba(0,0,0,0)', '#7f1d1d', '#ff4060', colors.red],
  schools:    ['rgba(0,0,0,0)', '#064e3b', '#00b862', colors.emerald],
  grocery:    ['rgba(0,0,0,0)', '#422006', '#ea580c', '#fb923c'],
  population: ['rgba(0,0,0,0)', '#3b2000', '#d47f00', colors.yellow],
  noise:      ['rgba(0,0,0,0)', '#2e1065', '#7c3aed', '#c084fc'],
  structures: ['rgba(0,0,0,0)', '#0c3f5c', '#0090c8', colors.cyan],
};

function heatmapLayer(id: OverlayType): LayerProps {
  const colors = OVERLAY_COLORS[id];
  return {
    id: `heatmap-${id}`,
    type: 'heatmap',
    paint: {
      'heatmap-weight': ['get', 'intensity'],
      'heatmap-radius': 40,
      'heatmap-opacity': 0.72,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, colors[0],
        0.2, colors[1],
        0.6, colors[2],
        1, colors[3],
      ],
    },
  };
}

interface Props {
  viewMode: MapViewMode;
  activeOverlays: Set<OverlayType>;
  properties: Property[];
  selectedId: string | null;
  onSelectProperty: (id: string) => void;
  onMarkerScreenPosition?: (pos: { x: number; y: number } | null) => void;
  mapPriceMode: MapPriceMode;
  netMonthlyMap: Map<string, number> | null;
  schoolAgeGroups: Array<'elementary' | 'middle' | 'high'>;
  schoolRadiusMiles: number;
  groceryRadiusMiles: number;
  activeRoute?: {
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    toCoordinates: [number, number];
    toName: string;
    toAddress: string;
    sourcePropertyAddress: string;
  } | null;
  onClearRoute?: () => void;
  onReopenDetail?: () => void;
}

interface CrimePopupData {
  longitude: number;
  latitude: number;
  crimeType?: string;
  crime?: string;
  division?: string;
  date?: string;
}

interface SchoolPopupData {
  longitude: number;
  latitude: number;
  name?: string;
  rating?: number | null;
  type?: string;
  gradeLevels?: string;
  address?: string;
  link?: string;
}

interface GroceryPopupData {
  longitude: number;
  latitude: number;
  name?: string;
  address?: string;
  type?: string;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

function schoolMatchesAgeFeature(
  props: Record<string, unknown>,
  group: 'elementary' | 'middle' | 'high',
): boolean {
  const blob = `${String(props.gradeLevels ?? '')} ${String(props.levelCode ?? '')} ${String(props.type ?? '')}`.toLowerCase();
  if (group === 'elementary') {
    return /\belementary\b|\bpk\b|\bk-?6\b|\b1-?6\b|\bk-?5\b/.test(blob);
  }
  if (group === 'middle') {
    return /\bmiddle\b|\bjunior\b|\b6-?8\b|\b7-?8\b/.test(blob);
  }
  return /\bhigh\b|\b9-?12\b/.test(blob);
}

function GlowMarker({
  property,
  selected,
  onClick,
  label: labelOverride,
}: {
  property: Property;
  selected: boolean;
  onClick: () => void;
  label?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const photo = property.photos?.[0] || property.imageUrl;
  const label = labelOverride ?? formatPriceCompact(property.price);

  return (
    <div
      className="relative cursor-pointer"
      style={{ zIndex: hovered || selected ? 100 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Price pill */}
      <div
        style={{
          padding: selected ? '4px 9px' : '3px 7px',
          borderRadius: 20,
          fontSize: selected ? 12 : 11,
          fontWeight: 700,
          letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
          color: selected ? '#0a0f1a' : colors.cyan,
          background: selected
            ? colors.cyan
            : 'rgba(0,200,255,0.12)',
          border: `1.5px solid ${selected ? colors.cyan : 'rgba(0,200,255,0.45)'}`,
          boxShadow: selected
            ? `0 0 0 3px rgba(0,200,255,0.22), 0 0 18px rgba(0,200,255,0.6)`
            : hovered
              ? `0 0 14px rgba(0,200,255,0.5)`
              : `0 0 8px rgba(0,200,255,0.3)`,
          transition: 'all 0.18s ease',
          transform: hovered && !selected ? 'scale(1.08) translateY(-1px)' : 'scale(1)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {label}
      </div>

      {/* Hover tooltip */}
      {hovered && !selected && (
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 200,
            padding: 10,
            zIndex: 9999,
            background: colors.bgTooltip,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {photo && (
            <img
              src={photo}
              alt={property.streetAddress}
              className="w-full rounded-lg mb-2 object-cover"
              style={{ height: 90 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <p className="font-bold text-sm leading-tight" style={{ color: colors.cyan }}>
            {formatPrice(property.price)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: colors.whiteMuted }}>
            {property.beds}bd · {property.baths}ba · {formatSqft(property.sqft)} sqft
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: colors.whiteSubtle }}>
            {crimeRiskLabel(property.crimeRiskLevel)} · {property.crimeIncidentCount ?? 0} within {property.crimeRiskRadiusMiles ?? 0.5} mi
          </p>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: colors.whiteSubtle }}>
            {property.streetAddress}
          </p>
        </div>
      )}
    </div>
  );
}

interface ViewBounds {
  minLng: number; maxLng: number; minLat: number; maxLat: number;
}

function getBoundsFromMap(map: ReturnType<MapRef['getMap']>, padFraction = 0.12): ViewBounds | null {
  const b = map.getBounds();
  if (!b) return null;
  const lngPad = (b.getEast() - b.getWest()) * padFraction;
  const latPad = (b.getNorth() - b.getSouth()) * padFraction;
  return {
    minLng: b.getWest() - lngPad,
    maxLng: b.getEast() + lngPad,
    minLat: b.getSouth() - latPad,
    maxLat: b.getNorth() + latPad,
  };
}

function MapViewInner({
  viewMode,
  activeOverlays,
  properties,
  selectedId,
  onSelectProperty,
  onMarkerScreenPosition,
  mapPriceMode,
  netMonthlyMap,
  schoolAgeGroups,
  schoolRadiusMiles,
  groceryRadiusMiles,
  activeRoute,
  onClearRoute,
  onReopenDetail,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const [overlayData, setOverlayData] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const overlayDataRef = useRef(overlayData);
  overlayDataRef.current = overlayData;
  const overlayIdsKey = useMemo(
    () => Array.from(activeOverlays).sort().join(','),
    [activeOverlays]
  );
  const [crimePopup, setCrimePopup] = useState<CrimePopupData | null>(null);
  const [schoolPopup, setSchoolPopup] = useState<SchoolPopupData | null>(null);
  const [groceryPopup, setGroceryPopup] = useState<GroceryPopupData | null>(null);
  const [nearbyGroceryData, setNearbyGroceryData] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const structuresTileUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/properties/overlays/structures/tiles/{z}/{x}/{y}.pbf`
      : '/api/properties/overlays/structures/tiles/{z}/{x}/{y}.pbf';
  const [viewState, setViewState] = useState({
    ...SLC_CENTER,
    pitch: 0,
    bearing: 0,
  });
  const [viewBounds, setViewBounds] = useState<ViewBounds | null>(null);
  const selectedProperty = useMemo(
    () => (selectedId ? properties.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, properties],
  );
  const schoolFocusEnabled = Boolean(selectedProperty && schoolAgeGroups.length > 0 && schoolRadiusMiles > 0);
  const groceryFocusEnabled = Boolean(selectedProperty && groceryRadiusMiles > 0);

  // Update pitch when view mode changes
  useEffect(() => {
    setViewState((prev) => ({ ...prev, pitch: viewMode === '3d' ? 60 : 0 }));
  }, [viewMode]);

  // Fly to selected property — keep current zoom if already closer than the focus floor (avoid zoom-out).
  useEffect(() => {
    if (selectedProperty && mapRef.current) {
      const map = mapRef.current.getMap();
      const currentZoom = map.getZoom();
      const focusFloor = 15;
      mapRef.current.flyTo({
        center: [selectedProperty.coordinates[0], selectedProperty.coordinates[1]],
        zoom: Math.max(currentZoom, focusFloor),
        duration: 450,
        essential: true,
        offset: [-185, 0],
      });
    }
  }, [selectedProperty]);

  // Fit map to show full walking route when activeRoute is set
  useEffect(() => {
    if (!activeRoute || !mapRef.current) return;
    const coords = activeRoute.geometry.coordinates;
    if (coords.length === 0) return;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const bbox: [number, number, number, number] = [
      Math.min(...lngs), Math.min(...lats),
      Math.max(...lngs), Math.max(...lats),
    ];
    mapRef.current.fitBounds(bbox, {
      padding: { top: 150, bottom: 150, left: 500, right: 500 },
      duration: 800,
      essential: true,
    });
  }, [activeRoute]);

  // rAF loop: report selected marker screen position
  useEffect(() => {
    if (!onMarkerScreenPosition) return;
    const cb = onMarkerScreenPosition;
    let rafId = 0;
    const property = selectedProperty;

    function tick() {
      if (property && mapRef.current) {
        const map = mapRef.current.getMap();
        if (map) {
          const pt = map.project([property.coordinates[0], property.coordinates[1]]);
          cb({ x: pt.x, y: pt.y });
        }
      } else {
        cb(null);
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [selectedProperty, onMarkerScreenPosition]);

  // Fetch overlay GeoJSON when needed (active layer OR focused-radius view needs schools).
  useEffect(() => {
    const overlaysToFetch = new Set(activeOverlays);
    if (schoolFocusEnabled) overlaysToFetch.add('schools');
    overlaysToFetch.forEach((overlay) => {
      if (overlay === 'grocery') return; // URL-backed source; do not pull multi‑MB JSON into React state
      if (overlay === 'structures') return; // vector tiles only; no overview GeoJSON dots
      if (overlayDataRef.current[overlay]) return;
      fetchOverlay(overlay)
        .then((data) => {
          setOverlayData((prev) => ({ ...prev, [overlay]: data }));
        })
        .catch((err) => {
          console.error(`[MapView] Failed to load overlay "${overlay}"`, err);
        });
    });
  }, [overlayIdsKey, activeOverlays, schoolFocusEnabled]); // overlayIdsKey: stable trigger when overlay set changes

  useEffect(() => {
    if (!groceryFocusEnabled || !selectedProperty) {
      setNearbyGroceryData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const [lng, lat] = selectedProperty.coordinates;
    fetch(`/api/properties/nearby-grocery?lat=${lat}&lng=${lng}&miles=${groceryRadiusMiles}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.type === 'FeatureCollection' && Array.isArray(data?.features)) {
          setNearbyGroceryData(data as GeoJSON.FeatureCollection);
          return;
        }
        setNearbyGroceryData({ type: 'FeatureCollection', features: [] });
      })
      .catch(() => setNearbyGroceryData({ type: 'FeatureCollection', features: [] }));
  }, [groceryFocusEnabled, selectedProperty, groceryRadiusMiles]);

  // Only render markers visible in the current viewport (+12% padding to avoid pop-in at edges).
  // The selected marker is always included so it stays visible even after fly-to.
  const visibleProperties = useMemo(() => {
    if (!viewBounds) return properties;
    const { minLng, maxLng, minLat, maxLat } = viewBounds;
    return properties.filter((p) => {
      if (p.id === selectedId) return true; // always show selected
      const [lng, lat] = p.coordinates;
      return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
    });
  }, [properties, viewBounds, selectedId]);

  const focusedSchoolData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!schoolFocusEnabled || !selectedProperty) {
      return { type: 'FeatureCollection', features: [] };
    }
    const schools = overlayData.schools;
    if (!schools?.features?.length) {
      return { type: 'FeatureCollection', features: [] };
    }
    const [lng, lat] = selectedProperty.coordinates;
    const features = schools.features.filter((f) => {
      if (f.geometry?.type !== 'Point') return false;
      const coords = f.geometry.coordinates as number[] | undefined;
      if (!coords || coords.length < 2) return false;
      const d = haversineMiles(lat, lng, Number(coords[1]), Number(coords[0]));
      if (!Number.isFinite(d) || d > schoolRadiusMiles) return false;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      return schoolAgeGroups.some((group) => schoolMatchesAgeFeature(props, group));
    });
    return { type: 'FeatureCollection', features };
  }, [schoolFocusEnabled, selectedProperty, overlayData.schools, schoolRadiusMiles, schoolAgeGroups]);

  const handleMarkerClick = useCallback(
    (id: string) => {
      onSelectProperty(id);
    },
    [onSelectProperty]
  );

  const handleMapClick = useCallback((evt: any) => {
    const schoolFeature = evt.features?.find((f: any) =>
      f.layer?.id === 'schools-points' || f.layer?.id === 'schools-focus-points',
    );
    if (schoolFeature) {
      const coords = schoolFeature.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const props = schoolFeature.properties ?? {};
        setSchoolPopup({
          longitude: coords[0],
          latitude: coords[1],
          name: props.name,
          rating: props.rating != null && Number.isFinite(Number(props.rating))
            ? Number(props.rating)
            : null,
          type: props.type,
          gradeLevels: props.gradeLevels,
          address: props.address,
          link: props.link,
        });
        setCrimePopup(null);
        setGroceryPopup(null);
        return;
      }
    }

    const groceryFeature = evt.features?.find((f: any) =>
      f.layer?.id === 'grocery-points' || f.layer?.id === 'grocery-focus-points',
    );
    if (groceryFeature) {
      const coords = groceryFeature.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const props = groceryFeature.properties ?? {};
        const name = props.name ?? props.NAME;
        const address = props.address ?? props.STREETADDR;
        const typeStr = props.type ?? props.TYPE;
        setGroceryPopup({
          longitude: coords[0],
          latitude: coords[1],
          name: typeof name === 'string' ? name : undefined,
          address: typeof address === 'string' ? address : undefined,
          type: typeof typeStr === 'string' ? typeStr : undefined,
        });
        setCrimePopup(null);
        setSchoolPopup(null);
        return;
      }
    }

    const feature = evt.features?.find((f: any) => f.layer?.id === 'crime-points');
    if (!feature) return;

    const coords = feature.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;

    const props = feature.properties ?? {};
    setCrimePopup({
      longitude: coords[0],
      latitude: coords[1],
      crimeType: props.crime_type,
      crime: props.crime,
      division: props.division,
      date: props.date,
    });
    setSchoolPopup(null);
    setGroceryPopup(null);
  }, []);

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(evt) => {
          setViewState(evt.viewState);
          if (mapRef.current) {
            const b = getBoundsFromMap(mapRef.current.getMap());
            if (b) setViewBounds(b);
          }
        }}
        onLoad={() => {
          if (mapRef.current) {
            const b = getBoundsFromMap(mapRef.current.getMap());
            if (b) setViewBounds(b);
          }
        }}
        onClick={handleMapClick}
        interactiveLayerIds={[
          ...(activeOverlays.has('crime') ? ['crime-points'] : []),
          ...(activeOverlays.has('schools') ? ['schools-points'] : []),
          ...(activeOverlays.has('grocery') ? ['grocery-points'] : []),
          ...(schoolFocusEnabled ? ['schools-focus-points'] : []),
          ...(groceryFocusEnabled ? ['grocery-focus-points'] : []),
        ]}
        mapStyle={MAP_STYLES[viewMode]}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
      >
        {activeOverlays.has('crime') && overlayData.crime && (
          <Source id="source-crime" type="geojson" data={overlayData.crime}>
            <Layer {...heatmapLayer('crime')} />
            <Layer
              id="crime-points"
              type="circle"
              minzoom={12}
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 15, 3, 18, 4],
                'circle-color': ['match', ['get', 'crime_type'], 'Violent', '#ef4444', '#f59e0b'],
                'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.25, 14, 0.45, 18, 0.8],
                'circle-stroke-color': '#111827',
                'circle-stroke-width': 0.5,
              }}
            />
          </Source>
        )}

        {/* Structures: vector tiles only (no zoomed-out overview dots) */}
        {activeOverlays.has('structures') && (
          <Source
            id="source-structures-vt"
            type="vector"
            tiles={[structuresTileUrl]}
            minzoom={10}
            maxzoom={18}
          >
            <Layer
              id="structures-fill"
              type="fill"
              source="source-structures-vt"
              source-layer="structures"
              minzoom={13}
              paint={{
                'fill-color': [
                  'match', ['get', 'OCC_CLS'],
                  'Residential', '#22c55e',
                  'Government', '#3b82f6',
                  'Commercial', '#ef4444',
                  'Education', '#facc15',
                  'Industrial', '#6b7280',
                  '#4b5563',
                ],
                'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.04, 15, 0.1, 18, 0.18],
              }}
            />
            <Layer
              id="structures-outline"
              type="line"
              source="source-structures-vt"
              source-layer="structures"
              minzoom={14}
              paint={{
                'line-color': [
                  'match', ['get', 'OCC_CLS'],
                  'Residential', '#15803d',
                  'Government', '#1d4ed8',
                  'Commercial', '#b91c1c',
                  'Education', '#ca8a04',
                  'Industrial', '#374151',
                  '#1f2937',
                ],
                'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.25, 16, 0.6, 19, 0.9],
                'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 16, 0.9, 19, 1.6],
              }}
            />
          </Source>
        )}

        {activeOverlays.has('grocery') && (
          <Source id="source-grocery" type="geojson" data={GROCERY_GEOJSON_URL}>
            <Layer
              id="grocery-points"
              type="circle"
              minzoom={9}
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 12, 4.5, 16, 7],
                'circle-color': '#fb923c',
                'circle-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.75, 14, 0.9],
                'circle-stroke-color': '#431407',
                'circle-stroke-width': 1,
              }}
            />
          </Source>
        )}

        {schoolFocusEnabled && focusedSchoolData.features.length > 0 && (
          <Source id="source-schools-focus" type="geojson" data={focusedSchoolData}>
            <Layer
              id="schools-focus-points"
              type="circle"
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 13, 6, 16, 8],
                'circle-color': '#34d399',
                'circle-opacity': 0.92,
                'circle-stroke-color': '#ecfeff',
                'circle-stroke-width': 1.2,
              }}
            />
          </Source>
        )}

        {groceryFocusEnabled && nearbyGroceryData.features.length > 0 && (
          <Source id="source-grocery-focus" type="geojson" data={nearbyGroceryData}>
            <Layer
              id="grocery-focus-points"
              type="circle"
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4.5, 13, 6.5, 16, 8.5],
                'circle-color': '#fb923c',
                'circle-opacity': 0.96,
                'circle-stroke-color': '#fff7ed',
                'circle-stroke-width': 1.2,
              }}
            />
          </Source>
        )}

        {/* Other heatmap overlays */}
        {Array.from(activeOverlays).map((overlay) =>
          overlay !== 'structures' && overlay !== 'crime' && overlay !== 'grocery' && overlayData[overlay] ? (
            <Source key={overlay} id={`source-${overlay}`} type="geojson" data={overlayData[overlay]}>
              <Layer {...heatmapLayer(overlay)} />
              {overlay === 'schools' && (
                <Layer
                  id="schools-points"
                  type="circle"
                  minzoom={10}
                  paint={{
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 13, 4, 16, 6],
                    'circle-color': '#22c55e',
                    'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 0.75, 16, 0.9],
                    'circle-stroke-color': '#0f172a',
                    'circle-stroke-width': 0.8,
                  }}
                />
              )}
            </Source>
          ) : null
        )}

        {crimePopup && (
          <Popup
            longitude={crimePopup.longitude}
            latitude={crimePopup.latitude}
            anchor="top"
            onClose={() => setCrimePopup(null)}
            closeOnClick={false}
          >
            <div className="text-xs leading-relaxed min-w-44">
              <p className="font-semibold mb-1" style={{ color: colors.cyan }}>{crimePopup.crimeType || 'Unknown'}</p>
              <p><span style={{ color: colors.whiteSubtle }}>Crime:</span> {crimePopup.crime || 'Unknown'}</p>
              <p><span style={{ color: colors.whiteSubtle }}>Division:</span> {crimePopup.division || 'Unknown'}</p>
              <p><span style={{ color: colors.whiteSubtle }}>Date:</span> {crimePopup.date || 'Unknown'}</p>
            </div>
          </Popup>
        )}

        {schoolPopup && (
          <Popup
            longitude={schoolPopup.longitude}
            latitude={schoolPopup.latitude}
            anchor="top"
            onClose={() => setSchoolPopup(null)}
            closeOnClick={false}
          >
            <div className="text-xs leading-relaxed min-w-56">
              <p className="font-semibold mb-1" style={{ color: colors.cyan }}>
                {schoolPopup.name || 'Unknown school'}
              </p>
              <p><span style={{ color: colors.whiteSubtle }}>Rating:</span> {schoolPopup.rating ?? 'N/A'}</p>
              <p><span style={{ color: colors.whiteSubtle }}>Type:</span> {schoolPopup.type || 'School'}</p>
              <p><span style={{ color: colors.whiteSubtle }}>Grades:</span> {schoolPopup.gradeLevels || 'N/A'}</p>
              <p><span style={{ color: colors.whiteSubtle }}>Address:</span> {schoolPopup.address || 'N/A'}</p>
              {schoolPopup.link && (
                <a
                  href={schoolPopup.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-2 text-[11px] underline"
                  style={{ color: colors.cyan }}
                >
                  View school details
                </a>
              )}
            </div>
          </Popup>
        )}

        {groceryPopup && (
          <Popup
            longitude={groceryPopup.longitude}
            latitude={groceryPopup.latitude}
            anchor="top"
            onClose={() => setGroceryPopup(null)}
            closeOnClick={false}
          >
            <div className="text-xs leading-relaxed min-w-52">
              <p className="font-semibold mb-1" style={{ color: '#fb923c' }}>
                {groceryPopup.name || 'Grocery'}
              </p>
              {groceryPopup.type && (
                <p><span style={{ color: colors.whiteSubtle }}>Type:</span> {groceryPopup.type}</p>
              )}
              {groceryPopup.address && (
                <p><span style={{ color: colors.whiteSubtle }}>Address:</span> {groceryPopup.address}</p>
              )}
            </div>
          </Popup>
        )}

        {/* Walking route layer */}
        {activeRoute && (
          <Source
            id="active-route"
            type="geojson"
            data={{ type: 'Feature' as const, geometry: activeRoute.geometry, properties: {} }}
          >
            <Layer
              id="active-route-casing"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': '#000000', 'line-width': 6, 'line-opacity': 0.4 }}
            />
            <Layer
              id="active-route-line"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{
                'line-color': colors.cyan,
                'line-width': 3.5,
                'line-opacity': 0.9,
                'line-dasharray': [1.5, 1.2],
              }}
            />
          </Source>
        )}

        {/* Route destination popup (grocery store) */}
        {activeRoute && (
          <Popup
            longitude={activeRoute.toCoordinates[0]}
            latitude={activeRoute.toCoordinates[1]}
            anchor="bottom"
            closeButton={false}
            closeOnClick={false}
            offset={14}
            style={{ zIndex: 30 }}
          >
            <div style={{ background: '#1a1a2e', border: `1px solid ${colors.blue}60`, borderRadius: 10, padding: '8px 12px', minWidth: 160, maxWidth: 220, boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 14 }}>🛒</span>
                <p style={{ color: '#e2e2f0', fontSize: 12, fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{activeRoute.toName}</p>
              </div>
              {activeRoute.toAddress && (
                <p style={{ color: '#8888a8', fontSize: 10, margin: 0 }}>{activeRoute.toAddress}</p>
              )}
            </div>
          </Popup>
        )}

        {/* Glowing property markers — viewport-clipped for performance */}
        {visibleProperties.map((property) => {
          let markerLabel: string | undefined;
          if (mapPriceMode === 'netMonthly' && netMonthlyMap) {
            const nm = netMonthlyMap.get(property.id);
            if (nm != null) {
              markerLabel = `$${Math.abs(Math.round(nm)).toLocaleString()}/mo`;
            }
          }
          return (
            <Marker
              key={property.id}
              longitude={property.coordinates[0]}
              latitude={property.coordinates[1]}
              anchor="center"
            >
              <GlowMarker
                property={property}
                selected={selectedId === property.id}
                onClick={() => handleMarkerClick(property.id)}
                label={markerLabel}
              />
            </Marker>
          );
        })}
      </Map>

      {/* Active route banner */}
      {activeRoute && (
        <div
          className="absolute z-[12] top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-auto"
          style={{ maxWidth: 'calc(100% - 380px - 40px)' }}
        >
          {/* Route info row */}
          <div
            className="flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-semibold shadow-lg whitespace-nowrap"
            style={{ background: '#0f0f1aee', border: `1px solid ${colors.cyan}60`, color: colors.cyan, boxShadow: `0 0 16px ${colors.cyan}40` }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.cyan, flexShrink: 0, display: 'inline-block', boxShadow: `0 0 6px ${colors.cyan}` }} />
            <span className="truncate max-w-[240px]">Walking route → {activeRoute.toName}</span>
            {onClearRoute && (
              <button
                onClick={onClearRoute}
                className="ml-1 hover:opacity-70 transition-opacity flex-shrink-0"
                style={{ color: colors.whiteMuted }}
                aria-label="Clear route"
              >
                ✕
              </button>
            )}
          </div>
          {/* Reopen property detail hint */}
          {onReopenDetail && activeRoute.sourcePropertyAddress && (
            <button
              onClick={onReopenDetail}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-all hover:brightness-110 active:scale-95"
              style={{ background: '#1a1a2eee', border: `1px solid ${colors.blue}60`, color: '#a5b4fc', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
            >
              <span>🏠</span>
              <span className="truncate max-w-[220px]">{activeRoute.sourcePropertyAddress}</span>
              <span style={{ color: colors.whiteMuted }}>· Click to reopen details</span>
            </button>
          )}
        </div>
      )}

      {/* Building footprints legend — fixed bottom-right of map (left of 360px panel on desktop) */}
      {activeOverlays.has('structures') && (
        <div
          className="absolute z-[11] pointer-events-none max-w-[220px] bottom-0 right-3 sm:right-[calc(360px+12px)]"
          style={{
            ...glass.pill,
            borderRadius: 12,
            padding: '10px 12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: colors.whiteMuted, letterSpacing: '0.08em' }}
          >
            Building footprints
          </p>
          <ul className="space-y-1.5">
            {STRUCTURE_FOOTPRINT_LEGEND.map(({ label, color }) => (
              <li key={label} className="flex items-center gap-2.5">
                <span
                  className="w-3.5 h-3.5 rounded flex-shrink-0 ring-1 ring-white/15"
                  style={{ background: color }}
                />
                <span className="text-[11px] font-medium leading-tight" style={{ color: colors.white }}>
                  {label}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[9px] mt-2 leading-snug" style={{ color: colors.whiteSubtle }}>
            Fill by occupancy (OCC_CLS). Zoom in to see outlines.
          </p>
        </div>
      )}
    </div>
  );
}

export const MapView = memo(MapViewInner);
