import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ViewToggle } from './ViewToggle';
import { OverlayToggle } from './OverlayToggle';
import type { MapViewMode, OverlayType } from '../../types/map';
import { glass, colors } from '../../design';

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
}

const MIN_PRICE = 0;
const MAX_PRICE = 3000000;

function formatPriceShort(val: number) {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${Math.round(val / 1000)}k`;
  return `$${val}`;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p
      className="text-[10px] font-semibold uppercase mb-3"
      style={{ color: colors.whiteSubtle, letterSpacing: '0.1em' }}
    >
      {children}
    </p>
  );
}

function Divider() {
  return (
    <div style={{ height: 1, background: colors.whiteDim, margin: '2px 0' }} />
  );
}

export function LeftPanel({
  viewMode,
  activeOverlays,
  onViewChange,
  onOverlayToggle,
  collapsed,
  onToggleCollapse,
  priceRange,
  onPriceRangeChange,
  minSchoolRating,
  onMinSchoolRatingChange,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const activeCount = activeOverlays.size;

  return (
    <div
      className="h-full flex flex-col relative overflow-hidden"
      style={{
        ...glass.panelDense,
        borderRadius: 16,
      }}
    >
      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="absolute -right-3.5 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
        style={{
          background: colors.bgPanelDense,
          border: `1px solid ${colors.borderInput}`,
          color: colors.whiteMuted,
          boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
        }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Header */}
      <div
        className={`flex items-center gap-3 py-5 flex-shrink-0 ${collapsed ? 'justify-center px-3' : 'px-6'}`}
        style={{ borderBottom: `1px solid ${colors.border}` }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, rgba(0,200,255,0.18), rgba(100,140,255,0.18))`,
            border: `1px solid rgba(0,200,255,0.22)`,
            boxShadow: `0 0 14px rgba(0,200,255,0.12)`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: colors.cyan, boxShadow: `0 0 6px ${colors.cyan}` }}
          />
        </div>

        {!collapsed && (
          <div>
            <p className="text-sm font-bold" style={{ color: colors.white, letterSpacing: '0.01em' }}>
              Smart-Path
            </p>
            <p className="text-[10px] font-medium" style={{ color: colors.whiteSubtle, letterSpacing: '0.05em' }}>
              SLC Explorer
            </p>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto py-5 space-y-5">

        {/* Map View */}
        <section className={collapsed ? 'px-2' : 'px-6'}>
          {!collapsed && <SectionLabel>Map View</SectionLabel>}
          <ViewToggle current={viewMode} onChange={onViewChange} collapsed={collapsed} />
        </section>

        <div className={collapsed ? 'mx-2' : 'mx-6'}><Divider /></div>

        {/* Data Layers */}
        <section className={collapsed ? 'px-2' : 'px-6'}>
          {!collapsed && (
            <div className="flex items-start justify-between gap-2 mb-3 min-w-0">
              <div className="min-w-0 flex-1">
                <SectionLabel>Data Layers</SectionLabel>
              </div>
              {activeCount > 0 && (
                <span
                  className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                  style={{
                    background: `rgba(0,200,255,0.12)`,
                    color: colors.cyan,
                    border: `1px solid rgba(0,200,255,0.22)`,
                  }}
                >
                  {activeCount} ON
                </span>
              )}
            </div>
          )}
          <OverlayToggle activeOverlays={activeOverlays} onToggle={onOverlayToggle} collapsed={collapsed} />
        </section>

        {/* Filters — expanded only */}
        {!collapsed && (
          <>
            <div className="mx-6"><Divider /></div>

            <section className="px-6">
              <button
                type="button"
                className="flex items-center justify-between gap-2 w-full mb-4 min-w-0 text-left"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <div className="min-w-0 flex-1">
                  <SectionLabel>Filters</SectionLabel>
                </div>
                <span
                  className="text-[9px] font-bold transition-transform duration-200 flex-shrink-0 pt-0.5"
                  style={{
                    color: colors.whiteSubtle,
                    transform: filtersOpen ? 'rotate(180deg)' : 'none',
                  }}
                >
                  ▼
                </span>
              </button>

              {filtersOpen && (
                <div className="space-y-5">
                  {/* Price Range */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-[10px] font-medium" style={{ color: colors.whiteMuted }}>Price Range</span>
                      <span className="text-[10px] font-semibold" style={{ color: colors.cyan }}>
                        {formatPriceShort(priceRange[0])} – {formatPriceShort(priceRange[1])}
                      </span>
                    </div>
                    <div className="space-y-2.5 px-0.5">
                      <input type="range" min={MIN_PRICE} max={MAX_PRICE} step={50000}
                        value={priceRange[0]}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          onPriceRangeChange([Math.min(v, priceRange[1] - 50000), priceRange[1]]);
                        }}
                        className="w-full" />
                      <input type="range" min={MIN_PRICE} max={MAX_PRICE} step={50000}
                        value={priceRange[1]}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          onPriceRangeChange([priceRange[0], Math.max(v, priceRange[0] + 50000)]);
                        }}
                        className="w-full" />
                    </div>
                  </div>

                  {/* School Rating */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-[10px] font-medium" style={{ color: colors.whiteMuted }}>Min School Rating</span>
                      <span className="text-[10px] font-semibold" style={{ color: colors.emerald }}>
                        {minSchoolRating === 0 ? 'Any' : `${minSchoolRating}+`}
                      </span>
                    </div>
                    <input type="range" min={0} max={10} step={1}
                      value={minSchoolRating}
                      onChange={(e) => onMinSchoolRatingChange(Number(e.target.value))}
                      className="w-full px-0.5 box-border"
                      style={{ accentColor: colors.emerald }} />
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[9px]" style={{ color: colors.whiteFaint }}>Any</span>
                      <span className="text-[9px]" style={{ color: colors.whiteFaint }}>10</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <div className="mx-6"><Divider /></div>

            {/* Legend */}
            <section className="px-6">
              <SectionLabel>Heatmap Legend</SectionLabel>
              <div className="space-y-2.5">
                {[
                  { color: colors.red, label: 'High Risk' },
                  { color: colors.yellow, label: 'Moderate' },
                  { color: colors.emerald, label: 'Low Risk / Good' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: color, boxShadow: `0 0 5px ${color}` }}
                    />
                    <span className="text-[11px] font-medium" style={{ color: colors.whiteMuted }}>{label}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Footer */}
      {!collapsed && (
        <div
          className="px-6 py-3.5 flex-shrink-0"
          style={{ borderTop: `1px solid ${colors.border}` }}
        >
          <p className="text-[9px] font-medium tracking-widest uppercase" style={{ color: colors.whiteFaint }}>
            WSU Hackathon · 2026
          </p>
        </div>
      )}
    </div>
  );
}
