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


def test_get_embedder_stub_raises(monkeypatch):
    import company_brain.providers.embedder as emb
    from company_brain.config import get_settings
    import pytest
    monkeypatch.setenv("EMBEDDER", "openai")
    with pytest.raises(NotImplementedError):
        emb.get_embedder(get_settings())


import pytest


@pytest.mark.integration
def test_local_embedder_real_dim():
    from company_brain.providers.embedder import LocalEmbedder
    e = LocalEmbedder("BAAI/bge-small-en-v1.5")
    v = e.embed(["MiFIR reporting"])
    assert len(v) == 1 and len(v[0]) == e.dim == 384
