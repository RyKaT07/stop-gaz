"""Utilities for converting MQTT topics/payloads into DB-friendly measurements."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import json

@dataclass(slots=True)
class ParsedMeasurement:
    device_id: str
    metric: str
    value: float
    payload: dict[str, Any] | None = None


_TEMPERATURE_TOPICS: dict[str, tuple[str, str, str]] = {
    "czujnik/okno/temperatura/wewn": ("window-sensor", "temperature_inside", "C"),
    "czujnik/okno/temperatura/zewn": ("window-sensor", "temperature_outside", "C"),
}
_WINDOW_STATE_TOPIC = "okno/zamkniete"


def _parse_temperature(topic: str, text_value: str) -> ParsedMeasurement | None:
    mapping = _TEMPERATURE_TOPICS.get(topic)
    if mapping is None:
        return None
    device_id, metric, unit = mapping
    value = float(text_value.replace(",", "."))
    payload = {
        "topic": topic,
        "unit": unit,
        "raw": text_value,
    }
    return ParsedMeasurement(device_id=device_id, metric=metric, value=value, payload=payload)


def _parse_window_state(text_value: str) -> ParsedMeasurement:
    normalized = text_value.strip().lower()
    truthy = {"1", "true", "zamkniete", "closed"}
    state = 1.0 if normalized in truthy else 0.0
    payload = {
        "topic": _WINDOW_STATE_TOPIC,
        "raw": text_value,
        "state": "closed" if state == 1.0 else "open",
    }
    return ParsedMeasurement(
        device_id="window-actuator",
        metric="window_closed",
        value=state,
        payload=payload,
    )


def parse_mqtt_message(topic: str, payload: bytes) -> ParsedMeasurement | None:
    """Try to interpret a raw MQTT message.

    Preference order:
    1. Known structured topics (window temperatures/state)
    2. JSON payloads containing device_id/metric/value
    """

    text_value = payload.decode("utf-8", errors="ignore").strip()

    if topic in _TEMPERATURE_TOPICS:
        try:
            return _parse_temperature(topic, text_value)
        except ValueError:
            return None

    if topic == _WINDOW_STATE_TOPIC:
        try:
            return _parse_window_state(text_value)
        except ValueError:
            return None

    try:
        data = json.loads(text_value)
    except json.JSONDecodeError:
        return None

    device_id = data.get("device_id", "unknown")
    metric = data.get("metric", topic)
    try:
        value = float(data.get("value"))
    except (TypeError, ValueError):
        return None

    payload_map = data if isinstance(data, dict) else None

    return ParsedMeasurement(device_id=device_id, metric=metric, value=value, payload=payload_map)
