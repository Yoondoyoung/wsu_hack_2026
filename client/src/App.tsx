import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { DashboardLayout } from './components/Layout/DashboardLayout';
import { LeftPanel } from './components/LeftPanel/LeftPanel';
import { CenterPanel } from './components/CenterPanel/CenterPanel';
import { RightPanel } from './components/RightPanel/RightPanel';
import { ConnectionLine } from './components/ConnectionLine';
import { FloatingPropertyCard } from './components/FloatingPropertyCard';
import { PropertyCompareView, COMPARE_LABEL_W, COMPARE_COL_W } from './components/PropertyCompareView';
import { ChatAssistant } from './components/ChatAssistant/ChatAssistant';
import { useMapState } from './hooks/useMapState';
import { useProperties } from './hooks/useProperties';
import { glass, colors } from './design';
import { calcTCO, TCO_DEFAULTS, type TcoInputs } from './utils/tcoCalculator';
import type { Property } from './types/property';

const SNAP_THRESHOLD = 120;        // px — float-card to float-card
const COMPARE_H_APPROX = 460;      // px — estimated compare view height for proximity detection
const MAX_COMPARE = 4;

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
  /** When set, map + list show only these IDs (from chat search_listings). `null` = use slider filters. */
  const [chatListingIds, setChatListingIds] = useState<string[] | null>(null);

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

  const visibleProperties = useMemo(() => {
    if (chatListingIds === null) return filteredProperties;
    const byId = new Map(properties.map((p) => [p.id, p] as const));
    return chatListingIds
      .map((id) => byId.get(id))
      .filter((p): p is Property => p != null);
  }, [chatListingIds, properties, filteredProperties]);

  useEffect(() => {
    if (!selectedId) return;
    if (!visibleProperties.some((p) => p.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visibleProperties]);

  const handleChatListingResult = useCallback((listingIds: string[] | undefined) => {
    if (listingIds !== undefined) setChatListingIds(listingIds);
  }, []);

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

  /* ─── Floating Cards ─────────────────────────────────── */
  const [floatingCards, setFloatingCards] = useState<{ id: string; x: number; y: number }[]>([]);
  const [comparePos, setComparePos] = useState<{ x: number; y: number } | null>(null);
  const [compareIds, setCompareIds] = useState<string[] | null>(null);

  // Refs so event handlers always see latest values without re-binding
  const floatingCardsRef = useRef(floatingCards);
  const compareIdsRef    = useRef(compareIds);
  const comparePosRef    = useRef(comparePos);
  floatingCardsRef.current = floatingCards;
  compareIdsRef.current    = compareIds;
  comparePosRef.current    = comparePos;

  const floatingCardIds = useMemo(() => new Set(floatingCards.map((c) => c.id)), [floatingCards]);

  const handleDropOnMap = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('propertyId');
    if (!id) return;
    setFloatingCards((prev) => {
      if (prev.some((c) => c.id === id)) return prev;
      return [...prev, { id, x: e.clientX - 120, y: e.clientY - 60 }];
    });
  }, []);

  const handleFloatMove = useCallback((id: string, x: number, y: number) => {
    setFloatingCards((prev) => prev.map((c) => c.id === id ? { ...c, x, y } : c));
  }, []);

  const handleSnapCheck = useCallback((draggedId: string, x: number, y: number) => {
    const currentCompareIds  = compareIdsRef.current;
    const currentComparePos  = comparePosRef.current;
    const currentFloating    = floatingCardsRef.current;

    // 1. Try snapping dragged card INTO an existing compare view
    if (
      currentCompareIds &&
      currentComparePos &&
      currentCompareIds.length < MAX_COMPARE &&
      !currentCompareIds.includes(draggedId)
    ) {
      const compareW = COMPARE_LABEL_W + currentCompareIds.length * COMPARE_COL_W;
      const inBounds =
        x >= currentComparePos.x - SNAP_THRESHOLD &&
        x <= currentComparePos.x + compareW + SNAP_THRESHOLD &&
        y >= currentComparePos.y - SNAP_THRESHOLD &&
        y <= currentComparePos.y + COMPARE_H_APPROX + SNAP_THRESHOLD;
      if (inBounds) {
        setCompareIds((ids) => (ids ? [...ids, draggedId] : [draggedId]));
        setFloatingCards((fc) => fc.filter((c) => c.id !== draggedId));
        return;
      }
    }

    // 2. Try snapping two floating cards together to start a compare view
    const dragged = currentFloating.find((c) => c.id === draggedId);
    if (!dragged) {
      setFloatingCards((fc) => fc.map((c) => c.id === draggedId ? { ...c, x, y } : c));
      return;
    }
    const updatedDragged = { ...dragged, x, y };
    const target = currentFloating.find(
      (c) => c.id !== draggedId && Math.hypot(c.x - updatedDragged.x, c.y - updatedDragged.y) < SNAP_THRESHOLD
    );
    if (target) {
      const midX = (updatedDragged.x + target.x) / 2 - (COMPARE_LABEL_W + COMPARE_COL_W);
      const midY = Math.min(updatedDragged.y, target.y);
      setCompareIds([target.id, draggedId]);
      setComparePos({ x: midX, y: midY });
      setFloatingCards((fc) => fc.filter((c) => c.id !== draggedId && c.id !== target.id));
    } else {
      setFloatingCards((fc) => fc.map((c) => c.id === draggedId ? { ...c, x, y } : c));
    }
  }, []);

  const handleFloatClose = useCallback((id: string) => {
    setFloatingCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleCompareMove = useCallback((x: number, y: number) => {
    setComparePos({ x, y });
  }, []);

  const handleCompareClose = useCallback(() => {
    setCompareIds(null);
    setComparePos(null);
  }, []);

  const handleCompareSeparate = useCallback(() => {
    const ids = compareIdsRef.current;
    const pos  = comparePosRef.current;
    if (!ids || !pos) return;
    setFloatingCards((prev) => [
      ...prev,
      ...ids.map((id, i) => ({ id, x: pos.x + i * (COMPARE_COL_W + 8), y: pos.y })),
    ]);
    setCompareIds(null);
    setComparePos(null);
  }, []);

  // Which floating card (if any) is hovering over the compare view → show "ADD TO COMPARE" hint
  const snapToCompareId = useMemo(() => {
    if (!compareIds || !comparePos || compareIds.length >= MAX_COMPARE) return null;
    const compareW = COMPARE_LABEL_W + compareIds.length * COMPARE_COL_W;
    for (const card of floatingCards) {
      if (compareIds.includes(card.id)) continue;
      if (
        card.x >= comparePos.x - SNAP_THRESHOLD &&
        card.x <= comparePos.x + compareW + SNAP_THRESHOLD &&
        card.y >= comparePos.y - SNAP_THRESHOLD &&
        card.y <= comparePos.y + COMPARE_H_APPROX + SNAP_THRESHOLD
      ) {
        return card.id;
      }
    }
    return null;
  }, [floatingCards, compareIds, comparePos]);

  const netMonthlyMap = useMemo(() => {
    if (mapPriceMode !== 'netMonthly') return null;
    const map = new Map<string, number>();
    for (const p of visibleProperties) {
      map.set(p.id, calcTCO(p, tcoInputs).netMonthly);
    }
    return map;
  }, [visibleProperties, mapPriceMode, tcoInputs]);

  const chatFocusedProperty = useMemo(
    () => (selectedId ? properties.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, properties],
  );

  const chatCompareProperties = useMemo((): Property[] | null => {
    if (!compareIds || compareIds.length < 2) return null;
    const list = compareIds
      .map((id) => properties.find((p) => p.id === id))
      .filter((p): p is Property => p != null);
    return list.length >= 2 ? list : null;
  }, [compareIds, properties]);

  return (
    <DashboardLayout>
      {/* Map — full bleed behind panels */}
      <div
        className="absolute inset-0"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnMap}
      >
        <CenterPanel
          viewMode={mapState.viewMode}
          activeOverlays={mapState.activeOverlays}
          properties={visibleProperties}
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
          properties={visibleProperties}
          selectedId={selectedId}
          onSelectProperty={handleSelectProperty}
          loading={loading}
          onCardAnchorChange={handleCardAnchorChange}
          tcoInputs={tcoInputs}
          onTcoInputsChange={setTcoInputs}
          onShowRoute={handleShowRoute}
          reopenTrigger={reopenTrigger}
          onReopenHandled={handleReopenHandled}
          floatingCardIds={floatingCardIds}
          chatListViewActive={chatListingIds !== null}
          onClearChatListView={() => setChatListingIds(null)}
        />
      </div>

      {/* Floating property cards layer */}
      <div className="absolute inset-0 z-[25] pointer-events-none">
        {floatingCards.map((card) => {
          const prop = properties.find((p) => p.id === card.id);
          if (!prop) return null;
          const isSnapTarget = floatingCards.some(
            (other) => other.id !== card.id && Math.hypot(other.x - card.x, other.y - card.y) < SNAP_THRESHOLD
          );
          return (
            <FloatingPropertyCard
              key={card.id}
              property={prop}
              x={card.x}
              y={card.y}
              snapTarget={isSnapTarget}
              snapToCompare={snapToCompareId === card.id}
              onMove={handleFloatMove}
              onSnapRelease={handleSnapCheck}
              onClose={handleFloatClose}
            />
          );
        })}

        {compareIds && comparePos && (() => {
          const compareProps = compareIds.map((id) => properties.find((p) => p.id === id)).filter(Boolean) as typeof properties;
          if (compareProps.length < 2) return null;
          return (
            <PropertyCompareView
              properties={compareProps}
              x={comparePos.x}
              y={comparePos.y}
              onMove={handleCompareMove}
              onClose={handleCompareClose}
              onSeparate={handleCompareSeparate}
            />
          );
        })()}
      </div>

      <ChatAssistant
        focusedProperty={chatFocusedProperty}
        compareProperties={chatCompareProperties}
        onChatListingResult={handleChatListingResult}
      />

    </DashboardLayout>
  );
}
