# Beyond Presence Integration & Installation Guide

This document details the installation, configuration, provisioning, and synchronization of the **Beyond Presence Digital Human Avatar** ("AIFTAR") with the **SIX Company Brain GraphRAG** knowledge engine.

---

## 📋 1. Prerequisites & Credentials

To enable the interactive video advisor, you must obtain API credentials from the Beyond Presence developer portal and define them in your environment.

### A. Environment Variables
Add the following keys to your `.env` file in the root directory:

```env
# Beyond Presence Developer Credentials
Bey=sk-9tqwTLK-YBFOfCHHNxgnaO_qez0jb7n5yEp_jhcNevE
avatarID=694c83e2-8895-4a98-bd16-56332ca3f449
```

> [!NOTE]
> * `Bey` is your Beyond Presence developer API Key (also supported as `BEY_API_KEY`).
> * `avatarID` is the unique identifier of the target digital human (also supported as `AVATAR_ID`).

### B. Public Tunnel Endpoint
Beyond Presence operates as a cloud-based service and must make incoming webhook requests to your local brain. You must establish a public tunnel to expose your local FastAPI server (defaulting to port `8000`).

We recommend using **localtunnel**:
```bash
npx localtunnel --port 8000
```
This will print a public URL, for example:
`your url is: https://thick-rabbits-swim.loca.lt`

---

## ⚙️ 2. Backend Setup & Routes

The backend is built with **FastAPI** (`api/main.py`). The installation maps several key endpoints:

### A. Required Dependencies
Ensure the following packages are present in your Python environment:
```toml
# pyproject.toml / requirements.txt
fastapi = "^0.110.0"
uvicorn = "^0.28.0"
httpx = "^0.27.0"
sse-starlette = "^2.0.0"
pydantic = "^2.6.0"
```

### B. Core Integration Endpoints
1. **`POST /api/register-agent`**: Provisions the agent dynamically. It calls the Beyond Presence cloud API to register your public tunnel as an external LLM endpoint, and creates the conversational agent mapped to your target avatar.
2. **`GET /api/agent/status`**: Allows the Next.js frontend to verify whether the agent is successfully provisioned and retrieve the registered Beyond Presence `agentId`.
3. **`POST /api/calls/clearance`**: Synchronizes the user's active clearance tier (Public, C2 Internal, Confidential) directly with the backend session boundary.
4. **`GET /api/calls/{call_id}/events`**: A Server-Sent Events (SSE) stream allowing the frontend to subscribe in real time to Claude's internal GraphRAG reasoning steps (`tool_call`, `tool_result`, `citation`).
5. **`POST /v1/chat/completions`**: The main completions endpoint hit by the Beyond Presence platform.

---

## 💻 3. Frontend Setup & Hooks

The Next.js frontend (`web/`) hosts the interactive stage and establishes the dual-stream sync protocol.

### A. Component Installation (`web/components/AvatarStage.tsx`)
Create the interactive avatar viewport component. For Free Tier installations, we use high-performance iframe embedding to load the web widget securely with hardware access:

```tsx
<iframe
  src={`https://bey.chat/${agentId}`}
  allow="camera; microphone"
  className="w-full h-full border-none rounded-2xl min-h-[350px]"
  title="Beyond Presence Digital Advisor"
/>
```

### B. Sync Integration Hook (`web/lib/useChat.ts`)
The hook connects the parallel real-time GraphRAG updater on page mount:
```typescript
useEffect(() => {
  // Initialize persistent parallel EventSource stream to capture dynamic GraphRAG deltas
  const es = new EventSource(`${API}/api/calls/hackathon-call-id/events`);
  
  es.onmessage = (event) => {
    const ev = JSON.parse(event.data);
    setState((s) => reduce(s, ev)); // Triggers dynamic traversal flashes and citations
  };
  
  return () => es.close();
}, []);
```

---

## 🚀 4. Step-by-Step Provisioning & Launch

Follow these steps to spin up and register the avatar layer:

### Step 1: Start the Backend & Tunnel
Launch the FastAPI uvicorn reloader and localtunnel:
```bash
# Terminal 1: Run FastAPI
uvicorn api.main:app --port 8000 --reload

# Terminal 2: Run public tunnel
npx localtunnel --port 8000
```

### Step 2: Register the Public Tunnel
1. Copy the public tunnel URL (e.g., `https://thick-rabbits-swim.loca.lt`).
2. Open the web browser to `http://localhost:3000`.
3. An **Advisor Connection Required** card will display. Paste your localtunnel URL and click **Register**.
4. The backend will configure the webhook endpoints on Beyond Presence and save the agent credentials to an absolute-path local cache (`api/.bp_agent_cache.json`).

### Step 3: Run the Voice Session
Once registered, the card will light up with a green pulsing badge: **Digital Human Advisor Ready**. 
1. Click **Talk to Video Advisor**.
2. Select your security clearance level in the header dropdown.
3. Speak your regulatory queries to the advisor!

---

## 🛠️ 5. Key Architecture Features

### A. Alternating Anthropic Preprocessor
Beyond Presence relays messages in standard OpenAI formats, often including `"system"` roles inside the list, or back-to-back identical roles. Anthropic Claude strictly forbids `"system"` roles inside the message list and demands strict alternating `"user"` and `"assistant"` turn boundaries. 

We integrated a preprocessing engine that dynamically:
* Strips all `"system"` messages and appends them to the primary prompt template (preserving full GraphRAG schema and rule injection).
* Combines consecutive adjacent identical roles into a single spacing-separated block.
* Truncates leading assistant messages to ensure the list begins with `"user"`.

### B. Dual Completions Mode (Streaming & Non-Streaming)
Beyond Presence will hit the completions endpoint requesting both streaming (`stream: true`) and non-streaming (`stream: false`) completions. 

The installation natively supports both:
* **Streaming**: Progressively streams word tokens to Beyond Presence for real-time lip-synced audio synthesis, while concurrently fanning out RAG events to the Next.js SSE client.
* **Non-Streaming**: Blocks until Claude completes the RAG cycle, publishes all reasoning events to the Next.js SSE queue, and then yields a single standard JSON completions response block back to Beyond Presence.

---

## 🧪 6. Testing & Validation

Run the Pytest suite to verify that the preprocessor, completions routers, and access controls are fully operational:
```bash
pytest tests/api/test_chat_endpoint.py
```
This validates that:
1. System messages are correctly preprocessed and extracted.
2. Consecutive message duplicates are safely combined.
3. Non-streaming responses return standard OpenAI JSON formats.
4. Streaming responses pipe text event streams perfectly.
