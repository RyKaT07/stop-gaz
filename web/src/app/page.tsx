import { RefreshCwIcon } from "lucide-react";

import { MeasurementsDashboard } from "@/components/measurements-dashboard";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Measurement } from "@/lib/measurements";

const PUBLIC_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const INTERNAL_API_BASE = process.env.AGGREGATOR_API_BASE_URL ?? PUBLIC_API_BASE;

type NextFetchRequestInit = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};

async function getMeasurements(): Promise<Measurement[]> {
  const fetchOptions: NextFetchRequestInit = {
    next: { revalidate: 5 },
  };

  try {
    const params = new URLSearchParams({ hours: "24" });
    const res = await fetch(`${INTERNAL_API_BASE}/measurements?${params.toString()}`, fetchOptions);
    if (!res.ok) {
      return [];
    }
    return res.json();
  } catch (error) {
    console.error("Failed to fetch measurements", error);
    return [];
  }
}

export default async function HomePage() {
  const measurements = await getMeasurements();

  return (
    <main className="min-h-dvh bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <section className="relative mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-70 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.3),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(251,113,133,0.25),_transparent_65%)] dark:hidden" />
        <div className="pointer-events-none absolute inset-0 -z-10 hidden opacity-100 dark:block dark:bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(236,72,153,0.12),_transparent_65%)]" />
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase text-muted-foreground">Śledzenie wycieku ciepła</p>
            <h1 className="text-3xl font-semibold tracking-tight">ŁączyChmura</h1>
            <p className="text-muted-foreground">Dane monitorowane na żywo z czujników.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="gap-2" asChild>
              <a href={`${PUBLIC_API_BASE}/health`} target="_blank" rel="noreferrer">
                <RefreshCwIcon className="h-4 w-4" />
                API Health
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <MeasurementsDashboard measurements={measurements} />
      </section>
    </main>
  );
}
