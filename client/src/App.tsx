import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { DashboardLayout } from './components/Layout/DashboardLayout';
import { LeftPanel } from './components/LeftPanel/LeftPanel';
import { CenterPanel } from './components/CenterPanel/CenterPanel';
import { RightPanel } from './components/RightPanel/RightPanel';
import { ConnectionLine } from './components/ConnectionLine';
import { useMapState } from './hooks/useMapState';
import { useProperties } from './hooks/useProperties';
import { glass, colors } from './design';
import { calcTCO, TCO_DEFAULTS, type TcoInputs } from './utils/tcoCalculator';

export type MapPriceMode = 'listing' | 'netMonthly';

export default function App() {
  const { mapState, setViewMode, toggleOverlay } = useMapState();
  const { properties, loading } = useProperties();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 3000000]);
  const [minSchoolRating, setMinSchoolRating] = useState(0);
  const [mapPriceMode, setMapPriceMode] = useState<MapPriceMode>('listing');
  const [tcoInputs, setTcoInputs] = useState<TcoInputs>(TCO_DEFAULTS);
  const [minBeds, setMinBeds] = useState(0);
  const [minBaths, setMinBaths] = useState(0);

  /** Refs only — no setState at 60fps (prevents map jitter from full-tree re-renders). */
  const markerPosRef = useRef<{ x: number; y: number } | null>(null);
  const cardPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleSelectProperty = (id: string) => {
    setSelectedId((prev) => {
      if (prev === id) {
        markerPosRef.current = null;
        cardPosRef.current = null;
        return null;
      }
      // Selecting a different property clears any active route
      setRouteRequest(null);
      setActiveRoute(null);
      setReopenTrigger(null);
      return id;
    });
  };

  const handleMarkerScreenPosition = useCallback((pos: { x: number; y: number } | null) => {
    markerPosRef.current = pos;
  }, []);

  const handleCardAnchorChange = useCallback((pos: { x: number; y: number } | null) => {
    cardPosRef.current = pos;
  }, []);

  const filteredProperties = properties.filter((p) => {
    if (p.price < priceRange[0] || p.price > priceRange[1]) return false;
    if (p.beds < minBeds) return false;
    if (p.baths < minBaths) return false;
    if (minSchoolRating > 0 && p.schools.length > 0) {
      const maxRating = Math.max(...p.schools.map((s) => s.rating));
      if (maxRating < minSchoolRating) return false;
    }
    return true;
  });

  const [routeRequest, setRouteRequest] = useState<{
    from: [number, number];
    to: [number, number];
    toCoordinates: [number, number];
    toName: string;
    toAddress: string;
    sourcePropertyId: string;
    sourcePropertyAddress: string;
  } | null>(null);
  const [activeRoute, setActiveRoute] = useState<{
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    toCoordinates: [number, number];
    toName: string;
    toAddress: string;
    sourcePropertyId: string;
    sourcePropertyAddress: string;
  } | null>(null);
  const [reopenTrigger, setReopenTrigger] = useState<{ id: string; ts: number } | null>(null);

  useEffect(() => {
    if (!routeRequest) { setActiveRoute(null); return; }
    const { from, to, toCoordinates, toName, toAddress, sourcePropertyId, sourcePropertyAddress } = routeRequest;
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string;
    fetch(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${token}`
    )
      .then((r) => r.json())
      .then((d) => {
        const geom = d.routes?.[0]?.geometry as { type: 'LineString'; coordinates: [number, number][] } | undefined;
        if (geom) setActiveRoute({ geometry: geom, toCoordinates, toName, toAddress, sourcePropertyId, sourcePropertyAddress });
      })
      .catch(console.error);
  }, [routeRequest]);

  const handleShowRoute = useCallback((
    from: [number, number],
    to: [number, number],
    toName: string,
    toAddress: string,
    sourcePropertyId: string,
    sourcePropertyAddress: string,
  ) => {
    setRouteRequest({ from, to, toCoordinates: to, toName, toAddress, sourcePropertyId, sourcePropertyAddress });
  }, []);

  const handleClearRoute = useCallback(() => {
    setRouteRequest(null);
    setActiveRoute(null);
  }, []);

  const handleReopenDetail = useCallback(() => {
    if (activeRoute?.sourcePropertyId) {
      setReopenTrigger({ id: activeRoute.sourcePropertyId, ts: Date.now() });
      setRouteRequest(null);
      setActiveRoute(null);
    }
  }, [activeRoute]);

  // Called by RightPanel immediately after it consumes the trigger — prevents repeated re-opens
  const handleReopenHandled = useCallback(() => {
    setReopenTrigger(null);
  }, []);

  const netMonthlyMap = useMemo(() => {
    if (mapPriceMode !== 'netMonthly') return null;
    const map = new Map<string, number>();
    for (const p of filteredProperties) {
      map.set(p.id, calcTCO(p, tcoInputs).netMonthly);
    }
    return map;
  }, [filteredProperties, mapPriceMode, tcoInputs]);

  return (
    <DashboardLayout>
      {/* Map — full bleed behind panels */}
      <div className="absolute inset-0">
        <CenterPanel
          viewMode={mapState.viewMode}
          activeOverlays={mapState.activeOverlays}
          properties={filteredProperties}
          selectedId={selectedId}
          onSelectProperty={handleSelectProperty}
          onMarkerScreenPosition={handleMarkerScreenPosition}
          mapPriceMode={mapPriceMode}
          netMonthlyMap={netMonthlyMap}
          activeRoute={activeRoute}
          onClearRoute={handleClearRoute}
          onReopenDetail={handleReopenDetail}
        />
      </div>

      {/* Connection line SVG overlay */}
      <ConnectionLine
        markerPosRef={markerPosRef}
        cardPosRef={cardPosRef}
        visible={selectedId !== null}
      />

      {/* Top brand bar */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div
          className="flex items-center gap-3 px-5 py-2.5"
          style={{
            ...glass.pill,
            borderRadius: 12,
            boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div className="relative flex items-center justify-center w-4 h-4">
            <div className="absolute w-4 h-4 rounded-full animate-ping" style={{ background: 'rgba(0,200,255,0.2)' }} />
            <div className="w-2 h-2 rounded-full" style={{ background: colors.cyan, boxShadow: `0 0 8px ${colors.cyan}, 0 0 20px rgba(0,200,255,0.3)` }} />
          </div>
          <span
            className="text-sm font-semibold tracking-widest uppercase"
            style={{ color: colors.white, letterSpacing: '0.12em', fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
          >
            Utah Smart-Path
          </span>
          <div style={{ width: 1, height: 14, background: colors.whiteDim }} />
          <span className="text-xs font-medium" style={{ color: colors.whiteMuted, letterSpacing: '0.04em' }}>Salt Lake City</span>
        </div>
      </div>

      {/* Left panel */}
      <div className={`absolute left-2 top-2 bottom-2 z-10 transition-all duration-300 ease-in-out ${leftCollapsed ? 'w-[58px]' : 'w-[282px]'}`}>
        <LeftPanel
          viewMode={mapState.viewMode}
          activeOverlays={mapState.activeOverlays}
          onViewChange={setViewMode}
          onOverlayToggle={toggleOverlay}
          collapsed={leftCollapsed}
          onToggleCollapse={() => setLeftCollapsed((v) => !v)}
          priceRange={priceRange}
          onPriceRangeChange={setPriceRange}
          minSchoolRating={minSchoolRating}
          onMinSchoolRatingChange={setMinSchoolRating}
          mapPriceMode={mapPriceMode}
          onMapPriceModeChange={setMapPriceMode}
          minBeds={minBeds}
          onMinBedsChange={setMinBeds}
          minBaths={minBaths}
          onMinBathsChange={setMinBaths}
          tcoInputs={tcoInputs}
          onTcoInputsChange={setTcoInputs}
        />
      </div>

      {/* Right panel — always visible */}
      <div className="absolute right-0 top-0 bottom-0 z-20 w-[360px]">
        <RightPanel
          properties={filteredProperties}
          selectedId={selectedId}
          onSelectProperty={handleSelectProperty}
          loading={loading}
          onCardAnchorChange={handleCardAnchorChange}
          tcoInputs={tcoInputs}
          onTcoInputsChange={setTcoInputs}
          onShowRoute={handleShowRoute}
          reopenTrigger={reopenTrigger}
          onReopenHandled={handleReopenHandled}
        />
      </div>

    </DashboardLayout>
  );
}
