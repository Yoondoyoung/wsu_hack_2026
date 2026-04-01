import { useState } from 'react';
import { predictMortgage } from '../services/api';
import type { MortgageRequestPayload, MortgageResponse } from '../types/mortgage';
import { generateScenarios, type Scenario } from '../utils/mortgageScenarios';

export interface ScenarioResult {
  scenario: Scenario;
  response: MortgageResponse;
  delta: number; // confidence difference vs baseline
}

export function useMortgagePredictor() {
  const [result, setResult] = useState<MortgageResponse | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function predict(payload: MortgageRequestPayload) {
    setLoading(true);
    setError(null);
    setScenarios([]);
    try {
      const baseResult = await predictMortgage(payload);
      setResult(baseResult);

      const scenarioDefs = generateScenarios(payload);
      const scenarioResponses = await Promise.allSettled(
        scenarioDefs.map((s) => predictMortgage(s.payload))
      );

      const results: ScenarioResult[] = [];
      for (let i = 0; i < scenarioDefs.length; i++) {
        const outcome = scenarioResponses[i];
        if (outcome.status === 'fulfilled') {
          results.push({
            scenario: scenarioDefs[i],
            response: outcome.value,
            delta: outcome.value.confidence - baseResult.confidence,
          });
        }
      }
      results.sort((a, b) => b.delta - a.delta);
      setScenarios(results);
    } catch {
      setError('Failed to calculate approval probability. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return { result, scenarios, loading, error, predict };
}
