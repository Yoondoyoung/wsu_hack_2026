import { Router } from 'express';
import OpenAI from 'openai';

export const mortgageRouter = Router();

const SYSTEM_PROMPT = `You are an experienced US mortgage underwriter. Evaluate loan applications using current standard lending guidelines.

Conventional loans: Minimum credit score 620, front-end DTI (housing expense / gross income) ≤ 28%, back-end DTI (all debt / gross income) ≤ 43% (up to 50% with strong compensating factors like large reserves or high income), LTV ≤ 97%, PMI required if LTV > 80%.
FHA loans: Minimum credit score 580 for 3.5% down or 500 for 10% down, front-end DTI ≤ 31%, back-end DTI ≤ 50%, LTV ≤ 96.5%, upfront MIP (1.75%) + annual MIP required.
Both types: Lower LTV, higher income, lower DTI, and higher credit score improve approval odds.

Front-end DTI evaluation rules:
- ≤ 25%: Strong — well within guideline
- 25%–28%: Acceptable but approaching the limit; note as a minor concern
- > 28%: Exceeds the standard guideline — flag as a risk and reduce confidence meaningfully

Back-end DTI evaluation rules:
- ≤ 36%: Strong
- 36%–43%: Acceptable
- > 43%: Exceeds standard guideline — flag as a risk

Confidence scoring guide (0–100):
- 80–100: Clearly meets ALL guidelines, strong well-qualified profile
- 65–79: Meets guidelines but has one borderline factor (e.g. front-end DTI 25–28%)
- 50–64: Borderline — at least one guideline not met or multiple tight factors
- 0–49: Fails one or more key guidelines

Return ONLY valid JSON. No text outside the JSON object.`;

mortgageRouter.post('/predict-mortgage', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    res.status(401).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in server environment.' });
    return;
  }

  const body = req.body as {
    property_price?: number;
    loan_amount?: number;
    ltv?: number;
    annual_income?: number;
    monthly_debt?: number;
    front_end_dti?: number;
    back_end_dti?: number;
    credit_score_range?: string;
    loan_type?: string;
    down_payment_percent?: number;
  };

  const userPrompt = `Evaluate this mortgage application:

Property Price: $${(body.property_price ?? 0).toLocaleString()} | Loan Amount: $${(body.loan_amount ?? 0).toLocaleString()} | LTV: ${(body.ltv ?? 0).toFixed(1)}%
Annual Income: $${(body.annual_income ?? 0).toLocaleString()} | Monthly Debt Payments: $${(body.monthly_debt ?? 0).toLocaleString()}/mo
Front-end DTI: ${(body.front_end_dti ?? 0).toFixed(1)}% | Back-end DTI: ${(body.back_end_dti ?? 0).toFixed(1)}%
Credit Score: ${body.credit_score_range ?? 'unknown'} | Loan Type: ${(body.loan_type ?? 'conventional').toUpperCase()} | Down Payment: ${body.down_payment_percent ?? 20}%`;

  try {
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4',
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'mortgage_evaluation',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              confidence: {
                type: 'integer',
                description: 'Approval likelihood 0–100',
              },
              approved: {
                type: 'boolean',
                description: 'True if confidence >= 55',
              },
              message: {
                type: 'string',
                description: 'One sentence summary of the evaluation',
              },
              strengths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Up to 3 short strings describing positive factors',
              },
              risks: {
                type: 'array',
                items: { type: 'string' },
                description: 'Up to 3 short strings describing risk factors or concerns',
              },
            },
            required: ['confidence', 'approved', 'message', 'strengths', 'risks'],
            additionalProperties: false,
          },
        },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      res.status(502).json({ error: 'Empty response from AI model.' });
      return;
    }

    const parsed = JSON.parse(content) as {
      confidence: number;
      approved: boolean;
      message: string;
      strengths: string[];
      risks: string[];
    };

    // Clamp confidence and sync approved flag
    parsed.confidence = Math.min(100, Math.max(0, Math.round(parsed.confidence)));
    parsed.approved   = parsed.confidence >= 55;

    res.json(parsed);
  } catch (e) {
    console.error('AI mortgage prediction error:', e);
    const msg = e instanceof Error ? e.message : 'AI prediction failed';
    res.status(502).json({ error: msg });
  }
});
