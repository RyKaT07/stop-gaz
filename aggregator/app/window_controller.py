import logging

from asyncio_mqtt import Client

logger = logging.getLogger(__name__)


class WindowController:
    """Simple helper that publishes desired window state to MQTT."""

    def __init__(self, *, host: str, port: int, topic: str):
        self._host = host
        self._port = port
        self._topic = topic

    async def publish_state(self, state: int) -> None:
        payload = b"1" if state >= 1 else b"0"
        logger.info("Publishing window state=%s to topic=%s", payload.decode(), self._topic)
        async with Client(hostname=self._host, port=self._port) as client:
            await client.publish(self._topic, payload, qos=1, retain=True)