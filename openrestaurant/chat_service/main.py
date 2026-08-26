"""FastAPI chatbot microservice for the OpenAgent demo.

Owns the agent loop: takes a guest message, calls Claude with the MCP tools
exposed as function-calling tools, executes any tool calls against the MCP
server, and feeds results back until Claude produces a final reply. Returns
both the reply and a trace of tool calls so the frontend can visualize what
the agent did (useful for teaching, and for debugging in production too).
"""
import uuid
from contextlib import asynccontextmanager
from datetime import date
from typing import Optional

from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langfuse import get_client, propagate_attributes
from pydantic import BaseModel

from mcp_client import MCPToolClient

load_dotenv()  # picks up chat_service/.env if present (ANTHROPIC_API_KEY=sk-..., LANGFUSE_*)

MODEL = "claude-sonnet-5"

mcp_client = MCPToolClient()
anthropic_client = AsyncAnthropic()  # reads ANTHROPIC_API_KEY from env
langfuse = get_client()  # reads LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL from env


def _safe(obj):
    """Best-effort JSON-safe conversion for logging Anthropic SDK objects to Langfuse."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if isinstance(obj, list):
        return [_safe(o) for o in obj]
    if isinstance(obj, dict):
        return {k: _safe(v) for k, v in obj.items()}
    return obj

# session_id -> Anthropic-format message history. In-memory only, fine for a demo.
sessions: dict[str, list[dict]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mcp_client.start()
    yield
    await mcp_client.stop()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = f"""You are the OpenAgent Concierge, a friendly reservations assistant \
embedded on the OpenAgent website. Today's date is {date.today().isoformat()}.

You help guests find restaurants, check table availability, and book reservations \
using the tools available to you. Guidelines:

- Use search_restaurants and get_availability freely to answer questions -- they are \
read-only and safe to call as often as you need.
- Before calling create_booking, always restate the restaurant name, date, time, and \
party size back to the guest and get their explicit confirmation (e.g. "yes", \
"confirm", "book it"). Never create a booking the guest hasn't explicitly confirmed.
- If a requested time has no availability, offer the nearest open times instead of \
just saying no.
- Keep responses short and conversational, like a helpful host -- not a wall of text.
- Convert whatever the guest says into tool arguments: dates as YYYY-MM-DD, times as \
24h HH:MM (e.g. "tonight at 7" -> today's date, "19:00").
"""


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/chat")
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())
    history = sessions.setdefault(session_id, [])
    history.append({"role": "user", "content": req.message})

    tools = await mcp_client.list_tools_for_claude()
    tool_trace = []

    # Every turn in a session is its own Langfuse trace, but all traces sharing
    # `session_id` show up grouped as one session in the Langfuse UI -- so the
    # whole multi-turn conversation (one browser page load, see README) can be
    # viewed as a single unit, not fragmented per HTTP request.
    with langfuse.start_as_current_observation(
        name="chat_turn", as_type="span", input=req.message
    ) as turn_span, propagate_attributes(session_id=session_id):
        while True:
            with langfuse.start_as_current_observation(
                name="claude-messages-create",
                as_type="generation",
                input=_safe(history),
                model=MODEL,
            ) as generation:
                response = await anthropic_client.messages.create(
                    model=MODEL,
                    max_tokens=1024,
                    system=SYSTEM_PROMPT,
                    tools=tools,
                    messages=history,
                )
                generation.update(
                    output=_safe(response.content),
                    usage_details={
                        "input": response.usage.input_tokens,
                        "output": response.usage.output_tokens,
                    },
                )

            history.append({"role": "assistant", "content": response.content})

            if response.stop_reason != "tool_use":
                reply_text = "".join(
                    block.text for block in response.content if block.type == "text"
                )
                turn_span.update(output=reply_text)
                trace_url = langfuse.get_trace_url()
                langfuse.flush()  # demo-friendly: make the trace visible immediately
                return {
                    "session_id": session_id,
                    "reply": reply_text,
                    "tool_calls": tool_trace,
                    "trace_url": trace_url,
                }

            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                with langfuse.start_as_current_observation(
                    name=block.name, as_type="tool", input=block.input
                ) as tool_span:
                    result_text = await mcp_client.call_tool(block.name, block.input)
                    tool_span.update(output=result_text)
                tool_trace.append({"tool": block.name, "input": block.input, "result": result_text})
                tool_results.append(
                    {"type": "tool_result", "tool_use_id": block.id, "content": result_text}
                )

            history.append({"role": "user", "content": tool_results})


@app.post("/reset")
async def reset(req: ChatRequest):
    if req.session_id:
        sessions.pop(req.session_id, None)
    return {"status": "reset"}
