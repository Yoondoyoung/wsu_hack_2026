import { useRef, useState, useEffect, useCallback, memo, useMemo } from 'react';
import Map, { Source, Layer, Marker, Popup, type MapRef } from 'react-map-gl/mapbox';
import type { LayerProps } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapViewMode, OverlayType } from '../../types/map';
import type { Property } from '../../types/property';
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

// Heatmap color ramps aligned with design.ts
const OVERLAY_COLORS: Record<OverlayType, string[]> = {
  crime:      ['rgba(0,0,0,0)', '#7f1d1d', '#ff4060', colors.red],
  schools:    ['rgba(0,0,0,0)', '#064e3b', '#00b862', colors.emerald],
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

function GlowMarker({
  property,
  selected,
  onClick,
}: {
  property: Property;
  selected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const photo = property.photos?.[0] || property.imageUrl;
  const label = formatPriceCompact(property.price);

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

function MapViewInner({ viewMode, activeOverlays, properties, selectedId, onSelectProperty, onMarkerScreenPosition }: Props) {
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

  // Update pitch when view mode changes
  useEffect(() => {
    setViewState((prev) => ({ ...prev, pitch: viewMode === '3d' ? 60 : 0 }));
  }, [viewMode]);

  // Fly to selected property — keep current zoom if already closer than the focus floor (avoid zoom-out).
  useEffect(() => {
    if (selectedId && mapRef.current) {
      const property = properties.find((p) => p.id === selectedId);
      if (property) {
        const map = mapRef.current.getMap();
        const currentZoom = map.getZoom();
        const focusFloor = 15;
        mapRef.current.flyTo({
          center: [property.coordinates[0], property.coordinates[1]],
          zoom: Math.max(currentZoom, focusFloor),
          duration: 450,
          essential: true,
          offset: [-185, 0],
        });
      }
    }
  }, [selectedId, properties]);

  // rAF loop: report selected marker screen position
  useEffect(() => {
    if (!onMarkerScreenPosition) return;
    const cb = onMarkerScreenPosition;
    let rafId = 0;
    const property = selectedId ? properties.find((p) => p.id === selectedId) : null;

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
  }, [selectedId, properties, onMarkerScreenPosition]);

  // Fetch overlay GeoJSON when the active set changes (do NOT depend on overlayData — that re-fired
  // the effect on every fetch and could block or thrash layers). Skip if already cached in ref.
  useEffect(() => {
    activeOverlays.forEach((overlay) => {
      if (overlayDataRef.current[overlay]) return;
      fetchOverlay(overlay)
        .then((data) => {
          setOverlayData((prev) => ({ ...prev, [overlay]: data }));
        })
        .catch((err) => {
          console.error(`[MapView] Failed to load overlay "${overlay}"`, err);
        });
    });
  }, [overlayIdsKey, activeOverlays]); // activeOverlays: forEach target; overlayIdsKey: stable trigger when set contents change

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

  const handleMarkerClick = useCallback(
    (id: string) => {
      onSelectProperty(id);
    },
    [onSelectProperty]
  );

  const handleMapClick = useCallback((evt: any) => {
    const schoolFeature = evt.features?.find((f: any) => f.layer?.id === 'schools-points');
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

        {/* Structures vector tiles */}
        {activeOverlays.has('structures') && (
          <>
            {overlayData.structures && (
              <Source id="source-structures-overview" type="geojson" data={overlayData.structures}>
                <Layer
                  id="structures-overview-circles"
                  type="circle"
                  maxzoom={14}
                  paint={{
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 12, 1.8, 14, 2.4],
                    'circle-color': '#22d3ee',
                    'circle-opacity': 0.35,
                  }}
                />
              </Source>
            )}
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
          </>
        )}

        {/* Other heatmap overlays */}
        {Array.from(activeOverlays).map((overlay) =>
          overlay !== 'structures' && overlay !== 'crime' && overlayData[overlay] ? (
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

        {/* Glowing property markers — viewport-clipped for performance */}
        {visibleProperties.map((property) => (
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
            />
          </Marker>
        ))}
      </Map>

      {/* Viewport marker count badge */}
      <div
        className="absolute top-3 left-3 z-[11] pointer-events-none"
        style={{
          ...glass.pill,
          borderRadius: 8,
          padding: '5px 10px',
          fontSize: 11,
          color: colors.whiteMuted,
          letterSpacing: '0.02em',
        }}
      >
        {visibleProperties.length} of {properties.length} listings in view
      </div>

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
