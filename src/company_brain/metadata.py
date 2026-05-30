import hashlib
import re
from pathlib import Path

# Order matters: check more-specific prefixes first.
_DOMAIN_RULES = [
    ("mifir", ("mifir",)),
    ("mifid", ("mifid", "miifid")),
    ("sfdr", ("sfdr",)),
    ("esg", ("esg",)),
    ("fatca", ("fatca",)),
    ("tax", ("tax-navigator", "tax_navigator", "tax-")),
    ("regulatory", ("regulatory-navigator",)),
]


def infer_domain(filename: str) -> str:
    low = filename.lower()
    for domain, needles in _DOMAIN_RULES:
        if any(n in low for n in needles):
            return domain
    return "general"


def infer_sensitivity(filename: str) -> str:
    return "Confidential" if filename.lower().startswith("confidential") else "C2 Internal"


def make_doc_id(path: str) -> str:
    name = Path(path).stem.lower()
    slug = re.sub(r"[^a-z0-9]+", "_", name).strip("_")[:40]
    h = hashlib.sha1(path.encode()).hexdigest()[:8]
    return f"{slug}_{h}"
