from datetime import datetime
from pydantic import BaseModel, Field


class Measurement(BaseModel):
    id: int
    device_id: str
    metric: str
    value: float
    ts: datetime
    payload: dict | None = None


class WindowState(BaseModel):
    state: float | None = Field(default=None, description="1 = zamknięte, 0 = otwarte")
    ts: datetime | None = None
    payload: dict | None = None


class WindowCommand(BaseModel):
    state: int = Field(ge=0, le=1)
