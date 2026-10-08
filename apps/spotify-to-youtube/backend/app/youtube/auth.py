"""Google device-code sign-in ("go to google.com/device and enter CODE") via ytmusicapi.

Tokens live only in server memory, keyed by an opaque browser-session id, and expire with it.
"""

import time
from dataclasses import dataclass, field

from ytmusicapi.auth.oauth import OAuthCredentials

from ..config import settings


class AuthNotConfigured(Exception):
    pass


@dataclass
class DeviceFlow:
    device_code: str
    user_code: str
    verification_url: str
    interval: int
    expires_at: float


@dataclass
class AuthState:
    flow: DeviceFlow | None = None
    token: dict | None = None
    touched: float = field(default_factory=time.time)


def credentials() -> OAuthCredentials:
    if not settings.save_enabled:
        raise AuthNotConfigured("Saving to YouTube needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.")
    return OAuthCredentials(settings.google_client_id, settings.google_client_secret)


def start_flow() -> DeviceFlow:
    code = credentials().get_code()
    return DeviceFlow(
        device_code=code["device_code"],
        user_code=code["user_code"],
        verification_url=code.get("verification_url") or code.get("verification_uri") or "https://www.google.com/device",
        interval=int(code.get("interval", 5)),
        expires_at=time.time() + int(code.get("expires_in", 1800)),
    )


def poll_flow(flow: DeviceFlow) -> tuple[str, dict | None]:
    """Returns ("authorized", token) | ("pending", None) | ("expired" | "denied", None)."""
    if time.time() > flow.expires_at:
        return "expired", None
    response = credentials().token_from_code(flow.device_code)
    if "access_token" in response:
        token = dict(response)
        token["expires_at"] = int(time.time()) + int(token.get("expires_in", 3600))
        return "authorized", token
    error = response.get("error")
    if error in ("authorization_pending", "slow_down"):
        return "pending", None
    if error == "access_denied":
        return "denied", None
    return "expired", None


class AuthStore:
    def __init__(self, ttl_s: int):
        self._ttl = ttl_s
        self._states: dict[str, AuthState] = {}

    def get(self, sid: str) -> AuthState:
        self._expire()
        state = self._states.setdefault(sid, AuthState())
        state.touched = time.time()
        return state

    def clear(self, sid: str) -> None:
        self._states.pop(sid, None)

    def _expire(self) -> None:
        cutoff = time.time() - self._ttl
        for sid in [s for s, st in self._states.items() if st.touched < cutoff]:
            del self._states[sid]
