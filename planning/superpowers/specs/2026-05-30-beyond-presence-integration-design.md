# Beyond Presence Digital Avatar Integration — Design Spec

> **Status:** Proposed design (2026-05-30). Scope: **Workstream 4** — Real-time Corporate Digital Human Avatar ("AIFTAR") integration. Adds high-fidelity low-latency audio/video streams, WebRTC connections, and a dual-stream synchronization protocol to the Next.js frontend and FastAPI backend.

---

## 1. Goal & Architecture

The objective is to replace the text-only chat input with a real-time **Digital Human Advisor Avatar** (representing a SIX Regulatory & Reference Data Specialist). The system must preserve the entire agentic tool-use cycle (Claude searching and reasoning over the Neo4j graph) and ensure that as the avatar speaks, the interactive 2D graph canvas and source citations update in lockstep.

### The Synchronization Challenge
Beyond Presence streams audio/video to the browser via LiveKit (WebRTC). The brain reasoning loop (Claude running tools) runs on our local FastAPI server, triggered by Beyond Presence's voice-transcription calls to `/v1/chat/completions`. 

To synchronize the visual graph state with the spoken audio/video without extra round-trips, we establish a **Dual-Stream Sync Protocol**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            NEXT.JS WEB DASHBOARD                            │
│  ┌─────────────────────────────┐           ┌─────────────────────────────┐  │
│  │   LiveKit WebRTC Player     │           │   Reactive Graph Canvas     │  │
│  │  (Displays Spoken Avatar)   │           │ (Pulses Nodes & Citations)  │  │
│  └──────────────┬──────────────┘           └──────────────▲──────────────┘  │
└─────────────────┼─────────────────────────────────────────┼─────────────────┘
                  │                                         │
               WebRTC                                  SSE Stream
             (AV Stream)                        /api/calls/{id}/events
                  │                                         │
┌─────────────────▲──────────────┐           ┌──────────────┴──────────────┐
│  BEYOND PRESENCE CLOUD PLATFORM│           │     LOCAL FASTAPI SERVER    │
│                                │           │                             │
│  Captures Voice, Transcribes,  │           │ Runs Claude Agent Loop,     │
│  and relays text prompt to:    │           │ executes Neo4j tools, and   │
│                                │           │ broadcasts graph deltas to  │
│  POST /v1/chat/completions ────┼──────────►│ the frontend event stream.  │
└────────────────────────────────┘           └─────────────────────────────┘
```

1. **The WebRTC Stream:** The Next.js frontend requests a call session from FastAPI, receives LiveKit credentials, and mounts the video player to display the avatar.
2. **The Event SSE Stream:** The frontend opens a parallel event stream connection to `/api/calls/{call_id}/events`.
3. **The Voice Completions Stream:** The user speaks. Beyond Presence transcribes the audio and hits the local server's `/v1/chat/completions` endpoint.
4. **Broadcast Sync:**
   * As Claude runs tools (Neo4j semantic searches, neighborhood expansions), the server serializes the `tool_call`, `tool_result` (with `graph_delta`), and `citation` events and broadcasts them to the active `/api/calls/{call_id}/events` channel.
   * As Claude generates final tokens, the server streams them to Beyond Presence as standard completions chunks (`choices[0].delta.content`) to feed the avatar's real-time lip-synced voice synthesis.

---

## 2. API Endpoints (FastAPI `api/`)

To support the avatar, we will expand `api/main.py` with these key endpoints:

### A. Beyond Presence Completions (`POST /v1/chat/completions`)
* Matches the standard OpenAI Chat Completions signature.
* Resolves the active call session context.
* Runs the agentic loop (`api/agent.py`) using the user's selected maximum sensitivity level.
* Streams standard chunks back to Beyond Presence, while pushing graph deltas to the frontend SSE pool.

### B. Session Token Starter (`POST /api/calls`)
* Body: `{ agent_id: str, max_sensitivity: str }`
* Requests a call connection from Beyond Presence (`POST https://api.bey.dev/v1/calls`).
* Registers the active session locally and returns:
  ```json
  {
    "success": true,
    "call_id": "call-uuid",
    "livekit_url": "wss://sfu.bey.dev",
    "livekit_token": "token-string",
    "max_sensitivity": "C2 Internal"
  }
  ```

### C. Frontend Broadcast Stream (`GET /api/calls/{call_id}/events`)
* Standard Server-Sent Events (`text/event-stream`).
* Fans out the internal agent events (`tool_call`, `tool_result`, `citation`) to the browser so the graph reacts in real time to the voice conversation.

---

## 3. Beyond Presence Registration & Setup

We will include a dynamic provisioning router `/api/register-agent`:
1. **Create External API Config:**
   * Hits `POST https://api.bey.dev/v1/external-apis` to register the local completions endpoint (using your ngrok/localtunnel public URL): `https://xxxx.ngrok-free.app/v1`.
2. **Create Conversational Agent:**
   * Hits `POST https://api.bey.dev/v1/agents`.
   * Configures the model mapping using the created External API ID.
   * Sets the custom greeting: *"Hello, I am the SIX Corporate Advisor, backed by the Company Brain. I am ready to answer regulatory and product coverage questions."*

---

## 4. Frontend WebRTC Integration (Next.js `web/`)

We will introduce a React component `components/AvatarStage.tsx` and a connection hook `lib/useLiveKit.ts`:
* **Media Track Bindings:** Attaches incoming video/audio tracks from the Beyond Presence LiveKit SFU.
* **Camera Viewport:** Mounts a local camera preview so the user sees themselves alongside the digital human.
* **Sync Listener:** Binds to the parallel `/api/calls/{call_id}/events` endpoint, pushing incoming graph deltas and citations directly into the active `chatReducer` state.
* **Clearance Control:** Ties a dropdown selector to the call starter, passing the user's active clearance level (`C2 Internal` or `Confidential`) into the Call Metadata on startup.

---

## 5. Security & Access Control

* **Query Gating:** The completions engine reads the clearance level bound to the `call_id` session, ensuring the agentic search tools *never* query or retrieve documents exceeding the caller's access tier.
* **Anonymization Backstop:** Strips real names from all transcripts at the ingestion layer, ensuring the digital human only refers to experts by their roles (e.g. *"A Compliance Officer reasoned that..."*).
