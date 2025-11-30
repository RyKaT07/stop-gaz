'use client';

import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

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

  const fetchState = useCallback(async () => {
    if (!API_BASE) {
      setError('Brak konfiguracji API');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/window-state`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Błąd pobierania: ${res.status}`);
      }
      const body = (await res.json()) as WindowStateResponse;
      setData(body);
    } catch (err) {
      console.error('Failed to fetch window state', err);
      setError('Nie udało się odczytać stanu okna');
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (!API_BASE || isClosed === null || targetState === null) {
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch(`${API_BASE}/window-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: targetState }),
      });
      if (!res.ok) {
        throw new Error(`Błąd publikacji: ${res.status}`);
      }
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
        <Button onClick={handleToggle} disabled={isClosed === null || submitting || !API_BASE}>
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
