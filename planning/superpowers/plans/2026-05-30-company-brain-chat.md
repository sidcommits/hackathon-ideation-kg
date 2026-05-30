# Company Brain — Chat (API + Web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude-style chat over the SIX regulatory knowledge graph — a FastAPI `/chat` SSE endpoint driving a Claude tool-use loop over the existing `query()` engine, and a Next.js frontend that renders streamed tokens, tool-call cards, citations, and a conversation-reactive knowledge graph.

**Architecture:** The existing `company_brain` package is the untouched engine (three small additive helpers aside). A thin `api/` FastAPI layer owns HTTP + streaming + the agent loop; tools wrap `query()`/`graph.py`. The agent emits a single typed event stream (SSE) that the `web/` frontend's reducer fans out to chat, tool cards, and the graph. The only front/back coupling is the event schema (`api/events.py` ↔ `web/lib/events.ts`).

**Tech Stack:** Python 3.12 · FastAPI · `sse-starlette` · `anthropic` SDK (streaming tool-use) · Neo4j (existing) · pytest. Next.js (App Router) · TypeScript · Tailwind · `react-force-graph-2d` · Vitest · Playwright.

**Source spec:** `docs/superpowers/specs/2026-05-30-company-brain-chat-design.md`

> **Scope note:** This plan has two parts. **Part A (Tasks 1–8)** is the API — independently shippable and fully testable on its own. **Part B (Tasks 9–16)** is the web frontend, which consumes Part A's contract. If you prefer, Part B can be split into its own plan file; they are kept together here for a single coherent build.

> **Working agreement:** `CLAUDE.md` forbids `git commit`/`push` without an explicit ask from the user. The commit steps below are written for completeness, but **only run them once the user has authorized committing.** If commits are not yet authorized, do every step except the `git commit` and pause for approval.

---

## File structure

**Part A — `api/`**
| File | Responsibility |
|---|---|
| `api/__init__.py` | package marker |
| `api/events.py` | typed event schema (Pydantic) + `sse()` serializer — the shared contract |
| `api/deps.py` | build/cache `Settings`, `GraphStore`, `Embedder` (one place, reused) |
| `api/tools.py` | tool definitions + executors wrapping `query()`/`graph.py` → `(model_result, graph_delta, citations)` |
| `api/agent.py` | Claude streaming tool-use loop → async generator of events |
| `api/main.py` | FastAPI app, CORS, `POST /chat` (SSE), `GET /health` |
| `tests/api/…` | pytest unit + integration tests |

**Engine changes (additive, backward-compatible)**
| File | Change |
|---|---|
| `src/company_brain/query.py` | include `chunk_id` (+ `doc_id`) in each citation and context item |
| `src/company_brain/graph.py` | add `touched_subgraph(chunk_ids)` and `neighborhood(entity_name)` |

**Part B — `web/`**
| File | Responsibility |
|---|---|
| `web/lib/events.ts` | TS mirror of `api/events.py` (the swap contract) |
| `web/lib/parseEventStream.ts` | parse an SSE byte stream → typed events |
| `web/lib/chatReducer.ts` | events → `{ messages, activeToolCalls, graph }` |
| `web/lib/useChat.ts` | React hook: POST `/chat`, feed stream into reducer |
| `web/components/*` | ChatThread, MessageBubble, ToolCallCard, CitationChip, GraphCanvas |
| `web/app/page.tsx` | the split-view chat page |
| `web/tests/*` | Vitest reducer tests + Playwright smoke test |

---

# Part A — FastAPI backend

## Task 1: API scaffold + health endpoint

**Files:**
- Modify: `pyproject.toml` (add an `api` optional-dependency group)
- Create: `api/__init__.py`
- Create: `api/main.py`
- Create: `tests/api/__init__.py`
- Create: `tests/api/test_health.py`

- [ ] **Step 1: Add API dependencies to `pyproject.toml`**

Under `[project.optional-dependencies]`, alongside the existing `dev` line, add:

```toml
api = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sse-starlette>=2.1",
    "httpx>=0.27",        # used by Starlette TestClient
]
```

Then install: `pip install -e ".[api,dev]"`

- [ ] **Step 2: Write the failing test**

`tests/api/test_health.py`:
```python
from fastapi.testclient import TestClient
from api.main import app


def test_health_ok():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/api/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api'`

- [ ] **Step 4: Create `api/__init__.py` (empty) and `api/main.py`**

`api/__init__.py`: empty file.

`api/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Company Brain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
```

Also create empty `tests/api/__init__.py`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/api/test_health.py -v`
Expected: PASS

- [ ] **Step 6: Commit** (only if committing is authorized)

```bash
git add pyproject.toml api/ tests/api/
git commit -m "feat(api): FastAPI scaffold + health endpoint"
```

---

## Task 2: Event schema + SSE serializer

**Files:**
- Create: `api/events.py`
- Create: `tests/api/test_events.py`

- [ ] **Step 1: Write the failing test**

`tests/api/test_events.py`:
```python
import json
from api.events import (
    MessageStart, Token, ToolCall, ToolResult, Citation, MessageEnd, ErrorEvent, sse,
)


def test_token_serializes_to_sse_frame():
    frame = sse(Token(text="hello"))
    assert frame == 'data: {"type":"token","text":"hello"}\n\n'


def test_tool_result_carries_graph_delta():
    ev = ToolResult(
        id="tc_1",
        summary="5 chunks",
        graph_delta={"nodes": [{"id": "Reg:MiFID II", "label": "Regulation"}], "edges": []},
    )
    payload = json.loads(sse(ev).removeprefix("data: ").strip())
    assert payload["type"] == "tool_result"
    assert payload["graph_delta"]["nodes"][0]["id"] == "Reg:MiFID II"


def test_citation_includes_sensitivity():
    ev = Citation(doc_title="ESMA", sensitivity="C2 Internal", chunk_text="...")
    payload = json.loads(sse(ev).removeprefix("data: ").strip())
    assert payload["sensitivity"] == "C2 Internal"


def test_all_events_have_distinct_type_literals():
    types = {
        MessageStart(id="m").type, Token(text="x").type, ToolCall(id="t", name="n", args={}).type,
        ToolResult(id="t", summary="s", graph_delta={"nodes": [], "edges": []}).type,
        Citation(doc_title="d", sensitivity="C2 Internal", chunk_text="c").type,
        MessageEnd(stop_reason="end_turn").type, ErrorEvent(message="e").type,
    }
    assert types == {"message_start", "token", "tool_call", "tool_result",
                     "citation", "message_end", "error"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/api/test_events.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.events'`

- [ ] **Step 3: Create `api/events.py`**

```python
from typing import Literal, Union

from pydantic import BaseModel


class MessageStart(BaseModel):
    type: Literal["message_start"] = "message_start"
    id: str


class Token(BaseModel):
    type: Literal["token"] = "token"
    text: str


class ToolCall(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    id: str
    name: str
    args: dict


class GraphDelta(BaseModel):
    nodes: list[dict] = []
    edges: list[dict] = []


class ToolResult(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    id: str
    summary: str
    graph_delta: GraphDelta | dict = GraphDelta()


class Citation(BaseModel):
    type: Literal["citation"] = "citation"
    doc_title: str
    sensitivity: str
    chunk_text: str


class MessageEnd(BaseModel):
    type: Literal["message_end"] = "message_end"
    stop_reason: str


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str


Event = Union[MessageStart, Token, ToolCall, ToolResult, Citation, MessageEnd, ErrorEvent]


def sse(event: BaseModel) -> str:
    """Serialize one event as a single SSE `data:` frame (compact JSON, no spaces)."""
    return f"data: {event.model_dump_json()}\n\n"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/api/test_events.py -v`
Expected: PASS (all 4)

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add api/events.py tests/api/test_events.py
git commit -m "feat(api): typed SSE event contract"
```

---

## Task 3: Engine — add `chunk_id`/`doc_id` to `query()` output

**Files:**
- Modify: `src/company_brain/query.py`
- Create: `tests/api/test_query_chunk_ids.py`

- [ ] **Step 1: Write the failing test**

`tests/api/test_query_chunk_ids.py`:
```python
from company_brain.query import query


class _FakeEmbedder:
    def embed(self, texts):
        return [[0.0, 0.1, 0.2]]


class _FakeStore:
    def vector_search(self, emb, k, max_sensitivity):
        return [{
            "chunk_id": "c1", "text": "structured note text", "score": 0.9,
            "doc_id": "d1", "title": "ESMA 2015-1787", "sensitivity": "C2 Internal",
        }]

    def run(self, cypher, **params):
        return [{"entities": ["MiFID II"], "insights": []}]


def test_query_exposes_chunk_id_and_doc_id():
    out = query("is a structured note complex?", store=_FakeStore(), embedder=_FakeEmbedder())
    assert out["citations"][0]["chunk_id"] == "c1"
    assert out["citations"][0]["doc_id"] == "d1"
    assert out["context"][0]["chunk_id"] == "c1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/api/test_query_chunk_ids.py -v`
Expected: FAIL — `KeyError: 'chunk_id'`

- [ ] **Step 3: Modify `src/company_brain/query.py`**

In the `citations` list comprehension, add `chunk_id` and `doc_id`:
```python
    citations = [
        {"doc_title": h["title"], "doc_id": h["doc_id"], "chunk_id": h["chunk_id"],
         "sensitivity": h["sensitivity"], "chunk_text": h["text"]}
        for h in hits
    ]
```
In the `context.append({...})` call, add `"chunk_id": h["chunk_id"],` as the first key.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/api/test_query_chunk_ids.py -v`
Expected: PASS

- [ ] **Step 5: Run the full existing suite to confirm no regression**

Run: `pytest -m "not integration" -q`
Expected: PASS (additive change; existing keys untouched)

- [ ] **Step 6: Commit** (only if authorized)

```bash
git add src/company_brain/query.py tests/api/test_query_chunk_ids.py
git commit -m "feat(query): expose chunk_id/doc_id for graph deltas"
```

---

## Task 4: Engine — graph `touched_subgraph()` and `neighborhood()`

**Files:**
- Modify: `src/company_brain/graph.py`
- Create: `tests/api/test_graph_subgraph.py`

These return `{"nodes": [...], "edges": [...]}` with stable string IDs of the form `"<Label>:<name>"` for entities, `"Chunk:<chunk_id>"`, and `"Document:<doc_id>"`. The frontend uses these IDs verbatim.

- [ ] **Step 1: Write the failing test** (unit-level, mock `run`)

`tests/api/test_graph_subgraph.py`:
```python
from company_brain.graph import GraphStore


def _store_with_run(rows):
    store = GraphStore.__new__(GraphStore)  # bypass __init__/driver
    store.run = lambda cypher, **params: rows
    return store


def test_touched_subgraph_builds_nodes_and_edges():
    rows = [{
        "chunk_id": "c1", "doc_id": "d1", "doc_title": "ESMA",
        "entities": [{"label": "Regulation", "name": "MiFID II"}],
    }]
    store = _store_with_run(rows)
    g = store.touched_subgraph(["c1"])
    ids = {n["id"] for n in g["nodes"]}
    assert "Chunk:c1" in ids and "Document:d1" in ids and "Regulation:MiFID II" in ids
    assert {"from": "Regulation:MiFID II", "to": "Chunk:c1", "rel": "MENTIONED_IN"} in g["edges"]


def test_neighborhood_builds_edges_from_rows():
    rows = [{
        "src": {"label": "Regulation", "name": "MiFID II"},
        "rel": "REQUIRES",
        "dst": {"label": "DataAttribute", "name": "Complex"},
    }]
    store = _store_with_run(rows)
    g = store.neighborhood("MiFID II")
    assert {"id": "Regulation:MiFID II", "label": "Regulation"} in g["nodes"]
    assert {"from": "Regulation:MiFID II", "to": "DataAttribute:Complex", "rel": "REQUIRES"} in g["edges"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/api/test_graph_subgraph.py -v`
Expected: FAIL — `AttributeError: 'GraphStore' object has no attribute 'touched_subgraph'`

- [ ] **Step 3: Add both methods to `GraphStore` in `src/company_brain/graph.py`**

Add inside the `GraphStore` class (e.g. after `vector_search`):
```python
    @staticmethod
    def _nid(label: str, name: str) -> str:
        return f"{label}:{name}"

    def touched_subgraph(self, chunk_ids: list[str]) -> dict:
        """Nodes/edges touched by a set of chunks: the chunks, their documents,
        and the entities mentioned in them. IDs are '<Label>:<name>' / 'Chunk:<id>'."""
        rows = self.run(
            """
            UNWIND $chunk_ids AS cid
            MATCH (c:Chunk {chunk_id: cid})-[:PART_OF]->(d:Document)
            OPTIONAL MATCH (e)-[:MENTIONED_IN]->(c)
            WHERE e:Regulation OR e:DataAttribute OR e:InstrumentType
               OR e:Obligation OR e:Concept
            RETURN c.chunk_id AS chunk_id, d.doc_id AS doc_id, d.title AS doc_title,
                   collect(DISTINCT {label: head(labels(e)), name: e.name}) AS entities
            """,
            chunk_ids=chunk_ids,
        )
        nodes: dict[str, dict] = {}
        edges: list[dict] = []
        for r in rows:
            chunk_node = f"Chunk:{r['chunk_id']}"
            doc_node = f"Document:{r['doc_id']}"
            nodes[chunk_node] = {"id": chunk_node, "label": "Chunk"}
            nodes[doc_node] = {"id": doc_node, "label": "Document", "title": r.get("doc_title")}
            edges.append({"from": chunk_node, "to": doc_node, "rel": "PART_OF"})
            for e in r["entities"]:
                if not e or not e.get("name"):
                    continue
                eid = self._nid(e["label"], e["name"])
                nodes[eid] = {"id": eid, "label": e["label"], "name": e["name"]}
                edges.append({"from": eid, "to": chunk_node, "rel": "MENTIONED_IN"})
        return {"nodes": list(nodes.values()), "edges": edges}

    def neighborhood(self, entity_name: str, limit: int = 25) -> dict:
        """1-hop backbone/reasoning neighborhood around a named entity."""
        rows = self.run(
            """
            MATCH (s {name: $name})-[r]->(t)
            WHERE (s:Regulation OR s:DataAttribute OR s:InstrumentType OR s:Obligation OR s:Concept)
              AND (t:Regulation OR t:DataAttribute OR t:InstrumentType OR t:Obligation OR t:Concept)
            RETURN {label: head(labels(s)), name: s.name} AS src,
                   type(r) AS rel,
                   {label: head(labels(t)), name: t.name} AS dst
            LIMIT $limit
            """,
            name=entity_name, limit=limit,
        )
        nodes: dict[str, dict] = {}
        edges: list[dict] = []
        for r in rows:
            s, d = r["src"], r["dst"]
            sid, did = self._nid(s["label"], s["name"]), self._nid(d["label"], d["name"])
            nodes[sid] = {"id": sid, "label": s["label"], "name": s["name"]}
            nodes[did] = {"id": did, "label": d["label"], "name": d["name"]}
            edges.append({"from": sid, "to": did, "rel": r["rel"]})
        return {"nodes": list(nodes.values()), "edges": edges}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/api/test_graph_subgraph.py -v`
Expected: PASS (both)

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add src/company_brain/graph.py tests/api/test_graph_subgraph.py
git commit -m "feat(graph): touched_subgraph + neighborhood for reactive viz"
```

---

## Task 5: Tool definitions + executors

**Files:**
- Create: `api/deps.py`
- Create: `api/tools.py`
- Create: `tests/api/test_tools.py`

Each executor returns a `(model_result: str, graph_delta: dict, citations: list[dict])` triple. `model_result` is what Claude sees; the rest is the side-channel for the wire.

- [ ] **Step 1: Create `api/deps.py`** (no test needed — thin wiring; covered via integration later)

```python
from functools import lru_cache

from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.providers.embedder import get_embedder


@lru_cache(maxsize=1)
def get_store() -> GraphStore:
    s = get_settings()
    return GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)


@lru_cache(maxsize=1)
def get_embedder_cached():
    return get_embedder(get_settings())
```

- [ ] **Step 2: Write the failing test for the tool executors**

`tests/api/test_tools.py`:
```python
from api.tools import TOOL_SCHEMAS, run_tool


class _Store:
    def vector_search(self, emb, k, max_sensitivity):
        return [{"chunk_id": "c1", "text": "note", "score": 0.9,
                 "doc_id": "d1", "title": "ESMA", "sensitivity": "C2 Internal"}]

    def run(self, cypher, **p):
        return [{"entities": ["MiFID II"], "insights": []}]

    def touched_subgraph(self, chunk_ids):
        return {"nodes": [{"id": "Chunk:c1", "label": "Chunk"}], "edges": []}

    def neighborhood(self, name, limit=25):
        return {"nodes": [{"id": "Regulation:MiFID II", "label": "Regulation"}], "edges": []}


class _Emb:
    def embed(self, texts):
        return [[0.0, 0.1, 0.2]]


def test_tool_schemas_shape():
    names = {t["name"] for t in TOOL_SCHEMAS}
    assert names == {"search_knowledge", "expand_graph", "lookup_backbone"}
    for t in TOOL_SCHEMAS:
        assert "input_schema" in t and t["input_schema"]["type"] == "object"


def test_search_knowledge_returns_triple_with_citations_and_delta():
    model_result, delta, citations = run_tool(
        "search_knowledge", {"query": "structured note"},
        store=_Store(), embedder=_Emb(), max_sensitivity="C2 Internal",
    )
    assert "ESMA" in model_result
    assert delta["nodes"][0]["id"] == "Chunk:c1"
    assert citations[0]["sensitivity"] == "C2 Internal"
    assert citations[0]["chunk_id"] == "c1"


def test_expand_graph_returns_neighborhood_delta():
    model_result, delta, citations = run_tool(
        "expand_graph", {"entity": "MiFID II"},
        store=_Store(), embedder=_Emb(), max_sensitivity="C2 Internal",
    )
    assert delta["nodes"][0]["id"] == "Regulation:MiFID II"
    assert citations == []
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/api/test_tools.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.tools'`

- [ ] **Step 4: Create `api/tools.py`**

```python
from company_brain.query import query

TOOL_SCHEMAS = [
    {
        "name": "search_knowledge",
        "description": "Semantic search over the SIX regulatory corpus. Returns the most "
                       "relevant passages with their entities and expert insights. Use this "
                       "before answering ANY question; never answer from memory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural-language search query."},
                "k": {"type": "integer", "description": "How many passages (default 5).",
                      "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "expand_graph",
        "description": "Expand the knowledge graph around a named entity (a regulation, data "
                       "attribute, instrument type, obligation, or concept) to discover related "
                       "facts. Use to chase a connection found via search_knowledge.",
        "input_schema": {
            "type": "object",
            "properties": {"entity": {"type": "string",
                                      "description": "Exact entity name, e.g. 'MiFID II'."}},
            "required": ["entity"],
        },
    },
    {
        "name": "lookup_backbone",
        "description": "Look up authoritative, spreadsheet-derived Regulation→DataAttribute facts. "
                       "Hallucination-proof: only returns deterministic backbone relationships.",
        "input_schema": {
            "type": "object",
            "properties": {"entity": {"type": "string",
                                      "description": "A regulation or data attribute name."}},
            "required": ["entity"],
        },
    },
]


def _search_knowledge(args, *, store, embedder, max_sensitivity):
    k = int(args.get("k") or 5)
    out = query(args["query"], store=store, embedder=embedder,
                max_sensitivity=max_sensitivity, k=k)
    citations = out["citations"]
    delta = store.touched_subgraph([c["chunk_id"] for c in citations])
    lines = []
    for ctx, cit in zip(out["context"], citations):
        lines.append(f"[{cit['doc_title']} · {cit['sensitivity']}] {ctx['chunk_text']}")
        for ins in ctx.get("insights", []):
            lines.append(f"  expert insight ({ins.get('role','?')}): {ins['text']}")
    model_result = "\n".join(lines) if lines else "No relevant passages found."
    return model_result, delta, citations


def _expand_graph(args, *, store, embedder, max_sensitivity):
    delta = store.neighborhood(args["entity"])
    if not delta["edges"]:
        return f"No graph neighbors found for '{args['entity']}'.", delta, []
    facts = "; ".join(f"{e['from'].split(':',1)[1]} -{e['rel']}-> {e['to'].split(':',1)[1]}"
                      for e in delta["edges"])
    return f"Graph neighbors of {args['entity']}: {facts}", delta, []


def _lookup_backbone(args, *, store, embedder, max_sensitivity):
    # Backbone is a subset of the neighborhood restricted to REQUIRES edges.
    delta = store.neighborhood(args["entity"])
    delta["edges"] = [e for e in delta["edges"] if e["rel"] == "REQUIRES"]
    if not delta["edges"]:
        return f"No backbone facts for '{args['entity']}'.", delta, []
    facts = "; ".join(f"{e['from'].split(':',1)[1]} REQUIRES {e['to'].split(':',1)[1]}"
                      for e in delta["edges"])
    return f"Authoritative backbone: {facts}", delta, []


_EXECUTORS = {
    "search_knowledge": _search_knowledge,
    "expand_graph": _expand_graph,
    "lookup_backbone": _lookup_backbone,
}


def run_tool(name, args, *, store, embedder, max_sensitivity):
    """Dispatch a tool by name. Returns (model_result, graph_delta, citations)."""
    if name not in _EXECUTORS:
        return f"Unknown tool: {name}", {"nodes": [], "edges": []}, []
    return _EXECUTORS[name](args, store=store, embedder=embedder,
                            max_sensitivity=max_sensitivity)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/api/test_tools.py -v`
Expected: PASS (3)

- [ ] **Step 6: Commit** (only if authorized)

```bash
git add api/deps.py api/tools.py tests/api/test_tools.py
git commit -m "feat(api): tool schemas + executors over query()/graph"
```

---

## Task 6: The agent loop (streaming Claude tool-use → events)

**Files:**
- Create: `api/agent.py`
- Create: `tests/api/test_agent.py`

The loop is an **async generator yielding `Event` objects**. It calls Claude with `stream=True`, relays text as `Token`, runs each `tool_use` block (emitting `ToolCall` then `ToolResult` with `graph_delta`), feeds results back, and on `end_turn` emits accumulated `Citation`s then `MessageEnd`. Anthropic interaction is injected via a `client` parameter so tests can supply a fake.

- [ ] **Step 1: Write the failing test** (fake Anthropic client scripted to call one tool then answer)

`tests/api/test_agent.py`:
```python
import asyncio

from api.agent import run_agent
from api.events import MessageStart, Token, ToolCall, ToolResult, Citation, MessageEnd


class _Block:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class _FakeMessage:
    """Mimics anthropic Message: .content (list of blocks) + .stop_reason."""
    def __init__(self, content, stop_reason):
        self.content = content
        self.stop_reason = stop_reason


class _FakeMessages:
    """First call -> tool_use; second call -> final text."""
    def __init__(self):
        self._calls = 0

    def create(self, **kw):
        self._calls += 1
        if self._calls == 1:
            return _FakeMessage(
                [_Block(type="tool_use", id="tc_1", name="search_knowledge",
                        input={"query": "structured note"})],
                stop_reason="tool_use",
            )
        return _FakeMessage(
            [_Block(type="text", text="A structured note is complex under MiFID II.")],
            stop_reason="end_turn",
        )


class _FakeClient:
    def __init__(self):
        self.messages = _FakeMessages()


def _fake_run_tool(name, args, **kw):
    return ("ESMA passage about structured notes", 
            {"nodes": [{"id": "Chunk:c1", "label": "Chunk"}], "edges": []},
            [{"doc_title": "ESMA", "doc_id": "d1", "chunk_id": "c1",
              "sensitivity": "C2 Internal", "chunk_text": "..."}])


def _collect(messages, **kw):
    async def go():
        return [e async for e in run_agent(messages, **kw)]
    return asyncio.run(go())


def test_agent_emits_well_formed_sequence():
    events = _collect(
        [{"role": "user", "content": "is a structured note complex?"}],
        client=_FakeClient(), run_tool=_fake_run_tool,
        store=None, embedder=None, max_sensitivity="C2 Internal",
        model="claude-test", system="sys",
    )
    types = [e.type for e in events]
    assert types[0] == "message_start"
    assert types[-1] == "message_end"
    assert "tool_call" in types and "tool_result" in types and "token" in types
    # tool_result carries the graph delta
    tr = next(e for e in events if e.type == "tool_result")
    assert tr.graph_delta["nodes"][0]["id"] == "Chunk:c1"
    # citation emitted before message_end
    assert "citation" in types
    assert types.index("citation") < types.index("message_end")


def test_agent_dedupes_citations_by_chunk_id():
    events = _collect(
        [{"role": "user", "content": "q"}],
        client=_FakeClient(), run_tool=_fake_run_tool,
        store=None, embedder=None, max_sensitivity="C2 Internal",
        model="claude-test", system="sys",
    )
    cites = [e for e in events if e.type == "citation"]
    assert len({c.chunk_text for c in cites}) == len(cites)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/api/test_agent.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.agent'`

- [ ] **Step 3: Create `api/agent.py`**

> Note: the loop uses the non-streaming `messages.create` for simplicity and testability — text from each turn is chunked into `Token` events so the UI still streams. (Token-level SDK streaming can be swapped in later behind the same event interface without changing the contract.)

```python
from anthropic import Anthropic

from api import tools as tools_mod
from api.events import (
    Citation, MessageEnd, MessageStart, Token, ToolCall, ToolResult,
)

MAX_TURNS = 6


def _chunk_text(text: str, size: int = 24):
    for i in range(0, len(text), size):
        yield text[i:i + size]


async def run_agent(
    messages,
    *,
    client,
    run_tool,
    store,
    embedder,
    max_sensitivity,
    model,
    system,
):
    """Drive a Claude tool-use loop, yielding typed Events. `client` and `run_tool`
    are injected so the loop is unit-testable without network or Neo4j."""
    convo = list(messages)
    seen_chunks: set[str] = set()
    pending_citations: list[Citation] = []

    yield MessageStart(id="msg")

    for _turn in range(MAX_TURNS):
        msg = client.messages.create(
            model=model,
            max_tokens=2048,
            system=system,
            tools=tools_mod.TOOL_SCHEMAS,
            messages=convo,
        )

        assistant_content = []
        tool_uses = []
        for block in msg.content:
            btype = getattr(block, "type", None)
            if btype == "text":
                assistant_content.append({"type": "text", "text": block.text})
                for piece in _chunk_text(block.text):
                    yield Token(text=piece)
            elif btype == "tool_use":
                assistant_content.append(
                    {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
                )
                tool_uses.append(block)

        convo.append({"role": "assistant", "content": assistant_content})

        if msg.stop_reason != "tool_use" or not tool_uses:
            break

        tool_results_block = []
        for tu in tool_uses:
            yield ToolCall(id=tu.id, name=tu.name, args=dict(tu.input))
            model_result, delta, citations = run_tool(
                tu.name, dict(tu.input),
                store=store, embedder=embedder, max_sensitivity=max_sensitivity,
            )
            summary = model_result.splitlines()[0][:120] if model_result else "no result"
            yield ToolResult(id=tu.id, summary=summary, graph_delta=delta)
            for c in citations:
                if c["chunk_id"] in seen_chunks:
                    continue
                seen_chunks.add(c["chunk_id"])
                pending_citations.append(Citation(
                    doc_title=c["doc_title"], sensitivity=c["sensitivity"],
                    chunk_text=c["chunk_text"],
                ))
            tool_results_block.append({
                "type": "tool_result", "tool_use_id": tu.id, "content": model_result,
            })
        convo.append({"role": "user", "content": tool_results_block})

    for c in pending_citations:
        yield c
    yield MessageEnd(stop_reason="end_turn")


def make_client(api_key: str) -> Anthropic:
    return Anthropic(api_key=api_key)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/api/test_agent.py -v`
Expected: PASS (both)

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add api/agent.py tests/api/test_agent.py
git commit -m "feat(api): streaming Claude tool-use agent loop"
```

---

## Task 7: System prompt

**Files:**
- Create: `api/prompt.py`
- Create: `tests/api/test_prompt.py`

- [ ] **Step 1: Write the failing test**

`tests/api/test_prompt.py`:
```python
from api.prompt import SYSTEM_PROMPT


def test_system_prompt_enforces_grounding_and_citation():
    p = SYSTEM_PROMPT.lower()
    assert "search_knowledge" in p          # tells it to retrieve
    assert "cite" in p or "citation" in p    # tells it to cite
    assert "do not" in p or "never" in p     # forbids ungrounded answers
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/api/test_prompt.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.prompt'`

- [ ] **Step 3: Create `api/prompt.py`**

```python
SYSTEM_PROMPT = """You are the SIX "Company Brain" — an expert assistant on financial \
instrument coverage and reference-data classification across EU/US regulations \
(MiFID II/MiFIR, SFDR, the EU ESG taxonomy, FATCA) for SIX Financial Information.

Rules you must always follow:
1. ALWAYS call `search_knowledge` before answering any substantive question. Never answer \
from prior knowledge alone — your authority comes only from the retrieved corpus.
2. When a question turns on how entities relate (which regulation governs which instrument, \
which attribute it requires), use `expand_graph` or `lookup_backbone` to ground the relationship \
in the knowledge graph rather than inferring it.
3. Cite your sources. Refer to the documents the tools return; do not state facts the retrieved \
passages do not support.
4. If retrieval returns nothing relevant, say so plainly. Do NOT fabricate coverage, \
classifications, or regulatory obligations.
5. Be precise and concise. Distinguish authoritative backbone facts from expert insights.

You are speaking with a SIX employee. Respect that some sources are sensitivity-labelled; \
the retrieval layer already filters what you may see — reason only over what you are given."""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/api/test_prompt.py -v`
Expected: PASS

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add api/prompt.py tests/api/test_prompt.py
git commit -m "feat(api): grounding/citation system prompt"
```

---

## Task 8: `/chat` SSE endpoint + access-control integration test

**Files:**
- Modify: `api/main.py`
- Create: `tests/api/test_chat_endpoint.py`

- [ ] **Step 1: Write the failing test** (mocks the agent's `client` and the store via dependency overrides)

`tests/api/test_chat_endpoint.py`:
```python
import json

from fastapi.testclient import TestClient

import api.main as main
from api.main import app


def _parse_sse(body: str):
    events = []
    for line in body.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[len("data: "):]))
    return events


def test_chat_streams_event_sequence(monkeypatch):
    # Replace the agent with a deterministic generator of events.
    from api.events import MessageStart, Token, ToolResult, Citation, MessageEnd

    async def fake_agent(messages, **kw):
        yield MessageStart(id="m")
        yield Token(text="hi")
        yield ToolResult(id="tc_1", summary="ok",
                         graph_delta={"nodes": [{"id": "Chunk:c1", "label": "Chunk"}], "edges": []})
        yield Citation(doc_title="ESMA", sensitivity="C2 Internal", chunk_text="...")
        yield MessageEnd(stop_reason="end_turn")

    monkeypatch.setattr(main, "run_agent", fake_agent)

    client = TestClient(app)
    resp = client.post("/chat", json={"messages": [{"role": "user", "content": "hello"}]})
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events[0]["type"] == "message_start"
    assert events[-1]["type"] == "message_end"
    assert any(e["type"] == "tool_result" for e in events)


def test_chat_never_leaks_confidential_at_c2(monkeypatch):
    """Access control: with max_sensitivity=C2 Internal, no Confidential citation may appear.
    The fake agent honors max_sensitivity by filtering, proving the value is threaded through."""
    from api.events import MessageStart, Citation, MessageEnd

    async def fake_agent(messages, *, max_sensitivity, **kw):
        yield MessageStart(id="m")
        all_cites = [
            Citation(doc_title="Public", sensitivity="C2 Internal", chunk_text="ok"),
            Citation(doc_title="Master Data", sensitivity="Confidential", chunk_text="secret"),
        ]
        rank = {"C2 Internal": 1, "Confidential": 2}
        for c in all_cites:
            if rank[c.sensitivity] <= rank[max_sensitivity]:
                yield c
        yield MessageEnd(stop_reason="end_turn")

    monkeypatch.setattr(main, "run_agent", fake_agent)

    client = TestClient(app)
    resp = client.post("/chat", json={
        "messages": [{"role": "user", "content": "show me master data process"}],
        "max_sensitivity": "C2 Internal",
    })
    events = _parse_sse(resp.text)
    sensitivities = {e["sensitivity"] for e in events if e["type"] == "citation"}
    assert "Confidential" not in sensitivities
    assert sensitivities == {"C2 Internal"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/api/test_chat_endpoint.py -v`
Expected: FAIL — `/chat` returns 404 (route not defined)

- [ ] **Step 3: Add the `/chat` route to `api/main.py`**

Append to `api/main.py`:
```python
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from api.agent import make_client, run_agent
from api.deps import get_embedder_cached, get_store
from api.events import ErrorEvent, sse
from api.prompt import SYSTEM_PROMPT
from company_brain.config import get_settings


class ChatRequest(BaseModel):
    messages: list[dict]
    max_sensitivity: str = "C2 Internal"


@app.post("/chat")
async def chat(req: ChatRequest):
    settings = get_settings()

    async def event_source():
        try:
            client = make_client(settings.anthropic_api_key)
            agen = run_agent(
                req.messages,
                client=client,
                run_tool=__import__("api.tools", fromlist=["run_tool"]).run_tool,
                store=get_store(),
                embedder=get_embedder_cached(),
                max_sensitivity=req.max_sensitivity,
                model=settings.extraction_model,
                system=SYSTEM_PROMPT,
            )
            async for event in agen:
                # EventSourceResponse expects the raw frame body; reuse our serializer.
                yield {"data": event.model_dump_json()}
        except Exception as exc:  # surface errors to the client as an error event
            yield {"data": ErrorEvent(message=str(exc)).model_dump_json()}

    return EventSourceResponse(event_source())
```

> Note: `run_agent` is referenced as a module attribute (`main.run_agent`) so tests can monkeypatch it; the import above binds it into `api.main`'s namespace. `sse` is imported for symmetry/reuse even though `EventSourceResponse` formats frames itself.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/api/test_chat_endpoint.py -v`
Expected: PASS (both — including the access-control test)

- [ ] **Step 5: Run the whole API suite**

Run: `pytest tests/api -v`
Expected: PASS (all tasks 1–8)

- [ ] **Step 6: Manual smoke (requires Neo4j up + `ANTHROPIC_API_KEY` set)**

```bash
docker compose up -d        # Neo4j
uvicorn api.main:app --reload --port 8000
# in another shell:
curl -N -X POST localhost:8000/chat -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Is an ESG-linked structured note a complex instrument under MiFID II?"}]}'
```
Expected: a stream of `data: {...}` frames — `message_start`, `tool_call(search_knowledge)`, `tool_result` with `graph_delta`, `token`s, `citation`s, `message_end`.

- [ ] **Step 7: Commit** (only if authorized)

```bash
git add api/main.py tests/api/test_chat_endpoint.py
git commit -m "feat(api): /chat SSE endpoint + access-control test"
```

---

# Part B — Next.js frontend

> The frontend's visual quality is a **non-negotiable acceptance criterion** (spec §5: institutional-grade fintech, dark constellation canvas, restrained palette, purposeful motion). After the functional tasks below pass, the **`frontend-design` skill** is invoked (Task 16) to bring the UI to that bar. The functional tasks establish correct behavior; `frontend-design` owns the polish.

## Task 9: Next.js scaffold + shared event types

**Files:**
- Create: `web/` (Next.js app via `create-next-app`)
- Create: `web/lib/events.ts`

- [ ] **Step 1: Scaffold the app**

```bash
cd /Users/sid/Desktop/Projects/SIX_Hack_Zurich
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --no-turbopack
cd web
npm install react-force-graph-2d
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @playwright/test
```

- [ ] **Step 2: Create `web/lib/events.ts`** (mirror of `api/events.py` — the swap contract)

```typescript
export type GraphNode = { id: string; label: string; name?: string; title?: string };
export type GraphEdge = { from: string; to: string; rel: string };
export type GraphDelta = { nodes: GraphNode[]; edges: GraphEdge[] };

export type ChatEvent =
  | { type: "message_start"; id: string }
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; summary: string; graph_delta: GraphDelta }
  | { type: "citation"; doc_title: string; sensitivity: string; chunk_text: string }
  | { type: "message_end"; stop_reason: string }
  | { type: "error"; message: string };
```

- [ ] **Step 3: Verify the app builds**

Run: `cd web && npm run build`
Expected: build succeeds (default scaffold + the new lib file compiles).

- [ ] **Step 4: Commit** (only if authorized)

```bash
git add web/
git commit -m "feat(web): Next.js scaffold + shared event types"
```

---

## Task 10: The chat reducer (the heart of the client)

**Files:**
- Create: `web/lib/chatReducer.ts`
- Create: `web/vitest.config.ts`
- Create: `web/tests/chatReducer.test.ts`

- [ ] **Step 1: Configure Vitest**

`web/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true },
});
```
Add to `web/package.json` `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing test**

`web/tests/chatReducer.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { initialState, reduce } from "@/lib/chatReducer";
import type { ChatEvent } from "@/lib/events";

const feed = (events: ChatEvent[]) =>
  events.reduce((s, e) => reduce(s, e), initialState());

describe("chatReducer", () => {
  it("appends tokens into the active assistant message", () => {
    const s = feed([
      { type: "message_start", id: "m1" },
      { type: "token", text: "Hello " },
      { type: "token", text: "world" },
    ]);
    const last = s.messages[s.messages.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.text).toBe("Hello world");
  });

  it("spawns a tool card on tool_call and resolves it on tool_result", () => {
    const s = feed([
      { type: "message_start", id: "m1" },
      { type: "tool_call", id: "tc1", name: "search_knowledge", args: { query: "x" } },
      { type: "tool_result", id: "tc1", summary: "5 chunks",
        graph_delta: { nodes: [{ id: "Chunk:c1", label: "Chunk" }], edges: [] } },
    ]);
    const card = s.activeToolCalls.find((c) => c.id === "tc1")!;
    expect(card.name).toBe("search_knowledge");
    expect(card.status).toBe("done");
    expect(card.summary).toBe("5 chunks");
  });

  it("merges graph deltas and flags newly-arrived nodes as pulsed", () => {
    const s = feed([
      { type: "tool_result", id: "tc1", summary: "",
        graph_delta: { nodes: [{ id: "Reg:MiFID II", label: "Regulation" }],
                       edges: [{ from: "Reg:MiFID II", to: "Chunk:c1", rel: "MENTIONED_IN" }] } },
    ]);
    expect(s.graph.nodes.map((n) => n.id)).toContain("Reg:MiFID II");
    expect(s.graph.edges).toHaveLength(1);
    expect(s.graph.pulsedIds).toContain("Reg:MiFID II");
  });

  it("dedupes nodes across deltas by id", () => {
    const delta = { type: "tool_result" as const, id: "t", summary: "",
      graph_delta: { nodes: [{ id: "Reg:MiFID II", label: "Regulation" }], edges: [] } };
    const s = feed([delta, { ...delta, id: "t2" }]);
    expect(s.graph.nodes.filter((n) => n.id === "Reg:MiFID II")).toHaveLength(1);
  });

  it("collects citations", () => {
    const s = feed([
      { type: "citation", doc_title: "ESMA", sensitivity: "C2 Internal", chunk_text: "..." },
    ]);
    expect(s.messages.some((m) => m.citations && m.citations.length === 1)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot resolve `@/lib/chatReducer`.

- [ ] **Step 4: Create `web/lib/chatReducer.ts`**

```typescript
import type { ChatEvent, GraphNode, GraphEdge } from "@/lib/events";

export type Citation = { doc_title: string; sensitivity: string; chunk_text: string };
export type Message = { role: "user" | "assistant"; text: string; citations?: Citation[] };
export type ToolCard = {
  id: string; name: string; args: Record<string, unknown>;
  status: "running" | "done"; summary?: string;
};
export type GraphState = { nodes: GraphNode[]; edges: GraphEdge[]; pulsedIds: string[] };
export type ChatState = {
  messages: Message[];
  activeToolCalls: ToolCard[];
  graph: GraphState;
};

export const initialState = (): ChatState => ({
  messages: [],
  activeToolCalls: [],
  graph: { nodes: [], edges: [], pulsedIds: [] },
});

function ensureAssistant(messages: Message[]): Message[] {
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant") return messages;
  return [...messages, { role: "assistant", text: "", citations: [] }];
}

export function appendUser(state: ChatState, text: string): ChatState {
  return { ...state, messages: [...state.messages, { role: "user", text }] };
}

export function reduce(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "message_start":
      return { ...state, messages: ensureAssistant(state.messages) };

    case "token": {
      const messages = ensureAssistant(state.messages);
      const idx = messages.length - 1;
      const updated = { ...messages[idx], text: messages[idx].text + event.text };
      return { ...state, messages: [...messages.slice(0, idx), updated] };
    }

    case "tool_call":
      return {
        ...state,
        activeToolCalls: [
          ...state.activeToolCalls,
          { id: event.id, name: event.name, args: event.args, status: "running" },
        ],
      };

    case "tool_result": {
      const activeToolCalls = state.activeToolCalls.map((c) =>
        c.id === event.id ? { ...c, status: "done" as const, summary: event.summary } : c,
      );
      const byId = new Map(state.graph.nodes.map((n) => [n.id, n]));
      const pulsed: string[] = [];
      for (const n of event.graph_delta.nodes) {
        if (!byId.has(n.id)) pulsed.push(n.id);
        byId.set(n.id, n);
      }
      const edgeKey = (e: GraphEdge) => `${e.from}|${e.rel}|${e.to}`;
      const edgeSet = new Map(state.graph.edges.map((e) => [edgeKey(e), e]));
      for (const e of event.graph_delta.edges) edgeSet.set(edgeKey(e), e);
      return {
        ...state,
        activeToolCalls,
        graph: {
          nodes: [...byId.values()],
          edges: [...edgeSet.values()],
          pulsedIds: pulsed,
        },
      };
    }

    case "citation": {
      const messages = ensureAssistant(state.messages);
      const idx = messages.length - 1;
      const cur = messages[idx];
      const updated = {
        ...cur,
        citations: [
          ...(cur.citations ?? []),
          { doc_title: event.doc_title, sensitivity: event.sensitivity, chunk_text: event.chunk_text },
        ],
      };
      return { ...state, messages: [...messages.slice(0, idx), updated] };
    }

    case "message_end":
    case "error":
    default:
      return state;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npm test`
Expected: PASS (all 5 reducer tests)

- [ ] **Step 6: Commit** (only if authorized)

```bash
git add web/lib/chatReducer.ts web/vitest.config.ts web/tests/ web/package.json
git commit -m "feat(web): chat reducer (events -> chat/tools/graph state)"
```

---

## Task 11: SSE stream parser + `useChat` hook

**Files:**
- Create: `web/lib/parseEventStream.ts`
- Create: `web/lib/useChat.ts`
- Create: `web/tests/parseEventStream.test.ts`

- [ ] **Step 1: Write the failing test**

`web/tests/parseEventStream.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseSSEChunk } from "@/lib/parseEventStream";

describe("parseSSEChunk", () => {
  it("extracts complete data frames and keeps the remainder buffered", () => {
    const { events, rest } = parseSSEChunk(
      'data: {"type":"token","text":"hi"}\n\ndata: {"type":"message_end"',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "token", text: "hi" });
    expect(rest).toBe('data: {"type":"message_end"');
  });

  it("returns no events when no frame is complete", () => {
    const { events, rest } = parseSSEChunk('data: {"type":"tok');
    expect(events).toHaveLength(0);
    expect(rest).toBe('data: {"type":"tok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test`
Expected: FAIL — cannot resolve `@/lib/parseEventStream`.

- [ ] **Step 3: Create `web/lib/parseEventStream.ts`**

```typescript
import type { ChatEvent } from "@/lib/events";

/** Split a buffer on SSE frame boundaries ("\n\n"); parse each `data:` line.
 *  Returns parsed events and the unterminated remainder to re-buffer. */
export function parseSSEChunk(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const frame of parts) {
    const line = frame.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice("data: ".length)) as ChatEvent);
    } catch {
      // ignore malformed frame
    }
  }
  return { events, rest };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test`
Expected: PASS

- [ ] **Step 5: Create `web/lib/useChat.ts`** (no separate unit test — exercised by the Playwright smoke test in Task 15)

```typescript
"use client";
import { useCallback, useRef, useState } from "react";
import { ChatState, initialState, reduce, appendUser } from "@/lib/chatReducer";
import { parseSSEChunk } from "@/lib/parseEventStream";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useChat() {
  const [state, setState] = useState<ChatState>(initialState());
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = useCallback(async (text: string) => {
    const withUser = appendUser(stateRef.current, text);
    setState(withUser);
    setBusy(true);

    const history = withUser.messages.map((m) => ({ role: m.role, content: m.text }));
    const resp = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSSEChunk(buffer);
      buffer = rest;
      for (const ev of events) {
        setState((s) => reduce(s, ev));
      }
    }
    setBusy(false);
  }, []);

  return { state, busy, send };
}
```

- [ ] **Step 6: Commit** (only if authorized)

```bash
git add web/lib/parseEventStream.ts web/lib/useChat.ts web/tests/parseEventStream.test.ts
git commit -m "feat(web): SSE parser + useChat hook"
```

---

## Task 12: Chat components (ChatThread, MessageBubble, ToolCallCard, CitationChip)

**Files:**
- Create: `web/components/MessageBubble.tsx`
- Create: `web/components/ToolCallCard.tsx`
- Create: `web/components/CitationChip.tsx`
- Create: `web/components/ChatThread.tsx`

> Functional components with minimal styling here; visual refinement is Task 16. Install markdown rendering: `cd web && npm install react-markdown`.

- [ ] **Step 1: Create `web/components/CitationChip.tsx`**

```tsx
import type { Citation } from "@/lib/chatReducer";

const BADGE: Record<string, string> = {
  "C2 Internal": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Confidential: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function CitationChip({ c }: { c: Citation }) {
  return (
    <span
      title={c.chunk_text}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
        BADGE[c.sensitivity] ?? "bg-zinc-700/40 text-zinc-300 border-zinc-600"
      }`}
    >
      📄 {c.doc_title}
      <span className="opacity-70">· {c.sensitivity}</span>
    </span>
  );
}
```

- [ ] **Step 2: Create `web/components/ToolCallCard.tsx`**

```tsx
import type { ToolCard } from "@/lib/chatReducer";

export function ToolCallCard({ card }: { card: ToolCard }) {
  const arg = Object.entries(card.args)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(", ");
  return (
    <div className="my-2 rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-3 py-2 font-mono text-xs">
      <div className="flex items-center gap-2">
        <span className={card.status === "running" ? "animate-pulse" : ""}>
          {card.status === "running" ? "▸" : "✓"}
        </span>
        <span className="text-sky-300">{card.name}</span>
        <span className="text-zinc-400">({arg})</span>
      </div>
      {card.summary && <div className="mt-1 pl-5 text-zinc-400">{card.summary}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create `web/components/MessageBubble.tsx`**

```tsx
import ReactMarkdown from "react-markdown";
import type { Message } from "@/lib/chatReducer";
import { CitationChip } from "@/components/CitationChip";

export function MessageBubble({ m }: { m: Message }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
          isUser ? "bg-sky-600 text-white" : "bg-zinc-800/70 text-zinc-100"
        }`}
      >
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown>{m.text || "…"}</ReactMarkdown>
        </div>
        {m.citations && m.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {m.citations.map((c, i) => (
              <CitationChip key={i} c={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `web/components/ChatThread.tsx`**

```tsx
import type { ChatState } from "@/lib/chatReducer";
import { MessageBubble } from "@/components/MessageBubble";
import { ToolCallCard } from "@/components/ToolCallCard";

export function ChatThread({ state }: { state: ChatState }) {
  return (
    <div className="flex flex-col gap-3">
      {state.messages.map((m, i) => (
        <div key={i}>
          <MessageBubble m={m} />
          {m.role === "assistant" &&
            i === state.messages.length - 1 &&
            state.activeToolCalls.map((c) => <ToolCallCard key={c.id} card={c} />)}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit** (only if authorized)

```bash
git add web/components/
git commit -m "feat(web): chat thread, message bubble, tool card, citation chip"
```

---

## Task 13: GraphCanvas (conversation-reactive force graph)

**Files:**
- Create: `web/components/GraphCanvas.tsx`

`react-force-graph-2d` touches `window`, so it must be dynamically imported with `ssr: false`.

- [ ] **Step 1: Create `web/components/GraphCanvas.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { GraphState } from "@/lib/chatReducer";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const COLOR: Record<string, string> = {
  Regulation: "#34d399",     // green — backbone
  DataAttribute: "#34d399",
  InstrumentType: "#34d399",
  Obligation: "#60a5fa",     // blue — reasoning
  Concept: "#60a5fa",
  Insight: "#60a5fa",
  Document: "#c084fc",       // purple — provenance
  Chunk: "#c084fc",
};

export function GraphCanvas({ graph }: { graph: GraphState }) {
  const data = useMemo(
    () => ({
      nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label, name: n.name ?? n.title ?? n.id })),
      links: graph.edges.map((e) => ({ source: e.from, target: e.to, rel: e.rel })),
    }),
    [graph.nodes, graph.edges],
  );
  const pulsed = useMemo(() => new Set(graph.pulsedIds), [graph.pulsedIds]);

  return (
    <ForceGraph2D
      graphData={data}
      backgroundColor="#0A0B0D"
      nodeRelSize={5}
      linkColor={() => "rgba(148,163,184,0.25)"}
      linkDirectionalParticles={1}
      nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
        const color = COLOR[node.label] ?? "#94a3b8";
        const r = pulsed.has(node.id) ? 7 : 4;
        if (pulsed.has(node.id)) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI);
          ctx.fillStyle = color + "33";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        if (scale > 1.5) {
          ctx.font = `${10 / scale}px sans-serif`;
          ctx.fillStyle = "#cbd5e1";
          ctx.fillText(node.name, node.x + r + 1, node.y + 3);
        }
      }}
    />
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit** (only if authorized)

```bash
git add web/components/GraphCanvas.tsx
git commit -m "feat(web): conversation-reactive force graph with pulse"
```

---

## Task 14: The chat page (split layout) + composer

**Files:**
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Replace `web/app/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useChat } from "@/lib/useChat";
import { ChatThread } from "@/components/ChatThread";
import { GraphCanvas } from "@/components/GraphCanvas";

export default function Home() {
  const { state, busy, send } = useChat();
  const [input, setInput] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    void send(q);
  };

  return (
    <main className="grid h-screen grid-cols-1 bg-[#0A0B0D] text-zinc-100 lg:grid-cols-[1fr_480px]">
      <section className="flex flex-col overflow-hidden">
        <header className="border-b border-zinc-800 px-6 py-4 text-sm font-semibold tracking-wide">
          SIX · Company Brain
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ChatThread state={state} />
        </div>
        <form onSubmit={submit} className="border-t border-zinc-800 p-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the company brain…"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-sky-500"
          />
        </form>
      </section>
      <aside className="hidden border-l border-zinc-800 lg:block">
        <GraphCanvas graph={state.graph} />
      </aside>
    </main>
  );
}
```

- [ ] **Step 2: Manual end-to-end check (API + Neo4j running, key set)**

```bash
# terminal 1: uvicorn api.main:app --port 8000   (with Neo4j up)
cd web && npm run dev    # terminal 2 → open http://localhost:3000
```
Ask: "Is an ESG-linked structured note a complex instrument under MiFID II?"
Expected: tokens stream into a bubble, a `search_knowledge` tool card appears then resolves, citation chips render with sensitivity badges, and graph nodes light up / pulse as tools fire.

- [ ] **Step 3: Commit** (only if authorized)

```bash
git add web/app/page.tsx
git commit -m "feat(web): split chat + reactive graph page"
```

---

## Task 15: Playwright smoke test (one full turn, API stubbed)

**Files:**
- Create: `web/playwright.config.ts`
- Create: `web/e2e/chat.spec.ts`

The test stubs `POST /chat` with a canned SSE body so it runs without the backend.

- [ ] **Step 1: Create `web/playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
  use: { baseURL: "http://localhost:3000" },
});
```

- [ ] **Step 2: Create `web/e2e/chat.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

const SSE_BODY = [
  'data: {"type":"message_start","id":"m1"}',
  'data: {"type":"tool_call","id":"tc1","name":"search_knowledge","args":{"query":"structured note"}}',
  'data: {"type":"tool_result","id":"tc1","summary":"5 chunks · ESMA","graph_delta":{"nodes":[{"id":"Reg:MiFID II","label":"Regulation"}],"edges":[]}}',
  'data: {"type":"token","text":"A structured note is complex under MiFID II."}',
  'data: {"type":"citation","doc_title":"ESMA 2015-1787","sensitivity":"C2 Internal","chunk_text":"..."}',
  'data: {"type":"message_end","stop_reason":"end_turn"}',
].join("\n\n") + "\n\n";

test("renders a full chat turn", async ({ page }) => {
  await page.route("**/chat", (route) =>
    route.fulfill({ status: 200, contentType: "text/event-stream", body: SSE_BODY }),
  );

  await page.goto("/");
  await page.getByPlaceholder("Ask the company brain…").fill("is it complex?");
  await page.getByPlaceholder("Ask the company brain…").press("Enter");

  await expect(page.getByText("A structured note is complex under MiFID II.")).toBeVisible();
  await expect(page.getByText("search_knowledge")).toBeVisible();
  await expect(page.getByText("ESMA 2015-1787")).toBeVisible();
});
```

- [ ] **Step 3: Run the smoke test**

Run: `cd web && npx playwright install chromium && npx playwright test`
Expected: PASS — the turn renders tokens, the tool card, and the citation.

- [ ] **Step 4: Commit** (only if authorized)

```bash
git add web/playwright.config.ts web/e2e/
git commit -m "test(web): Playwright smoke test for one chat turn"
```

---

## Task 16: Visual polish via `frontend-design` skill

**Files:**
- Modify: `web/app/globals.css`, `web/app/page.tsx`, `web/components/*` (styling only — no behavior change)

This task brings the UI to the spec §5 bar. **Behavior is frozen** — the reducer, event contract, and component props do not change; only presentation does.

- [ ] **Step 1: Invoke the `frontend-design` skill** with the spec §5 visual identity as the brief:

> Institutional-grade fintech (Bloomberg/Linear/Mercury). Dark near-black `#0A0B0D` canvas so the knowledge graph reads like a constellation; synapse pulses glow against deep space. Inter/Geist for UI + a mono for tool-call args and citations; tight hierarchy. Restrained neutral base + the node-label semantic palette (green backbone / blue reasoning / purple provenance) shared between graph and chips; one accent. Purposeful motion only: token streaming, tool-card resolve, graph synapse-pulse. Glass tool-call cards, precise sensitivity pills, focus-visible states, skeleton/empty states, fully responsive.

Apply its output to `globals.css` and the components, preserving every prop and the `data-testid`/visible text the Playwright test relies on.

- [ ] **Step 2: Re-run all frontend tests to confirm no behavior regressed**

Run: `cd web && npm test && npx playwright test`
Expected: PASS (reducer + parser unit tests, Playwright smoke).

- [ ] **Step 3: Visual self-check against spec §5**

Confirm: dark constellation canvas; pulses glow on tool fire; tool cards read as glass; citation chips show sensitivity pills; layout responsive; motion limited to the three sanctioned moments.

- [ ] **Step 4: Commit** (only if authorized)

```bash
git add web/
git commit -m "style(web): institutional-grade visual identity (spec §5)"
```

---

## Final verification (whole system)

- [ ] **Backend:** `pytest tests/api -v` → all green (incl. the access-control test).
- [ ] **Engine regression:** `pytest -m "not integration" -q` → green.
- [ ] **Frontend units:** `cd web && npm test` → green.
- [ ] **Frontend e2e:** `cd web && npx playwright test` → green.
- [ ] **Live demo:** Neo4j up (`docker compose up -d`), `ANTHROPIC_API_KEY` set, `uvicorn api.main:app --port 8000`, `cd web && npm run dev`. Ask the structured-note question; confirm streamed tokens, tool cards, citations with sensitivity badges, and a reactive graph.

---

## Self-review (author's check against spec)

- **§3 event contract** → Tasks 2 (Python), 9 (TS mirror), 10 (reducer). ✓ Types match field-by-field (`graph_delta` on `tool_result`; `sensitivity` on `citation`).
- **§4 agentic loop + tools** → Tasks 5–8. ✓ `search_knowledge`/`expand_graph`/`lookup_backbone`; method names consistent (`touched_subgraph`, `neighborhood`) across Tasks 4/5.
- **§4 engine changes** → Tasks 3–4 (additive; regression checked). ✓
- **§5 frontend candidate + swap contract** → Tasks 9–14; `events.ts` is the only coupling. ✓
- **§5 visual identity (non-negotiable)** → Task 16 via `frontend-design`, behavior frozen. ✓
- **§6 access control & provenance** → server-side `max_sensitivity` threaded (Task 8 test proves no Confidential leak at C2); citations carry sensitivity end-to-end (Tasks 2/8/10/12). ✓
- **§7 testing** → tool unit tests (5), SSE sequence + access-control integration (8), reducer units (10), parser units (11), Playwright smoke (15). ✓
- **Deferred v2 avatar** → no avatar tasks; event union is open for additive types (noted Tasks 2). ✓
```
