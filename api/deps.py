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
