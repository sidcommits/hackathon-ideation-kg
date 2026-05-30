import asyncio
import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from api.agent import make_client
from api.deps import get_embedder_cached, get_store
from api.reflect import distill_truths, ingest_truths
from company_brain.config import get_settings

router = APIRouter()


class ReflectRequest(BaseModel):
    messages: list[dict]
    max_sensitivity: str = "C2 Internal"


@router.post("/reflect")
async def reflect(req: ReflectRequest):
    """Read-only: distill the conversation into truths for preview. No graph write."""
    settings = get_settings()
    try:
        client = make_client(settings.anthropic_api_key)
        result = await distill_truths(req.messages, client=client,
                                      model=settings.extraction_model)
        return {"ok": True, **result}
    except Exception as exc:
        print(f"[/reflect] failed: {exc!r}")
        return {"ok": False, "error": str(exc), "summary": "", "truths": []}


class IngestRequest(BaseModel):
    truths: list[dict]
    max_sensitivity: str = "C2 Internal"
    session_id: str | None = None


@router.post("/learnings/ingest")
async def ingest(req: IngestRequest):
    """Write accepted truths into the graph (additive). Runs on user confirm only."""
    session_id = req.session_id or uuid.uuid4().hex[:12]
    try:
        counts = await asyncio.to_thread(
            ingest_truths, req.truths,
            store=get_store(), embedder=get_embedder_cached(),
            sensitivity=req.max_sensitivity, session_id=session_id,
        )
        return {"ok": True, **counts}
    except Exception as exc:
        print(f"[/learnings/ingest] failed: {exc!r}")
        return {"ok": False, "error": str(exc)}
