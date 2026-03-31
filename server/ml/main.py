import sys, types
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier

# Patch modules for deserialization
class _FakeModule(types.ModuleType):
    def __init__(self, name, cls):
        super().__init__(name)
        setattr(self, name, cls)
        for n in dir(np):
            setattr(self, n, getattr(np, n))

sys.modules['RandomForestClassifier'] = _FakeModule('RandomForestClassifier', RandomForestClassifier)
sys.modules['DecisionTreeClassifier'] = _FakeModule('DecisionTreeClassifier', DecisionTreeClassifier)

import joblib
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path

MODEL_PATH = Path(__file__).resolve().parent.parent / "src" / "model" / "loan_approval_model_slc.pkl"

bundle = joblib.load(MODEL_PATH)
model = bundle["model"]
encoders = bundle["encoders"]
feature_columns = bundle["feature_columns"]

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class MortgageInput(BaseModel):
    loan_amount: float          # e.g. 400000
    property_value: float       # e.g. 500000
    income: float               # annual, in thousands (e.g. 100)
    debt_to_income_ratio: str   # "20%-<30%", "30%-<36%", "36", …, "60%+"
    loan_type: int              # 1=Conventional, 2=FHA, 3=VA, 4=RHS/FSA
    loan_purpose: int           # 1=Purchase, 2=Improvement, 31=Refinance, 32=Cash-out Refi
    loan_term: int              # months: 360, 180, 240 …
    applicant_age: str          # "<25", "25-34", "35-44", "45-54", "55-64", "65-74", ">74"
    applicant_sex: int          # 1=Male, 2=Female, 3=Info not provided
    occupancy_type: int         # 1=Principal, 2=Second Home, 3=Investment


DEFAULTS = {
    "activity_year": 2024,
    "lei": "25490000OGVJZR74L509",
    "derived_msa-md": 41620,
    "state_code": "UT",
    "county_code": 35,
    "census_tract": 49035100100.0,
    "conforming_loan_limit": "C",
    "derived_loan_product_type": "Conventional:First Lien",
    "derived_dwelling_category": "Single Family (1-4 Units):Site-Built",
    "derived_ethnicity": "Not Hispanic or Latino",
    "derived_race": "Race Not Available",
    "derived_sex": "Male",
    "preapproval": 1,
    "lien_status": 1,
    "reverse_mortgage": 2,
    "open-end_line_of_credit": 2,
    "business_or_commercial_purpose": 2,
    "negative_amortization": 2,
    "interest_only_payment": 2,
    "balloon_payment": 2,
    "other_nonamortizing_features": 2,
    "construction_method": 1,
    "manufactured_home_secured_property_type": 2,
    "manufactured_home_land_property_interest": 5,
    "total_units": "1",
    "multifamily_affordable_units": "Exempt",
    "applicant_credit_score_type": 1,
    "co-applicant_credit_score_type": 10,
    "applicant_ethnicity-1": 3,
    "applicant_ethnicity-2": 4,
    "applicant_ethnicity-3": 4,
    "applicant_ethnicity-4": 4,
    "applicant_ethnicity-5": 4,
    "co-applicant_ethnicity-1": 5,
    "co-applicant_ethnicity-2": 4,
    "co-applicant_ethnicity-3": 4,
    "co-applicant_ethnicity-4": 4,
    "co-applicant_ethnicity-5": 4,
    "applicant_ethnicity_observed": 2,
    "co-applicant_ethnicity_observed": 4,
    "applicant_race-1": 7,
    "applicant_race-2": 8,
    "applicant_race-3": 8,
    "applicant_race-4": 8,
    "applicant_race-5": 8,
    "co-applicant_race-1": 8,
    "co-applicant_race-2": 8,
    "co-applicant_race-3": 8,
    "co-applicant_race-4": 8,
    "co-applicant_race-5": 8,
    "applicant_race_observed": 2,
    "co-applicant_race_observed": 4,
    "co-applicant_sex": 5,
    "applicant_sex_observed": 2,
    "co-applicant_sex_observed": 4,
    "co-applicant_age": "9999",
    "applicant_age_above_62": "No",
    "co-applicant_age_above_62": "Unknown",
    "submission_of_application": 1,
    "initially_payable_to_institution": 1,
    "aus-1": 1,
    "aus-2": 1111,
    "aus-3": 1111,
    "aus-4": 1111,
    "aus-5": 1111,
    "tract_population": 5000,
    "tract_minority_population_percent": 15.0,
    "ffiec_msa_md_median_family_income": 85000,
    "tract_to_msa_income_percentage": 95.0,
    "tract_owner_occupied_units": 1200,
    "tract_one_to_four_family_homes": 1500,
    "tract_median_age_of_housing_units": 35,
}

SEX_MAP = {1: "Male", 2: "Female", 3: "Sex Not Available"}
LOAN_PRODUCT_MAP = {1: "Conventional:First Lien", 2: "FHA:First Lien", 3: "VA:First Lien", 4: "FSA/RHS:First Lien"}


def build_row(inp: MortgageInput) -> dict:
    row = dict(DEFAULTS)
    row["loan_amount"] = inp.loan_amount
    row["property_value"] = str(int(inp.property_value))
    ltv = (inp.loan_amount / inp.property_value * 100) if inp.property_value else 80
    row["loan_to_value_ratio"] = f"{ltv:.3f}"
    row["income"] = inp.income
    row["debt_to_income_ratio"] = inp.debt_to_income_ratio
    row["loan_type"] = inp.loan_type
    row["loan_purpose"] = inp.loan_purpose
    row["loan_term"] = str(inp.loan_term)
    row["applicant_age"] = inp.applicant_age
    row["applicant_sex"] = inp.applicant_sex
    row["derived_sex"] = SEX_MAP.get(inp.applicant_sex, "Sex Not Available")
    row["derived_loan_product_type"] = LOAN_PRODUCT_MAP.get(inp.loan_type, "Conventional:First Lien")
    row["occupancy_type"] = inp.occupancy_type
    if inp.applicant_age in (">74", "65-74"):
        row["applicant_age_above_62"] = "Yes"
    return row


def safe_encode(col: str, val):
    """Label-encode a value; if unseen, pick the closest or first class."""
    if col not in encoders:
        return val
    enc = encoders[col]
    classes = list(enc.classes_)
    str_val = str(val)
    if str_val in [str(c) for c in classes]:
        return enc.transform([val])[0]
    # For numeric-like strings, pick closest
    try:
        num = float(str_val)
        nums = [float(c) for c in classes]
        closest = classes[min(range(len(nums)), key=lambda i: abs(nums[i] - num))]
        return enc.transform([closest])[0]
    except (ValueError, TypeError):
        return enc.transform([classes[0]])[0]


@app.post("/predict")
def predict(inp: MortgageInput):
    row = build_row(inp)
    df = pd.DataFrame([row])

    for col in encoders:
        if col in df.columns:
            df[col] = df[col].apply(lambda v: safe_encode(col, v))

    X = df[feature_columns].values.astype(float)
    proba = model.predict_proba(X)[0]
    # classes_ = [0, 1] → idx 1 = approved
    approval_prob = float(proba[1]) * 100

    return {
        "approved": approval_prob >= 55,
        "confidence": round(approval_prob, 1),
        "message": (
            "Based on your financial profile, you have a strong chance of mortgage approval."
            if approval_prob >= 55
            else "Your current profile suggests some risk factors. Consider adjusting your loan amount or improving your debt-to-income ratio."
        ),
    }


@app.get("/health")
def health():
    return {"status": "ok", "features": len(feature_columns)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
