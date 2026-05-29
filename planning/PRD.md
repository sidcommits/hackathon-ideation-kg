# Product Requirements Document — Company Brain

**Product:** Company Brain — *Unlocking Knowledge*
**Context:** START Hack Zurich · SIX Financial Information challenge
**Status:** Draft v0.1 (synthesized from planning-phase transcript + design specs)
**Date:** 2026-05-30
**Related docs:** [`superpowers/specs/2026-05-29-ingestion-knowledge-graph-design.md`](superpowers/specs/2026-05-29-ingestion-knowledge-graph-design.md) · [`architecture.md`](architecture.md)

---

## 1. Problem & vision

Critical knowledge at SIX Financial Information is tied to individual Subject Matter Experts (SMEs) — *which instruments are covered under which regulations, how they're classified in reference data, and the judgment calls that resolve edge cases.* That knowledge is fragmented across documents, emails, and people, and it is **lost when an expert changes role or leaves**. New employees can't find it; reasoning and decision history aren't preserved.

**Company Brain captures an expert's knowledge in context and makes it accessible, reusable, and self-improving at scale** — surfacing it live when it's needed (on a client call) and growing it every time the expert resolves a new problem.

The product has two tightly-coupled halves, mirroring the planned UI:

- **The Brain that answers (live):** an avatar of the expert that listens to an incoming client call, transcribes it, reasons over the knowledge graph, and surfaces the exact reference material and a proposed solution in real time — with a human in control.
- **The Brain that grows (curation):** a self-evolving knowledge graph. New documents/recordings can be ingested anytime; after each conversation the system proposes inferences, solutions, and "truths," and a human confirms / improves / denies them before they enter the graph.

> **What already exists (this repo):** the **ingestion pipeline + knowledge graph engine** and a `query()` retrieval seam (vector search + graph expansion with citations and access-level filtering). The live-call copilot UI, the avatar, the human-in-the-loop curation UI, and TTS/autonomy are **planned** and specified below.

## 2. Goals & non-goals

### Goals
- **G1 — Capture tacit + explicit expertise** from documents, recordings, and live conversations into one queryable, governed knowledge graph.
- **G2 — Surface knowledge live during a client call**: real-time transcription, running summary, reasoning trace, and just-in-time reference retrieval, so an agent (even a new one) can answer confidently.
- **G3 — Preserve trust**: every surfaced fact and proposed answer cites its source document and reasoning; sensitive material respects access control.
- **G4 — Self-evolve**: each conversation feeds back into the graph via human-approved inferences, so the Brain improves continuously.
- **G5 — Outlast the expert**: knowledge remains available and reusable after the SME leaves, represented as **role-based expertise** (anonymized), not personal identity.

### Non-goals (for the hackathon)
- Not replacing the human agent — the human stays in control; the Brain assists.
- Not a CRM/telephony platform — we integrate with a call/audio stream, we don't build one.
- Not production auth/SSO/multi-tenant infra — access control is limited to the sensitivity-label filter.
- Not full autonomy at launch — autonomous TTS answering is an explicit *stretch* goal.

## 3. Users & personas

| Persona | Role | Needs from Company Brain |
|---|---|---|
| **Support Agent / new employee** | Takes incoming client calls; may lack deep domain expertise | Live transcription, a running summary, and the *right reference docs surfaced instantly* so they can answer on their own terms. |
| **Subject Matter Expert (SME)** | Holds the tacit knowledge; the "person" the avatar represents | A way to externalize their reasoning; light-touch curation of what the Brain learns. |
| **Knowledge Curator** | Reviews and approves what enters the graph (often the SME) | A clear queue of proposed inferences to confirm / improve / deny, with sources. |
| **Client (external)** | Calls in with a question (e.g. "is this ESG-linked structured note covered?") | A fast, correct, traceable answer — indirectly, via the agent or (later) the avatar. |
| **Knowledge / Compliance owner** | Accountable for data quality & governance | Traceability of every answer to a source + sensitivity-aware access. |

## 4. Experience overview (the three-panel workspace)

A single screen, three zones — taken directly from the planning sketch:

```
┌───────────────────┬──────────────────────────────┬───────────────────────────┐
│  LEFT — Avatar     │  CENTER — Live Call Copilot   │  RIGHT — Knowledge Graph  │
│                    │                               │  (grow & curate)          │
│  3D model of the   │  • Live transcription          │  • Add external docs /     │
│  expert            │  • Running summary             │    MP3 audio → ingest      │
│  + brain graphic   │  • Reasoning trace             │  • Post-call: proposed     │
│    (clickable)     │  • LLM tool calls (live)       │    inferences / solutions  │
│  + push-to-talk    │  • Just-in-time reference      │    / "truths"              │
│    connected to    │    retrieval (cited docs)      │  • Human: confirm /        │
│    incoming calls  │  Human answers on their terms; │    improve / deny          │
│  (stretch: avatar  │  AI is reference/copilot.      │  • Graph self-evolves      │
│   answers via TTS) │                               │                           │
└───────────────────┴──────────────────────────────┴───────────────────────────┘
```

### 4.1 Primary flow — assisted live call
1. A call comes in; the agent uses **push-to-talk**, connected to the expert avatar.
2. A live window shows **transcription** of the client's problem (chat-style; exact form TBD).
3. As the client speaks, the Brain runs: **live KB retrieval** → surfaces the reference docs/passages relevant to the query, plus a **running summary**, **reasoning**, and **LLM tool calls** — all live.
4. The agent answers **on their own terms**; the surfaced material is reference, not a script. They can ignore, use, or adapt it.
5. **Stretch:** the avatar itself proposes (or speaks, via TTS) a solution grounded in the reference docs.

### 4.2 Secondary flow — grow the Brain
6. Anytime: a user **adds external documents or MP3 recordings**; they're ingested into the graph.
7. After a conversation ends: the LLM proposes **inferences, problem→solution pairs, and "truths"** distilled from it.
8. A **human-in-the-loop** confirms / improves / denies each proposal.
9. Approved knowledge is written to the graph → the Brain **iterates over what it knows and improves continuously** (self-evolving).

## 5. Functional requirements

Priority: **M** = Must (hackathon MVP) · **S** = Should (demo stretch) · **C** = Could (post-hackathon). "✅ built" marks what already exists in this repo.

### 5.1 Knowledge Graph engine (foundation — ✅ largely built)
- **FR-KG-1 (M, ✅)** Ingest heterogeneous sources (PDF, spreadsheet, transcript/docx) into a knowledge graph, routing by file content type.
- **FR-KG-2 (M, ✅)** Deterministic regulatory **backbone** (`Regulation → DataAttribute → InstrumentType`) parsed from structured files with no LLM (authoritative, non-hallucinated).
- **FR-KG-3 (M, ✅)** LLM-guided extraction of entities, relationships, and **insights** (tacit reasoning) from unstructured docs, each linked to its source chunk.
- **FR-KG-4 (M, ✅)** **Provenance** — every entity/insight traces to a `Chunk → Document` with a sensitivity label.
- **FR-KG-5 (M, ✅)** **Anonymization at ingestion** — personal names → roles ("Compliance Officer"); names never enter the graph.
- **FR-KG-6 (M, ✅)** **Retrieval seam** `query(question) → {context, citations}` — vector search + graph expansion, filtered by access level.
- **FR-KG-7 (M, ✅)** **Provider-agnostic** LLM + embedder behind config (Anthropic + local embeddings now; swappable via env).
- **FR-KG-8 (S)** **Audio ingestion** — transcribe MP3/recordings (markitdown supports audio) into the same pipeline.
- **FR-KG-9 (S, designed)** **Conversation feedback loop** — a finished call is ingested as just another `Document` (`source_type="conversation"`), attaching new insights to existing entities. (Architecture supports this; not yet wired.)

### 5.2 Live Call Copilot (center — planned)
- **FR-LC-1 (M)** Capture a live audio/call stream and produce **real-time transcription**.
- **FR-LC-2 (M)** Maintain a **running summary** of the client's problem as the call progresses.
- **FR-LC-3 (M)** **Just-in-time retrieval**: on each new utterance, call `query()` and display the most relevant reference docs/passages **with citations** (title + sensitivity), low-latency.
- **FR-LC-4 (S)** Display the Brain's **reasoning trace** and **LLM tool calls** live (transparency for trust).
- **FR-LC-5 (M)** Surface material as **reference only** — the agent retains full control of what they say; nothing is auto-sent to the client in MVP.
- **FR-LC-6 (M)** **Push-to-talk** control to start/route an incoming call to the assistant.
- **FR-LC-7 (S)** **Proposed answer**: the Brain drafts a grounded answer the agent can accept/edit.
- **FR-LC-8 (C)** **Autonomous mode**: avatar answers end-to-end via **TTS**, solving from reference docs without a human.

### 5.3 Avatar (left — planned)
- **FR-AV-1 (S)** Render a **3D model** of the expert with a clickable **brain** affordance (entry point to the Brain).
- **FR-AV-2 (M)** Visual call state (idle / listening / thinking / answering) tied to the copilot.
- **FR-AV-3 (C)** Lip-synced TTS voice for autonomous mode (pairs with FR-LC-8).
- **Design principle:** the avatar represents the expert's **role and reasoning**, not their personal identity — consistent with anonymization (FR-KG-5).

### 5.4 Knowledge enrichment & curation (right — planned)
- **FR-EN-1 (M)** Upload/add **external documents or MP3 files** to the graph on demand (reuses the ingestion pipeline).
- **FR-EN-2 (M)** After a conversation, generate **proposed inferences / problem→solution pairs / "truths."**
- **FR-EN-3 (M)** **Human-in-the-loop review**: each proposal can be **confirmed, improved (edited), or denied**; only approved items are written to the graph.
- **FR-EN-4 (M)** Every proposal shows its **source** (which conversation/chunk it came from) for reviewer trust.
- **FR-EN-5 (S)** Show graph growth over time (counts / before-after) to evidence "self-evolving."
- **FR-EN-6 (C)** **Email channel** — ingest/answer via email in addition to calls.

### 5.5 Governance, trust & data quality (cross-cutting — partially built)
- **FR-GV-1 (M, ✅)** Sensitivity label on every document; `query()` filters results by the caller's access level.
- **FR-GV-2 (M, ✅)** Citations on every surfaced fact (source doc + passage).
- **FR-GV-3 (M, ✅)** Authoritative facts come from the deterministic backbone (cannot be hallucinated).
- **FR-GV-4 (M)** Human approval gate before any LLM-inferred knowledge becomes a "truth" in the graph (FR-EN-3).
- **FR-GV-5 (C)** Audit log of what entered the graph, when, approved by whom.

## 6. Hackathon demo scope (what we show)

**Demo narrative:** a client calls asking *"Are ESG-linked structured notes covered under our compliance package?"*
1. Push-to-talk → live transcription of the question appears (center).
2. Brain runs `query()` → surfaces the relevant SME insight (*"coverage depends on reference-data classification; new ESG attributes may require onboarding"*) **with its source citation and sensitivity label**, plus the backbone facts (MiFIR/SFDR attributes).
3. Agent answers using that reference.
4. After the call, the Brain proposes a new "truth" from the exchange; the human approves it; it's added to the graph (shown growing).

**In-scope for the build:** FR-KG-* (done), FR-LC-1/2/3/5/6, FR-EN-1/2/3/4, FR-GV-1/2/3/4, FR-AV-2.
**Stretch if time:** FR-LC-4/7/8, FR-AV-1, FR-KG-8/9, FR-EN-5.
**Explicitly later:** FR-EN-6 (email), full autonomy, production auth.

## 7. Architecture fit

```
Audio/call stream ─▶ live transcription ─▶ query() ─▶ Knowledge Graph (Neo4j)
                                   │                        ▲
                            Live Call Copilot UI            │ ingestion pipeline
                                   │                        │ (PDF/xlsx/docx/MP3/conversation)
                       post-call proposals ─▶ HITL review ──┘  (anonymize · chunk · embed · extract)
```
- The **knowledge graph + ingestion + `query()`** are built (see the design spec).
- The **Copilot** and **curation UI** are new front-end + orchestration work consuming `query()` and the ingestion entry point.
- Conversations re-enter through the **same** ingestion path (`source_type="conversation"`), which is why the feedback loop is additive, not a rewrite.

## 8. Success metrics
- **Time-to-answer on a call** — relevant reference surfaced within ~1–2s of the question.
- **Answer traceability** — 100% of surfaced facts carry a citation + sensitivity label.
- **Knowledge retention** — % of resolved conversations that produce ≥1 approved graph addition.
- **Curation throughput** — proposals reviewed per minute; approve/deny ratio.
- **Coverage** — questions the Brain can answer from the graph vs. escalations.
- **Governance** — zero personal names in the graph; zero confidential leakage under a lower access level.

## 9. Risks & open questions
- **Latency** of live retrieval during a call (embedding + vector search + graph expansion per utterance) — may need streaming/incremental queries.
- **Chat window vs. pure voice** for showing the client's problem — *flagged as TBD in the transcript.*
- **Extraction quality / cost** of the LLM inference step on long regulatory PDFs (the 161-page EET, scanned tax PDF) — page caps / selective ingest.
- **Self-evolving feedback drift** — bad approvals compound; the HITL gate and provenance are the guardrails.
- **Avatar vs. anonymization tension** — the avatar embodies an expert while the graph is name-anonymized; resolve by representing *role-based* expertise.
- **Audio transcription accuracy** for MP3 ingestion and live calls (model choice, accents, jargon).
- **STT/TTS provider** selection (for live transcription and autonomous mode) — not yet chosen.

## 10. Out of scope (this PRD)
- Telephony/CRM integration internals; production hosting, SSO, multi-tenant RBAC beyond sensitivity labels; billing; mobile.

## 11. Roadmap
- **Phase 0 — Engine (done):** ingestion + knowledge graph + `query()` seam + governance primitives.
- **Phase 1 — Hackathon MVP:** live transcription + just-in-time cited retrieval (center), document/MP3 enrichment + post-call HITL curation (right), demo narrative end-to-end.
- **Phase 2 — Polish/stretch:** reasoning + tool-call visualization, proposed answers, avatar + states, conversation feedback loop wired.
- **Phase 3 — Beyond:** autonomous TTS answering, email channel, audit log, production access control.

---

*This PRD is synthesized from the planning-phase conversation transcript and the existing ingestion + knowledge-graph design. Sections marked "✅ built" reflect code already in this repo; everything else is proposed. Treat priorities (M/S/C) and the demo scope as the contract for the hackathon build.*
