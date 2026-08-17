import os

# jam-station's brain. Reached over the slab docker network by service name (like
# jam-radio's BRAIN_URL wire in ../../system.toml), NOT the jam-brain.localhost host-only
# route those host-side tools use — a container can't reach the host's loopback proxy.
# The /api/internal/* calls still need Host: jam-brain.localhost to pass _is_internal's
# gate (brain/app/main.py) — set explicitly per-request in brain_client.py, independent of
# which address we actually connect to.
BRAIN_URL = os.environ.get("BRAIN_URL", "http://jam-brain:8080")
BRAIN_INTERNAL_HOST = "jam-brain.localhost"
BRAIN_SESSION_COOKIE = os.environ.get("BRAIN_SESSION_COOKIE", "jam_session")

# jam-listen is completely open — no sign-in. The brain still gates private content
# (the shelf, the attic, private streams) behind a member session, so this app acts as
# ONE fixed jam-station member for every visitor. Must be an approved member email in
# jam-station's own table.
SERVICE_EMAIL = os.environ.get("SERVICE_EMAIL", "jmimick@gmail.com")
