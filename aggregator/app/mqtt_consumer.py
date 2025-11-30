import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

from asyncio_mqtt import Client, MqttError

from .database import Database
from .message_parser import ParsedMeasurement, parse_mqtt_message

logger = logging.getLogger(__name__)


def _topic_to_str(topic: Any) -> str:
    if isinstance(topic, str):
        return topic
    value = getattr(topic, "value", None)
    if isinstance(value, str):
        return value
    return str(topic)


class MQTTConsumer:
    def __init__(self, db: Database, *, host: str, port: int, topic: str):
        self._db = db
        self._host = host
        self._port = port
        self._topic = topic
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        if self._task is None:
            logger.info(
                "Starting MQTT consumer task (host=%s port=%s topic=%s)",
                self._host,
                self._port,
                self._topic,
            )
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            await self._task
            self._task = None

    async def _run(self) -> None:
        logger.info("MQTT consumer loop running")
        while not self._stop.is_set():
            try:
                logger.debug("Connecting to MQTT broker at %s:%s", self._host, self._port)
                async with self._client() as client:
                    logger.info("Connected to MQTT broker, subscribing to %s", self._topic)
                    await client.subscribe(self._topic)
                    async with client.messages() as messages:
                        async for message in messages:
                            if self._stop.is_set():
                                break
                            await self._handle_message(message.topic, message.payload)
            except MqttError as exc:
                logger.warning("MQTT connection lost: %s", exc)
                await asyncio.sleep(5)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.exception("Unexpected MQTT consumer error: %s", exc)
                await asyncio.sleep(5)

    @asynccontextmanager
    async def _client(self):
        async with Client(hostname=self._host, port=self._port) as client:
            yield client

    async def _handle_message(self, topic: str, payload: bytes) -> None:
        topic_value = _topic_to_str(topic)
        logger.debug("MQTT message received topic=%r payload=%r", topic_value, payload)
        parsed: ParsedMeasurement | None = parse_mqtt_message(topic_value, payload)
        if parsed is None:
            logger.warning("Unable to parse MQTT payload for topic %r payload=%r", topic_value, payload)
            return

        await self._db.insert_measurement(
            device_id=parsed.device_id,
            metric=parsed.metric,
            value=parsed.value,
            payload=parsed.payload,
        )
        logger.info(
            "Stored measurement device=%s metric=%s value=%s", parsed.device_id, parsed.metric, parsed.value
        )
