import re

# Matches "Walter (Compliance Officer)" or "Mark Jensen (Client - Wealth Platform)"
_ROLE_DECL = re.compile(r"([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s*\(([^)]+)\)")


def _is_speaker(name: str, text: str) -> bool:
    """True if `name` (full or first token) is used as a line-start 'Name:' speaker label."""
    full = re.escape(name)
    first = re.escape(name.split()[0])
    return re.search(rf"(?m)^\s*(?:{full}|{first})\s*:", text) is not None


def anonymize(text: str, provider=None) -> str:
    """Replace transcript speaker names with their declared roles. Names never enter the graph.

    A 'Name (Role)' declaration is only treated as a person when that name also
    appears as a line-start 'Name:' speaker label. This keeps regulatory prose like
    'Directive (2014/65/EU)' or 'MiFIR (Regulation)' untouched, while still
    anonymizing dialogue transcripts. `provider` is reserved for an optional LLM
    fallback; not needed for the declared-role transcripts in this corpus.
    """
    speakers: dict[str, str] = {}
    for m in _ROLE_DECL.finditer(text):
        name, role = m.group(1), m.group(2).strip()
        if _is_speaker(name, text):
            speakers[name] = role

    if not speakers:
        return text

    # Replacement map: full names + unambiguous first tokens.
    name_to_role: dict[str, str] = dict(speakers)
    first_tokens: dict[str, list[str]] = {}
    for name in speakers:
        first_tokens.setdefault(name.split()[0], []).append(name)
    for ft, names in first_tokens.items():
        if len(names) == 1 and ft not in name_to_role:
            name_to_role[ft] = speakers[names[0]]
        # ambiguous first token (two speakers share it) -> skip bare-token mapping

    # Replace declarations of confirmed speakers with their role, leave others intact.
    def _decl_sub(m: re.Match) -> str:
        return m.group(2).strip() if m.group(1) in speakers else m.group(0)

    text = _ROLE_DECL.sub(_decl_sub, text)

    # Replace bare name occurrences (longest first so multi-token names go first).
    for name, role in sorted(name_to_role.items(), key=lambda kv: -len(kv[0])):
        text = re.sub(rf"\b{re.escape(name)}\b", role, text)
    return text
