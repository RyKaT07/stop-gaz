from __future__ import annotations

import asyncio
import json
import logging
import random
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import httpx
from asyncio_mqtt import Client, MqttError

logger = logging.getLogger(__name__)


class OutsideTemperaturePublisher:
    """Fetches outside temperature from Open-Meteo (or falls back) and publishes to MQTT."""

    def __init__(
        self,
        *,
        host: str,
        port: int,
        topic: str,
        api_base_url: str,
        latitude: float,
        longitude: float,
        timezone_name: str,
        interval_seconds: int,
        baseline: float,
        variation: float,
        user_agent: str | None = None,
        enabled: bool = True,
    ) -> None:
        self._host = host
        self._port = port
        self._topic = topic
        self._api_base_url = api_base_url
        self._latitude = latitude
        self._longitude = longitude
        self._timezone_name = timezone_name
        self._interval = max(60, interval_seconds)
        self._baseline = baseline
        self._variation = max(0.0, variation)
        self._user_agent = user_agent or "cieplarnia-aggregator"
        self._enabled = enabled
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    @property
    def enabled(self) -> bool:
        return self._enabled and bool(self._topic)

    async def start(self) -> None:
        if not self.enabled:
            logger.info("Outside temperature publisher disabled")
            return
        if self._task is None:
            logger.info(
                "Starting outside temperature publisher (topic=%s interval=%ss)",
                self._topic,
                self._interval,
            )
            self._stop.clear()
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._stop.set()
        await self._task
        self._task = None
        self._stop = asyncio.Event()

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                async with self._mqtt_client() as mqtt_client:
                    async with httpx.AsyncClient(
                        headers={"User-Agent": self._user_agent}, timeout=15
                    ) as http_client:
                        logger.info("Outside temperature publisher connected to MQTT broker")
                        while not self._stop.is_set():
                            measurement = await self._fetch_measurement(http_client)
                            await mqtt_client.publish(self._topic, json.dumps(measurement))
                            logger.debug(
                                "Published outside temperature %sC (%s)",
                                measurement.get("value"),
                                measurement.get("source"),
                            )
                            await self._wait_interval()
            except (MqttError, httpx.HTTPError) as exc:
                logger.warning("Outside temperature publisher connectivity error: %s", exc)
                await asyncio.sleep(5)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.exception("Unexpected outside temperature publisher error: %s", exc)
                await asyncio.sleep(5)

    async def _fetch_measurement(self, http_client: httpx.AsyncClient) -> dict[str, Any]:
        try:
            response = await http_client.get(
                self._api_base_url,
                params={
                    "latitude": self._latitude,
                    "longitude": self._longitude,
                    "current": "temperature_2m",
                    "timezone": self._timezone_name,
                },
            )
            response.raise_for_status()
            payload = response.json()
            current = payload.get("current")
            if not isinstance(current, dict):
                raise ValueError("Missing current block in weather API response")
            value = float(current["temperature_2m"])
            observed_at = current.get("time")
            return {
                "value": round(value, 2),
                "observed_at": observed_at or datetime.now(timezone.utc).isoformat(),
                "unit": "C",
                "source": "open-meteo",
            }
        except Exception as exc:
            logger.warning("Falling back to synthetic outside temp: %s", exc)
            fallback_value = self._generate_value()
            return {
                "value": round(fallback_value, 2),
                "observed_at": datetime.now(timezone.utc).isoformat(),
                "unit": "C",
                "source": "fallback",
            }

    async def _wait_interval(self) -> None:
        try:
            await asyncio.wait_for(self._stop.wait(), timeout=self._interval)
        except asyncio.TimeoutError:
            return

    def _generate_value(self) -> float:
        jitter = random.uniform(-self._variation, self._variation)
        return self._baseline + jitter

    @asynccontextmanager
    async def _mqtt_client(self):
        async with Client(hostname=self._host, port=self._port) as client:
            yield client
