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
    # FAN-OUT: each live SSE connection registers its OWN queue. broadcast() pushes
    # every event to ALL of them, so no consumer can steal another's event (a single
    # shared queue handed each event to only ONE waiter — zombie/reconnect consumers
    # stole the MirrorTurn and the live page got nothing). Zombies just get GC'd.
    subscribers: set = field(default_factory=set)
    # Questions whose turn is CURRENTLY being processed. Guards against Beyond
    # Presence firing /v1 twice for the SAME turn (concurrent duplicate bubbles)
    # WITHOUT blocking a later re-ask of the same question.
    inflight_questions: set = field(default_factory=set)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    def broadcast(self, event) -> None:
        """Deliver one event to every connected SSE consumer."""
        for q in list(self.subscribers):
            q.put_nowait(event)


ACTIVE_CALLS: dict[str, ActiveCall] = {}
CURRENT_ACTIVE_CALL_ID: str | None = None


@lru_cache(maxsize=1)
def get_store() -> GraphStore:
    s = get_settings()
    return GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)


@lru_cache(maxsize=1)
def get_embedder_cached():
    return get_embedder(get_settings())

