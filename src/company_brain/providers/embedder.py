from typing import Protocol


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...
    @property
    def dim(self) -> int: ...


def _load_model(name: str):
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(name)


class LocalEmbedder:
    def __init__(self, model_name: str):
        self._model = _load_model(model_name)

    def embed(self, texts: list[str]) -> list[list[float]]:
        vecs = self._model.encode(list(texts), normalize_embeddings=True)
        return [list(map(float, v)) for v in vecs]

    @property
    def dim(self) -> int:
        return int(self._model.get_sentence_embedding_dimension())


# Native output dimensions for OpenAI embedding models (used when no override is set).
_OPENAI_NATIVE_DIMS = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
}


def _make_openai_client(api_key: str, base_url: str):
    """Isolated so tests can monkeypatch without importing the openai SDK.

    Note: OpenRouter does NOT serve embeddings — this must point at OpenAI's
    embeddings API (default base_url) or an OpenAI-compatible embeddings endpoint.
    """
    from openai import OpenAI
    # Force an explicit base_url. The OpenAI SDK otherwise auto-reads the
    # OPENAI_BASE_URL env var, which may hold stray/blank text from .env and break
    # the client. Only honor a real http(s) URL; fall back to the OpenAI default.
    url = base_url.strip()
    url = url if url.startswith("http") else "https://api.openai.com/v1"
    return OpenAI(api_key=api_key, base_url=url)


class OpenAIEmbedder:
    """Embeddings via OpenAI's `text-embedding-3` API.

    `dimensions` (>0) uses text-embedding-3's native truncation so the vector
    size matches the Neo4j index exactly; otherwise the model's native dimension
    is used. The reported `dim` always matches the vectors `embed()` returns.
    """

    def __init__(self, model_name: str, api_key: str, base_url: str = "", dimensions: int = 0):
        self._client = _make_openai_client(api_key, base_url)
        self._model = model_name
        self._dimensions = dimensions or None
        self._dim = dimensions or _OPENAI_NATIVE_DIMS.get(model_name, 1536)

    def embed(self, texts: list[str]) -> list[list[float]]:
        kwargs = {"model": self._model, "input": list(texts)}
        if self._dimensions:
            kwargs["dimensions"] = self._dimensions
        resp = self._client.embeddings.create(**kwargs)
        return [list(map(float, item.embedding)) for item in resp.data]

    @property
    def dim(self) -> int:
        return self._dim


def get_embedder(settings) -> Embedder:
    if settings.embedder == "local":
        return LocalEmbedder(settings.embedding_model)
    if settings.embedder == "openai":
        return OpenAIEmbedder(
            settings.embedding_model,
            settings.openai_api_key,
            settings.openai_base_url,
            settings.embedding_dim,
        )
    raise NotImplementedError(f"Unknown embedder: {settings.embedder}")
