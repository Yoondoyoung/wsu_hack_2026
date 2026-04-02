import type { Property } from '../types/property';

export interface TcoInputs {
  interestRate: number;   // annual, e.g. 6.5
  downPercent: number;    // 0–100
  rentPercent: number;    // 0–100 of rentZestimate to offset
}

export interface TcoBreakdown {
  principalInterest: number;
  propertyTax: number;
  insurance: number;
  maintenance: number;
  hoa: number;
  pmi: number;
  grossMonthly: number;
  effectiveRentEstimate: number;
  usedDefaultRentEstimate: boolean;
  rentalIncome: number;
  netMonthly: number;
}

const UTAH_PROPERTY_TAX_RATE = 0.0058;
const BASE_INSURANCE_RATE = 0.0035;
const DEFAULT_RENT_TO_PRICE_MONTHLY_RATE = 0.0065; // 0.65% of home price per month

function monthlyPI(principal: number, annualRate: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  if (annualRate <= 0) return principal / termMonths;
  const r = annualRate / 100 / 12;
  const pow = Math.pow(1 + r, termMonths);
  return (principal * r * pow) / (pow - 1);
}

function insuranceMultiplier(crimeRisk: 'low' | 'medium' | 'high' | undefined): number {
  if (crimeRisk === 'high') return 1.25;
  if (crimeRisk === 'medium') return 1.10;
  return 1.0;
}

function maintenanceRate(yearBuilt: number): number {
  if (!yearBuilt || yearBuilt <= 0) return 0.01;
  if (yearBuilt >= 2020) return 0.005;
  if (yearBuilt >= 1980) return 0.01;
  return 0.015;
}

function pmiAnnualRate(downPercent: number): number {
  if (downPercent >= 20) return 0;
  if (downPercent >= 15) return 0.005;
  if (downPercent >= 10) return 0.0065;
  return 0.01;
}

export const TCO_DEFAULTS: TcoInputs = {
  interestRate: 6.5,
  downPercent: 20,
  rentPercent: 50,
};

export function calcTCO(property: Property, inputs: TcoInputs): TcoBreakdown {
  const price = property.price;
  const downAmount = price * (inputs.downPercent / 100);
  const loanAmount = price - downAmount;
  const termMonths = 360;
  const hasRentEstimate = property.rentZestimate != null && property.rentZestimate > 0;
  const effectiveRentEstimateRaw = hasRentEstimate
    ? property.rentZestimate as number
    : price * DEFAULT_RENT_TO_PRICE_MONTHLY_RATE;

  const principalInterest = monthlyPI(loanAmount, inputs.interestRate, termMonths);
  const propertyTax = (price * UTAH_PROPERTY_TAX_RATE) / 12;
  const insurance = (price * BASE_INSURANCE_RATE) / 12 * insuranceMultiplier(property.crimeRiskLevel);
  const maint = (price * maintenanceRate(property.yearBuilt)) / 12;
  const hoa = property.hoaFee ?? 0;
  const pmi = (loanAmount * pmiAnnualRate(inputs.downPercent)) / 12;

  const grossMonthly = principalInterest + propertyTax + insurance + maint + hoa + pmi;
  const rentalIncome = effectiveRentEstimateRaw * (inputs.rentPercent / 100);
  const netMonthly = grossMonthly - rentalIncome;

  return {
    principalInterest: Math.round(principalInterest),
    propertyTax: Math.round(propertyTax),
    insurance: Math.round(insurance),
    maintenance: Math.round(maint),
    hoa: Math.round(hoa),
    pmi: Math.round(pmi),
    grossMonthly: Math.round(grossMonthly),
    effectiveRentEstimate: Math.round(effectiveRentEstimateRaw),
    usedDefaultRentEstimate: !hasRentEstimate,
    rentalIncome: Math.round(rentalIncome),
    netMonthly: Math.round(netMonthly),
  };
}
