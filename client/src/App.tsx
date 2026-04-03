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
import type { ChatFilterPatch } from './services/chat';

const SNAP_THRESHOLD = 120;        // px — float-card to float-card
const COMPARE_H_APPROX = 460;      // px — estimated compare view height for proximity detection
const MAX_COMPARE = 4;
const DEFAULT_PRICE_RANGE: [number, number] = [0, 3000000];
const MAX_SCHOOL_RADIUS_MILES = 10;
const DEFAULT_SCHOOL_RADIUS_MILES = 1;

export type MapPriceMode = 'listing' | 'netMonthly';
type OnboardingMode = 'pending' | 'browse' | 'guided';
type CrimeRiskFilter = 'any' | 'low' | 'medium' | 'high';
type NoiseRiskFilter = 'any' | 'low' | 'medium' | 'high';
type SchoolAgeFilter = 'elementary' | 'middle' | 'high';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function schoolMatchesAgeGroup(school: Property['schools'][number], group: SchoolAgeFilter): boolean {
  const blob = `${school.level ?? ''} ${(school as { grades?: string | null }).grades ?? ''} ${school.type ?? ''}`.toLowerCase();
  if (group === 'elementary') {
    return /\belementary\b|\bpk\b|\bk-?6\b|\b1-?6\b|\bk-?5\b/.test(blob);
  }
  if (group === 'middle') {
    return /\bmiddle\b|\bjunior\b|\b6-?8\b|\b7-?8\b/.test(blob);
  }
  return /\bhigh\b|\b9-?12\b/.test(blob);
}

export default function App() {
  const { mapState, setViewMode, toggleOverlay } = useMapState();
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>('pending');
  const shouldLoadProperties = onboardingMode !== 'pending';
  const { properties, loading } = useProperties(shouldLoadProperties);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>(DEFAULT_PRICE_RANGE);
  const [mapPriceMode, setMapPriceMode] = useState<MapPriceMode>('listing');
  const [tcoInputs, setTcoInputs] = useState<TcoInputs>(TCO_DEFAULTS);
  const [minBeds, setMinBeds] = useState(0);
  const [minBaths, setMinBaths] = useState(0);
  const [crimeRisk, setCrimeRisk] = useState<CrimeRiskFilter>('any');
  const [noiseRisk, setNoiseRisk] = useState<NoiseRiskFilter>('any');
  const [schoolAgeGroups, setSchoolAgeGroups] = useState<SchoolAgeFilter[]>([]);
  const [schoolRadiusMiles, setSchoolRadiusMiles] = useState(0);
  const [groceryRadiusMiles, setGroceryRadiusMiles] = useState(0);
  /** When set, map + list show only these IDs (from chat search_listings). `null` = use slider filters. */
  const [chatListingIds, setChatListingIds] = useState<string[] | null>(null);
  const [guidedFiltersReady, setGuidedFiltersReady] = useState(false);
  const prevSchoolGroupCountRef = useRef(0);

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

  const persistOnboardingMode = useCallback((mode: Exclude<OnboardingMode, 'pending'>) => {
    setOnboardingMode(mode);
  }, []);

  const resetAllFilters = useCallback(() => {
    setPriceRange(DEFAULT_PRICE_RANGE);
    setMinBeds(0);
    setMinBaths(0);
    setCrimeRisk('any');
    setNoiseRisk('any');
    setSchoolAgeGroups([]);
    setSchoolRadiusMiles(0);
    setGroceryRadiusMiles(0);
    setChatListingIds(null);
    persistOnboardingMode('browse');
    setGuidedFiltersReady(true);
  }, [persistOnboardingMode]);

  useEffect(() => {
    const prev = prevSchoolGroupCountRef.current;
    const next = schoolAgeGroups.length;
    if (prev === 0 && next > 0 && schoolRadiusMiles <= 0) {
      setSchoolRadiusMiles(DEFAULT_SCHOOL_RADIUS_MILES);
    }
    prevSchoolGroupCountRef.current = next;
  }, [schoolAgeGroups, schoolRadiusMiles]);

  const filteredProperties = properties.filter((p) => {
    if (p.price < priceRange[0] || p.price > priceRange[1]) return false;
    if (p.beds < minBeds) return false;
    if (p.baths < minBaths) return false;
    if (crimeRisk !== 'any' && p.crimeRiskLevel !== crimeRisk) return false;
    if (noiseRisk !== 'any' && p.noiseExposureLevel !== noiseRisk) return false;
    if (schoolAgeGroups.length > 0) {
      const schoolWithinRadius = p.schools.some((s) => {
        const dist = Number(s.distance);
        const withinRadius = schoolRadiusMiles <= 0 || (Number.isFinite(dist) && dist <= schoolRadiusMiles);
        return withinRadius && schoolAgeGroups.some((group) => schoolMatchesAgeGroup(s, group));
      });
      if (!schoolWithinRadius) return false;
    }
    if (groceryRadiusMiles > 0) {
      const d = Number(p.nearestGroceryDistanceMiles);
      if (!Number.isFinite(d) || d > groceryRadiusMiles) return false;
    }
    return true;
  });

  const visibleProperties = useMemo(() => {
    if (onboardingMode === 'pending') return [];
    if (chatListingIds !== null) {
      const byId = new Map(properties.map((p) => [p.id, p] as const));
      return chatListingIds
        .map((id) => byId.get(id))
        .filter((p): p is Property => p != null);
    }
    if (onboardingMode === 'guided' && !guidedFiltersReady) return [];
    return filteredProperties;
  }, [onboardingMode, guidedFiltersReady, chatListingIds, properties, filteredProperties]);

  useEffect(() => {
    if (!selectedId) return;
    if (!visibleProperties.some((p) => p.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visibleProperties]);

  useEffect(() => {
    if (selectedId) return;
    const needsNearbyPoints =
      (schoolAgeGroups.length > 0 && schoolRadiusMiles > 0) || groceryRadiusMiles > 0;
    if (!needsNearbyPoints) return;
    if (visibleProperties.length === 0) return;
    setSelectedId(visibleProperties[0].id);
  }, [selectedId, schoolAgeGroups, schoolRadiusMiles, groceryRadiusMiles, visibleProperties]);

  const handleChatListingResult = useCallback((listingIds: string[] | undefined) => {
    if (listingIds !== undefined) {
      setChatListingIds(listingIds);
      if (onboardingMode === 'guided') setGuidedFiltersReady(true);
    }
  }, [onboardingMode]);

  const handleFilterPatch = useCallback((patch: ChatFilterPatch | undefined) => {
    if (!patch) return;
    if (typeof patch.min_price === 'number' || typeof patch.max_price === 'number') {
      const nextMin = clamp(patch.min_price ?? priceRange[0], 0, 3000000);
      const nextMax = clamp(patch.max_price ?? priceRange[1], 0, 3000000);
      setPriceRange([Math.min(nextMin, nextMax), Math.max(nextMin, nextMax)]);
    }
    if (typeof patch.min_beds === 'number') setMinBeds(clamp(Math.round(patch.min_beds), 0, 10));
    if (typeof patch.min_baths === 'number') setMinBaths(clamp(Math.round(patch.min_baths), 0, 10));
    if (patch.crime_risk && ['any', 'low', 'medium', 'high'].includes(patch.crime_risk)) {
      setCrimeRisk(patch.crime_risk);
    }
    if (patch.noise_risk && ['any', 'low', 'medium', 'high'].includes(patch.noise_risk)) {
      setNoiseRisk(patch.noise_risk);
    }
    if (Array.isArray(patch.school_age_groups)) {
      const validGroups = patch.school_age_groups
        .filter((group): group is SchoolAgeFilter => ['elementary', 'middle', 'high'].includes(group));
      setSchoolAgeGroups(Array.from(new Set(validGroups)));
    }
    if (typeof patch.school_radius_miles === 'number') setSchoolRadiusMiles(clamp(patch.school_radius_miles, 0, MAX_SCHOOL_RADIUS_MILES));
    if (typeof patch.grocery_radius_miles === 'number') setGroceryRadiusMiles(clamp(patch.grocery_radius_miles, 0, 5));
    setChatListingIds(null);
    if (onboardingMode === 'guided') setGuidedFiltersReady(true);
  }, [onboardingMode, priceRange]);

  const handleChooseBrowse = useCallback(() => {
    persistOnboardingMode('browse');
    setGuidedFiltersReady(true);
    setChatListingIds(null);
  }, [persistOnboardingMode]);

  const handleChooseGuided = useCallback(() => {
    persistOnboardingMode('guided');
    setGuidedFiltersReady(false);
    setChatListingIds(null);
  }, [persistOnboardingMode]);

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
          schoolAgeGroups={schoolAgeGroups}
          schoolRadiusMiles={schoolRadiusMiles}
          groceryRadiusMiles={groceryRadiusMiles}
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
          mapPriceMode={mapPriceMode}
          onMapPriceModeChange={setMapPriceMode}
          minBeds={minBeds}
          onMinBedsChange={setMinBeds}
          minBaths={minBaths}
          onMinBathsChange={setMinBaths}
          crimeRisk={crimeRisk}
          onCrimeRiskChange={setCrimeRisk}
          noiseRisk={noiseRisk}
          onNoiseRiskChange={setNoiseRisk}
          schoolAgeGroups={schoolAgeGroups}
          onSchoolAgeGroupsChange={setSchoolAgeGroups}
          schoolRadiusMiles={schoolRadiusMiles}
          onSchoolRadiusMilesChange={setSchoolRadiusMiles}
          groceryRadiusMiles={groceryRadiusMiles}
          onGroceryRadiusMilesChange={setGroceryRadiusMiles}
          onResetFilters={resetAllFilters}
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
        mode={onboardingMode === 'guided' ? 'guided' : 'browse'}
        onboardingMode={onboardingMode}
        onChooseBrowse={handleChooseBrowse}
        onChooseGuided={handleChooseGuided}
        onChatListingResult={handleChatListingResult}
        onFilterPatch={handleFilterPatch}
        compareProperties={chatCompareProperties}
      />

    </DashboardLayout>
  );
}
