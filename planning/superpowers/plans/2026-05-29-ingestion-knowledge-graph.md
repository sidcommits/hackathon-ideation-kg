# Ingestion + Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **PROJECT WORKING AGREEMENT — read first:** This repo's rule is **do NOT run `git commit` or `git push` until the user explicitly asks**. The `Commit` steps below are written as checkpoints, but the executor must get the user's explicit go-ahead before running any commit (or batch them and ask). Saving files is always fine.

**Goal:** Build a Python pipeline that ingests the SIX corpus (spreadsheets, PDFs, transcripts) into a Neo4j knowledge graph blending a deterministic regulatory backbone with anonymized, LLM-extracted expert reasoning, with full source provenance.

**Architecture:** Source-agnostic `Document` model. Files are routed by *content type* (magic bytes) to a deterministic structured loader (openpyxl → backbone nodes, no LLM) or an unstructured loader (markitdown → markdown → anonymize → chunk → embed → Claude-guided extraction). All nodes carry provenance to a `Chunk`→`Document` with a sensitivity label. LLM and embedder sit behind protocols so providers swap via env; only Anthropic + a local embedder are implemented now.

**Tech Stack:** Python 3.11+, openpyxl, markitdown, anthropic SDK (Claude Sonnet, tool-use structured output), sentence-transformers (local embeddings), neo4j Python driver, Neo4j 5 (local Docker → Aura via env), pytest, python-dotenv.

---

## File Structure

```
SIX_Hack_Zurich/
├── pyproject.toml                      # deps + pytest config (pythonpath=src)
├── docker-compose.yml                  # local Neo4j 5
├── .env.example                        # all config knobs
├── src/company_brain/
│   ├── __init__.py
│   ├── config.py                       # Settings dataclass + get_settings()
│   ├── model.py                        # Document, Chunk dataclasses
│   ├── metadata.py                     # infer_domain / infer_sensitivity / make_doc_id
│   ├── anonymize.py                    # names → roles
│   ├── chunk.py                        # chunk_markdown()
│   ├── extract.py                      # ONTOLOGY_SCHEMA, SYSTEM_PROMPT, extract_entities()
│   ├── graph.py                        # GraphStore (driver, schema, upserts, vector search)
│   ├── backbone.py                     # merge_backbone(store, records)
│   ├── query.py                        # query() retrieval seam for the chat workstream
│   ├── ingest.py                       # orchestrator + CLI (python -m company_brain.ingest)
│   ├── loaders/
│   │   ├── __init__.py
│   │   ├── router.py                   # detect_type() by magic bytes
│   │   ├── structured.py               # load_structured()
│   │   └── unstructured.py             # load_unstructured()
│   └── providers/
│       ├── __init__.py
│       ├── llm.py                      # LLMProvider protocol, AnthropicProvider, get_provider()
│       └── embedder.py                 # Embedder protocol, LocalEmbedder, get_embedder()
└── tests/
    ├── conftest.py                     # fakes (FakeProvider, FakeEmbedder), neo4j skip guard
    ├── fixtures/sample_transcript.md
    ├── test_config.py
    ├── test_model.py
    ├── test_metadata.py
    ├── test_router.py
    ├── test_structured_loader.py
    ├── test_unstructured_loader.py
    ├── test_anonymize.py
    ├── test_chunk.py
    ├── test_providers.py
    ├── test_extract.py
    ├── test_graph.py                   # integration (skips if Neo4j down)
    ├── test_backbone.py                # integration
    ├── test_query.py                   # integration
    └── test_ingest.py                  # integration (subset end-to-end)
```

**Testing strategy:** Pure-logic modules (config, model, metadata, router, structured loader, anonymize, chunk, extract) are unit-tested fast with no network. Provider/embedder tests use fakes + one `@pytest.mark.integration` real test each. Graph/backbone/query/ingest are integration tests that **skip automatically** if Neo4j isn't reachable (guard in `conftest.py`). Run fast tests with `pytest -m "not integration"`.

---

## Task 0: Project scaffolding

**Files:**
- Create: `pyproject.toml`, `docker-compose.yml`, `.env.example`, `src/company_brain/__init__.py`, `tests/conftest.py`

- [ ] **Step 1: Create `pyproject.toml`**

```toml
[project]
name = "company-brain"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "openpyxl>=3.1",
    "markitdown[all]>=0.0.1a2",
    "anthropic>=0.39",
    "sentence-transformers>=3.0",
    "neo4j>=5.20",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[tool.pytest.ini_options]
pythonpath = ["src"]
markers = ["integration: tests needing Neo4j or model downloads"]
addopts = "-ra"
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  neo4j:
    image: neo4j:5.23
    ports:
      - "7474:7474"   # browser
      - "7687:7687"   # bolt
    environment:
      NEO4J_AUTH: neo4j/testpassword
      NEO4J_PLUGINS: '["apoc"]'
    volumes:
      - ./.neo4j/data:/data
```

- [ ] **Step 3: Create `.env.example`**

```bash
# Graph store (local Docker now; swap these 3 for Aura later — no code change)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=testpassword

# LLM provider (anthropic implemented; openai/ollama are stubs)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
EXTRACTION_MODEL=claude-sonnet-4-6

# Embedder (local implemented; openai is a stub)
EMBEDDER=local
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5

# Tuning
CHUNK_MAX_CHARS=2000
CHUNK_OVERLAP_CHARS=200
MAX_PDF_PAGES=0          # 0 = no cap; set e.g. 30 to cap the 161-page EET for cost
```

- [ ] **Step 4: Create empty package + conftest**

`src/company_brain/__init__.py`:
```python
"""Company Brain — ingestion + knowledge graph."""
```

`tests/__init__.py` (empty — makes `tests` a package so `from tests.conftest import requires_neo4j` resolves):
```python
```

`tests/conftest.py`:
```python
import os
import pytest


@pytest.fixture
def fake_provider():
    class FakeProvider:
        def __init__(self, canned=None):
            self.canned = canned or {"entities": [], "relationships": [], "insights": []}
            self.calls = []

        def extract(self, system, text, schema):
            self.calls.append(text)
            return self.canned
    return FakeProvider


@pytest.fixture
def fake_embedder():
    class FakeEmbedder:
        dim = 8

        def embed(self, texts):
            # deterministic, content-sensitive 8-dim vectors (no model download)
            out = []
            for t in texts:
                v = [0.0] * 8
                for i, ch in enumerate(t):
                    v[i % 8] += (ord(ch) % 17) / 100.0
                out.append(v)
            return out
    return FakeEmbedder


def neo4j_available():
    from neo4j import GraphDatabase
    uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("NEO4J_USER", "neo4j")
    pw = os.getenv("NEO4J_PASSWORD", "testpassword")
    try:
        d = GraphDatabase.driver(uri, auth=(user, pw))
        d.verify_connectivity()
        d.close()
        return True
    except Exception:
        return False


requires_neo4j = pytest.mark.skipif(not neo4j_available(), reason="Neo4j not reachable")
```

- [ ] **Step 5: Create `.gitignore` additions**

Append to repo root (create if missing):
```
.neo4j/
__pycache__/
*.pyc
.venv/
.env
```

- [ ] **Step 6: Install and verify**

Run: `python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"`
Then: `pytest -m "not integration"`
Expected: `no tests ran` (collection succeeds, 0 tests) — confirms config is valid.

- [ ] **Step 7: Commit** (per working agreement — confirm with user first)

```bash
git add pyproject.toml docker-compose.yml .env.example src/company_brain/__init__.py tests/__init__.py tests/conftest.py .gitignore
git commit -m "chore: scaffold company_brain package, Neo4j compose, pytest config"
```

---

## Task 1: Config

**Files:**
- Create: `src/company_brain/config.py`
- Test: `tests/test_config.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_config.py
from company_brain.config import get_settings, Settings


def test_defaults(monkeypatch):
    for k in ["NEO4J_URI", "LLM_PROVIDER", "CHUNK_MAX_CHARS", "MAX_PDF_PAGES"]:
        monkeypatch.delenv(k, raising=False)
    s = get_settings()
    assert isinstance(s, Settings)
    assert s.neo4j_uri == "bolt://localhost:7687"
    assert s.llm_provider == "anthropic"
    assert s.chunk_max_chars == 2000
    assert s.max_pdf_pages == 0


def test_env_override(monkeypatch):
    monkeypatch.setenv("NEO4J_URI", "neo4j+s://demo.databases.neo4j.io")
    monkeypatch.setenv("MAX_PDF_PAGES", "30")
    s = get_settings()
    assert s.neo4j_uri == "neo4j+s://demo.databases.neo4j.io"
    assert s.max_pdf_pages == 30
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'company_brain.config'`

- [ ] **Step 3: Write `src/company_brain/config.py`**

```python
import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    neo4j_uri: str
    neo4j_user: str
    neo4j_password: str
    llm_provider: str
    anthropic_api_key: str
    extraction_model: str
    embedder: str
    embedding_model: str
    chunk_max_chars: int
    chunk_overlap_chars: int
    max_pdf_pages: int


def get_settings() -> Settings:
    return Settings(
        neo4j_uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        neo4j_user=os.getenv("NEO4J_USER", "neo4j"),
        neo4j_password=os.getenv("NEO4J_PASSWORD", "testpassword"),
        llm_provider=os.getenv("LLM_PROVIDER", "anthropic"),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        extraction_model=os.getenv("EXTRACTION_MODEL", "claude-sonnet-4-6"),
        embedder=os.getenv("EMBEDDER", "local"),
        embedding_model=os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5"),
        chunk_max_chars=int(os.getenv("CHUNK_MAX_CHARS", "2000")),
        chunk_overlap_chars=int(os.getenv("CHUNK_OVERLAP_CHARS", "200")),
        max_pdf_pages=int(os.getenv("MAX_PDF_PAGES", "0")),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_config.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/config.py tests/test_config.py
git commit -m "feat: config settings loaded from env"
```

---

## Task 2: Data model

**Files:**
- Create: `src/company_brain/model.py`
- Test: `tests/test_model.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_model.py
from company_brain.model import Document, Chunk


def test_document_minimal():
    d = Document(doc_id="d1", source_path="/x.pdf", source_type="pdf",
                 title="x.pdf", domain="mifid", sensitivity="C2 Internal")
    assert d.markdown is None and d.records is None


def test_chunk():
    c = Chunk(chunk_id="d1::0", doc_id="d1", text="hello", ordinal=0)
    assert c.embedding is None and c.ordinal == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_model.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write `src/company_brain/model.py`**

```python
from dataclasses import dataclass
from typing import Optional


@dataclass
class Document:
    doc_id: str
    source_path: str
    source_type: str          # "xlsx" | "pdf" | "docx" | "pptx" | "conversation"
    title: str
    domain: str
    sensitivity: str
    markdown: Optional[str] = None
    records: Optional[list[dict]] = None
    ingested_at: Optional[str] = None


@dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    text: str
    ordinal: int
    embedding: Optional[list[float]] = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_model.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/model.py tests/test_model.py
git commit -m "feat: Document and Chunk data model"
```

---

## Task 3: Metadata helpers (domain, sensitivity, doc_id)

**Files:**
- Create: `src/company_brain/metadata.py`
- Test: `tests/test_metadata.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_metadata.py
from company_brain.metadata import infer_domain, infer_sensitivity, make_doc_id


def test_infer_domain():
    assert infer_domain("EU_MIFIR_CELEX_x.pdf") == "mifir"
    assert infer_domain("EU_MiFID_xyz.pdf") == "mifid"
    assert infer_domain("EU_SFDR_x.pdf") == "sfdr"
    assert infer_domain("EU_ESG_Template.xlsx") == "esg"
    assert infer_domain("US_FATCA.pdf") == "fatca"
    assert infer_domain("six-handbook-tax-navigator-en.pdf") == "tax"
    assert infer_domain("random.pdf") == "general"


def test_infer_sensitivity():
    assert infer_sensitivity("Confidential_SIX_master-data.pdf") == "Confidential"
    assert infer_sensitivity("EU_SFDR_x.pdf") == "C2 Internal"


def test_make_doc_id_stable():
    a = make_doc_id("/a/b/US_FATCA.pdf")
    b = make_doc_id("/a/b/US_FATCA.pdf")
    assert a == b and a.startswith("us_fatca")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_metadata.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write `src/company_brain/metadata.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_metadata.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/metadata.py tests/test_metadata.py
git commit -m "feat: domain/sensitivity/doc_id inference from filenames"
```

---

## Task 4: File-type router (magic bytes)

**Files:**
- Create: `src/company_brain/loaders/__init__.py`, `src/company_brain/loaders/router.py`
- Test: `tests/test_router.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_router.py
import zipfile
from company_brain.loaders.router import detect_type


def test_pdf_by_magic(tmp_path):
    p = tmp_path / "mislabeled.xlsx"   # extension lies; content is PDF
    p.write_bytes(b"%PDF-1.5\n...rest...")
    assert detect_type(str(p)) == "pdf"


def test_xlsx_by_content(tmp_path):
    p = tmp_path / "real.xlsx"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("xl/workbook.xml", "<x/>")
    assert detect_type(str(p)) == "xlsx"


def test_docx_by_content(tmp_path):
    p = tmp_path / "doc.docx"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("word/document.xml", "<x/>")
    assert detect_type(str(p)) == "docx"


def test_unknown(tmp_path):
    p = tmp_path / "note.txt"
    p.write_bytes(b"just text")
    assert detect_type(str(p)) == "unknown"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_router.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write the loaders package init + router**

`src/company_brain/loaders/__init__.py`:
```python
```

`src/company_brain/loaders/router.py`:
```python
import zipfile
from pathlib import Path

_OFFICE_MARKERS = {"xl/": "xlsx", "word/": "docx", "ppt/": "pptx"}


def detect_type(path: str) -> str:
    """Detect file type by content (magic bytes), falling back to extension.

    Office files are ZIP containers, so we look inside to tell xlsx/docx/pptx
    apart. This is why the mislabeled EMT/EET PDFs route correctly.
    """
    with open(path, "rb") as f:
        head = f.read(4)
    if head == b"%PDF":
        return "pdf"
    if head == b"PK\x03\x04":
        try:
            names = zipfile.ZipFile(path).namelist()
        except zipfile.BadZipFile:
            return "unknown"
        for marker, kind in _OFFICE_MARKERS.items():
            if any(n.startswith(marker) for n in names):
                return kind
        return "unknown"
    ext = Path(path).suffix.lower().lstrip(".")
    return ext if ext in {"pdf", "xlsx", "docx", "pptx"} else "unknown"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_router.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/loaders/__init__.py src/company_brain/loaders/router.py tests/test_router.py
git commit -m "feat: content-based file type detection"
```

---

## Task 5: Structured loader (the deterministic backbone source)

**Files:**
- Create: `src/company_brain/loaders/structured.py`
- Test: `tests/test_structured_loader.py`

Real spreadsheet layout (verified): col A = Regulation (set on the group's first row, blank below → forward-fill), col B = Data attribute, header row is `Regulation | Data attribute`, data begins after it.

- [ ] **Step 1: Write the failing test (against the real corpus file)**

```python
# tests/test_structured_loader.py
from pathlib import Path
from company_brain.loaders.structured import load_structured

REPO = Path(__file__).resolve().parents[1]
ATTR = REPO / "SIX_Data Attributes.xlsx"


def test_loads_regulation_attribute_pairs():
    doc = load_structured(str(ATTR), domain="general", sensitivity="C2 Internal")
    assert doc.source_type == "xlsx"
    recs = doc.records
    assert {"regulation": "MiFIR / MiFID", "attribute": "Reportable Instrument"} in recs
    assert {"regulation": "SFDR", "attribute": "Waste"} in recs
    assert {"regulation": "FATCA", "attribute": "FATCA Grandfathered"} in recs
    # forward-fill: every record has a non-empty regulation
    assert all(r["regulation"] for r in recs)
    regs = {r["regulation"] for r in recs}
    assert regs == {"MiFIR / MiFID", "SFDR", "FATCA"}
    assert len(recs) == 8
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_structured_loader.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write `src/company_brain/loaders/structured.py`**

```python
from pathlib import Path

from openpyxl import load_workbook

from company_brain.metadata import make_doc_id
from company_brain.model import Document


def _clean(v) -> str:
    return v.strip() if isinstance(v, str) else ("" if v is None else str(v))


def load_structured(path: str, *, domain: str, sensitivity: str) -> Document:
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    records: list[dict] = []
    current_reg = ""
    started = False
    for row in ws.iter_rows(values_only=True):
        a = _clean(row[0]) if len(row) > 0 else ""
        b = _clean(row[1]) if len(row) > 1 else ""
        if not started:
            if a == "Regulation" and b == "Data attribute":
                started = True
            continue
        if a:
            current_reg = a          # forward-fill regulation across its attribute rows
        if b and current_reg:
            records.append({"regulation": current_reg, "attribute": b})
    wb.close()
    return Document(
        doc_id=make_doc_id(path),
        source_path=path,
        source_type="xlsx",
        title=Path(path).name,
        domain=domain,
        sensitivity=sensitivity,
        records=records,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_structured_loader.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/loaders/structured.py tests/test_structured_loader.py
git commit -m "feat: deterministic structured loader for attributes spreadsheet"
```

---

## Task 6: Unstructured loader (markitdown + low-yield logging)

**Files:**
- Create: `src/company_brain/loaders/unstructured.py`
- Test: `tests/test_unstructured_loader.py`

- [ ] **Step 1: Write the failing test (monkeypatch markitdown; no heavy IO)**

```python
# tests/test_unstructured_loader.py
import logging
import company_brain.loaders.unstructured as u
from company_brain.loaders.unstructured import load_unstructured


class _Result:
    def __init__(self, text):
        self.text_content = text


def test_returns_markdown(monkeypatch, tmp_path):
    monkeypatch.setattr(u, "_convert", lambda path: _Result("# Title\n\nlots of real content here " * 20))
    p = tmp_path / "a.pdf"; p.write_bytes(b"%PDF-1.5")
    doc = load_unstructured(str(p), source_type="pdf", domain="mifid", sensitivity="C2 Internal")
    assert doc.markdown.startswith("# Title")
    assert doc.source_type == "pdf"


def test_low_yield_warns(monkeypatch, tmp_path, caplog):
    monkeypatch.setattr(u, "_convert", lambda path: _Result("tiny"))
    p = tmp_path / "scan.pdf"; p.write_bytes(b"%PDF-1.5")
    with caplog.at_level(logging.WARNING):
        doc = load_unstructured(str(p), source_type="pdf", domain="tax", sensitivity="C2 Internal")
    assert "low-yield" in caplog.text.lower()
    assert doc.markdown == "tiny"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_unstructured_loader.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write `src/company_brain/loaders/unstructured.py`**

```python
import logging
from pathlib import Path

from company_brain.metadata import make_doc_id
from company_brain.model import Document

logger = logging.getLogger(__name__)
LOW_YIELD_CHARS = 200


def _convert(path: str):
    """Isolated so tests can monkeypatch without importing markitdown."""
    from markitdown import MarkItDown
    return MarkItDown().convert(path)


def load_unstructured(path: str, *, source_type: str, domain: str, sensitivity: str) -> Document:
    result = _convert(path)
    text = (getattr(result, "text_content", "") or "")
    if len(text.strip()) < LOW_YIELD_CHARS:
        logger.warning(
            "low-yield extraction: %s produced only %d chars (scanned PDF? consider OCR)",
            path, len(text.strip()),
        )
    return Document(
        doc_id=make_doc_id(path),
        source_path=path,
        source_type=source_type,
        title=Path(path).name,
        domain=domain,
        sensitivity=sensitivity,
        markdown=text,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_unstructured_loader.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Add a real integration test**

Append to `tests/test_unstructured_loader.py`:
```python
import pytest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


@pytest.mark.integration
def test_real_transcript_extracts_text():
    docx = REPO / "Regulatory Update transcript.docx"
    doc = load_unstructured(str(docx), source_type="docx", domain="general", sensitivity="C2 Internal")
    assert "instrument" in doc.markdown.lower()
```

Run: `pytest tests/test_unstructured_loader.py -m integration -v`
Expected: PASS (requires `markitdown` installed)

- [ ] **Step 6: Commit** (confirm with user)

```bash
git add src/company_brain/loaders/unstructured.py tests/test_unstructured_loader.py
git commit -m "feat: markitdown unstructured loader with low-yield logging"
```

---

## Task 7: Anonymizer (names → roles)

**Files:**
- Create: `src/company_brain/anonymize.py`
- Test: `tests/test_anonymize.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_anonymize.py
from company_brain.anonymize import anonymize


def test_replaces_declared_names_with_roles():
    text = (
        "Participants: Walter (Compliance Officer), Mark Jensen (Client - Wealth Platform)\n"
        "Walter: Hi Mark, how are things?\n"
        "Mark: All good, Walter.\n"
    )
    out = anonymize(text)
    assert "Walter" not in out
    assert "Mark" not in out
    assert "Compliance Officer:" in out
    assert "Client - Wealth Platform" in out


def test_no_names_is_noop():
    text = "MiFIR requires reporting of certain instruments."
    assert anonymize(text) == text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_anonymize.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write `src/company_brain/anonymize.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_anonymize.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/anonymize.py tests/test_anonymize.py
git commit -m "feat: anonymize person names to roles at ingestion"
```

---

## Task 8: Chunker

**Files:**
- Create: `src/company_brain/chunk.py`
- Test: `tests/test_chunk.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_chunk.py
from company_brain.model import Document
from company_brain.chunk import chunk_markdown


def _doc(md):
    return Document(doc_id="d1", source_path="x", source_type="pdf",
                    title="x", domain="g", sensitivity="C2 Internal", markdown=md)


def test_empty_returns_no_chunks():
    assert chunk_markdown(_doc(""), max_chars=100, overlap=10) == []


def test_splits_long_text_with_overlap():
    md = "\n\n".join(f"Paragraph {i} " + "word " * 30 for i in range(10))
    chunks = chunk_markdown(_doc(md), max_chars=300, overlap=50)
    assert len(chunks) > 1
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))
    assert all(c.chunk_id == f"d1::{c.ordinal}" for c in chunks)
    assert all(len(c.text) <= 300 for c in chunks)
    # overlap: end of chunk 0 shares text with start of chunk 1
    assert chunks[0].text[-20:] in (chunks[0].text + chunks[1].text)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_chunk.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write `src/company_brain/chunk.py`**

```python
from company_brain.model import Chunk, Document


def chunk_markdown(doc: Document, max_chars: int = 2000, overlap: int = 200) -> list[Chunk]:
    """Greedy character-window chunker that prefers paragraph boundaries.

    Deterministic and dependency-free. Windows of <= max_chars with `overlap`
    characters carried between consecutive chunks for retrieval continuity.
    """
    text = (doc.markdown or "").strip()
    chunks: list[Chunk] = []
    if not text:
        return chunks
    start, ordinal = 0, 0
    n = len(text)
    while start < n:
        end = min(start + max_chars, n)
        if end < n:
            boundary = text.rfind("\n\n", start, end)
            if boundary > start + max_chars // 2:
                end = boundary
        piece = text[start:end].strip()
        if piece:
            chunks.append(Chunk(chunk_id=f"{doc.doc_id}::{ordinal}", doc_id=doc.doc_id,
                                text=piece, ordinal=ordinal))
            ordinal += 1
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return chunks
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_chunk.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/chunk.py tests/test_chunk.py
git commit -m "feat: paragraph-aware markdown chunker"
```

---

## Task 9: LLM provider (Anthropic + factory)

**Files:**
- Create: `src/company_brain/providers/__init__.py`, `src/company_brain/providers/llm.py`
- Test: `tests/test_providers.py`

- [ ] **Step 1: Write the failing test (mock the anthropic client)**

```python
# tests/test_providers.py
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
    # ontology system prompt sent with cache_control for cost control
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_providers.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write the providers package + llm.py**

`src/company_brain/providers/__init__.py`:
```python
```

`src/company_brain/providers/llm.py`:
```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_providers.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/providers/__init__.py src/company_brain/providers/llm.py tests/test_providers.py
git commit -m "feat: LLMProvider protocol + Anthropic adapter with stubs"
```

---

## Task 10: Embedder (local + factory)

**Files:**
- Create: `src/company_brain/providers/embedder.py`
- Test: append to `tests/test_providers.py`

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_providers.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_providers.py -k embedder -v`
Expected: FAIL — `ModuleNotFoundError: company_brain.providers.embedder`

- [ ] **Step 3: Write `src/company_brain/providers/embedder.py`**

```python
from typing import Protocol


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...
    @property
    def dim(self) -> int: ...


def _load_model(name: str):
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(name)


class LocalEmbedder:
    def __init__(self, model_name: str):
        self._model = _load_model(model_name)

    def embed(self, texts: list[str]) -> list[list[float]]:
        vecs = self._model.encode(list(texts), normalize_embeddings=True)
        return [list(map(float, v)) for v in vecs]

    @property
    def dim(self) -> int:
        return int(self._model.get_sentence_embedding_dimension())


class OpenAIEmbedder:  # stub — fill with text-embedding-3 (~20 lines)
    def __init__(self, *a, **k):
        raise NotImplementedError("OpenAIEmbedder is a documented stub; not implemented.")


def get_embedder(settings) -> Embedder:
    if settings.embedder == "local":
        return LocalEmbedder(settings.embedding_model)
    if settings.embedder == "openai":
        return OpenAIEmbedder()
    raise NotImplementedError(f"Unknown embedder: {settings.embedder}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_providers.py -k embedder -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Add a real integration test**

Append to `tests/test_providers.py`:
```python
import pytest


@pytest.mark.integration
def test_local_embedder_real_dim():
    from company_brain.providers.embedder import LocalEmbedder
    e = LocalEmbedder("BAAI/bge-small-en-v1.5")
    v = e.embed(["MiFIR reporting"])
    assert len(v) == 1 and len(v[0]) == e.dim == 384
```

Run: `pytest tests/test_providers.py -m integration -v`
Expected: PASS (downloads the model once)

- [ ] **Step 6: Commit** (confirm with user)

```bash
git add src/company_brain/providers/embedder.py tests/test_providers.py
git commit -m "feat: Embedder protocol + local sentence-transformer adapter"
```

---

## Task 11: Ontology-guided extraction

**Files:**
- Create: `src/company_brain/extract.py`
- Test: `tests/test_extract.py`

- [ ] **Step 1: Write the failing test (uses the FakeProvider fixture)**

```python
# tests/test_extract.py
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
    # provider was called with the ontology system prompt
    assert "Regulation" in SYSTEM_PROMPT
    assert ONTOLOGY_SCHEMA["type"] == "object"
    assert fp.calls == ["some transcript chunk"]


def test_extract_tolerates_missing_keys(fake_provider):
    fp = fake_provider({"entities": [{"type": "Regulation", "name": "SFDR"}]})
    out = extract_entities("x", fp)
    assert out["relationships"] == []
    assert out["insights"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_extract.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write `src/company_brain/extract.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_extract.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/extract.py tests/test_extract.py
git commit -m "feat: ontology-guided extraction schema + prompt"
```

---

## Task 12: GraphStore (Neo4j driver, schema, upserts, vector search)

**Files:**
- Create: `src/company_brain/graph.py`
- Test: `tests/test_graph.py`

Start Neo4j first: `docker compose up -d` (wait ~15s for it to be ready).

- [ ] **Step 1: Write the failing integration test**

```python
# tests/test_graph.py
import pytest
from tests.conftest import requires_neo4j
from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.model import Document, Chunk


@pytest.fixture
def store():
    s = get_settings()
    gs = GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
    gs.run("MATCH (n) DETACH DELETE n")     # clean slate
    gs.ensure_schema(embedding_dim=8)
    yield gs
    gs.close()


@requires_neo4j
def test_upsert_document_and_chunk_idempotent(store):
    doc = Document(doc_id="d1", source_path="/x.pdf", source_type="pdf",
                   title="x.pdf", domain="mifid", sensitivity="C2 Internal")
    store.upsert_document(doc)
    store.upsert_document(doc)  # second call must not duplicate
    c = Chunk(chunk_id="d1::0", doc_id="d1", text="hello", ordinal=0, embedding=[0.0] * 8)
    store.upsert_chunk(c)
    n = store.run("MATCH (d:Document) RETURN count(d) AS c")[0]["c"]
    assert n == 1
    linked = store.run(
        "MATCH (:Chunk {chunk_id:'d1::0'})-[:PART_OF]->(d:Document {doc_id:'d1'}) RETURN count(*) AS c"
    )[0]["c"]
    assert linked == 1


@requires_neo4j
def test_vector_search_respects_sensitivity(store):
    for did, sens in [("pub", "C2 Internal"), ("sec", "Confidential")]:
        store.upsert_document(Document(doc_id=did, source_path="p", source_type="pdf",
                                       title=did, domain="g", sensitivity=sens))
        store.upsert_chunk(Chunk(chunk_id=f"{did}::0", doc_id=did, text="coverage",
                                 ordinal=0, embedding=[1.0] + [0.0] * 7))
    hits = store.vector_search([1.0] + [0.0] * 7, k=5, max_sensitivity="C2 Internal")
    ids = {h["doc_id"] for h in hits}
    assert "pub" in ids and "sec" not in ids   # confidential filtered out
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_graph.py -v`
Expected: FAIL — `ModuleNotFoundError` (if Neo4j down, tests SKIP instead — start docker first)

- [ ] **Step 3: Write `src/company_brain/graph.py`**

```python
from neo4j import GraphDatabase

# Sensitivity ordering for access-control filtering (higher = more restricted).
_SENS_RANK = {"C2 Internal": 1, "Confidential": 2}


class GraphStore:
    def __init__(self, uri: str, user: str, password: str):
        self._driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self._driver.close()

    def run(self, cypher: str, **params) -> list[dict]:
        with self._driver.session() as session:
            return [r.data() for r in session.run(cypher, **params)]

    def ensure_schema(self, embedding_dim: int):
        constraints = [
            "CREATE CONSTRAINT reg_name IF NOT EXISTS FOR (n:Regulation) REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT attr_name IF NOT EXISTS FOR (n:DataAttribute) REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT inst_name IF NOT EXISTS FOR (n:InstrumentType) REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT concept_name IF NOT EXISTS FOR (n:Concept) REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (n:Document) REQUIRE n.doc_id IS UNIQUE",
            "CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (n:Chunk) REQUIRE n.chunk_id IS UNIQUE",
        ]
        for c in constraints:
            self.run(c)
        self.run(
            """
            CREATE VECTOR INDEX chunk_vec IF NOT EXISTS
            FOR (c:Chunk) ON (c.embedding)
            OPTIONS {indexConfig: {`vector.dimensions`: $dim,
                                   `vector.similarity_function`: 'cosine'}}
            """,
            dim=embedding_dim,
        )

    def upsert_document(self, doc):
        self.run(
            """
            MERGE (d:Document {doc_id: $doc_id})
            SET d.title=$title, d.source_type=$source_type,
                d.domain=$domain, d.sensitivity=$sensitivity, d.source_path=$source_path
            """,
            doc_id=doc.doc_id, title=doc.title, source_type=doc.source_type,
            domain=doc.domain, sensitivity=doc.sensitivity, source_path=doc.source_path,
        )

    def upsert_chunk(self, chunk):
        self.run(
            """
            MATCH (d:Document {doc_id: $doc_id})
            MERGE (c:Chunk {chunk_id: $chunk_id})
            SET c.text=$text, c.ordinal=$ordinal, c.embedding=$embedding
            MERGE (c)-[:PART_OF]->(d)
            """,
            chunk_id=chunk.chunk_id, doc_id=chunk.doc_id, text=chunk.text,
            ordinal=chunk.ordinal, embedding=chunk.embedding,
        )

    def vector_search(self, query_embedding, k: int, max_sensitivity: str = "C2 Internal"):
        allowed = [s for s, r in _SENS_RANK.items() if r <= _SENS_RANK.get(max_sensitivity, 1)]
        return self.run(
            """
            CALL db.index.vector.queryNodes('chunk_vec', $k, $emb)
            YIELD node, score
            MATCH (node)-[:PART_OF]->(d:Document)
            WHERE d.sensitivity IN $allowed
            RETURN node.chunk_id AS chunk_id, node.text AS text, score,
                   d.doc_id AS doc_id, d.title AS title, d.sensitivity AS sensitivity
            ORDER BY score DESC
            """,
            k=k, emb=query_embedding, allowed=allowed,
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose up -d && sleep 15 && pytest tests/test_graph.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/graph.py tests/test_graph.py
git commit -m "feat: GraphStore with schema, idempotent upserts, vector search"
```

---

## Task 13: Backbone builder

**Files:**
- Create: `src/company_brain/backbone.py`
- Test: `tests/test_backbone.py`

- [ ] **Step 1: Write the failing integration test**

```python
# tests/test_backbone.py
import pytest
from tests.conftest import requires_neo4j
from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.backbone import merge_backbone


@pytest.fixture
def store():
    s = get_settings()
    gs = GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
    gs.run("MATCH (n) DETACH DELETE n")
    gs.ensure_schema(embedding_dim=8)
    yield gs
    gs.close()


@requires_neo4j
def test_merge_backbone_creates_reg_requires_attr(store):
    records = [
        {"regulation": "MiFIR / MiFID", "attribute": "Reportable Instrument"},
        {"regulation": "MiFIR / MiFID", "attribute": "Complex / Non-complex"},
        {"regulation": "SFDR", "attribute": "Waste"},
    ]
    merge_backbone(store, records)
    merge_backbone(store, records)  # idempotent
    regs = store.run("MATCH (r:Regulation) RETURN count(r) AS c")[0]["c"]
    attrs = store.run("MATCH (a:DataAttribute) RETURN count(a) AS c")[0]["c"]
    edges = store.run("MATCH (:Regulation)-[x:REQUIRES]->(:DataAttribute) RETURN count(x) AS c")[0]["c"]
    assert regs == 2 and attrs == 3 and edges == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_backbone.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write `src/company_brain/backbone.py`**

```python
def merge_backbone(store, records: list[dict]) -> None:
    """Deterministically MERGE Regulation-[:REQUIRES]->DataAttribute from structured records.

    No LLM. Idempotent: re-running with the same records creates no duplicates.
    """
    store.run(
        """
        UNWIND $records AS rec
        MERGE (r:Regulation {name: rec.regulation})
        MERGE (a:DataAttribute {name: rec.attribute})
        MERGE (r)-[:REQUIRES]->(a)
        """,
        records=records or [],
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_backbone.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/backbone.py tests/test_backbone.py
git commit -m "feat: deterministic backbone builder"
```

---

## Task 14: Extraction writer + entity resolution (provenance)

**Files:**
- Modify: `src/company_brain/graph.py` (add `merge_extraction`)
- Test: `tests/test_graph.py` (add a test)

- [ ] **Step 1: Write the failing integration test**

Append to `tests/test_graph.py`:
```python
@requires_neo4j
def test_merge_extraction_links_to_chunk_and_backbone(store):
    # backbone already has MiFIR
    store.run("MERGE (:Regulation {name:'MiFIR'})")
    store.upsert_document(Document(doc_id="d2", source_path="p", source_type="pdf",
                                   title="t", domain="mifid", sensitivity="C2 Internal"))
    store.upsert_chunk(Chunk(chunk_id="d2::0", doc_id="d2", text="...", ordinal=0,
                             embedding=[0.0] * 8))
    extraction = {
        "entities": [{"type": "Regulation", "name": "MiFIR", "aliases": ["MiFID II"]},
                     {"type": "InstrumentType", "name": "structured note"}],
        "relationships": [{"source_type": "Regulation", "source_name": "MiFIR",
                           "rel": "GOVERNS", "target_type": "InstrumentType",
                           "target_name": "structured note"}],
        "insights": [{"text": "Coverage depends on classification.",
                      "role": "Compliance Officer",
                      "about": [{"type": "InstrumentType", "name": "structured note"}]}],
    }
    store.merge_extraction(extraction, chunk_id="d2::0")
    # MiFIR not duplicated (resolved against backbone)
    assert store.run("MATCH (r:Regulation {name:'MiFIR'}) RETURN count(r) AS c")[0]["c"] == 1
    # GOVERNS edge created
    assert store.run("MATCH (:Regulation)-[g:GOVERNS]->(:InstrumentType) RETURN count(g) AS c")[0]["c"] == 1
    # insight traces to its chunk and is anonymized (role, no name)
    ins = store.run("MATCH (i:Insight)-[:DERIVED_FROM]->(:Chunk {chunk_id:'d2::0'}) RETURN i.role AS role, i.text AS text")
    assert ins[0]["role"] == "Compliance Officer"
    # entity mention provenance
    assert store.run("MATCH (:InstrumentType {name:'structured note'})-[:MENTIONED_IN]->(:Chunk) RETURN count(*) AS c")[0]["c"] >= 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_graph.py -k merge_extraction -v`
Expected: FAIL — `AttributeError: 'GraphStore' object has no attribute 'merge_extraction'`

- [ ] **Step 3: Add `merge_extraction` to `src/company_brain/graph.py`**

```python
    # add inside class GraphStore

    _NODE_LABELS = {"Regulation", "DataAttribute", "InstrumentType", "Obligation", "Concept"}

    def merge_extraction(self, extraction: dict, chunk_id: str) -> None:
        """Write extracted entities/relationships/insights, all traced to `chunk_id`.

        Entities MERGE by (label, name) so they resolve against existing backbone
        nodes instead of duplicating. Relationships and insights link to those nodes;
        every entity/insight gets provenance to the source chunk.
        """
        for ent in extraction.get("entities", []):
            label = ent.get("type")
            name = ent.get("name")
            if label not in self._NODE_LABELS or not name:
                continue
            self.run(
                f"""
                MATCH (c:Chunk {{chunk_id: $chunk_id}})
                MERGE (n:{label} {{name: $name}})
                SET n.aliases = coalesce($aliases, n.aliases)
                MERGE (n)-[:MENTIONED_IN]->(c)
                """,
                chunk_id=chunk_id, name=name, aliases=ent.get("aliases"),
            )

        for rel in extraction.get("relationships", []):
            st, sn = rel.get("source_type"), rel.get("source_name")
            tt, tn = rel.get("target_type"), rel.get("target_name")
            r = rel.get("rel")
            if st not in self._NODE_LABELS or tt not in self._NODE_LABELS:
                continue
            if r not in {"REQUIRES", "APPLIES_TO", "GOVERNS", "DEFINES", "RELATED_TO"}:
                continue
            self.run(
                f"""
                MERGE (s:{st} {{name: $sn}})
                MERGE (t:{tt} {{name: $tn}})
                MERGE (s)-[:{r}]->(t)
                """,
                sn=sn, tn=tn,
            )

        for ins in extraction.get("insights", []):
            text = ins.get("text")
            if not text:
                continue
            self.run(
                """
                MATCH (c:Chunk {chunk_id: $chunk_id})
                CREATE (i:Insight {text: $text, role: $role})
                MERGE (i)-[:DERIVED_FROM]->(c)
                """,
                chunk_id=chunk_id, text=text, role=ins.get("role", "unknown"),
            )
            for about in ins.get("about", []):
                lbl, nm = about.get("type"), about.get("name")
                if lbl not in self._NODE_LABELS or not nm:
                    continue
                self.run(
                    f"""
                    MATCH (i:Insight {{text: $text}})
                    MERGE (n:{lbl} {{name: $nm}})
                    MERGE (i)-[:ABOUT]->(n)
                    """,
                    text=text, nm=nm,
                )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_graph.py -k merge_extraction -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/graph.py tests/test_graph.py
git commit -m "feat: write extracted graph with entity resolution and provenance"
```

---

## Task 15: Ingestion orchestrator + CLI

**Files:**
- Create: `src/company_brain/ingest.py`
- Test: `tests/test_ingest.py`

- [ ] **Step 1: Write the failing test (orchestrator with fakes, no real LLM)**

```python
# tests/test_ingest.py
import pytest
from tests.conftest import requires_neo4j
from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.ingest import ingest_path


@pytest.fixture
def store():
    s = get_settings()
    gs = GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
    gs.run("MATCH (n) DETACH DELETE n")
    gs.ensure_schema(embedding_dim=8)
    yield gs
    gs.close()


@requires_neo4j
def test_ingests_structured_and_unstructured(tmp_path, store, fake_provider, fake_embedder, monkeypatch):
    # structured: a tiny real xlsx
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active
    ws.append(["SIX - Data Fields"]); ws.append([]); ws.append(["Regulation", "Data attribute"])
    ws.append(["MiFIR / MiFID", "Reportable Instrument"])
    ws.append([None, "Complex / Non-complex"])
    xlsx = tmp_path / "SIX_Data Attributes.xlsx"; wb.save(xlsx)

    # unstructured: stub markitdown so no real parsing/LLM
    import company_brain.loaders.unstructured as u
    class _R: text_content = "Participants: Walter (Compliance Officer)\nWalter: structured notes coverage depends on classification. " * 5
    monkeypatch.setattr(u, "_convert", lambda path: _R())
    pdf = tmp_path / "EU_MIFID_note.pdf"; pdf.write_bytes(b"%PDF-1.5 fake")

    canned = {"entities": [{"type": "InstrumentType", "name": "structured note"}],
              "relationships": [], "insights": [
                  {"text": "Coverage depends on classification.", "role": "Compliance Officer",
                   "about": [{"type": "InstrumentType", "name": "structured note"}]}]}

    summary = ingest_path(str(tmp_path), store=store,
                          provider=fake_provider(canned), embedder=fake_embedder(),
                          settings=get_settings())

    assert summary["structured"] == 1 and summary["unstructured"] == 1
    # backbone built
    assert store.run("MATCH (:Regulation)-[:REQUIRES]->(:DataAttribute) RETURN count(*) AS c")[0]["c"] == 2
    # anonymized insight present, traced to a chunk
    assert store.run("MATCH (i:Insight)-[:DERIVED_FROM]->(:Chunk) RETURN count(i) AS c")[0]["c"] >= 1
    assert store.run("MATCH (i:Insight) WHERE i.text CONTAINS 'Walter' RETURN count(i) AS c")[0]["c"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_ingest.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write `src/company_brain/ingest.py`**

```python
import argparse
import logging
from pathlib import Path

from company_brain.anonymize import anonymize
from company_brain.backbone import merge_backbone
from company_brain.chunk import chunk_markdown
from company_brain.config import get_settings
from company_brain.extract import extract_entities
from company_brain.graph import GraphStore
from company_brain.loaders.router import detect_type
from company_brain.loaders.structured import load_structured
from company_brain.loaders.unstructured import load_unstructured
from company_brain.metadata import infer_domain, infer_sensitivity
from company_brain.providers.embedder import get_embedder
from company_brain.providers.llm import get_provider

logger = logging.getLogger(__name__)


def ingest_path(root: str, *, store, provider, embedder, settings) -> dict:
    summary = {"structured": 0, "unstructured": 0, "skipped": 0}
    for path in sorted(Path(root).rglob("*")):
        if not path.is_file() or path.name.startswith("."):
            continue
        ftype = detect_type(str(path))
        domain = infer_domain(path.name)
        sens = infer_sensitivity(path.name)

        if ftype == "xlsx":
            doc = load_structured(str(path), domain=domain, sensitivity=sens)
            store.upsert_document(doc)
            merge_backbone(store, doc.records or [])
            summary["structured"] += 1
            logger.info("structured: %s (%d records)", path.name, len(doc.records or []))

        elif ftype in {"pdf", "docx", "pptx"}:
            doc = load_unstructured(str(path), source_type=ftype, domain=domain, sensitivity=sens)
            doc.markdown = anonymize(doc.markdown or "")
            store.upsert_document(doc)
            chunks = chunk_markdown(doc, settings.chunk_max_chars, settings.chunk_overlap_chars)
            if chunks:
                vecs = embedder.embed([c.text for c in chunks])
                for c, v in zip(chunks, vecs):
                    c.embedding = v
                    store.upsert_chunk(c)
                for c in chunks:
                    store.merge_extraction(extract_entities(c.text, provider), chunk_id=c.chunk_id)
            summary["unstructured"] += 1
            logger.info("unstructured: %s (%d chunks)", path.name, len(chunks))

        else:
            summary["skipped"] += 1
            logger.info("skipped (type=%s): %s", ftype, path.name)
    return summary


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Ingest a directory into the knowledge graph.")
    parser.add_argument("root", help="directory of source files to ingest")
    args = parser.parse_args()

    settings = get_settings()
    store = GraphStore(settings.neo4j_uri, settings.neo4j_user, settings.neo4j_password)
    embedder = get_embedder(settings)
    store.ensure_schema(embedding_dim=embedder.dim)
    provider = get_provider(settings)
    try:
        summary = ingest_path(args.root, store=store, provider=provider,
                              embedder=embedder, settings=settings)
        logger.info("DONE: %s", summary)
    finally:
        store.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_ingest.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/ingest.py tests/test_ingest.py
git commit -m "feat: ingestion orchestrator and CLI"
```

---

## Task 16: Query seam (retrieval for the chat workstream)

**Files:**
- Create: `src/company_brain/query.py`
- Test: `tests/test_query.py`

- [ ] **Step 1: Write the failing integration test**

```python
# tests/test_query.py
import pytest
from tests.conftest import requires_neo4j
from company_brain.config import get_settings
from company_brain.graph import GraphStore
from company_brain.model import Document, Chunk
from company_brain.query import query


@pytest.fixture
def store():
    s = get_settings()
    gs = GraphStore(s.neo4j_uri, s.neo4j_user, s.neo4j_password)
    gs.run("MATCH (n) DETACH DELETE n")
    gs.ensure_schema(embedding_dim=8)
    yield gs
    gs.close()


@requires_neo4j
def test_query_returns_context_with_citations(store, fake_embedder):
    store.upsert_document(Document(doc_id="d1", source_path="p", source_type="pdf",
                                   title="MiFID Note", domain="mifid", sensitivity="C2 Internal"))
    emb = fake_embedder()
    vec = emb.embed(["structured notes coverage depends on classification"])[0]
    store.upsert_chunk(Chunk(chunk_id="d1::0", doc_id="d1",
                             text="structured notes coverage depends on classification",
                             ordinal=0, embedding=vec))
    out = query("are structured notes covered?", store=store, embedder=emb, k=3)
    assert out["context"]
    assert out["citations"][0]["doc_title"] == "MiFID Note"
    assert out["citations"][0]["sensitivity"] == "C2 Internal"
    assert "chunk_text" in out["citations"][0]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_query.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write `src/company_brain/query.py`**

```python
def query(question: str, *, store, embedder, max_sensitivity: str = "C2 Internal", k: int = 5) -> dict:
    """Retrieval seam consumed by the chat workstream.

    Vector-searches chunks (filtered by access level), then expands the graph
    around each hit to gather related backbone facts and insights. Returns
    context plus a citation per source chunk (title + sensitivity + text).
    """
    q_emb = embedder.embed([question])[0]
    hits = store.vector_search(q_emb, k=k, max_sensitivity=max_sensitivity)

    citations = [
        {"doc_title": h["title"], "sensitivity": h["sensitivity"], "chunk_text": h["text"]}
        for h in hits
    ]

    context = []
    for h in hits:
        related = store.run(
            """
            MATCH (c:Chunk {chunk_id: $cid})
            OPTIONAL MATCH (e)-[:MENTIONED_IN]->(c)
            OPTIONAL MATCH (i:Insight)-[:DERIVED_FROM]->(c)
            RETURN collect(DISTINCT e.name) AS entities,
                   collect(DISTINCT {text: i.text, role: i.role}) AS insights
            """,
            cid=h["chunk_id"],
        )
        row = related[0] if related else {"entities": [], "insights": []}
        context.append({
            "chunk_text": h["text"],
            "score": h["score"],
            "entities": [x for x in row["entities"] if x],
            "insights": [x for x in row["insights"] if x and x.get("text")],
        })
    return {"context": context, "citations": citations}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_query.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit** (confirm with user)

```bash
git add src/company_brain/query.py tests/test_query.py
git commit -m "feat: query retrieval seam with citations and access filtering"
```

---

## Task 17: Full-suite run + real corpus smoke test

**Files:** none (verification task)

- [ ] **Step 1: Run the fast suite**

Run: `pytest -m "not integration" -v`
Expected: all unit tests PASS, no network used.

- [ ] **Step 2: Run the integration suite (Neo4j up)**

Run: `docker compose up -d && sleep 15 && pytest -m integration -v`
Expected: all integration tests PASS (first run downloads the embedding model).

- [ ] **Step 3: Real corpus ingest (costs Claude credits — confirm with user first)**

Run: `python -m company_brain.ingest .`
Expected: log lines per file; `DONE: {'structured': 1, 'unstructured': N, 'skipped': M}`.
Watch for `low-yield extraction` warnings (the scanned tax-navigator PDF). If the 161-page EET dominates cost, set `MAX_PDF_PAGES=30` and re-run.

- [ ] **Step 4: Eyeball the graph**

Open Neo4j Browser at http://localhost:7474 and run:
```cypher
MATCH (r:Regulation)-[:REQUIRES]->(a:DataAttribute) RETURN r, a;
MATCH (i:Insight)-[:DERIVED_FROM]->(c:Chunk)-[:PART_OF]->(d:Document) RETURN i, d LIMIT 25;
```
Expected: the backbone (3 regulations + their attributes) plus anonymized insights linked to source documents. Confirm **no personal names** appear in any `Insight.text`.

- [ ] **Step 5: Commit any fixes** (confirm with user)

```bash
git add -A
git commit -m "test: full suite green + corpus smoke test"
```

---

## Notes for the executor

- **MAX_PDF_PAGES is not yet wired into the unstructured loader.** markitdown converts whole files; if you need the page cap to control EET cost, the simplest lever is to **cap chunks per document** in `ingest_path` (e.g. `chunks = chunks[:settings.max_pdf_pages * 2]` when `max_pdf_pages > 0`) rather than truncating markdown mid-table. Decide at execution time based on actual cost.
- **Cost guard:** the first real ingest is the only step that spends credits. Run the fast + integration suites green *before* it, so you only pay once.
- **Provider/store swaps** are env-only: point `.env` at Aura (`NEO4J_URI=neo4j+s://...`) or flip `LLM_PROVIDER` — no code changes, by design.
- **Vector-index dimension is fixed at creation.** `ensure_schema` uses `CREATE VECTOR INDEX ... IF NOT EXISTS`, so it will NOT resize an existing index. The integration tests use dim 8 (fake embedder) while the real CLI uses 384 (`bge-small`). If you mix them against the same database, drop the index first: `DROP INDEX chunk_vec IF EXISTS` (this is the spec's `reindex` operation). In practice: use a throwaway DB / `docker compose down -v` between dim changes, or keep real ingest and the dim-8 tests on separate Neo4j instances.
- **Idempotent re-run cost (spec §12 nuance):** graph writes are idempotent via MERGE, but the orchestrator currently **re-extracts every chunk on each run**, re-spending LLM tokens. The spec's "hash-based skip" is not implemented. Cheap future add: store a content hash on `:Document` and skip unstructured extraction when unchanged. For the hackathon, just avoid re-running the real ingest unnecessarily.
