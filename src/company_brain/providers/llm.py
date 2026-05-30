from typing import Protocol


class LLMProvider(Protocol):
    def extract(self, system: str, text: str, schema: dict) -> dict: ...


def _make_client(api_key: str):
    import anthropic
    return anthropic.Anthropic(api_key=api_key)


class AnthropicProvider:
    """Claude with forced tool-use for reliable structured output."""

    def __init__(self, api_key: str, model: str):
        self._client = _make_client(api_key)
        self._model = model

    def extract(self, system: str, text: str, schema: dict) -> dict:
        tool = {"name": "emit_graph", "description": "Emit the extracted graph.",
                "input_schema": schema}
        msg = self._client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            tools=[tool],
            tool_choice={"type": "tool", "name": "emit_graph"},
            messages=[{"role": "user", "content": text}],
        )
        for block in msg.content:
            if getattr(block, "type", None) == "tool_use":
                return block.input
        return {"entities": [], "relationships": [], "insights": []}


class OpenAIProvider:  # stub — fill with response_format JSON-schema mode (~30 lines)
    def __init__(self, *a, **k):
        raise NotImplementedError("OpenAIProvider is a documented stub; not implemented.")


class OllamaProvider:  # stub — fill with format=json local call (~30 lines)
    def __init__(self, *a, **k):
        raise NotImplementedError("OllamaProvider is a documented stub; not implemented.")


def get_provider(settings) -> LLMProvider:
    name = settings.llm_provider
    if name == "anthropic":
        return AnthropicProvider(settings.anthropic_api_key, settings.extraction_model)
    if name == "openai":
        return OpenAIProvider()
    if name == "ollama":
        return OllamaProvider()
    raise NotImplementedError(f"Unknown LLM provider: {name}")
