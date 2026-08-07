import os

# Identity-only keyring integration (see keyring/docs/AGENT-INTEGRATION-GUIDE.md, Mode 1 —
# `attic` is the reference). jam-station keeps deciding who's an approved member; keyring
# only proves the email is real.
KEYRING_URL = os.environ.get("KEYRING_URL", "https://keyring.runslab.run")
KEYRING_COOKIE = "keyring_session"
APP_SLUG = os.environ.get("APP_SLUG", "jam-listen")   # branding only, no RBAC registration

# This app's own public URL — keyring only redirects back to a *.runslab.run origin.
PUBLIC_URL = os.environ.get("PUBLIC_URL", "https://jam-listen.runslab.run")

# jam-station's brain. Reached over the slab docker network by service name (like
# jam-radio's BRAIN_URL wire in ../../system.toml), NOT the jam-brain.localhost host-only
# route those host-side tools use — a container can't reach the host's loopback proxy.
# The /api/internal/* calls still need Host: jam-brain.localhost to pass _is_internal's
# gate (brain/app/main.py) — set explicitly per-request in brain_client.py, independent of
# which address we actually connect to.
BRAIN_URL = os.environ.get("BRAIN_URL", "http://jam-brain:8080")
BRAIN_INTERNAL_HOST = "jam-brain.localhost"
BRAIN_SESSION_COOKIE = os.environ.get("BRAIN_SESSION_COOKIE", "jam_session")
