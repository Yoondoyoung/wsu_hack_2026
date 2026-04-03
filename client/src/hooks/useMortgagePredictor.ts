import { useState } from 'react';
import { predictMortgage } from '../services/api';
import type { MortgageRequestPayload, MortgageResponse } from '../types/mortgage';

export function useMortgagePredictor() {
  const [result, setResult] = useState<MortgageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function predict(payload: MortgageRequestPayload) {
    setLoading(true);
    setError(null);
    try {
      const response = await predictMortgage(payload);
      setResult(response);
    } catch {
      setError('AI prediction failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return { result, loading, error, predict };
}
