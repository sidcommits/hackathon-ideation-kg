# TODO / Backlog

Deferred work items, most recent first.

---

## SESSION HANDOFF — 2026-05-30 (chat layer + Aura)

**Where things stand (read this first in a new session):**

- **The full conversational layer is built** on branch `feat/company-brain-chat`: a FastAPI backend (`api/`) + a Next.js frontend (`web/`) on top of the engine. A real Claude **tool-use agent loop** streams typed SSE events from `POST /chat` that drive the chat, the **tool-call cards** (visible reasoning trace), and a **conversation-reactive knowledge graph**. Tools: `search_knowledge`, `expand_graph`, `lookup_backbone`. See `architecture.md` (full-system, 8 diagrams) and `superpowers/{specs,plans}/2026-05-30-company-brain-chat*`.
- **Graph is on Neo4j Aura now (shared with the team).** `.env` `NEO4J_*` points at `neo4j+s://e3874057.databases.neo4j.io` (user = the instance id; local Docker is commented as a fallback). Migrated non-destructively via `scripts/migrate_to_aura.py` — 881 nodes / 2,787 edges, **embeddings + vector index preserved**, counts verified. Future `ingest` runs write to Aura and `MERGE` additively (cumulative; no re-migration).
- **Corpus loaded on Aura:** `sample_corpus` (3 docs → 46 chunks, ~240 `Insight` nodes, ~2,787 edges): the SFDR ESAs report + the SME transcript + the `SIX_Data Attributes.xlsx` backbone. Add the rest later: `python -m company_brain.ingest <dir>`.
- **Providers:** `EMBEDDER=openai`, `EMBEDDING_MODEL=text-embedding-3-small` (1536-d); `LLM_PROVIDER=anthropic` (`claude-sonnet-4-6`). Keys live in `.env` (gitignored — rotate if the repo/transcript is ever shared).
- **Tests green:** backend **58** (`pytest -m "not integration"`) incl. the real access-control leak test; frontend **13 Vitest + 1 Playwright** (`cd web && npm test` / `npx playwright test`).
- **Run the demo:** `python -m uvicorn api.main:app --port 8000` + `cd web && npm run dev` → http://localhost:3000. **Restart uvicorn after any `.env` change** — it caches the store/embedder via `lru_cache`.

**⚠️ Standing rules (do not break):**
- **Never wipe the graph** — no `MATCH (n) DETACH DELETE n`, no dropping the `chunk_vec` index, no destructive "fixes" — unless explicitly told. The Neo4j **integration tests** run `DETACH DELETE` and will wipe whatever DB they point at: **never run them against the live store** (Aura or `:7687`); use a throwaway container on `:7688`.
- **No `git push`** without an explicit ask. (Per-task local commits during the chat build were authorized.)

**Notable fixes this session:** `sse-starlette` emits **CRLF** (`\r\n\r\n`) SSE frame separators; the frontend parser now normalizes CRLF→LF (was rendering a blank chat before). Reducer clears tool cards per turn + surfaces `error` events; agent reports honest `stop_reason` on max-turns.

**Next (toward the full PRD vision — see `PRD.md` / `new_PRD_v2.md`):**
1. **Full-corpus ingest on Aura** (the long PDFs are the real $ cost — tune `CHUNK_MAX_CHARS` / add page caps first; FATCA over-chunked to ~290).
2. **v2 voice / avatar** ("talk to it", ChatGPT-voice style) — the SSE event union is intentionally open for additive `transcript` / `audio` event types, so this is additive, not a rewrite.
3. **Curation / HITL panel** (post-conversation proposed inferences → confirm / improve / deny → graph) — FR-EN-* in the PRD.
4. **Conversation feedback loop** — ingest finished chats as `source_type="conversation"` (designed in the engine, not yet wired).
5. **In-product ingestion status** (below).

---

## Ingestion status visualization (in-product)
**Status:** 💡 IDEA (captured 2026-05-30) — implement later.
**Why:** Ingest progress is currently only visible via CLI logs + manual `pgrep` + ad-hoc Cypher counts. Surface it *in the product* so progress is visible and demo-able without the terminal (and so a long ingest isn't a black box).

**What we check by hand today (= exactly what to productize):**
- whether an ingest is running (process check)
- extracted / total chunks (the progress-bar metric)
- per-label node counts (Document / Chunk / Regulation / DataAttribute / InstrumentType / Obligation / Concept / Insight) + total edges
- the final `DONE: {summary}` line / a last-run timestamp

**MVP:**
- Backend `GET /ingest/status` → JSON `{running, documents, chunks, extracted, total, by_label:{...}, edges, last_run_ts}`. Counts via the same Cypher we run manually; `running` via a lightweight flag/lockfile written by `ingest.py` (or a process check).
- Frontend: a small status card — progress bar (extracted/total), live node-type counts, running/idle pill, last-run time. Poll ~2s.

**Stretch:**
- Stream progress over **SSE** (reuse the existing event-stream infra from `/chat`) so it updates live during ingest instead of polling.
- Tie into **GraphCanvas** so the graph visibly *grows* as ingestion proceeds — strong demo moment.
- Kick off ingest from the UI (select/upload corpus → `POST /ingest`) instead of the CLI.

**Touch points:** `ingest.py` (emit a progress heartbeat + write a status record), a new `api/` route, a frontend status component. Reuse the counts logic from `scripts/visualize_graph.py` / the Cypher we've been running this session.

## Resumable ingestion (checkpoint / state pointer)
**Status:** ✅ DONE (2026-05-30) — implemented & tested. Kept below for reference.
**Why:** Re-running ingestion after an error/kill is idempotent (no duplicate nodes) but NOT cost-saving — it re-embeds and re-extracts every chunk, including completed ones. The FATCA PDF (290 chunks) made this painful.

**Agreed design — per-chunk checkpoint, graph as the state store (no separate file):**
- Mark a chunk done only AFTER its extraction is successfully written: set `c.extracted = true` (+ store `c.text` as a fingerprint).
- On (re-)ingest, before embedding/extracting an unstructured doc: chunk first (free), query which of this doc's chunk_ids are already `extracted = true` with matching text, and **skip those** — no embed call, no Claude call.
- A fully-done document becomes "0 pending chunks" → effectively skipped for free.
- Editing a source file → only changed chunks (different text) re-process.

**Touch points (~3):**
1. `graph.py` — `upsert_chunk` stores text; add `mark_extracted(chunk_id)`; add `pending_chunks(chunk_ids, texts)` returning only not-yet-done ones.
2. `ingest.py` — embed + extract only the pending chunks; mark each done as it finishes.
3. `Chunk` schema — a boolean `extracted` property (no new index needed).

**Granularity note:** chunk is the unit of resumption — if extraction dies mid-chunk, that one chunk re-runs on resume (cheap; MERGE keeps it safe).
**Rejected alternative:** separate JSON/SQLite checkpoint file — adds a second store to keep in sync; unnecessary since the graph already holds the chunks.
**Bonus:** this also closes the spec's "hash-based skip" gap (§12 / known limitations).

## Other deferred items
- Tune chunk size / add page caps before ingesting large docs (290 chunks/PDF is too many LLM calls).
- Label fragmentation: same name typed under two labels (e.g. `Participating FFI` as both InstrumentType and Concept) — reconcile during extraction or post-ingest.
- Wire `OpenAIProvider` (LLM) → OpenRouter, if extraction should run through OpenRouter.
