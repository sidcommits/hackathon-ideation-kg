# Company Brain — Chat Frontend + API Design

> **Status:** Approved design (2026-05-30). Scope: **workstream 3** — the conversational
> layer (FastAPI + Next.js) on top of the existing `company_brain` ingestion + knowledge-graph
> engine. Builds on `planning/architecture.md` and the `query()` retrieval seam.

**Version:** v1.0 — 2026-05-30

---

## 1. Goal & scope

Build a Claude-style chat experience over the SIX regulatory corpus:

- A **real agentic loop** — Claude runs a tool-use cycle over the knowledge graph, not a
  single-shot RAG pass. Each tool call is streamed to the UI as a visible reasoning trace.
- A **conversation-reactive knowledge graph** — the same tool events light up / pulse the
  Neo4j nodes and edges the agent touched, so you watch it reason across the graph.
- **Traceability & access control as first-class concerns** — every answer cites source
  chunks with sensitivity labels; restricted content is gated server-side. (Explicit grading
  criteria for the challenge.)

**In scope now:** text chat, streamed tool calls, reactive graph, citations, access control.

**Explicitly deferred to v2:** the voice/animated avatar ("AIFTAR"). The event contract and
transport are designed to be **forward-compatible** so v2 is additive (new event types +
SSE→WebSocket swap), not a rewrite. **No avatar code is written now.**

---

## 2. Components & repo layout

The existing Python package is the **engine** and stays untouched (bar two tiny additive
helpers, see §4). Two new top-level pieces are added.

```
SIX_Hack_Zurich/
├── src/company_brain/        # EXISTING engine — query(), graph.py, providers/ (unchanged)
├── api/                       # NEW — FastAPI service (thin; depends on company_brain)
│   ├── main.py                #   app + CORS + /chat (SSE), /graph, /health
│   ├── agent.py               #   Claude tool-use loop → emits typed events
│   ├── tools.py               #   tool defs wrapping query()/graph.py
│   └── events.py              #   the event schema (Pydantic) — shared contract
└── web/                       # NEW — Next.js app (App Router)
    ├── app/                   #   chat page
    ├── components/            #   ChatThread, MessageBubble, ToolCallCard, GraphCanvas, CitationChip
    └── lib/                   #   SSE client + event-stream reducer + events.ts (mirrors events.py)
```

**Boundary discipline:** `api/` is thin — it owns HTTP, streaming, and the agent loop. All
retrieval/graph logic stays in `company_brain`. The agent's tools are typed wrappers over
functions that already exist. The only coupling between frontend and backend is
`api/events.py` (mirrored as `web/lib/events.ts`).

---

## 3. The event contract (keystone)

The agent loop emits a sequence of typed events over SSE. The frontend runs **one reducer**
that fans them out to the chat, the tool-call cards, and the graph. Discriminated union on
`type`:

```jsonc
{"type": "message_start",  "id": "msg_..."}
{"type": "token",          "text": "Under MiFID II, a structured note is..."}
{"type": "tool_call",      "id": "tc_1", "name": "search_knowledge",
                           "args": {"query": "structured note complex instrument"}}
{"type": "tool_result",    "id": "tc_1", "summary": "5 chunks, top doc: ESMA 2015-1787",
                           "graph_delta": {
                               "nodes": [{"id": "Reg:MiFID II", "label": "Regulation"}],
                               "edges": [{"from": "Reg:MiFID II", "to": "Attr:Complex", "rel": "REQUIRES"}]}}
{"type": "citation",       "doc_title": "...", "sensitivity": "C2 Internal", "chunk_text": "..."}
{"type": "message_end",    "stop_reason": "end_turn"}
{"type": "error",          "message": "..."}
```

Design rules that make it hold up:

- **`graph_delta` rides on `tool_result`.** The backend already knows which Neo4j nodes/edges
  a tool touched, so it returns their IDs inline. The graph viz never issues its own query — it
  accumulates deltas and pulses newly-arrived IDs. Zero extra round-trips; this is what makes
  the graph "react to the conversation."
- **Citations are first-class events**, carrying `sensitivity`, so provenance/access-control is
  threaded through the protocol itself.
- **Forward-compatible (v2 avatar):** voice adds `transcript_partial` and `audio_chunk` event
  types to the same union. The reducer ignores unknown types today; tomorrow it routes them to
  the avatar. No protocol break.

Frontend `lib/` holds one `parseEventStream` + a reducer producing
`{ messages[], activeToolCalls[], graph: { nodes, edges, pulsedIds } }`. Single source of
truth, three views.

---

## 4. Backend — agent loop + tools

### Endpoints
```
POST /chat  { messages: [...], max_sensitivity: "C2 Internal" }  →  text/event-stream (SSE)
GET  /graph                                                      →  full KG snapshot (v2 explorer; optional now)
GET  /health
```
`max_sensitivity` comes from the request (later: from auth/session) and is threaded straight
into `query()`. **Access control is enforced server-side in the retrieval layer**, never trusted
from the client beyond this gate.

### Transport: SSE (not WebSocket)
Unidirectional server→client typed-event stream; user turns are normal POSTs. Auto-reconnect,
proxy-friendly, minimal ceremony. (v2 voice upgrades this to WebSocket for duplex audio.)

### The loop (`api/agent.py`)
```
emit message_start
loop:
    call Claude (stream=True) with tools + conversation
    ├─ text deltas        → emit token
    ├─ tool_use block     → emit tool_call
    │                       run the tool (sync, in threadpool)
    │                       → emit tool_result (+ graph_delta)
    │                       feed result back to Claude
    └─ end_turn           → emit citation* then message_end, break
```
Each tool returns a `(result_for_model, graph_delta, citations)` triple — the model sees text;
the wire gets the deltas and citations. Claude decides when to stop, yielding genuine multi-step
reasoning over the graph.

### Tools (`api/tools.py`) — thin wrappers over existing engine

| Tool | Wraps | Returns to model | Side-channel |
|---|---|---|---|
| `search_knowledge(query, k?)` | `query()` (vector_search + 1-hop graph expand) | top chunks + entities + insights | `graph_delta` (touched chunks/entities/edges), `citations` |
| `expand_graph(entity)` | new `neighborhood()` query in `graph.py` | neighboring regulations/attributes/obligations | `graph_delta` (the neighborhood) |
| `lookup_backbone(regulation?, attribute?)` | deterministic backbone query | authoritative Reg→Attr→Instrument facts | `graph_delta` |

- `search_knowledge` is the workhorse (semantic retrieval).
- `expand_graph` makes it *agentic* — Claude can chase a connection and you watch the graph walk.
- `lookup_backbone` is the hallucination-proof path to authoritative, spreadsheet-derived facts.

### Engine changes (the ONLY changes to `src/company_brain/`)
1. Add `neighborhood(entity)` helper to `graph.py` (Cypher 1-hop expansion → nodes + edges).
2. Have `query()` (or a thin sibling) also return the **touched node/edge IDs** so the
   `graph_delta` is free. Everything else is reused as-is.

### System prompt guardrails
Instruct Claude to **always retrieve before answering, cite sources, and not infer beyond
retrieved content** (no ungrounded claims on restricted C2/Confidential topics) — keeping
trust/traceability enforced at the reasoning layer.

---

## 5. Frontend — chat + reactive graph

Any frontend that speaks the §3 event contract drops in. This design is a self-contained
candidate; a teammate's design may replace it — the swap contract is `events.ts`.

### Layout — Claude-style split
```
┌────────────────────────────────────┬───────────────────────────┐
│  Chat thread (primary)             │  Knowledge Graph (live)   │
│  ┌──────────────────────────────┐  │   ╭─────────────────╮     │
│  │ user / assistant bubbles     │  │   │  force graph    │     │
│  │ ▸ ToolCallCard (collapsible) │  │   │  nodes pulse as │     │
│  │   search_knowledge(...)      │  │   │  tools fire     │     │
│  │   ✓ 5 chunks · ESMA 2015...  │  │   ╰─────────────────╯     │
│  │ assistant tokens stream...   │  │   legend: Reg/Attr/Inst   │
│  │ [📄 citation chips]          │  │   sensitivity badge       │
│  └──────────────────────────────┘  │                           │
│  [ ask the company brain…    ↵ ]   │                           │
└────────────────────────────────────┴───────────────────────────┘
```

### Data flow — one stream, one reducer, three views
```
POST /chat → SSE → parseEventStream → reducer → { messages, activeToolCalls, graph }
                                                    │          │            │
                                              ChatThread  ToolCallCard  GraphCanvas
```
Reducer is the entire client state — no Redux, no extra fetches.
`token`→append to current bubble; `tool_call`→spawn a card; `tool_result`→resolve card + merge
`graph_delta` + flag IDs as `pulsed`; `citation`→add a chip.

### Components
- **ChatThread / MessageBubble** — streaming markdown, blinking cursor while tokens arrive.
- **ToolCallCard** — collapsible; shows `name(args)` then resolves to a one-line summary
  (`✓ 5 chunks · top: ESMA 2015-1787`). This **is** the visible reasoning trace (traceability).
- **GraphCanvas** — `react-force-graph-2d` (Canvas; handles a few hundred nodes smoothly). Nodes
  colored by label using `planning/architecture.md`'s legend. New `pulsedIds` get a brief
  glow/ripple — the "synapse" effect. Click a node → highlight 1-hop neighborhood.
- **CitationChip** — doc title + **sensitivity badge** (`C2 Internal` / `Confidential`); click to
  expand the source chunk. Provenance, visible.

### Stack
Next.js App Router + TypeScript + Tailwind, `react-force-graph-2d`, native
`EventSource`/`fetch`-stream for SSE. Deliberately dependency-light so it's easy to swap or hand
off.

### Swap contract
The only front/back coupling is `api/events.py`, mirrored as `web/lib/events.ts` so whichever
frontend wins is type-checked against the same contract.

### Visual identity — NON-NEGOTIABLE acceptance criteria
The frontend must look **extremely beautiful and professional** — hackathon-demo-winning on
first impression. Delivered via the **`frontend-design`** skill at implementation time (invoked
during build, not during design).

- **Tone:** institutional-grade fintech (Bloomberg / Linear / Mercury), not a toy chatbot.
  Confident, dense-but-calm, authoritative — it's a regulatory knowledge product.
- **Surface:** dark near-black canvas (`#0A0B0D`) so the graph reads like a constellation and
  synapse pulses glow against deep space. Light mode secondary.
- **Type:** real typographic system — Inter/Geist for UI, a mono (JetBrains/Geist Mono) for
  tool-call args and citations. Tight, deliberate hierarchy.
- **Color:** restrained neutral base + node-label semantic palette from
  `planning/architecture.md` (green backbone / blue reasoning / purple provenance), shared
  between graph and chips. One accent only.
- **Motion:** purposeful, not decorative — token streaming, tool-card resolve, and graph
  synapse-pulse are the only animated moments, each tied to real agent state. Subtle spring
  physics on the graph.
- **Craft:** glass tool-call cards, sensitivity pills, focus-visible states, skeleton/empty
  states, fully responsive.

---

## 6. Access control & provenance

- **Server-side enforcement in retrieval:** `max_sensitivity` gates `vector_search`; the model
  never sees content above the caller's level. Client cannot override beyond this gate.
- **Provenance on the protocol:** every `citation` event carries `doc_title` + `sensitivity` +
  `chunk_text`; the UI renders a sensitivity badge on each. Nothing is asserted without a
  traceable source chunk → document.
- **Reasoning-layer guard:** system prompt forbids answering beyond retrieved content.

---

## 7. Testing

- **Engine (unchanged):** existing pytest suite stays green.
- **API:**
  - Unit-test each tool wrapper (mock `GraphStore`) → asserts correct
    `(model_result, graph_delta, citations)`.
  - Integration: POST `/chat`, assert the SSE event **sequence** is well-formed
    (`message_start … message_end`).
  - **Access-control test:** a restricted query with `max_sensitivity="C2 Internal"` must never
    leak a `Confidential` citation. Access control as a test, not a hope.
- **Frontend:**
  - Reducer unit tests (event sequence → expected state).
  - Playwright smoke test of one full chat turn rendering tokens + a tool card + a graph pulse.

---

## 8. Open decisions (for the implementation plan)

- LLM provider for the agent loop: Anthropic (tool-use native) vs OpenAI — engine already
  supports both via `providers/`. Default: Anthropic for first-class tool use.
- Whether `GET /graph` (full snapshot / v2 explorer base layer) ships now or in v2. Default:
  defer; the reactive graph needs only `graph_delta`.
- Auth/session source for `max_sensitivity` (hardcoded demo value now; real auth later).

---

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-30 | Initial chat + API design: agentic loop, SSE event contract, reactive graph, frontend candidate, access control, testing |
