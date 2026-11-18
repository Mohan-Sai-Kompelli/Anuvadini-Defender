"""
Anuvadini Detector - Workplace Network & Website Firewall
Enforces strict workplace compliance by blocking non-work websites & apps:
1. Social Media: Snapchat, Instagram, TikTok, Facebook, Twitter / X, Threads, Reddit.
2. Web Gaming & Portals: Poki, Roblox, Steam, Epic Games, Krunker, Chess.com.
3. Video Streaming: Netflix, Prime Video, Hotstar, Twitch, Kick.
4. Distraction & Dating: Tinder, Bumble, etc.

Dual-Enforcement Architecture:
- Layer 1: System DNS Hosts Sinkhole (Routes blacklisted domains to 127.0.0.1 / 0.0.0.0).
- Layer 2: Active Browser Tab & Window Interceptor (Watches window titles across Chrome, Edge, Safari, Firefox).
"""

import sys
import os
import re
import socket
import subprocess
from pathlib import Path
from datetime import datetime

from anuvadini_detector.signatures import check_window_title_signature, BENIGN_CONTEXT_RE
from anuvadini_detector.enforcer import show_site_blocked_popup
from anuvadini_detector.database import (
    get_firewall_rules,
    get_firewall_exemptions,
    add_firewall_rule,
    delete_firewall_rule,
    toggle_firewall_rule,
    log_firewall_event,
    get_firewall_logs,
    get_setting,
    set_setting
)

# Employee PCs run the agent without a database. In agent mode the firewall never touches MongoDB:
# rules/enabled-flag are pushed by the central server (see agent.policy_sync_worker) and incidents are
# reported back over HTTP through `event_sink`.
AGENT_MODE = os.environ.get("ANUVADINI_AGENT_MODE") == "1"

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")

# Markers for Clean In-Place Hosts Modification
FIREWALL_START_TAG = "# --- ANUVADINI WORKPLACE FIREWALL START ---"
FIREWALL_END_TAG = "# --- ANUVADINI WORKPLACE FIREWALL END ---"

# Curated Default Blocked Domain Packs (Gambling, Adult, Social Media, Gaming, Streaming)
DEFAULT_FIREWALL_PACKS = {
    "Gambling & Betting": [
        "stake.ac", "www.stake.ac", "stake.com", "www.stake.com", "stake.games", "stake.bet",
        "stake.link", "stake.bz", "stake.us", "stake.is", "stake.io", "stake2.com", "stake3.com",
        "1xbet.com", "www.1xbet.com", "1xbet.in",
        "bet365.com", "www.bet365.com",
        "betway.com", "www.betway.com", "betway.in",
        "parimatch.com", "www.parimatch.com", "parimatch.in",
        "dafabet.com", "www.dafabet.com",
        "dream11.com", "www.dream11.com",
        "pokerbaazi.com", "www.pokerbaazi.com",
        "mpl.live", "www.mpl.live",
        "adda52.com", "www.adda52.com",
        "jungleerummy.com", "www.jungleerummy.com",
        "rummycircle.com", "www.rummycircle.com",
        "pokerstars.com", "www.pokerstars.com",
        "888casino.com", "www.888casino.com",
        "casino.com", "www.casino.com",
        "melbet.com", "www.melbet.com",
        "lottery.com", "www.lottery.com",
        "betfair.com", "www.betfair.com",
        "bwin.com", "www.bwin.com",
        "unibet.com", "www.unibet.com"
    ],
    "Adult & 18+ Content": [
        "pornhub.com", "www.pornhub.com",
        "xvideos.com", "www.xvideos.com",
        "xnxx.com", "www.xnxx.com",
        "xhamster.com", "www.xhamster.com",
        "redtube.com", "www.redtube.com",
        "chaturbate.com", "www.chaturbate.com",
        "stripchat.com", "www.stripchat.com",
        "onlyfans.com", "www.onlyfans.com",
        "cam4.com", "www.cam4.com",
        "livejasmin.com", "www.livejasmin.com",
        "youporn.com", "www.youporn.com",
        "tube8.com", "www.tube8.com",
        "spankbang.com", "www.spankbang.com",
        "brazzers.com", "www.brazzers.com",
        "beeg.com", "www.beeg.com"
    ],
    "Social Media": [
        "snapchat.com", "www.snapchat.com", "web.snapchat.com", "app.snapchat.com",
        "instagram.com", "www.instagram.com", "cdninstagram.com",
        "tiktok.com", "www.tiktok.com",
        "facebook.com", "www.facebook.com", "fb.com", "m.facebook.com",
        "twitter.com", "x.com", "www.x.com", "mobile.twitter.com",
        "threads.net", "www.threads.net",
        "reddit.com", "www.reddit.com", "old.reddit.com",
        "pinterest.com", "www.pinterest.com"
    ],
    "Web Gaming": [
        "poki.com", "www.poki.com",
        "roblox.com", "www.roblox.com",
        "krunker.io", "crazygames.com", "1001games.com", "friv.com", "y8.com", "miniclip.com", "armorgames.com",
        "steampowered.com", "store.steampowered.com", "steamcommunity.com",
        "epicgames.com", "store.epicgames.com",
        "chess.com", "lichess.org"
    ],
    "Streaming & Leisure": [
        "netflix.com", "www.netflix.com",
        "primevideo.com", "www.primevideo.com",
        "hotstar.com", "www.hotstar.com",
        "twitch.tv", "www.twitch.tv",
        "kick.com", "www.kick.com"
    ],
    "Dating & Distraction": [
        "tinder.com", "www.tinder.com",
        "bumble.com", "www.bumble.com",
        "badoo.com", "www.badoo.com"
    ]
}

# Only real web browsers are ever intercepted. The tab-closer sends Ctrl+W, so applying it to
# Word, Figma, PowerPoint, an IDE, etc. would silently destroy unsaved work.
BROWSER_PROCESSES = {
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "opera_gx.exe", "vivaldi.exe",
    "arc.exe", "iexplore.exe", "waterfox.exe", "librewolf.exe", "chromium.exe",
    "google chrome", "safari", "firefox", "brave browser", "microsoft edge", "opera", "arc", "vivaldi",
}

# Marketing / social-media-manager style pages are work, not leisure.
SOCIAL_WORK_CONTEXT_RE = re.compile(
    r"\b(ads manager|business suite|meta business|insights|creator studio|page manager|analytics|campaigns?|"
    r"ads?|advertis\w*|audience|brand|content calendar|scheduler|moderation)\b"
)

# Game *development* tools / portals (Roblox Studio, Unity dev hubs...) are work, not play.
GAME_DEV_CONTEXT_RE = re.compile(r"\b(studio|creator hub|developer hub|partner portal|dev console)\b")

# Domain stems that are ordinary dictionary words. A blocklist entry like "casino.com" or "kick.com" must not
# close every window whose title merely contains "casino" or "kick" (e.g. "Kick off meeting agenda").
GENERIC_RULE_NAMES = {
    "casino", "kick", "lottery", "chess", "stake", "mpl", "bet", "games", "game", "play", "live", "poker",
    "slots", "bingo", "rummy", "cricket", "sports", "news", "shop", "store", "video", "tube", "cam",
}

# Browser / OS vendor names are not site brands. A rule for chrome.cloudflare-dns.com must never
# match a window title like "New Tab - Google Chrome" (this used to close Chrome on every launch).
VENDOR_TOKENS = {
    "chrome", "google", "microsoft", "edge", "brave", "firefox", "mozilla", "opera",
    "vivaldi", "safari", "arc", "chromium", "iexplore", "waterfox", "librewolf",
}

# Network-layer categories are enforced by the hosts/DNS sinkhole, never by closing a tab.
NETWORK_ONLY_CATEGORIES = {
    "dns-over-https bypass", "dns-over-https", "doh bypass", "dns over https bypass",
}

# Subdomain prefixes that do not identify the site brand.
_IGNORED_DOMAIN_PARTS = {
    "www", "app", "web", "old", "m", "cdn", "store", "mobile", "api", "net", "com", "io", "live", "bet", "org",
}


def rule_brand_token(domain: str) -> str:
    """Extract the site brand from a blocklist domain (registrable label, never a subdomain).

    chrome.cloudflare-dns.com -> "cloudflare-dns" (not "chrome")
    www.pornhub.com           -> "pornhub"
    store.steampowered.com    -> "steampowered"
    """
    parts = [p for p in (domain or "").lower().split(".") if p]
    while len(parts) > 2 and parts[0] in _IGNORED_DOMAIN_PARTS:
        parts.pop(0)
    if len(parts) >= 2:
        return parts[-2]
    return parts[0] if parts else ""

# Window Title Keywords for Real-time Tab Interception.
# Gambling and web-game portals are NOT listed here: they are decided by signatures.check_window_title_signature
# so the firewall and the detection engine always agree.
KEYWORD_INTERCEPTORS = [
    # Adult & 18+ Content
    {
        "pattern": r"(pornhub|xvideos|xnxx|xhamster|redtube|chaturbate|stripchat|onlyfans|cam4|livejasmin|youporn|brazzers|spankbang|beeg|eporner|tube8|bangbros|naughtyamerica|tnaflix|\bxxx\b|\bporn\b|\badult video\b|\bsex video\b|hentai)",
        "domain": "pornhub.com",
        "name": "Adult / 18+ Content",
        "category": "Adult & 18+ Content"
    },

    # Social Media (whole words only)
    {"pattern": r"\binstagram\b", "domain": "instagram.com", "name": "Instagram", "category": "Social Media"},
    {"pattern": r"\bsnapchat\b", "domain": "snapchat.com", "name": "Snapchat", "category": "Social Media"},
    {"pattern": r"\btiktok\b", "domain": "tiktok.com", "name": "TikTok", "category": "Social Media"},
    {"pattern": r"\bfacebook\b", "domain": "facebook.com", "name": "Facebook", "category": "Social Media"},
    {"pattern": r"\btwitter\b|(^|[\s/(])x\.com\b|\s/\sx(\s-|$)", "domain": "x.com", "name": "Twitter / X", "category": "Social Media"},
    {"pattern": r"\bthreads\.net\b", "domain": "threads.net", "name": "Threads", "category": "Social Media"},
    {"pattern": r"\breddit\b", "domain": "reddit.com", "name": "Reddit", "category": "Social Media"},
    {"pattern": r"\bpinterest\b", "domain": "pinterest.com", "name": "Pinterest", "category": "Social Media"},

    # Streaming & Leisure
    {"pattern": r"\bnetflix\b", "domain": "netflix.com", "name": "Netflix", "category": "Streaming & Leisure"},
    {"pattern": r"\bprime video\b", "domain": "primevideo.com", "name": "Prime Video", "category": "Streaming & Leisure"},
    {"pattern": r"twitch\.tv|-\s*twitch\s*(-|$)|^twitch\b", "domain": "twitch.tv", "name": "Twitch Stream", "category": "Streaming & Leisure"},
    {"pattern": r"\bkick\.com\b", "domain": "kick.com", "name": "Kick Streaming", "category": "Streaming & Leisure"},

    # Dating
    {"pattern": r"\btinder\b", "domain": "tinder.com", "name": "Tinder Dating", "category": "Dating & Distraction"},
    {"pattern": r"\bbumble\b", "domain": "bumble.com", "name": "Bumble Dating", "category": "Dating & Distraction"}
]

def get_system_hosts_path() -> Path:
    """Return OS-specific hosts file path."""
    if IS_WINDOWS:
        sys_root = os.environ.get("SystemRoot", r"C:\Windows")
        return Path(sys_root) / "System32" / "drivers" / "etc" / "hosts"
    return Path("/etc/hosts")

def flush_dns_cache():
    """Flush local OS DNS cache to apply hosts changes immediately."""
    try:
        if IS_WINDOWS:
            subprocess.run(["ipconfig", "/flushdns"], capture_output=True, timeout=2.0)
        elif IS_MAC:
            subprocess.run(["dscacheutil", "-flushcache"], capture_output=True, timeout=2.0)
            subprocess.run(["killall", "-HUP", "mDNSResponder"], capture_output=True, timeout=2.0)
        elif IS_LINUX:
            subprocess.run(["systemd-resolve", "--flush-caches"], capture_output=True, timeout=2.0)
    except Exception:
        pass

class WorkplaceFirewall:
    def __init__(self):
        self.hosts_path = get_system_hosts_path()
        self.last_intercept_time = 0
        self.intercept_cooldown = 3.0 # Cooldown between repeated logs for same window
        self.remote_enabled = True      # agent mode: pushed by server
        self.remote_rules = []          # agent mode: pushed by server
        self.remote_exemptions = []     # agent mode: people allowed to bypass part of the blocklist, pushed by server
        self.identity_host = ""          # agent mode: this PC's hostname / employee id, set by the agent
        self.identity_emp = ""
        self._ex_cache = ([], 0.0)      # server mode: (exemptions, fetched_at)
        self._local_emp = ("", 0.0)     # server mode: employee id of the PC this engine runs on
        self.event_sink = None          # agent mode: callable(dict) that reports an incident to the server
        if not AGENT_MODE:
            self._seed_default_rules_if_empty()

    def _seed_default_rules_if_empty(self):
        """Pre-populate curated default blockpacks in database."""
        for cat, domains in DEFAULT_FIREWALL_PACKS.items():
            for d in domains:
                add_firewall_rule(d, cat, enabled=1)

    def is_enabled(self) -> bool:
        """Check if workplace firewall is enabled."""
        if AGENT_MODE:
            return bool(self.remote_enabled)
        val = get_setting("firewall_enabled", "true")
        return val.lower() in ("true", "1", "yes")

    def set_enabled(self, enabled: bool) -> tuple[bool, str]:
        """Toggle firewall enabled state and sync hosts sinkhole."""
        set_setting("firewall_enabled", "true" if enabled else "false")
        if enabled:
            ok, msg = self.sync_hosts_sinkhole()
            return ok, "Workplace Firewall Activated" if ok else f"Firewall active (Tab Interceptor only): {msg}"
        else:
            ok, msg = self.remove_hosts_sinkhole()
            return ok, "Workplace Firewall Disabled"

    def get_status(self) -> dict:
        """Return full firewall status, rules summary, and recent block logs."""
        rules = get_firewall_rules()
        enabled_rules = [r for r in rules if r.get("enabled", 1) == 1]
        logs = get_firewall_logs(limit=25)
        
        # Breakdown by category
        cat_counts = {}
        for r in rules:
            c = r.get("category", "General")
            cat_counts[c] = cat_counts.get(c, 0) + 1

        return {
            "firewall_active": self.is_enabled(),
            "total_rules": len(rules),
            "active_blocked_domains": len(enabled_rules),
            "category_breakdown": cat_counts,
            "hosts_file_writable": os.access(str(self.hosts_path), os.W_OK),
            "recent_blocks": logs,
            "hosts_path": str(self.hosts_path)
        }

    # ---- exemptions: people who may bypass part of the blocklist -------------------------------------------
    def invalidate_exemptions(self):
        self._ex_cache = ([], 0.0)

    def _exemptions(self) -> list:
        if AGENT_MODE:
            return self.remote_exemptions or []
        import time
        rows, at = self._ex_cache
        if time.time() - at > 5:
            try:
                rows = get_firewall_exemptions()
            except Exception:
                rows = rows or []
            self._ex_cache = (rows, time.time())
        return rows

    def _identity(self) -> tuple[str, str]:
        """(hostname, employee_id) of the PC being protected."""
        host = (self.identity_host or socket.gethostname() or "").lower()
        if AGENT_MODE:
            return host, (self.identity_emp or "")
        import time
        emp, at = self._local_emp
        if time.time() - at > 60:
            try:
                from anuvadini_detector.database import get_db
                w = get_db().workstations.find_one({"hostname": socket.gethostname()}, {"employee_id": 1})
                emp = (w or {}).get("employee_id", "") or ""
            except Exception:
                pass
            self._local_emp = (emp, time.time())
        return host, emp

    def is_exempt(self, domain: str, category: str) -> bool:
        """True when this PC's user has been allowed to visit `domain` / `category`."""
        host, emp = self._identity()
        domain = (domain or "").lower().removeprefix("www.")
        category = (category or "").strip().lower()
        for ex in self._exemptions():
            who = (emp and ex.get("employee_id") == emp) or (host and host in [h.lower() for h in ex.get("hostnames", [])])
            if not who:
                continue
            scope, value = ex.get("scope"), (ex.get("value") or "").lower()
            if scope == "all":
                return True
            if scope == "category" and value == category:
                return True
            if scope == "domain" and domain and (domain == value or domain.endswith("." + value)):
                return True
        return False

    def sync_hosts_sinkhole(self) -> tuple[bool, str]:
        """Write active blocked domains into system hosts file DNS sinkhole."""
        if not self.is_enabled():
            return self.remove_hosts_sinkhole()

        # Agent PCs use the rules the server already filtered for this employee / department.
        rules = (self.remote_rules or []) if AGENT_MODE else get_firewall_rules()
        # Domains this PC's own user is allowed to open are left out of the DNS sinkhole.
        active_domains = [r["domain"] for r in rules if r.get("enabled", 1) == 1 and not self.is_exempt(r["domain"], r.get("category", ""))]

        if not self.hosts_path.exists():
            return False, "System hosts file not found"

        try:
            content = self.hosts_path.read_text(encoding="utf-8", errors="ignore")
            
            # Remove any existing Anuvadini block
            pattern = re.compile(rf"{re.escape(FIREWALL_START_TAG)}.*?{re.escape(FIREWALL_END_TAG)}\n?", re.DOTALL)
            clean_content = re.sub(pattern, "", content).rstrip() + "\n"

            # Build new sinkhole block
            block_lines = [
                "",
                FIREWALL_START_TAG,
                f"# Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - Enterprise Policy Blocklist"
            ]
            for domain in active_domains:
                block_lines.append(f"127.0.0.1 {domain}")
                block_lines.append(f"0.0.0.0 {domain}")
            block_lines.append(FIREWALL_END_TAG)
            block_lines.append("")

            new_content = clean_content + "\n".join(block_lines)
            self.hosts_path.write_text(new_content, encoding="utf-8")
            flush_dns_cache()
            return True, f"Successfully mapped {len(active_domains)} blocked domains to 127.0.0.1 DNS sinkhole."
        except PermissionError:
            # If not running as admin/root, DNS sinkhole requires elevation, but Layer 2 Tab Interceptor still runs!
            return False, "Admin rights needed for hosts file; Layer 2 Tab Interceptor active"
        except Exception as e:
            return False, str(e)

    def remove_hosts_sinkhole(self) -> tuple[bool, str]:
        """Remove all Anuvadini block entries from system hosts file."""
        if not self.hosts_path.exists():
            return True, "Hosts file not present"
        try:
            content = self.hosts_path.read_text(encoding="utf-8", errors="ignore")
            pattern = re.compile(rf"{re.escape(FIREWALL_START_TAG)}.*?{re.escape(FIREWALL_END_TAG)}\n?", re.DOTALL)
            new_content = re.sub(pattern, "", content)
            self.hosts_path.write_text(new_content, encoding="utf-8")
            flush_dns_cache()
            return True, "Firewall DNS sinkhole cleared"
        except Exception as e:
            return False, str(e)

    def check_window_interceptor(self, window_title: str, process_name: str, pid: int = 0, hwnd: int = 0) -> dict | None:
        """Window/tab interceptor, minus anything this PC's user has been given an exception for."""
        match = self._raw_check_window_interceptor(window_title, process_name, pid, hwnd)
        if match and self.is_exempt(match.get("domain", ""), match.get("category", "")):
            return None
        return match

    def _raw_check_window_interceptor(self, window_title: str, process_name: str, pid: int = 0, hwnd: int = 0) -> dict | None:
        """
        Layer 2: Real-time window title and browser tab interceptor.
        Detects if employee opened Gambling, Adult, Social, Streaming or Game sites in Chrome/Edge/Safari/Firefox/Brave.
        Only browser windows are ever matched, and pages that are clearly ABOUT a topic (news, docs, reports) are ignored.
        """
        if not self.is_enabled() or not window_title:
            return None

        if (process_name or "").lower() not in BROWSER_PROCESSES:
            return None

        title_lower = window_title.lower()

        # STRICT WHITELIST: NEVER intercept or close Admin Dashboard, Localhost, IDEs, or Command Centers
        ADMIN_WHITELIST = (
            "anuvadini",
            "admin dashboard",
            "command center",
            "telemetry & anti-tamper",
            "telemetry",
            "127.0.0.1",
            "localhost:8055",
            ":8055",
            "antigravity",
            "visual studio code",
            "pycharm",
            "cursor",
            "powershell",
            "cmd.exe"
        )
        if any(w in title_lower for w in ADMIN_WHITELIST):
            return None

        def _match(domain: str, name: str, category: str) -> dict:
            return {
                "domain": domain,
                "name": name,
                "category": category,
                "title": window_title,
                "process_name": process_name,
                "pid": pid,
                "hwnd": hwnd
            }

        # 1. Gambling and web games share the detection engine's context-aware signatures.
        sig = check_window_title_signature(window_title)
        if sig and sig.get("category") in ("Gambling / Betting", "Web Gaming", "PC Game"):
            category = "Gambling & Betting" if sig["category"] == "Gambling / Betting" else "Web Gaming"
            # Clean label for the dashboard / popup: "stake:" -> "Stake", "stake.ac" stays "stake.ac"
            keyword = re.sub(r"^[^\w]+|[^\w]+$", "", (sig.get("keyword") or sig.get("name") or "").strip())
            label = keyword if "." in keyword else keyword.title()
            return _match(label.lower() if "." in keyword else label, f"{label} ({category})", category)

        # Pages that are about a topic (news, wiki, docs, reports, blog posts...) are not visits to that site.
        if BENIGN_CONTEXT_RE.search(title_lower):
            return None

        # 2. Curated keyword interceptors (adult, social, streaming, dating)
        for item in KEYWORD_INTERCEPTORS:
            if re.search(item["pattern"], title_lower):
                if item["category"] == "Social Media" and SOCIAL_WORK_CONTEXT_RE.search(title_lower):
                    continue
                return _match(item["domain"], item["name"], item["category"])

        # 3. Admin-defined custom rules from the database (whole-word brand match)
        rules = (self.remote_rules or []) if AGENT_MODE else get_firewall_rules()
        for r in rules:
            if r.get("enabled", 1) != 1:
                continue

            category = (r.get("category") or "Custom Blocklist").strip()
            # DNS / DoH rules are network-layer only; closing a tab for them is always a false positive.
            if category.lower() in NETWORK_ONLY_CATEGORIES:
                continue

            dom = (r.get("domain") or "").lower()
            clean_name = rule_brand_token(dom)
            if (clean_name and len(clean_name) >= 3
                    and clean_name not in _IGNORED_DOMAIN_PARTS
                    and clean_name not in GENERIC_RULE_NAMES
                    and clean_name not in VENDOR_TOKENS
                    and re.search(rf"\b{re.escape(clean_name)}\b", title_lower)):
                if category == "Social Media" and SOCIAL_WORK_CONTEXT_RE.search(title_lower):
                    continue
                if category == "Web Gaming" and GAME_DEV_CONTEXT_RE.search(title_lower):
                    continue
                return _match(dom, dom, category)

        return None

    def silently_close_tab(self, pid: int = 0, hwnd: int = 0):
        """
        Silently close the restricted tab or window without showing any alert or sound to the employee.
        Site simply closes / fails to stay open ('bss open hi naa hoo').
        """
        try:
            # Safeguard: Verify the active window is NOT the Anuvadini Admin Dashboard or developer IDE
            from anuvadini_detector.watcher import get_active_window
            win = get_active_window() or {}
            active_title = win.get("title", "").lower()
            if any(w in active_title for w in ("anuvadini", "admin dashboard", "8055", "antigravity", "visual studio code")):
                return

            if IS_WINDOWS:
                import ctypes
                # Safety: never send Ctrl+W unless the offending browser is STILL the foreground
                # window. The employee may have switched to an IDE/editor since detection.
                active_proc = (win.get("process_name") or "").lower()
                if active_proc not in BROWSER_PROCESSES:
                    return
                active_hwnd = win.get("hwnd") or 0
                if hwnd and active_hwnd and int(hwnd) != int(active_hwnd):
                    return

                # Close only the offending tab. WM_CLOSE on the window would close every tab
                # (and the whole browser when it has a single window), which is too destructive.
                VK_CONTROL = 0x11
                VK_W = 0x57
                KEYEVENTF_KEYUP = 0x0002
                ctypes.windll.user32.keybd_event(VK_CONTROL, 0, 0, 0)
                ctypes.windll.user32.keybd_event(VK_W, 0, 0, 0)
                ctypes.windll.user32.keybd_event(VK_W, 0, KEYEVENTF_KEYUP, 0)
                ctypes.windll.user32.keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
            elif IS_MAC:
                def _osa(*lines):
                    cmd = ["osascript"]
                    for ln in lines:
                        cmd += ["-e", ln]
                    return subprocess.run(cmd, capture_output=True, text=True, timeout=2.0).stdout.strip()
                front = _osa('tell application "System Events" to get name of first application process whose frontmost is true')
                if front in ("Google Chrome", "Microsoft Edge", "Brave Browser", "Vivaldi", "Opera", "Chromium"):
                    _osa(f'tell application "{front}" to close active tab of front window')
                elif front == "Safari":
                    _osa('tell application "Safari" to close current tab of front window')
                elif front in ("Firefox", "Arc"):
                    _osa('tell application "System Events" to keystroke "w" using command down')
        except Exception:
            pass

    def enforce_silent_intercept(self, match: dict, hostname: str = None, username: str = None, employee_id: str = None,
                                 show_popup: bool = True):
        """
        Silently block restricted website attempt:
        - NO popup warning dialog on employee desktop.
        - NO alert sound chime.
        - Immediately closes tab / window silently.
        - Silently records to database FOR ADMIN ONLY: Employee ID, Employee Name, Domain, Category, Workstation.
        """
        import time
        now = time.time()
        if now - self.last_intercept_time < self.intercept_cooldown:
            return # Cooldown to prevent duplicate flood
        self.last_intercept_time = now

        host = hostname or socket.gethostname()
        user = username or (os.getlogin() if hasattr(os, "getlogin") else "Employee")
        emp_id = employee_id or "EMP-001"
        cat = match.get("category", "Workplace Policy")
        dom = match.get("domain", "")
        pid = match.get("pid", 0)
        hwnd = match.get("hwnd", 0)

        # 1. Close the offending tab or window, then tell the employee why
        self.silently_close_tab(pid=pid, hwnd=hwnd)
        if show_popup:
            try:
                site = match.get("domain") or match.get("name") or "this website"
                show_site_blocked_popup(site, cat)
            except Exception:
                pass

        # 2. Log incident FOR ADMIN ONLY (with Employee ID and Username).
        # On an employee PC this is reported to the central server over HTTP; on the server it goes to the DB.
        if self.event_sink:
            try:
                self.event_sink({
                    "hostname": host, "username": user, "employee_id": emp_id,
                    "domain": dom, "category": cat, "action_taken": "SILENTLY_BLOCKED",
                })
            except Exception:
                pass
        elif not AGENT_MODE:
            log_firewall_event(
                hostname=host,
                username=user,
                domain=dom,
                category=cat,
                action_taken="SILENTLY_BLOCKED",
                employee_id=emp_id
            )

    def enforce_intercept(self, match: dict, hostname: str = None, username: str = None, employee_id: str = None):
        """Silent enforcement alias."""
        return self.enforce_silent_intercept(match, hostname, username, employee_id)

# Global Singleton Engine
firewall_engine = WorkplaceFirewall()

if __name__ == "__main__":
    print("Workplace Firewall Status:", firewall_engine.get_status())
    test_title = "Instagram - Direct Messages - Google Chrome"
    match = firewall_engine.check_window_interceptor(test_title, "chrome.exe")
    print(f"Test Intercept for '{test_title}':", match)
