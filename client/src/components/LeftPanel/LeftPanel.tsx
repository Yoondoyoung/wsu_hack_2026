import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Map,
  Satellite,
  Shield,
  GraduationCap,
  Users,
  Volume2,
  Building2,
  SlidersHorizontal,
  DollarSign,
  BedDouble,
  Bath,
  ShoppingCart,
} from 'lucide-react';
import type { MapViewMode, OverlayType } from '../../types/map';
import { glass, colors } from '../../design';
import type { TcoInputs } from '../../utils/tcoCalculator';

interface Props {
  viewMode: MapViewMode;
  activeOverlays: Set<OverlayType>;
  onViewChange: (mode: MapViewMode) => void;
  onOverlayToggle: (overlay: OverlayType) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  priceRange: [number, number];
  onPriceRangeChange: (range: [number, number]) => void;
  minSchoolRating: number;
  onMinSchoolRatingChange: (rating: number) => void;
  mapPriceMode: 'listing' | 'netMonthly';
  onMapPriceModeChange: (mode: 'listing' | 'netMonthly') => void;
  minBeds: number;
  onMinBedsChange: (beds: number) => void;
  minBaths: number;
  onMinBathsChange: (baths: number) => void;
  tcoInputs: TcoInputs;
  onTcoInputsChange: (inputs: TcoInputs) => void;
}

const MIN_PRICE = 0;
const MAX_PRICE = 3000000;
const PRICE_STEP = 50000;

function formatPriceShort(val: number) {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${Math.round(val / 1000)}k`;
  return `$${val}`;
}

const VIEW_MODES: { key: MapViewMode; label: string; icon: React.ElementType }[] = [
  { key: 'default', label: 'Default', icon: Map },
  { key: 'satellite', label: 'Satellite', icon: Satellite },
];

const OVERLAY_CONFIG: {
  key: OverlayType;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
}[] = [
  {
    key: 'crime',
    label: 'Crime Hotspots',
    icon: Shield,
    color: colors.red,
    bgColor: 'rgba(239,68,68,0.12)',
    description: 'Incident heatmap',
  },
  {
    key: 'schools',
    label: 'School Ratings',
    icon: GraduationCap,
    color: colors.emerald,
    bgColor: 'rgba(16,185,129,0.12)',
    description: 'School locations',
  },
  {
    key: 'grocery',
    label: 'Grocery Stores',
    icon: ShoppingCart,
    color: '#fb923c',
    bgColor: 'rgba(251,146,60,0.12)',
    description: 'Supermarkets & markets',
  },
  {
    key: 'population',
    label: 'Population Density',
    icon: Users,
    color: '#8b5cf6',
    bgColor: 'rgba(139,92,246,0.12)',
    description: 'Residents per sq mi',
  },
  {
    key: 'noise',
    label: 'Noise Levels',
    icon: Volume2,
    color: colors.yellow,
    bgColor: 'rgba(245,158,11,0.12)',
    description: 'Ambient dB readings',
  },
  {
    key: 'structures',
    label: 'Building Footprints',
    icon: Building2,
    color: colors.cyan,
    bgColor: 'rgba(103,232,249,0.12)',
    description: 'Structure outlines',
  },
];

export function LeftPanel({
  viewMode,
  activeOverlays,
  onViewChange,
  onOverlayToggle,
  collapsed,
  onToggleCollapse,
  priceRange,
  onPriceRangeChange,
  mapPriceMode,
  onMapPriceModeChange,
  minBeds,
  onMinBedsChange,
  minBaths,
  onMinBathsChange,
  tcoInputs,
  onTcoInputsChange,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const minPricePct = ((priceRange[0] - MIN_PRICE) / (MAX_PRICE - MIN_PRICE)) * 100;
  const maxPricePct = ((priceRange[1] - MIN_PRICE) / (MAX_PRICE - MIN_PRICE)) * 100;

  return (
    <div
      className="relative flex flex-col h-full w-full transition-all duration-300 ease-out overflow-hidden border-r"
      style={{
        ...glass.panelDense,
        borderRadius: 16,
        borderColor: colors.border,
      }}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-3 px-5 py-5 border-b flex-shrink-0 ${collapsed ? 'justify-center px-2' : ''}`}
        style={{ borderBottom: `1px solid ${colors.border}` }}
      >
        <div className="w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0" style={{ background: `${colors.blue}22`, borderColor: `${colors.blue}44` }}>
          <Map size={14} style={{ color: colors.blue }} />
        </div>

        {!collapsed && (
          <div>
            <p
              className="text-[11px] font-semibold leading-none"
              style={{ color: colors.white, fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
            >
              Utah Smart-Path
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: colors.whiteSubtle }}>
              SLC Explorer
            </p>
          </div>
        )}
      </div>

      {collapsed ? (
        <div className="flex flex-col items-center gap-3 pt-4 px-2">
          {VIEW_MODES.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onViewChange(key)}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={viewMode === key
                ? { background: `${colors.blue}22`, color: colors.blue, border: `1px solid ${colors.blue}44` }
                : { color: colors.whiteSubtle }}
            >
              <Icon size={14} />
            </button>
          ))}
          <div className="w-full h-px my-1" style={{ background: colors.border }} />
          {OVERLAY_CONFIG.map(({ key, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => onOverlayToggle(key)}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all border"
              style={activeOverlays.has(key)
                ? { color, background: `${color}22`, borderColor: `${color}55` }
                : { color: colors.whiteSubtle, borderColor: 'transparent' }}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* View Mode */}
          <div className="px-[30px] pt-5 pb-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: colors.whiteSubtle, fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
              Map View
            </div>
            <div className="flex gap-2">
              {VIEW_MODES.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => onViewChange(key)}
                  className="flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-lg text-[10px] font-medium transition-all border"
                  style={viewMode === key
                    ? { background: `${colors.blue}1f`, borderColor: `${colors.blue}55`, color: '#93c5fd' }
                    : { background: colors.whiteSoft, borderColor: colors.border, color: colors.whiteSubtle }}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px mx-[30px]" style={{ background: colors.border }} />

          {/* Data Overlays */}
          <div className="px-[30px] pt-4 pb-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: colors.whiteSubtle, fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
              Data Layers
            </div>
            <div className="flex flex-col gap-2">
              {OVERLAY_CONFIG.map(({ key, label, icon: Icon, color, bgColor, description }) => {
                const active = activeOverlays.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => onOverlayToggle(key)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg transition-all text-left border"
                    style={active
                      ? { background: bgColor, borderColor: `${color}55` }
                      : { borderColor: colors.border, background: 'transparent' }}
                  >
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                      style={active ? { background: `${color}35`, color } : { background: colors.whiteSoft, color: colors.whiteSubtle }}
                    >
                      <Icon size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[11px] font-medium leading-none mb-0.5"
                        style={{
                          color: active ? color : 'rgba(255,255,255,0.75)',
                          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                        }}
                      >
                        {label}
                      </div>
                      <div className="text-[10px] truncate" style={{ color: colors.whiteSubtle }}>
                        {description}
                      </div>
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? color : colors.whiteDim }} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px mx-[30px]" style={{ background: colors.border }} />

          {/* Filters */}
          <div className="px-[30px] pt-4 pb-5">
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex items-center justify-between w-full mb-2.5"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={11} style={{ color: colors.whiteSubtle }} />
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: colors.whiteSubtle, fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
                  Filters
                </span>
              </div>
              <ChevronRight
                size={12}
                className={`transition-transform ${filtersOpen ? 'rotate-90' : ''}`}
                style={{ color: colors.whiteSubtle }}
              />
            </button>

            {filtersOpen && (
              <div className="space-y-7">
                <div className="pt-0.5 -mb-1px">
                  <button
                    type="button"
                    onClick={() => onMapPriceModeChange(mapPriceMode === 'listing' ? 'netMonthly' : 'listing')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all"
                    style={{
                      borderColor: mapPriceMode === 'netMonthly' ? `${colors.cyan}88` : colors.border,
                      background: mapPriceMode === 'netMonthly' ? `${colors.cyan}14` : colors.whiteSoft,
                    }}
                  >
                    <span className="text-[11px] font-medium" style={{ color: mapPriceMode === 'netMonthly' ? colors.cyan : colors.whiteMuted }}>
                      {mapPriceMode === 'netMonthly' ? '$/mo' : 'Price'}
                    </span>
                    <span className="text-[10px]" style={{ color: colors.whiteSubtle }}>
                      {mapPriceMode === 'listing' ? '→ $/mo' : '→ Price'}
                    </span>
                  </button>
                </div>

                {mapPriceMode === 'netMonthly' && (
                  <div className="pt-0.5">
                    <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: colors.whiteSubtle, fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
                      Monthly Calc Inputs
                    </div>
                    <div className="space-y-2.5 p-2.5 rounded-lg border" style={{ borderColor: colors.border, background: colors.whiteSoft }}>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px]" style={{ color: colors.whiteMuted }}>Interest Rate</span>
                          <span className="text-[10px] font-semibold tabular-nums" style={{ color: colors.white }}>{tcoInputs.interestRate.toFixed(2)}%</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={12}
                          step={0.125}
                          value={tcoInputs.interestRate}
                          onChange={(e) => onTcoInputsChange({ ...tcoInputs, interestRate: Number(e.target.value) })}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px]" style={{ color: colors.whiteMuted }}>Down Payment</span>
                          <span className="text-[10px] font-semibold tabular-nums" style={{ color: colors.white }}>{Math.round(tcoInputs.downPercent)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={50}
                          step={1}
                          value={tcoInputs.downPercent}
                          onChange={(e) => onTcoInputsChange({ ...tcoInputs, downPercent: Number(e.target.value) })}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px]" style={{ color: colors.whiteMuted }}>Rent Offset</span>
                          <span className="text-[10px] font-semibold tabular-nums" style={{ color: colors.white }}>{Math.round(tcoInputs.rentPercent)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={tcoInputs.rentPercent}
                          onChange={(e) => onTcoInputsChange({ ...tcoInputs, rentPercent: Number(e.target.value) })}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-0.5">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <DollarSign size={11} style={{ color: colors.whiteSubtle }} />
                      <span className="text-[11px]" style={{ color: colors.whiteMuted }}>Price Range</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] mb-2">
                    <span style={{ color: colors.whiteMuted }}>{formatPriceShort(priceRange[0])}</span>
                    <span style={{ color: colors.whiteMuted }}>{formatPriceShort(priceRange[1])}</span>
                  </div>
                  <div className="relative h-6 px-0.5">
                    <div
                      className="absolute left-0.5 right-0.5 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                      style={{ background: colors.whiteSoft }}
                    />
                    <div
                      className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                      style={{
                        left: `calc(${minPricePct}% + 2px)`,
                        width: `calc(${Math.max(maxPricePct - minPricePct, 0)}% - 4px)`,
                        background: colors.cyan,
                      }}
                    />
                    <input
                      type="range"
                      min={MIN_PRICE}
                      max={MAX_PRICE}
                      step={PRICE_STEP}
                      value={priceRange[0]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        onPriceRangeChange([Math.min(v, priceRange[1] - PRICE_STEP), priceRange[1]]);
                      }}
                      className="range-dual-thumb absolute left-0.5 right-0.5 top-1/2 h-[3px] w-auto -translate-y-1/2"
                      style={{ zIndex: priceRange[0] > MAX_PRICE - PRICE_STEP * 2 ? 5 : 3 }}
                    />
                    <input
                      type="range"
                      min={MIN_PRICE}
                      max={MAX_PRICE}
                      step={PRICE_STEP}
                      value={priceRange[1]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        onPriceRangeChange([priceRange[0], Math.max(v, priceRange[0] + PRICE_STEP)]);
                      }}
                      className="range-dual-thumb absolute left-0.5 right-0.5 top-1/2 h-[3px] w-auto -translate-y-1/2"
                      style={{ zIndex: 4 }}
                    />
                  </div>
                </div>

                <div className="pt-0.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <BedDouble size={11} style={{ color: colors.whiteSubtle }} />
                      <span className="text-[11px]" style={{ color: colors.whiteMuted }}>Min Bedrooms</span>
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: colors.whiteMuted }}>{minBeds}+</span>
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onMinBedsChange(n)}
                        className="flex-1 py-1 rounded text-[10px] font-medium transition-all border"
                        style={minBeds === n
                          ? { background: `${colors.blue}22`, borderColor: `${colors.blue}55`, color: '#93c5fd' }
                          : { background: colors.whiteSoft, borderColor: colors.border, color: colors.whiteSubtle }}
                      >
                        {n === 0 ? 'Any' : `${n}+`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-0.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Bath size={11} style={{ color: colors.whiteSubtle }} />
                      <span className="text-[11px]" style={{ color: colors.whiteMuted }}>Min Bathrooms</span>
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: colors.whiteMuted }}>{minBaths}+</span>
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onMinBathsChange(n)}
                        className="flex-1 py-1 rounded text-[10px] font-medium transition-all border"
                        style={minBaths === n
                          ? { background: `${colors.blue}22`, borderColor: `${colors.blue}55`, color: '#93c5fd' }
                          : { background: colors.whiteSoft, borderColor: colors.border, color: colors.whiteSubtle }}
                      >
                        {n === 0 ? 'Any' : `${n}+`}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="px-[30px] py-3.5 border-t flex-shrink-0 flex items-center justify-between" style={{ borderTopColor: colors.border }}>
          <p className="text-[9px] font-medium tracking-widest uppercase" style={{ color: colors.white }}>
            WSU Hackathon · 2026
          </p>
          <button
            onClick={onToggleCollapse}
            className="w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
            style={{
              background: colors.bgPanelMedium,
              border: `1px solid ${colors.border}`,
              color: colors.whiteSubtle,
              boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
            }}
          >
            <ChevronLeft size={12} />
          </button>
        </div>
      )}
      {collapsed && (
        <div className="px-2 py-3 border-t flex-shrink-0 flex items-center justify-center gap-1.5" style={{ borderTopColor: colors.border }}>
          <button
            onClick={onToggleCollapse}
            className="w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
            style={{
              background: colors.bgPanelMedium,
              border: `1px solid ${colors.border}`,
              color: colors.whiteSubtle,
              boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
            }}
          >
            <ChevronRight size={10} />
          </button>
          <p className="text-[8px] font-semibold" style={{ color: colors.whiteFaint, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            WSU
          </p>
        </div>
      )}
    </div>
  );
}
