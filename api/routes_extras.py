from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
from company_brain.ingest import ingest_path
from company_brain.config import get_settings
from company_brain.providers.embedder import get_embedder
from company_brain.providers.llm import get_provider
from api.deps import get_store
import tempfile

router = APIRouter()


class GraphStats(BaseModel):
    total_nodes: int
    total_edges: int
    documents: int
    insights: int
    backbone_entities: int


@router.get("/stats", response_model=GraphStats)
def get_stats():
    """Return live counts from the Neo4j knowledge graph for the curation dashboard."""
    store = get_store()
    rows = store.run(
        """
        MATCH (n)
        OPTIONAL MATCH ()-[r]->()
        RETURN
            count(DISTINCT n) AS total_nodes,
            count(DISTINCT r) AS total_edges,
            count(DISTINCT CASE WHEN n:Document THEN n END) AS docs,
            count(DISTINCT CASE WHEN n:Insight THEN n END) AS insights,
            count(DISTINCT CASE WHEN n:Regulation OR n:DataAttribute THEN n END) AS backbone
        """
    )
    row = rows[0] if rows else {}
    return GraphStats(
        total_nodes=row.get("total_nodes", 0),
        total_edges=row.get("total_edges", 0),
        documents=row.get("docs", 0),
        insights=row.get("insights", 0),
        backbone_entities=row.get("backbone", 0),
    )