import json
import logging
import aiosqlite
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from config import DB_PATH

log = logging.getLogger(__name__)

_db: Optional[aiosqlite.Connection] = None

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT    UNIQUE NOT NULL,
    name        TEXT    NOT NULL,
    picture     TEXT,
    role        TEXT    NOT NULL DEFAULT 'user'
                        CHECK(role IN ('user', 'admin')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login  TEXT
);

CREATE TABLE IF NOT EXISTS competitors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    category        TEXT    NOT NULL
                            CHECK(category IN ('e2e_cloud', 'tir')),
    website_url     TEXT,
    twitter_handle  TEXT,
    linkedin_url    TEXT,
    active          INTEGER NOT NULL DEFAULT 1,
    added_by        TEXT    REFERENCES users(email),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tracked_individuals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    competitor_id   INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    name            TEXT    NOT NULL,
    title           TEXT,
    twitter_handle  TEXT,
    linkedin_url    TEXT
);

CREATE TABLE IF NOT EXISTS competitor_suggestions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    suggested_by    TEXT    NOT NULL REFERENCES users(email),
    name            TEXT    NOT NULL,
    category        TEXT    NOT NULL,
    website_url     TEXT,
    notes           TEXT,
    status          TEXT    NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending', 'approved', 'rejected')),
    reviewed_by     TEXT    REFERENCES users(email),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    reviewed_at     TEXT
);

CREATE TABLE IF NOT EXISTS job_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    competitor_id   INTEGER REFERENCES competitors(id),
    job_type        TEXT    NOT NULL CHECK(job_type IN ('daily', 'weekly')),
    status          TEXT    NOT NULL DEFAULT 'queued'
                            CHECK(status IN ('queued', 'running', 'completed', 'failed')),
    triggered_by    TEXT,
    started_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT,
    error           TEXT
);

CREATE TABLE IF NOT EXISTS tracking_raw (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_run_id      INTEGER NOT NULL REFERENCES job_runs(id),
    competitor_id   INTEGER NOT NULL REFERENCES competitors(id),
    source_type     TEXT    NOT NULL,
    raw_json        TEXT    NOT NULL,
    collected_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS digests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_run_id      INTEGER NOT NULL REFERENCES job_runs(id),
    competitor_id   INTEGER NOT NULL REFERENCES competitors(id),
    period          TEXT    NOT NULL CHECK(period IN ('daily', 'weekly')),
    digest_date     TEXT    NOT NULL,
    digest_json     TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email  TEXT    NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    token_hash  TEXT    UNIQUE NOT NULL,
    expires_at  TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
"""

SEED_COMPETITORS = [
    ("CoreWeave", "e2e_cloud", "https://coreweave.com", "CoreWeave", "https://linkedin.com/company/coreweave"),
    ("Nebius", "e2e_cloud", "https://nebius.com", "nebius_ai", "https://linkedin.com/company/nebius"),
    ("Yotta / Shakti Cloud", "e2e_cloud", "https://yotta.com", "YottaDataCentre", "https://linkedin.com/company/yotta-infrastructure"),
    ("Lambda Labs", "e2e_cloud", "https://lambdalabs.com", "LambdaAPI", "https://linkedin.com/company/lambdalabs"),
    ("Rafay", "tir", "https://rafay.co", "RafaySystems", "https://linkedin.com/company/rafay-systems"),
    ("Mirantis", "tir", "https://mirantis.com", "mirantis", "https://linkedin.com/company/mirantis"),
    ("vCluster", "tir", "https://vcluster.com", "vcluster_io", "https://linkedin.com/company/loft-labs"),
]


async def get_db() -> aiosqlite.Connection:
    global _db
    if _db is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _db = await aiosqlite.connect(str(DB_PATH))
        _db.row_factory = aiosqlite.Row
        await _db.executescript(SCHEMA)
        await _db.commit()
        await _seed_competitors()
        log.info("Database initialised at %s", DB_PATH)
    return _db


async def close_db() -> None:
    global _db
    if _db:
        await _db.close()
        _db = None


async def _seed_competitors() -> None:
    db = await get_db()
    cursor = await db.execute("SELECT COUNT(*) FROM competitors")
    row = await cursor.fetchone()
    if row[0] > 0:
        return
    for name, cat, url, tw, li in SEED_COMPETITORS:
        await db.execute(
            "INSERT INTO competitors (name, category, website_url, twitter_handle, linkedin_url) VALUES (?,?,?,?,?)",
            (name, cat, url, tw, li),
        )
    await db.commit()
    log.info("Seeded %d default competitors", len(SEED_COMPETITORS))


# ---------------------------------------------------------------------------
# User CRUD
# ---------------------------------------------------------------------------

async def upsert_user(email: str, name: str, picture: str, role: str) -> dict:
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    existing = await get_user(email)
    if existing:
        await db.execute(
            "UPDATE users SET name=?, picture=?, last_login=? WHERE email=?",
            (name, picture, now, email),
        )
    else:
        await db.execute(
            "INSERT INTO users (email, name, picture, role, last_login) VALUES (?,?,?,?,?)",
            (email, name, picture, role, now),
        )
    await db.commit()
    return await get_user(email)


async def get_user(email: str) -> Optional[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM users WHERE email=?", (email,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def list_users() -> list[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM users ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def set_user_role(email: str, role: str) -> None:
    db = await get_db()
    await db.execute("UPDATE users SET role=? WHERE email=?", (role, email))
    await db.commit()


# ---------------------------------------------------------------------------
# Competitor CRUD
# ---------------------------------------------------------------------------

async def list_competitors(active_only: bool = True) -> list[dict]:
    db = await get_db()
    q = "SELECT * FROM competitors"
    if active_only:
        q += " WHERE active=1"
    q += " ORDER BY category, name"
    cursor = await db.execute(q)
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_competitor(competitor_id: int) -> Optional[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM competitors WHERE id=?", (competitor_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def create_competitor(data: dict) -> dict:
    db = await get_db()
    cursor = await db.execute(
        """INSERT INTO competitors
           (name, category, website_url, twitter_handle, linkedin_url, added_by)
           VALUES (?,?,?,?,?,?)""",
        (
            data["name"], data["category"], data.get("website_url"),
            data.get("twitter_handle"), data.get("linkedin_url"), data.get("added_by"),
        ),
    )
    await db.commit()
    return await get_competitor(cursor.lastrowid)


async def update_competitor(competitor_id: int, data: dict) -> Optional[dict]:
    db = await get_db()
    fields = {k: v for k, v in data.items() if k in
              {"name", "category", "website_url", "twitter_handle", "linkedin_url", "active"}}
    if not fields:
        return await get_competitor(competitor_id)
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [competitor_id]
    await db.execute(f"UPDATE competitors SET {sets} WHERE id=?", vals)
    await db.commit()
    return await get_competitor(competitor_id)


async def deactivate_competitor(competitor_id: int) -> None:
    db = await get_db()
    await db.execute("UPDATE competitors SET active=0 WHERE id=?", (competitor_id,))
    await db.commit()


# ---------------------------------------------------------------------------
# Tracked individuals
# ---------------------------------------------------------------------------

async def list_individuals(competitor_id: int) -> list[dict]:
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM tracked_individuals WHERE competitor_id=?", (competitor_id,)
    )
    return [dict(r) for r in await cursor.fetchall()]


async def add_individual(competitor_id: int, data: dict) -> dict:
    db = await get_db()
    cursor = await db.execute(
        "INSERT INTO tracked_individuals (competitor_id, name, title, twitter_handle, linkedin_url) VALUES (?,?,?,?,?)",
        (competitor_id, data["name"], data.get("title"), data.get("twitter_handle"), data.get("linkedin_url")),
    )
    await db.commit()
    c2 = await db.execute("SELECT * FROM tracked_individuals WHERE id=?", (cursor.lastrowid,))
    return dict(await c2.fetchone())


async def delete_individual(individual_id: int) -> None:
    db = await get_db()
    await db.execute("DELETE FROM tracked_individuals WHERE id=?", (individual_id,))
    await db.commit()


# ---------------------------------------------------------------------------
# Suggestions
# ---------------------------------------------------------------------------

async def create_suggestion(data: dict) -> dict:
    db = await get_db()
    cursor = await db.execute(
        "INSERT INTO competitor_suggestions (suggested_by, name, category, website_url, notes) VALUES (?,?,?,?,?)",
        (data["suggested_by"], data["name"], data["category"], data.get("website_url"), data.get("notes")),
    )
    await db.commit()
    c2 = await db.execute("SELECT * FROM competitor_suggestions WHERE id=?", (cursor.lastrowid,))
    return dict(await c2.fetchone())


async def list_suggestions(status: Optional[str] = None) -> list[dict]:
    db = await get_db()
    if status:
        cursor = await db.execute(
            "SELECT * FROM competitor_suggestions WHERE status=? ORDER BY created_at DESC", (status,)
        )
    else:
        cursor = await db.execute(
            "SELECT * FROM competitor_suggestions ORDER BY created_at DESC"
        )
    return [dict(r) for r in await cursor.fetchall()]


async def review_suggestion(suggestion_id: int, status: str, reviewed_by: str) -> Optional[dict]:
    db = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE competitor_suggestions SET status=?, reviewed_by=?, reviewed_at=? WHERE id=?",
        (status, reviewed_by, now, suggestion_id),
    )
    await db.commit()
    cursor = await db.execute("SELECT * FROM competitor_suggestions WHERE id=?", (suggestion_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Job runs
# ---------------------------------------------------------------------------

async def create_job_run(competitor_id: Optional[int], job_type: str, triggered_by: str) -> dict:
    db = await get_db()
    cursor = await db.execute(
        "INSERT INTO job_runs (competitor_id, job_type, status, triggered_by) VALUES (?,?,?,?)",
        (competitor_id, job_type, "queued", triggered_by),
    )
    await db.commit()
    return await get_job_run(cursor.lastrowid)


async def get_job_run(job_run_id: int) -> Optional[dict]:
    db = await get_db()
    cursor = await db.execute("SELECT * FROM job_runs WHERE id=?", (job_run_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


_JOB_RUN_ALLOWED_FIELDS = {"status", "completed_at", "error", "started_at"}


async def update_job_run(job_run_id: int, **kwargs) -> None:
    db = await get_db()
    fields = {k: v for k, v in kwargs.items() if k in _JOB_RUN_ALLOWED_FIELDS}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [job_run_id]
    await db.execute(f"UPDATE job_runs SET {sets} WHERE id=?", vals)
    await db.commit()


async def has_running_job(competitor_id: Optional[int], job_type: str) -> bool:
    db = await get_db()
    if competitor_id is None:
        cursor = await db.execute(
            "SELECT id FROM job_runs WHERE competitor_id IS NULL AND job_type=? AND status='running' LIMIT 1",
            (job_type,),
        )
    else:
        cursor = await db.execute(
            "SELECT id FROM job_runs WHERE competitor_id=? AND job_type=? AND status='running' LIMIT 1",
            (competitor_id, job_type),
        )
    return await cursor.fetchone() is not None


async def list_job_runs(competitor_id: Optional[int] = None, limit: int = 50) -> list[dict]:
    db = await get_db()
    if competitor_id is not None:
        cursor = await db.execute(
            "SELECT * FROM job_runs WHERE competitor_id=? ORDER BY started_at DESC LIMIT ?",
            (competitor_id, limit),
        )
    else:
        cursor = await db.execute(
            "SELECT * FROM job_runs ORDER BY started_at DESC LIMIT ?", (limit,)
        )
    return [dict(r) for r in await cursor.fetchall()]


# ---------------------------------------------------------------------------
# Raw tracking data
# ---------------------------------------------------------------------------

async def save_raw(job_run_id: int, competitor_id: int, source_type: str, data: dict) -> None:
    db = await get_db()
    await db.execute(
        "INSERT INTO tracking_raw (job_run_id, competitor_id, source_type, raw_json) VALUES (?,?,?,?)",
        (job_run_id, competitor_id, source_type, json.dumps(data)),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Digests
# ---------------------------------------------------------------------------

async def save_digest(job_run_id: int, competitor_id: int, period: str, digest_date: str, digest: dict) -> None:
    db = await get_db()
    await db.execute(
        "INSERT INTO digests (job_run_id, competitor_id, period, digest_date, digest_json) VALUES (?,?,?,?,?)",
        (job_run_id, competitor_id, period, digest_date, json.dumps(digest)),
    )
    await db.commit()


async def get_latest_digest(competitor_id: int) -> Optional[dict]:
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM digests WHERE competitor_id=? ORDER BY created_at DESC LIMIT 1",
        (competitor_id,),
    )
    row = await cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    d["digest"] = json.loads(d["digest_json"])
    return d


async def list_digests(competitor_id: int, limit: int = 20) -> list[dict]:
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM digests WHERE competitor_id=? ORDER BY created_at DESC LIMIT ?",
        (competitor_id, limit),
    )
    rows = await cursor.fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["digest"] = json.loads(d["digest_json"])
        result.append(d)
    return result


# ---------------------------------------------------------------------------
# Refresh tokens
# ---------------------------------------------------------------------------

async def save_refresh_token(user_email: str, token_hash: str, expires_at: str) -> None:
    db = await get_db()
    await db.execute(
        "INSERT INTO refresh_tokens (user_email, token_hash, expires_at) VALUES (?,?,?)",
        (user_email, token_hash, expires_at),
    )
    await db.commit()


async def get_refresh_token(token_hash: str) -> Optional[dict]:
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM refresh_tokens WHERE token_hash=?", (token_hash,)
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def delete_refresh_token(token_hash: str) -> None:
    db = await get_db()
    await db.execute("DELETE FROM refresh_tokens WHERE token_hash=?", (token_hash,))
    await db.commit()


async def delete_user_refresh_tokens(user_email: str) -> None:
    db = await get_db()
    await db.execute("DELETE FROM refresh_tokens WHERE user_email=?", (user_email,))
    await db.commit()


async def delete_job_run(job_run_id: int) -> bool:
    db = await get_db()
    await db.execute("DELETE FROM tracking_raw WHERE job_run_id=?", (job_run_id,))
    await db.execute("DELETE FROM digests WHERE job_run_id=?", (job_run_id,))
    cur = await db.execute("DELETE FROM job_runs WHERE id=?", (job_run_id,))
    await db.commit()
    return cur.rowcount > 0
