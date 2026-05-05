# CompTrack

Competitor intelligence platform for E2E Networks. Tracks competitors across web, news, Twitter/X, and LinkedIn using scheduled crawl + LLM digest jobs.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, Python 3.12, aiosqlite (SQLite WAL) |
| Frontend | Next.js 15, React 19, Tailwind CSS v4 |
| Auth | Google OAuth 2.0, HTTP-only JWT cookies |
| Search | SearXNG (self-hosted) |
| Crawling | Crawl4AI + Playwright (Chromium) |
| LLM | Llama 3.3 70B primary, Qwen3 32B fallback (OpenAI-compatible) |
| Scheduler | APScheduler AsyncIOScheduler (IST timezone) |

---

## Project Structure

```
comptrack/
├── app/                    # FastAPI backend
│   ├── main.py
│   ├── config.py
│   ├── auth/               # Google OAuth, JWT helpers
│   ├── db/                 # aiosqlite schema + CRUD
│   ├── middleware/         # IP restriction
│   ├── models/             # Pydantic schemas
│   ├── routers/            # auth, competitors, jobs, admin
│   ├── scheduler/          # APScheduler jobs
│   └── services/           # search, crawl, LLM, tracker
├── frontend/               # Next.js app
│   └── src/
│       ├── app/            # App Router pages + API proxy routes
│       ├── components/
│       └── lib/            # API client, auth context
├── searxng/
│   └── settings.yml
├── Dockerfile              # Backend image
├── Dockerfile.frontend
├── docker-compose.yml
├── requirements.txt
└── .env.example
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values.

```
# Primary LLM
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=llama-3.3-70b-instruct
LLM_CONTEXT_WINDOW=32768
LLM_TEMPERATURE=0.3
LLM_MAX_TOKENS=2048

# Fallback LLM (Qwen3 32B — activated when primary fails all retries)
FALLBACK_LLM_BASE_URL=
FALLBACK_LLM_API_KEY=
FALLBACK_LLM_MODEL=qwen3_32b

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://<domain>/auth/google/callback
ALLOWED_EMAIL_DOMAIN=e2enetworks.com

# Admin role seeding (comma-separated, applied on first login)
ADMIN_EMAILS=

# JWT
SECRET_KEY=                          # generate: python -c "import secrets; print(secrets.token_hex(32))"

# Cookies
COOKIE_SECURE=true                   # set false for local dev

# SearXNG
SEARXNG_BASE_URL=http://searxng:8888
MAX_SEARCH_RESULTS=10

# IP restriction (leave empty to disable)
ALLOWED_IPS=

# Trusted reverse proxies for X-Forwarded-For (add frontend container IP after first docker-compose up)
TRUSTED_PROXIES=

# App
BACKEND_PORT=8081
FRONTEND_PORT=3001
FRONTEND_URL=https://<domain>
CORS_ORIGINS=https://<domain>
```

---

## Running

```bash
docker-compose up --build -d
```

Three services start on the `comptrack_net` bridge network:

| Container | Host port | Notes |
|---|---|---|
| `comptrack_searxng` | 8889 | Internal port 8888 |
| `comptrack_backend` | 8081 | FastAPI + Uvicorn |
| `comptrack_frontend` | 3001 | Next.js |

Port 8889 avoids collision with other SearXNG instances on the same host.

After first start, get the frontend container IP and set `TRUSTED_PROXIES`:

```bash
docker inspect comptrack_frontend | grep IPAddress
# add the IP to TRUSTED_PROXIES in .env
docker-compose restart backend
```

---

## Database

SQLite at `/app/data/comptrack.db` (WAL mode), persisted via `comptrack_data` Docker volume.

| Table | Purpose |
|---|---|
| `users` | email, name, picture, role, last_login |
| `competitors` | name, category, website_url, twitter_handle, linkedin_url |
| `tracked_individuals` | people monitored per competitor |
| `competitor_suggestions` | user-submitted suggestions with review status |
| `job_runs` | execution log with status, triggered_by, error |
| `tracking_raw` | raw crawl/search JSON per job run |
| `digests` | structured LLM digest JSON per competitor per period |
| `refresh_tokens` | SHA-256 hashed refresh tokens with expiry |

---

## Scheduled Jobs

| Job | Schedule (IST) | Scope |
|---|---|---|
| Daily | 07:00 every day | All active competitors |
| Weekly | Monday 08:00 | All active competitors (deeper search) |

APScheduler settings: `coalesce=True`, `misfire_grace_time=3600`, `max_instances=1`.

Jobs can also be triggered manually via the admin panel.

---

## LLM Failover

`llm_service.py` calls the primary endpoint with 3 retries (exponential backoff 2–30s). On exhaustion it falls back to the secondary endpoint with the same retry policy. Both endpoints must be OpenAI-compatible (`/chat/completions`). `<think>` blocks from reasoning models (Qwen3, DeepSeek) are stripped before returning.

---

## Auth Flow

1. `/auth/google` — builds Google OAuth URL, stores CSRF state in HttpOnly cookie (10 min TTL)
2. `/auth/google/callback` — validates state cookie, exchanges code, fetches user info
3. Domain check: only `@e2enetworks.com` emails allowed
4. Issues 15-min access token + 30-day refresh token, both as HttpOnly cookies
5. Refresh token stored as SHA-256 hash in DB; rotated on every use
6. `/auth/refresh` — issues new token pair and invalidates old refresh token
7. `/auth/logout` — revokes refresh token and clears both cookies (no valid access token required)

---

## API Proxy

All `/api/*` and `/auth/*` requests from the browser hit the Next.js server, which forwards them to `http://backend:8081`. The proxy strips all inbound forwarding headers (`x-forwarded-for`, `x-real-ip`, etc.) and sets a clean single-hop `X-Forwarded-For` from the browser IP to prevent spoofing.

---

## Local Development (without Docker)

**Backend:**
```bash
cd app
pip install -r ../requirements.txt
python -m playwright install chromium
cp ../.env.example ../.env   # fill in values
uvicorn main:app --reload --port 8081
```

**Frontend:**
```bash
cd frontend
npm install
INTERNAL_API_URL=http://localhost:8081 npm run dev
```

---

## Logs

```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f searxng
```
