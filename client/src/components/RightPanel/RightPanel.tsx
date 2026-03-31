import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronDown,
  Bed, Bath, Square,
  Volume2, GraduationCap,
  AlertCircle, ShieldAlert,
} from 'lucide-react';
import { useMortgagePredictor } from '../../hooks/useMortgagePredictor';
import type { MortgageRequestPayload } from '../../types/mortgage';
import type { Property } from '../../types/property';
import { formatPrice, formatSqft } from '../../utils/formatters';
import { crimeRiskLabel } from '../../utils/crimeRisk';
import {
  glass, colors, TAG_STYLES, ctaButtonStyle,
  getGaugeColor, getGaugeLabel,
} from '../../design';

/* ─── Props ────────────────────────────────────────────────── */
interface Props {
  properties: Property[];
  selectedId: string | null;
  onSelectProperty: (id: string) => void;
  loading: boolean;
  onCardAnchorChange: (pos: { x: number; y: number } | null) => void;
}

/* ─── Circular Gauge ───────────────────────────────────────── */
function CircularGauge({ value }: { value: number }) {
  const r = 50;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value / 100);
  const { main: color, glow } = getGaugeColor(value);
  const label = getGaugeLabel(value);

  return (
    <div className="flex flex-col items-center gap-2 pt-3 pb-1">
      <svg viewBox="0 0 120 120" className="w-28 h-28">
        <defs>
          <filter id="gauge-glow-rp" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke={colors.whiteDim} strokeWidth="9" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 60 60)" filter="url(#gauge-glow-rp)"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.5s' }}
        />
        <text x="60" y="56" textAnchor="middle" fill={colors.white} fontSize="24" fontWeight="800" fontFamily="Inter,system-ui">{value}%</text>
        <text x="60" y="72" textAnchor="middle" fill={colors.whiteMuted} fontSize="8" letterSpacing="1.5" fontFamily="Inter,system-ui">APPROVAL</text>
      </svg>
      <p className="text-xs font-semibold" style={{ color, textShadow: `0 0 12px ${glow}` }}>{label}</p>
    </div>
  );
}

/* ─── Mortgage form helpers ────────────────────────────────── */
const FIELD_DEFAULTS = { annualIncome: 85000, totalDebt: 15000, loanAmount: 300000, downPayment: 80000, creditScore: 720 };

function computePayload(f: typeof FIELD_DEFAULTS, property: Property | null): MortgageRequestPayload {
  const propertyValue = property?.price ?? (f.loanAmount + f.downPayment);
  const dti = f.annualIncome > 0 ? (f.totalDebt / f.annualIncome) * 100 : 36;
  let dtiStr = '36';
  if (dti < 30) dtiStr = '20%-<30%';
  else if (dti < 36) dtiStr = '30%-<36%';
  else if (dti < 40) dtiStr = '36';
  else if (dti < 43) dtiStr = '40';
  else if (dti < 50) dtiStr = '43';
  else dtiStr = '50%-60%';
  return { loan_amount: f.loanAmount, property_value: propertyValue, income: Math.round(f.annualIncome / 1000), debt_to_income_ratio: dtiStr, loan_type: 1, loan_purpose: 1, loan_term: 360, applicant_age: '35-44', applicant_sex: 1, occupancy_type: 1 };
}

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: colors.whiteSubtle }}>{label}</label>
      <div className="flex items-center gap-1 px-2.5 py-2" style={{ background: colors.whiteSoft, border: `1px solid ${colors.borderInput}`, borderRadius: 10 }}>
        <span className="text-xs font-semibold" style={{ color: colors.whiteSubtle }}>$</span>
        <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} min={0} className="flex-1 bg-transparent text-xs font-medium focus:outline-none min-w-0" style={{ color: colors.white }} />
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: colors.whiteSubtle }}>{label}</label>
      <div className="flex items-center px-2.5 py-2" style={{ background: colors.whiteSoft, border: `1px solid ${colors.borderInput}`, borderRadius: 10 }}>
        <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} min={300} max={850} className="flex-1 bg-transparent text-xs font-medium focus:outline-none min-w-0" style={{ color: colors.white }} />
      </div>
    </div>
  );
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

/* ─── Expanded Detail (inside accordion) ──────────────────── */
function ExpandedDetail({ property }: { property: Property }) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [mortgageOpen, setMortgageOpen] = useState(false);
  const [fields, setFields] = useState(FIELD_DEFAULTS);
  const { result, loading: predLoading, error, predict } = useMortgagePredictor();

  useEffect(() => { setPhotoIdx(0); }, [property.id]);
  useEffect(() => {
    setFields((prev) => ({ ...prev, loanAmount: Math.round(property.price * 0.8), downPayment: Math.round(property.price * 0.2) }));
  }, [property.id, property.price]);

  const photos = property.photos.length > 0 ? property.photos : [property.imageUrl];
  const photoCount = photos.length;
  const slidePct = photoCount > 0 ? (photoIdx / photoCount) * 100 : 0;
  const prevPhoto = () => setPhotoIdx((i) => (i - 1 + photoCount) % photoCount);
  const nextPhoto = () => setPhotoIdx((i) => (i + 1) % photoCount);
  const handlePredict = (e: React.FormEvent) => { e.preventDefault(); predict(computePayload(fields, property)); };
  const set = (key: keyof typeof FIELD_DEFAULTS) => (v: number) => setFields((prev) => ({ ...prev, [key]: v }));

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

        {/* Detail link */}
        {property.detailUrl && (
          <a href={property.detailUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-[10px] font-medium underline" style={{ color: colors.whiteSubtle }}>View source listing &rarr;</a>
        )}
      </div>

      {/* Mortgage predictor (collapsible) */}
      <div className="mt-1" style={{ borderTop: `1px solid ${colors.border}` }}>
        <button type="button" onClick={() => setMortgageOpen(!mortgageOpen)} className="flex items-center justify-between w-full px-1 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: colors.whiteMuted }}>AI Mortgage Predictor</span>
          <ChevronDown size={14} style={{ color: colors.whiteMuted, transform: mortgageOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.3s' }} />
        </button>
        <div style={{ display: 'grid', gridTemplateRows: mortgageOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.2s ease' }}>
          <div style={{ overflow: 'hidden' }}>
            <form onSubmit={handlePredict} className="space-y-2 px-1 pb-3">
              <div className="grid grid-cols-2 gap-2">
                <MoneyInput label="Annual Income" value={fields.annualIncome} onChange={set('annualIncome')} />
                <MoneyInput label="Total Debt" value={fields.totalDebt} onChange={set('totalDebt')} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MoneyInput label="Loan Amount" value={fields.loanAmount} onChange={set('loanAmount')} />
                <MoneyInput label="Down Payment" value={fields.downPayment} onChange={set('downPayment')} />
              </div>
              <NumberInput label="Credit Score" value={fields.creditScore} onChange={set('creditScore')} />
              <button type="submit" disabled={predLoading} className="w-full py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all disabled:opacity-50 mt-1" style={predLoading ? { background: colors.whiteTint, color: colors.whiteMuted, border: `1px solid ${colors.border}`, borderRadius: 12 } : { ...ctaButtonStyle, borderRadius: 12 }}>
                {predLoading ? 'Calculating...' : 'Calculate Approval'}
              </button>
            </form>
            {error && (
              <div className="mx-1 mb-2 flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.2)' }}>
                <AlertCircle size={12} style={{ color: colors.red, marginTop: 1, flexShrink: 0 }} />
                <p className="text-[10px]" style={{ color: `${colors.red}cc` }}>{error}</p>
              </div>
            )}
            {result && !error && <CircularGauge value={result.confidence} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Compact Card ─────────────────────────────────────────── */
function CompactCard({ property, selected, dimmed, onClick }: { property: Property; selected: boolean; dimmed: boolean; onClick: () => void }) {
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
          {selected && <ExpandedDetail property={property} />}
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
export function RightPanel({ properties, selectedId, onSelectProperty, loading, onCardAnchorChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedCardRef = useRef<HTMLDivElement>(null);

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

  return (
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
        <h2 className="text-sm font-bold tracking-wide" style={{ color: colors.white }}>Properties</h2>
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
  );
}
