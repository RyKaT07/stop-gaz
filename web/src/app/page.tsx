import { ArrowDownIcon, ArrowUpIcon, RefreshCwIcon } from "lucide-react";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

interface Measurement {
  id: number;
  device_id: string;
  metric: string;
  value: number;
  ts: string;
  payload?: Record<string, unknown> | null;
}

type NextFetchRequestInit = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};

function formatUnit(payload: Measurement["payload"]): string {
  if (payload && typeof payload === "object" && "unit" in payload) {
    const unit = (payload as { unit?: unknown }).unit;
    return typeof unit === "string" ? unit : "";
  }
  return "";
}

async function getMeasurements(): Promise<Measurement[]> {
  const fetchOptions: NextFetchRequestInit = {
    next: { revalidate: 5 },
  };

  try {
    const res = await fetch(`${API_BASE}/measurements?limit=20`, fetchOptions);
    if (!res.ok) {
      return [];
    }
    return res.json();
  } catch (error) {
    console.error("Failed to fetch measurements", error);
    return [];
  }
}

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-background">
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase text-muted-foreground">Cieplarnia</p>
            <h1 className="text-3xl font-semibold tracking-tight">Śledzenie klimatu</h1>
            <p className="text-muted-foreground">Dane wprost z TimescaleDB poprzez agregator FastAPI.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="gap-2" asChild>
              <a href={`${API_BASE}/health`} target="_blank" rel="noreferrer">
                <RefreshCwIcon className="h-4 w-4" />
                API Health
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <Suspense fallback={<MeasurementsSkeleton />}>
          <MeasurementsList />
        </Suspense>
      </section>
    </main>
  );
}

async function MeasurementsList() {
  const measurements = await getMeasurements();

  if (!measurements.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Brak danych</CardTitle>
          <CardDescription>Wygląda na to, że nic jeszcze nie spływa z MQTT.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {measurements.map((item) => (
        <Card key={item.id}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-xl capitalize">{item.metric.replace("_", " ")}</CardTitle>
              <CardDescription>Urządzenie {item.device_id}</CardDescription>
            </div>
            <Badge variant={item.value >= 0 ? "default" : "outline"}>{new Date(item.ts).toLocaleTimeString()}</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">
              {item.value}
              <span className="text-base font-medium text-muted-foreground"> {formatUnit(item.payload)}</span>
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              {item.value >= 0 ? (
                <ArrowUpIcon className="h-4 w-4 text-emerald-500" />
              ) : (
                <ArrowDownIcon className="h-4 w-4 text-red-500" />
              )}
              Pełny payload: <code className="rounded bg-muted px-1 py-0.5">{JSON.stringify(item.payload ?? {})}</code>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MeasurementsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, idx) => (
        <Card key={idx} className="animate-pulse">
          <CardHeader>
            <div className="h-4 w-1/2 rounded bg-muted" />
            <div className="mt-2 h-4 w-1/3 rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-10 w-1/3 rounded bg-muted" />
            <div className="mt-4 h-4 w-full rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
