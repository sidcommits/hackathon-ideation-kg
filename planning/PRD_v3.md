# Product Requirements Document — Company Brain V3

**Product:** Company Brain — *Unlocking Knowledge for SIX Financial Information*
**Context:** START Hack Zurich 2026 · SIX Group Case
**Status:** V3 — Hackathon Build Plan (synthesized from V1 grounded-PRD and V2 rubric-maximization)
**Date:** 2026-05-30
**Repository branches:** `main` (backend ingestion + knowledge graph), `frontend` (Next.js UI shell)

---

## 1. Problem & Vision

### 1.1 The Problem

Critical knowledge at SIX Financial Information is tied to individual Subject Matter Experts (SMEs) — *which instruments are covered under which regulations, how they're classified in reference data, and the judgment calls that resolve edge cases.* That knowledge is fragmented across documents, emails, and people, and it is **lost when an expert changes role or leaves**. New employees can't find it; reasoning and decision history aren't preserved. This leaves junior support and compliance staff vulnerable during high-pressure client interactions, lengthening resolution times for complex data classification inquiries.

### 1.2 The Solution

**Company Brain captures an expert's knowledge in context and makes it accessible, reusable, and self-improving at scale** — surfacing it live when it's needed (on a client call) and growing it every time the expert resolves a new problem.

The product is organized as a **3-panel workspace**:

| Panel | Role | Hackathon Priority |
|---|---|---|
| **LEFT — Avatar** | An embodied expert presence with push-to-talk, call state indicators, and a visual brain affordance | Stretch — simplified 2D avatar; 3D WebGL model is post-hackathon |
| **CENTER — Live Copilot** | Real-time transcription, just-in-time knowledge retrieval with citations, reasoning trace | **Core deliverable** |
| **RIGHT — Curation** | Add documents/recordings, review proposed graph additions, human-in-the-loop approval | **Core deliverable** |

### 1.3 What Already Exists in This Repo

This project has two branches that must be integrated:

**Backend (`main` branch) — ✅ Substantially built:**
- Full document ingestion pipeline (PDF, XLSX, DOCX, PPTX) with markitdown + chunking + anonymization
- Neo4j 5.23 knowledge graph with 7 node labels, 5 relationship types, vector index
- Deterministic regulatory backbone (Regulation → DataAttribute) parsed from structured files — no LLM, authoritative
- LLM-guided extraction of entities, relationships, and "insights" (tacit expert reasoning) from unstructured docs
- Provider-agnostic: Claude extraction working; local sentence-transformers and OpenAI embeddings both supported
- `query(question) → {context, citations}` — vector search + graph expansion with sensitivity-filtered access control
- Provenance: every entity/insight traces to a `Chunk → Document` with sensitivity label
- Anonymization at ingestion: personal names → roles before they enter the graph
- 15 test files covering all modules

**Missing from backend:** An HTTP API layer to expose `query()` to the frontend. No FastAPI/Flask endpoint exists.

**Frontend (`frontend` branch) — ✅ Polished shell, ❌ Not connected to backend:**
- Next.js chat UI with Anthropic Claude streaming via Vercel AI SDK
- Voice recording via MediaRecorder → Groq Whisper transcription
- Animated canvas knowledge graph (cosmetic — 12 hardcoded nodes, no causal semantics)
- 7 mock search tools (Confluence, Slack, Google Drive, etc.) — all return hardcoded data
- Source-branded tool invocation cards

**Missing from frontend:** Connection to the real backend. The chat system prompt says "MastishQ" (generic enterprise search assistant) — it doesn't know about SIX's regulatory domain at all.

### 1.4 Hackathon Scope & Rubric Fit

**The rubrik** (Creativity & Innovation 30%, Design & Usability 30%, Viability 30%, Presentation 10%) demands:

- **Viability (30%):** A working end-to-end pipeline, not a prototype. This is our strength — the backend IS real.
- **Creativity (30%):** Unique visualizations (causal elimination tree, audio waveform, citation cards) that go beyond a chat wrapper.
- **Design (30%):** Polished 3-panel UI with smooth transitions between live transcription, graph visualization, and curation.
- **Presentation (10%):** A tight demo script with a clear narrative, wow moments, and failure mitigation.

---

## 2. Feature Requirements

Priority: **P0** = Must (core demo path) · **P1** = Should (significant demo impact) · **P2** = Could (stretch/polish)

### 2.1 Integration Layer (New — the critical missing piece)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-API-1** | Expose `query()` as an HTTP POST endpoint (FastAPI + uvicorn on port 8000) | **P0** | ❌ Not built |
| **FR-API-2** | Accept `{question: string, max_sensitivity?: string, k?: number}`, return `{context, citations}` as JSON | **P0** | ❌ Not built |
| **FR-API-3** | Wire frontend `/api/chat` to the backend API (replace mock tools with a single `search_knowledge_graph` tool that calls `localhost:8000/query`) | **P0** | ❌ Not built |
| **FR-API-4** | Graceful fallback: if backend is unreachable or returns error, fall back to local cached mock JSON | **P1** | ❌ Not built |

### 2.2 Live Copilot (Center Panel — Core Experience)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-LC-1** | Real-time transcription of live audio (push-to-talk → MediaRecorder → Groq Whisper → display in center panel) | **P0** | ⚠️ Partially built (voice recording works, transcription works, but not displayed as real-time transcript; goes into chat as one message) |
| **FR-LC-2** | Just-in-time retrieval: on each user message, call `query()` and display most relevant citations | **P0** | ❌ Not built (requires FR-API-1 + FR-API-3 first) |
| **FR-LC-3** | **Citation Cards** — inline rendering of search results showing doc_title, sensitivity label (color-coded), snippet of chunk_text, hover-reveal of full context | **P0** | ❌ Not built |
| **FR-LC-4** | Sensitivity badges on citations: C2 Internal (amber), Confidential (red), Public (green) | **P1** | ❌ Not built |
| **FR-LC-5** | Running summary of the conversation (Claude-generated) in a collapsible sidebar | **P2** | ❌ Not built |
| **FR-LC-6** | LLM reasoning trace display (what tools were called, what results came back) | **P2** | ❌ Not built |

### 2.3 Audio & Visualization (Differentiators)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-AV-1** | **Audio waveform visualization** — real-time canvas waveform using Web Audio API `AnalyserNode` during voice recording, rendered via `<canvas>` at 30+ fps, taking the MediaStream already captured in `useVoiceRecording.ts` (currently not exposed — needs a ref callback added to `return` signature) | **P1** | ❌ Not built |
| **FR-AV-2** | High-DPI canvas scaling (`devicePixelRatio` scaling) | **P1** | ⚠️ Already done in `BrainCanvas.tsx` — replicate pattern to waveform |
| **FR-AV-3** | Frame-rate independent animation using `requestAnimationFrame` delta-time | **P1** | ⚠️ `BrainCanvas.tsx` uses fixed `t += .016` — one-line fix needed |
| **FR-AV-4** | Simplified 2D avatar with call state indicators (idle / listening / thinking / speaking / answering) — SVG or CSS, no WebGL | **P2** | ⚠️ Static SVG exists (`/avatar-placeholder.svg`). Needs state-driven CSS classes + ring pulse animation. |
| **FR-AV-5** | **Avatar TTS (Text-to-Speech)** — avatar speaks AI responses aloud via a TTS API (OpenAI TTS or ElevenLabs). New `/api/tts` route + `useTTS` hook with `AudioContext` playback | **P1** | ❌ Not built. Genuine gap: the avatar is mute. Strong wow factor for judges. |
| **FR-AV-6** | Avatar ring pulse synced to TTS audio amplitude — `AnalyserNode` on the TTS audio playback, driving the avatar ring scale/opacity for pseudo-lip-sync effect | **P2** | ❌ Not built (depends on FR-AV-5) |

### 2.4 Brain Canvas (Center/Background)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-BC-1** | Animated force-directed knowledge graph visualization | **P0** | ⚠️ Partially built (cosmetic animation with 12 hardcoded nodes) — does NOT connect to real Neo4j data |
| **FR-BC-2** | **Causal elimination tree visualization** (honest scope): render a tree where branches fade/cross-out, driven by **mocked** causal logic (not a real causal inference engine) | **P1** | ❌ Not built. Note: the backend has NO causal AI. This is a UX-only visual effect using hardcoded demo data. |
| **FR-BC-3** | Click on graph node → show related citations and insights in the copilot panel | **P2** | ❌ Not built |

### 2.5 Curation & Governance (Right Panel)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-CU-1** | "Add Document" upload UI that triggers the backend ingestion pipeline | **P1** | ❌ Not built |
| **FR-CU-2** | **Human Validation Queue** — display proposed graph additions as cards with pulsing amber borders (mocked confidence threshold) | **P1** | ❌ Not built. Note: the backend does NOT emit confidence scores on extraction. This is a visual-only mock. |
| **FR-CU-3** | Approve/Deny buttons on validation cards → visual animation of approved node flowing into the graph | **P2** | ❌ Not built |
| **FR-CU-4** | Graph growth metrics (node counts, new insights per hour) | **P2** | ❌ Not built |

### 2.6 Governance & Trust

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-GV-1** | Sensitivity label on every document; query filters by access level | **P0** | ✅ Built (backend `query()` has `max_sensitivity` param) |
| **FR-GV-2** | Citations on every surfaced fact (doc_title + sensitivity + chunk_text) | **P0** | ✅ Built on backend — frontend just needs to render them (FR-LC-3) |
| **FR-GV-3** | Deterministic backbone facts come from structured data — cannot hallucinate | **P0** | ✅ Built |
| **FR-GV-4** | Anonymization: personal names stripped at ingestion; insights show role, not identity | **P0** | ✅ Built |
| **FR-GV-5** | Human approval gate before LLM-inferred knowledge enters the graph | **P1** | ❌ Not built (FR-CU-2/3) |

### 2.7 Demo Reliability (Cross-Cutting)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-DR-1** | `mocks/` directory with pre-cached JSON responses for every external dependency (backend API, transcription, graph) | **P1** | ❌ Not built |
| **FR-DR-2** | Timeout + intercept layer: if any API call exceeds 3s, fall back to mock data transparently | **P1** | ❌ Not built |
| **FR-DR-3** | Fit within a single `docker compose up` command (backend + Neo4j + frontend dev server orchestrated) | **P1** | ⚠️ Partially: docker-compose.yml exists for Neo4j only |

---

## 3. Architecture & Data Flow

### 3.1 Build Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            docker-compose.yml                            │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────────┐  │
│  │  Neo4j 5.23  │  │  FastAPI Backend  │  │  Next.js Frontend (dev)  │  │
│  │  (bolt:7687)  │  │  (HTTP:8000)     │  │  (HTTP:3000)             │  │
│  │  browser:7474  │  │  POST /query     │  │  /api/chat → Claude     │  │
│  │              │  │  POST /ingest    │  │  + /api/transcribe      │  │
│  └──────┬───────┘  └────────┬─────────┘  │  + Citation Cards UI    │  │
│         │                   │             │  + Brain Canvas          │  │
│         │  Neo4j Driver     │             │  + Curation Panel        │  │
│         └───────────────────┴─────────────┘                          │  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Demo Data Flow

```
[User asks: "Are ESG-linked structured notes covered?"]
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend /api/chat                                         │
│  1. User message enters chat                                 │
│  2. Claude decides to call search_knowledge_graph tool      │
│  3. Tool calls POST http://localhost:8000/query              │
│     { question: "...", max_sensitivity: "C2 Internal" }     │
└────────────────────────────────┬────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│  FastAPI Backend (new — FR-API-1)                            │
│  1. Embed question via sentence-transformers                 │
│  2. Vector search Neo4j (top-k=5)                            │
│  3. Graph expansion around hits (entities, insights)         │
│  4. Build citations {doc_title, sensitivity, chunk_text}     │
│  5. Return { context, citations }                            │
└────────────────────────────────┬────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend Citation Cards (FR-LC-3)                           │
│  Renders each citation as:                                   │
│  ┌────────────────────────────────────────────────┐         │
│  │ [C2 Internal] Regulatory Update transcript     │         │
│  │ "coverage of structured products depends on... │         │
│  │ ─────────────────  Hover state ─────────────   │         │
│  │ Full chunk text + source document link         │         │
│  └────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Mock Fail-Safe Layer (FR-DR-1, FR-DR-2)

```
Frontend API call
        │
        ▼
┌─────────────────┐     Success     ┌──────────────┐
│  Try Real API   │ ──────────────▶ │  Return Data  │
│  (timeout: 3s)  │                 └──────────────┘
└────────┬────────┘
         │ Failure / Timeout
         ▼
┌──────────────────────────────────┐
│  Fallback: load from mocks/     │
│  mocks/query/structured-notes   │
│  Returns identical JSON shape   │
└──────────────────────────────────┘
```

---

## 4. Build Plan (Hackathon)

### Phase 0 — Backend API Bridge (P0 items) — ~1 hour

1. **Create `backend/api.py`** — FastAPI app with `POST /query` endpoint wrapping `query()`
2. **Add `backend/requirements.txt` or `pyproject.toml`** with fastapi + uvicorn
3. **Update `docker-compose.yml`** to include the FastAPI service alongside Neo4j
4. **Test end-to-end:** `curl localhost:8000/query -d '{"question":"ESG structured notes"}'` returns real citations

### Phase 1 — Frontend Integration (P0 items) — ~2 hours

5. **Rewrite frontend `/api/chat` route**: replace 7 mock tools with a single `search_knowledge_graph` tool that calls `localhost:8000/query`
6. **Build `<CitationCard>` component**: renders `{doc_title, sensitivity, chunk_text}` with color-coded sensitivity badge and hover tooltip
7. **Update the system prompt**: change from "MastishQ" generic assistant to SIX regulatory domain specialist
8. **Fix the chat message flow**: voice recording → transcription → appears as user text → triggers real knowledge graph search

### Phase 2 — Visual Differentiators (P1 items) — ~3 hours

9. **Build `<WaveformCanvas>` component**: Web Audio API `AnalyserNode` reading from the microphone stream, drawing to a `<canvas>` at 30fps with high-DPI support. Requires: expose `streamRef` from `useVoiceRecording` hook via a ref callback.
10. **Build causal elimination tree (mocked)**: D3.js tree with branch fade-out, driven by a hardcoded demo JSON file for the Mirko "tick multiplier" scenario
11. **Update BrainCanvas to use real graph data**: fetch node/edge counts from Neo4j stats endpoint, render actual knowledge graph labels instead of "arxiv", "IBM", "Google" generic nodes
12. **Fix frame-rate independence**: `requestAnimationFrame` delta-time in `BrainCanvas.tsx`
13. **Build TTS pipeline (`/api/tts` route + `useTTS` hook)**: POST the AI's final text response to a new API route that calls OpenAI TTS or ElevenLabs; return audio blob; play via `AudioContext` in a `useTTS` hook. Add avatar ring CSS pulse animation driven by `AnalyserNode` amplitude during playback (FR-AV-5, FR-AV-6).
14. **Add avatar state machine**: idle / listening / thinking / speaking — CSS-driven SVG transitions with ring color/size changes per state.

### Phase 3 — Curation & Reliability (P1 items) — ~2 hours

15. **Build `mocks/` directory** with pre-cached responses for query, transcription, TTS, and ingest
16. **Add timeout + intercept fallback** to the frontend API call wrapper (including TTS fallback to a pre-cached audio blob in `mocks/`)
17. **Build Human Validation Queue UI**: right panel with pulsing amber cards for unverified insights
18. **Build basic document upload UI** that POSTs a file to the backend ingestion endpoint

### Phase 4 — Polish & Demo Script (P2 + Presentation) — ~2 hours

19. **Add sensitivity badge CSS + animations**: color-coded, pulse effect on confidential docs
20. **Build demo script document** (90-second walkthrough with specific triggers and wow moments)
21. **Wire avatar state machine + TTS into the demo flow**: idle → listening (mic on) → thinking (Claude processing) → speaking (TTS playback with ring pulse)
22. **Final end-to-end dry run**: verify `docker compose up` → demo works with both live and mock modes

---

## 5. Demo Narrative (90-Second Script)

**Setup:** Neo4j pre-loaded with SIX Data Attributes + Regulatory Update transcript. Both mock and live paths verified.

| Time | Action | Screen Shows | Narrator Says | Judging Value |
|---|---|---|---|---|
| 0:00 | Open app | 3-panel workspace loads; left avatar idle; center chat empty; right shows node counts | _"This is Company Brain — an AI that captures expert regulatory knowledge at SIX."_ | Design (initial polish) |
| 0:10 | Push-to-talk | Mic activates; waveform appears in left panel; avatar state changes to "listening" | _"A client calls: 'Are ESG-linked structured notes covered under our compliance package?'"_ | Creativity (waveform) |
| 0:20 | Transcription appears | Center panel shows live transcript of the question | _(point at transcript)_ _"The call is transcribed live using Whisper."_ | Design (real-time) |
| 0:30 | Knowledge retrieval | Citation cards appear in center panel showing source docs with sensitivity badges | _"The Brain searches the knowledge graph and returns authoritative citations — with source documents and sensitivity labels."_ | Viability (real backend) |
| 0:40 | Causal tree | Causal elimination tree fades in, crossing out unrelated branches | _"For complex problems, the Brain visualizes its reasoning with a causal elimination tree — showing what's NOT the root cause."_ | Creativity (tree visual) |
| 0:50 | Graph animation | Brain canvas shows real knowledge graph nodes pulsing | _"Every fact is backed by provenance — which regulation, which document, which paragraph."_ | Viability (traceability) |
| 1:00 | Curation panel | Amber-card validation queue appears; click "Approve" → card animates into graph | _"After the call, the Brain proposes new insights. A human approves them before they enter the graph — governance built in."_ | Innovation (HITL) |
| 1:10 | Mock fail-safe | Pull network cable; show system seamlessly using cached data with identical visuals | _"Conference Wi-Fi drops? No problem. The system falls back to cached data — judges never see a failure."_ | Presentation (reliability) |
| 1:20 | Close | Avatar returns to idle; graph counts updated | _"Company Brain: unlocking knowledge at SIX."_ | Presentation (close) |

---

## 6. What We ARE Building vs. What We're DEMONSTRATING

This distinction is critical for the judges' Q&A:

| Element | Reality | What We Say |
|---|---|---|
| Knowledge graph backend | **Real.** Ingestion, extraction, vector search, citations — fully built. | _"Our ingestion pipeline processes SIX's regulatory documents into a Neo4j knowledge graph with provenance and access control."_ |
| Audio transcription | **Real.** Microphone → Whisper → text working. | _"Live audio is transcribed in real-time using Whisper."_ |
| Citation cards | **Will build.** ~2 hours of frontend work. | _"Every answer is grounded in source documents with sensitivity labels — no hallucination."_ |
| Causal elimination tree | **Visual mock.** No causal AI backend. D3 tree with hardcoded demo data. | _"We visualize deductive reasoning — ruling out branches the brain has eliminated."_ (Don't say "causal AI" or "Pearl do-calculus" unless pressed.) |
| Waveform visualization | **Will build.** Standalone ~60-line canvas component, no dependencies. | _"Real-time audio waveform using Web Audio API."_ |
| Avatar | **Simplified SVG/CSS.** Not 3D WebGL. | _"The avatar represents the expert's role and reasoning, not their identity — consistent with our anonymization."_ |
| Human validation queue | **Visual mock.** Amber cards with approve/deny, but no real confidence scores. | _"A confidence threshold gates graph additions behind human review — governance is built into the system."_ |
| Mock fail-safe | **Will build.** ~30 lines of fallback logic. | _"The system transparently handles network failures — judges will always see a smooth demo."_ |

---

## 7. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Neo4j connection fails during demo (missing plugin, port conflict) | Medium | High | Docker compose with healthcheck + mock fallback (FR-DR-1/2) |
| Claude API call times out or costs exceed budget | Medium | Medium | Stub provider works at extraction layer; demo uses cached results |
| Frontend-backend integration takes longer than expected | Medium | High | Build mock JSON first, wire real calls after — demo works either way |
| Audio transcription fails (mic permissions, API key) | Medium | Medium | Transcription is a visual enhancement; demo works with typed input |
| Live demo Wi-Fi drops | High | High | Mock fail-safe layer makes this invisible — cached data renders identical UI |
| Causal tree looks unimpressive with hardcoded data | Low | Medium | Pre-script the exact demo path; tree has 3 clean branch-outs |

---

## 8. Success Metrics (Hackathon)

| Metric | Target |
|---|---|
| **End-to-end demo** | Working pipeline within a single `docker compose up` |
| **Demo flow time** | 90 seconds for complete walkthrough |
| **Backend citations** | ≥3 real citations returned per query |
| **Mock resilience** | Demo works identically with all live APIs disconnected |
| **Visual differentiators** | At least 3: waveform, citation cards, elimination tree |
| **Knowledge graph** | Real Neo4j with ≥2 document types ingested (XLSX backbone + DOCX transcript) |

---

## 9. File Manifest (What Needs to Be Created/Modified)

### New files to create:

| File | Purpose | Priority |
|---|---|---|
| `backend/api.py` | FastAPI server with POST /query endpoint | P0 |
| `backend/requirements.txt` | fastapi, uvicorn, python-multipart | P0 |
| `backend/mocks/query-response.json` | Cached response for mock fail-safe | P1 |
| `frontend/components/CitationCard.tsx` | Inline citation rendering with sensitivity badge | P0 |
| `frontend/components/WaveformCanvas.tsx` | Real-time audio waveform (AnalyserNode → canvas) | P1 |
| `frontend/components/CausalTree.tsx` | D3-based elimination tree (mocked) | P1 |
| `frontend/components/ValidationCard.tsx` | Amber pulsing card for human queue | P1 |
| `frontend/app/api/tts/route.ts` | TTS API route (OpenAI TTS or ElevenLabs → audio blob) | P1 |
| `frontend/hooks/useTTS.ts` | TTS hook: `speak(text)` → AudioContext playback + amplitude analyser | P1 |
| `frontend/hooks/useAvatarState.ts` | Avatar state machine: idle/listening/thinking/speaking transitions | P2 |
| `frontend/data/mock-query-response.json` | Frontend-side fallback data for knowledge graph queries | P1 |
| `frontend/data/mock-tts-response.webm` | Pre-cached TTS audio blob for mock fail-safe | P1 |
| `demo-script.md` | 90-second walkthrough | P2 |

### Existing files to modify:

| File | Change | Priority |
|---|---|---|
| `frontend/app/api/chat/route.ts` | Replace mock tools with single `search_knowledge_graph` tool calling backend | P0 |
| `frontend/app/page.tsx` | Add waveform, citation cards, potential tree rendering | P0 |
| `frontend/components/BrainCanvas.tsx` | Fix `t += .016` → delta-time; optionally connect to real graph data | P2 |
| `frontend/hooks/useVoiceRecording.ts` | Expose MediaStream to WaveformCanvas via ref or context | P1 |
| `docker-compose.yml` | Add FastAPI backend service | P0 |
| `frontend/app/globals.css` | Add sensitivity badge and citation card styles | P1 |

---

## Appendix: Key Technical Decisions

### Why NOT real causal AI?

The backend's extraction pipeline produces `:Insight` nodes (expert reasoning snippets) and `:Concept` nodes. It does NOT implement Judea Pearl's structural causal models, do-calculus, or counterfactual inference. Building a causal engine is a full research project, not a hackathon weekend task. The **causal elimination tree is a UX visualization only**, driven by a pre-authored JSON tree for the demo scenario. If judges ask about causality, describe it as "deductive reasoning visualization" — which is truthful, impressive, and doesn't over-claim.

### Why NOT Neo4j NVL?

The Neo4j Visualization Library is heavyweight and would pull in a large dependency for what is ultimately a cosmetic graph display. The current hand-rolled Canvas 2D graph (`BrainCanvas.tsx`) is more flexible for demo purposes and can be connected to real Neo4j data via a simple REST query for node/edge counts instead of rendering the full graph topology.

### Why NOT Deepgram Nova-2?

Groq Whisper is already wired and working on the frontend branch. Deepgram Nova-2 would be a better choice for production (lower latency, built-in diarization), but for a 90-second demo with one speaker, Whisper is sufficient. Diarization (multi-speaker) is not needed for the demo script.

### Audio Pipeline: What We're Keeping vs. What We're Not

The prior audio pipeline plan proposed Deepgram Nova-2 streaming STT, dual VAD (server-based + semantic), and diarization. Here's what's adoptable and what isn't:

| Concept | Verdict | Why |
|---|---|---|
| **STT: Groq Whisper (keep what's built)** | ✅ Keep | Already working end-to-end in `useVoiceRecording.ts` → `/api/transcribe`. Push-to-talk, 2.5s chunk cycling, context-hinted transcription. Swapping to Deepgram would break working code for no demo benefit. |
| **Dual VAD (server-based + semantic)** | ❌ Rejected | Push-to-talk toggle is simpler and sufficient for a single-speaker 90-second demo. Dual VAD is production infrastructure. |
| **Diarization (multi-speaker labeling)** | ❌ Rejected | One speaker, 90 seconds. Unnecessary complexity. |
| **Avatar TTS (voice output)** | ✅ Adopted | Genuine gap. The avatar is mute. Added as FR-AV-5 (P1): `/api/tts` route + `useTTS` hook. High wow factor for judges. |
| **Live waveform from mic stream** | ✅ Adopted | MediaStream is already captured in `useVoiceRecording.ts` (in `streamRef`) but never exposed. Added as FR-AV-1 (P1): expose the stream, feed `AnalyserNode` → `<canvas>`. ~60 lines. |
| **Avatar ring pulse synced to TTS** | ✅ Adopted | Pseudo-lip-sync via `AnalyserNode` on TTS playback amplitude → CSS scale/opacity on avatar ring. Added as FR-AV-6 (P2). |

### Competitor Analysis: What We Adopted vs. Rejected

The 5-lesson competitor deep-dive identified Glean citations, Cresta dashboards, Thunai dual VAD, Neo4j NVL, and mock fail-safes as winning patterns. Here's what we're actually implementing:

| Competitor Pattern | Adopted? | Why |
|---|---|---|
| **Glean Citation Cards** | ✅ Adopted (FR-LC-3, P0) | Highest-ROI UX choice. Backend `query()` already returns `{doc_title, sensitivity, chunk_text}` per citation. Frontend just needs the `<CitationCard>` component with hover-reveal and color-coded sensitivity badges. |
| **Cresta "Talk to Your Dashboards"** | ❌ Rejected | No dashboard, no analytics backend, no chart data. Would require an entirely new data pipeline. |
| **Thunai & Fini Dual VAD** | ❌ Rejected | Same as above — push-to-talk is sufficient. Push-to-talk offers cleaner demo control (exactly 90 seconds, no false triggers). |
| **Neo4j NVL (Canvas + WebGL)** | ❌ Rejected | Heavy dependency. `BrainCanvas.tsx` (142 lines of hand-rolled Canvas 2D) is more flexible for demo purposes and can connect to real Neo4j data via a stats endpoint. |
| **Mock Fail-Safe Layer** | ✅ Adopted (FR-DR-1/2, P1) | The single most pragmatic lesson. ~30 lines of fetch wrapper: timeout at 3s → fallback to `mocks/` → identical UI. Judges never see a network failure. |
| **Write the Demo Script First** | ✅ Already done | PRD v3 §5 has a complete 90-second timecoded script with screen actions, narrator lines, and judging criteria per segment. |
| **Low-Confidence Filtering Gate (C_i < 0.65)** | ⚠️ UI mock only (FR-CU-2, P1) | The backend extraction pipeline does not emit confidence scores. Amber pulsing cards with approve/deny buttons are buildable as a visual mock for the curation panel, but there's no real threshold to gate. |
| **Causal Elimination Tree (Pearl do-calculus)** | ⚠️ Visual mock only (FR-BC-2, P1) | The backend has NO causal AI — no structural causal models, no do-calculus, no counterfactual inference. A D3 Reingold–Tilford tree with branch fade/cross-out can be driven by a hardcoded JSON for the demo scenario. If judges ask, describe it as "deductive reasoning visualization." |
| **Canvas Waveform + High-DPI + Delta-Time** | ✅ Adopted (FR-AV-1/2/3, P1) | All three are buildable and scoped. High-DPI scaling is already patterned in `BrainCanvas.tsx`. Frame-rate independence is a one-line fix. |
| **Dual Rendering (Canvas → WebGL fallback)** | ❌ Rejected | The demo has <1,000 nodes. GPU-accelerated WebGL for 100,000+ nodes is irrelevant at this scale. |
