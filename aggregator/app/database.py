import asyncpg


class Database:
    def __init__(self, dsn: str):
        self._dsn = dsn
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        if self._pool is None:
            self._pool = await asyncpg.create_pool(self._dsn, min_size=1, max_size=5)
            await self._create_schema()

    async def disconnect(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    async def _create_schema(self) -> None:
        if self._pool is None:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS measurements (
                    id BIGSERIAL PRIMARY KEY,
                    device_id TEXT NOT NULL,
                    metric TEXT NOT NULL,
                    value DOUBLE PRECISION NOT NULL,
                    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    payload JSONB
                );
                """
            )
            await conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_measurements_device_ts
                ON measurements (device_id, ts DESC);
                """
            )

    async def insert_measurement(self, device_id: str, metric: str, value: float, payload: dict | None) -> None:
        if self._pool is None:
            raise RuntimeError("Database pool not initialized")
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO measurements (device_id, metric, value, payload)
                VALUES ($1, $2, $3, $4)
                """,
                device_id,
                metric,
                value,
                payload,
            )

    async def fetch_recent(self, limit: int = 100):
        if self._pool is None:
            raise RuntimeError("Database pool not initialized")
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, device_id, metric, value, ts, payload
                FROM measurements
                ORDER BY ts DESC
                LIMIT $1
                """,
                limit,
            )
        return [dict(row) for row in rows]
