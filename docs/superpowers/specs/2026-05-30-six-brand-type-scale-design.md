# SIX-Brand Accent + Type Scale — Design

**Date:** 2026-05-30
**Status:** Approved (design), pending implementation plan
**Scope:** Frontend-only (`web/`). No backend or graph node-palette changes.

## Goal

Two coordinated UI changes to make the Company Brain feel fully SIX-branded and
pitch-legible:

1. **SIX red replaces teal as the single accent** across the whole app.
2. **Type scale bump (~+18%, "Comfortable")** — raise the small-font floor from
   ~8.5px to ~11px and body from 15px to 17px, via centralized tokens.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| How does red enter? | **A** — SIX red fully replaces teal as the single accent. |
| Type scale | **B (Comfortable)** — ~+18%, floor ~11px, body 17px. |
| Graph node palette (green/blue/purple) | **Out of scope** — leave intact (encodes meaning, "graph later"). |
| Sensitivity colors (amber/rose) | **Leave intact** — they signal governance levels. |

## 1. SIX-red accent

All components already read `var(--accent…)`, so recolouring is centralized in
`web/app/globals.css`. Swap the accent vars in BOTH themes:

**Dark theme (`:root`):**
- `--accent: #EC0016` (SIX red; was `#38E0C8`)
- `--accent-dim: #B0000F` (deeper red, borders/hover; was `#1F8E7E`)
- `--accent-glow: rgba(236, 0, 22, 0.16)`

**Light theme (`:root[data-theme="light"]`):**
- `--accent: #D10014`
- `--accent-dim: #A8000F`
- `--accent-glow: rgba(209, 0, 20, 0.16)`

**Hardcoded teal literals to update** (do NOT rely on the var):
- `globals.css` `tool-ring` keyframe uses `rgba(56, 224, 200, 0.35)` / `…0)` →
  replace with the red glow equivalent (`rgba(236,0,22,0.35)` / `…0)`).
- Scan `globals.css` for any other `56, 224, 200` / `#38E0C8` literals and update.

**Left intact (out of scope):**
- Graph node palette `--node-backbone/-reasoning/-provenance` (green/blue/purple) — encodes the legend.
- Sensitivity `--sev-internal` (amber) / `--sev-conf` (rose).
- `GraphCanvas.tsx` directional-particle teal — graph is a later pass; leave as-is.

Net effect: buttons, focus rings, status pulse, stream caret, links, active
states, the tool-name highlight, the "Ready/Reasoning" pill → SIX red.

## 2. Type scale (+~18%, "Comfortable")

Add a centralized token scale to `globals.css` `:root` (theme-independent):

```css
--text-2xs: 11px;   /* was 8.5–9px — pills, count badges, tiny mono labels */
--text-xs:  12px;   /* was 10–10.5px — eyebrows, "Tool" label, legend */
--text-sm:  13.5px; /* was 11–12px — tool name, chips, tree rows, captions */
--text-base:15px;   /* secondary body */
--text-md:  17px;   /* was 15px — answer body + question bubbles */
--text-lg:  20px;   /* section headings in answers */
```

Replace the small hardcoded Tailwind sizes (`text-[8.5px]`, `text-[9px]`,
`text-[9.5px]`, `text-[10px]`, `text-[10.5px]`, `text-[11px]`, `text-[12px]`)
with `text-[length:var(--text-…)]` at the matching tier, in these hotspots:

- `app/page.tsx` — header eyebrow, status pill, clearance label, input helper text.
- `components/ToolCallCard.tsx` — `Tool` label, tool name, args, summary.
- `components/CitationChip.tsx` — doc title, sensitivity label.
- `components/GraphCanvas.tsx` — header label, node-count badge, legend text (DOM
  overlay text only; NOT the in-canvas node colours).
- `components/SourcesPanel.tsx` — tab labels, breadcrumb, tree rows, passage text,
  count badges, sensitivity dot label.
- `components/DummyConnectors.tsx` — "Connected Sources", "Preview", tool rows.
- `components/MessageBubble.tsx` — answer prose body → `--text-md` (17px); ease
  prose line-height slightly for readability.
- `components/ClearanceSelector.tsx` — option/label text if below the new floor.

Also nudge `--fg-3` (muted captions) one step brighter in BOTH themes so the
larger captions read with adequate contrast:
- Dark: `--fg-3: #646C78` → `#79818D`.
- Light: `--fg-3: #8A93A2` → `#6B7480`.

**Approach:** centralize the scale as tokens, then swap the worst small literals
to the tokens. Do NOT change layout/spacing beyond line-heights that a size bump
naturally requires. Keep the diff focused and reversible.

## Components / files touched

- `web/app/globals.css` — accent vars (both themes), tool-ring keyframe, type-scale
  tokens, `--fg-3` nudge.
- `web/app/page.tsx`, `web/components/{ToolCallCard,CitationChip,GraphCanvas,
  SourcesPanel,DummyConnectors,MessageBubble,ClearanceSelector}.tsx` — size tokens.
- No backend, no graph node-colour, no sensitivity-colour changes.

## Testing

- `npx tsc --noEmit` clean; `npx vitest run` green (no logic changed); `npm run build` succeeds.
- Manual: load app dark + light, confirm accents are SIX red everywhere interactive,
  graph nodes still green/blue/purple, sensitivity pills still amber/rose, and the
  small labels are visibly larger/legible. Check the answer body and tree rows.

## Out of scope (future)

- Graph node-colour rebranding (explicitly deferred).
- Layout/spacing redesign, new components, the "guided demo flow" idea.
