# CLAUDE.md

Read `AGENTS.md` first — it's the canonical guide (what this is, layout, commands,
gotchas). Edit AGENTS.md, not this file, when guidance changes. Design rationale and
visual system: `docs/DESIGN-jam-listen.md`.

Quick reference:

```bash
npm install && npm run dev
cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd server && .venv/bin/uvicorn app.main:app --reload --port 8000
npm run build
```
