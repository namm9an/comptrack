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

CREATE TABLE IF NOT EXISTS page_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    competitor_id   INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    page_type       TEXT    NOT NULL,
    url             TEXT    NOT NULL,
    content_hash    TEXT    NOT NULL,
    content_text    TEXT    NOT NULL,
    snapshot_date   TEXT    NOT NULL DEFAULT (date('now')),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_snapshots_comp_type
    ON page_snapshots(competitor_id, page_type);

CREATE TABLE IF NOT EXISTS job_postings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    competitor_id   INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    title           TEXT    NOT NULL,
    department      TEXT,
    location        TEXT,
    url             TEXT,
    first_seen      TEXT    NOT NULL,
    last_seen       TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'active'
                            CHECK(status IN ('active', 'removed'))
);
CREATE INDEX IF NOT EXISTS idx_job_postings_comp
    ON job_postings(competitor_id, status);

CREATE TABLE IF NOT EXISTS knowledge_base (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    competitor_id   INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    month           TEXT    NOT NULL,
    content_json    TEXT    NOT NULL,
    generated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    generated_by    TEXT    NOT NULL DEFAULT 'scheduler',
    UNIQUE(competitor_id, month)
);
CREATE INDEX IF NOT EXISTS idx_kb_comp_month ON knowledge_base(competitor_id, month);
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
        # Migrate: add new competitor URL columns if they don't exist yet
        for col in ("careers_url", "pricing_url", "product_url"):
            try:
                await _db.execute(f"ALTER TABLE competitors ADD COLUMN {col} TEXT")
            except Exception:
                pass  # column already exists
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
    """Insert a new competitor row and return the created record."""
    db = await get_db()
    cursor = await db.execute(
        """INSERT INTO competitors
           (name, category, website_url, twitter_handle, linkedin_url,
            careers_url, pricing_url, product_url, added_by)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            data["name"], data["category"], data.get("website_url"),
            data.get("twitter_handle"), data.get("linkedin_url"),
            data.get("careers_url"), data.get("pricing_url"), data.get("product_url"),
            data.get("added_by"),
        ),
    )
    await db.commit()
    return await get_competitor(cursor.lastrowid)


async def update_competitor(competitor_id: int, data: dict) -> Optional[dict]:
    """Update allowed fields on a competitor and return the updated record."""
    db = await get_db()
    fields = {k: v for k, v in data.items() if k in
              {"name", "category", "website_url", "twitter_handle", "linkedin_url",
               "careers_url", "pricing_url", "product_url", "active"}}
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


async def list_digests_by_job(job_run_id: int) -> list[dict]:
    """Return all digests for a job run, enriched with competitor_name."""
    db = await get_db()
    cursor = await db.execute(
        """SELECT d.*, c.name AS competitor_name
           FROM digests d
           JOIN competitors c ON d.competitor_id = c.id
           WHERE d.job_run_id = ?
           ORDER BY c.name""",
        (job_run_id,),
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
    """Delete a job run and all associated raw/digest records."""
    db = await get_db()
    await db.execute("DELETE FROM tracking_raw WHERE job_run_id=?", (job_run_id,))
    await db.execute("DELETE FROM digests WHERE job_run_id=?", (job_run_id,))
    cur = await db.execute("DELETE FROM job_runs WHERE id=?", (job_run_id,))
    await db.commit()
    return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Page snapshots
# ---------------------------------------------------------------------------

async def get_latest_page_snapshot(
    competitor_id: int, page_type: str
) -> Optional[dict]:
    """Return the most recent snapshot for a competitor page type, or None."""
    conn = await get_db()
    async with conn.execute(
        "SELECT * FROM page_snapshots "
        "WHERE competitor_id=? AND page_type=? "
        "ORDER BY created_at DESC LIMIT 1",
        (competitor_id, page_type),
    ) as cur:
        row = await cur.fetchone()
    return dict(row) if row else None


async def save_page_snapshot(
    competitor_id: int,
    page_type: str,
    url: str,
    content_hash: str,
    content_text: str,
) -> None:
    """Store a new page snapshot."""
    conn = await get_db()
    await conn.execute(
        "INSERT INTO page_snapshots"
        "(competitor_id, page_type, url, content_hash, content_text) "
        "VALUES (?, ?, ?, ?, ?)",
        (competitor_id, page_type, url, content_hash, content_text),
    )
    await conn.commit()


# ---------------------------------------------------------------------------
# Job postings
# ---------------------------------------------------------------------------

async def list_active_job_postings(competitor_id: int) -> list[dict]:
    """Return all active job postings for a competitor."""
    conn = await get_db()
    async with conn.execute(
        "SELECT * FROM job_postings "
        "WHERE competitor_id=? AND status='active' "
        "ORDER BY first_seen DESC",
        (competitor_id,),
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def list_job_postings(
    competitor_id: int, status: Optional[str] = None
) -> list[dict]:
    """Return job postings for a competitor, optionally filtered by status."""
    conn = await get_db()
    if status:
        async with conn.execute(
            "SELECT * FROM job_postings WHERE competitor_id=? AND status=? "
            "ORDER BY first_seen DESC",
            (competitor_id, status),
        ) as cur:
            rows = await cur.fetchall()
    else:
        async with conn.execute(
            "SELECT * FROM job_postings WHERE competitor_id=? "
            "ORDER BY first_seen DESC",
            (competitor_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def upsert_job_postings(
    competitor_id: int, postings: list[dict], today: str
) -> None:
    """Insert new postings or update last_seen on existing ones."""
    conn = await get_db()
    for p in postings:
        title = (p.get("title") or "").strip()
        if not title:
            continue
        async with conn.execute(
            "SELECT id FROM job_postings "
            "WHERE competitor_id=? AND title=? AND status='active'",
            (competitor_id, title),
        ) as cur:
            existing = await cur.fetchone()
        if existing:
            await conn.execute(
                "UPDATE job_postings "
                "SET last_seen=?, department=?, location=?, url=? "
                "WHERE id=?",
                (today, p.get("department"), p.get("location"), p.get("url"), existing["id"]),
            )
        else:
            await conn.execute(
                "INSERT INTO job_postings"
                "(competitor_id, title, department, location, url, first_seen, last_seen) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    competitor_id, title,
                    p.get("department"), p.get("location"), p.get("url"),
                    today, today,
                ),
            )
    await conn.commit()


async def mark_job_postings_removed(
    competitor_id: int, normalised_titles: list[str], today: str
) -> None:
    """Mark postings as removed when they disappear from the careers page."""
    if not normalised_titles:
        return
    conn = await get_db()
    for norm_title in normalised_titles:
        await conn.execute(
            "UPDATE job_postings "
            "SET status='removed', last_seen=? "
            "WHERE competitor_id=? AND lower(trim(title))=? AND status='active'",
            (today, competitor_id, norm_title),
        )
    await conn.commit()


# ---------------------------------------------------------------------------
# Reports helper
# ---------------------------------------------------------------------------

async def get_report_items(
    category: str = "all",
    competitor_id: Optional[int] = None,
    days: int = 30,
) -> list[dict]:
    """Return flat report items extracted from digests within the last `days` days.

    category accepts: "all" | "pr" | "newsletter" | "web" | "social"
    New digest format uses: pr, newsletter, web_activity, social_media.
    Backward-compat fallbacks handle old format fields: news_mentions,
    website_changes, product_moves, social_activity, key_people_activity.
    """
    conn = await get_db()
    if competitor_id is not None:
        cursor = await conn.execute(
            """SELECT d.digest_date, d.digest_json, d.period,
                      c.id AS competitor_id, c.name AS competitor_name, c.category AS competitor_category
               FROM digests d
               JOIN competitors c ON d.competitor_id = c.id
               WHERE d.competitor_id = ?
                 AND d.digest_date >= date('now', ? || ' days')
               ORDER BY d.digest_date DESC""",
            (competitor_id, f"-{days}"),
        )
    else:
        cursor = await conn.execute(
            """SELECT d.digest_date, d.digest_json, d.period,
                      c.id AS competitor_id, c.name AS competitor_name, c.category AS competitor_category
               FROM digests d
               JOIN competitors c ON d.competitor_id = c.id
               WHERE d.digest_date >= date('now', ? || ' days')
               ORDER BY d.digest_date DESC""",
            (f"-{days}",),
        )
    rows = await cursor.fetchall()

    items: list[dict] = []
    for row in rows:
        r = dict(row)
        content = json.loads(r["digest_json"])
        comp_id = r["competitor_id"]
        comp_name = r["competitor_name"]
        date_str = r["digest_date"]
        period = r["period"]

        comp_category = r.get("competitor_category", "")
        # Attach the first source URL from the digest so items are traceable
        digest_sources = content.get("sources") or []
        primary_source = digest_sources[0] if digest_sources else None

        def _item(cat: str, text: str) -> dict:
            return {
                "category": cat,
                "competitor_id": comp_id,
                "competitor_name": comp_name,
                "competitor_category": comp_category,
                "date": date_str,
                "content": text,
                "period": period,
                "source_url": primary_source,
            }

        if category in ("all", "pr"):
            # New format
            for item in content.get("pr") or []:
                if item:
                    items.append(_item("pr", item))
            # Backward compat: old format used news_mentions
            if not content.get("pr") and not content.get("newsletter"):
                for mention in content.get("news_mentions") or []:
                    if mention:
                        items.append(_item("pr", mention))

        if category in ("all", "newsletter"):
            for item in content.get("newsletter") or []:
                if item:
                    items.append(_item("newsletter", item))

        if category in ("all", "web"):
            # New format
            for item in content.get("web_activity") or []:
                if item:
                    items.append(_item("web", item))
            # Backward compat
            if not content.get("web_activity"):
                for change in content.get("website_changes") or []:
                    if isinstance(change, dict):
                        page = change.get("page", "")
                        summary = change.get("summary", "")
                        text = f"[{page}] {summary}" if page else summary
                        if text.strip():
                            items.append(_item("web", text))
                for move in content.get("product_moves") or []:
                    if move:
                        items.append(_item("web", move))

        if category in ("all", "social"):
            # New format
            for item in content.get("social_media") or []:
                if item:
                    items.append(_item("social", item))
            # Backward compat
            if not content.get("social_media"):
                social = content.get("social_activity") or ""
                if social and social != "No data available":
                    items.append(_item("social", social))
                for kpa in content.get("key_people_activity") or []:
                    if isinstance(kpa, dict):
                        person = kpa.get("person", "")
                        activity = kpa.get("activity", "")
                        if person and activity:
                            items.append(_item("social", f"{person}: {activity}"))

    # Already ordered by date DESC from the query; stable sort preserves that
    items.sort(key=lambda x: x["date"], reverse=True)
    return items


# ---------------------------------------------------------------------------
# Knowledge base
# ---------------------------------------------------------------------------

async def list_knowledge_base(competitor_id: Optional[int] = None) -> list[dict]:
    """Return all KB entries, optionally filtered by competitor, with competitor name and category."""
    conn = await get_db()
    if competitor_id is not None:
        cursor = await conn.execute(
            """SELECT kb.*, c.name AS competitor_name, c.category AS competitor_category
               FROM knowledge_base kb
               JOIN competitors c ON kb.competitor_id = c.id
               WHERE kb.competitor_id = ?
               ORDER BY kb.month DESC""",
            (competitor_id,),
        )
    else:
        cursor = await conn.execute(
            """SELECT kb.*, c.name AS competitor_name, c.category AS competitor_category
               FROM knowledge_base kb
               JOIN competitors c ON kb.competitor_id = c.id
               ORDER BY kb.month DESC, c.name"""
        )
    rows = await cursor.fetchall()
    result = []
    for row in rows:
        entry = dict(row)
        entry["content"] = json.loads(entry["content_json"])
        result.append(entry)
    return result


async def get_kb_entry(competitor_id: int, month: str) -> Optional[dict]:
    """Return the KB entry for a specific competitor and month, or None."""
    conn = await get_db()
    cursor = await conn.execute(
        """SELECT kb.*, c.name AS competitor_name
           FROM knowledge_base kb
           JOIN competitors c ON kb.competitor_id = c.id
           WHERE kb.competitor_id = ? AND kb.month = ?""",
        (competitor_id, month),
    )
    row = await cursor.fetchone()
    if not row:
        return None
    entry = dict(row)
    entry["content"] = json.loads(entry["content_json"])
    return entry


async def upsert_kb_entry(
    competitor_id: int, month: str, content_json: str, generated_by: str
) -> dict:
    """Insert or replace a KB entry and return it."""
    conn = await get_db()
    now = datetime.now(timezone.utc).isoformat()
    await conn.execute(
        """INSERT INTO knowledge_base (competitor_id, month, content_json, generated_at, generated_by)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(competitor_id, month) DO UPDATE SET
               content_json = excluded.content_json,
               generated_at = excluded.generated_at,
               generated_by = excluded.generated_by""",
        (competitor_id, month, content_json, now, generated_by),
    )
    await conn.commit()
    return await get_kb_entry(competitor_id, month)


async def delete_kb_entry(kb_id: int) -> bool:
    """Delete a KB entry by its primary key. Returns True if a row was deleted."""
    conn = await get_db()
    cursor = await conn.execute(
        "DELETE FROM knowledge_base WHERE id = ?", (kb_id,)
    )
    await conn.commit()
    return cursor.rowcount > 0


async def get_digests_for_month(competitor_id: int, month: str) -> list[dict]:
    """Return all digests for a competitor whose digest_date falls within month (YYYY-MM)."""
    conn = await get_db()
    cursor = await conn.execute(
        """SELECT * FROM digests
           WHERE competitor_id = ? AND digest_date LIKE ?
           ORDER BY digest_date""",
        (competitor_id, f"{month}%"),
    )
    rows = await cursor.fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["digest"] = json.loads(d["digest_json"])
        result.append(d)
    return result
