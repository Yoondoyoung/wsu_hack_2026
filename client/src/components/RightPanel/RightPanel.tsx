import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronDown,
  Bed, Bath, Square,
  Volume2, GraduationCap,
  ShieldAlert, DollarSign, TrendingDown,
} from 'lucide-react';
import type { Property } from '../../types/property';
import { formatPrice, formatSqft } from '../../utils/formatters';
import { crimeRiskLabel } from '../../utils/crimeRisk';
import {
  glass, colors, TAG_STYLES,
} from '../../design';
import { PropertyDetail } from './PropertyDetail';
import { calcTCO, type TcoInputs } from '../../utils/tcoCalculator';

/* ─── Props ────────────────────────────────────────────────── */
interface Props {
  properties: Property[];
  selectedId: string | null;
  onSelectProperty: (id: string) => void;
  loading: boolean;
  onCardAnchorChange: (pos: { x: number; y: number } | null) => void;
  tcoInputs: TcoInputs;
  onTcoInputsChange: (next: TcoInputs) => void;
  onShowRoute?: (
    from: [number, number],
    to: [number, number],
    toName: string,
    toAddress: string,
    sourcePropertyId: string,
    sourcePropertyAddress: string,
  ) => void;
  /** When set, auto-opens PropertyDetail for this property (ts ensures re-trigger on same id) */
  reopenTrigger?: { id: string; ts: number } | null;
  /** Called immediately after reopenTrigger is consumed so App can clear it */
  onReopenHandled?: () => void;
}

/* ─── Badge ────────────────────────────────────────────────── */
function PropertyBadge({ label, icon: Icon }: { label: string; icon?: React.ElementType }) {
  const style = TAG_STYLES[label] ?? { bg: colors.whiteTint, color: colors.whiteMuted };
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: style.bg, color: style.color, border: `1px solid ${style.color}30` }}>
      {Icon && <Icon size={10} />}{label}
    </span>
  );
}

/* ─── Compact TCO (inline in accordion card) ──────────────── */
function CompactTcoSummary({ property, tcoInputs }: { property: Property; tcoInputs: TcoInputs }) {
  const [open, setOpen] = useState(false);
  const tco = useMemo(() => calcTCO(property, tcoInputs), [property, tcoInputs]);
  const hasRent = tco.effectiveRentEstimate > 0;
  const insuranceHint = property.crimeRiskLevel === 'high'
    ? 'Base +25% (high crime risk)'
    : property.crimeRiskLevel === 'medium'
      ? 'Base +10% (medium crime risk)'
      : 'Base rate applied';
  const maintenanceHint = property.yearBuilt && property.yearBuilt >= 2020
    ? '0.5%/yr (newer home)'
    : property.yearBuilt && property.yearBuilt >= 1980
      ? '1.0%/yr baseline'
      : '1.5%/yr (older home)';
  const pmiHint = tcoInputs.downPercent >= 20
    ? null
    : `Applied because down payment is below 20% (currently ${Math.round(tcoInputs.downPercent)}%).`;
  const rentalIncomeHint = `${Math.round(tcoInputs.rentPercent)}% of $${tco.effectiveRentEstimate.toLocaleString()} expected rent`;

  return (
    <div className="mt-3" style={{ borderTop: `1px solid ${colors.border}` }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center justify-between w-full py-2"
      >
        <span className="flex items-center gap-1.5">
          <DollarSign size={11} style={{ color: colors.cyan }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: colors.whiteMuted }}>
            Est. Monthly
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs font-black tabular-nums" style={{ color: hasRent ? colors.cyan : colors.white }}>
            ${(hasRent ? tco.netMonthly : tco.grossMonthly).toLocaleString()}/mo
          </span>
          <ChevronDown size={12} style={{ color: colors.whiteMuted, transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
        </span>
      </button>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 0.2s ease' }}>
        <div style={{ overflow: 'hidden' }}>
          <div className="pb-2 space-y-1">
            <TcoRow label="P&I" detail="Principal + interest payment" value={tco.principalInterest} />
            <TcoRow label="Tax" detail="Estimated annual property tax / 12" value={tco.propertyTax} />
            <TcoRow label="Insurance" detail={insuranceHint} value={tco.insurance} />
            <TcoRow label="Maintenance" detail={maintenanceHint} value={tco.maintenance} />
            {tco.hoa > 0 && <TcoRow label="HOA" value={tco.hoa} />}
            {tco.pmi > 0 && <TcoRow label="PMI" detail={pmiHint ?? undefined} value={tco.pmi} />}
            <div style={{ height: 1, background: colors.border, margin: '4px 0' }} />
            <TcoRow label="Total Monthly Cost" value={tco.grossMonthly} bold />
            {hasRent && (
              <>
                <TcoRow label="Rental Income" detail={rentalIncomeHint} value={-tco.rentalIncome} green />
                <div style={{ height: 1, background: `${colors.cyan}40`, margin: '4px 0' }} />
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: colors.white }}>
                    <TrendingDown size={10} style={{ color: '#34d399' }} />Net
                  </span>
                  <span className="text-[11px] font-black tabular-nums" style={{ color: tco.netMonthly <= 0 ? '#34d399' : colors.white }}>
                    ${Math.abs(tco.netMonthly).toLocaleString()}/mo
                  </span>
                </div>
              </>
            )}
            {tco.usedDefaultRentEstimate && (
              <p className="text-[8px]" style={{ color: '#f59e0b' }}>
                Rent estimate missing. Using default estimate (0.65% of home price/month).
              </p>
            )}
            <p className="text-[8px] mt-1" style={{ color: colors.whiteSubtle }}>
              Inputs: {tcoInputs.interestRate.toFixed(2)}% rate, {Math.round(tcoInputs.downPercent)}% down{hasRent ? `, ${Math.round(tcoInputs.rentPercent)}% rent offset` : ''}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TcoRow({
  label,
  detail,
  value,
  bold,
  green,
}: {
  label: string;
  detail?: string;
  value: number;
  bold?: boolean;
  green?: boolean;
}) {
  const formatted = value < 0 ? `-$${Math.abs(value).toLocaleString()}` : `$${value.toLocaleString()}`;
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="flex flex-col" style={{ color: colors.whiteSubtle }}>
        <span>{label}</span>
        {detail && <span className="text-[8px]" style={{ color: colors.whiteSubtle }}>{detail}</span>}
      </span>
      <span className={`tabular-nums ${bold ? 'font-bold' : 'font-medium'}`} style={{ color: green ? '#34d399' : colors.whiteMuted }}>
        {formatted}
      </span>
    </div>
  );
}

/* ─── Expanded Detail (inside accordion) ──────────────────── */
function ExpandedDetail({
  property,
  onOpenDetail,
  tcoInputs,
}: {
  property: Property;
  onOpenDetail: (property: Property) => void;
  tcoInputs: TcoInputs;
}) {
  const [photoIdx, setPhotoIdx] = useState(0);

  useEffect(() => { setPhotoIdx(0); }, [property.id]);

  const photos = property.photos.length > 0 ? property.photos : [property.imageUrl];
  const photoCount = photos.length;
  const slidePct = photoCount > 0 ? (photoIdx / photoCount) * 100 : 0;
  const prevPhoto = () => setPhotoIdx((i) => (i - 1 + photoCount) % photoCount);
  const nextPhoto = () => setPhotoIdx((i) => (i + 1) % photoCount);

  const hasTopSchool = property.schools.some((s) => s.rating >= 8);
  const hasQuietZone = property.flexText?.toLowerCase().includes('quiet');

  return (
    // Clicks here must not bubble to CompactCard (would toggle selection and break carousel)
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      {/* Hero carousel — horizontal slide */}
      <div className="relative w-full rounded-xl overflow-hidden bg-black/30" style={{ height: 180 }}>
        <div
          className="flex h-full"
          style={{
            width: `${photoCount * 100}%`,
            transform: `translateX(-${slidePct}%)`,
            transition: 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)',
            willChange: 'transform',
          }}
        >
          {photos.map((src, i) => (
            <div
              key={i}
              className="h-full flex-shrink-0"
              style={{ width: `${100 / photoCount}%` }}
            >
              <img
                src={src}
                alt=""
                className="w-full h-full object-cover select-none pointer-events-none"
                draggable={false}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://placehold.co/360x180/0a1223/00c8ff?text=No+Image';
                }}
              />
            </div>
          ))}
        </div>

        <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: 72, background: `linear-gradient(to top, ${colors.bgPanelDense}, transparent)` }} />

        {photoCount > 1 && (
          <span
            className="absolute top-2 right-2 z-[2] text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-md pointer-events-none"
            style={{ ...glass.pillSmall, color: colors.white, letterSpacing: '0.02em' }}
          >
            {photoIdx + 1} / {photoCount}
          </span>
        )}

        {photoCount > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center z-[2]"
              style={{ ...glass.pillSmall, color: colors.white }}
              aria-label="Previous photo"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center z-[2]"
              style={{ ...glass.pillSmall, color: colors.white }}
              aria-label="Next photo"
            >
              <ChevronRight size={15} />
            </button>
          </>
        )}

        {photoCount > 1 && (
          <div className="absolute bottom-2 left-1/2 z-[2] flex max-w-[calc(100%-1rem)] -translate-x-1/2 gap-1 items-center justify-center overflow-x-auto px-1 py-0.5 scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => { e.stopPropagation(); setPhotoIdx(i); }}
                className="flex-shrink-0 transition-all duration-200"
                style={{
                  width: i === photoIdx ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === photoIdx ? colors.cyan : colors.whiteSubtle,
                  boxShadow: i === photoIdx ? `0 0 6px ${colors.cyan}` : 'none',
                }}
                aria-label={`Photo ${i + 1}`}
                aria-current={i === photoIdx ? 'true' : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Price + address */}
      <div className="px-1 pt-3 pb-2">
        <h3 className="text-xl font-black" style={{ color: colors.white }}>{formatPrice(property.price)}</h3>
        <p className="text-xs font-medium mt-0.5" style={{ color: colors.cyan }}>{property.address}</p>

        <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: colors.whiteMuted }}>
          <span className="flex items-center gap-1"><Bed size={12} style={{ color: colors.whiteSubtle }} />{property.beds} bd</span>
          <span className="flex items-center gap-1"><Bath size={12} style={{ color: colors.whiteSubtle }} />{property.baths} ba</span>
          <span className="flex items-center gap-1"><Square size={12} style={{ color: colors.whiteSubtle }} />{formatSqft(property.sqft)} sqft</span>
        </div>

        {/* Badges */}
        <div className="flex gap-1.5 mt-2 flex-wrap items-center">
          <PropertyBadge
            label={crimeRiskLabel(property.crimeRiskLevel)}
            icon={ShieldAlert}
          />
          <span className="text-[9px] leading-tight" style={{ color: colors.whiteSubtle }}>
            {property.crimeIncidentCount ?? 0} incidents within {property.crimeRiskRadiusMiles ?? 0.5} mi
          </span>
          {hasQuietZone && <PropertyBadge label="Quiet Zone" icon={Volume2} />}
          {hasTopSchool && <PropertyBadge label="Top School" icon={GraduationCap} />}
        </div>

        {/* Compact TCO summary */}
        <CompactTcoSummary property={property} tcoInputs={tcoInputs} />

        {/* Detail link */}
        {property.detailUrl && (
          <a href={property.detailUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-[10px] font-medium underline" style={{ color: colors.whiteSubtle }}>View source listing &rarr;</a>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(property);
            }}
            className="w-full py-2 rounded-xl text-xs font-bold uppercase tracking-wider"
            style={{ background: colors.whiteTint, color: colors.white, border: `1px solid ${colors.border}` }}
          >
            View this house
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Compact Card ─────────────────────────────────────────── */
function CompactCard({
  property, selected, dimmed, onClick, onOpenDetail, tcoInputs,
}: {
  property: Property;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
  onOpenDetail: (property: Property) => void;
  tcoInputs: TcoInputs;
}) {
  const photo = property.photos?.[0] || property.imageUrl;

  return (
    <div
      className="cursor-pointer transition-opacity duration-150"
      style={{ opacity: dimmed ? 0.35 : 1 }}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 py-2">
        {/* Thumbnail */}
        <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden" style={{ border: selected ? `2px solid ${colors.cyan}` : `1px solid ${colors.border}` }}>
          <img src={photo} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/56x56/0a1223/00c8ff?text=·'; }} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight" style={{ color: selected ? colors.cyan : colors.white }}>{formatPrice(property.price)}</p>
          <p className="text-[11px] mt-0.5 truncate" style={{ color: colors.whiteMuted }}>{property.streetAddress}</p>
          <p className="text-[10px] mt-0.5" style={{ color: colors.whiteSubtle }}>
            {property.beds}bd · {property.baths}ba · {formatSqft(property.sqft)}ft²
            <span style={{ color: TAG_STYLES[crimeRiskLabel(property.crimeRiskLevel)]?.color ?? colors.whiteSubtle }}>
              {' · '}{crimeRiskLabel(property.crimeRiskLevel)}
            </span>
          </p>
        </div>

        {/* Status badge */}
        {property.statusText && (
          <span className="flex-shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(0,200,255,0.1)', color: colors.cyan, border: '1px solid rgba(0,200,255,0.2)' }}>
            {property.statusText}
          </span>
        )}
      </div>

      {/* Accordion body */}
      <div style={{ display: 'grid', gridTemplateRows: selected ? '1fr' : '0fr', transition: 'grid-template-rows 0.2s ease' }}>
        <div style={{ overflow: 'hidden' }}>
          {selected && <ExpandedDetail property={property} onOpenDetail={onOpenDetail} tcoInputs={tcoInputs} />}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: colors.border }} />
    </div>
  );
}

/** Scroll `child` so its vertical center aligns with `container`'s visible center. */
function scrollChildToVerticalCenter(container: HTMLElement, child: HTMLElement) {
  const cRect = container.getBoundingClientRect();
  const eRect = child.getBoundingClientRect();
  const childCenterY = eRect.top + eRect.height / 2;
  const containerCenterY = cRect.top + cRect.height / 2;
  const delta = childCenterY - containerCenterY;
  const next = container.scrollTop + delta;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.max(0, Math.min(next, maxScroll));
}

/* ─── Main RightPanel ──────────────────────────────────────── */
export function RightPanel({
  properties,
  selectedId,
  onSelectProperty,
  loading,
  onCardAnchorChange,
  tcoInputs,
  onTcoInputsChange,
  onShowRoute,
  reopenTrigger,
  onReopenHandled,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const [detailProperty, setDetailProperty] = useState<Property | null>(null);

  // Auto-reopen PropertyDetail when App signals a reopen — clear trigger immediately to avoid repeated firing
  useEffect(() => {
    if (!reopenTrigger) return;
    const p = properties.find((prop) => prop.id === reopenTrigger.id);
    if (p) setDetailProperty(p);
    onReopenHandled?.();          // tell App to set reopenTrigger → null right away
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopenTrigger]);            // intentionally omit properties/onReopenHandled to fire only when trigger changes

  // Center selected row in the list viewport (re-run when card height changes, e.g. accordion open)
  useEffect(() => {
    if (!selectedId) return;
    const container = scrollRef.current;
    const el = selectedCardRef.current;
    if (!container || !el) return;

    let raf = 0;
    const scheduleCenter = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (scrollRef.current && selectedCardRef.current) {
          scrollChildToVerticalCenter(scrollRef.current, selectedCardRef.current);
        }
      });
    };

    scheduleCenter();
    requestAnimationFrame(scheduleCenter);

    const ro = new ResizeObserver(() => scheduleCenter());
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [selectedId]);

  // rAF loop: report card anchor position
  const rafIdRef = useRef(0);
  const reportAnchor = useCallback(() => {
    if (selectedId && selectedCardRef.current) {
      const rect = selectedCardRef.current.getBoundingClientRect();
      onCardAnchorChange({ x: rect.left, y: rect.top + rect.height / 2 });
    } else {
      onCardAnchorChange(null);
    }
    rafIdRef.current = requestAnimationFrame(reportAnchor);
  }, [selectedId, onCardAnchorChange]);

  useEffect(() => {
    rafIdRef.current = requestAnimationFrame(reportAnchor);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [reportAnchor]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailProperty(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <>
      <div
        className="h-full flex flex-col overflow-hidden"
        style={{
          ...glass.panelDense,
          borderRadius: 0,
          borderLeft: `1px solid ${colors.border}`,
          borderTop: 'none',
          borderRight: 'none',
          borderBottom: 'none',
          boxShadow: '-8px 0 48px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <h2
            className="text-sm font-bold tracking-wide"
            style={{ color: colors.white, fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
          >
            Properties
          </h2>
          <p className="text-[10px] mt-0.5" style={{ color: colors.whiteMuted }}>
            {loading ? 'Loading...' : `${properties.length} listings`}
          </p>
        </div>

        {/* Scrollable list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3">
          {properties.map((p) => {
            const isSelected = p.id === selectedId;
            const isDimmed = selectedId !== null && !isSelected;
            return (
              <div key={p.id} ref={isSelected ? selectedCardRef : undefined}>
                <CompactCard
                  property={p}
                  selected={isSelected}
                  dimmed={isDimmed}
                  onClick={() => onSelectProperty(p.id)}
                  onOpenDetail={setDetailProperty}
                  tcoInputs={tcoInputs}
                />
              </div>
            );
          })}

          {!loading && properties.length === 0 && (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs" style={{ color: colors.whiteSubtle }}>No properties match your filters</p>
            </div>
          )}
        </div>
      </div>

      {detailProperty && (
        <PropertyDetail
          property={detailProperty}
          onClose={() => setDetailProperty(null)}
          tcoInputs={tcoInputs}
          onTcoInputsChange={onTcoInputsChange}
          onShowRoute={onShowRoute}
        />
      )}
    </>
  );
}
