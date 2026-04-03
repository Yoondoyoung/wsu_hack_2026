import type { Property } from '../types/property';

export interface TcoInputs {
  interestRate: number;   // annual, e.g. 6.5
  downPercent: number;    // 0–100
  rentPercent: number;    // 0–100 of rentZestimate to offset
  maintenanceMonthlyOverride: number | null; // monthly dollars, e.g. 250
}

export interface TcoBreakdown {
  principalInterest: number;
  propertyTax: number;
  insurance: number;
  maintenance: number;
  maintenanceAuto: number;
  usedMaintenanceOverride: boolean;
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
const MAINTENANCE_BASE_RATE = 0.006; // 0.60% / year
const MAINTENANCE_PER_YEAR_RATE = 0.00015; // +0.015% per year of age
const MAINTENANCE_MAX_RATE = 0.02; // cap at 2.00% / year

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

export function homeAgeYears(yearBuilt: number | null | undefined): number | null {
  if (!yearBuilt || yearBuilt <= 0) return null;
  const currentYear = new Date().getFullYear();
  return Math.max(0, currentYear - yearBuilt);
}

export function maintenanceRate(yearBuilt: number | null | undefined): number {
  const age = homeAgeYears(yearBuilt);
  if (age == null) return 0.01;
  return Math.min(MAINTENANCE_MAX_RATE, MAINTENANCE_BASE_RATE + age * MAINTENANCE_PER_YEAR_RATE);
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
  maintenanceMonthlyOverride: null,
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
  const maintenanceAuto = (price * maintenanceRate(property.yearBuilt)) / 12;
  const maint = inputs.maintenanceMonthlyOverride ?? maintenanceAuto;
  const hoa = property.hoaFee ?? 0;
  const pmi = (loanAmount * pmiAnnualRate(inputs.downPercent)) / 12;

  const rentalIncome = effectiveRentEstimateRaw * (inputs.rentPercent / 100);

  const principalInterestRounded = Math.round(principalInterest);
  const propertyTaxRounded = Math.round(propertyTax);
  const insuranceRounded = Math.round(insurance);
  const maintenanceRounded = Math.round(maint);
  const maintenanceAutoRounded = Math.round(maintenanceAuto);
  const hoaRounded = Math.round(hoa);
  const pmiRounded = Math.round(pmi);
  const rentalIncomeRounded = Math.round(rentalIncome);
  const grossMonthlyRounded = principalInterestRounded + propertyTaxRounded + insuranceRounded + maintenanceRounded + hoaRounded + pmiRounded;
  const netMonthlyRounded = grossMonthlyRounded - rentalIncomeRounded;

  return {
    principalInterest: principalInterestRounded,
    propertyTax: propertyTaxRounded,
    insurance: insuranceRounded,
    maintenance: maintenanceRounded,
    maintenanceAuto: maintenanceAutoRounded,
    usedMaintenanceOverride: inputs.maintenanceMonthlyOverride != null,
    hoa: hoaRounded,
    pmi: pmiRounded,
    grossMonthly: grossMonthlyRounded,
    effectiveRentEstimate: Math.round(effectiveRentEstimateRaw),
    usedDefaultRentEstimate: !hasRentEstimate,
    rentalIncome: rentalIncomeRounded,
    netMonthly: netMonthlyRounded,
  };
}
