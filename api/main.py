from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from api.agent import make_client, run_agent
from api.deps import get_embedder_cached, get_store
from api.events import ErrorEvent
from api.prompt import SYSTEM_PROMPT
from api.tools import run_tool
from company_brain.config import get_settings

app = FastAPI(title="Company Brain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


class ChatRequest(BaseModel):
    messages: list[dict]
    max_sensitivity: str = "C2 Internal"


@app.post("/chat")
async def chat(req: ChatRequest):
    settings = get_settings()

    async def event_source():
        try:
            client = make_client(settings.anthropic_api_key)
            agen = run_agent(
                req.messages,
                client=client,
                run_tool=run_tool,
                store=get_store(),
                embedder=get_embedder_cached(),
                max_sensitivity=req.max_sensitivity,
                model=settings.extraction_model,
                system=SYSTEM_PROMPT,
            )
            async for event in agen:
                yield {"data": event.model_dump_json()}
        except Exception as exc:  # surface errors to the client as an error event
            yield {"data": ErrorEvent(message=str(exc)).model_dump_json()}

    return EventSourceResponse(event_source())
