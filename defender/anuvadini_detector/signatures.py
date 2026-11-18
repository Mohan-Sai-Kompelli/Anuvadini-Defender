"""
Anuvadini Detector - Detection Signatures & Intelligence Database
Known Games, Launchers, Emulators, Gambling Sites, and Web Games
"""

# Common Game Launchers & Storefronts
LAUNCHER_PROCESSES = {
    "steam.exe": "Steam Client",
    "steamwebhelper.exe": "Steam Helper",
    "epicgameslauncher.exe": "Epic Games Launcher",
    "riotclientservices.exe": "Riot Client",
    "battle.net.exe": "Blizzard Battle.net",
    "ea.exe": "EA App",
    "eadsktop.exe": "EA Desktop",
    "upc.exe": "Ubisoft Connect",
    "ubisoftconnect.exe": "Ubisoft Connect",
    "galaxyclient.exe": "GOG Galaxy",
    "itch.exe": "Itch.io Launcher",
    "bethesda.net_launcher.exe": "Bethesda Launcher"
}

# Mouse Jigglers, Macro Bots & Anti-AFK Cheat Utilities (Fake Productivity Bypass)
ANTI_AFK_PROCESSES = {
    "caffeine.exe": "Caffeine Anti-Sleep Utility",
    "caffeine64.exe": "Caffeine Anti-Sleep Utility",
    "movemouse.exe": "Move Mouse Auto-Jiggler",
    "mousejiggler.exe": "Mouse Jiggler",
    "autoclicker.exe": "Auto Clicker Macro",
    "opautoclicker.exe": "OP Auto Clicker",
    "tinytask.exe": "TinyTask Automated Macro Bot",
    "macrorecorder.exe": "Macro Recorder Bot",
    "keepawake.exe": "KeepAwake Anti-Idle Utility",
    "stayawake.exe": "StayAwake Bot",
    "dontsleep.exe": "Don't Sleep AFK Bypass",
    "dontsleep_x64.exe": "Don't Sleep AFK Bypass",
    "prevent-turn-off.exe": "Prevent-Turn-Off Utility",
    "wiggler.exe": "Mouse Wiggler AFK Bypass"
}

# Major PC Gaming Binaries
GAME_PROCESSES = {
    # Popular Multiplayer / Esports
    "cs2.exe": "Counter-Strike 2",
    "csgo.exe": "Counter-Strike: Global Offensive",
    "valorant.exe": "Valorant",
    "valorant-win64-shipping.exe": "Valorant",
    "leagueclient.exe": "League of Legends Client",
    "leagueclientux.exe": "League of Legends UX",
    "league of legends.exe": "League of Legends",
    "dota2.exe": "Dota 2",
    "fortniteclient-win64-shipping.exe": "Fortnite",
    "fortnitelauncher.exe": "Fortnite Launcher",
    "overwatch.exe": "Overwatch 2",
    "r5apex.exe": "Apex Legends",
    "tslgame.exe": "PUBG: Battlegrounds",
    "pubglite.exe": "PUBG Lite",
    "rainbowsix.exe": "Tom Clancy's Rainbow Six Siege",
    "rocketleague.exe": "Rocket League",
    "fallguys_client.exe": "Fall Guys",
    "brawlhalla.exe": "Brawlhalla",
    "deadbydaylight-win64-shipping.exe": "Dead by Daylight",
    "warframe.x64.exe": "Warframe",
    "destiny2.exe": "Destiny 2",
    "crossfire.exe": "CrossFire",

    # AAA & Popular Titles
    "gta5.exe": "Grand Theft Auto V",
    "gta_sa.exe": "GTA San Andreas",
    "gta_vc.exe": "GTA Vice City",
    "playgtav.exe": "GTA V Launcher",
    "rdr2.exe": "Red Dead Redemption 2",
    "cyberpunk2077.exe": "Cyberpunk 2077",
    "witcher3.exe": "The Witcher 3: Wild Hunt",
    "eldenring.exe": "Elden Ring",
    "sekiro.exe": "Sekiro: Shadows Die Twice",
    "darksoulsiii.exe": "Dark Souls III",
    "starfield.exe": "Starfield",
    "blackmythwukong.exe": "Black Myth: Wukong",
    "b1-win64-shipping.exe": "Black Myth: Wukong",
    "helldivers2.exe": "Helldivers 2",
    "palworld.exe": "Palworld",
    "palworld-win64-shipping.exe": "Palworld",
    "genshinimpact.exe": "Genshin Impact",
    "starrail.exe": "Honkai: Star Rail",
    "zenlesszonezero.exe": "Zenless Zone Zero",
    "wutheringwaves.exe": "Wuthering Waves",
    "fifa23.exe": "EA Sports FIFA 23",
    "fc24.exe": "EA Sports FC 24",
    "fc25.exe": "EA Sports FC 25",
    "pes2021.exe": "eFootball PES",
    "efootball.exe": "eFootball",
    "nba2k24.exe": "NBA 2K24",
    "nba2k25.exe": "NBA 2K25",
    "forzahorizon5.exe": "Forza Horizon 5",
    "forzahorizon4.exe": "Forza Horizon 4",
    "needforspeedunbound.exe": "Need for Speed Unbound",

    # Sandbox / Building / Casual
    "minecraft.exe": "Minecraft",
    "minecraftlauncher.exe": "Minecraft Launcher",
    "robloxplayerbeta.exe": "Roblox Player",
    "robloxplayerlauncher.exe": "Roblox Launcher",
    "terraria.exe": "Terraria",
    "stardew valley.exe": "Stardew Valley",
    "among us.exe": "Among Us",
    "subnautica.exe": "Subnautica",
    "cities2.exe": "Cities: Skylines II",
    "thesims4.exe": "The Sims 4",
    "ts4_x64.exe": "The Sims 4",

    # Windows / Casual Games
    "solitaire.exe": "Microsoft Solitaire",
    "spidersolitaire.exe": "Spider Solitaire",
    "freecell.exe": "FreeCell Solitaire",
    "minesweeper.exe": "Minesweeper",
    "hearts.exe": "Hearts Game",
    "candycrush.exe": "Candy Crush Saga",
    "chess.exe": "Chess",
    "pinball.exe": "3D Pinball",
    "solitairecollection.exe": "Microsoft Solitaire Collection",

    # Emulators
    "hd-player.exe": "BlueStacks Android Emulator",
    "bluestacks.exe": "BlueStacks",
    "nox.exe": "NoxPlayer Android Emulator",
    "ldboxheadless.exe": "LDPlayer Android Emulator",
    "dnplayer.exe": "LDPlayer",
    "mumuplayer.exe": "MuMu Player Emulator",
    "gameloop.exe": "GameLoop Android Emulator",
    "androidemulator.exe": "Android Game Emulator",
    "rpcs3.exe": "RPCS3 PS3 Emulator",
    "pcsx2.exe": "PCSX2 PS2 Emulator",
    "yuzu.exe": "Yuzu Switch Emulator",
    "ryujinx.exe": "Ryujinx Switch Emulator",
    "retroarch.exe": "RetroArch Gaming Suite",
    "cemu.exe": "Cemu Wii U Emulator",
    "dolphin.exe": "Dolphin Emulator",
    "ppssppwindows64.exe": "PPSSPP PSP Emulator"
}

import re

# Browser & Window Title Match Keywords (Web Games, Gaming Streams, Gambling)
# Window titles are free text, so matching is context-aware to avoid flagging normal work
# (news, wiki, reports, docs, marketing decks, dev tools) that merely mention a game or casino term.

# Titles that clearly belong to work tools / documents. Matched on whole words only.
WORKPLACE_TITLE_RE = re.compile(
    r"(?<![\w])(antigravity ide|visual studio code|vs code|pycharm|webstorm|intellij|sublime text|notepad\+\+|"
    r"command prompt|powershell|windows terminal|google docs|google sheets|google slides|microsoft word|"
    r"microsoft excel|microsoft powerpoint|excel|powerpoint|outlook|microsoft teams|slack|zoom meeting|"
    r"zoom workplace|github|gitlab|stack overflow|jira|confluence|localhost:8055|127\.0\.0\.1|anuvadini|"
    r"admin dashboard|chatgpt)(?![\w])|\s-\s(word|notepad)\s*$"
)

# Words that mean "this page is ABOUT a game/casino/site" (work, research, news) rather than playing it.
BENIGN_CONTEXT_RE = re.compile(
    r"\b(wikipedia|news|reports?|analysis|analytics|dashboard|marketing|campaigns?|ads?|advertis\w*|creatives?|"
    r"case stud(y|ies)|sponsorships?|decks?|proposals?|invoices?|contracts?|agreements?|policy|policies|legal|memo|"
    r"regulations?|compliance|licensing|documentation|docs|api|sdk|spec|integration|developers?|investor relations|"
    r"job description|careers?|market|industry|statistics|statista|tutorial|leetcode|arxiv|stack ?overflow|github|"
    r"jira|confluence|figma|grafana|tableau|looker|qa|audit|partnership|billing|payouts?|listing|play ?store|"
    r"app store|style guide|blog|engineering|outage|research|paper|lecture|course|syllabus|hr|education\w*|"
    r"classrooms?|school|ux|kpi|teardown|architecture|backend|dev\.to|medium)\b"
)

# Explicit gambling site addresses are flagged even if the title also contains a "benign" word.
GAMBLING_DOMAIN_RE = re.compile(
    r"\b(stake\.(ac|com|bet|games|link|bz|us|is|io|vip)|bet365\.com|1xbet\.(com|in)|parimatch\.(com|in)|"
    r"betway\.(com|in)|dafabet\.com|melbet\.com|mostbet\.com|pokerstars\.com|dream11\.com)\b"
)

COMPREHENSIVE_GAME_REGEX = [
    # 1. Gambling & Real-Money Casino (Zero Tolerance)
    (
        r"(\bstake\s+(casino|bet|originals|sportsbook|dice|slots)\b|"
        r"\b(bet365|1xbet|parimatch|betway|dafabet|melbet|mostbet|pokerstars|pokerbaazi|adda52|rummycircle|"
        r"jungleerummy|lotus365|gold365|laser247|dream11)\b|"
        r"\b(online|live)\s+casino\b|\bcasino\s+(games?|slots|bonus|online)\b|"
        r"\bplay\s+(roulette|blackjack|baccarat|poker|rummy|teen\s*patti|andar\s*bahar)\b|"
        r"\b(roulette|blackjack|baccarat|teen\s*patti|rummy|andar\s*bahar)\s+(online|live|real\s*money|table)\b|"
        r"\bteen\s*patti\s+(gold|master|star)\b|\bsatta\s*matka\b|\bonline\s+betting\b|\bsports\s*betting\b|"
        r"\baviator\s+(game|bet|predictor|hack|online)\b|\bplay\s+aviator\b|^stake\s*([-|:]|$))",
        "Gambling & Betting Platform",
        "Gambling / Betting",
        "CRITICAL"
    ),

    # 2. Major Online Gaming Portals & Arcades
    (
        r"(\bpoki\b|crazy\s*games|\by8(\.com)?\b|\bfriv(\.com)?\b|1001\s*games|miniclip|armor\s*games|"
        r"\bagame\.com\b|silvergames|snokido|playhop|now\.gg|kongregate|newgrounds|itch\.io|twoplayergames|"
        r"coolmathgames|unblocked\s*games?)",
        "Online Gaming Portal",
        "Web Gaming",
        "HIGH"
    ),

    # 3. Popular Web, Mobile & Casual Games (distinctive names only; generic words like "chess" or "snake" alone are NOT matched)
    (
        r"(subway\s*surfers|temple\s*run|candy\s*crush|8\s*ball\s*pool|ludo\s*king|\bludo\s+(online|game|star|club)\b|"
        r"chess\.com|lichess|\bplay\s+chess\b|\bchess\s+online\b|\bsolitaire\b|\bsudoku\s+(online|game|free|puzzle)\b|"
        r"\bplay\s+sudoku\b|hill\s*climb\s*racing|\bslope\s*(game|unblocked|run)\b|\bmoto\s*x3m\b|"
        r"fireboy\s*and\s*watergirl|monkey\s*mart|retro\s*bowl|\bbitlife\b|flappy\s*bird|bad\s*ice\s*cream|"
        r"happy\s*wheels|cookie\s*clicker|\bpac-?man\s*(game|online|play|google)\b|"
        r"\bplay\s+(snake|pac-?man|tetris|2048)\b|\bsnake\s+game\s+(online|play|free)\b)",
        "Casual / Web Game",
        "Web Gaming",
        "HIGH"
    ),

    # 4. .IO Arena & Multiplayer Web Games
    (
        r"(slither\.io|agar\.io|krunker|paper\.io|1v1\.lol|shell\s*shockers|smash\s*karts|zombs\s*royale|surviv\.io|"
        r"diep\.io|ev\.io|skribbl\.io|gartic\s*phone|geoguessr)",
        ".IO Arena Web Game",
        "Web Gaming",
        "HIGH"
    ),

    # 5. Major Franchise Video Games (specific titles only: bare "fifa" / "overwatch" / "free fire" are ambiguous)
    (
        r"(\broblox\b(?!\s*studio)|\bminecraft\b|garena\s*free\s*fire|\bfree\s*fire\s*(max|game|mobile|diamonds|redeem)\b|"
        r"\bpubg\b|\bbgmi\b|call\s*of\s*duty|\bcodm\b|\bvalorant\b|counter[- ]strike|\bcs2\b|\bcsgo\b|\bfortnite\b|"
        r"apex\s*legends|grand\s*theft\s*auto|\bgta\s*(v|5|vi|6)\b|league\s*of\s*legends|\bdota\s*2\b|"
        r"\boverwatch\s*2\b|fall\s*guys|rocket\s*league|brawlhalla|stumble\s*guys|genshin\s*impact|honkai|"
        r"ea\s*sports\s*fc|\bfifa\s*(2\d|mobile|ultimate)\b|\befootball\b)",
        "Video Game",
        "PC Game",
        "HIGH"
    ),

    # 6. Streaming Platforms (Twitch, Kick, YouTube Gaming)
    (
        r"(twitch\.tv|\bkick\.com\b|youtube\.com/gaming|gaming\s+stream|-\s*twitch\s*(-|$)|^twitch\b)",
        "Gaming Stream",
        "Gaming Streaming",
        "MEDIUM"
    ),

    # 7. Generic Gaming Action Keywords
    (
        r"(\bplay\s+(free\s+)?(online\s+)?games?\b|\bfree\s+online\s+games?\b|"
        r"\b(car|bike|racing|shooting|action|arcade|multiplayer|browser)\s+games?\b|\bgame\s+walkthrough\b)",
        "Online Browser Game",
        "Web Gaming",
        "HIGH"
    )
]

# Explicit Whitelist for Office & Productivity Work (Never flag these)
PRODUCTIVITY_WHITELIST = [
    "code.exe",
    "antigravity ide.exe",
    "devenv.exe",
    "pycharm64.exe",
    "webstorm64.exe",
    "idea64.exe",
    "sublime_text.exe",
    "notepad++.exe",
    "notepad.exe",
    "windowsterminal.exe",
    "cmd.exe",
    "powershell.exe",
    "pwsh.exe",
    "explorer.exe",
    "winword.exe",
    "excel.exe",
    "powerpnt.exe",
    "outlook.exe",
    "teams.exe",
    "ms-teams.exe",
    "slack.exe",
    "zoom.exe",
    "thunderbird.exe",
    "taskmgr.exe",
    "systemsettings.exe"
]

# macOS / Linux process names have no ".exe" and often differ from the Windows binary name.
MAC_GAME_ALIASES = {
    "steam_osx": "Steam Client", "steam helper": "Steam Helper", "steam": "Steam Client",
    "epic games launcher": "Epic Games Launcher", "epicgameslauncher": "Epic Games Launcher",
    "battle.net": "Blizzard Battle.net", "blizzard battle.net": "Blizzard Battle.net",
    "league of legends": "League of Legends", "leagueclient": "League of Legends Client",
    "riot client": "Riot Client", "valorant": "Valorant",
    "minecraft": "Minecraft", "minecraft launcher": "Minecraft Launcher",
    "roblox": "Roblox Player", "robloxplayer": "Roblox Player", "roblox studio": None,
    "genshin impact": "Genshin Impact", "dota 2": "Dota 2", "cs2": "Counter-Strike 2",
    "openemu": "OpenEmu Game Emulator", "retroarch": "RetroArch Gaming Suite", "dolphin": "Dolphin Emulator",
    "ppsspp": "PPSSPP PSP Emulator", "bluestacks": "BlueStacks", "geforce now": "NVIDIA GeForce NOW",
    "crossover": "CrossOver (Windows games on Mac)", "whisky": "Whisky (Windows games on Mac)",
    "gamecenter": None,
}

# Everyday work apps on macOS (same role as PRODUCTIVITY_WHITELIST on Windows)
MAC_PRODUCTIVITY = {
    "code", "visual studio code", "terminal", "iterm2", "iterm", "finder", "xcode", "pycharm", "intellij idea",
    "webstorm", "android studio", "sublime text", "nova", "textedit", "preview", "pages", "numbers", "keynote",
    "microsoft word", "microsoft excel", "microsoft powerpoint", "microsoft outlook", "microsoft teams",
    "teams", "slack", "zoom.us", "zoom", "mail", "calendar", "notes", "reminders", "notion", "figma", "sketch",
    "system settings", "system preferences", "activity monitor", "antigravity ide", "cursor", "windsurf",
    "postman", "docker desktop", "tableplus", "dbeaver", "mongodb compass",
}

def _name_keys(name: str) -> list[str]:
    n = (name or "").lower().strip()
    if not n:
        return []
    return [n, n[:-4]] if n.endswith(".exe") else [n, n + ".exe"]

def is_productivity_process(proc_name: str) -> bool:
    """True for everyday work apps, on Windows (code.exe) and macOS (Code / Microsoft Excel)."""
    return any(k in PRODUCTIVITY_WHITELIST or k in MAC_PRODUCTIVITY for k in _name_keys(proc_name))

def check_process_signature(proc_name: str) -> dict | None:
    """Check if process name matches known game or launcher (".exe" is optional so macOS names work too)."""
    keys = _name_keys(proc_name)
    if not keys:
        return None
    p_lower = keys[0]

    for k in keys:
        if k in LAUNCHER_PROCESSES:
            return {"name": LAUNCHER_PROCESSES[k], "category": "Game Launcher", "process": p_lower, "severity": "MEDIUM"}
        if k in ANTI_AFK_PROCESSES:
            return {"name": ANTI_AFK_PROCESSES[k], "category": "Anti-AFK / Fake Idle Bypass", "process": p_lower, "severity": "HIGH"}
        if k in GAME_PROCESSES:
            return {"name": GAME_PROCESSES[k], "category": "PC Game", "process": p_lower, "severity": "HIGH"}

    mac = MAC_GAME_ALIASES.get(p_lower)
    if mac:
        is_launcher = any(w in mac.lower() for w in ("client", "launcher", "battle.net"))
        return {"name": mac, "category": "Game Launcher" if is_launcher else "PC Game",
                "process": p_lower, "severity": "MEDIUM" if is_launcher else "HIGH"}

    # Catch any generic game binary naming
    base = p_lower[:-4] if p_lower.endswith(".exe") else p_lower
    if base in ("roblox", "robloxplayer", "minecraft", "solitaire", "spider", "freecell", "chess", "candycrush", "minesweeper"):
        return {"name": base.title(), "category": "Casual / PC Game", "process": p_lower, "severity": "HIGH"}

    return None

def _title_hit(pattern: str, name: str, category: str, severity: str, t_lower: str) -> dict | None:
    m = re.search(pattern, t_lower)
    if not m:
        return None
    matched_text = m.group(0).strip().title()
    return {
        "name": f"{matched_text} ({name})" if matched_text and len(matched_text) > 2 else name,
        "category": category,
        "keyword": m.group(0),
        "severity": severity
    }

def check_window_title_signature(title: str) -> dict | None:
    """Check window title for web games, gaming portals, or betting sites.

    Order matters: explicit gambling addresses always win; then titles that are clearly ABOUT the topic
    (news / reports / docs / marketing / dev tools) are ignored; then the keyword tiers are applied.
    """
    if not title:
        return None
    t_lower = title.lower()

    domain_hit = GAMBLING_DOMAIN_RE.search(t_lower)
    if domain_hit:
        _, name, category, severity = COMPREHENSIVE_GAME_REGEX[0]
        return {"name": f"{domain_hit.group(0).title()} ({name})",
                "category": category, "keyword": domain_hit.group(0), "severity": severity}

    if BENIGN_CONTEXT_RE.search(t_lower):
        return None

    gambling = _title_hit(*COMPREHENSIVE_GAME_REGEX[0], t_lower)
    if gambling:
        return gambling

    if WORKPLACE_TITLE_RE.search(t_lower):
        return None

    for pattern, name, category, severity in COMPREHENSIVE_GAME_REGEX[1:]:
        hit = _title_hit(pattern, name, category, severity, t_lower)
        if hit:
            return hit

    return None


# Fullscreen + gamepad is only a *hint* of an unknown game. Never apply it to apps that are routinely fullscreen
# at work (presentations, video calls, browsers, PDF/media viewers, remote-work tools).
FULLSCREEN_HEURISTIC_EXEMPT = set(PRODUCTIVITY_WHITELIST) | {
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe",
    "powerpnt.exe", "acrobat.exe", "acrord32.exe", "foxitreader.exe", "vlc.exe", "mpv.exe", "wmplayer.exe",
    "msteams.exe", "ms-teams.exe", "skype.exe", "discord.exe", "figma.exe", "photoshop.exe", "premiere pro.exe",
    "applicationframehost.exe", "searchhost.exe", "shellexperiencehost.exe", "lockapp.exe", "textinputhost.exe",
}
