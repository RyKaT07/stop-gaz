import json
from typing import Any

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
        payload_json = json.dumps(payload) if payload is not None else None
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO measurements (device_id, metric, value, payload)
                VALUES ($1, $2, $3, $4)
                """,
                device_id,
                metric,
                value,
                payload_json,
            )

    async def fetch_recent(self, *, limit: int | None = 100, hours: int | None = None):
        if self._pool is None:
            raise RuntimeError("Database pool not initialized")
        clauses: list[str] = []
        params: list[Any] = []
        if hours is not None and hours > 0:
            clauses.append(
                f"ts >= NOW() - (${len(params) + 1}::int || ' hours')::interval"
            )
            params.append(hours)

        query = [
            "SELECT id, device_id, metric, value, ts, payload",
            "FROM measurements",
        ]
        if clauses:
            query.append("WHERE " + " AND ".join(clauses))
        query.append("ORDER BY ts DESC")
        if limit is not None and limit > 0:
            query.append(f"LIMIT ${len(params) + 1}")
            params.append(limit)

        sql = "\n".join(query)
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)
        normalized = []
        for row in rows:
            row_dict = dict(row)
            payload = row_dict.get("payload")
            if isinstance(payload, str):
                try:
                    row_dict["payload"] = json.loads(payload)
                except json.JSONDecodeError:
                    row_dict["payload"] = None
            normalized.append(row_dict)
        return normalized

    async def fetch_latest(self, device_id: str, metric: str) -> dict[str, Any] | None:
        if self._pool is None:
            raise RuntimeError("Database pool not initialized")
        query = """
            SELECT id, device_id, metric, value, ts, payload
            FROM measurements
            WHERE device_id = $1 AND metric = $2
            ORDER BY ts DESC
            LIMIT 1
        """
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, device_id, metric)
        if row is None:
            return None
        row_dict = dict(row)
        payload = row_dict.get("payload")
        if isinstance(payload, str):
            try:
                row_dict["payload"] = json.loads(payload)
            except json.JSONDecodeError:
                row_dict["payload"] = None
        return row_dict
