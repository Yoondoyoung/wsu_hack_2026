export type CreditScoreRange = '760+' | '720-759' | '680-719' | '640-679' | '<640';
export type LoanType = 'conventional' | 'fha';

export interface UserFinancialProfile {
  annualIncome: number;
  monthlyDebt: number;
  creditScoreRange: CreditScoreRange;
  loanType: LoanType;
  downPaymentPercent: number;
}

/** Request payload sent to the AI mortgage prediction endpoint. */
export interface MortgageRequestPayload {
  property_price: number;
  loan_amount: number;
  ltv: number;
  annual_income: number;
  monthly_debt: number;
  front_end_dti: number;
  back_end_dti: number;
  credit_score_range: CreditScoreRange;
  loan_type: LoanType;
  down_payment_percent: number;
}

/** Response from the AI mortgage prediction endpoint. */
export interface MortgageResponse {
  confidence: number;
  approved: boolean;
  message: string;
  strengths: string[];
  risks: string[];
}
