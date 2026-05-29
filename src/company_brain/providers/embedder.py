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


class OpenAIEmbedder:  # stub — fill with text-embedding-3 (~20 lines)
    def __init__(self, *a, **k):
        raise NotImplementedError("OpenAIEmbedder is a documented stub; not implemented.")


def get_embedder(settings) -> Embedder:
    if settings.embedder == "local":
        return LocalEmbedder(settings.embedding_model)
    if settings.embedder == "openai":
        return OpenAIEmbedder()
    raise NotImplementedError(f"Unknown embedder: {settings.embedder}")
