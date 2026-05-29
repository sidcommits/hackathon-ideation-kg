import re

# Matches "Walter (Compliance Officer)" or "Mark Jensen (Client - Wealth Platform)"
_ROLE_DECL = re.compile(r"([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s*\(([^)]+)\)")


def anonymize(text: str, provider=None) -> str:
    """Replace person names with their declared roles. Names never enter the graph.

    Primary strategy: transcripts declare 'Name (Role)' up front; we map each name
    (and its first token, e.g. 'Mark' from 'Mark Jensen') to the role, then replace
    all occurrences. `provider` is reserved for an optional LLM fallback on residual
    names; not required for the declared-role transcripts in this corpus.
    """
    name_to_role: dict[str, str] = {}

    def _capture(m: re.Match) -> str:
        name, role = m.group(1), m.group(2).strip()
        name_to_role[name] = role
        name_to_role[name.split()[0]] = role
        return role

    text = _ROLE_DECL.sub(_capture, text)
    # Replace longer names first so "Mark Jensen" is handled before "Mark".
    for name, role in sorted(name_to_role.items(), key=lambda kv: -len(kv[0])):
        text = re.sub(rf"\b{re.escape(name)}\b", role, text)
    return text
