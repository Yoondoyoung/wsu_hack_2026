import type { MortgageRequestPayload } from '../types/mortgage';

export interface Scenario {
  id: string;
  label: string;
  description: string;
  payload: MortgageRequestPayload;
}

function dtiStringForRatio(dti: number): string {
  if (dti < 30) return '20%-<30%';
  if (dti < 36) return '30%-<36%';
  if (dti < 40) return '36';
  if (dti < 43) return '40';
  if (dti < 50) return '43';
  return '50%-60%';
}

export function generateScenarios(base: MortgageRequestPayload): Scenario[] {
  const scenarios: Scenario[] = [];

  // 1. Lower DTI: reduce debt by $5k (income is in thousands in the payload)
  const annualIncome = base.income * 1000;
  const currentDebtEstimate = parseDtiMidpoint(base.debt_to_income_ratio) / 100 * annualIncome;
  const reducedDebt = Math.max(0, currentDebtEstimate - 5000);
  const newDti = annualIncome > 0 ? (reducedDebt / annualIncome) * 100 : 0;
  scenarios.push({
    id: 'lower-dti',
    label: 'Lower debt by $5k',
    description: 'Reduce total debt by $5,000',
    payload: { ...base, debt_to_income_ratio: dtiStringForRatio(newDti) },
  });

  // 2. Higher down payment: +5% of property value → lower LTV
  const extraDown = base.property_value * 0.05;
  const newLoanAmount = Math.max(0, base.loan_amount - extraDown);
  scenarios.push({
    id: 'higher-down',
    label: 'Add 5% down payment',
    description: `Increase down payment by ${formatDollars(extraDown)}`,
    payload: { ...base, loan_amount: Math.round(newLoanAmount) },
  });

  // 3. Switch to 15-year term
  if (base.loan_term === 360) {
    scenarios.push({
      id: 'shorter-term',
      label: '15-year loan term',
      description: 'Switch from 30-year to 15-year',
      payload: { ...base, loan_term: 180 },
    });
  }

  return scenarios;
}

function parseDtiMidpoint(dtiStr: string): number {
  if (dtiStr.includes('<30')) return 25;
  if (dtiStr.includes('<36')) return 33;
  if (dtiStr === '36') return 36;
  if (dtiStr === '40') return 40;
  if (dtiStr === '43') return 43;
  if (dtiStr.includes('50%-60%')) return 55;
  const n = parseFloat(dtiStr);
  return Number.isFinite(n) ? n : 36;
}

function formatDollars(v: number): string {
  return `$${Math.round(v).toLocaleString()}`;
}
