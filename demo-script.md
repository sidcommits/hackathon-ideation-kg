# Company Brain — Demo Script (45 seconds)

## Setup
- Neo4j pre-loaded with SIX Data Attributes + Regulatory Update transcript + FATCA
- Beyond Presence avatar registered via localtunnel
- FastAPI running on :8000, Next.js on :3000

## Flow

| Time | Action | Screen | Narrator |
|---|---|---|---|
| 0:00 | Open app | 3-panel workspace. Avatar connects. Right panel: Knowledge Graph tab active with real Neo4j nodes. | _"Company Brain — expert knowledge for SIX."_ |
| 0:05 | Expert (Jacob) receives client call | Beyond Presence avatar appears live in left panel. Transcript streaming into chat below. | _"A client calls: 'Are ESG-linked structured notes covered under our compliance package?'"_ |
| 0:15 | Brain retrieves knowledge | Citation chips appear: [2023] MiFID II Guidance (amber, outdated) + FATCA PDF + SFDR Article 8. The 2023 one shows a red strikethrough and "2023" badge. Graph canvas highlights traversed nodes. | _"The Brain searches the knowledge graph and returns three authoritative citations — but one is from 2023."_ |
| 0:25 | Expert overrides outdated info | Switch to Curation tab → amber validation card: "AI matched 2023 guidance. Jacob overrode: classified as complex instrument per 2025 update." | _"Jacob notices the outdated document. He overrides based on current practice."_ |
| 0:35 | Capture override | Click "✓ Capture Insight" → toast notification: "Expert insight captured — Company Brain updated." Card scales out. | _"One click — Jacob's expertise is captured. The brain learns."_ |
| 0:40 | Reasoning trace | Switch to Reasoning tab → Causal elimination tree fades in, crossing out FATCA and SFDR branches. | _"The deductive reasoning trace shows what's been ruled out and why."_ |
| 0:45 | Close | Avatar returns to idle. Graph node count increments. | _"Company Brain: preserving expertise at SIX."_ |

## Key Technical Beats
- **Citation year badges**: When a doc is 2+ years old, `CitationChip` shows a red `2023` badge and strikethrough
- **Expert override**: `ValidationCard` with pulsing amber border, one card flagged "Expert Override Detected"
- **Insight capture toast**: Green notification animates in bottom-right for 3s
- **Causal tree**: Animated fade-in by depth, red strikethrough on eliminated branches
- **Hybrid retrieval**: Backend blends vector similarity + FastRP graph embeddings for relevance