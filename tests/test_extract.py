from company_brain.extract import extract_entities, ONTOLOGY_SCHEMA, SYSTEM_PROMPT


def test_extract_passes_prompt_and_schema_and_returns_graph(fake_provider):
    canned = {
        "entities": [{"type": "InstrumentType", "name": "structured note", "aliases": []}],
        "relationships": [],
        "insights": [{"text": "Coverage depends on classification.",
                      "role": "Compliance Officer",
                      "about": [{"type": "InstrumentType", "name": "structured note"}]}],
    }
    fp = fake_provider(canned)
    out = extract_entities("some transcript chunk", fp)
    assert out["entities"][0]["name"] == "structured note"
    assert out["insights"][0]["role"] == "Compliance Officer"
    assert "Regulation" in SYSTEM_PROMPT
    assert ONTOLOGY_SCHEMA["type"] == "object"
    assert fp.calls == ["some transcript chunk"]


def test_extract_tolerates_missing_keys(fake_provider):
    fp = fake_provider({"entities": [{"type": "Regulation", "name": "SFDR"}]})
    out = extract_entities("x", fp)
    assert out["relationships"] == []
    assert out["insights"] == []
