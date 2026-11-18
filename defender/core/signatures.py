"""
Anuvadini Detector - Signatures Database
Contains process signatures, launchers, emulators, anti-AFK jigglers,
browser patterns (web games & gambling), and productivity whitelist.
"""

from typing import Set, Dict, List

# ~120 Known Game Executables
GAME_PROCESSES: Set[str] = {
    # AAA & Popular PC Games
    "cs2.exe", "csgo.exe", "valorant.exe", "valorant-win64-shipping.exe",
    "gta5.exe", "gtav.exe", "r5apex.exe", "leagueclient.exe", "leagueclientux.exe",
    "dota2.exe", "fortniteclient-win64-shipping.exe", "overwatch.exe",
    "minecraft.exe", "javaw.exe", "minecraftlauncher.exe", "robloxplayerbeta.exe",
    "robloxplayerlauncher.exe", "genshinimpact.exe", "starrail.exe",
    "pubg.exe", "tslgame.exe", "cod.exe", "modernwarfare.exe", "warzone.exe",
    "destiny2.exe", "rainbowsix.exe", "r6siege.exe", "rocketleague.exe",
    "fifa23.exe", "fc24.exe", "fc25.exe", "eldenring.exe", "cyberpunk2077.exe",
    "witcher3.exe", "baldursgate3.exe", "bg3.exe", "bg3_dx11.exe", "rust.exe",
    "ark.exe", "deadbydaylight.exe", "fallguys_client.exe", "amongus.exe",
    "terraria.exe", "stardew valley.exe", "seaofthieves.exe", "palworld-win64-shipping.exe",
    "helldivers2.exe", "marvelrivals.exe", "blackmythwukong.exe", "wukong.exe",
    "subnautica.exe", "hollow_knight.exe", "civ6.exe", "civilizationvi.exe",
    "totalwar.exe", "warhammer.exe", "smite.exe", "tarkov.exe", "escapefromtarkov.exe",
    "huntgame.exe", "payday2_win32_release.exe", "payday3client-win64-shipping.exe",
    "worldoftanks.exe", "worldofwarships.exe", "warthunder.exe", "aces.exe",
    "forza_horizon5.exe", "forzahorizon4.exe", "thesims4.exe", "ts4_x64.exe",
    "eurotrucks2.exe", "beamng.drive.x64.exe", "flightsimulator.exe", "cities2.exe",
    "cities.exe", "mountandblade2.exe", "bannerlord.exe", "ageofempires2de.exe",
    "aoe4.exe", "diablo iv.exe", "diabloiv.exe", "diablo iii.exe", "wow.exe",
    "wowclassic.exe", "hearthstone.exe", "starcraft.exe", "sc2_x64.exe",
    "pathofexile.exe", "pathofexile_x64.exe", "poe2.exe", "lethal company.exe",
    "phasmophobia.exe", "content warning.exe", "valheim.exe", "vampiresurvivors.exe",
    "hadestwo.exe", "hades.exe", "celeste.exe", "bindingofisaac.exe", "isaac-ng.exe",
    "slaythespire.exe", "deadcells.exe", "cuphead.exe", "portal2.exe", "left4dead2.exe",
    "teamfortress2.exe", "hl2.exe", "garrysmod.exe", "gmod.exe", "solitaire.exe",
    "spider.exe", "freecell.exe", "winmine.exe", "minesweeper.exe", "chess.exe",
    "pinball.exe", "gameloop.exe", "crossfire.exe", "suddenattack.exe", "kartrider.exe"
}

# Desktop Trading, Forex & Crypto Executables
TRADING_PROCESSES: Set[str] = {
    # Desktop Forex / CFD Trading Platforms
    "terminal.exe", "terminal64.exe", "metatrader.exe", "metatrader4.exe", "metatrader5.exe",
    "ctrader.exe", "ninjatrader.exe", "thinkorswim.exe", "tws.exe",
    # Crypto Trading Desktop Apps
    "binance.exe", "bybit.exe", "okx.exe", "kucoin.exe", "wazirx.exe", "coindcx.exe",
    # Stock & Charting Desktop Apps
    "tradingview.exe", "zerodha.exe", "kite.exe", "upstox.exe", "groww.exe", "angelone.exe",
    "fyers.exe", "dhan.exe", "motilaloswal.exe", "icicidirect.exe", "sharekhan.exe"
}

# 13 Game Launchers & Platforms
GAME_LAUNCHERS: Set[str] = {
    "steam.exe", "steamwebhelper.exe", "epicgameslauncher.exe", "riotclientservices.exe",
    "battle.net.exe", "upc.exe", "origin.exe", "ea.exe", "eadestop.exe",

    "gog_galaxy.exe", "ubisoftconnect.exe", "rockstargameslauncher.exe", "bethesda.net_launcher.exe"
}

# 16 Emulators
EMULATORS: Set[str] = {
    "bluestacks.exe", "hd-player.exe", "nox.exe", "noxvmhandle.exe",
    "ldplayer.exe", "ldplayer9.exe", "memu.exe", "memuconsole.exe",
    "gameloop.exe", "retroarch.exe", "pcsx2.exe", "pcsx2-qtx64.exe",
    "rpcs3.exe", "yuzu.exe", "ryujinx.exe", "dolphin.exe", "cemu.exe",
    "ppssppwindows64.exe", "desmume.exe", "citra-qt.exe", "vba.exe"
}

# 14 Anti-AFK Jigglers & Automation Bots
ANTI_AFK_JIGGLERS: Set[str] = {
    "caffeine.exe", "mousejiggler.exe", "jiggler.exe", "autoclicker.exe",
    "tinytask.exe", "movemouse.exe", "automouse.exe", "clicker.exe",
    "opautoclicker.exe", "gsautoclicker.exe", "ghostmouse.exe", "macrogamer.exe",
    "speedautoclicker.exe", "stayawake.exe", "dontsleep.exe"
}

# 43 Browser-Title & Web Patterns (Web Games, Streaming, Betting, Gambling)
BROWSER_PATTERNS: List[Dict[str, str]] = [
    # Casual & IO Web Games
    {"pattern": "poki", "category": "Web Game", "name": "Poki Games"},
    {"pattern": "crazygames", "category": "Web Game", "name": "CrazyGames"},
    {"pattern": "krunker.io", "category": "Web Game", "name": "Krunker.io"},
    {"pattern": "agar.io", "category": "Web Game", "name": "Agar.io"},
    {"pattern": "slither.io", "category": "Web Game", "name": "Slither.io"},
    {"pattern": "survev.io", "category": "Web Game", "name": "Survev.io"},
    {"pattern": "1v1.lol", "category": "Web Game", "name": "1v1.LOL"},
    {"pattern": "smash karts", "category": "Web Game", "name": "Smash Karts"},
    {"pattern": "shell shockers", "category": "Web Game", "name": "Shell Shockers"},
    {"pattern": "chess.com", "category": "Web Game", "name": "Chess.com"},
    {"pattern": "lichess.org", "category": "Web Game", "name": "Lichess"},
    {"pattern": "miniclip", "category": "Web Game", "name": "Miniclip"},
    {"pattern": "armorgames", "category": "Web Game", "name": "Armor Games"},
    {"pattern": "coolmath games", "category": "Web Game", "name": "Coolmath Games"},
    {"pattern": "roblox.com/games", "category": "Web Game", "name": "Roblox Web"},
    {"pattern": "geoguessr", "category": "Web Game", "name": "GeoGuessr"},

    # Betting & Gambling Portals
    {"pattern": "stake.com", "category": "Gambling", "name": "Stake Casino & Sports"},
    {"pattern": "stake.bet", "category": "Gambling", "name": "Stake Mirror"},
    {"pattern": "bet365", "category": "Gambling", "name": "Bet365 Sports"},
    {"pattern": "1xbet", "category": "Gambling", "name": "1xBet"},
    {"pattern": "dream11", "category": "Gambling", "name": "Dream11 Fantasy"},
    {"pattern": "rummy", "category": "Gambling", "name": "Online Rummy"},
    {"pattern": "junglee rummy", "category": "Gambling", "name": "Junglee Rummy"},
    {"pattern": "mpl.live", "category": "Gambling", "name": "Mobile Premier League"},
    {"pattern": "my11circle", "category": "Gambling", "name": "My11Circle"},
    {"pattern": "parimatch", "category": "Gambling", "name": "Parimatch"},
    {"pattern": "betway", "category": "Gambling", "name": "Betway"},
    {"pattern": "bovada", "category": "Gambling", "name": "Bovada"},
    {"pattern": "888casino", "category": "Gambling", "name": "888 Casino"},
    {"pattern": "pokerstars", "category": "Gambling", "name": "PokerStars"},
    {"pattern": "betfair", "category": "Gambling", "name": "Betfair"},
    {"pattern": "unibet", "category": "Gambling", "name": "Unibet"},
    {"pattern": "dafabet", "category": "Gambling", "name": "Dafabet"},
    {"pattern": "melbet", "category": "Gambling", "name": "Melbet"},
    {"pattern": "mostbet", "category": "Gambling", "name": "Mostbet"},

    # Entertainment & Game Streaming
    {"pattern": "twitch.tv", "category": "Streaming", "name": "Twitch Stream"},
    {"pattern": "youtube.com/watch", "category": "Streaming", "name": "YouTube Video"},
    {"pattern": "kick.com", "category": "Streaming", "name": "Kick Streaming"},
    {"pattern": "netflix.com", "category": "Streaming", "name": "Netflix"},
    {"pattern": "primevideo.com", "category": "Streaming", "name": "Amazon Prime Video"},
    {"pattern": "disneyplus.com", "category": "Streaming", "name": "Disney+"},
    {"pattern": "hotstar.com", "category": "Streaming", "name": "JioCinema / Hotstar"},
    {"pattern": "hulu.com", "category": "Streaming", "name": "Hulu"},
    {"pattern": "zee5", "category": "Streaming", "name": "Zee5 Entertainment"},
    {"pattern": "zee 5", "category": "Streaming", "name": "Zee5 Entertainment"},
    {"pattern": "sonyliv", "category": "Streaming", "name": "Sony LIV"},
    {"pattern": "sony liv", "category": "Streaming", "name": "Sony LIV"},
    {"pattern": "spotify", "category": "Streaming", "name": "Spotify Music"},


    # Trading, Crypto & Stock Portals
    {"pattern": "tradingview.com", "category": "Trading", "name": "TradingView Charts"},
    {"pattern": "binance.com", "category": "Trading", "name": "Binance Crypto"},
    {"pattern": "bybit.com", "category": "Trading", "name": "Bybit Exchange"},
    {"pattern": "zerodha.com", "category": "Trading", "name": "Zerodha Kite"},
    {"pattern": "kite.zerodha", "category": "Trading", "name": "Zerodha Kite Web"},
    {"pattern": "groww.in", "category": "Trading", "name": "Groww Stocks & Mutual Funds"},
    {"pattern": "upstox.com", "category": "Trading", "name": "Upstox Pro"},
    {"pattern": "angelone.in", "category": "Trading", "name": "Angel One"},
    {"pattern": "wazirx.com", "category": "Trading", "name": "WazirX Crypto"},
    {"pattern": "coindcx.com", "category": "Trading", "name": "CoinDCX"},
    {"pattern": "olymptrade.com", "category": "Trading", "name": "Olymp Trade"},
    {"pattern": "binomo.com", "category": "Trading", "name": "Binomo"},
    {"pattern": "iqoption.com", "category": "Trading", "name": "IQ Option"},
    {"pattern": "quotex.io", "category": "Trading", "name": "Quotex"},
    {"pattern": "pocketoption.com", "category": "Trading", "name": "Pocket Option"},
    {"pattern": "exness.com", "category": "Trading", "name": "Exness Forex"},
    {"pattern": "octafx.com", "category": "Trading", "name": "OctaFX"},
    {"pattern": "dhan.co", "category": "Trading", "name": "Dhan Trading"},
    {"pattern": "fyers.in", "category": "Trading", "name": "Fyers Web"}
]


# 27-App Productivity Whitelist (Strictly Safe)
PRODUCTIVITY_WHITELIST: Set[str] = {
    "code.exe", "pycharm64.exe", "idea64.exe", "clion64.exe", "devenv.exe",
    "sublime_text.exe", "notepad++.exe", "figma.exe", "slack.exe", "teams.exe",
    "discord.exe", "zoom.exe", "excel.exe", "winword.exe", "powerpnt.exe",
    "outlook.exe", "postman.exe", "insomnia.exe", "dbeaver.exe", "navicat.exe",
    "chrome.exe", "msedge.exe", "firefox.exe", "notion.exe", "obsidian.exe",
    "windowsterminal.exe", "powershell.exe", "cmd.exe", "git-bash.exe"
}

# 13 Known Gaming Port Ranges
GAMING_PORT_RANGES = [
    {"name": "Steam Matchmaking", "ports": range(27015, 27031)},
    {"name": "Steam Friends/Master", "ports": range(27000, 27015)},
    {"name": "League of Legends Game", "ports": range(5000, 5501)},
    {"name": "Valorant Game", "ports": range(7000, 8000)},
    {"name": "Parsec Game Streaming", "ports": range(9000, 9011)},
    {"name": "Moonlight / Sunshine Game Streaming", "ports": range(47984, 48011)},
    {"name": "Geforce NOW Streaming", "ports": range(49003, 49010)},
    {"name": "Blizzard Battle.net", "ports": range(1119, 1121)},
    {"name": "EA Origin", "ports": range(9960, 9970)},
    {"name": "PlayStation Remote", "ports": range(9295, 9305)},
    {"name": "Xbox Live Gaming", "ports": range(3074, 3075)},
    {"name": "Apex Legends Traffic", "ports": range(37015, 37025)},
    {"name": "Rust Server Connection", "ports": range(28015, 28020)}
]

# 33 Evasion & Remote Bypass Processes
EVASION_PROCESSES: Set[str] = {
    "parsec.exe", "parsecd.exe", "geforcenow.exe", "moonlight.exe", "sunshine.exe",
    "anydesk.exe", "teamviewer.exe", "teamviewer_service.exe", "rustdesk.exe",
    "ultraviewer.exe", "remotedesktop.exe", "vncserver.exe", "tv_w32.exe",
    "autohotkey.exe", "autohotkeyu64.exe", "ahk2exe.exe", "processhacker.exe",
    "cheatengine-x86_64.exe", "cheatengine-i386.exe", "x64dbg.exe", "x32dbg.exe",
    "ida64.exe", "wireshark.exe", "fiddler.exe", "sandboxie.exe", "sandboxierpcss.exe",
    "vmware.exe", "vmware-vmx.exe", "virtualbox.exe", "vboxheadless.exe",
    "qemu-system-x86_64.exe", "wsl.exe", "dps.exe"
}
