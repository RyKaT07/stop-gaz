import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import Database
from .mqtt_consumer import MQTTConsumer
from .schemas import Measurement

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


@app.on_event("shutdown")
async def shutdown_event() -> None:
    logger.info("Shutting down MQTT consumer")
    await consumer.stop()
    await db.disconnect()


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/measurements", response_model=list[Measurement], tags=["measurements"])
async def get_measurements(limit: int = 100):
    rows = await db.fetch_recent(limit=limit)
    return rows
