from fastapi import FastAPI, Path, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import httpx
import uuid
import time
import json
import os

from api.agent import make_client, run_agent
import api.deps as deps
from api.deps import get_embedder_cached, get_store
from api.events import ErrorEvent
from api.prompt import SYSTEM_PROMPT
from api.tools import run_tool
from company_brain.config import get_settings

app = FastAPI(title="Company Brain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BEY_API_KEY = os.getenv("Bey") or os.getenv("BEY_API_KEY")
AVATAR_ID = os.getenv("avatarID") or os.getenv("AVATAR_ID")

# Dynamic agent cache for registration fallbacks with persistent local file backup
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(BASE_DIR, ".bp_agent_cache.json")
ACTIVE_BP_AGENT_ID = None
ACTIVE_BP_EXTERNAL_API_ID = None


def load_agent_cache():
    global ACTIVE_BP_AGENT_ID, ACTIVE_BP_EXTERNAL_API_ID
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                cache = json.load(f)
                ACTIVE_BP_AGENT_ID = cache.get("agent_id")
                ACTIVE_BP_EXTERNAL_API_ID = cache.get("external_api_id")
                print(f"Loaded Beyond Presence Agent ID from cache: {ACTIVE_BP_AGENT_ID}")
        except Exception as e:
            print(f"Error loading agent cache: {e}")


def save_agent_cache(agent_id, external_api_id):
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump({"agent_id": agent_id, "external_api_id": external_api_id}, f)
            print(f"Saved Beyond Presence Agent ID to cache: {agent_id}")
    except Exception as e:
        print(f"Error saving agent cache: {e}")


# Auto-load on server startup
load_agent_cache()

# Register a global static session for free-tier iframe event fanning
deps.ACTIVE_CALLS["hackathon-call-id"] = deps.ActiveCall(
    call_id="hackathon-call-id",
    max_sensitivity="C2 Internal"
)
deps.CURRENT_ACTIVE_CALL_ID = "hackathon-call-id"


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


class ClearanceRequest(BaseModel):
    clearance: str


@app.post("/api/calls/clearance")
async def update_clearance(req: ClearanceRequest):
    active = deps.ACTIVE_CALLS.get("hackathon-call-id")
    if active:
        active.max_sensitivity = req.clearance
    return {"success": True, "clearance": req.clearance}


def preprocess_messages(messages: list[dict], system_prompt: str) -> tuple[list[dict], str]:
    processed_messages = []
    custom_system_parts = [system_prompt]
    
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content") or ""
        
        if role == "system":
            if content:
                custom_system_parts.append(content)
            continue
            
        if role not in {"user", "assistant"}:
            role = "user"
            
        processed_messages.append({"role": role, "content": content})
        
    # Combine consecutive roles
    alternating = []
    for msg in processed_messages:
        if not msg["content"]:
            continue
        if alternating and alternating[-1]["role"] == msg["role"]:
            alternating[-1]["content"] += "\n\n" + msg["content"]
        else:
            alternating.append(msg)
            
    # Ensure starts with "user"
    while alternating and alternating[0]["role"] != "user":
        alternating.pop(0)
        
    # If empty after filtering, add a placeholder user message
    if not alternating:
        alternating.append({"role": "user", "content": "Hello"})
        
    final_system = "\n\n".join(custom_system_parts)
    return alternating, final_system


class ChatRequest(BaseModel):
    messages: list[dict]
    max_sensitivity: str = "C2 Internal"


@app.post("/chat")
async def chat(req: ChatRequest):
    settings = get_settings()

    # Preprocess messages to be fully Anthropic-compliant
    messages_payload, system_prompt = preprocess_messages(req.messages, SYSTEM_PROMPT)

    async def event_source():
        try:
            client = make_client(settings.anthropic_api_key)
            agen = run_agent(
                messages_payload,
                client=client,
                run_tool=run_tool,
                store=get_store(),
                embedder=get_embedder_cached(),
                max_sensitivity=req.max_sensitivity,
                model=settings.extraction_model,
                system=system_prompt,
            )
            async for event in agen:
                yield {"data": event.model_dump_json()}
        except Exception as exc:  # surface errors to the client as an error event
            yield {"data": ErrorEvent(message=str(exc)).model_dump_json()}

    return EventSourceResponse(event_source())


class RegisterAgentRequest(BaseModel):
    publicUrl: str


@app.post("/api/register-agent")
async def register_agent(req: RegisterAgentRequest):
    global ACTIVE_BP_AGENT_ID, ACTIVE_BP_EXTERNAL_API_ID

    if not BEY_API_KEY or not AVATAR_ID:
        raise HTTPException(
            status_code=500,
            detail="Bey (API key) and avatarID must be defined in the environment variables."
        )

    formatted_url = req.publicUrl.rstrip('/')
    headers = {
        "x-api-key": BEY_API_KEY,
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient() as client:
            # 1. Create External API Configuration on Beyond Presence
            api_resp = await client.post(
                "https://api.bey.dev/v1/external-apis",
                headers=headers,
                json={
                    "type": "openai_compatible_llm",
                    "name": "SIX-Brain-Endpoint",
                    "url": f"{formatted_url}/v1",
                    "api_key": "secure-dummy-token"
                }
            )

            if api_resp.status_code != 201:
                raise HTTPException(
                    status_code=api_resp.status_code,
                    detail=f"Failed to register external API: {api_resp.text}"
                )

            api_config = api_resp.json()
            ACTIVE_BP_EXTERNAL_API_ID = api_config["id"]

            # 2. Create Conversational Agent on Beyond Presence
            agent_resp = await client.post(
                "https://api.bey.dev/v1/agents",
                headers=headers,
                json={
                    "name": "SIX Corporate Advisor",
                    "avatar_id": AVATAR_ID,
                    "system_prompt": "You are an expert SIX Financial Corporate Advisor. Always give accurate, structured regulatory advice.",
                    "language": "en-US",
                    "greeting": "Hello, I am the SIX Corporate Advisor, backed by the Company Brain. I am ready to answer regulatory and product coverage questions.",
                    "llm": {
                        "type": "openai_compatible",
                        "api_id": ACTIVE_BP_EXTERNAL_API_ID,
                        "model": "company-brain-llm",
                        "temperature": 0.3
                    }
                }
            )

            if agent_resp.status_code != 201:
                raise HTTPException(
                    status_code=agent_resp.status_code,
                    detail=f"Failed to create agent: {agent_resp.text}"
                )

            agent_config = agent_resp.json()
            ACTIVE_BP_AGENT_ID = agent_config["id"]

            # Persist dynamic agent credentials to local disk cache
            save_agent_cache(ACTIVE_BP_AGENT_ID, ACTIVE_BP_EXTERNAL_API_ID)

            return {
                "success": True,
                "externalApiId": ACTIVE_BP_EXTERNAL_API_ID,
                "agentId": ACTIVE_BP_AGENT_ID,
                "iframeUrl": f"https://bey.chat/{ACTIVE_BP_AGENT_ID}"
            }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class StartCallRequest(BaseModel):
    max_sensitivity: str = "C2 Internal"
    customAgentId: str | None = None


@app.post("/api/calls")
async def start_call(req: StartCallRequest):
    target_agent_id = req.customAgentId or ACTIVE_BP_AGENT_ID

    if not target_agent_id:
        raise HTTPException(
            status_code=400,
            detail="No active Agent ID available. Please register a public tunnel URL first to auto-generate an agent."
        )

    if not BEY_API_KEY:
        raise HTTPException(status_code=500, detail="Beyond Presence API key is not loaded.")

    headers = {
        "x-api-key": BEY_API_KEY,
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient() as client:
            # Create LiveKit call session on Beyond Presence
            call_resp = await client.post(
                "https://api.bey.dev/v1/calls",
                headers=headers,
                json={
                    "agent_id": target_agent_id,
                    "livekit_username": "SIX User",
                    "tags": {
                        "integration": "company-brain-rag"
                    }
                }
            )

            if call_resp.status_code != 201:
                raise HTTPException(
                    status_code=call_resp.status_code,
                    detail=f"Beyond Presence Call API failed: {call_resp.text}"
                )

            call_details = call_resp.json()
            call_id = call_details["id"]

            # Register session locally for SSE broadcasting and clearance gating
            deps.ACTIVE_CALLS[call_id] = deps.ActiveCall(
                call_id=call_id,
                max_sensitivity=req.max_sensitivity
            )
            deps.CURRENT_ACTIVE_CALL_ID = call_id

            return {
                "success": True,
                "callId": call_id,
                "livekitUrl": call_details["livekit_url"],
                "livekitToken": call_details["livekit_token"],
                "agentId": target_agent_id
            }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/graph")
async def get_initial_graph(limit: int = 40):
    try:
        store = get_store()
        # Query Neo4j for a default subset of nodes and edges
        rows = store.run(
            """
            MATCH (s)-[r]->(t)
            WHERE (s:Regulation OR s:DataAttribute OR s:InstrumentType OR s:Obligation OR s:Concept)
              AND (t:Regulation OR t:DataAttribute OR t:InstrumentType OR t:Obligation OR t:Concept)
            RETURN {label: head(labels(s)), name: s.name} AS src,
                   type(r) AS rel,
                   {label: head(labels(t)), name: t.name} AS dst
            LIMIT $limit
            """,
            limit=limit
        )
        nodes = {}
        edges = []
        for r in rows:
            s, d = r["src"], r["dst"]
            if not s or not d or not s.get("name") or not d.get("name"):
                continue
            sid = f"{s['label']}:{s['name']}"
            did = f"{d['label']}:{d['name']}"
            nodes[sid] = {"id": sid, "label": s["label"], "name": s["name"]}
            nodes[did] = {"id": did, "label": d["label"], "name": d["name"]}
            edges.append({"from": sid, "to": did, "rel": r["rel"]})
        return {"nodes": list(nodes.values()), "edges": edges}
    except Exception as e:
        print(f"Failed to fetch initial graph from Neo4j: {e}")
        return {"nodes": [], "edges": []}


@app.get("/api/agent/status")
async def get_agent_status():
    return {
        "registered": ACTIVE_BP_AGENT_ID is not None,
        "agentId": ACTIVE_BP_AGENT_ID
    }


@app.get("/api/calls/{call_id}/events")
async def call_events(call_id: str = Path(...)):
    active = deps.ACTIVE_CALLS.get(call_id)
    if not active:
        raise HTTPException(status_code=404, detail="Active call session not found")

    async def event_source():
        while True:
            # Poll from the queue and stream events to the frontend in real time
            event = await active.event_queue.get()
            yield {"data": event.model_dump_json()}
            active.event_queue.task_done()

    return EventSourceResponse(event_source())


class BPMessage(BaseModel):
    role: str
    content: str | None = ""


class BPCompletionsRequest(BaseModel):
    messages: list[BPMessage]
    stream: bool = False
    model: str | None = None


@app.post("/v1/chat/completions")
async def chat_completions(req: BPCompletionsRequest):
    settings = get_settings()

    # Resolve active call and clearance level
    call_id = deps.CURRENT_ACTIVE_CALL_ID
    active_call = deps.ACTIVE_CALLS.get(call_id) if call_id else None
    max_sensitivity = active_call.max_sensitivity if active_call else "C2 Internal"

    # Map standard message shapes
    raw_messages = [{"role": m.role, "content": m.content or ""} for m in req.messages]

    # Preprocess messages to be fully Anthropic-compliant
    messages_payload, system_prompt = preprocess_messages(raw_messages, SYSTEM_PROMPT)

    # NOTE: We always force streaming for this endpoint regardless of req.stream.
    # Beyond Presence has a short LLM response timeout — if we respond non-streaming,
    # the full RAG pipeline takes 20-25 seconds and the avatar times out silently.
    # With streaming, BP receives the first token in ~2-3 seconds and starts
    # speaking immediately while the rest of the response streams in.
    _ = req.stream  # acknowledged but ignored — always stream

    # Streaming response: pipe tokens to Beyond Presence lip-sync
    async def event_source():
        try:
            client = make_client(settings.anthropic_api_key)
            agen = run_agent(
                messages_payload,
                client=client,
                run_tool=run_tool,
                store=get_store(),
                embedder=get_embedder_cached(),
                max_sensitivity=max_sensitivity,
                model=settings.extraction_model,
                system=system_prompt,
            )

            async for event in agen:
                # 1. Broadcaster: push internal graph-reasoning and citation events to frontend queue
                if event.type in {"tool_call", "tool_result", "citation"}:
                    if active_call:
                        active_call.event_queue.put_nowait(event)

                # 2. completions stream: pipe tokens back to Beyond Presence lip-sync
                elif event.type == "token":
                    chunk = {
                        "id": f"chatcmpl-{uuid.uuid4()}",
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": settings.extraction_model,
                        "choices": [{
                            "index": 0,
                            "delta": {
                                "content": event.text
                            },
                            "finish_reason": None
                        }]
                    }
                    yield f"data: {json.dumps(chunk)}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as exc:
            err_chunk = {
                "error": {
                    "message": str(exc),
                    "type": "server_error"
                }
            }
            yield f"data: {json.dumps(err_chunk)}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")

