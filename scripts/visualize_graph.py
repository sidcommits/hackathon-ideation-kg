"""Render the knowledge graph to an interactive HTML file (pyvis / vis.js).

Pulls the SEMANTIC graph from Neo4j (regulations, attributes, instruments,
obligations, concepts, insights and their relationships) — deliberately EXCLUDING
the Chunk/Document plumbing so the picture stays legible. Nodes are colored by
type; hover a node for its full text (insights show the role + full sentence).

Usage:
    python scripts/visualize_graph.py            # whole semantic graph
    python scripts/visualize_graph.py --story    # just backbone + transcript insights
Writes graph_viz.html and prints the path. Open it in a browser.
"""

import sys

from pyvis.network import Network

from company_brain.config import get_settings
from company_brain.graph import GraphStore

COLORS = {
    "Regulation": "#ef4444",      # red
    "DataAttribute": "#22c55e",   # green
    "InstrumentType": "#3b82f6",  # blue
    "Obligation": "#f59e0b",      # amber
    "Concept": "#a855f7",         # purple
    "Insight": "#ec4899",         # pink
}
SIZES = {"Regulation": 26, "DataAttribute": 20, "InstrumentType": 22,
         "Obligation": 16, "Concept": 16, "Insight": 14}
SEMANTIC_RELS = ["REQUIRES", "APPLIES_TO", "GOVERNS", "DEFINES", "ABOUT", "RELATED_TO"]


def _short(text, n=42):
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


def main():
    story = "--story" in sys.argv
    s = get_settings()
    st = GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)

    if story:
        node_q = """
            MATCH (n)
            WHERE (n:Regulation OR n:DataAttribute OR n:InstrumentType)
               OR (n:Insight)-[:DERIVED_FROM]->(:Chunk)-[:PART_OF]->(:Document {source_type:'docx'})
               OR (n:Concept)<-[:ABOUT]-(:Insight)-[:DERIVED_FROM]->(:Chunk)-[:PART_OF]->(:Document {source_type:'docx'})
            RETURN elementId(n) AS id, labels(n)[0] AS label,
                   coalesce(n.name, n.text) AS name, n.role AS role
        """
    else:
        node_q = """
            MATCH (n)
            WHERE n:Regulation OR n:DataAttribute OR n:InstrumentType
               OR n:Obligation OR n:Concept OR n:Insight
            RETURN elementId(n) AS id, labels(n)[0] AS label,
                   coalesce(n.name, n.text) AS name, n.role AS role
        """
    nodes = st.run(node_q)
    valid_ids = {r["id"] for r in nodes}

    edges = [
        e for e in st.run(
            f"""
            MATCH (a)-[r]->(b)
            WHERE type(r) IN {SEMANTIC_RELS}
            RETURN elementId(a) AS src, elementId(b) AS dst, type(r) AS rel
            """
        )
        if e["src"] in valid_ids and e["dst"] in valid_ids
    ]
    st.close()

    net = Network(height="900px", width="100%", bgcolor="#0f172a",
                  font_color="#e2e8f0", directed=True, notebook=False, cdn_resources="remote")
    net.barnes_hut(gravity=-9000, central_gravity=0.3, spring_length=130, spring_strength=0.02)

    for r in nodes:
        label = r["label"]
        name = r["name"] or ""
        if label == "Insight":
            disp = _short(name, 30)
            title = f"[{r['role'] or 'role'}] {name}"
        else:
            disp = _short(name, 30)
            title = f"{label}: {name}"
        net.add_node(r["id"], label=disp, title=title,
                     color=COLORS.get(label, "#94a3b8"), size=SIZES.get(label, 16))

    for e in edges:
        net.add_edge(e["src"], e["dst"], label=e["rel"], color="#475569", arrowStrikethrough=False)

    out = "graph_viz_story.html" if story else "graph_viz.html"
    net.write_html(out, notebook=False, open_browser=False)
    legend = "  ".join(f"{lbl}={col}" for lbl, col in COLORS.items())
    print(f"nodes={len(nodes)} edges={len(edges)}")
    print(f"legend: {legend}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
