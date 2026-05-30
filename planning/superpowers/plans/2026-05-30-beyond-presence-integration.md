# Beyond Presence Digital Avatar Integration — Implementation Plan

This plan guides you task-by-task to integrate the **Beyond Presence Digital Human Avatar** as a real-time voice and video interface for the **SIX Company Brain** GraphRAG project.

---

## Part A: FastAPI Backend Additions

### Task 1: Scaffolding Session State and Event Pools
We need a thread-safe, active call registry to map call IDs, user clearance levels, and active SSE broadcast streams.

- [ ] **Step 1: Create a call session registry**
  In `api/deps.py`, add a global in-memory session registry and an active SSE queue manager:
  ```python
  import asyncio
  from dataclasses import dataclass, field

  @dataclass
  class ActiveCall:
      call_id: str
      max_sensitivity: str
      event_queue: asyncio.Queue = field(default_factory=asyncio.Queue)

  ACTIVE_CALLS: dict[str, ActiveCall] = {}
  ```

---

### Task 2: Implementing the Frontend Event Broadcast Stream
Create the SSE endpoint that Next.js will connect to for real-time graph updates during the voice call.

- [ ] **Step 2: Add `/api/calls/{call_id}/events` route in `api/main.py`**
  ```python
  from fastapi import Path
  from sse_starlette.sse import EventSourceResponse
  from api.deps import ACTIVE_CALLS

  @app.get("/api/calls/{call_id}/events")
  async def call_events(call_id: str = Path(...)):
      active = ACTIVE_CALLS.get(call_id)
      if not active:
          return {"error": "Active call session not found"}, 404

      async def event_source():
          while True:
              event = await active.event_queue.get()
              yield {"data": event.model_dump_json()}
              active.event_queue.task_done()

      return EventSourceResponse(event_source())
  ```

---

### Task 3: Call Provisioning Router
Implement the token starter that connects with Beyond Presence's Cloud APIs.

- [ ] **Step 3: Add `POST /api/calls` in `api/main.py`**
  * Reads `BEY_API_KEY` and `AVATAR_ID` from env.
  * Connects with `POST https://api.bey.dev/v1/calls` to obtain LiveKit SFU credentials.
  * Registers the generated session in `ACTIVE_CALLS` with the user's selected `max_sensitivity`.
  * Returns the credential payload to the frontend.

---

### Task 4: Dual-Stream Completions Agent Loop
Integrate the Claude agent loop into the standard completions pipeline.

- [ ] **Step 4: Add `POST /v1/chat/completions` in `api/main.py`**
  * Receives voice transcription requests from Beyond Presence.
  * Extracts the caller ID or active session from headers/tags.
  * Invokes `run_agent()`.
  * **Completions Stream (Beyond Presence):** Yields standard OpenAI-compatible chunks for Claude's final spoken answers.
  * **Event Broadcast (Next.js):** Pushes intermediary `tool_call`, `tool_result`, and `citation` events into the matching `ACTIVE_CALLS[call_id].event_queue` for real-time UI updates.

---

## Part B: Next.js Frontend Integrations

### Task 5: Sensitivity Clearance Dropdown
Add the governance filter in the UI header.

- [ ] **Step 5: Create a clearance selector component**
  In `components/ClearanceSelector.tsx`, render a clean selector allowing toggles between `Public`, `C2 Internal`, and `Confidential`. Bind the selection to the active context.

---

### Task 6: LiveKit Avatar Video Stage
Create the WebRTC viewport.

- [ ] **Step 6: Integrate `LiveKit.Room` client**
  * Create `components/AvatarStage.tsx` which mounts the WebRTC player.
  * Connects using the `livekit-client` library.
  * Hooks into `TrackSubscribed` events to dynamically attach `audio` and `video` HTML nodes.
  * Renders a local webcam feed container in a premium floating panel.

---

### Task 7: Dual-Stream Broadcaster Sync
Connect the frontend reactive canvas to the backend event pool.

- [ ] **Step 7: Connect the SSE event listener**
  In `lib/useChat.ts` or a new hook `lib/useAvatarSync.ts`:
  * Open an `EventSource` pointing to `http://localhost:8000/api/calls/{call_id}/events`.
  * Pipe incoming SSE events directly into the `chatReducer` dispatcher.
  * Verify that as the avatar speaks, the 2D force-directed graph canvas pulses and citations render seamlessly.
