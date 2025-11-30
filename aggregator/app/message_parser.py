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
_WINDOW_STATE_TOPIC = "okno/stan"


def set_window_state_topic(topic: str) -> None:
    global _WINDOW_STATE_TOPIC
    normalized = topic.strip()
    if normalized:
        _WINDOW_STATE_TOPIC = normalized


def _parse_temperature(topic: str, text_value: str) -> ParsedMeasurement | None:
    mapping = _TEMPERATURE_TOPICS.get(topic)
    if mapping is None:
        return None
    device_id, metric, unit = mapping
    payload: dict[str, Any] = {
        "topic": topic,
        "unit": unit,
    }

    parsed_value: Any = text_value
    try:
        json_value = json.loads(text_value)
        if isinstance(json_value, dict):
            parsed_value = json_value.get("value", text_value)
            payload["raw"] = json_value
            if "observed_at" in json_value:
                payload["observed_at"] = json_value["observed_at"]
            if "source" in json_value:
                payload["source"] = json_value["source"]
        else:
            payload["raw"] = text_value
    except json.JSONDecodeError:
        payload["raw"] = text_value

    value = float(str(parsed_value).replace(",", "."))
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


def register_temperature_topic(topic: str, *, device_id: str, metric: str, unit: str = "C") -> None:
    """Allow runtime registration of additional temperature topics."""

    normalized_topic = topic.strip()
    if not normalized_topic:
        return
    _TEMPERATURE_TOPICS[normalized_topic] = (device_id, metric, unit)


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

    if not isinstance(data, dict):
        return None

    device_id = data.get("device_id", "unknown")
    metric = data.get("metric", topic)
    try:
        value = float(data.get("value"))
    except (TypeError, ValueError):
        return None

    payload_map = data if isinstance(data, dict) else None

    return ParsedMeasurement(device_id=device_id, metric=metric, value=value, payload=payload_map)
