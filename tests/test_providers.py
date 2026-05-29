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
