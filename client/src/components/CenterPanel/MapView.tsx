import { useRef, useState, useEffect, useCallback, memo, useMemo } from 'react';
import Map, { Source, Layer, Marker, Popup, type MapRef } from 'react-map-gl/mapbox';
import type { LayerProps } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapViewMode, OverlayType } from '../../types/map';
import type { Property } from '../../types/property';
import { fetchOverlay } from '../../services/api';
import { formatPrice, formatSqft } from '../../utils/formatters';
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
      {/* Outer pulse ring — only when not selected */}
      {!selected && (
        <div
          className="absolute rounded-full animate-ping"
          style={{
            width: 20,
            height: 20,
            top: -4,
            left: -4,
            background: `rgba(0,200,255,0.2)`,
          }}
        />
      )}

      {/* Dot */}
      <div
        style={{
          width: selected ? 18 : 12,
          height: selected ? 18 : 12,
          borderRadius: '50%',
          background: selected ? colors.cyanLight : colors.cyan,
          boxShadow: selected
            ? `0 0 0 3px rgba(0,200,255,0.28), 0 0 20px rgba(0,200,255,0.7)`
            : `0 0 12px rgba(0,200,255,0.5)`,
          transition: 'all 0.2s ease',
          transform: hovered && !selected ? 'scale(1.4)' : 'scale(1)',
        }}
      />

      {/* Hover tooltip */}
      {hovered && !selected && (
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: 22,
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
          <p className="text-[10px] mt-0.5 truncate" style={{ color: colors.whiteSubtle }}>
            {property.streetAddress}
          </p>
        </div>
      )}
    </div>
  );
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
  const structuresTileUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/properties/overlays/structures/tiles/{z}/{x}/{y}.pbf`
      : '/api/properties/overlays/structures/tiles/{z}/{x}/{y}.pbf';
  const [viewState, setViewState] = useState({
    ...SLC_CENTER,
    pitch: 0,
    bearing: 0,
  });

  // Update pitch when view mode changes
  useEffect(() => {
    setViewState((prev) => ({ ...prev, pitch: viewMode === '3d' ? 60 : 0 }));
  }, [viewMode]);

  // Fly to selected property
  useEffect(() => {
    if (selectedId && mapRef.current) {
      const property = properties.find((p) => p.id === selectedId);
      if (property) {
        mapRef.current.flyTo({
          center: [property.coordinates[0], property.coordinates[1]],
          zoom: 15,
          duration: 450,
          essential: true,
          offset: [-180, 0],
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

  const handleMarkerClick = useCallback(
    (id: string) => {
      onSelectProperty(id);
    },
    [onSelectProperty]
  );

  const handleMapClick = useCallback((evt: any) => {
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
  }, []);

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        onClick={handleMapClick}
        interactiveLayerIds={activeOverlays.has('crime') ? ['crime-points'] : []}
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

        {/* Glowing property markers */}
        {properties.map((property) => (
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
