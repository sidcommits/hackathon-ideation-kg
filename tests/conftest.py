import os
import pytest

# Integration-test fixtures reset the graph with `MATCH (n) DETACH DELETE n`.
# GraphStore's guard blocks destructive statements unless opted in; allow them
# here for intentional LOCAL test resets. We deliberately do NOT set
# COMPANY_BRAIN_ALLOW_REMOTE_DESTRUCTIVE, so a test run can never wipe a cloud
# graph even if NEO4J_URI points at Aura.
os.environ.setdefault("COMPANY_BRAIN_ALLOW_DESTRUCTIVE", "1")


@pytest.fixture
def fake_provider():
    class FakeProvider:
        def __init__(self, canned=None):
            self.canned = canned or {"entities": [], "relationships": [], "insights": []}
            self.calls = []

        def extract(self, system, text, schema):
            self.calls.append(text)
            return self.canned
    # Returns the CLASS intentionally — tests instantiate via fake_provider(canned)
    return FakeProvider


@pytest.fixture
def fake_embedder():
    class FakeEmbedder:
        dim = 8

        def embed(self, texts):
            # deterministic, content-sensitive 8-dim vectors (no model download)
            out = []
            for t in texts:
                v = [0.0] * 8
                for i, ch in enumerate(t):
                    v[i % 8] += (ord(ch) % 17) / 100.0
                out.append(v)
            return out
    # Returns the CLASS intentionally — tests instantiate via fake_embedder()
    return FakeEmbedder


def neo4j_available():
    uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("NEO4J_USER", "neo4j")
    pw = os.getenv("NEO4J_PASSWORD", "testpassword")
    try:
        from neo4j import GraphDatabase
        d = GraphDatabase.driver(
            uri, auth=(user, pw),
            connection_timeout=3,
            connection_acquisition_timeout=3,
        )
        d.verify_connectivity()
        d.close()
        return True
    except Exception:
        return False


requires_neo4j = pytest.mark.skipif(not neo4j_available(), reason="Neo4j not reachable")
