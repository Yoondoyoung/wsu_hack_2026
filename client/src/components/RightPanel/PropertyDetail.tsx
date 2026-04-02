import { useEffect, useState, useMemo, useCallback, type ElementType, type ReactNode } from 'react';
import {
  X, ChevronLeft, ChevronRight, Bed, Bath, Square, Flame, Snowflake, Car, Wrench, Building,
  GraduationCap, User, Phone, Clock, Eye, Heart, TrendingUp, ExternalLink, ShieldAlert,
  AlertCircle, DollarSign, TrendingDown, Lightbulb, ArrowUp, ShoppingCart, Navigation,
} from 'lucide-react';
import { useNearbyGrocery } from '../../hooks/useNearbyGrocery';
import { useMortgagePredictor, type ScenarioResult } from '../../hooks/useMortgagePredictor';
import type { MortgageRequestPayload } from '../../types/mortgage';
import type { Property } from '../../types/property';
import { formatPrice, formatSqft } from '../../utils/formatters';
import { crimeRiskLabel } from '../../utils/crimeRisk';
import { colors, ctaButtonStyle, getGaugeColor, getGaugeLabel } from '../../design';
import { calcTCO, type TcoInputs } from '../../utils/tcoCalculator';

interface Props {
  property: Property;
  onClose: () => void;
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
}

function Section({ title, icon: Icon, children }: { title: string; icon: ElementType; children: ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-[#e2e2f0] text-sm font-semibold mb-2">
        <Icon size={14} className="text-[#6366f1]" />{title}
      </h3>
      {children}
    </div>
  );
}

function Pill({ text }: { text: string }) {
  return <span className="bg-[#0f0f1a] text-[#8888a8] text-xs px-2 py-1 rounded-md">{text}</span>;
}

function Stat({ label, value }: { label: string; value: string | number | null }) {
  if (value == null) return null;
  return (
    <div className="bg-[#0f0f1a] rounded-lg p-2.5">
      <p className="text-[#8888a8] text-[10px] uppercase tracking-wide">{label}</p>
      <p className="text-[#e2e2f0] text-sm font-semibold">{value}</p>
    </div>
  );
}

const FIELD_DEFAULTS = {
  annualIncome: 85000,
  totalDebt: 15000,
  loanAmount: 300000,
  downPayment: 80000,
};
const DESCRIPTION_PREVIEW_CHARS = 260;

function computePayload(f: typeof FIELD_DEFAULTS, property: Property): MortgageRequestPayload {
  const propertyValue = property.price ?? (f.loanAmount + f.downPayment);
  const dti = f.annualIncome > 0 ? (f.totalDebt / f.annualIncome) * 100 : 36;
  let dtiStr = '36';

  if (dti < 30) dtiStr = '20%-<30%';
  else if (dti < 36) dtiStr = '30%-<36%';
  else if (dti < 40) dtiStr = '36';
  else if (dti < 43) dtiStr = '40';
  else if (dti < 50) dtiStr = '43';
  else dtiStr = '50%-60%';

  return {
    loan_amount: f.loanAmount,
    property_value: propertyValue,
    income: Math.round(f.annualIncome / 1000),
    debt_to_income_ratio: dtiStr,
    loan_type: 1,
    loan_purpose: 1,
    loan_term: 360,
    applicant_age: '35-44',
    applicant_sex: 1,
    occupancy_type: 1,
  };
}

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-[#8888a8]">{label}</label>
      <div className="flex items-center gap-1 px-3 py-2 bg-[#0f0f1a] border border-[#2d2d4a] rounded-lg">
        <span className="text-xs font-semibold text-[#8888a8]">$</span>
        <input
          type="number"
          value={value}
          min={0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 min-w-0 bg-transparent text-sm text-[#e2e2f0] focus:outline-none"
        />
      </div>
    </div>
  );
}

function CircularGauge({ value }: { value: number }) {
  const r = 50;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value / 100);
  const { main: color, glow } = getGaugeColor(value);
  const label = getGaugeLabel(value);

  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <svg viewBox="0 0 120 120" className="w-28 h-28">
        <defs>
          <filter id="gauge-glow-modal" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke={colors.whiteDim} strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          filter="url(#gauge-glow-modal)"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.5s' }}
        />
        <text x="60" y="56" textAnchor="middle" fill={colors.white} fontSize="24" fontWeight="800">{value}%</text>
        <text x="60" y="72" textAnchor="middle" fill={colors.whiteMuted} fontSize="8" letterSpacing="1.5">APPROVAL</text>
      </svg>
      <p className="text-xs font-semibold" style={{ color, textShadow: `0 0 12px ${glow}` }}>{label}</p>
    </div>
  );
}

function TcoSlider({ label, value, onChange, min, max, step, format }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; format: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-[#8888a8] w-12 flex-shrink-0">{label}</label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-[#6366f1] rounded-full cursor-pointer"
        style={{ accentColor: '#6366f1' }}
      />
      <span className="text-xs font-bold text-[#e2e2f0] w-14 text-right tabular-nums">{format(value)}</span>
    </div>
  );
}

function TcoLine({
  label,
  detail,
  value,
  accent,
  negative,
}: {
  label: string;
  detail?: string;
  value: number;
  accent?: boolean;
  negative?: boolean;
}) {
  const formatted = `${negative ? '-' : ''}$${Math.abs(value).toLocaleString()}`;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex flex-col text-[#8888a8]">
        <span>{label}</span>
        {detail && <span className="text-[9px] text-[#666680]">{detail}</span>}
      </span>
      <span className={`font-semibold tabular-nums ${accent ? 'text-[#6366f1]' : negative ? 'text-emerald-400' : 'text-[#e2e2f0]'}`}>
        {formatted}
      </span>
    </div>
  );
}

function TrueMonthlyCostPanel({
  property,
  inputs,
  onInputsChange,
}: {
  property: Property;
  inputs: TcoInputs;
  onInputsChange: (next: TcoInputs) => void;
}) {
  const tco = useMemo(() => calcTCO(property, inputs), [property, inputs]);
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
  const pmiHint = inputs.downPercent >= 20
    ? undefined
    : `Applied because down payment is below 20% (currently ${Math.round(inputs.downPercent)}%).`;
  const rentalIncomeHint = `${Math.round(inputs.rentPercent)}% of $${tco.effectiveRentEstimate.toLocaleString()} expected rent`;

  return (
    <div className="bg-[#141427] border border-[#2d2d4a] rounded-xl p-4">
      <h3 className="flex items-center gap-2 text-[#e2e2f0] text-sm font-semibold mb-1">
        <DollarSign size={14} className="text-[#6366f1]" />True Monthly Cost
      </h3>
      <p className="text-[#8888a8] text-[10px] mb-3">
        Data-driven estimate including crime risk, building age, and rental offset.
      </p>

      <div className="space-y-2 mb-4">
        <TcoSlider label="Rate" value={inputs.interestRate} min={2} max={12} step={0.125}
          onChange={(v) => onInputsChange({ ...inputs, interestRate: v })}
          format={(v) => `${v.toFixed(1)}%`} />
        <TcoSlider label="Down" value={inputs.downPercent} min={0} max={50} step={1}
          onChange={(v) => onInputsChange({ ...inputs, downPercent: v })}
          format={(v) => `${v}%`} />
        {tco.effectiveRentEstimate > 0 && (
          <TcoSlider label="Rent" value={inputs.rentPercent} min={0} max={100} step={5}
            onChange={(v) => onInputsChange({ ...inputs, rentPercent: v })}
            format={(v) => `${v}%`} />
        )}
      </div>

      <div className="space-y-1.5">
        <TcoLine label="P&I" detail="Principal + interest payment" value={tco.principalInterest} />
        <TcoLine label="Property Tax" detail="Estimated annual property tax / 12" value={tco.propertyTax} />
        <TcoLine label="Insurance" detail={insuranceHint} value={tco.insurance} />
        <TcoLine label="Maintenance" detail={maintenanceHint} value={tco.maintenance} />
        {tco.hoa > 0 && <TcoLine label="HOA" value={tco.hoa} />}
        {tco.pmi > 0 && <TcoLine label="PMI" detail={pmiHint} value={tco.pmi} />}

        <div className="border-t border-[#2d2d4a] my-1.5" />
        <TcoLine label="Total Monthly Cost" value={tco.grossMonthly} accent />

        {tco.rentalIncome > 0 && (
          <>
            <TcoLine label="Rental Income" detail={rentalIncomeHint} value={tco.rentalIncome} negative />
            <div className="border-t-2 border-[#6366f1]/40 my-1.5" />
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs font-bold text-[#e2e2f0]">
                <TrendingDown size={12} className="text-emerald-400" />Net Monthly
              </span>
              <span className={`text-sm font-black tabular-nums ${tco.netMonthly <= 0 ? 'text-emerald-400' : 'text-[#e2e2f0]'}`}>
                ${Math.abs(tco.netMonthly).toLocaleString()}/mo
              </span>
            </div>
          </>
        )}
        {tco.rentalIncome <= 0 && (
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs font-bold text-[#e2e2f0]">Total Monthly</span>
            <span className="text-sm font-black tabular-nums text-[#e2e2f0]">${tco.grossMonthly.toLocaleString()}/mo</span>
          </div>
        )}
        {tco.usedDefaultRentEstimate && (
          <p className="text-[10px] text-amber-400 mt-2">
            Rent estimate missing. Using default estimate (0.65% of home price/month).
          </p>
        )}
      </div>

      <p className="text-[9px] text-[#555] mt-3 leading-relaxed">
        Estimates only. Insurance reflects crime-risk surcharge; maintenance reflects building age. Not financial advice.
      </p>
    </div>
  );
}

function ImprovementTips({ scenarios, baseConfidence }: { scenarios: ScenarioResult[]; baseConfidence: number }) {
  const positiveTips = scenarios.filter((s) => s.delta > 0);
  if (positiveTips.length === 0) return null;

  return (
    <div className="mt-3">
      <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#8888a8] mb-2">
        <Lightbulb size={12} className="text-amber-400" />How to improve
      </h4>
      <div className="space-y-1.5">
        {positiveTips.slice(0, 2).map((tip) => (
          <div
            key={tip.scenario.id}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg border"
            style={{ background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }}
          >
            <ArrowUp size={13} className="text-emerald-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#e2e2f0]">{tip.scenario.label}</p>
              <p className="text-[10px] text-[#8888a8]">{tip.scenario.description}</p>
            </div>
            <span className="flex-shrink-0 text-xs font-black tabular-nums text-emerald-400">
              +{tip.delta}%
            </span>
          </div>
        ))}
      </div>
      {baseConfidence < 70 && (
        <p className="text-[9px] text-[#555] mt-2 leading-relaxed">
          Combine multiple improvements for a stronger application.
        </p>
      )}
    </div>
  );
}

function MortgagePredictorPanel({ property }: { property: Property }) {
  const [fields, setFields] = useState(FIELD_DEFAULTS);
  const { result, scenarios, loading, error, predict } = useMortgagePredictor();

  useEffect(() => {
    setFields((prev) => ({
      ...prev,
      loanAmount: Math.round(property.price * 0.8),
      downPayment: Math.round(property.price * 0.2),
    }));
  }, [property.id, property.price]);

  const set = (key: keyof typeof FIELD_DEFAULTS) => (v: number) => setFields((prev) => ({ ...prev, [key]: v }));

  return (
    <div className="bg-[#141427] border border-[#2d2d4a] rounded-xl p-4">
      <h3 className="text-[#e2e2f0] text-sm font-semibold mb-1">AI Mortgage Predictor</h3>
      <p className="text-[#8888a8] text-xs mb-3">
        Home price auto-fills loan/down payment for this listing.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          predict(computePayload(fields, property));
        }}
        className="space-y-2"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2 pt-5">
          <MoneyInput label="Annual Income" value={fields.annualIncome} onChange={set('annualIncome')} />
          <MoneyInput label="Total Debt" value={fields.totalDebt} onChange={set('totalDebt')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
          <MoneyInput label="Loan Amount" value={fields.loanAmount} onChange={set('loanAmount')} />
          <MoneyInput label="Down Payment" value={fields.downPayment} onChange={set('downPayment')} />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all disabled:opacity-50 mt-1"
          style={loading ? { background: colors.whiteTint, color: colors.whiteMuted, border: `1px solid ${colors.border}` } : ctaButtonStyle}
        >
          {loading ? 'Calculating...' : 'Calculate Approval'}
        </button>
      </form>

      {error && (
        <div className="mt-3 flex items-start gap-2 p-2 rounded-lg border border-red-500/30 bg-red-500/10">
          <AlertCircle size={12} className="text-red-300 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-red-200">{error}</p>
        </div>
      )}

      {result && !error && (
        <>
          <CircularGauge value={result.confidence} />
          <ImprovementTips scenarios={scenarios} baseConfidence={result.confidence} />
        </>
      )}
    </div>
  );
}

function NearbyGroceryPanel({
  property,
  onShowRoute,
}: {
  property: Property;
  onShowRoute?: (from: [number, number], to: [number, number], toName: string, toAddress: string) => void;
}) {
  const [radius, setRadius] = useState<0.5 | 1.0>(0.5);
  const { stores, loading } = useNearbyGrocery(property, radius);

  return (
    <div className="rounded-xl border border-[#2d2d4a] bg-[#0f0f1a] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[#e2e2f0] text-sm font-semibold">
          <ShoppingCart size={14} className="text-[#6366f1]" />
          Nearby Grocery
        </h3>
        <div className="flex rounded-lg overflow-hidden border border-[#2d2d4a] text-[10px] font-semibold">
          {([0.5, 1.0] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRadius(r)}
              className="px-2.5 py-1 transition-colors"
              style={{
                background: radius === r ? '#6366f1' : 'transparent',
                color: radius === r ? '#fff' : colors.whiteMuted,
              }}
            >
              {r} mi
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="text-[#8888a8] text-xs text-center py-3">Searching nearby stores…</p>
      )}
      {!loading && stores.length === 0 && (
        <p className="text-[#8888a8] text-xs text-center py-3">No grocery stores within {radius} mi</p>
      )}
      {!loading && stores.length > 0 && (
        <div className="space-y-1.5">
          {stores.map((s) => (
            <button
              key={s.id}
              onClick={() => onShowRoute?.(property.coordinates, s.coordinates, s.name, s.address)}
              className="w-full flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-[#1a1a2e] group"
              style={{ border: `1px solid transparent` }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#6366f125', border: '1px solid #6366f150' }}>
                <ShoppingCart size={13} className="text-[#6366f1]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#e2e2f0] text-xs font-medium truncate">{s.name}</p>
                <p className="text-[#8888a8] text-[10px] truncate">{s.address}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: s.distanceMiles <= 0.3 ? '#16a34a25' : s.distanceMiles <= 0.7 ? '#ca8a0425' : '#64748b25',
                    color: s.distanceMiles <= 0.3 ? '#4ade80' : s.distanceMiles <= 0.7 ? '#fbbf24' : '#94a3b8',
                  }}>
                  {s.distanceMiles} mi
                </span>
                <Navigation size={11} className="text-[#6366f1] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      )}
      {onShowRoute && stores.length > 0 && (
        <p className="text-[#8888a8] text-[10px] text-center">Tap a store to show walking route on map</p>
      )}
    </div>
  );
}

export function PropertyDetail({ property, onClose, tcoInputs, onTcoInputsChange, onShowRoute }: Props) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Close modal first, then bubble route request with source property context
  const handleGroceryRoute = useCallback(
    (from: [number, number], to: [number, number], toName: string, toAddress: string) => {
      onClose();
      onShowRoute?.(from, to, toName, toAddress, property.id, property.streetAddress);
    },
    [onClose, onShowRoute, property.id, property.streetAddress],
  );
  const photos = property.photos.length > 0 ? property.photos : [property.imageUrl];
  const descriptionText = property.description?.trim() ?? '';
  const shouldTruncateDescription = descriptionText.length > DESCRIPTION_PREVIEW_CHARS;
  const visibleDescription = shouldTruncateDescription && !isDescriptionExpanded
    ? `${descriptionText.slice(0, DESCRIPTION_PREVIEW_CHARS).trimEnd()}...`
    : descriptionText;

  useEffect(() => {
    setIsDescriptionExpanded(false);
  }, [property.id]);

  const prevPhoto = () => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length);
  const nextPhoto = () => setPhotoIdx((i) => (i + 1) % photos.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-[#1a1a2e] border border-[#2d2d4a] rounded-2xl w-[min(1180px,95vw)] max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        {/* Photo Gallery */}
        <div className="relative h-80 bg-[#0f0f1a] flex-shrink-0">
          <img src={photos[photoIdx]} alt={property.streetAddress}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/768x400/25253e/6366f1?text=No+Image'; }} />
          {photos.length > 1 && (
            <>
              <button onClick={prevPhoto}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full">
                <ChevronLeft size={18} />
              </button>
              <button onClick={nextPhoto}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full">
                <ChevronRight size={18} />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                {photoIdx + 1} / {photos.length}
              </div>
            </>
          )}
          <button onClick={onClose}
            className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full">
            <X size={16} />
          </button>
          <div className="absolute top-3 left-3">
            <span className="bg-[#6366f1] text-white text-xs px-3 py-1.5 rounded-lg font-bold">{property.statusText}</span>
          </div>
        </div>

        {/* Photo thumbnails */}
        {photos.length > 1 && (
          <div className="flex gap-1 px-4 py-2 bg-[#0f0f1a] overflow-x-auto flex-shrink-0">
            {photos.slice(0, 10).map((photo, i) => (
              <button key={i} onClick={() => setPhotoIdx(i)}
                className={`flex-shrink-0 w-14 h-10 rounded-md overflow-hidden border-2 transition-colors ${
                  i === photoIdx ? 'border-[#6366f1]' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                <img src={photo} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-5">
              {/* Header */}
              <div>
                <div className="flex items-start justify-between mb-1">
                  <h2 className="text-[#e2e2f0] text-xl font-bold">{formatPrice(property.price)}</h2>
                  <div className="flex gap-2 text-xs text-[#8888a8]">
                    {property.daysOnZillow > 0 && <span className="flex items-center gap-1"><Clock size={10} />{property.daysOnZillow}d on market</span>}
                    {property.pageViews > 0 && <span className="flex items-center gap-1"><Eye size={10} />{property.pageViews.toLocaleString()}</span>}
                    {property.favorites > 0 && <span className="flex items-center gap-1"><Heart size={10} />{property.favorites}</span>}
                  </div>
                </div>
                <p className="text-[#e2e2f0] text-sm">{property.address}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-[#8888a8]">
                  <span className="flex items-center gap-1"><Bed size={14} />{property.beds} beds</span>
                  <span className="flex items-center gap-1"><Bath size={14} />{property.baths} baths</span>
                  <span className="flex items-center gap-1"><Square size={14} />{formatSqft(property.sqft)} sqft</span>
                  <span className="flex items-center gap-1" title="Reported incidents within 2 miles">
                    <ShieldAlert size={14} className="text-[#f87171]" />
                    {crimeRiskLabel(property.crimeRiskLevel)} ({property.crimeIncidentCount ?? 0} within {property.crimeRiskRadiusMiles ?? 0.5} mi)
                  </span>
                </div>
                {property.detailUrl && (
                  <a
                    href={property.detailUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-[#818cf8] hover:text-[#a5b4fc]"
                  >
                    View source listing <ExternalLink size={12} />
                  </a>
                )}
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                <Stat label="Year Built" value={property.yearBuilt || null} />
                <Stat label="Lot Size" value={property.lotSize ? `${property.lotSize.toLocaleString()} sqft` : null} />
                <Stat label="$/Sqft" value={property.pricePerSqft ? `$${property.pricePerSqft}` : null} />
                <Stat label="Type" value={property.homeType} />
                {property.zestimate && <Stat label="Zestimate" value={formatPrice(property.zestimate)} />}
                {property.rentZestimate && <Stat label="Rent Estimate" value={`${formatPrice(property.rentZestimate)}/mo`} />}
                {property.hoaFee && <Stat label="HOA Fee" value={`${formatPrice(property.hoaFee)}/mo`} />}
              </div>

              {/* Description */}
              {descriptionText && (
                <Section title="Description" icon={Building}>
                  <p className="text-[#8888a8] text-xs leading-relaxed">{visibleDescription}</p>
                  {shouldTruncateDescription && (
                    <button
                      type="button"
                      onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                      className="mt-2 text-[11px] font-semibold text-[#818cf8] hover:text-[#a5b4fc] transition-colors"
                    >
                      {isDescriptionExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </Section>
              )}

              {/* Features */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {property.heating.length > 0 && (
                  <Section title="Heating" icon={Flame}>
                    <div className="flex flex-wrap gap-1">{property.heating.map((h) => <Pill key={h} text={h} />)}</div>
                  </Section>
                )}
                {property.cooling.length > 0 && (
                  <Section title="Cooling" icon={Snowflake}>
                    <div className="flex flex-wrap gap-1">{property.cooling.map((c) => <Pill key={c} text={c} />)}</div>
                  </Section>
                )}
                {property.parking.length > 0 && (
                  <Section title="Parking" icon={Car}>
                    <div className="flex flex-wrap gap-1">{property.parking.map((p) => <Pill key={p} text={p} />)}</div>
                  </Section>
                )}
                {property.appliances.length > 0 && (
                  <Section title="Appliances" icon={Wrench}>
                    <div className="flex flex-wrap gap-1">{property.appliances.map((a) => <Pill key={a} text={a} />)}</div>
                  </Section>
                )}
                {property.constructionMaterials.length > 0 && (
                  <Section title="Construction" icon={Building}>
                    <div className="flex flex-wrap gap-1">{property.constructionMaterials.map((c) => <Pill key={c} text={c} />)}</div>
                  </Section>
                )}
                {property.basement && (
                  <Section title="Basement" icon={Building}>
                    <Pill text={property.basement} />
                  </Section>
                )}
              </div>

              {/* Nearby Grocery */}
              <NearbyGroceryPanel property={property} onShowRoute={handleGroceryRoute} />

              {/* Schools */}
              {property.schools.length > 0 && (
                <Section title="Nearby Schools" icon={GraduationCap}>
                  <div className="space-y-2">
                    {property.schools.map((s, i) => (
                      <div key={`${s.name}-${i}`} className="flex items-center gap-3 bg-[#0f0f1a] rounded-lg p-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          s.rating >= 7 ? 'bg-green-900/50 text-green-400' :
                          s.rating >= 4 ? 'bg-yellow-900/50 text-yellow-400' :
                          'bg-red-900/50 text-red-400'}`}>
                          {s.rating || 'N/A'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#e2e2f0] text-xs font-medium truncate">{s.name}</p>
                          <p className="text-[#8888a8] text-[10px]">
                            {s.level || 'N/A'} &middot; {s.distance} mi &middot; {s.type || 'School'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Price History */}
              {property.priceHistory.length > 0 && (
                <Section title="Price History" icon={TrendingUp}>
                  <div className="space-y-1">
                    {property.priceHistory.slice(0, 5).map((p, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs text-[#8888a8]">
                        <span className="w-20 flex-shrink-0">{p.date}</span>
                        <span className="w-24 flex-shrink-0">{p.event}</span>
                        <span className="text-[#e2e2f0] font-medium">{p.price > 0 ? formatPrice(p.price) : '—'}</span>
                        <span className="ml-auto text-[10px]">{p.source}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Agent Info */}
              {(property.brokerName || property.agentName) && (
                <Section title="Listing Agent" icon={User}>
                  <div className="bg-[#0f0f1a] rounded-lg p-3">
                    {property.agentName && <p className="text-[#e2e2f0] text-sm font-medium">{property.agentName}</p>}
                    {property.brokerName && <p className="text-[#8888a8] text-xs">{property.brokerName}</p>}
                    {property.agentPhone && (
                      <p className="text-[#6366f1] text-xs mt-1 flex items-center gap-1">
                        <Phone size={10} />{property.agentPhone}
                      </p>
                    )}
                  </div>
                </Section>
              )}
            </div>

            <div className="xl:col-span-1 xl:sticky xl:top-0 h-fit space-y-4">
              <TrueMonthlyCostPanel
                property={property}
                inputs={tcoInputs}
                onInputsChange={onTcoInputsChange}
              />
              <MortgagePredictorPanel property={property} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
