"""
IP restriction middleware.

Decision (see docs/COMPTRACK_INTERNAL.md, Open Questions #1):
  Option A — configurable ALLOWED_IPS env var (comma-separated list).

X-Forwarded-For policy (fixes security review H1 / C4):
  XFF is only trusted when the direct TCP connection (request.client.host) comes
  from a TRUSTED_PROXIES address.  When a request arrives directly (client not in
  TRUSTED_PROXIES), request.client.host is used as-is — XFF cannot be spoofed.

  Docker Compose setup:
    - Frontend container is the only reverse proxy in this stack.
    - Add the frontend container's IP (or the Docker bridge gateway) to TRUSTED_PROXIES.
    - Example: TRUSTED_PROXIES=172.18.0.1,172.18.0.2

  Leave TRUSTED_PROXIES empty to disable XFF inspection entirely (safest for direct
  deployments where no proxy sits in front of the backend port).
"""

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from config import ALLOWED_IPS, TRUSTED_PROXIES

log = logging.getLogger(__name__)

# Paths exempt from IP restriction (Docker health checks, internal probes)
_EXEMPT_PATHS = {"/api/health"}


def _get_real_ip(request: Request) -> str:
    direct_ip = request.client.host if request.client else "unknown"

    if TRUSTED_PROXIES and direct_ip in TRUSTED_PROXIES:
        # Trust one XFF hop only — the first entry is the original client
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[0].strip()

    return direct_ip


class IPRestrictionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not ALLOWED_IPS:
            return await call_next(request)

        if request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        client_ip = _get_real_ip(request)

        if client_ip not in ALLOWED_IPS:
            log.warning("Blocked request from %s to %s (not in ALLOWED_IPS)", client_ip, request.url.path)
            return JSONResponse(
                status_code=403,
                content={"detail": "Access denied."},
            )

        return await call_next(request)
