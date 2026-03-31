import { Router } from 'express';

export const mortgageRouter = Router();

const ML_SERVICE = 'http://localhost:8000';

mortgageRouter.post('/predict-mortgage', async (req, res) => {
  try {
    const response = await fetch(`${ML_SERVICE}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch {
    // Fallback mock if Python service is down
    const { loan_amount, property_value, income, debt_to_income_ratio } = req.body;
    const ltv = property_value ? (loan_amount / property_value) * 100 : 80;
    let score = 50;
    if (ltv < 80) score += 15;
    else if (ltv > 95) score -= 15;
    if (income > 100) score += 15;
    else if (income < 50) score -= 10;
    if (debt_to_income_ratio === '20%-<30%') score += 10;
    else if (['50%-60%', '60%+'].includes(debt_to_income_ratio)) score -= 15;
    const confidence = Math.min(98, Math.max(5, score));
    res.json({
      approved: confidence >= 55,
      confidence,
      message: confidence >= 55
        ? 'Based on your financial profile, you have a strong chance of mortgage approval.'
        : 'Your current profile suggests some risk factors. Consider adjusting your loan amount or debt-to-income ratio.',
    });
  }
});
