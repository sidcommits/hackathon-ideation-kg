# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is a **Hack Zurich / START Hack hackathon** workspace for the **SIX "Build the Company Brain – Unlocking Knowledge"** challenge. As of now it contains **only the source corpus** — regulatory PDFs, FinDatEx template spreadsheets, an attribute-mapping spreadsheet, and SME interview transcripts. **There is no application code, build system, tests, or dependencies yet.** Any code you add is greenfield; choose the stack.

### The challenge
Subject Matter Experts (SIX Financial Information employees) hold critical, experience-based knowledge about which financial instruments are covered under which regulations and how they are classified in reference data. That knowledge is fragmented across documents and people and is lost when they leave. The solution must:
- **Capture** tacit + explicit expert knowledge in context (the PDFs + transcripts are the raw material).
- **Make it accessible/reusable via AI** (expect a RAG / retrieval-over-documents + Q&A pattern over this corpus).
- **Ensure traceability & trust** — answers must cite their source document/passage and expose reasoning.
- **Respect governance & access control** — documents carry sensitivity labels (most are `C2 Internal`; `Confidential_SIX_master-data-openining-and-mutations-facsheet.pdf` is the most restricted). Do not treat all content as public.

## The corpus (the data you build on top of)

Files are grouped by regulatory domain via filename prefix:

- **`SIX_Data Attributes.xlsx`** — the spine of the domain. Maps each **Regulation → Data attribute** (MiFIR/MiFID: Reportable Instrument, Complex/Non-complex; SFDR: GHG emissions, Biodiversity, Waste, Social/Employee matters; FATCA: in-scope, Grandfathered). Start here to understand the entity/attribute model.
- **`EU_MiFID_*` / `EU_MIFIR_*`** — MiFID II / MiFIR directives, ESMA product-governance guidelines, complex-instrument guidelines, the reference-data infographic, and the **EMT V4.3** FinDatEx template (`EU_MIFID_Template_*.xlsx`).
- **`EU_SFDR_*`** — SFDR regulation text and the joint ESAs final report on RTS.
- **`EU_ESG_*`** — taxonomy-related disclosure RTS report and the **EET V1.1.3** FinDatEx template (`EU_ESG_Template_*.xlsx`).
- **`US_FATCA.pdf` / `US_six-factsheet-fatca-en.pdf`** — FATCA reference + SIX factsheet.
- **`six-handbook-regulatory-navigator-en.pdf` / `six-handbook-tax-navigator-en.pdf`** — SIX product handbooks (the "navigator" services).
- **`Confidential_SIX_master-data-openining-and-mutations-facsheet.pdf`** — internal master-data process (most sensitive; handle accordingly).
- **`*transcript.docx`** — SME interview transcripts (e.g. "Instrument Coverage Clarification"). These are the **tacit knowledge** to capture — short Q&A conversations where an expert reasons about whether an instrument (e.g. an ESG-linked structured note) is covered/classified. Treat these as ground-truth examples of the questions the "Company Brain" must answer.

The EMT (MiFID) and EET (ESG) `.xlsx` files are **FinDatEx industry templates** — column-per-attribute schemas, not free data. Use them to understand the canonical field set, not as populated datasets.

## Working with the corpus

No parsing tooling is installed yet. What's available on this machine:
- `pdftotext` **is available** (poppler) — use it to extract PDF text: `pdftotext -l <pages> "file.pdf" -`.
- `pypdf` / `PyPDF2` are **not installed**; `pip install` them only if you set up a Python env, otherwise prefer `pdftotext`.
- `.docx` / `.xlsx` are ZIP containers — extract `word/document.xml` (docx) or `xl/sharedStrings.xml` + `xl/worksheets/sheet*.xml` (xlsx), or add a library (`python-docx`, `openpyxl`) once a stack is chosen.

When you ingest these into a knowledge base / vector store, **preserve provenance** (source filename, page/sheet, and sensitivity label) on every chunk — traceability and access control are explicit grading criteria, not optional.

## Conventions for new code

There are none yet — you are establishing them. When you scaffold the app, update this file with the real build / run / test / lint commands and the architecture once they exist.
