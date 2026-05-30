from functools import lru_cache
import asyncio
from dataclasses import dataclass, field

from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.providers.embedder import get_embedder


@dataclass
class ActiveCall:
    call_id: str
    max_sensitivity: str = "C2 Internal"
    event_queue: asyncio.Queue = field(default_factory=asyncio.Queue)


ACTIVE_CALLS: dict[str, ActiveCall] = {}
CURRENT_ACTIVE_CALL_ID: str | None = None


@lru_cache(maxsize=1)
def get_store() -> GraphStore:
    s = get_settings()
    return GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)


@lru_cache(maxsize=1)
def get_embedder_cached():
    return get_embedder(get_settings())

