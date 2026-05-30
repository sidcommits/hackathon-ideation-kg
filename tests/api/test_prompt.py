from api.prompt import SYSTEM_PROMPT


def test_system_prompt_enforces_grounding_and_citation():
    p = SYSTEM_PROMPT.lower()
    assert "search_knowledge" in p          # tells it to retrieve
    assert "cite" in p or "citation" in p    # tells it to cite
    assert "do not" in p or "never" in p     # forbids ungrounded answers
