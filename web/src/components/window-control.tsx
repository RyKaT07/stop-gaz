'use client';

import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const API_ENDPOINT = "/api/window-state";
const LOCALHOST_ENDPOINT = "http://localhost:8000/window-state";

interface WindowStateResponse {
  state: number | null;
  ts: string | null;
  payload?: Record<string, unknown> | null;
}

export function WindowControl({ className }: { className?: string }) {
  const [data, setData] = useState<WindowStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestWindowState = useCallback(
    async (method: 'GET' | 'POST', body?: Record<string, unknown>) => {
      const fallback = typeof window !== 'undefined'
        ? `${window.location.protocol}//localhost:8000/window-state`
        : LOCALHOST_ENDPOINT;
      const endpoints = method === 'GET' ? [API_ENDPOINT, fallback] : [API_ENDPOINT, fallback];
      let lastError: unknown = null;

      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            method,
            cache: method === 'GET' ? 'no-store' : undefined,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          });
          if (!res.ok) {
            throw new Error(`Błąd pobierania: ${res.status}`);
          }
          return res;
        } catch (err) {
          lastError = err;
          console.warn(`Window state request failed for ${url}`, err);
        }
      }

      throw lastError ?? new Error('Nieznany błąd zapytania');
    },
    [],
  );

  const fetchState = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await requestWindowState('GET');
      const body = (await res.json()) as WindowStateResponse;
      setData(body);
    } catch (err) {
      console.error('Failed to fetch window state', err);
      setError('Nie udało się odczytać stanu okna');
    } finally {
      setLoading(false);
    }
  }, [requestWindowState]);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 15000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const isClosed = useMemo(() => {
    if (!data || data.state === null || data.state === undefined) {
      return null;
    }
    return data.state >= 0.5;
  }, [data]);

  const buttonLabel = isClosed === null ? 'Odczyt stanu…' : isClosed ? 'Otwórz okno' : 'Zamknij okno';
  const targetState = isClosed === null ? null : isClosed ? 0 : 1;

  const handleToggle = async () => {
    if (isClosed === null || targetState === null) {
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const res = await requestWindowState('POST', { state: targetState });
      await fetchState();
    } catch (err) {
      console.error('Failed to toggle window state', err);
      setError('Nie udało się wysłać polecenia');
    } finally {
      setSubmitting(false);
    }
  };

  const statusText = () => {
    if (error) {
      return error;
    }
    if (loading && !data) {
      return 'Ładowanie…';
    }
    if (isClosed === null) {
      return 'Brak odczytu z MQTT';
    }
    return isClosed ? 'Okno zamknięte (1)' : 'Okno otwarte (0)';
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-medium">Sterowanie oknem</CardTitle>
          <CardDescription className="flex items-center gap-2">
            {statusText()}
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={fetchState}
              disabled={loading || submitting}
            >
              <span className="sr-only">Odśwież stan</span>
              <RefreshCwIcon className="h-4 w-4" />
            </button>
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button onClick={handleToggle} disabled={isClosed === null || submitting}>
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Wysyłanie…
            </span>
          ) : (
            buttonLabel
          )}
        </Button>
        {data?.ts ? (
          <p className="text-sm text-muted-foreground">Aktualizacja: {new Date(data.ts).toLocaleTimeString('pl-PL')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
