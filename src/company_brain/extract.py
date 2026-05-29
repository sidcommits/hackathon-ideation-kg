"""Ontology-guided extraction: a chunk of text -> graph fragment.

Allowed node types mirror the graph ontology. Insights capture tacit expert
reasoning and MUST carry a role, never a person's name (names are already
stripped upstream by anonymize.py; this is a second guard in the prompt).
"""

ONTOLOGY_SCHEMA = {
    "type": "object",
    "properties": {
        "entities": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string",
                             "enum": ["Regulation", "DataAttribute", "InstrumentType",
                                      "Obligation", "Concept"]},
                    "name": {"type": "string"},
                    "aliases": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["type", "name"],
            },
        },
        "relationships": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source_type": {"type": "string"},
                    "source_name": {"type": "string"},
                    "rel": {"type": "string",
                            "enum": ["REQUIRES", "APPLIES_TO", "GOVERNS",
                                     "DEFINES", "RELATED_TO"]},
                    "target_type": {"type": "string"},
                    "target_name": {"type": "string"},
                },
                "required": ["source_type", "source_name", "rel", "target_type", "target_name"],
            },
        },
        "insights": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "role": {"type": "string"},
                    "about": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"type": {"type": "string"}, "name": {"type": "string"}},
                            "required": ["type", "name"],
                        },
                    },
                },
                "required": ["text", "role"],
            },
        },
    },
    "required": ["entities", "relationships", "insights"],
}

SYSTEM_PROMPT = """You extract a knowledge graph from a passage of SIX financial-regulation material.

Node types you may emit: Regulation, DataAttribute, InstrumentType, Obligation, Concept.
Relationship types: REQUIRES, APPLIES_TO, GOVERNS, DEFINES, RELATED_TO.

Capture tacit expert REASONING as `insights`: judgments, caveats, "it depends" logic, and
decision history. Each insight records the speaker's ROLE (e.g. "Compliance Officer") and
NEVER a personal name. If you see a name, use their role instead.

Use canonical names (e.g. "MiFIR", "SFDR"); put variants in `aliases`. Only emit what the
passage supports — do not invent. Return empty arrays when nothing applies.
"""


def extract_entities(chunk_text: str, provider) -> dict:
    raw = provider.extract(SYSTEM_PROMPT, chunk_text, ONTOLOGY_SCHEMA) or {}
    return {
        "entities": raw.get("entities", []),
        "relationships": raw.get("relationships", []),
        "insights": raw.get("insights", []),
    }
