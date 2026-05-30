# TODO / Backlog

Deferred work items, most recent first.

---

## SESSION HANDOFF — 2026-05-30

**Where things stand (read this first in a new session):**

- **Engine is built & working end-to-end on real data.** Ingestion → Neo4j knowledge graph → `query()` seam. Verified with a real ingest (OpenAI embeddings + Anthropic Sonnet extraction).
- **Live Neo4j is running** on `bolt://localhost:7687` (`neo4j`/`testpassword`, Docker container `six_hack_zurich-neo4j-1`) holding real data: backbone (MiFIR/MiFID, SFDR, FATCA + LLM-extracted reg structure), the SME transcript insights, and a **partial FATCA ingest (38/290 chunks extracted, 254 pending)**.
- **Resume the FATCA ingest anytime:** `EMBEDDER=openai EMBEDDING_MODEL=text-embedding-3-small python -m company_brain.ingest sample_corpus` — it skips done chunks (checkpointed) and finishes the rest (~254 chunks = real $ cost).
- **⚠️ Do NOT run the Neo4j integration tests against 7687** — the test fixtures `MATCH (n) DETACH DELETE n` and will wipe the graph. Use a throwaway container: `docker run -d --name neo4j_test -p 7688:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5.23` then `NEO4J_URI=bolt://localhost:7688 NEO4J_PASSWORD=testpassword pytest`.
- **`.env` quirks:** `EMBEDDER` is still `local` in `.env` (override on CLI as above for OpenAI). LLM is Anthropic (`ANTHROPIC_API_KEY` set). `OPENAI_API_KEY` set (real OpenAI, for embeddings). OpenRouter LLM path is NOT wired (OpenAIProvider in `providers/llm.py` is still a stub).

**Uncommitted work from this session (on disk, not committed — user controls commits):**
- `model.py` → Pydantic v2 BaseModels (FastAPI-ready); `pydantic>=2` added to deps.
- `providers/embedder.py` → `OpenAIEmbedder` implemented (text-embedding-3); `config.py` + `.env.example` add `OPENAI_API_KEY`/`OPENAI_BASE_URL`/`EMBEDDING_DIM`.
- `graph.py` + `ingest.py` → **resumable ingestion** (`pending_chunks`/`mark_extracted`, per-chunk checkpoint) + robustness fixes (skip malformed LLM items, null-endpoint guard, per-chunk error isolation).
- Test fixtures self-heal the vector index (`DROP INDEX chunk_vec`) for dim changes; new resume + malformed-item tests.
- `scripts/visualize_graph.py` (+ `graph_viz*.html`), `sample_corpus/`, this `TODO.md`.
- **All tests green** (33+ via pure-logic + throwaway Neo4j).

**Next features (user will do in a new session):**
1. `Settings` → `pydantic-settings.BaseSettings` (idiomatic FastAPI config). **Recommended first.**
2. Extraction output (`extract.py`) → Pydantic models; derive Anthropic tool schema from `.model_json_schema()`.
3. `query()` result → `QueryResponse` Pydantic model (FastAPI `response_model`).
4. Stand up the **FastAPI app** consuming `query()` + the ingestion entry point.
5. Tune `CHUNK_MAX_CHARS` up / page caps before big-doc ingest (FATCA over-chunks → 290 chunks).
6. (Optional) Wire `OpenAIProvider` (LLM) → OpenRouter.

---

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
