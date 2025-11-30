"""Populate the measurements table with a rolling day of simulated data.

The ambient profile is derived from a fixed manual weather snapshot for Warsaw
shared by the user (29 November 2025). The window sensor measurements are
derived from that ambient data with different deltas depending on the simulated
window state (closed/open/leak). The script always rewrites the last 24 hours
ending "now" (rounded to the current hour).
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import asyncpg
SAMPLE_TEMPERATURES: tuple[tuple[int, float], ...] = (
    (20, -1.0),
    (21, -1.0),
    (20, -1.0),
    (20, 0.0),
    (21, 2.0),
    (20, 1.0),
    (22, 1.0),
    (21, 2.0),
    (23, 0.0),
)

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://cieplarnia:cieplarnia@timescaledb:5432/cieplarnia"
)
TIMEZONE_NAME = os.environ.get("OUTSIDE_TEMPERATURE_TIMEZONE", "Europe/Warsaw")
WINDOW_STATE_TOPIC = os.environ.get("WINDOW_STATE_TOPIC", "okno/stan")
TZ = ZoneInfo(TIMEZONE_NAME)


@dataclass(slots=True)
class Scenario:
    window_closed: float
    delta: float
    leak: bool


def determine_scenario(dt_local: datetime) -> Scenario:
    hour = dt_local.hour
    if 6 <= hour < 7 or 17 <= hour < 18:
        return Scenario(window_closed=0.0, delta=3.0, leak=False)
    if 22 <= hour < 23:
        return Scenario(window_closed=1.0, delta=2.0, leak=True)
    return Scenario(window_closed=1.0, delta=1.0, leak=False)


def sample_temperature_for_hour(hour: int) -> float:
    anchors = SAMPLE_TEMPERATURES
    if hour <= anchors[0][0]:
        return anchors[0][1]
    for idx in range(1, len(anchors)):
        prev_hour, prev_temp = anchors[idx - 1]
        next_hour, next_temp = anchors[idx]
        if hour == prev_hour:
            return prev_temp
        if hour <= next_hour:
            span = next_hour - prev_hour
            if span == 0:
                return prev_temp
            progress = (hour - prev_hour) / span
            return round(prev_temp + (next_temp - prev_temp) * progress, 2)
    return anchors[-1][1]


def build_sampled_weather(start_dt: datetime, end_dt: datetime) -> list[tuple[datetime, float]]:
    data: list[tuple[datetime, float]] = []
    current = start_dt
    while current < end_dt:
        temp = sample_temperature_for_hour(current.hour)
        data.append((current, temp))
        current += timedelta(hours=1)
    return data


def build_measurement_rows(data: list[tuple[datetime, float]]):
    rows: list[tuple[str, str, float, datetime, str]] = []
    for dt_local, ambient in data:
        scenario = determine_scenario(dt_local)
        dt_utc = dt_local.astimezone(timezone.utc)

        ambient_payload = {
            "unit": "C",
            "source": "manual-snapshot",
            "observed_at": dt_local.isoformat(),
        }
        rows.append(
            (
                "weather-service",
                "temperature_outside_ambient",
                round(ambient, 2),
                dt_utc,
                json.dumps(ambient_payload),
            )
        )

        outside_value = ambient + scenario.delta
        outside_payload = {
            "unit": "C",
            "source": "simulated",
            "ambient": round(ambient, 2),
            "delta": scenario.delta,
            "window_open": scenario.window_closed == 0.0,
            "leak_suspected": scenario.leak,
        }
        rows.append(
            (
                "window-sensor",
                "temperature_outside",
                round(outside_value, 2),
                dt_utc,
                json.dumps(outside_payload),
            )
        )

        inside_delta = 4.5 if scenario.window_closed == 1.0 else 2.2
        if scenario.leak:
            inside_delta -= 1.0
        inside_value = ambient + inside_delta
        inside_payload = {
            "unit": "C",
            "source": "simulated",
            "ambient": round(ambient, 2),
            "delta": round(inside_delta, 2),
            "leak_suspected": scenario.leak,
        }
        rows.append(
            (
                "window-sensor",
                "temperature_inside",
                round(inside_value, 2),
                dt_utc,
                json.dumps(inside_payload),
            )
        )

        window_payload = {
            "state": "closed" if scenario.window_closed == 1.0 else "open",
            "leak_suspected": scenario.leak,
            "simulated": True,
            "topic": WINDOW_STATE_TOPIC,
        }
        rows.append(
            (
                "window-actuator",
                "window_closed",
                scenario.window_closed,
                dt_utc,
                json.dumps(window_payload),
            )
        )
    return rows


async def insert_measurements(pool: asyncpg.Pool, rows: Iterable[tuple[str, str, float, datetime, str]]):
    query = """
        INSERT INTO measurements (device_id, metric, value, ts, payload)
        VALUES ($1, $2, $3, $4, $5::jsonb)
    """
    async with pool.acquire() as conn:
        await conn.executemany(query, list(rows))


async def main() -> None:
    now_local = datetime.now(TZ).replace(minute=0, second=0, microsecond=0)
    start_dt = now_local - timedelta(hours=24)
    weather_data = build_sampled_weather(start_dt, now_local)
    if not weather_data:
        raise RuntimeError("No weather data to insert")
    rows = build_measurement_rows(weather_data)
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
    try:
        async with pool.acquire() as conn:
            await conn.execute("TRUNCATE measurements;")
            print("Wiped existing measurements")
        await insert_measurements(pool, rows)
    finally:
        await pool.close()
    print(f"Inserted {len(rows)} measurements for {len(weather_data)} timestamps")


if __name__ == "__main__":
    asyncio.run(main())