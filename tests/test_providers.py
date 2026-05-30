import company_brain.providers.llm as llm
from company_brain.providers.llm import AnthropicProvider, get_provider


class _Block:
    type = "tool_use"
    input = {"entities": [{"type": "Regulation", "name": "MiFIR"}],
             "relationships": [], "insights": []}


class _Msg:
    content = [_Block()]


class _FakeClient:
    def __init__(self, *a, **k):
        self.messages = self

    def create(self, **kwargs):
        _FakeClient.last_kwargs = kwargs
        return _Msg()


def test_anthropic_extract_returns_tool_input(monkeypatch):
    monkeypatch.setattr(llm, "_make_client", lambda key: _FakeClient())
    p = AnthropicProvider(api_key="x", model="claude-sonnet-4-6")
    out = p.extract("system prompt", "some chunk", {"type": "object"})
    assert out["entities"][0]["name"] == "MiFIR"
    assert _FakeClient.last_kwargs["system"][0]["cache_control"]["type"] == "ephemeral"


def test_get_provider_anthropic(monkeypatch):
    from company_brain.config import get_settings
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    monkeypatch.setattr(llm, "_make_client", lambda key: _FakeClient())
    p = get_provider(get_settings())
    assert isinstance(p, AnthropicProvider)


def test_get_provider_stub_raises(monkeypatch):
    from company_brain.config import get_settings
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    import pytest
    with pytest.raises(NotImplementedError):
        get_provider(get_settings())


def test_get_embedder_local(monkeypatch):
    import company_brain.providers.embedder as emb
    from company_brain.config import get_settings

    class _FakeST:
        def __init__(self, name): pass
        def encode(self, texts, normalize_embeddings=True):
            return [[0.1, 0.2, 0.3] for _ in texts]
        def get_sentence_embedding_dimension(self): return 3

    monkeypatch.setenv("EMBEDDER", "local")
    monkeypatch.setattr(emb, "_load_model", lambda name: _FakeST(name))
    e = emb.get_embedder(get_settings())
    vecs = e.embed(["a", "b"])
    assert len(vecs) == 2 and e.dim == 3


class _FakeEmbItem:
    def __init__(self, vec):
        self.embedding = vec


class _FakeEmbResp:
    def __init__(self, n, size=1536):
        self.data = [_FakeEmbItem([0.0] * size) for _ in range(n)]


class _FakeOpenAI:
    last_kwargs = None

    def __init__(self, *a, **k):
        self.embeddings = self

    def create(self, **kwargs):
        _FakeOpenAI.last_kwargs = kwargs
        size = kwargs.get("dimensions", 1536)
        return _FakeEmbResp(len(kwargs["input"]), size)


def test_get_embedder_openai(monkeypatch):
    import company_brain.providers.embedder as emb
    from company_brain.config import get_settings

    monkeypatch.setenv("EMBEDDER", "openai")
    monkeypatch.setenv("EMBEDDING_MODEL", "text-embedding-3-small")
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    monkeypatch.delenv("EMBEDDING_DIM", raising=False)
    monkeypatch.setattr(emb, "_make_openai_client", lambda api_key, base_url: _FakeOpenAI())

    e = emb.get_embedder(get_settings())
    vecs = e.embed(["a", "b"])
    assert len(vecs) == 2
    assert e.dim == 1536                       # native dim for text-embedding-3-small
    assert _FakeOpenAI.last_kwargs["model"] == "text-embedding-3-small"
    assert "dimensions" not in _FakeOpenAI.last_kwargs   # no override → don't send it


def test_openai_embedder_dimensions_override(monkeypatch):
    import company_brain.providers.embedder as emb
    monkeypatch.setattr(emb, "_make_openai_client", lambda api_key, base_url: _FakeOpenAI())
    e = emb.OpenAIEmbedder("text-embedding-3-small", "x", dimensions=256)
    vecs = e.embed(["hi"])
    assert e.dim == 256                        # reported dim matches the override
    assert len(vecs[0]) == 256
    assert _FakeOpenAI.last_kwargs["dimensions"] == 256   # override passed to the API


import pytest


@pytest.mark.integration
def test_local_embedder_real_dim():
    from company_brain.providers.embedder import LocalEmbedder
    e = LocalEmbedder("BAAI/bge-small-en-v1.5")
    v = e.embed(["MiFIR reporting"])
    assert len(v) == 1 and len(v[0]) == e.dim == 384


@pytest.mark.integration
def test_openai_embedder_real_dim():
    import os
    if not os.getenv("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not set")
    from company_brain.providers.embedder import OpenAIEmbedder
    e = OpenAIEmbedder("text-embedding-3-small", os.getenv("OPENAI_API_KEY"),
                       base_url=os.getenv("OPENAI_BASE_URL", ""))
    v = e.embed(["MiFIR reporting"])
    assert len(v) == 1 and len(v[0]) == e.dim == 1536
