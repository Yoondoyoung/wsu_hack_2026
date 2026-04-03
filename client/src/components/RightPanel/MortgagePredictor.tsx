import { useState, useMemo } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { useMortgagePredictor } from '../../hooks/useMortgagePredictor';
import type { MortgagePredictorFormState } from '../../services/chat';
import type { CreditScoreRange, LoanType, MortgageRequestPayload } from '../../types/mortgage';
import type { Property } from '../../types/property';
import { formatPrice } from '../../utils/formatters';
import { computeMortgageReadiness } from '../../utils/mortgageCalculations';

interface Props {
  selectedProperty: Property | null;
}

const PROFILE_DEFAULTS: MortgagePredictorFormState = {
  annualIncome: 85000,
  monthlyDebt: 0,
  downPaymentPercent: 20,
  creditScoreRange: '720-759',
  loanType: 'conventional',
};

/** Minimal listing when user enters a price without map selection. */
function listingForReadiness(selected: Property | null, manualPrice: number): Property {
  const price = selected?.price ?? (manualPrice > 0 ? manualPrice : 400000);
  if (selected) return selected;
  return {
    id: '__manual__',
    address: 'Manual entry',
    streetAddress: '',
    city: 'Salt Lake City',
    state: 'UT',
    zip: '84101',
    price,
    beds: 3,
    baths: 2,
    sqft: 1800,
    yearBuilt: 2000,
    coordinates: [-111.891, 40.76],
    homeType: 'Single Family',
    imageUrl: '',
    photos: [],
    detailUrl: '',
    description: '',
    lotSize: null,
    pricePerSqft: null,
    daysOnZillow: 0,
    pageViews: 0,
    favorites: 0,
    heating: [],
    cooling: [],
    parking: [],
    appliances: [],
    basement: null,
    constructionMaterials: [],
    brokerName: '',
    agentName: '',
    agentPhone: '',
    hoaFee: null,
    zestimate: null,
    rentZestimate: null,
    schools: [],
    priceHistory: [],
    statusText: '',
    flexText: '',
    crimeIncidentCount: 0,
    crimeRiskRadiusMiles: 0.5,
    crimeRiskLevel: 'medium',
    noiseExposureLevel: 'medium',
  };
}

function buildAiPayload(
  f: MortgagePredictorFormState,
  readiness: ReturnType<typeof computeMortgageReadiness>,
  property: Property,
): MortgageRequestPayload {
  return {
    property_price: property.price > 0 ? property.price : readiness.loanAmount + readiness.downAmount,
    loan_amount: readiness.loanAmount,
    ltv: readiness.ltv,
    annual_income: f.annualIncome,
    monthly_debt: f.monthlyDebt,
    front_end_dti: readiness.frontEndDTI,
    back_end_dti: readiness.backEndDTI,
    credit_score_range: f.creditScoreRange,
    loan_type: f.loanType,
    down_payment_percent: f.downPaymentPercent,
  };
}

function CircularGauge({ value, approved }: { value: number; approved: boolean }) {
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value / 100);
  const color =
    approved ? (value >= 70 ? '#00e676' : '#f59e0b') : '#ef4444';
  const glowColor =
    approved ? (value >= 70 ? 'rgba(0,230,118,0.4)' : 'rgba(245,158,11,0.4)') : 'rgba(239,68,68,0.4)';

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 120 120" className="w-28 h-28">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="10"
        />
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          filter="url(#glow)"
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease',
          }}
        />
        <text
          x="60" y="56"
          textAnchor="middle"
          fill="white"
          fontSize="22"
          fontWeight="800"
          fontFamily="system-ui, sans-serif"
        >
          {value}%
        </text>
        <text
          x="60" y="72"
          textAnchor="middle"
          fill="rgba(255,255,255,0.35)"
          fontSize="9"
          fontFamily="system-ui, sans-serif"
          letterSpacing="1.5"
        >
          {approved ? 'LIKELY' : 'RISK'}
        </text>
      </svg>
      <p
        className="text-xs font-semibold"
        style={{ color, textShadow: `0 0 12px ${glowColor}` }}
      >
        {approved ? 'Likely approvable' : 'Higher risk'}
      </p>
    </div>
  );
}

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-white/30 text-[10px] uppercase tracking-widest mb-1">{label}</label>
      <div className="flex items-center gap-1 w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2">
        <span className="text-white/40 text-xs">$</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={0}
          className="flex-1 min-w-0 bg-transparent text-white/80 text-xs focus:outline-none"
        />
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-white/30 text-[10px] uppercase tracking-widest mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-white/80 text-xs focus:outline-none focus:border-[#00e5ff]/40 transition-colors"
        style={{ colorScheme: 'dark' }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function MortgagePredictor({ selectedProperty }: Props) {
  const [fields, setFields] = useState<MortgagePredictorFormState>(PROFILE_DEFAULTS);
  const [manualPrice, setManualPrice] = useState(400000);
  const { result, loading, error, predict } = useMortgagePredictor();

  const listing = useMemo(
    () => listingForReadiness(selectedProperty, manualPrice),
    [selectedProperty, manualPrice],
  );
  const readiness = useMemo(() => computeMortgageReadiness(listing, fields), [listing, fields]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    predict(buildAiPayload(fields, readiness, listing));
  };

  return (
    <div>
      {selectedProperty && (
        <div className="bg-white/4 border border-white/6 rounded-xl p-3 mb-4">
          <p className="text-white/30 text-[9px] uppercase tracking-widest mb-1">Selected Property</p>
          <p className="text-white/70 text-xs font-medium truncate">{selectedProperty.address}</p>
          <p className="text-[#00e5ff] text-sm font-bold mt-0.5">{formatPrice(selectedProperty.price)}</p>
        </div>
      )}

      {!selectedProperty && (
        <div className="mb-4 space-y-2">
          <p className="text-white/30 text-[11px] italic">
            No map selection — enter a home price for estimates.
          </p>
          <MoneyInput label="Home price ($)" value={manualPrice} onChange={setManualPrice} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <MoneyInput label="Annual income" value={fields.annualIncome} onChange={(v) => setFields((p) => ({ ...p, annualIncome: v }))} />
        <MoneyInput label="Monthly debt payments" value={fields.monthlyDebt} onChange={(v) => setFields((p) => ({ ...p, monthlyDebt: v }))} />

        <SelectField
          label="Credit score"
          value={fields.creditScoreRange}
          onChange={(v) => setFields((p) => ({ ...p, creditScoreRange: v as CreditScoreRange }))}
          options={[
            { value: '760+', label: '760+' },
            { value: '720-759', label: '720–759' },
            { value: '680-719', label: '680–719' },
            { value: '640-679', label: '640–679' },
            { value: '<640', label: 'Under 640' },
          ]}
        />
        <SelectField
          label="Loan type"
          value={fields.loanType}
          onChange={(v) => setFields((p) => ({ ...p, loanType: v as LoanType }))}
          options={[
            { value: 'conventional', label: 'Conventional' },
            { value: 'fha', label: 'FHA' },
          ]}
        />
        <div>
          <label className="block text-white/30 text-[10px] uppercase tracking-widest mb-1">Down payment %</label>
          <input
            type="number"
            value={fields.downPaymentPercent}
            onChange={(e) => setFields((p) => ({ ...p, downPaymentPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))}
            min={0}
            max={100}
            className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-white/80 text-xs focus:outline-none focus:border-[#00e5ff]/40 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, rgba(0,229,255,0.15), rgba(41,121,255,0.15))',
            border: '1px solid rgba(0,229,255,0.25)',
            color: '#00e5ff',
            boxShadow: loading ? 'none' : '0 0 16px rgba(0,229,255,0.1)',
          }}
        >
          {loading ? 'Analyzing…' : 'Run AI check'}
        </button>
      </form>

      {error && (
        <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-red-300/80 text-xs">{error}</p>
        </div>
      )}

      {result && !error && (
        <div className="mt-4 bg-white/4 border border-white/8 rounded-2xl p-4 space-y-3">
          <div className="flex justify-center mb-1">
            <CircularGauge value={result.confidence} approved={result.approved} />
          </div>
          {result.message && (
            <p className="text-white/50 text-[10px] text-center leading-relaxed">{result.message}</p>
          )}
          {result.strengths.length > 0 && (
            <div className="space-y-1">
              {result.strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px] text-emerald-300">
                  <CheckCircle size={10} className="mt-0.5 flex-shrink-0 text-emerald-400" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}
          {result.risks.length > 0 && (
            <div className="space-y-1">
              {result.risks.map((r, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px] text-amber-200">
                  <AlertTriangle size={10} className="mt-0.5 flex-shrink-0 text-amber-400" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
