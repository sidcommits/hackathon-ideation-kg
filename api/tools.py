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
        "description": "Look up authoritative, spreadsheet-derived Regulation->DataAttribute facts. "
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
        lines.append(f"[{cit['doc_title']} - {cit['sensitivity']}] {ctx['chunk_text']}")
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
