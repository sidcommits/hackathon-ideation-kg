"""Read-only retrieval probe: which documents does a question cite?

Vector-search only (no agent, no writes). Used to pick a demo question whose
citations land on a specific hosted document. Safe against the live graph.
"""
import sys
from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.providers.embedder import get_embedder
from company_brain.query import query

QUESTIONS = [
    # the three built-in app suggestions
    "Is an ESG-linked structured note complex under MiFID II?",
    "Which SFDR attributes apply to a green bond fund?",
    "Is this instrument in scope for FATCA reporting?",
    # navigator-targeted
    "How does the SIX Regulatory Navigator support MiFID II classification?",
    "How does the SIX Tax Navigator help with FATCA classification?",
]

def main():
    s = get_settings()
    store = GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
    embedder = get_embedder(s)
    for q in QUESTIONS:
        try:
            res = query(q, store=store, embedder=embedder, max_sensitivity="C2 Internal", k=5)
        except Exception as exc:
            print(f"\nQ: {q}\n  ERROR: {exc}")
            continue
        print(f"\nQ: {q}")
        for c in res["citations"]:
            print(f"   - [{c['sensitivity']:<13}] {c['doc_title']}")

if __name__ == "__main__":
    sys.exit(main())
