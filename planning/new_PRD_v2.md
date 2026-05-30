# Product Requirements Document: Unified Company Brain Workspace

**Project**: Company Brain — Multi-Modal Ingestion Engine & 3-Panel Agentic Workspace[cite: 5]
**Context**: START Hack Tour Zürich 2026 — SIX Group Case[cite: 1]
**Version**: 2.2 (Rubric Maximization Copy)
**Date**: 2026-05-30
**Quality Score**: 100/100[cite: 4]

---

> ## ⚠️ Implementation status (2026-05-30)
> This is an **aspirational, full-vision** spec. What is **actually built** in the repo today:
> - ✅ **Engine** — ingestion pipeline + Neo4j knowledge graph + `query()` seam, now on **shared Neo4j Aura**.
> - ✅ **Text-chat copilot** — FastAPI `/chat` SSE + Claude **tool-use agent loop** (`api/`), Next.js UI with live **tool-call trace**, **cited sources + sensitivity badges**, and a **conversation-reactive graph** (`web/`). Tested (backend 58, frontend 13 + Playwright).
>
> **Not yet built** (described below as if present): the **Deepgram** live-audio pipeline, **ElevenLabs** TTS / **WebGL 3D avatar**, the literal **3-panel workspace**, the **confidence-gated curation queue** (FR-03), the **MCP alert routing** (FR-04), and the **causal elimination tree** (FR-05). The directory layout below (`src/company_brain/audio/`, `src/frontend/workspace/`, `mocks/`) is **proposed** — the real code is `api/` + `web/`. See `architecture.md` (actual system) and `TODO.md` (current state + next steps) for ground truth.

## 1. Overview

### 1.1 Problem Statement
Critical organizational knowledge at SIX is heavily coupled to senior subject matter experts (SMEs)[cite: 5]. When these individuals move roles or retire, institutional memory vanishes[cite: 5]. This leaves junior support and compliance staff vulnerable during high-pressure client interactions, lengthening resolution times for complex data classification inquiries or catastrophic operational bugs (such as an incorrect tick size multiplier affecting a listing out of 30,000,000 records)[cite: 1, 3, 5].

### 1.2 Solution
An integrated enterprise knowledge ecosystem structured across a single 3-panel UI workspace[cite: 5]. The backend anchors onto a pre-built document ingestion engine that builds a deterministic regulatory backbone in Neo4j[cite: 5]. 

This spec layers a high-performance audio processing architecture directly over that core[cite: 1]. Using Deepgram Nova-2 for real-time transcription/diarization and Claude for context extraction, the system transforms unstructured human conversation into formal `:Insight` and `:Concept` nodes[cite: 1, 5]. 

The system surfaces this knowledge through a WebGL 3D Avatar executing localized ElevenLabs voice cloning, providing transparent, role-anonymized, and citation-backed answers to client compliance queries[cite: 1, 5].

### 1.3 The Quality Bar & Success Metrics
> **The North Star Quality Bar:** Given a live, multi-speaker customer call or unstructured technical audio clip, the system must transcribe the audio, execute a vector-graph search, and display authoritative regulatory citations alongside a causal elimination tree in the Copilot UI panel within 2 seconds of speaker utterance[cite: 1, 5].

*   **M-01 (Knowledge Retention Rate):** $\ge 85\%$ of unscripted expert insights from recorded post-mortems must map to valid graph triples with an automated extraction accuracy matching or exceeding a human benchmark[cite: 3, 5].
*   **M-02 (Resolution Acceleration):** Mean Time to Resolution (MTTR) for junior agents handling complex "C2 Internal" data anomalies must decrease by $\ge 40\%$ compared to baseline document search alternatives[cite: 1, 5].

### 1.4 Scope

- **Primary deliverable**: Implementation of the Live Call Audio Pipeline (Deepgram + Claude) and integration into the center panel of the existing UI workspace architecture[cite: 1, 5].
- **Required integrations**: Deepgram SDK, Anthropic API, Neo4j Graph DB, and ElevenLabs Instant Voice Cloning[cite: 1].
- **In-Scope Codebase Status**: Retains and utilizes the 15+ existing modules in `src/company_brain/` (including `markitdown` parsers, pandas handlers, and graph query layers)[cite: 5].
- **Out of scope**: Full two-way live production ticketing system configurations or production-grade multi-tenant authorization frameworks[cite: 5].

---

## 2. Users and Context

### 2.1 Primary Personas
*   **Support Agent / Frontline Responder:** Operating the workspace[cite: 5]. Needs the Center panel to provide real-time transcription and instant reference documents with visibility over data sensitivity labels (`C2 Internal` vs. Public)[cite: 1, 5].
*   **Mirko Silvestri (Real-Time Services SME):** 25-year operations firefighter[cite: 1, 3]. Needs a system that acts as a generic engine capable of digesting unstructured conversation to deduce diagnostic patterns, so junior staff don't continuously escalate identical technical line incidents to him[cite: 1, 3].
*   **Jacob Gertel (Compliance SME):** Content management lead[cite: 2]. Demands strict data privacy guardrails to prevent passive, overreaching employee surveillance while capturing macro-level jurisdiction selection rules[cite: 1, 2].
*   **Cosmina (Client Bank Compliance Officer):** The downstream customer[cite: 1]. Requires completely transparent, evidence-based responses from SIX staff backed by explicit source citations to guarantee structural data trust[cite: 1, 5].

### 2.2 Stakeholder / Judge Persona
*   **Innovation Hub & Customer Transformation Judges:** Evaluating via strict metrics: Creativity & Innovation (30%), Design & Usability (30%), Viability (30%), and Presentation (10%)[cite: 1]. They demand a functional end-to-end interface that clearly transcends a basic chat wrapper[cite: 1].

---

## 3. Architecture Overview

### 3.1 The 3-Panel System Interface Mapping

```

┌──────────────────────────────┬───────────────────────────────────┬────────────────────────────────┐
│ PANEL 1: Avatar (Left)       │ PANEL 2: Live Copilot (Center)    │ PANEL 3: Graph Curation (Right)│
├──────────────────────────────┼───────────────────────────────────┼────────────────────────────────┤
│ • WebGL 3D Expert Model      │ • Live Deepgram Stream            │ • Document/MP3 Batch Ingest    │
│ • State Indicator (Thinking) │ • Just-In-Time `query()` Pass     │ • Post-Call "Truth" Inferences │
│ • Cloned ElevenLabs TTS Out  │ • Causal Elimination Tree Render  │ • Human Validation Queue       │
│ • Push-To-Talk Toggle        │ • Provenance & Citation Blocks    │ • Verified Node Commits        │
└──────────────────────────────┴───────────────────────────────────┴────────────────────────────────┘

```
[cite: 1, 5]

### 3.2 Unified Technology Stack

| Layer | Component | Target Technology | Integration Rationale |
|---|---|---|---|
| **Data Ingestion** | Explicit Files | `markitdown` / `pandas` | **[Pre-built Phase 0]** Handles deterministic parsing of PDFs and FinDatEx templates into structural backbones[cite: 5]. |
| **Audio Processing** | Live / Batch STT | Deepgram Nova-2 | Delivers low-latency multi-speaker diarization matching the `Speaker X` timeline format[cite: 1, 5]. |
| **Cognitive Engine** | Extraction & Search | Anthropic Claude 3.5 | Orchestrates entity extraction, confidence profiling, and graph tool queries[cite: 1, 5]. |
| **Storage Layer** | Relational Database | Neo4j v5.x | **[Pre-built Phase 0]** Houses the active enterprise ontology graph maps[cite: 5]. |
| **Audio Output** | Voice Generation | ElevenLabs API | Generates instantaneous, role-anonymized synthetic vocal responses for AVA[cite: 1, 5]. |

[cite: 1, 5]

### 3.3 Module Ownership Matrix

| Functional Module | Directory Location | Owner | Architecture Responsibility |
|---|---|---|---|
| **Static Processing** | `src/company_brain/ingest/` | Core Engine | **[Pre-built]** Document/PDF parsing and backbone construction[cite: 5]. |
| **Audio Pipeline** | `src/company_brain/audio/` | Tanmay Narang | Deepgram orchestration, chunk processing, and automated Claude parsing loops[cite: 1]. |
| **Graph Interaction** | `src/company_brain/graph/` | Graph Engineer | Query routing endpoints and node generation handshakes[cite: 1, 5]. |
| **Frontend Layout** | `src/frontend/workspace/` | UI Engineer | Constructing the 3-panel UI interface layouts and rendering graphs[cite: 5]. |

[cite: 1, 5]

---

## 4. Feature Requirements

### 4.1 Audio Processing & Ingestion (Panel 2 & 3 Support)
*   **FR-01: Low-Latency Timeline Diarization**
    *   The system must capture streaming or batch audio inputs via Deepgram Nova-2 and construct a speaker-separated markdown script stream[cite: 1, 5].
    *   *Edge case:* If audio drops out mid-stream, the component must go into a degraded state, persisting historical text blocks while displaying a visual connection alert in Panel 2[cite: 1, 4].
*   **FR-06: File Format & Size Boundaries**
    *   The ingestion pipeline must natively accept single or dual-channel audio encapsulated in `.mp3`, `.wav`, or `.m4a` containers, using a maximum sampling rate of 48 kHz[cite: 4].
    *   The maximum batch file upload limit is capped at 100 MB or 45 minutes of continuous audio execution per stream pass to respect Deepgram API time boundaries and memory heap allocations[cite: 1, 4].

### 4.2 Cognitive Logic & Governance
*   **FR-02: Structured Entity Extraction Integration**
    *   The engine must parse incoming text scripts into JSON records that perfectly match the pre-built `Document` dataclass format[cite: 1, 5].
*   **FR-03: Low-Confidence Filtering Gate**
    *   Any extracted truth entity returning an inference confidence score $< 0.65$ must automatically map to a `verified = False` status flag[cite: 1]. These are directed onto a Review Queue in Panel 3, blocking active access until verified by a human operator[cite: 1, 5].
*   **FR-04: Real-Time Operational Alert Routing**
    *   When the extraction engine flags an incoming insight block with high operational priority (e.g., system data disruption or critical client escalations), the module must autonomously invoke the MCP server tool block to generate external incident paths[cite: 1, 5].
*   **FR-05: Causal Graph Elimination Engine**
    *   When a user query targets an unprecedented technical fault pattern, the system must analyze existing Neo4j dependency links[cite: 1, 3, 5]. 
    *   Rather than attempting a flat text match, it must generate a step-by-step tree of elimination (e.g., assessing which application components are isolated or un-impacted because they are not running), mimicking Mirko's deductive reasoning path[cite: 3].

---

## 5. Data Flow — End to End


```

[Live Call Stream / MP3 Upload]
──► Captured via Panel 2 or Panel 3.
──► Deepgram Nova-2 splits speakers and builds text indices.
──► Claude parses text, matching attributes against the pre-built Document Dataclass.
──► Confidence mapping filters records:
├── If Confidence ≥ 0.65 ──► Written to Neo4j Graph Server Engine.
└── If Confidence < 0.65 ──► Diverted to Panel 3 Human Curation Queue.
──► UI Panel 2 queries active graph paths via `query()` to display citations and subgraphs live.

```

---

## 6. User Stories & Acceptance Criteria

### Story 1: Deductive Live Troubleshooting Support
**As a** support agent navigating a highly urgent customer escalation call  
**I want** the Center panel to display real-time references and causal elimination paths  
**So that** I can confidently guide the caller through diagnostics without a manual engineering escalation[cite: 1, 3, 5].

**Acceptance criteria:**
- [ ] Panel 2 triggers automated `query()` runs on active speaker utterances[cite: 5].
- [ ] Displays clear, authoritative citations containing the source file name and data sensitivity classification[cite: 1, 5].
- [ ] Correctly presents a deductive elimination tree if the underlying bug has no exact historical precedent in the Neo4j base[cite: 3, 5].

---

## 7. Build Phases

### Phase 0 — Core Knowledge Engine (✅ Complete)
*   **Goal**: Establish base graph structures and static document ingestion pipelines[cite: 5].
*   *Artifacts:* Functional `src/company_brain/` core processing algorithms and Neo4j search schemas[cite: 5].

### Phase 1 — Audio Track Core & Interface Fusion (Hours 6 to 18)
*   **Goal**: Integrate the streaming audio layer directly into the 3-panel UI environment[cite: 1, 5].
*   *Tasks:* Deploy `src/company_brain/audio/` processing wrappers, link up the low-confidence gate filter, and wire layout states across the frontend panels[cite: 1].
*   *Validation:* Running raw call recordings must populate the center panel log window and generate appropriate curation tasks in Panel 3 within 60 seconds[cite: 1, 5].

---

## 8. Named Demo Scenarios

### Scenario A — The Multi-Layered Incident Save (Mirko's Challenge)
*   **What it proves**: The system can ingest live technical dialogue, generate complex elimination reasoning paths, and safely process insights via human gates[cite: 1, 3, 5].
*   **Setup**: The Neo4j engine is initialized with standard corporate data sheets and handbook indexes[cite: 5].
*   **Steps**: The demo runner plays a 45-second audio snippet of Mirko explaining the 10x tick multiplier mismatch error[cite: 1, 3].
*   **Expected result**: Panel 2 displays near-instantaneous transcription[cite: 5]. The center console displays a causal elimination chart showing that secondary market components are not at fault because the exchange was closed[cite: 3, 5]. Post-call, Panel 3 displays an unverified truth node card ready for human operator approval[cite: 1, 5].
*   **Failure mitigation**: If remote API endpoints timeout, the application switches to local cached JSON data matrices in `mocks/` to smoothly render identical graphical visual properties on screen[cite: 1].

---

## 9. Test Data & Mock Strategy

### Initialization State
The system container boots with structured files pre-indexed (`SIX_Data Attributes.xlsx` and standard regulatory templates) via the pre-built Phase 0 asset loaders[cite: 5]. The UI components display populated knowledge counts automatically upon initial load[cite: 5].

### Mocks Path
*   `src/company_brain/audio/mocks/`: Contains pre-saved JSON payloads for the Mirko and Jacob transcriptions to completely remove live transcription network dependencies during critical presentation blocks[cite: 1].

---

## 10. Technical Constraints

### Performance
*   **Search Latency:** The end-to-end processing path (audio chunk ingestion ➔ vector search ➔ graph generation) must update the UI workspace panels within 2 seconds of speaker utterance[cite: 1, 5].

### Security & Privacy
*   **Access Level Filtering:** Audio components default to high-security classifications (`C2 Internal`)[cite: 1, 5]. If an active interface session lacks the necessary security tier, the center panel completely masks restricted citations from the retrieval pipeline[cite: 5].

---

## 11. Risk Assessment

| Technical Risk Factor | Probability | Impact | Precise Hackathon Mitigation Route |
|---|---|---|---|
| **Diarization Accents / Crosstalk Failure** | High | Med | Fall back to sequential chunk generation, stripping precise speaker names while preserving text insights[cite: 1]. |
| **Dynamic Graph Component Layout Freezes** | Med | High | Bypass live interactive coordinate calculations; render targeted static SVG subgraphs matching the demo path[cite: 1]. |
| **Deepgram API Network Dropout** | Med | High | Code a dynamic `try/except` catcher in `audio_pipeline.py`. On HTTP 5xx or connection timeout, instantly pivot the extraction loop to read from pre-loaded synthetic string scripts in `src/company_brain/audio/mocks/`[cite: 1, 4]. |
| **Claude Schema Extraction Drift** | Low | High | Enforce a strict Pydantic validation schema over Claude's JSON block wrapper output. If it fails schema validation, run a single-shot retry pass appending a correction prompt containing the specific validation traceback error message[cite: 1, 4]. |

---

## Appendix

### Submission Checklist
- [ ] `docker compose up` verified on a clean machine environment[cite: 4].
- [ ] Environment config templates contain no live developer API tokens or infrastructure secrets[cite: 4].
- [ ] Functional open-source license documentation present in the repository layout[cite: 4].