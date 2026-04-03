import { useEffect, useState, useMemo, useCallback, useRef, type ElementType, type ReactNode } from 'react';
import {
  X, ChevronLeft, ChevronRight, Bed, Bath, Square, Flame, Snowflake, Car, Wrench, Building,
  GraduationCap, User, Phone, Clock, Eye, Heart, TrendingUp, ExternalLink, ShieldAlert, Volume2,
  DollarSign, TrendingDown, ShoppingCart, Navigation,
  ChevronDown, CheckCircle, XCircle, AlertTriangle, Zap, Info,
} from 'lucide-react';
import { useNearbyGrocery } from '../../hooks/useNearbyGrocery';
import { useMortgagePredictor } from '../../hooks/useMortgagePredictor';
import type { MortgageRequestPayload, UserFinancialProfile, CreditScoreRange, LoanType } from '../../types/mortgage';
import type { Property } from '../../types/property';
import type {
  FocusedMortgagePredictorContext,
  MortgagePredictorFormState,
} from '../../services/chat';
import { computeMortgageReadiness, generateMortgageTips } from '../../utils/mortgageCalculations';
import { formatPrice, formatSqft } from '../../utils/formatters';
import { crimeRiskLabel } from '../../utils/crimeRisk';
import { noiseExposureColor, noiseExposureLabel } from '../../utils/noiseExposure';
import { colors, ctaButtonStyle } from '../../design';
import { calcTCO, homeAgeYears, type TcoInputs } from '../../utils/tcoCalculator';

interface Props {
  property: Property;
  onClose: () => void;
  tcoInputs: TcoInputs;
  onTcoInputsChange: (next: TcoInputs) => void;
  initialMortgageContext?: FocusedMortgagePredictorContext | null;
  onMortgageContextChange?: (propertyId: string, next: FocusedMortgagePredictorContext) => void;
  userFinancialProfile?: UserFinancialProfile | null;
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

const PROFILE_DEFAULTS: MortgagePredictorFormState = {
  annualIncome: 85000,
  monthlyDebt: 500,
  downPaymentPercent: 20,
  creditScoreRange: '720-759',
  loanType: 'conventional',
};
const DESCRIPTION_PREVIEW_CHARS = 260;


function buildAiPayload(
  f: MortgagePredictorFormState,
  readiness: ReturnType<typeof computeMortgageReadiness>,
  property: Property,
): MortgageRequestPayload {
  return {
    property_price:      property.price > 0 ? property.price : readiness.loanAmount + readiness.downAmount,
    loan_amount:         readiness.loanAmount,
    ltv:                 readiness.ltv,
    annual_income:       f.annualIncome,
    monthly_debt:        f.monthlyDebt,
    front_end_dti:       readiness.frontEndDTI,
    back_end_dti:        readiness.backEndDTI,
    credit_score_range:  f.creditScoreRange,
    loan_type:           f.loanType,
    down_payment_percent: f.downPaymentPercent,
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
      <span className="flex flex-col text-[#e5e7eb]">
        <span>{label}</span>
        {detail && <span className="text-[9px] text-[#f1f5f9]">{detail}</span>}
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
  const homeAge = homeAgeYears(property.yearBuilt);
  const maintenanceHint = tco.usedMaintenanceOverride
    ? `Manual $${tco.maintenance.toLocaleString()}/mo`
    : homeAge == null
    ? `Home age unknown -> auto $${tco.maintenanceAuto.toLocaleString()}/mo`
    : `${homeAge}y old home -> auto $${tco.maintenanceAuto.toLocaleString()}/mo`;
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
        <div className="flex items-center justify-between text-xs">
          <span className="flex flex-col text-[#e5e7eb]">
            <span className="flex items-center gap-2">
              <span>Maintenance</span>
              <button
                type="button"
                onClick={() => onInputsChange({
                  ...inputs,
                  maintenanceMonthlyOverride: inputs.maintenanceMonthlyOverride == null ? tco.maintenanceAuto : null,
                })}
                className="px-2 py-0.5 rounded border text-[9px] font-semibold"
                style={{
                  color: '#e2e2f0',
                  borderColor: '#2d2d4a',
                  background: inputs.maintenanceMonthlyOverride == null ? '#0f0f1a' : '#6366f11a',
                }}
              >
                {inputs.maintenanceMonthlyOverride == null ? 'Auto' : 'Manual'}
              </button>
            </span>
            <span className="text-[9px] text-[#f1f5f9]">{maintenanceHint}</span>
          </span>
          {inputs.maintenanceMonthlyOverride != null ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-[#8888a8]">$</span>
              <input
                type="number"
                min={0}
                step={25}
                value={Math.round(inputs.maintenanceMonthlyOverride)}
                onChange={(e) => onInputsChange({ ...inputs, maintenanceMonthlyOverride: Number(e.target.value) || 0 })}
                className="w-24 bg-[#0f0f1a] border border-[#2d2d4a] rounded px-2 py-0.5 text-xs text-right text-[#e2e2f0] focus:outline-none"
              />
            </div>
          ) : (
            <span className="font-semibold tabular-nums text-[#e2e2f0]">
              ${tco.maintenance.toLocaleString()}
            </span>
          )}
        </div>
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

// ─── Reusable sub-components ────────────────────────────────

function RLabel({ children }: { children: ReactNode }) {
  return <p className="text-[9px] font-bold uppercase tracking-widest text-[#6366f1] mb-1.5">{children}</p>;
}

function DtiBar({ label, value, limit, color }: { label: string; value: number; limit: number; color: string }) {
  const pct = Math.min(100, (value / limit) * 100);
  const ok = value <= limit;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#8888a8]">{label}</span>
        <span className="tabular-nums font-semibold" style={{ color: ok ? '#6ee7b7' : '#f87171' }}>
          {value.toFixed(0)}% <span className="text-[#555]">/ {limit}%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1a1a2e] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: ok ? color : '#ef4444' }} />
      </div>
    </div>
  );
}

function FeeRow({ label, low, high }: { label: string; low: number; high: number }) {
  const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;
  return (
    <div className="flex justify-between text-[10px]">
      <span className="text-[#8888a8]">{label}</span>
      <span className="text-[#e2e2f0] tabular-nums">{fmt(low)} – {fmt(high)}</span>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      {ok
        ? <CheckCircle size={11} className="text-emerald-400 flex-shrink-0" />
        : <XCircle size={11} className="text-red-400 flex-shrink-0" />}
      <span style={{ color: ok ? '#6ee7b7' : '#f87171' }}>{label}</span>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────

function MortgagePredictorPanel({
  property,
  userProfile,
  initialContext,
  onContextChange,
}: {
  property: Property;
  userProfile?: UserFinancialProfile | null;
  initialContext?: FocusedMortgagePredictorContext | null;
  onContextChange?: (propertyId: string, next: FocusedMortgagePredictorContext) => void;
}) {
  // ── Form state ──
  const [fields, setFields] = useState<MortgagePredictorFormState>(() => {
    if (userProfile) return { ...PROFILE_DEFAULTS, ...userProfile };
    if (initialContext?.inputs) return initialContext.inputs;
    return { ...PROFILE_DEFAULTS };
  });
  const [fieldsOpen, setFieldsOpen] = useState(!userProfile);
  const [feesOpen, setFeesOpen] = useState(false);
  const [lastPayload, setLastPayload] = useState<MortgageRequestPayload | undefined>(initialContext?.lastPayload);
  const { result: mlResult, loading: mlLoading, error: mlError, predict } = useMortgagePredictor();
  const seededRef = useRef<string | null>(null);

  // Sync from userProfile when it's first set or updated
  useEffect(() => {
    if (!userProfile) return;
    setFields((prev) => ({
      ...prev,
      annualIncome:       userProfile.annualIncome,
      monthlyDebt:        userProfile.monthlyDebt,
      creditScoreRange:   userProfile.creditScoreRange,
      loanType:           userProfile.loanType,
      downPaymentPercent: userProfile.downPaymentPercent,
    }));
    setFieldsOpen(false);
  }, [userProfile]);

  // Reset on property change (keep profile inputs, just not ML result)
  useEffect(() => {
    if (seededRef.current === property.id) return;
    seededRef.current = property.id;
    if (!userProfile && !initialContext?.inputs) {
      setFields({ ...PROFILE_DEFAULTS });
    }
    setLastPayload(undefined);
  }, [property.id, userProfile, initialContext]);

  // Emit context changes upward for chat AI
  useEffect(() => {
    if (!onContextChange) return;
    onContextChange(property.id, {
      inputs: fields,
      lastPayload,
      lastResult: mlResult ?? undefined,
      error: mlError,
    });
  }, [property.id, fields, lastPayload, mlResult, mlError, onContextChange]);

  // ── Derived readiness result (instant, no button) ──
  const readiness = useMemo(() => computeMortgageReadiness(property, fields), [property, fields]);
  const tips      = useMemo(() => generateMortgageTips(readiness, fields), [readiness, fields]);

  const fmt = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const fmtK = (v: number) => v >= 1000 ? `$${Math.round(v / 1000)}k` : fmt(v);

  const totalBar = readiness.monthly.total;
  const barMax   = totalBar * 1.1 || 1;

  const creditLabel: Record<CreditScoreRange, string> = {
    '760+': 'Excellent (760+)', '720-759': 'Good (720–759)', '680-719': 'Fair (680–719)',
    '640-679': 'Below avg (640–679)', '<640': 'Poor (<640)',
  };

  const ltvOk    = readiness.ltv <= (fields.loanType === 'fha' ? 96.5 : 97);
  const dtiOk    = readiness.backEndDTI <= 43;
  const creditOk = fields.loanType === 'fha'
    ? fields.creditScoreRange !== '<640'
    : !['<640', '640-679'].includes(fields.creditScoreRange);
  const noPmiOk  = readiness.ltv <= 80;

  return (
    <div className="bg-[#141427] border border-[#2d2d4a] rounded-xl p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[#e2e2f0] text-sm font-semibold">Mortgage Readiness</h3>
          <p className="text-[#8888a8] text-[10px] mt-0.5">
            {userProfile ? 'Calculated from your saved profile' : 'Enter your financial details below'}
          </p>
        </div>
        {userProfile && (
          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.25)' }}>
            Profile ✓
          </span>
        )}
      </div>

      {/* ── Soft prompt when no profile ── */}
      {!userProfile && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border"
          style={{ background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.25)' }}>
          <Zap size={12} className="text-[#818cf8] mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-[#8888a8] leading-relaxed">
            Tell the assistant your income &amp; credit score — it will auto-fill these fields for every property you browse.
          </p>
        </div>
      )}

      {/* ── Input fields (collapsible) ── */}
      <div>
        <button type="button" onClick={() => setFieldsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] font-semibold text-[#8888a8] hover:text-[#e2e2f0] transition-colors mb-2">
          <ChevronDown size={12} className={`transition-transform ${fieldsOpen ? 'rotate-0' : '-rotate-90'}`} />
          {fieldsOpen ? 'Hide inputs' : 'Edit inputs'}
        </button>

        {fieldsOpen && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <MoneyInput label="Annual Income" value={fields.annualIncome}
                onChange={(v) => setFields((p) => ({ ...p, annualIncome: v }))} />
              <MoneyInput label="Monthly Debt" value={fields.monthlyDebt}
                onChange={(v) => setFields((p) => ({ ...p, monthlyDebt: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-[#8888a8]">Down %</label>
                <div className="flex items-center gap-1 px-3 py-2 bg-[#0f0f1a] border border-[#2d2d4a] rounded-lg">
                  <input type="number" min={0} max={100} step={1} value={fields.downPaymentPercent}
                    onChange={(e) => setFields((p) => ({ ...p, downPaymentPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                    className="flex-1 min-w-0 bg-transparent text-sm text-[#e2e2f0] focus:outline-none" />
                  <span className="text-[#8888a8] text-xs">%</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-[#8888a8]">Credit</label>
                <select value={fields.creditScoreRange}
                  onChange={(e) => setFields((p) => ({ ...p, creditScoreRange: e.target.value as CreditScoreRange }))}
                  className="px-2 py-2 bg-[#0f0f1a] border border-[#2d2d4a] rounded-lg text-xs text-[#e2e2f0] focus:outline-none">
                  {(['760+', '720-759', '680-719', '640-679', '<640'] as CreditScoreRange[]).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex rounded-lg overflow-hidden border border-[#2d2d4a] text-[10px] font-semibold">
              {(['conventional', 'fha'] as LoanType[]).map((t) => (
                <button key={t} type="button" onClick={() => setFields((p) => ({ ...p, loanType: t }))}
                  className="flex-1 py-1.5 transition-colors capitalize"
                  style={{ background: fields.loanType === t ? '#6366f1' : 'transparent', color: fields.loanType === t ? '#fff' : colors.whiteMuted }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────── */}
      {/* Section 1 — Monthly Cost                              */}
      {/* ─────────────────────────────────────────────────────── */}
      <div className="bg-[#0f0f1a] rounded-xl p-3 space-y-2">
        <div className="flex items-start justify-between">
          <RLabel>Monthly Cost</RLabel>
          <span className="text-[10px] text-[#8888a8]">{readiness.estimatedRate.toFixed(2)}% rate · {fields.loanType.toUpperCase()}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black text-[#e2e2f0] tabular-nums">{fmt(readiness.monthly.total)}</span>
          <span className="text-xs text-[#8888a8]">/mo</span>
        </div>
        <div className="space-y-1 mt-1">
          {([
            ['P&I',       readiness.monthly.principalInterest],
            ['Tax',       readiness.monthly.propertyTax],
            ['Insurance', readiness.monthly.insurance],
            ...(readiness.monthly.pmiOrMip > 0 ? [[fields.loanType === 'fha' ? 'MIP' : 'PMI', readiness.monthly.pmiOrMip]] : []),
            ...(readiness.monthly.hoa > 0       ? [['HOA',       readiness.monthly.hoa]]       : []),
          ] as [string, number][]).map(([label, val]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[10px] text-[#8888a8] w-16 flex-shrink-0">{label}</span>
              <div className="flex-1 h-1 bg-[#1a1a2e] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[#6366f1]" style={{ width: `${(val / barMax) * 100}%` }} />
              </div>
              <span className="text-[10px] tabular-nums text-[#e2e2f0] w-14 text-right">{fmt(val)}</span>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-[#555] pt-1">
          Rate based on {creditLabel[fields.creditScoreRange]}. Utah tax rate 0.58%. Estimates only.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────── */}
      {/* Section 2 — Cash to Close                             */}
      {/* ─────────────────────────────────────────────────────── */}
      <div className="bg-[#0f0f1a] rounded-xl p-3 space-y-2">
        <RLabel>Cash to Close</RLabel>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-black text-[#e2e2f0] tabular-nums">{fmtK(readiness.cashToClose.totalLow)}</span>
          <span className="text-sm text-[#8888a8]">–</span>
          <span className="text-xl font-black text-[#e2e2f0] tabular-nums">{fmtK(readiness.cashToClose.totalHigh)}</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-[#8888a8]">Down payment</span>
            <span className="text-[#e2e2f0] tabular-nums font-semibold">{fmt(readiness.cashToClose.downPayment)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-[#8888a8]">Closing costs</span>
            <span className="text-[#e2e2f0] tabular-nums">{fmtK(readiness.cashToClose.closingCostsLow)} – {fmtK(readiness.cashToClose.closingCostsHigh)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-[#8888a8]">Prepaids (tax, ins, interest)</span>
            <span className="text-[#e2e2f0] tabular-nums">{fmtK(readiness.cashToClose.prepaidsLow)} – {fmtK(readiness.cashToClose.prepaidsHigh)}</span>
          </div>
          {readiness.cashToClose.fhaUpfrontMip > 0 && (
            <div className="flex justify-between text-[10px]">
              <span className="text-[#8888a8]">FHA upfront MIP</span>
              <span className="text-[#e2e2f0] tabular-nums">{fmt(readiness.cashToClose.fhaUpfrontMip)}</span>
            </div>
          )}
        </div>

        {/* Fee breakdown accordion */}
        <button type="button" onClick={() => setFeesOpen((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-[#6366f1] hover:text-[#818cf8] transition-colors mt-1">
          <ChevronDown size={11} className={`transition-transform ${feesOpen ? '' : '-rotate-90'}`} />
          Fee breakdown
        </button>
        {feesOpen && (
          <div className="space-y-1 pt-1 border-t border-[#2d2d4a]">
            <RLabel>Closing Fee Detail</RLabel>
            <FeeRow label="Origination" low={readiness.fees.originationLow} high={readiness.fees.originationHigh} />
            <FeeRow label="Appraisal" low={readiness.fees.appraisalLow} high={readiness.fees.appraisalHigh} />
            <FeeRow label="Title ins + search" low={readiness.fees.titleLow} high={readiness.fees.titleHigh} />
            <FeeRow label="Settlement / attorney" low={readiness.fees.settlementLow} high={readiness.fees.settlementHigh} />
            <FeeRow label="Recording" low={readiness.fees.recordingLow} high={readiness.fees.recordingHigh} />
            <FeeRow label="Home inspection" low={readiness.fees.inspectionLow} high={readiness.fees.inspectionHigh} />
            <div className="flex justify-between text-[10px] font-semibold border-t border-[#2d2d4a] pt-1 mt-1">
              <span className="text-[#e2e2f0]">Subtotal</span>
              <span className="text-[#6366f1] tabular-nums">{fmtK(readiness.fees.subtotalLow)} – {fmtK(readiness.fees.subtotalHigh)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────── */}
      {/* Section 3 — Uncertainty Range                         */}
      {/* ─────────────────────────────────────────────────────── */}
      <div className="bg-[#0f0f1a] rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <RLabel>Rate Uncertainty</RLabel>
          <Info size={10} className="text-[#555] mb-1.5" />
        </div>
        <div className="relative h-5">
          {/* Track */}
          <div className="absolute inset-y-1.5 left-0 right-0 bg-[#1a1a2e] rounded-full" />
          {/* Filled range */}
          <div className="absolute inset-y-1.5 bg-[#6366f1]/40 rounded-full"
            style={{
              left: `${((readiness.range.monthlyLow - readiness.range.monthlyLow * 0.95) / (readiness.range.monthlyHigh * 1.05 - readiness.range.monthlyLow * 0.95)) * 100}%`,
              right: `${100 - ((readiness.range.monthlyHigh - readiness.range.monthlyLow * 0.95) / (readiness.range.monthlyHigh * 1.05 - readiness.range.monthlyLow * 0.95)) * 100}%`,
            }} />
          {/* Mid dot */}
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#6366f1] border-2 border-[#0f0f1a]"
            style={{ left: '50%', transform: 'translate(-50%, -50%)' }} />
        </div>
        <div className="flex justify-between text-[10px] tabular-nums">
          <div className="text-center">
            <p className="text-[#8888a8]">Low ({readiness.range.rateLow.toFixed(1)}%)</p>
            <p className="text-[#e2e2f0] font-semibold">{fmt(readiness.range.monthlyLow)}/mo</p>
          </div>
          <div className="text-center">
            <p className="text-[#6366f1] font-bold text-[11px]">Most likely</p>
            <p className="text-[#e2e2f0] font-black">{fmt(readiness.range.monthlyMid)}/mo</p>
          </div>
          <div className="text-center">
            <p className="text-[#8888a8]">High ({readiness.range.rateHigh.toFixed(1)}%)</p>
            <p className="text-[#e2e2f0] font-semibold">{fmt(readiness.range.monthlyHigh)}/mo</p>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────── */}
      {/* Section 4 — Qualification + DTI                       */}
      {/* ─────────────────────────────────────────────────────── */}
      <div className="bg-[#0f0f1a] rounded-xl p-3 space-y-3">
        <RLabel>Qualification Check</RLabel>

        {/* DTI bars */}
        <div className="space-y-2">
          <DtiBar label="Front-end DTI (housing / income)" value={readiness.frontEndDTI} limit={28} color="#6366f1" />
          <DtiBar label="Back-end DTI (all debt / income)"  value={readiness.backEndDTI}  limit={43} color="#6366f1" />
        </div>

        {/* Checklist */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 border-t border-[#2d2d4a]">
          <Check ok={ltvOk}    label={`LTV ${readiness.ltv.toFixed(0)}% ≤ ${fields.loanType === 'fha' ? '96.5' : '97'}%`} />
          <Check ok={dtiOk}    label={`DTI ${readiness.backEndDTI.toFixed(0)}% ≤ 43%`} />
          <Check ok={creditOk} label={`Credit ${fields.creditScoreRange}`} />
          <Check ok={noPmiOk}  label={noPmiOk ? 'No PMI (≥20% down)' : `PMI req'd (${readiness.ltv.toFixed(0)}% LTV)`} />
        </div>

        {/* Dynamic tips */}
        {tips.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-[#2d2d4a]">
            {tips.map((tip) => (
              <div key={tip.id} className="flex items-start gap-2 px-2.5 py-2 rounded-lg"
                style={{
                  background: tip.type === 'warning' ? 'rgba(239,68,68,0.06)' : tip.type === 'action' ? 'rgba(16,185,129,0.06)' : 'rgba(99,102,241,0.06)',
                  border: `1px solid ${tip.type === 'warning' ? 'rgba(239,68,68,0.2)' : tip.type === 'action' ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)'}`,
                }}>
                {tip.type === 'warning'
                  ? <AlertTriangle size={11} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  : tip.type === 'action'
                  ? <CheckCircle size={11} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  : <Info size={11} className="text-[#818cf8] mt-0.5 flex-shrink-0" />}
                <p className="text-[10px] text-[#e2e2f0] leading-relaxed">{tip.message}</p>
              </div>
            ))}
          </div>
        )}

        {/* AI approval check (optional, async) */}
        <div className="pt-1 border-t border-[#2d2d4a]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-[#8888a8]">AI Underwriting Signal</p>
            <button type="button"
              onClick={() => { const p = buildAiPayload(fields, readiness, property); setLastPayload(p); predict(p); }}
              disabled={mlLoading}
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-50"
              style={mlLoading ? { background: colors.whiteTint, color: colors.whiteMuted, border: `1px solid ${colors.border}` } : ctaButtonStyle}>
              {mlLoading ? 'Analyzing…' : mlResult ? 'Re-run' : 'Run AI check →'}
            </button>
          </div>
          {mlError && (
            <p className="text-[10px] text-red-300 bg-red-500/10 rounded-lg px-2 py-1.5">{mlError}</p>
          )}
          {mlResult && !mlError && (
            <div className="space-y-2">
              {/* Confidence bar */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${mlResult.confidence}%`, background: mlResult.confidence >= 70 ? '#6ee7b7' : mlResult.confidence >= 55 ? '#fbbf24' : '#f87171' }} />
                </div>
                <span className="text-sm font-black tabular-nums"
                  style={{ color: mlResult.confidence >= 70 ? '#6ee7b7' : mlResult.confidence >= 55 ? '#fbbf24' : '#f87171' }}>
                  {mlResult.confidence}%
                </span>
              </div>
              {/* One-line summary */}
              {mlResult.message && (
                <p className="text-[10px] text-[#c4c4d8] leading-relaxed">{mlResult.message}</p>
              )}
              {/* Strengths */}
              {mlResult.strengths.length > 0 && (
                <div className="space-y-1">
                  {mlResult.strengths.map((s, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <CheckCircle size={10} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span className="text-[10px] text-emerald-300">{s}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Risks */}
              {mlResult.risks.length > 0 && (
                <div className="space-y-1">
                  {mlResult.risks.map((r, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertTriangle size={10} className="text-amber-400 mt-0.5 flex-shrink-0" />
                      <span className="text-[10px] text-amber-200">{r}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="text-[9px] text-[#444] leading-relaxed">
        Estimates only. Not a lender quote or financial advice. Rates, taxes, and fees vary.
      </p>
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

export function PropertyDetail({
  property,
  onClose,
  tcoInputs,
  onTcoInputsChange,
  initialMortgageContext,
  onMortgageContextChange,
  userFinancialProfile,
  onShowRoute,
}: Props) {
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
                  <span
                    className="flex items-center gap-1 font-medium"
                    style={{ color: noiseExposureColor(property.noiseExposureLevel) }}
                    title="Estimated from nearby road noise segments (distance-weighted; batch-relative tier)"
                  >
                    <Volume2 size={14} style={{ color: 'inherit' }} />
                    {noiseExposureLabel(property.noiseExposureLevel)} (~{property.noiseExposureDbAvg?.toFixed(1) ?? '—'} dB est.)
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
              <MortgagePredictorPanel
                userProfile={userFinancialProfile}
                property={property}
                initialContext={initialMortgageContext}
                onContextChange={onMortgageContextChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
