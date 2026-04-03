import { useState, useEffect } from 'react';
import { fetchProperties } from '../services/api';
import type { Property } from '../types/property';

export function useProperties(enabled = true) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchProperties()
      .then(setProperties)
      .catch(() => setError('Failed to load properties'))
      .finally(() => setLoading(false));
  }, [enabled]);

  return { properties, loading, error };
}
