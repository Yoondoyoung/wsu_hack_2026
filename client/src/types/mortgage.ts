export interface MortgageRequestPayload {
  loan_amount: number;
  property_value: number;
  income: number;
  debt_to_income_ratio: string;
  loan_type: number;
  loan_purpose: number;
  loan_term: number;
  applicant_age: string;
  applicant_sex: number;
  occupancy_type: number;
}

export interface MortgageResponse {
  approved: boolean;
  confidence: number;
  message: string;
}
