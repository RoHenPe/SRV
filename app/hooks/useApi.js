'use client';
import { useState, useCallback } from 'react';

/**
 * Hook para chamar API routes com autenticação, loading e error handling
 */
export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const call = useCallback(async (url, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('dashboard-token') : null;
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      };

      const res = await fetch(url, {
        ...options,
        headers,
      });

      if (res.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('dashboard-token');
          window.location.href = '/login';
        }
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erro desconhecido');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { call, loading, error };
}
