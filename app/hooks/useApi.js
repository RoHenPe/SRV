'use client';
import { useState, useCallback } from 'react';

export function sanitizeHeaderValue(value, fallback = 'Navegador Web') {
  const clean = String(value || '')
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || fallback;
}

export function getOrInitDeviceIdentity() {
  if (typeof window === 'undefined') {
    return { deviceId: 'server-ssr', deviceName: 'SSR' };
  }
  let deviceId = sanitizeHeaderValue(localStorage.getItem('srv-device-id'), '');
  if (!deviceId) {
    deviceId = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('srv-device-id', deviceId);
  }
  const storedName = localStorage.getItem('srv-device-name');
  let deviceName = storedName ? sanitizeHeaderValue(storedName, '') : '';
  if (!deviceName) {
    const ua = navigator.userAgent || '';
    const platform = /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Linux/i.test(ua)
      ? 'Linux'
      : /Windows/i.test(ua)
      ? 'Windows'
      : /Mac/i.test(ua)
      ? 'macOS'
      : 'Web';
    const browser = /Edg\//i.test(ua)
      ? 'Edge'
      : /Chrome\//i.test(ua)
      ? 'Chrome'
      : /Firefox\//i.test(ua)
      ? 'Firefox'
      : /Safari\//i.test(ua)
      ? 'Safari'
      : 'Browser';
    deviceName = `${platform} - ${browser} (${deviceId.slice(-4)})`;
    localStorage.setItem('srv-device-name', deviceName);
  } else if (storedName !== deviceName) {
    localStorage.setItem('srv-device-name', deviceName);
  }
  return { deviceId, deviceName };
}

/**
 * Hook para chamar API routes com autenticação, identificação por dispositivo, loading e error handling
 */
export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const call = useCallback(async (url, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? sanitizeHeaderValue(localStorage.getItem('dashboard-token'), '') : '';
      const { deviceId, deviceName } = getOrInitDeviceIdentity();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-device-id': sanitizeHeaderValue(deviceId, 'default-device'),
        'x-device-name': sanitizeHeaderValue(deviceName, 'Navegador Web'),
        ...(options.headers || {}),
      };

      const res = await fetch(url, {
        ...options,
        headers,
      });

      if (res.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('dashboard-token');
          localStorage.removeItem('srv-user-role');
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
