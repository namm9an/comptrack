import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Paths
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "comptrack.db"

# Primary LLM — Llama 3.3 70B on TIR A40
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "").rstrip("/")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-instruct")
LLM_CONTEXT_WINDOW = int(os.getenv("LLM_CONTEXT_WINDOW", "32768"))
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.3"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "2048"))

# Fallback LLM — Qwen3 32B on TIR (activated when primary fails)
# Set FALLBACK_LLM_BASE_URL + FALLBACK_LLM_API_KEY to enable.
FALLBACK_LLM_BASE_URL = os.getenv("FALLBACK_LLM_BASE_URL", "").rstrip("/")
FALLBACK_LLM_API_KEY = os.getenv("FALLBACK_LLM_API_KEY", "")
FALLBACK_LLM_MODEL = os.getenv("FALLBACK_LLM_MODEL", "qwen3_32b")
FALLBACK_LLM_ENABLED = bool(FALLBACK_LLM_BASE_URL and FALLBACK_LLM_API_KEY)

# Google OAuth
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8081/auth/google/callback"
)
ALLOWED_EMAIL_DOMAIN = os.getenv("ALLOWED_EMAIL_DOMAIN", "e2enetworks.com")

# Admin seeding — comma-separated list of emails that get admin role on first login
# Supports both ADMIN_EMAILS (preferred) and legacy ADMIN_EMAIL
_admin_raw = os.getenv("ADMIN_EMAILS", os.getenv("ADMIN_EMAIL", ""))
ADMIN_EMAILS: list[str] = [e.strip().lower() for e in _admin_raw.split(",") if e.strip()]

# JWT — must be set; refuse to start with a blank or default value
SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY environment variable must be set to a strong random value. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

# Cookies
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

# SearXNG
SEARXNG_BASE_URL = os.getenv("SEARXNG_BASE_URL", "http://searxng:8888")
MAX_SEARCH_RESULTS = int(os.getenv("MAX_SEARCH_RESULTS", "10"))

# IP restriction
# Comma-separated list of allowed client IPs. Leave empty or set to "*" to disable.
# Example: ALLOWED_IPS=203.0.113.10,198.51.100.5
ALLOWED_IPS_RAW = os.getenv("ALLOWED_IPS", "")
ALLOWED_IPS: list[str] = (
    []
    if not ALLOWED_IPS_RAW or ALLOWED_IPS_RAW.strip() == "*"
    else [ip.strip() for ip in ALLOWED_IPS_RAW.split(",") if ip.strip()]
)

# Trusted reverse proxies — X-Forwarded-For is only honoured when the direct
# connection comes from one of these IPs (e.g. Docker bridge, Nginx container).
# Leave empty to disable XFF inspection and use request.client.host directly.
# Example: TRUSTED_PROXIES=172.18.0.1,127.0.0.1
TRUSTED_PROXIES_RAW = os.getenv("TRUSTED_PROXIES", "")
TRUSTED_PROXIES: list[str] = (
    [ip.strip() for ip in TRUSTED_PROXIES_RAW.split(",") if ip.strip()]
    if TRUSTED_PROXIES_RAW
    else []
)

# Frontend URL (for OAuth redirect after login)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3001")

# CORS
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3001").split(",")
    if origin.strip()
]
if "*" in CORS_ORIGINS:
    raise RuntimeError(
        "CORS_ORIGINS cannot contain '*' when credentials are enabled. "
        "Specify exact origins instead."
    )

# App
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8081"))
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

# Scheduler timezone
SCHEDULER_TIMEZONE = "Asia/Kolkata"
