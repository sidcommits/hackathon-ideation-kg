# Source Provenance Tree — Design

**Date:** 2026-05-30
**Status:** Approved (design), pending implementation plan
**Scope:** Frontend-only (`web/`). No backend or graph changes.

## Goal

Replace the flat "Sources" list in the Sources & Relations slide-in panel with a
**VS Code–style nested tree** that shows each cited document inside its
organisational origin chain (e.g. `SharePoint → Compliance Dept → ABC.pdf`).
Clicking a document reveals its **path-to-root as a horizontal breadcrumb** and
expands its passages. Different documents can have different roots (SharePoint,
GitHub, Confluence, …).

This is the "Option C" decision: the provenance tree **replaces** the current flat
document grouping in the Sources tab. The Relations tab is unchanged.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Where does the tree live? | **C** — replaces the existing flat Sources tab content. |
| How is the hierarchy defined? | **A** — manual mapping config (`provenance.json`), frontend-read. Can migrate to Neo4j later. |
| How is path-to-root shown on click? | **A** — horizontal breadcrumb strip pinned above the tree. |
| Tree scope | **A** — per-answer (only the sources this answer cited), same as today. |

## 1. Data: `provenance.json`

A manually-maintained config (location: `web/lib/provenance.json`) mapping a
document title to its origin chain, **root-first**:

```json
{
  "EU_ESG_Template_20260410- EET V1.1.3_Editorial update (1).xlsx": {
    "chain": ["SharePoint", "Compliance Dept"]
  },
  "US_FATCA.pdf": { "chain": ["GitHub", "Tax Engineering"] },
  "__default__": { "chain": ["SharePoint", "Unfiled"] }
}
```

- `chain` is ordered **root → … → immediate parent**; the document is the leaf.
- `__default__` is the fallback for any cited doc not explicitly listed, so no
  document ever renders without a root.
- Keyed by exact `doc_title` (the value already on each `Citation`).

## 2. Tree construction

Pure helper `buildSourceTree(citations, provenanceMap)` in `web/lib/sourceTree.ts`.

- Input: this answer's citations (grouped by `doc_title`, each with its passages +
  sensitivity), plus the provenance map.
- For each document, resolve its `chain` (or `__default__`) and merge all documents
  into one nested tree keyed by chain segment. Documents sharing a chain prefix
  (e.g. both under `SharePoint → Compliance Dept`) collapse under the same shared
  parent nodes.
- Each node carries an inferred `kind` driving icon + colour:
  - `root` — first chain segment (SharePoint / GitHub / Confluence / …): provenance-purple.
  - `group` — intermediate chain segments (departments): folder glyph.
  - `document` — leaf document: file glyph, sensitivity pill, passage-count badge.
  - `passage` — a document's retrieved chunk text (revealed on document click).
- Output: recursive `TreeNode { kind, label, children, meta }` where `meta` holds
  sensitivity, passageCount, and (for documents) the full root→leaf path used by the
  breadcrumb.

This replaces the current `SourcesTree` grouping logic in `SourcesPanel.tsx`.

## 3. UI: Sources tab

Inside the existing slide-in panel (`SourcesPanel.tsx`), the **Sources** tab becomes:

**(a) Breadcrumb strip** — pinned at the top of the tab.
- Empty placeholder until a document is clicked.
- On document click, shows the chain horizontally, coloured by node type:
  `🗄 SharePoint › 📁 Compliance Dept › 📄 EET V1.1.3.xlsx`.

**(b) Nested tree** — below the strip.
- Indented rows with chevrons (▾/▸) on expandable nodes (root, group, document).
- Icons + existing palette/theme vars. Sensitivity pill + passage-count badge on
  document rows (preserving current info).
- **Click a document** → (1) highlight/select the row, (2) populate the breadcrumb
  with its path-to-root, (3) expand to reveal its passages as leaf children (same
  passage text/truncation as today).
- **Click a root/group** → expand/collapse only.
- Reuses the existing collapse-state pattern and `Chevron` component.

The **Relations tab is unchanged**. Everything remains per-answer and frontend-only.

## Components / files touched

- `web/lib/provenance.json` *(new)* — the manual mapping.
- `web/lib/sourceTree.ts` *(new)* — `buildSourceTree` + `TreeNode` type.
- `web/components/SourcesPanel.tsx` — replace `SourcesTree` with the breadcrumb +
  nested-tree renderer; add `selectedDocPath` state for the breadcrumb.
- No changes to `chatReducer.ts`, backend, or the Relations tab.

## Out of scope (future)

- Persisting provenance in Neo4j (`SourceRoot`/`SourceGroup` nodes). Migration path:
  `buildSourceTree` swaps its source from `provenance.json` to an API response with
  no UI change.
- Full-corpus "file explorer" (this is per-answer only).
- Source ↔ relation linking (separate Phase-2 backend change).

## Testing

- Unit-test `buildSourceTree`: shared-prefix merging, `__default__` fallback,
  passage attachment, path-to-root metadata. (Vitest, no network.)
- Manual: ask a question, open Sources tab, click a document → breadcrumb +
  passages appear; verify two docs with different roots render under separate roots.
