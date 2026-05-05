# CompTrack

Internal competitor intelligence platform for E2E Networks.
Monitors competitors across social, news, and web channels with daily and weekly scheduled jobs.

**Access:** Internal only — requires an @e2enetworks.com Google account.

---

## Stack

- **Backend:** FastAPI + Python 3.12, SQLite, APScheduler
- **Frontend:** Next.js 15, React 19, Tailwind CSS v4
- **Search:** SearXNG (self-hosted)
- **Crawling:** Crawl4AI
- **LLM:** Llama 3.3 70B via OpenAI-compatible TIR endpoint
- **Auth:** Google OAuth 2.0 (HTTP-only JWT cookies)

---

## Setup

### 1. Google OAuth credentials

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (type: Web application)
3. Add authorised redirect URI: `http://<VM-IP>:8081/auth/google/callback`
4. Copy the Client ID and Client Secret

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `http://<VM-IP>:8081/auth/google/callback` |
| `ADMIN_EMAIL` | First login from this email gets admin role |
| `SECRET_KEY` | Random string (32+ chars) for JWT signing |
| `LLM_BASE_URL` | TIR LLM endpoint (pre-filled) |
| `FRONTEND_URL` | `http://<VM-IP>:3001` |
| `CORS_ORIGINS` | `http://<VM-IP>:3001` |
| `ALLOWED_IPS` | Comma-separated client IPs to whitelist (leave empty to disable) |

### 3. Run

```bash
docker-compose up --build -d
```

Visit `http://<VM-IP>:3001` and sign in with Google.

### 4. First admin

The first `@e2enetworks.com` user whose email matches `ADMIN_EMAIL` in `.env` gets the `admin` role on first login. All other users get `user` role.

---

## Scheduled jobs

| Job | Schedule (IST) | What it does |
|---|---|---|
| Daily | Every day at 07:00 | Twitter/X, LinkedIn, website crawl for all active competitors |
| Weekly | Monday at 08:00 | Full news search + tracked individuals search |

Admins can trigger either job manually from the Admin panel or from a competitor's detail page.

---

## Ports

| Service | Host port | Internal port |
|---|---|---|
| SearXNG | 8889 | 8888 |
| Backend API | 8081 | 8081 |
| Frontend | 3001 | 3001 |

These ports are chosen to avoid collision with the Market Research Agent (backend: 8080, frontend: 3000, SearXNG: 8888).

---

## Isolation from Market Research Agent

CompTrack runs in a separate Docker Compose stack (`comptrack_net` network) with its own:
- SQLite database (`comptrack_data` volume)
- SearXNG instance (port 8889)
- Backend process (port 8081)
- Frontend process (port 3001)

No shared state with the Market Research Agent.

---

## Development (local, without Docker)

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python -m playwright install chromium
cp ../.env.example .env  # edit as needed
uvicorn main:app --reload --port 8081
```

**Frontend:**
```bash
cd frontend
npm install
INTERNAL_API_URL=http://localhost:8081 npm run dev
# Runs on port 3001
```

**SearXNG:** Run separately or use an existing instance.

---

## Logs

```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f searxng
```

---

## Troubleshooting

**LinkedIn data unavailable:** Expected. LinkedIn aggressively blocks crawlers. The UI shows "LinkedIn data unavailable" — this is graceful failure, not a bug.

**LLM timeout:** The TIR endpoint may be slow under load. The LLM service retries 3× with exponential backoff. If it consistently fails, check `http://164.52.194.136:8000/health`.

**SearXNG returns no results:** Check that the SearXNG container is healthy: `docker-compose ps`. The search engines (Google, Bing) may rate-limit the container's IP — results vary.

**Google OAuth redirect mismatch:** Ensure the redirect URI in `.env` exactly matches what you registered in Google Cloud Console, including the port.
