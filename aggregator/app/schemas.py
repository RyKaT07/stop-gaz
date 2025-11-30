from datetime import datetime
from pydantic import BaseModel


class Measurement(BaseModel):
    id: int
    device_id: str
    metric: str
    value: float
    ts: datetime
    payload: dict | None = None
