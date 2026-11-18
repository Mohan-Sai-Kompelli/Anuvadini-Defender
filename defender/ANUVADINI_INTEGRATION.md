# Defender inside Anuvadini Attendance

The detector project lives here unchanged in behaviour (engine, agents, firewall, signatures, installers).
Only the admin UI moved: the old `templates/` + `static/` dashboard is replaced by the React pages under
`client/src/pages/defender/` (themed like the rest of Anuvadini Attendance).

```
Browser (Anuvadini login) -> Express  /api/defender/*  -> Defender service (FastAPI, port 8055)
Employee PC agents        ----------------------------> Defender service (port 8055, agent endpoints only)
```

* `server/routes/defender.js` is the gateway. It requires an organisation-admin login, forwards only the
  admin endpoints listed in its allow-list, and never forwards cookies, so the Defender service keeps seeing a
  loopback caller. Agent endpoints (`/api/fleet/register|heartbeat|stream-frame|policy|firewall-event`, `/api/agent/*`,
  `/api/employee/*`, `/api/admin/*`) are NOT reachable through it.
* Start the engine: `cd defender && python main.py` (or set `DEFENDER_AUTOSTART=1` for the API server to do it).
* Env (all optional): `DEFENDER_HOST` (default 127.0.0.1; use 0.0.0.0 so LAN agents can report),
  `DEFENDER_PORT` (8055), `DEFENDER_NO_BROWSER=1`, `DEFENDER_SEED_DEMO=1` (adds fake demo PCs; off by default),
  `MONGO_URI`, `MONGO_DB_NAME`, `ANUVADINI_ADMIN_PASSWORD`.
* Changes versus the original detector: demo fleet is opt-in, CPU/RAM are no longer invented when an agent does not
  send them, host/port come from the environment.
