import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import Database
from .message_parser import register_temperature_topic, set_window_state_topic
from .mqtt_consumer import MQTTConsumer
from .outside_temperature import OutsideTemperaturePublisher
from .schemas import Measurement, WindowCommand, WindowState
from .window_controller import WindowController

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()
db = Database(settings.database_url)
consumer = MQTTConsumer(
    db,
    host=settings.mqtt_broker_host,
    port=settings.mqtt_broker_port,
    topic=settings.mqtt_topic,
)

register_temperature_topic(
    settings.outside_temperature_topic,
    device_id="weather-service",
    metric="temperature_outside_ambient",
    unit="C",
)
set_window_state_topic(settings.window_state_topic)

outside_publisher = OutsideTemperaturePublisher(
    host=settings.mqtt_broker_host,
    port=settings.mqtt_broker_port,
    topic=settings.outside_temperature_topic,
    api_base_url=settings.outside_temperature_api_base_url,
    latitude=settings.outside_temperature_latitude,
    longitude=settings.outside_temperature_longitude,
    timezone_name=settings.outside_temperature_timezone,
    baseline=settings.outside_temperature_baseline,
    variation=settings.outside_temperature_variation,
    interval_seconds=settings.outside_temperature_interval_seconds,
    user_agent=settings.outside_temperature_user_agent,
    enabled=settings.outside_temperature_enabled,
)

window_controller = WindowController(
    host=settings.mqtt_broker_host,
    port=settings.mqtt_broker_port,
    topic=settings.window_command_topic,
)

app = FastAPI(title="Cieplarnia Aggregator", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event() -> None:
    logger.info("Connecting to database and starting MQTT consumer")
    await db.connect()
    await consumer.start()
    await outside_publisher.start()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    logger.info("Shutting down MQTT consumer")
    await consumer.stop()
    await outside_publisher.stop()
    await db.disconnect()


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/measurements", response_model=list[Measurement], tags=["measurements"])
async def get_measurements(limit: int | None = None, hours: int | None = None):
    rows = await db.fetch_recent(limit=limit, hours=hours)
    return rows


@app.get("/window-state", response_model=WindowState, tags=["window"])
async def get_window_state():
    latest = await db.fetch_latest("window-actuator", "window_closed")
    if latest is None:
        return WindowState(state=None, ts=None, payload=None)
    return WindowState(state=latest.get("value"), ts=latest.get("ts"), payload=latest.get("payload"))


@app.post("/window-state", response_model=WindowState, tags=["window"])
async def set_window_state(command: WindowCommand):
    if command.state not in (0, 1):
        raise HTTPException(status_code=400, detail="State must be 0 (open) or 1 (closed)")
    await window_controller.publish_state(command.state)
    latest = await db.fetch_latest("window-actuator", "window_closed")
    return WindowState(
        state=command.state,
        ts=latest.get("ts") if latest else None,
        payload=latest.get("payload") if latest else None,
    )
