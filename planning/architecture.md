# Company Brain — Architecture Visualisation

> **Living document.** We update these diagrams as the architecture evolves, to keep the team aligned.
> Renders on GitHub and in any Mermaid-aware markdown preview (VS Code: "Markdown Preview Mermaid Support").
> Scope: **ingestion + knowledge graph** workstream. See the full design in
> [`superpowers/specs/2026-05-29-ingestion-knowledge-graph-design.md`](superpowers/specs/2026-05-29-ingestion-knowledge-graph-design.md).

**Version:** v0.1 — initial (2026-05-29)

---

## 1. Big picture — three workstreams


---

## 2. Ingestion pipeline — data flow

```mermaid
flowchart TD
    A["Source file"] --> B{Structured?}

    B -->|"Yes — attribute sheet, EMT/EET"| C["loaders/structured.py<br/>pandas / openpyxl"]
    B -->|"No — PDFs, handbooks, transcripts"| D["loaders/unstructured.py<br/>markitdown → markdown"]

    C --> E["Document(records)"]
    D --> F["Document(markdown)"]

    F --> G["anonymize.py<br/>names → roles"]
    G --> H["chunk.py<br/>section chunks + overlap"]
    H --> I["embed.py<br/>local sentence-transformer (free)"]

    E --> J["backbone.py<br/><b>deterministic</b> MERGE<br/>(no LLM, no hallucination)"]
    I --> K["extract.py<br/>ontology-guided extraction<br/>(Claude Sonnet)"]
    K --> L["entity resolution<br/>MERGE vs backbone<br/>(no duplicate nodes)"]

    J --> M[("Neo4j<br/>graph + vector index")]
    L --> M
    M --> N["query() → Chat workstream"]

    classDef det fill:#dff5e1,stroke:#2e7d32,color:#1b3d22;
    classDef llm fill:#e3f0ff,stroke:#1565c0,color:#0d2a4d;
    classDef store fill:#fff4d6,stroke:#b8860b,color:#4d3b00;
    class C,E,J det;
    class D,G,H,I,K,L llm;
    class M store;
```

**Legend:** 🟢 deterministic / no-cost · 🔵 LLM or embedding path · 🟡 store.

---

## 3. Knowledge graph ontology

```mermaid
flowchart LR
    REG["Regulation"]
    ATTR["DataAttribute"]
    INST["InstrumentType"]
    OBL["Obligation"]
    CON["Concept"]
    INS["Insight<br/>(role, anonymized)"]
    DOC["Document<br/>(sensitivity label)"]
    CHK["Chunk<br/>(embedding)"]

    %% Backbone — deterministic from spreadsheets
    REG -->|REQUIRES| ATTR
    ATTR -->|APPLIES_TO| INST
    REG -->|GOVERNS| INST

    %% Reasoning layer — LLM-extracted
    REG -->|DEFINES| OBL
    INS -->|ABOUT| REG
    INS -->|ABOUT| INST
    INS -->|ABOUT| ATTR
    CON -->|RELATED_TO| CON

    %% Provenance — everything traces home
    REG -.->|MENTIONED_IN| CHK
    OBL -.->|MENTIONED_IN| CHK
    INS -.->|DERIVED_FROM| CHK
    CHK -->|PART_OF| DOC

    classDef backbone fill:#dff5e1,stroke:#2e7d32,color:#1b3d22;
    classDef reason fill:#e3f0ff,stroke:#1565c0,color:#0d2a4d;
    classDef prov fill:#f3e8ff,stroke:#6a1b9a,color:#2e0a47;
    class REG,ATTR,INST backbone;
    class OBL,CON,INS reason;
    class DOC,CHK prov;
```

- 🟢 **Backbone** nodes/edges: built deterministically from the structured files — authoritative, cannot hallucinate.
- 🔵 **Reasoning** layer: extracted by Claude; `Insight` carries anonymized tacit knowledge.
- 🟣 **Provenance**: solid backbone/reasoning edges vs **dotted** provenance edges (`MENTIONED_IN` / `DERIVED_FROM` / `PART_OF`) — every claim traces to a `Chunk` → `Document` with a sensitivity label.

---

## 4. Module map & provider abstraction

```mermaid
flowchart TD
    subgraph CFG_BOX["config.py — single source of truth (env)"]
      CFG["NEO4J_URI / USER / PASSWORD<br/>LLM_PROVIDER · EMBEDDER · model IDs"]
    end

    subgraph PIPE["Pipeline modules"]
      LD1["loaders/structured.py"]
      LD2["loaders/unstructured.py"]
      AN["anonymize.py"]
      CH["chunk.py"]
      EM["embed.py"]
      BB["backbone.py"]
      EX["extract.py"]
      GR["graph.py"]
      ORCH["ingest.py (CLI orchestrator)"]
    end

    subgraph PROV["providers/ — swappable, no lock-in"]
      LLMP["LLMProvider (protocol)"]
      ANT["AnthropicProvider ✓ implemented"]
      OAI["OpenAIProvider (stub)"]
      OLL["OllamaProvider (stub, offline)"]
      LLMP --- ANT
      LLMP --- OAI
      LLMP --- OLL
    end

    NEO[("Neo4j — local Docker → Aura via env")]

    CFG --> PROV
    CFG --> NEO
    EX -->|"depends on protocol only"| LLMP
    EM -->|"Embedder protocol"| LLMP
    GR --> NEO
    BB --> NEO
    ORCH --> LD1 & LD2 & AN & CH & EM & BB & EX & GR

    classDef cfg fill:#fff4d6,stroke:#b8860b,color:#4d3b00;
    classDef prov fill:#e3f0ff,stroke:#1565c0,color:#0d2a4d;
    class CFG cfg;
    class LLMP,ANT,OAI,OLL prov;
```

**Swap points (env-only, no code change):** graph store (local Docker ↔ Aura), LLM provider (Anthropic ↔ OpenAI ↔ Ollama), embedder (local ↔ hosted).

---

## Changelog

| Version | Date | Change |
|---|---|---|
| v0.1 | 2026-05-29 | Initial architecture: 3-workstream view, ingestion flow, ontology, module/provider map |
