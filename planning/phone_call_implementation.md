**Product:** Company Brain — *Capturing Expert Knowledge in Context*
**Context:** START Hack Zurich 2026 · SIX Group Case — Chehra Implementation
**Built On:** PRD_v3 foundation (`hackathon-ideation-kg-chehra-implementation/`)
**Date:** 2026-05-30

---

## Table of Contents
1. [Role Alignment](#1-role-alignment)
2. [Dual-Mode Avatar Architecture](#2-dual-mode-avatar-architecture)
3. [Complete App Architecture](#3-complete-app-architecture)
4. [Feature Requirements](#4-feature-requirements)
5. [Build Plan](#5-build-plan)
6. [File Manifest](#6-file-manifest)
7. [Audio Routing Decision Matrix](#7-audio-routing-decision-matrix)
8. [90-Second Stage Demo Script](#8-90-second-stage-demo-script)
9. [Risk Assessment](#9-risk-assessment)
10. [Success Criteria](#10-success-criteria)

---

## 1. Role Alignment

| Role | Real-World Identity | App Interaction | On-Stage Demo |
|---|---|---|---|
| **Expert** | Jacob Gertel (Compliance SME) | Sits at the laptop, using Company Brain. He is the **app user**. | Presenter #1 at the demo laptop. |
| **Client** | Bank compliance officer with urgent query | Calls the expert on a real phone. **Zero interaction** with the app. | Presenter #2 dials from a physical phone. |
| **Company Brain** | Passive copilot | Listens to the call, transcribes live, queries Neo4j KG, displays citations in chat window. Detects expert override. | Displayed on main projector screen. |
| **Avatar** | Jacob's evolving digital persona — two modes | Mode A: Passive observer during calls. Mode B: Interactive AI advisor for standalone consultation. | LEFT panel — state reflects current mode. |

---

## 2. Dual-Mode Avatar Architecture

### Mode A: Passive Persona (During Phone Call)
- **Trigger:** Expert clicks "Start Listening"
- **Behavior:** BP iframe displays Jacob's persona in read-only observational state. Shows call state (IDLE → RINGING → ACTIVE → ENDED) via CSS ring pulses.
- **Visual:** Green pulsing ring during active call. Insight counter ticks up. "Observing..." badge.
- **Narrative:** *"The Brain is learning from Jacob in real-time."*

### Mode B: Interactive AI Advisor (Standalone)
- **Trigger:** Expert clicks "Talk to Video Advisor" when no call is active
- **Behavior:** Full BP WebRTC/iframe — AI avatar converses with expert using RAG-backed KG. Already built in `AvatarStage.tsx`.
- **Narrative:** *"Once enough insights are captured, the avatar becomes the automated persona."*

### Switching Logic
```typescript
if (activeCall) return <PassivePersona callState={callState} insightCount={count} />
else if (showAdvisor) return <AvatarStage url={livekitUrl} token={token} ... />
else return <IdlePersona onAdvisor={() => setShowAdvisor(true)} onListen={() => startCapture()} />
```

---

## 3. Complete App Architecture

### 3.1 Three-Panel Workspace

```
┌──────────────────────┬──────────────────────────────────────┬──────────────────────────┐
│   LEFT — Avatar       │   CENTER — Live Copilot              │   RIGHT — Curation        │
│                       │                                      │                           │
│  [Passive Persona]   │  📞 CALL ACTIVE                      │  Knowledge Graph          │
│  State: LISTEN        │  [Client]: "Are ESG-structured       │  Stats: 847 nodes         │
│  Insights: 1          │   notes covered?"                    │  412 edges                │
│                       │  ┌────────────────────────┐         │                           │
│  [Start Listening]   │  │ ⚠️ [2023] MiFID II     │         │  Validation Queue          │
│  [Talk to Advisor]   │  │ Guidance (Outdated)     │         │  ┌─────────────────────┐  │
│                       │  │ ✓ FATCA Reference      │         │  │ ⚡ Override Detected │  │
│                       │  │ ✓ SFDR Article 8       │         │  │ [Capture Insight]    │  │
│                       │  └────────────────────────┘         │  └─────────────────────┘  │
│                       │  [Expert]: "Per 2025 update,        │                           │
│                       │   these are now complex..."          │  [Graph] [Curation]       │
│                       └──────────────────────────────────────┘  [Reasoning]              │
└──────────────────────┴──────────────────────────────────────┴──────────────────────────┘
```

### 3.2 Data Flow

```
📱 Client Phone → 📱 Expert Phone → Laptop (WhatsApp Web tab)
    ↓
Browser getDisplayMedia(audio:true) captures call audio
    ↓
MediaRecorder chunks every 2.5s → POST /transcribe → Groq Whisper STT
    ↓
Text → POST /chat → Claude Agent + Tool Use → Neo4j KG
    ↓
SSE events → Next.js Frontend → Citations + Transcript + Override Detection
    ↓
POST /calls/{id}/finalize → Override Engine → ValidationCards
    ↓
POST /insights/capture → Neo4j Persona Write-Back
```

---

## 4. Feature Requirements

### 4.1 PRD_v3 Core (Already Built — Maintain)

| ID | Requirement | Priority | Status in chehra-implementation |
|---|---|---|---|
| **FR-API-1** | FastAPI `POST /chat` SSE streaming with Claude + tools | P0 | ✅ `api/main.py`, `api/agent.py`, `api/tools.py` |
| **FR-API-2** | `search_knowledge`, `expand_graph`, `lookup_backbone` tools | P0 | ✅ `api/tools.py` |
| **FR-LC-3** | CitationChip with sensitivity badges + outdated year detection | P0 | ✅ `CitationChip.tsx` — `isOutdated()` |
| **FR-CU-1** | Document upload → Neo4j ingestion | P1 | ✅ `POST /ingest` |
| **FR-CU-2** | Validation Queue with amber override cards | P1 | ✅ `ValidationCard.tsx` |
| **FR-BC-1** | Animated Neo4j graph via Canvas | P0 | ✅ `GraphCanvas.tsx`, `GET /api/graph` |
| **FR-BC-2** | Causal elimination tree (mocked) | P1 | ✅ `CausalTree.tsx` |
| **FR-GV-1** | Sensitivity labels + `max_sensitivity` | P0 | ✅ Built |
| **FR-GV-4** | Anonymization at ingestion | P0 | ✅ `anonymize.py` |

### 4.2 New: Phone Call + Passive Copilot + Dual Avatar

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **FR-PH-1** | Audio Capture — `getDisplayMedia` (WhatsApp Web tab) or `getUserMedia` (mic). Chunked → `POST /transcribe` → Groq Whisper | P0 | ❌ Not built |
| **FR-PH-2** | Call State Machine — IDLE → RINGING → ACTIVE → ENDED. Avatar ring pulses. | P0 | ❌ Not built |
| **FR-PH-3** | Passive Transcription Feed — Client bubbles (left, "📞") trigger RAG. Expert bubbles (right, "🧠") annotated only. | P0 | ❌ Not built |
| **FR-PH-4** | Expert Override Detection — LLM compares expert text vs citations. `citation_overridden` SSE event. Red strike-through on chip. | P0 | ❌ Not built |
| **FR-PH-5** | Post-Call Agentic Capture — Claude generates Insight from each override → ValidationCard in Curation panel | P0 | ❌ Not built |
| **FR-PH-6** | Insight → Neo4j Write-Back — `:Insight` node via `OVERRIDES` → `:Document` and `CONTRIBUTED` → `:Persona` | P1 | ❌ Not built |
| **FR-PH-7** | Expert Persona Graph — `:Persona` node for Jacob. Avatar shows insight count, last capture. | P1 | ❌ Not built |
| **FR-AV-DUAL** | Dual-Mode Avatar — Passive Persona + Interactive Advisor. Clean transition. | P1 | ⚠️ Only Mode B exists |
| **FR-PH-8** | Push-to-Talk Bypass — Chat input replaced with "📞 Call Active" banner during calls | P2 | ❌ Not built |

---

## 5. Build Plan

### Phase 0: Foundation Audit (~30 min)
1. **Verify backend** — `docker compose up`, confirm `/health`, `/chat`, `/api/graph`, `/stats`
2. **Verify frontend** — `npm run dev`, confirm chat + citations + graph + tree
3. **Dry-run existing demo-script.md**
4. **Verify BP integration** — `POST /api/register-agent`, AI advisor live call

### Phase 1: Phone Call Audio Interception (~1.5 hrs)

**1.1 Audio Capture Hook** — `web/hooks/usePhoneCallCapture.ts`
```typescript
export function usePhoneCallCapture() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [callState, setCallState] = useState<"idle"|"ringing"|"active"|"ended">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startCapture = async () => {
    setCallState("ringing");
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, audio: true  // WhatsApp Web tab
    });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = async (e) => {
      if (e.data.size > 0) {
        setCallState("active");
        const fd = new FormData();
        fd.append('audio', e.data);
        const resp = await fetch(`${API}/transcribe`, { method: 'POST', body: fd });
        const { text } = await resp.json();
        // Push as Client message → triggers RAG
      }
    };
    recorder.start(2500);
    mediaRecorderRef.current = recorder;
    setIsCapturing(true);
  };

  const stopCapture = async () => {
    mediaRecorderRef.current?.stop();
    setIsCapturing(false);
    setCallState("ended");
    await fetch(`${API}/calls/hackathon-call-id/finalize`, { method: 'POST' });
    setTimeout(() => setCallState("idle"), 3000);
  };

  return { isCapturing, callState, startCapture, stopCapture };
}
```

**1.2 Backend Endpoint** — `api/routes_phone.py`
```python
from fastapi import APIRouter, UploadFile, File
from groq import Groq

router = APIRouter()
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

@router.post("/transcribe")
async def transcribe_chunk(audio: UploadFile = File(...)):
    content = await audio.read()
    transcription = groq_client.audio.transcriptions.create(
        file=("chunk.webm", content),
        model="whisper-large-v3",
        response_format="text",
    )
    return {"text": transcription}
```

**1.3 Transcript Feed** — Client messages trigger automatic `search_knowledge`. Expert messages (after silence gap) annotated but don't trigger retrieval.

**1.4 Call State** — Avatar ring pulses: RINGING (amber) → ACTIVE (green) → ENDED (fade).

### Phase 2: Expert Override Detection (~2 hrs)

**2.1 Override Engine** — `src/company_brain/override.py`
```python
def detect_overrides(expert_transcript, citations, llm_client):
    """Compare expert response vs each citation via Claude."""
    results = []
    for c in citations:
        prompt = f"""Expert said: "{expert_transcript}"
Document says: "{c['chunk_text']}"
Does the expert contradict the document?
Respond JSON: {{"conflicts": true/false, "expert_position": "...", "explanation": "..."}}"""
        response = llm_client.complete(prompt)
        # Parse and collect overrides
    return results
```

**2.2 Endpoint** — `POST /calls/{id}/detect-override` runs the engine and emits `citation_overridden` SSE events.

**2.3 Frontend** — `CitationChip.tsx` gets `overridden` prop → red border, "⚠️ Expert Override" badge, strikethrough.

**2.4 Post-Call** — `POST /calls/{id}/finalize` generates Insights from overrides via Claude, pushes as ValidationCards.

### Phase 3: Neo4j Persona Write-Back (~1.5 hrs)

**3.1 Schema**
```cypher
CREATE (:Persona {name: "Jacob Gertel", role: "Compliance SME", insight_count: 0, created_at: datetime()})
(:Persona)-[:CONTRIBUTED]->(:Insight)
(:Insight)-[:OVERRIDES]->(:Document)
```

**3.2 Graph Methods** — Add to `src/company_brain/graph.py`:
- `upsert_persona(store, name, role)`
- `create_insight(store, text, persona_name, doc_title)`
- `get_persona_stats(store, name)`

**3.3 Endpoints** — `POST /insights/capture`, `GET /persona/{name}`

**3.4 Frontend** — `ValidationCard.tsx` captures via `POST /insights/capture`. Optimistic UI with toast + avatar update.

### Phase 4: Dual-Mode Avatar (~1 hr)

**4.1 PassivePersona component** — `web/components/PassivePersona.tsx`
- Shows call state via CSS ring pulses
- Displays insight counter
- "Start/Stop Listening" buttons

**4.2 AvatarPanel router** — Wraps PassivePersona + existing AvatarStage. Context-switches based on mode.

### Phase 5: Demo Script (~1 hr)

See Section 8 for full script.

---

## 6. File Manifest

### New Files
| File | Purpose | Priority |
|---|---|---|
| `api/routes_phone.py` | Transcribe, override, finalize, insight capture endpoints | P0 |
| `src/company_brain/override.py` | LLM-based contradiction analysis engine | P0 |
| `web/hooks/usePhoneCallCapture.ts` | Audio capture via getDisplayMedia → Whisper | P0 |
| `web/hooks/useCallState.ts` | Call state machine | P0 |
| `web/components/PassivePersona.tsx` | Mode A avatar — passive persona display | P0 |
| `web/components/AvatarPanel.tsx` | Dual-mode router | P1 |
| `web/components/CallBanner.tsx` | "Call Active" banner | P2 |
| `web/components/TranscriptBubble.tsx` | Client vs Expert bubble styles | P1 |
| `web/data/mock-call-transcript.json` | Mock data for fail-safe | P1 |

### Existing Files to Modify
| File | Change | Priority |
|---|---|---|
| `web/app/page.tsx` | Add phone capture, call state, "Start Listening" | P0 |
| `web/components/CitationChip.tsx` | Add `overridden` prop → red strike-through + badge | P0 |
| `web/components/ValidationCard.tsx` | Wire to real `POST /insights/capture` | P0 |
| `web/components/AvatarStage.tsx` | Rename to InteractiveAvatar, extract into dual-mode router | P1 |
| `api/main.py` | Include routes_phone router | P0 |
| `api/events.py` | Add citation_overridden, insight_proposed, insight_captured events | P0 |
| `src/company_brain/graph.py` | Add upsert_persona, create_insight, get_persona_stats | P1 |
| `web/lib/chatReducer.ts` | Handle new phone call SSE event types | P0 |
| `web/lib/useChat.ts` | Add startCapture alongside existing startCall | P1 |
| `demo-script.md` | Rewrite with correct role alignment | P0 |

---

## 7. Audio Routing Decision Matrix

| Option | Setup | Reliability | Wow Factor |
|---|---|---|---|
| **A: WhatsApp Web Tab** | Open web.whatsapp.com, getDisplayMedia({audio:true}) on that tab | High — digital audio, no cables | **High** — audience sees WhatsApp Web as "proof" |
| **B: Virtual Audio Cable** | VB-Cable + aux from phone to laptop Line-In | High — clean audio | Medium — invisible |
| **C: Speakerphone** | Laptop mic picks up phone speakerphone | Low-Medium — room noise | Medium |

**Recommendation:** Option A (WhatsApp Web) for hackathon demo.

---

## 8. 90-Second Stage Demo Script

| Time | Action | Screen Shows | Narrator Says |
|---|---|---|---|
| **0:00** | Open app. Avatar shows IDLE with two buttons. | 3-panel workspace. Neo4j graph. Curation empty. | *"Company Brain captures expert knowledge by watching how experts solve real problems."* |
| **0:05** | Click **"Start Listening"**. | Avatar: RINGING (amber pulse). Chat: "Waiting for call..." | *"A client calls with an urgent question. The Brain listens silently."* |
| **0:10** | Presenter #2 (Client): *"Are ESG-linked structured notes covered under your compliance package?"* | Chat shows: **📞 Client:** *"Are ESG-linked structured notes covered..."* | *"The call is transcribed live. The Brain retrieves relevant documents."* |
| **0:20** | Brain retrieves citations. | Chips appear: [⚠️ **2023**] MiFID II (red strikethrough) + FATCA + SFDR Art 8. | *"Three citations found. But this one's from 2023 — flagged as potentially outdated."* |
| **0:25** | Expert speaks: *"Per the 2025 update, these are now complex instruments."* | Expert bubble appears. 2023 chip turns red: "⚠️ Expert Override". Curation badge: 1. | *"Jacob overrides the outdated doc with current knowledge. The Brain detects the contradiction."* |
| **0:35** | Call ends. Click **"Stop Listening"**. | Avatar: ENDED → "Processing...". | *"After the call, the Brain processes what it learned."* |
| **0:40** | Agentic Capture | Curation panel shows amber pulsing card: override description. | *"It proposes a new insight from Jacob's override."* |
| **0:45** | Click **"✓ Capture Insight"** | Card animates out. Toast: "Insight captured". Graph: +1 node. Avatar: 1 insight. | *"One click — Jacob's expertise enters the knowledge graph."* |
| **0:55** | Switch to Reasoning tab. | Causal tree animates — MiFID II highlighted, FATCA + SFDR Art 9 eliminated. | *"The reasoning trace shows how the Brain eliminated irrelevant regulations."* |
| **1:05** | Switch to Graph tab. | Neo4j shows Insight node linked to Persona (Jacob). | *"Next time a junior analyst gets this call, the Brain already knows."* |
| **1:15** | Click **"Talk to Advisor"** (Mode B). | Avatar switches to interactive mode. Ask: "What classification applies?" Avatar answers citing the insight. | *"And anyone can talk to the AI advisor — powered by Jacob's captured expertise."* |
| **1:25** | Close. | Avatar shows "1 insight". Graph updated. | *"Company Brain: capturing expertise at SIX."* |

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| WhatsApp Web audio capture fails | Medium | High | Pre-recorded MP3 played via hidden `<audio>` element; or use mock JSON |
| Whisper latency >2s | Medium | Medium | Pre-cached mock transcript displayed with typing animation |
| Override LLM hallucinates | Low | Medium | Binary prompt; hardcoded mock path for the specific 2023 scenario |
| Neo4j write-back fails | Low | High | Optimistic UI; queue writes for retry |
| Presenter #2 forgets lines | Medium | Medium | Teleprompter on their phone or pre-recorded audio clip |
| BP avatar fails to load | Low | Medium | Mode A doesn't need BP (static SVG persona); Mode B falls back to text chat |

---

## 10. Success Criteria

| Metric | Target |
|---|---|
| Live transcription accuracy | ≥90% |
| Citation retrieval latency | <3s from transcribed segment to citation display |
| Outdated doc detection | 2023 citation shows strikethrough + red year badge automatically |
| Override detection | Flags contradiction within 5s of expert's statement |
| Post-call insight generation | ValidationCard appears within 3s of "Stop Listening" |
| Insight capture write-back | Node count increments within 1s of "✓ Capture" |
| Dual-mode switching | Seamless transition between Passive + Interactive modes |
| Demo flow time | 90 seconds |
| Mock resilience | Works with pre-cached data if any live API fails |
