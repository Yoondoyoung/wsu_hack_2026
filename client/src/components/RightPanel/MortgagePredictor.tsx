import { useState, useEffect } from 'react';
import { Calculator, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { useMortgagePredictor } from '../../hooks/useMortgagePredictor';
import type { MortgageRequestPayload } from '../../types/mortgage';
import type { Property } from '../../types/property';
import { formatPrice } from '../../utils/formatters';

interface Props {
  selectedProperty: Property | null;
}

const DEFAULTS: MortgageRequestPayload = {
  loan_amount: 300000,
  property_value: 400000,
  income: 85,
  debt_to_income_ratio: '30%-<36%',
  loan_type: 1,
  loan_purpose: 1,
  loan_term: 360,
  applicant_age: '35-44',
  applicant_sex: 1,
  occupancy_type: 1,
};

function InputField({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className="block text-[#8888a8] text-xs mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min} max={max} step={step}
        className="w-full bg-[#0f0f1a] border border-[#2d2d4a] rounded-lg px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#6366f1] transition-colors" />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string | number; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[#8888a8] text-xs mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#0f0f1a] border border-[#2d2d4a] rounded-lg px-3 py-2 text-[#e2e2f0] text-sm focus:outline-none focus:border-[#6366f1] transition-colors">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function MortgagePredictor({ selectedProperty }: Props) {
  const [form, setForm] = useState<MortgageRequestPayload>(DEFAULTS);
  const { result, loading, error, predict } = useMortgagePredictor();

  useEffect(() => {
    if (selectedProperty) {
      setForm((prev) => ({
        ...prev,
        loan_amount: Math.round(selectedProperty.price * 0.8),
        property_value: selectedProperty.price,
      }));
    }
  }, [selectedProperty]);

  const setNum = (key: keyof MortgageRequestPayload, v: number) =>
    setForm((prev) => ({ ...prev, [key]: v }));
  const setStr = (key: keyof MortgageRequestPayload, v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    predict(form);
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Calculator size={16} className="text-[#6366f1]" />
        <h3 className="text-[#e2e2f0] font-semibold text-sm">Mortgage Approval Predictor</h3>
      </div>

      {selectedProperty && (
        <div className="bg-[#0f0f1a] border border-[#2d2d4a] rounded-lg p-3 mb-4">
          <p className="text-[#8888a8] text-xs mb-1">Selected Property</p>
          <p className="text-[#e2e2f0] text-sm font-medium truncate">{selectedProperty.address}</p>
          <p className="text-[#6366f1] text-sm font-bold">{formatPrice(selectedProperty.price)}</p>
        </div>
      )}

      {!selectedProperty && (
        <p className="text-[#8888a8] text-xs mb-4 italic">Select a property above to auto-fill loan &amp; property values.</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <InputField label="Loan Amount ($)" value={form.loan_amount} onChange={(v) => setNum('loan_amount', v)} min={0} />
        <InputField label="Property Value ($)" value={form.property_value} onChange={(v) => setNum('property_value', v)} min={0} />
        <InputField label="Annual Income ($K)" value={form.income} onChange={(v) => setNum('income', v)} min={0} />

        <SelectField label="Debt-to-Income Ratio" value={form.debt_to_income_ratio}
          onChange={(v) => setStr('debt_to_income_ratio', v)}
          options={[
            { value: '20%-<30%', label: '20% - 30%' },
            { value: '30%-<36%', label: '30% - 36%' },
            { value: '36', label: '36%' },
            { value: '40', label: '40%' },
            { value: '43', label: '43%' },
            { value: '50%-60%', label: '50% - 60%' },
          ]}
        />

        <SelectField label="Loan Type" value={String(form.loan_type)}
          onChange={(v) => setNum('loan_type', parseInt(v))}
          options={[
            { value: '1', label: 'Conventional' },
            { value: '2', label: 'FHA' },
            { value: '3', label: 'VA' },
            { value: '4', label: 'RHS / FSA' },
          ]}
        />

        <SelectField label="Loan Purpose" value={String(form.loan_purpose)}
          onChange={(v) => setNum('loan_purpose', parseInt(v))}
          options={[
            { value: '1', label: 'Home Purchase' },
            { value: '2', label: 'Home Improvement' },
            { value: '31', label: 'Refinancing' },
            { value: '32', label: 'Cash-out Refinancing' },
          ]}
        />

        <SelectField label="Loan Term" value={String(form.loan_term)}
          onChange={(v) => setNum('loan_term', parseInt(v))}
          options={[
            { value: '360', label: '30 years' },
            { value: '240', label: '20 years' },
            { value: '180', label: '15 years' },
            { value: '120', label: '10 years' },
          ]}
        />

        <SelectField label="Applicant Age" value={form.applicant_age}
          onChange={(v) => setStr('applicant_age', v)}
          options={[
            { value: '<25', label: 'Under 25' },
            { value: '25-34', label: '25 - 34' },
            { value: '35-44', label: '35 - 44' },
            { value: '45-54', label: '45 - 54' },
            { value: '55-64', label: '55 - 64' },
            { value: '65-74', label: '65 - 74' },
            { value: '>74', label: '75+' },
          ]}
        />

        <SelectField label="Applicant Sex" value={String(form.applicant_sex)}
          onChange={(v) => setNum('applicant_sex', parseInt(v))}
          options={[
            { value: '1', label: 'Male' },
            { value: '2', label: 'Female' },
            { value: '3', label: 'Not Provided' },
          ]}
        />

        <SelectField label="Occupancy" value={String(form.occupancy_type)}
          onChange={(v) => setNum('occupancy_type', parseInt(v))}
          options={[
            { value: '1', label: 'Primary Residence' },
            { value: '2', label: 'Second Home' },
            { value: '3', label: 'Investment Property' },
          ]}
        />

        <button type="submit" disabled={loading}
          className="w-full bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm mt-2">
          {loading ? 'Calculating...' : 'Predict Approval'}
        </button>
      </form>

      {error && (
        <div className="mt-4 flex items-start gap-2 bg-red-900/20 border border-red-800/50 rounded-lg p-3">
          <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {result && !error && (
        <div className={`mt-4 rounded-xl border p-4 ${result.approved ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
          <div className="flex items-center gap-3 mb-3">
            {result.approved ? <TrendingUp size={20} className="text-green-400" /> : <TrendingDown size={20} className="text-red-400" />}
            <div>
              <p className={`font-bold text-sm ${result.approved ? 'text-green-300' : 'text-red-300'}`}>
                {result.approved ? 'Likely Approved' : 'Higher Risk'}
              </p>
              <p className="text-[#8888a8] text-xs">ML Confidence Score</p>
            </div>
            <div className="ml-auto text-right">
              <p className={`text-2xl font-black ${result.approved ? 'text-green-400' : 'text-red-400'}`}>{result.confidence}%</p>
            </div>
          </div>
          <div className="w-full bg-[#2d2d4a] rounded-full h-2 mb-3">
            <div className={`h-2 rounded-full transition-all ${result.approved ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${result.confidence}%` }} />
          </div>
          <p className="text-[#8888a8] text-xs leading-relaxed">{result.message}</p>
        </div>
      )}
    </div>
  );
}
