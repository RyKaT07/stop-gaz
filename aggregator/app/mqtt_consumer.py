import asyncio
import logging
from contextlib import asynccontextmanager

from asyncio_mqtt import Client, MqttError

from .database import Database
from .message_parser import ParsedMeasurement, parse_mqtt_message

logger = logging.getLogger(__name__)


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
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            await self._task
            self._task = None

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                async with self._client() as client:
                    await client.subscribe(self._topic)
                    async with client.messages() as messages:
                        async for message in messages:
                            if self._stop.is_set():
                                break
                            await self._handle_message(message.topic, message.payload)
            except MqttError as exc:
                logger.warning("MQTT connection lost: %s", exc)
                await asyncio.sleep(5)

    @asynccontextmanager
    async def _client(self):
        async with Client(hostname=self._host, port=self._port) as client:
            yield client

    async def _handle_message(self, topic: str, payload: bytes) -> None:
        parsed: ParsedMeasurement | None = parse_mqtt_message(topic, payload)
        if parsed is None:
            logger.warning("Unable to parse MQTT payload for topic %s", topic)
            return

        await self._db.insert_measurement(
            device_id=parsed.device_id,
            metric=parsed.metric,
            value=parsed.value,
            payload=parsed.payload,
        )
