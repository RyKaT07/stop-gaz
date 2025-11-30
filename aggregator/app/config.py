from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    mqtt_broker_host: str = "mosquitto"
    mqtt_broker_port: int = 1883
    mqtt_topic: str = "#"
    outside_temperature_topic: str = "pogoda/temperatura/zewn"
    outside_temperature_enabled: bool = True
    outside_temperature_baseline: float = 18.0
    outside_temperature_variation: float = 2.5
    outside_temperature_interval_seconds: int = 300
    outside_temperature_api_base_url: str = "https://api.open-meteo.com/v1/forecast"
    outside_temperature_latitude: float = 52.2297
    outside_temperature_longitude: float = 21.0122
    outside_temperature_timezone: str = "Europe/Warsaw"
    outside_temperature_user_agent: str = "cieplarnia-aggregator"
    window_state_topic: str = "okno/stan"
    window_command_topic: str = "okno/zamknij"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    allowed_origins: str = "http://localhost:3000"
    healthcheck_topic: str = "$SYS/broker/version"

    class Config:
        env_prefix = ""
        case_sensitive = False

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
