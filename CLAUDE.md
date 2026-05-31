# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working agreement

**Default: do NOT `git commit` or `git push` unless the user explicitly asks.**

## What this repository is

**Hack Zurich / START Hack** workspace for the **SIX "Build the Company Brain"** challenge. A full-stack RAG + Knowledge Graph system that lets SIX employees query regulatory knowledge (MiFID II, SFDR, EU Taxonomy, FATCA) with source-cited answers and traceability.

### The challenge
Subject Matter Experts hold critical tacit knowledge about financial instrument coverage. The system must capture, retrieve, and explain that knowledge with citations and access control. Regulatory documents carry sensitivity labels (`C2 Internal` is default; `Confidential_SIX_master-data-openining-and-mutations-facsheet.pdf` is most restricted — never treat it as public).

---

## Architecture

The system has three layers:

### 1. Python backend — `src/company_brain/` (the brain)

Installed as an editable package (`pip install -e ".[api]"`). Key modules:

| Module | Role |
|---|---|
| `ingest.py` | CLI entry point — walks corpus files, routes to loaders, chunks, embeds, extracts entities |
| `loaders/router.py` | Detects file type (pdf/docx/pptx/xlsx) |
| `loaders/unstructured.py` | PDF/DOCX → markdown via `markitdown` |
| `loaders/structured.py` | XLSX → `Document.records` (backbone facts) |
| `chunk.py` | Splits markdown into overlapping `Chunk` objects |
| `extract.py` | LLM call (Claude) → entities/insights from chunk text |
| `backbone.py` | Upserts `SIX_Data Attributes.xlsx` rows as canonical Regulation→DataAttribute edges |
| `graph.py` | `GraphStore` — Neo4j driver wrapper with **destructive-query guard** and sensitivity-filtered vector search |
| `query.py` | Retrieval: vector search → graph expansion → context + citations |
| `providers/embedder.py` | `local` (sentence-transformers) or `openai` embedder |
| `providers/llm.py` | Anthropic / OpenAI / Ollama provider stubs |
| `anonymize.py` | Strips PII before storing chunks |
| `journal.py` | Append-only replay log (resume interrupted ingestion) |
| `config.py` | `get_settings()` — reads `.env` via pydantic-settings |
| `model.py` | `Document`, `Chunk`, `Record` dataclasses |

### 2. FastAPI server — `api/`

Starts with `uvicorn api.main:app`. Key endpoints:

| Endpoint | Description |
|---|---|
| `POST /chat` | SSE stream — drives the agentic loop (tool calls + citations) |
| `POST /v1/chat/completions` | OpenAI-compatible endpoint for **Beyond Presence** avatar (handles both `stream: true` SSE and `stream: false` JSON) |
| `GET /api/calls/{call_id}/events` | SSE stream — mirrors voice-turn events to web chat |
| `POST /api/calls` | Creates a LiveKit voice call session (Beyond Presence) |
| `POST /api/register-agent` | Registers a public tunnel URL as a Beyond Presence agent |
| `POST /api/transcribe` | Proxies audio → OpenAI STT (key stays server-side) |
| `GET /api/graph` | Returns a subgraph for the 3D force-graph visualiser |
| `POST /reflect` | Distills a conversation into durable "truths" (recursive improvement) |
| `POST /learnings/ingest` | Writes distilled truths back into Neo4j as `Insight` nodes |

`api/agent.py` — agentic loop: runs Claude with tools, emits typed SSE events. Voice mode splits output into `[SPOKEN]` (for avatar) and `[DETAIL]` (for web chat).

`api/tools.py` — three tools: `search_knowledge`, `expand_graph`, `lookup_backbone`.

`api/deps.py` — `@lru_cache` singletons for `GraphStore` and embedder; `ActiveCall` dataclass tracks per-session clearance level.

### 3. Next.js frontend — `web/`

| Path | Role |
|---|---|
| `app/page.tsx` | Root shell — wires layout |
| `components/ChatThread.tsx` | Renders SSE event stream as message bubbles |
| `components/AvatarStage.tsx` | Beyond Presence avatar LiveKit iframe |
| `components/GraphCanvas.tsx` | 3D force-graph (react-force-graph-3d) |
| `components/SourcesPanel.tsx` | Citation provenance sidebar |
| `components/ClearanceSelector.tsx` | Live data-sensitivity level toggle |
| `lib/useChat.ts` | Core hook — manages SSE connection, chat state, tool calls |
| `lib/useDictation.ts` | Browser mic → `/api/transcribe` → text |
| `lib/chatReducer.ts` | Pure reducer for chat state transitions |
| `lib/events.ts` | TypeScript types mirroring `api/events.py` |
| `lib/parseEventStream.ts` | Parses raw SSE bytes into typed event objects |

---

## Commands

### Backend

```bash
# Activate venv (always required first)
source .venv/bin/activate

# Start Neo4j (required before running the API)
docker compose up -d

# Run the API server
uvicorn api.main:app --reload --port 8000

# Ingest the corpus into Neo4j (run once, or incrementally)
python -m company_brain.ingest . --workers 4

# Run tests (unit only, no Neo4j needed)
pytest

# Run tests including integration (needs Neo4j running)
pytest -m integration

# Run a single test file
pytest tests/test_graph.py -v
```

### Frontend

```bash
cd web
npm run dev        # dev server at localhost:3000
npm run build      # production build
npm run lint       # eslint
npm test           # vitest (unit)
npx playwright test  # e2e
```

### Tunnel (for Beyond Presence avatar)

```bash
python scripts/auto_tunnel.py   # opens a public tunnel + auto-registers the agent
```

---

## Key constraints

**Destructive query guard** — `GraphStore.run()` blocks `DETACH DELETE` / `DROP INDEX` / `DROP CONSTRAINT` by default. To allow on local: `COMPANY_BRAIN_ALLOW_DESTRUCTIVE=1`. Also set `COMPANY_BRAIN_ALLOW_REMOTE_DESTRUCTIVE=1` for cloud (Aura). This guard exists because a dry-run demo wiped the live Aura graph.

**Sensitivity filtering** — every `Chunk` and `Document` carries a `sensitivity` field. `query()` and `vector_search()` accept `max_sensitivity` to gate access. Never skip this when building new retrieval paths.

**Provenance on every chunk** — `source` (filename), `page`/`sheet`, and `sensitivity` must be preserved. Traceability is an explicit grading criterion.

**Voice dual-output contract** — `[SPOKEN]` section (3-5 conversational sentences, no markdown) precedes `[DETAIL]` (full structured answer). The avatar consumes spoken only; the web chat gets both. Never omit `[DETAIL]`.

---

## Environment variables (`.env`)

```
NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD     # local Docker or Aura cloud
AURA_URI / AURA_USER / AURA_PASSWORD        # cloud credentials (swap for prod)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
EXTRACTION_MODEL=claude-sonnet-4-6
EMBEDDER=local                              # "local" or "openai"
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
OPENAI_API_KEY=...                          # needed for OpenAI embedder and STT
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
Bey=...                                     # Beyond Presence API key
avatarID=...                                # Beyond Presence avatar ID
CHUNK_MAX_CHARS=2000
CHUNK_OVERLAP_CHARS=200
MAX_PDF_PAGES=0                             # 0 = no cap
```

---

## The corpus

Root-level files grouped by filename prefix:

- **`SIX_Data Attributes.xlsx`** — spine of the domain; Regulation → DataAttribute mappings. Start here.
- **`EU_MiFID_*` / `EU_MIFIR_*`** — MiFID II/MiFIR directives, ESMA guidelines, EMT V4.3 template.
- **`EU_SFDR_*`** — SFDR regulation text and ESAs RTS final report.
- **`EU_ESG_*`** — taxonomy disclosure RTS + EET V1.1.3 template.
- **`US_FATCA.pdf` / `US_six-factsheet-fatca-en.pdf`** — FATCA reference + SIX factsheet.
- **`six-handbook-*.pdf`** — SIX navigator product handbooks.
- **`Confidential_SIX_master-data-*.pdf`** — most sensitive; access-control `Confidential`.
- **`*transcript.docx`** — SME interview transcripts; these are the tacit-knowledge ground truth.

The EMT and EET `.xlsx` files are schema templates, not populated datasets — use them to understand field structure.
