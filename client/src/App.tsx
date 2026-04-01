import { useState, useCallback, useRef, useMemo } from 'react';
import { DashboardLayout } from './components/Layout/DashboardLayout';
import { LeftPanel } from './components/LeftPanel/LeftPanel';
import { CenterPanel } from './components/CenterPanel/CenterPanel';
import { RightPanel } from './components/RightPanel/RightPanel';
import { ConnectionLine } from './components/ConnectionLine';
import { useMapState } from './hooks/useMapState';
import { useProperties } from './hooks/useProperties';
import { glass, colors } from './design';
import { calcTCO, TCO_DEFAULTS } from './utils/tcoCalculator';

export type MapPriceMode = 'listing' | 'netMonthly';

export default function App() {
  const { mapState, setViewMode, toggleOverlay } = useMapState();
  const { properties, loading } = useProperties();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000000]);
  const [minSchoolRating, setMinSchoolRating] = useState(0);
  const [mapPriceMode, setMapPriceMode] = useState<MapPriceMode>('listing');

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
    if (minSchoolRating > 0 && p.schools.length > 0) {
      const maxRating = Math.max(...p.schools.map((s) => s.rating));
      if (maxRating < minSchoolRating) return false;
    }
    return true;
  });

  const netMonthlyMap = useMemo(() => {
    if (mapPriceMode !== 'netMonthly') return null;
    const map = new Map<string, number>();
    for (const p of filteredProperties) {
      map.set(p.id, calcTCO(p, TCO_DEFAULTS).netMonthly);
    }
    return map;
  }, [filteredProperties, mapPriceMode]);

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
          onMapPriceModeChange={setMapPriceMode}
          netMonthlyMap={netMonthlyMap}
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
            borderRadius: 40,
            boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div className="relative flex items-center justify-center w-4 h-4">
            <div className="absolute w-4 h-4 rounded-full animate-ping" style={{ background: 'rgba(0,200,255,0.2)' }} />
            <div className="w-2 h-2 rounded-full" style={{ background: colors.cyan, boxShadow: `0 0 8px ${colors.cyan}, 0 0 20px rgba(0,200,255,0.3)` }} />
          </div>
          <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: colors.white, letterSpacing: '0.12em' }}>Utah Smart-Path</span>
          <div style={{ width: 1, height: 14, background: colors.whiteDim }} />
          <span className="text-xs font-medium" style={{ color: colors.whiteMuted, letterSpacing: '0.04em' }}>Salt Lake City</span>
        </div>
      </div>

      {/* Left panel */}
      <div className={`absolute left-4 top-4 bottom-4 z-10 transition-all duration-300 ease-in-out ${leftCollapsed ? 'w-[58px]' : 'w-[282px]'}`}>
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
        />
      </div>

      {/* Bottom status pill */}
      {!loading && (
        <div
          className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center gap-2.5 px-4 py-2"
          style={{ ...glass.pill, borderRadius: 40 }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: colors.cyan, boxShadow: `0 0 6px ${colors.cyan}` }} />
          <span className="text-xs font-medium" style={{ color: colors.whiteMuted }}>
            <span style={{ color: colors.white, fontWeight: 600 }}>{filteredProperties.length}</span>
            {' '}properties · Click a marker to explore
          </span>
        </div>
      )}
    </DashboardLayout>
  );
}
