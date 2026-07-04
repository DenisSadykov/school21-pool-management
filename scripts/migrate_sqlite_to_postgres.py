#!/usr/bin/env python3
import os
import sqlite3
from contextlib import closing

import psycopg2
from psycopg2 import sql


SOURCE_DB = os.environ.get("SOURCE_SQLITE_PATH", "backend/instance/pool.db")
TARGET_DB = os.environ.get("TARGET_DATABASE_URL")
BOOTSTRAP_SCHEMA = os.environ.get("BOOTSTRAP_SCHEMA", "true").lower() == "true"

TABLE_ORDER = [
    "app_settings",
    "users",
    "pools",
    "tribes",
    "pool_volunteers",
    "schedule_generations",
    "shift_blocks",
    "signups",
    "group_reviews",
    "reward_events",
    "student_penalties",
    "penalty_history",
    "students",
    "student_events",
    "tribe_events",
    "dashboard_notes",
    "broadcasts",
    "notification_events",
    "notification_deliveries",
    "telegram_accounts",
    "sync_outbox",
    "action_logs",
]


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def fetch_table_columns(sqlite_conn: sqlite3.Connection, table_name: str):
    rows = sqlite_conn.execute(f"PRAGMA table_info({quote_ident(table_name)})").fetchall()
    return [row[1] for row in rows]


def fetch_rows(sqlite_conn: sqlite3.Connection, table_name: str, columns: list[str]):
    query = f"SELECT {', '.join(quote_ident(col) for col in columns)} FROM {quote_ident(table_name)}"
    return sqlite_conn.execute(query).fetchall()


def postgres_table_columns(pg_conn, table_name: str):
    with pg_conn.cursor() as cur:
        cur.execute(
            """
            select column_name, data_type
            from information_schema.columns
            where table_schema = 'public' and table_name = %s
            order by ordinal_position
            """,
            (table_name,),
        )
        return [(row[0], row[1]) for row in cur.fetchall()]


def reset_table(pg_conn, table_name: str):
    with pg_conn.cursor() as cur:
      cur.execute(sql.SQL("TRUNCATE TABLE {} RESTART IDENTITY CASCADE").format(sql.Identifier(table_name)))


def insert_rows(pg_conn, table_name: str, columns: list[str], rows: list[tuple]):
    if not rows:
        return

    placeholders = sql.SQL(", ").join(sql.Placeholder() for _ in columns)
    column_list = sql.SQL(", ").join(sql.Identifier(col) for col in columns)
    statement = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
        sql.Identifier(table_name),
        column_list,
        placeholders,
    )

    with pg_conn.cursor() as cur:
        cur.executemany(statement.as_string(pg_conn), rows)


def convert_value(value, pg_type: str):
    if value is None:
        return None

    if pg_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "t", "yes", "y"}:
                return True
            if normalized in {"0", "false", "f", "no", "n"}:
                return False
    return value


def normalize_rows(rows: list[tuple], columns: list[str], pg_column_types: dict[str, str]):
    normalized = []
    for row in rows:
        normalized.append(
            tuple(convert_value(value, pg_column_types[column]) for column, value in zip(columns, row))
        )
    return normalized


def sync_sequence(pg_conn, table_name: str):
    with pg_conn.cursor() as cur:
        cur.execute(
            """
            select column_name
            from information_schema.columns
            where table_schema = 'public'
              and table_name = %s
              and column_default like 'nextval%%'
            limit 1
            """,
            (table_name,),
        )
        row = cur.fetchone()
        if not row:
            return

        id_column = row[0]
        cur.execute(
            sql.SQL(
                """
                select setval(
                  pg_get_serial_sequence(%s, %s),
                  coalesce((select max({id_col}) from {table}), 1),
                  (select count(*) > 0 from {table})
                )
                """
            ).format(
                id_col=sql.Identifier(id_column),
                table=sql.Identifier(table_name),
            ),
            (f"public.{table_name}", id_column),
        )


def main():
    if not TARGET_DB:
        raise SystemExit("TARGET_DATABASE_URL is required")
    if not os.path.exists(SOURCE_DB):
        raise SystemExit(f"SQLite source not found: {SOURCE_DB}")

    if BOOTSTRAP_SCHEMA:
        os.environ["DATABASE_URL"] = TARGET_DB
        from backend.app import app as flask_app  # pylint: disable=import-outside-toplevel

        with flask_app.app_context():
            pass

    with closing(sqlite3.connect(SOURCE_DB)) as sqlite_conn, closing(psycopg2.connect(TARGET_DB)) as pg_conn:
        sqlite_conn.row_factory = sqlite3.Row
        pg_conn.autocommit = False

        source_tables = {
            row[0]
            for row in sqlite_conn.execute(
                "select name from sqlite_master where type='table' and name not like 'sqlite_%'"
            ).fetchall()
        }

        copied = []
        for table_name in TABLE_ORDER:
            if table_name not in source_tables:
                continue

            sqlite_columns = fetch_table_columns(sqlite_conn, table_name)
            pg_columns = postgres_table_columns(pg_conn, table_name)
            pg_column_types = {column: data_type for column, data_type in pg_columns}
            shared_columns = [column for column in sqlite_columns if column in pg_column_types]
            rows = fetch_rows(sqlite_conn, table_name, shared_columns)
            rows = normalize_rows(rows, shared_columns, pg_column_types)

            reset_table(pg_conn, table_name)
            insert_rows(pg_conn, table_name, shared_columns, rows)
            sync_sequence(pg_conn, table_name)
            copied.append((table_name, len(rows)))

        pg_conn.commit()

    for table_name, row_count in copied:
        print(f"{table_name}: {row_count}")


if __name__ == "__main__":
    main()
