import type { Property } from '../types/property';
import type { CreditScoreRange, LoanType } from '../types/mortgage';

// 30-year conventional rate benchmarks by credit tier (Apr 2026 baseline)
export const RATE_BY_SCORE: Record<CreditScoreRange, number> = {
  '760+':    6.5,
  '720-759': 6.8,
  '680-719': 7.1,
  '640-679': 7.75,
  '<640':    8.5,
};

// FHA rates run ~0.25% below conventional (lower rate, but MIP adds cost)
const FHA_RATE_OFFSET = -0.25;
const FHA_UPFRONT_MIP_RATE = 0.0175;
const FHA_ANNUAL_MIP_RATE  = 0.0055;

const UTAH_PROPERTY_TAX_RATE = 0.0058;
const BASE_INSURANCE_RATE    = 0.0035;

// Returns next credit score tier above current (for upgrade tip)
const SCORE_TIER_UPGRADE: Partial<Record<CreditScoreRange, CreditScoreRange>> = {
  '<640':    '640-679',
  '640-679': '680-719',
  '680-719': '720-759',
  '720-759': '760+',
};

function monthlyPI(principal: number, annualRate: number, termMonths = 360): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  if (annualRate <= 0) return principal / termMonths;
  const r = annualRate / 100 / 12;
  const pow = Math.pow(1 + r, termMonths);
  return (principal * r * pow) / (pow - 1);
}

function pmiAnnualRate(ltv: number): number {
  if (ltv <= 80) return 0;
  if (ltv <= 85) return 0.005;
  if (ltv <= 90) return 0.0065;
  return 0.01;
}

function insuranceMultiplier(crimeRisk: Property['crimeRiskLevel']): number {
  if (crimeRisk === 'high')   return 1.25;
  if (crimeRisk === 'medium') return 1.10;
  return 1.0;
}

// ─── Output types ────────────────────────────────────────────

export interface MonthlyBreakdown {
  rate: number;
  principalInterest: number;
  propertyTax: number;
  insurance: number;
  pmiOrMip: number;
  hoa: number;
  total: number;
}

export interface CashToCloseResult {
  downPayment: number;
  closingCostsLow: number;
  closingCostsHigh: number;
  prepaidsLow: number;
  prepaidsHigh: number;
  fhaUpfrontMip: number;
  totalLow: number;
  totalHigh: number;
}

export interface FeeBreakdown {
  originationLow: number;  originationHigh: number;
  appraisalLow: number;    appraisalHigh: number;
  titleLow: number;        titleHigh: number;
  settlementLow: number;   settlementHigh: number;
  recordingLow: number;    recordingHigh: number;
  inspectionLow: number;   inspectionHigh: number;
  subtotalLow: number;
  subtotalHigh: number;
}

export interface UncertaintyRange {
  rateLow: number;
  rateMid: number;
  rateHigh: number;
  monthlyLow: number;
  monthlyMid: number;
  monthlyHigh: number;
  cashLow: number;
  cashMid: number;
  cashHigh: number;
}

export interface MortgageReadinessResult {
  loanAmount: number;
  downAmount: number;
  ltv: number;
  estimatedRate: number;
  monthly: MonthlyBreakdown;
  cashToClose: CashToCloseResult;
  fees: FeeBreakdown;
  range: UncertaintyRange;
  frontEndDTI: number;
  backEndDTI: number;
}

export interface MortgageTip {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'action';
}

// ─── Profile type (local, mirrors UserFinancialProfile) ──────

interface ProfileInput {
  annualIncome: number;
  monthlyDebt: number;
  creditScoreRange: CreditScoreRange;
  loanType: LoanType;
  downPaymentPercent: number;
}

// ─── Fee breakdown (itemised closing costs) ──────────────────

function buildFeeBreakdown(loanAmount: number): FeeBreakdown {
  const originationLow  = Math.round(loanAmount * 0.005);
  const originationHigh = Math.round(loanAmount * 0.01);
  const appraisalLow  = 400;  const appraisalHigh  = 700;
  const titleLow      = 700;  const titleHigh      = 1400;
  const settlementLow = 400;  const settlementHigh = 800;
  const recordingLow  = 100;  const recordingHigh  = 250;
  const inspectionLow = 300;  const inspectionHigh = 500;
  return {
    originationLow, originationHigh,
    appraisalLow,   appraisalHigh,
    titleLow,       titleHigh,
    settlementLow,  settlementHigh,
    recordingLow,   recordingHigh,
    inspectionLow,  inspectionHigh,
    subtotalLow:  originationLow  + appraisalLow  + titleLow  + settlementLow  + recordingLow  + inspectionLow,
    subtotalHigh: originationHigh + appraisalHigh + titleHigh + settlementHigh + recordingHigh + inspectionHigh,
  };
}

// ─── Core calculation ─────────────────────────────────────────

export function computeMortgageReadiness(
  property: Property,
  profile: ProfileInput,
): MortgageReadinessResult {
  const price      = property.price;
  const downAmount = Math.round(price * (profile.downPaymentPercent / 100));
  const loanAmount = Math.max(0, price - downAmount);
  const ltv        = price > 0 ? (loanAmount / price) * 100 : 80;

  let rate = RATE_BY_SCORE[profile.creditScoreRange];
  if (profile.loanType === 'fha') rate += FHA_RATE_OFFSET;

  const pi = monthlyPI(loanAmount, rate);
  const propertyTax = Math.round((price * UTAH_PROPERTY_TAX_RATE) / 12);
  const insurance   = Math.round((price * BASE_INSURANCE_RATE * insuranceMultiplier(property.crimeRiskLevel)) / 12);
  const hoa         = Math.round(property.hoaFee ?? 0);

  let pmiOrMip = 0;
  if (profile.loanType === 'fha') {
    pmiOrMip = Math.round((loanAmount * FHA_ANNUAL_MIP_RATE) / 12);
  } else {
    pmiOrMip = Math.round((loanAmount * pmiAnnualRate(ltv)) / 12);
  }

  const piRounded = Math.round(pi);
  const total = piRounded + propertyTax + insurance + pmiOrMip + hoa;

  // Cash to close
  const fhaUpfrontMip   = profile.loanType === 'fha' ? Math.round(loanAmount * FHA_UPFRONT_MIP_RATE) : 0;
  const fees            = buildFeeBreakdown(loanAmount);
  // Prepaids: 1yr insurance + 2-3mo property tax escrow + 15-30 days per-diem interest
  const prepaidsLow  = Math.round(insurance * 12 + propertyTax * 2 + (piRounded / 30) * 15);
  const prepaidsHigh = Math.round(insurance * 12 + propertyTax * 3 + piRounded);

  const cashLow  = downAmount + fees.subtotalLow  + prepaidsLow  + fhaUpfrontMip;
  const cashHigh = downAmount + fees.subtotalHigh + prepaidsHigh + fhaUpfrontMip;
  const cashMid  = Math.round((cashLow + cashHigh) / 2);

  // Uncertainty range ±0.5% rate volatility
  const rateLow  = Math.max(3, rate - 0.5);
  const rateMid  = rate;
  const rateHigh = rate + 0.5;

  function totalAtRate(r: number) {
    return Math.round(monthlyPI(loanAmount, r)) + propertyTax + insurance + pmiOrMip + hoa;
  }

  // DTI
  const monthlyIncome = profile.annualIncome > 0 ? profile.annualIncome / 12 : 1;
  const frontEndDTI = (total / monthlyIncome) * 100;
  const backEndDTI  = ((total + profile.monthlyDebt) / monthlyIncome) * 100;

  return {
    loanAmount,
    downAmount,
    ltv,
    estimatedRate: rate,
    monthly: { rate, principalInterest: piRounded, propertyTax, insurance, pmiOrMip, hoa, total },
    cashToClose: {
      downPayment: downAmount,
      closingCostsLow:  fees.subtotalLow,
      closingCostsHigh: fees.subtotalHigh,
      prepaidsLow,
      prepaidsHigh,
      fhaUpfrontMip,
      totalLow:  cashLow,
      totalHigh: cashHigh,
    },
    fees,
    range: {
      rateLow, rateMid, rateHigh,
      monthlyLow:  totalAtRate(rateLow),
      monthlyMid:  totalAtRate(rateMid),
      monthlyHigh: totalAtRate(rateHigh),
      cashLow, cashMid, cashHigh,
    },
    frontEndDTI,
    backEndDTI,
  };
}

// ─── Dynamic tips ─────────────────────────────────────────────

export function generateMortgageTips(
  result: MortgageReadinessResult,
  profile: ProfileInput,
): MortgageTip[] {
  const tips: MortgageTip[] = [];

  // PMI elimination (conventional only)
  if (result.monthly.pmiOrMip > 0 && profile.loanType === 'conventional') {
    const targetLoan = result.loanAmount / (result.ltv / 100) * 0.8;
    const extraDown  = Math.round(result.loanAmount - targetLoan);
    tips.push({
      id: 'pmi-elimination',
      message: `Add $${extraDown.toLocaleString()} more down → eliminate $${result.monthly.pmiOrMip.toLocaleString()}/mo PMI`,
      type: 'action',
    });
  }

  // Back-end DTI over limit
  if (result.backEndDTI > 43) {
    const maxTotal    = (profile.annualIncome / 12) * 0.43;
    const excessDebt  = Math.round(result.monthly.total + profile.monthlyDebt - maxTotal);
    tips.push({
      id: 'dti-warning',
      message: `Back-end DTI ${result.backEndDTI.toFixed(0)}% (limit 43%) — reduce monthly debt by $${excessDebt.toLocaleString()} to qualify`,
      type: 'warning',
    });
  } else if (result.frontEndDTI > 28) {
    tips.push({
      id: 'front-dti-caution',
      message: `Housing cost is ${result.frontEndDTI.toFixed(0)}% of income (guideline 28%) — consider a lower price or larger down payment`,
      type: 'warning',
    });
  }

  // Credit score upgrade savings
  const nextTier = SCORE_TIER_UPGRADE[profile.creditScoreRange];
  if (nextTier) {
    const currentRate = RATE_BY_SCORE[profile.creditScoreRange];
    const nextRate    = RATE_BY_SCORE[nextTier];
    const savings     = Math.round(monthlyPI(result.loanAmount, currentRate) - monthlyPI(result.loanAmount, nextRate));
    if (savings > 0) {
      tips.push({
        id: 'credit-upgrade',
        message: `Score ${nextTier} saves ~$${savings.toLocaleString()}/mo ($${(savings * 12).toLocaleString()}/yr)`,
        type: 'info',
      });
    }
  }

  return tips.slice(0, 3);
}
