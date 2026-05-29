import pytest
from tests.conftest import requires_neo4j
from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.backbone import merge_backbone


@pytest.fixture
def store():
    s = get_settings()
    gs = GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
    gs.run("MATCH (n) DETACH DELETE n")
    gs.ensure_schema(embedding_dim=8)
    yield gs
    gs.close()


@requires_neo4j
def test_merge_backbone_creates_reg_requires_attr(store):
    records = [
        {"regulation": "MiFIR / MiFID", "attribute": "Reportable Instrument"},
        {"regulation": "MiFIR / MiFID", "attribute": "Complex / Non-complex"},
        {"regulation": "SFDR", "attribute": "Waste"},
    ]
    merge_backbone(store, records)
    merge_backbone(store, records)  # idempotent
    regs = store.run("MATCH (r:Regulation) RETURN count(r) AS c")[0]["c"]
    attrs = store.run("MATCH (a:DataAttribute) RETURN count(a) AS c")[0]["c"]
    edges = store.run("MATCH (:Regulation)-[x:REQUIRES]->(:DataAttribute) RETURN count(x) AS c")[0]["c"]
    assert regs == 2 and attrs == 3 and edges == 3
