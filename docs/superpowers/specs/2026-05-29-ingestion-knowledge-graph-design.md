# Ingestion + Knowledge Graph — Design Spec

**Project:** SIX "Build the Company Brain – Unlocking Knowledge" (Hack Zurich)
**Date:** 2026-05-29
**Scope of this spec:** The **ingestion pipeline** and **knowledge graph** only. The conversational "brain" (audio/text Q&A) is a separate workstream; this spec defines the clean seam it consumes (§9).

---

## 1. Goal

Turn the heterogeneous corpus in the repo (regulatory PDFs, FinDatEx template spreadsheets, an attribute-mapping spreadsheet, SME interview transcripts) into a queryable, **traceable**, **governed** knowledge graph that the Company Brain can reason over — capturing both **authoritative domain facts** and **anonymized tacit expert reasoning**.

Hackathon judging criteria this design targets directly:
- **Traceability & trust** — every answer traces to a source document + passage.
- **Governance & access control** — every node carries a sensitivity label.
- **Sustainable / reusable knowledge** — tacit expert reasoning is captured, anonymized, and reusable after the expert leaves.

## 2. Key requirements & constraints (from brainstorm)

1. **Blended graph** — curated domain backbone + LLM-extracted expert reasoning hung off it.
2. **Anonymize people** — SME names (e.g. transcript participants) become **roles** ("Compliance Officer"); real names never enter the graph.
3. **Graph store: Neo4j local (Docker)** now, **Neo4j Aura free tier** later — switch via env/config only, no code change.
4. **Provider-agnostic by design, Anthropic by default** — LLM extraction sits behind a provider interface; only the Anthropic (Claude Sonnet) adapter is implemented now. OpenAI/Ollama are documented stubs (≈30 lines each to fill).
5. **Embeddings are local + free** — sentence-transformers on-device (Anthropic has no embeddings API; keeps Claude credits for extraction; keeps sensitive docs on-device).
6. **Budget:** ~$25 Claude credits. Full-corpus ingest target **$5–10** via Sonnet + prompt-cached ontology + idempotent re-runs.
7. **Ingest the full corpus** (all repo files).
8. **Source-agnostic pipeline** — PDFs, spreadsheets, transcripts, and **future chat-conversation logs** all normalize into one internal `Document` representation. The feedback loop (brain Q&A → re-ingested) is a later plug-in, not a rewrite.
9. **Stack:** Python.

## 3. Extraction strategy (chosen: Hybrid backbone + guided extraction)

- **Structured files** (attribute spreadsheet, EMT/EET templates) → parsed **deterministically** with pandas/openpyxl into exact graph nodes/edges. **No LLM, no cost, no hallucination.** This is the authoritative spine.
- **Unstructured files** (PDFs, handbooks, transcripts, future audio) → normalized to markdown, chunked, then **ontology-guided LLM extraction** into the core types, allowed to add free-form `Insight`/`Concept` nodes, each tagged with its source chunk.

Rejected alternatives: pure fixed-ontology (too rigid, drops unanticipated knowledge, won't absorb chat feedback); pure open GraphRAG (noisy, inconsistent node identity, unreliable for an *authoritative/traceable* demo).

## 4. Document conversion

- **Unstructured → markdown: Microsoft `markitdown`.** One library for PDF/`.docx`/`.pptx`/HTML/audio; preserves headings/tables; LLM-friendly output; supports future audio transcription.
  - **Caveat:** `markitdown` extracts embedded PDF text but does **not OCR scanned pages**. The 9MB tax-navigator PDF may be image-based. Pipeline **logs low-yield extractions** so a near-empty doc is visible, not silently lost. Optional Tesseract OCR fallback if needed; otherwise consciously skip and log.
- **Structured → records: pandas/openpyxl.** Do **not** route structured grids through markitdown — flattening to a markdown table blob loses exact structure and would cost tokens to re-extract data we already have perfectly.

Both paths emit the same `Document` object; everything downstream is identical.

## 5. Component architecture

Modular, config-driven. Each module has one responsibility.

| Module | Responsibility | Key dependency |
|---|---|---|
| `config.py` | Single source of truth: Neo4j URI/user/pw, provider + model IDs, embedder name, paths, sensitivity defaults — all from env. **Local→Aura and provider swaps are env-only.** | — |
| `model.py` | The source-agnostic `Document` dataclass + `Chunk` dataclass | — |
| `loaders/structured.py` | Attribute sheet + EMT/EET → exact records | pandas/openpyxl |
| `loaders/unstructured.py` | PDF/docx/pptx/audio → markdown; logs low-yield (OCR caveat) | markitdown |
| `anonymize.py` | Strip person names → roles, **before** anything else sees the text | regex + Claude fallback |
| `chunk.py` | Split markdown by section with overlap → `Chunk` records | — |
| `embed.py` | Local sentence-transformer → vectors (depends on `Embedder` protocol) | sentence-transformers |
| `providers/` | `LLMProvider` + `Embedder` protocols; `AnthropicProvider` (impl), OpenAI/Ollama (stubs) | anthropic SDK |
| `backbone.py` | Deterministic MERGE of structured records → curated nodes/edges | neo4j driver |
| `extract.py` | Ontology-guided extraction via `LLMProvider` → entities/insights tagged w/ chunk_id | (provider protocol) |
| `graph.py` | Idempotent MERGE writer; node/edge upserts + provenance; vector-index mgmt | neo4j driver |
| `ingest.py` | CLI orchestrator over a directory; idempotent; per-doc logging; cost tracking | — |

## 6. The `Document` interface (universal)

```python
@dataclass
class Document:
    doc_id: str
    source_path: str
    source_type: str          # "pdf" | "xlsx" | "docx" | "conversation"
    title: str
    domain: str               # inferred from filename prefix: MiFID | MiFIR | SFDR | ESG | FATCA | tax | general
    sensitivity: str          # "C2 Internal" default; "Confidential" for the master-data PDF
    markdown: str | None = None   # set on the unstructured path
    records: list[dict] | None = None  # set on the structured path
    ingested_at: str = ...
```

A future chat conversation arrives as `source_type="conversation"` and flows the **same** path → feedback loop is free.

## 7. Provider abstraction (lock-in avoidance)

```python
class LLMProvider(Protocol):
    def extract(self, system: str, text: str, schema: dict) -> dict: ...

class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...
    @property
    def dim(self) -> int: ...
```

- `extract.py` / `embed.py` depend only on the **protocol**, never an SDK.
- Selected by env: `LLM_PROVIDER=anthropic` (default), `EMBEDDER=local` (default).
- **Implemented now:** `AnthropicProvider` (Claude Sonnet, tool-use for structured output), `LocalEmbedder` (sentence-transformers, e.g. `bge-small`, 384-dim).
- **Documented stubs:** `OpenAIProvider`, `OllamaProvider` (offline), `OpenAIEmbedder`. Filling a stub = ~30 lines, no refactor.
- **Caveat — embedding dimension is provider-specific.** The Neo4j vector index is created from `embedder.dim` in config. Swapping embedders requires a documented `reindex` command (re-embed + recreate index); the graph structure is untouched.
- **Caveat — structured output differs per provider.** Each adapter absorbs its own quirk (Anthropic tool-use / OpenAI JSON-schema / Ollama `format=json`); the interface stays identical. Fully-local (Ollama) trades extraction quality, not architecture.

## 8. Graph ontology

**Nodes**
- `:Regulation` {name, jurisdiction, aliases} — MiFIR, MiFID II, SFDR, FATCA, ESG/Taxonomy
- `:DataAttribute` {name, description} — "Reportable Instrument", "Complex/Non-complex", "GHG emissions", "FATCA in scope", …
- `:InstrumentType` {name} — "structured note", "ESG-linked structured product"
- `:Obligation` {text} — what a regulation requires (extracted)
- `:Concept` {name} — free-form topics ("product governance", "grandfathering")
- `:Insight` {text, role} — **anonymized tacit reasoning** (role, never a name)
- `:Document` {title, source_type, sensitivity, domain}
- `:Chunk` {text, ordinal, embedding}

**Relationships**

```
Backbone (deterministic, from spreadsheets — cannot hallucinate):
  (:Regulation)-[:REQUIRES]->(:DataAttribute)
  (:DataAttribute)-[:APPLIES_TO]->(:InstrumentType)
  (:Regulation)-[:GOVERNS]->(:InstrumentType)

Reasoning layer (LLM-extracted):
  (:Regulation)-[:DEFINES]->(:Obligation)
  (:Insight)-[:ABOUT]->(:Regulation | :InstrumentType | :DataAttribute)
  (:Concept)-[:RELATED_TO]->(:Concept)

Provenance (every extracted thing traces home):
  (:Entity)-[:MENTIONED_IN]->(:Chunk)
  (:Insight)-[:DERIVED_FROM]->(:Chunk)
  (:Chunk)-[:PART_OF]->(:Document)
```

**Entity resolution:** LLM-extracted entities MERGE against the deterministic backbone by canonical name + type (+ alias list), so "MiFIR" mentioned in a PDF links to the existing backbone node rather than creating a duplicate.

## 9. Data flow

```
file ─▶ structured?  ──yes──▶ pandas/openpyxl ─▶ Document(records) ─▶ backbone.MERGE ─┐
        │                                                                              │
        └──no──▶ markitdown ─▶ Document(markdown) ─▶ anonymize ─▶ chunk ─▶ embed ──┐  │
                                                                                   ▼  ▼
                                                          extract (guided, provider) ─▶ entity-resolve
                                                                                       │
                                                                                       ▼
                                                              graph.MERGE (nodes + edges + provenance)
                                                                                       │
                                                                                       ▼
                                                                  Neo4j  +  vector index on :Chunk
```

## 10. Handoff to the chat workstream

This workstream exposes **one function**:

```python
def query(question: str, max_sensitivity: str = "C2 Internal") -> {
    "context": [...],      # backbone facts + insights relevant to the question
    "citations": [...]     # {doc_title, sensitivity, chunk_text} per claim
}
```

Internals: vector search on `:Chunk` embeddings → graph expansion (Cypher) around hits → return backbone facts + insights **with** provenance. The `max_sensitivity` arg enforces access control at query time. The chat team owns answer generation; retrieval internals stay here.

## 11. Governance / traceability / anonymization

- Every node traces to `Chunk`→`Document`→sensitivity label → answers cite sources and can filter by access level.
- Anonymization runs **once at ingestion**; names never reach the graph. Transcript headers already pair name→role (e.g. "Walter (Compliance Officer)"), used as the primary mapping; a Claude/regex pass catches remaining inline mentions.
- The deterministic backbone means authoritative facts **cannot** be hallucinated.

## 12. Cost controls

- Claude **Sonnet** for extraction (not Opus).
- **Prompt caching** on the ontology/system prompt (re-sent for every chunk).
- **Idempotent MERGE** — re-runs only re-extract changed docs (hash-based skip).
- **Local embeddings** = $0.
- Target: full-corpus ingest **$5–10**.

## 13. Tech stack

Python · markitdown · pandas/openpyxl · anthropic SDK (Sonnet, tool-use structured output, prompt caching) · sentence-transformers (local embeddings) · neo4j Python driver · Neo4j local Docker (→ Aura via env).

## 14. Out of scope (this spec)

- The conversational brain UI / audio capture / answer generation (separate workstream; consumes §10).
- The feedback loop that re-ingests brain conversations (designed-for via §6, but built later).
- Production hosting, auth/SSO, multi-tenant access control beyond the sensitivity-label filter.

## 15. Open questions / decisions deferred

- OCR fallback for scanned PDFs: implement Tesseract or skip-and-log? **Default: skip-and-log; revisit if a key doc comes back empty.**
- Anonymization robustness: regex+Claude vs dedicated NER (spaCy/Presidio). **Default: regex+Claude for hackathon; Presidio is a drop-in upgrade behind `anonymize.py`.**
- Chunking granularity (section vs fixed-token) — tune during implementation against extraction quality.
