"""
anuvadini_detector.proctor
==========================
Enhanced Employee Monitoring (Proctor) package.

Sub-modules
-----------
agent   — agent-side: ProctorMode, webcam capture, liveness challenges
db      — MongoDB persistence: watches, events, challenges, snapshots
routes  — FastAPI route handlers (registered by server.py via include_router)
"""

# Re-export the symbols that agent.py imports, so the import path stays identical.
from anuvadini_detector.proctor.agent import (   # noqa: F401
    ProctorMode,
    handle_liveness_challenge,
    post_proctor_event,
)
