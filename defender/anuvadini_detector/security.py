"""
Anuvadini Detector - Security helpers
- PBKDF2 password hashing (with transparent upgrade of legacy plaintext passwords)
- Login throttling / lockout (brute-force protection)
- Admin console authentication: the admin PC (loopback) is trusted; anyone else needs the admin password.
"""
import base64
import hashlib
import hmac
import os
import secrets
import threading
import time

from anuvadini_detector.config import DATA_DIR

# ----------------------------------------------------------------------------
# Password hashing
# ----------------------------------------------------------------------------
_ALGO = "pbkdf2_sha256"
_ITERATIONS = 200_000


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), salt, _ITERATIONS)
    return f"{_ALGO}${_ITERATIONS}${_b64(salt)}${_b64(digest)}"


def is_hashed(stored) -> bool:
    return isinstance(stored, str) and stored.startswith(_ALGO + "$")


def verify_password(password: str, stored) -> bool:
    """Constant-time check. Legacy plaintext values are still accepted so existing accounts keep working."""
    if not isinstance(stored, str) or stored == "":
        return False
    password = str(password)
    if is_hashed(stored):
        try:
            _, iters, salt_b64, hash_b64 = stored.split("$")
            digest = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), base64.b64decode(salt_b64), int(iters)
            )
            return hmac.compare_digest(digest, base64.b64decode(hash_b64))
        except Exception:
            return False
    return hmac.compare_digest(stored.encode("utf-8"), password.encode("utf-8"))


# ----------------------------------------------------------------------------
# Login throttling
# ----------------------------------------------------------------------------
class LoginThrottle:
    """Locks a key (ip|account) for `lock_seconds` after `max_fails` failures inside `window_seconds`."""

    def __init__(self, max_fails: int = 5, window_seconds: int = 900, lock_seconds: int = 900):
        self.max_fails = max_fails
        self.window = window_seconds
        self.lock_seconds = lock_seconds
        self._fails: dict[str, list[float]] = {}
        self._locked_until: dict[str, float] = {}
        self._mutex = threading.Lock()

    def retry_after(self, key: str) -> int:
        """Seconds the key is still locked (0 = allowed)."""
        with self._mutex:
            until = self._locked_until.get(key, 0.0)
            remaining = until - time.time()
            if remaining <= 0:
                self._locked_until.pop(key, None)
                return 0
            return int(remaining) + 1

    def record_failure(self, key: str) -> None:
        now = time.time()
        with self._mutex:
            hits = [t for t in self._fails.get(key, []) if now - t < self.window]
            hits.append(now)
            self._fails[key] = hits
            if len(hits) >= self.max_fails:
                self._locked_until[key] = now + self.lock_seconds
                self._fails.pop(key, None)

    def record_success(self, key: str) -> None:
        with self._mutex:
            self._fails.pop(key, None)
            self._locked_until.pop(key, None)


employee_login_throttle = LoginThrottle(max_fails=5)      # per (ip, employee id)
employee_ip_throttle = LoginThrottle(max_fails=30)        # per ip, across all ids (credential stuffing)
admin_login_throttle = LoginThrottle(max_fails=5)


# ----------------------------------------------------------------------------
# Admin console authentication
# ----------------------------------------------------------------------------
ADMIN_PASSWORD_FILE = DATA_DIR / "admin_password.txt"
ADMIN_COOKIE = "anuvadini_admin"
_SESSION_TTL = 12 * 3600
_sessions: dict[str, float] = {}
_session_mutex = threading.Lock()


def get_admin_password() -> str:
    """Admin password from ANUVADINI_ADMIN_PASSWORD, else from data/admin_password.txt (generated on first use)."""
    env = os.environ.get("ANUVADINI_ADMIN_PASSWORD")
    if env:
        return env
    try:
        if ADMIN_PASSWORD_FILE.exists():
            text = ADMIN_PASSWORD_FILE.read_text(encoding="utf-8").strip()
            if text:
                return text
        generated = secrets.token_urlsafe(12)
        ADMIN_PASSWORD_FILE.write_text(generated + "\n", encoding="utf-8")
        return generated
    except Exception:
        # If the file cannot be written, fall back to a per-process random secret (remote admin login disabled in practice)
        return _PROCESS_SECRET


_PROCESS_SECRET = secrets.token_urlsafe(24)


def verify_admin_password(password: str) -> bool:
    return hmac.compare_digest(str(password).encode("utf-8"), get_admin_password().encode("utf-8"))


def create_admin_session() -> str:
    token = secrets.token_urlsafe(32)
    with _session_mutex:
        now = time.time()
        for t in [t for t, exp in _sessions.items() if exp < now]:
            _sessions.pop(t, None)
        _sessions[token] = now + _SESSION_TTL
    return token


def valid_admin_session(token: str | None) -> bool:
    if not token:
        return False
    with _session_mutex:
        exp = _sessions.get(token)
        if exp is None:
            return False
        if exp < time.time():
            _sessions.pop(token, None)
            return False
        return True


def end_admin_session(token: str | None) -> None:
    with _session_mutex:
        _sessions.pop(token or "", None)


_LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}
_LOOPBACK_HOST_HEADERS = {"127.0.0.1", "localhost", "[::1]", "::1"}


def _host_only(host_header: str) -> str:
    host_header = (host_header or "").strip().lower()
    if host_header.startswith("["):  # [::1]:8055
        return host_header.split("]")[0] + "]"
    return host_header.split(":")[0]


def is_trusted_local(client_host: str | None, host_header: str | None, forwarded_for: str | None = None) -> bool:
    """The admin on the server PC itself. Requires a loopback peer AND a loopback Host header (blocks DNS rebinding)
    and no proxy forwarding header."""
    if forwarded_for:
        return False
    if (client_host or "").lower() not in _LOOPBACK_HOSTS:
        return False
    return _host_only(host_header or "") in _LOOPBACK_HOST_HEADERS
