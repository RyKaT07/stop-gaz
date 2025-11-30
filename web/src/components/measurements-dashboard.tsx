'use client';

import { Clock3Icon, ThermometerIcon, TrendingDownIcon } from "lucide-react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WindowControl } from "@/components/window-control";
import type { Measurement } from "@/lib/measurements";

interface MeasurementsDashboardProps {
  measurements: Measurement[];
}

interface TimelinePoint {
  ts: string;
  label: string;
  inside?: number;
  outside?: number;
  ambient?: number;
  windowClosed?: number;
}

interface TransformResult {
  temperatureSeries: TimelinePoint[];
  deltaSeries: { ts: string; label: string; delta: number }[];
  windowSeries: { ts: string; label: string; value: number }[];
  stats: {
    insideFluctuation: number;
    deltaAverage: number;
    openFraction: number;
    openMinutes: number;
  };
}

type LatestSamples = {
  inside?: Measurement;
  outside?: Measurement;
  ambient?: Measurement;
  windowClosed?: Measurement;
};

const timeFormatter = new Intl.DateTimeFormat('pl-PL', {
  hour: '2-digit',
  minute: '2-digit',
    timeZone: 'Europe/Warsaw',
});

const formatTimeLabel = (ts: string): string => timeFormatter.format(new Date(ts));

const computeAverageStepDiff = (values: number[]): number => {
  if (values.length < 2) {
    return 0;
  }
  let sum = 0;
  for (let i = 1; i < values.length; i += 1) {
    sum += Math.abs(values[i] - values[i - 1]);
  }
  return sum / (values.length - 1);
};

const transformMeasurements = (measurements: Measurement[]): TransformResult => {
  if (!measurements.length) {
    return {
      temperatureSeries: [],
      deltaSeries: [],
      windowSeries: [],
      stats: {
        insideFluctuation: 0,
        deltaAverage: 0,
        openFraction: 0,
        openMinutes: 0,
      },
    };
  }

  const sorted = [...measurements].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );
  const timeline = new Map<string, TimelinePoint>();
  const insideValues: number[] = [];
  const windowValues: number[] = [];

  for (const measurement of sorted) {
    const key = measurement.ts;
    let entry = timeline.get(key);
    if (!entry) {
      entry = { ts: key, label: formatTimeLabel(key) };
      timeline.set(key, entry);
    }

    switch (measurement.metric) {
      case 'temperature_inside':
        entry.inside = measurement.value;
        insideValues.push(measurement.value);
        break;
      case 'temperature_outside':
        entry.outside = measurement.value;
        break;
      case 'temperature_outside_ambient':
        entry.ambient = measurement.value;
        break;
      case 'window_closed':
        entry.windowClosed = measurement.value;
        windowValues.push(measurement.value);
        break;
      default:
        break;
    }
  }

  const points = Array.from(timeline.values());

  const temperatureSeries = points.filter(
    (point) => point.inside !== undefined || point.outside !== undefined || point.ambient !== undefined,
  );

  const deltaSeries = points
    .filter((point) => point.outside !== undefined && point.ambient !== undefined)
    .map((point) => ({
      ts: point.ts,
      label: point.label,
      delta: (point.outside ?? 0) - (point.ambient ?? 0),
    }));

  const windowSeries = points
    .filter((point) => point.windowClosed !== undefined)
    .map((point) => ({
      ts: point.ts,
      label: point.label,
      value: point.windowClosed ?? 0,
    }));

  const spanMinutes = (() => {
    if (sorted.length < 2) {
      return 0;
    }
    const start = new Date(sorted[0].ts).getTime();
    const end = new Date(sorted[sorted.length - 1].ts).getTime();
    return Math.max(0, (end - start) / 60000);
  })();

  const openFraction = windowValues.length
    ? 1 - windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length
    : 0;

  const openMinutes = spanMinutes ? openFraction * spanMinutes : openFraction * windowValues.length * 5;

  const deltaAverage = deltaSeries.length
    ? deltaSeries.reduce((sum, entry) => sum + Math.abs(entry.delta), 0) / deltaSeries.length
    : 0;

  return {
    temperatureSeries,
    deltaSeries,
    windowSeries,
    stats: {
      insideFluctuation: computeAverageStepDiff(insideValues),
      deltaAverage,
      openFraction,
      openMinutes,
    },
  };
};

const ChartTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-md border bg-background/95 px-3 py-2 text-xs shadow">
      <p className="font-medium">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((item) => (
          <li key={item.name} className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{item.name}</span>
            <span className="font-semibold">
              {item.value}
              {typeof item.value === 'number' ? ' °C' : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const WindowTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) {
    return null;
  }

  const value = payload[0]?.value ?? 0;
  const state = value === 1 ? 'Zamknięte' : 'Otwarte';

  return (
    <div className="rounded-md border bg-background/95 px-3 py-2 text-xs shadow">
      <p className="font-medium">{label}</p>
      <p className="mt-1">
        Okno: <span className="font-semibold">{state}</span>
      </p>
    </div>
  );
};

export function MeasurementsDashboard({ measurements }: MeasurementsDashboardProps) {
  const { temperatureSeries, deltaSeries, windowSeries, stats } = useMemo(
    () => transformMeasurements(measurements),
    [measurements],
  );

  const latestSamples = useMemo<LatestSamples>(() => {
    const newest = new Map<string, Measurement>();
    for (const measurement of measurements) {
      const previous = newest.get(measurement.metric);
      if (!previous || new Date(measurement.ts).getTime() > new Date(previous.ts).getTime()) {
        newest.set(measurement.metric, measurement);
      }
    }
    return {
      inside: newest.get('temperature_inside'),
      outside: newest.get('temperature_outside'),
      ambient: newest.get('temperature_outside_ambient'),
      windowClosed: newest.get('window_closed'),
    };
  }, [measurements]);

  const glassCard =
    "border border-slate-200/80 bg-white/70 text-slate-900 shadow-lg shadow-slate-900/5 backdrop-blur dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-black/30";

  if (!measurements.length) {
    return (
      <Card className={glassCard}>
        <CardHeader>
          <CardTitle>Brak danych</CardTitle>
          <CardDescription>Wygląda na to, że nic jeszcze nie spływa z MQTT.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const statCards = [
    {
      title: 'Średnia fluktuacja (wewnątrz)',
      value: `${stats.insideFluctuation.toFixed(2)} °C`,
      description: 'Średnia zmiana pomiędzy kolejnymi pomiarami wewnętrznymi.',
      icon: <ThermometerIcon className="h-7 w-7 text-orange-400" />,
    },
    {
      title: 'Średnia różnica okno (na zewnątrz) vs Warszawa',
      value: `${stats.deltaAverage.toFixed(2)} °C`,
      description: 'Im większa różnica tym większe ryzyko wycieku ciepła.',
      icon: <TrendingDownIcon className="h-7 w-7 text-sky-400" />,
    },
    {
      title: 'Okno otwarte (szacunek)',
      value: `${Math.round(stats.openMinutes)} min`,
      description: `~${Math.round(stats.openFraction * 100)}% zarejestrowanego czasu`,
      icon: <Clock3Icon className="h-7 w-7 text-emerald-400" />,
    },
  ];

  const formatTemperature = (value?: number) => {
    if (typeof value !== 'number') {
      return '—';
    }
    return `${value.toFixed(1)} °C`;
  };

  const formatUpdatedLabel = (measurement?: Measurement) => {
    if (!measurement) {
      return 'Brak odczytu';
    }
    return `Aktualizacja ${formatTimeLabel(measurement.ts)}`;
  };

  const windowStateValue = (() => {
    const measurement = latestSamples.windowClosed;
    if (!measurement) {
      return {
        label: '—',
        description: 'Brak odczytu',
        accent: 'text-muted-foreground',
      };
    }
    const isClosed = measurement.value >= 0.5;
    const leakSuspected = Boolean(
      measurement.payload && typeof measurement.payload === 'object'
        ? (measurement.payload as Record<string, unknown>).leak_suspected
        : false,
    );
    return {
      label: isClosed ? 'Zamknięte' : 'Otwarte',
      description: `${formatUpdatedLabel(measurement)}${leakSuspected ? ' • Możliwa nieszczelność' : ''}`,
      accent: isClosed ? 'text-emerald-500' : 'text-rose-500',
    };
  })();

  const currentCards = [
    {
      title: 'Wewnątrz (teraz)',
      value: formatTemperature(latestSamples.inside?.value),
      description: formatUpdatedLabel(latestSamples.inside),
    },
    {
      title: 'Przy oknie (zewn.)',
      value: formatTemperature(latestSamples.outside?.value),
      description: formatUpdatedLabel(latestSamples.outside),
    },
    {
      title: 'Warszawa (Open-Meteo)',
      value: formatTemperature(latestSamples.ambient?.value),
      description: formatUpdatedLabel(latestSamples.ambient),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={`${glassCard} lg:col-span-2`}>
          <CardHeader>
            <CardTitle>Temperatury wewnątrz i na zewnątrz</CardTitle>
            <CardDescription>Porównanie czujnika przy oknie oraz danych pogodowych dla Warszawy.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {temperatureSeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={temperatureSeries} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis unit="°C" tick={{ fontSize: 12 }} width={50} />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="inside" name="Wewnątrz" stroke="#ea580c" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="outside" name="Na zewnątrz (okno)" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ambient" name="Warszawa" stroke="#6366f1" strokeDasharray="6 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Brak danych temperaturowych.</p>
            )}
          </CardContent>
        </Card>

        <Card className={glassCard}>
          <CardHeader>
            <CardTitle>Różnica temp. okno (na zewnątrz) vs Warszawa</CardTitle>
            <CardDescription>Dodatnie wartości oznaczają cieplej przy oknie niż na zewnątrz.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {deltaSeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={deltaSeries} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="deltaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis unit="°C" tick={{ fontSize: 12 }} width={50} />
                  <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 2" />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="delta" stroke="#0ea5e9" fill="url(#deltaGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Brak danych do obliczenia różnicy.</p>
            )}
          </CardContent>
        </Card>

        <Card className={glassCard}>
          <CardHeader>
            <CardTitle>Status okna</CardTitle>
            <CardDescription>Góra = zamknięte, dół = otwarte.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {windowSeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={windowSeries} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="windowGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis
                    ticks={[0, 1]}
                    domain={[0, 1]}
                    width={60}
                    tickFormatter={(value) => (value >= 0.5 ? 'Zamknięte' : 'Otwarte')}
                  />
                  <RechartsTooltip content={<WindowTooltip />} />
                  <Area type="stepAfter" dataKey="value" stroke="#10b981" fill="url(#windowGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Brak danych o stanie okna.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.title} className={glassCard}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base font-medium">{stat.title}</CardTitle>
                <CardDescription>{stat.description}</CardDescription>
              </div>
              {stat.icon}
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {currentCards.map((card) => (
          <Card key={card.title} className={glassCard}>
            <CardHeader>
              <CardTitle className="text-base font-medium">{card.title}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
        <Card className={glassCard}>
          <CardHeader>
            <CardTitle className="text-base font-medium">Status okna</CardTitle>
            <CardDescription>{windowStateValue.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${windowStateValue.accent}`}>{windowStateValue.label}</p>
          </CardContent>
        </Card>
          <WindowControl className={glassCard} />
      </div>
    </div>
  );
}
