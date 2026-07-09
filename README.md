# OpenAgent Demo

A self-contained mockup for the "AI Agents for Enterprise" lightning session:
a customer-facing chatbot that searches restaurants and books tables through
real MCP tools, backed by a mock "Elasticsearch" (SQLite) restaurant index.

```
Browser (web/index.html)
   │  fetch POST /chat
   ▼
FastAPI chatbot microservice (chat_service/)
   │  Claude tool-use loop (Anthropic Messages API)
   │  MCP client, stdio transport
   ▼
MCP server (mcp_server/server.py)
   │  READ tools:  search_restaurants, get_availability
   │  WRITE tools: create_booking, cancel_booking
   ▼
SQLite "restaurant index" (data/restaurant_booking.db)
```

The read/write tool split is deliberate, not cosmetic: read tools are safe
for the agent to call as often as it wants while reasoning; write tools are
where the system prompt requires the agent to restate details and get
explicit user confirmation before calling. That's the hook back into the
full course's "making agents reliable in production" theme — this repo is
the free lightning-lesson teaser for it.

## The agent harness

"Harness" is the code *around* the model call — everything that turns a
single LLM request into an agent that can act. Claude by itself just maps
one input to one output; it doesn't call tools, check results, or decide to
try again on its own. The harness is what closes that loop. Strip the
harness away and you have a plain chatbot: one message in, one reply out,
no ability to actually go look anything up or do anything. Add the harness
and the same model can search a database, notice it needs more information,
and act on it — that's the entire difference between "chatbot" and "agent"
in this repo (see the "chatbot vs. agent" discussion earlier in this
project's history: the UI is a chatbot, `chat_service/main.py` is what makes
what's behind it an agent).

Concretely, the harness here is the `while True` loop in `chat_service/main.py`'s
`/chat` handler:

1. **Append the guest's message** to that session's conversation history.
2. **Call Claude** with the full history plus the tool schemas fetched from
   the MCP server (`anthropic_client.messages.create(..., tools=tools, messages=history)`).
3. **Check `response.stop_reason`.** If it isn't `"tool_use"`, Claude gave a
   final text answer — return it to the guest and the loop ends.
4. **If it is `"tool_use"`**, Claude's response contains one or more
   `tool_use` blocks (a tool name + arguments it wants to call). The harness
   doesn't ask permission for read tools — it just calls
   `mcp_client.call_tool(block.name, block.input)` for each one, over the
   real MCP protocol, and gets a result back.
5. **Append the tool result(s)** to the conversation as a `tool_result`
   message, then **go back to step 2** — Claude sees the result and decides
   what to do next: call another tool, or now answer.

That loop is the whole harness. Everything else in the repo — the MCP tool
definitions, the read/write split, the "confirm before booking" rule in the
system prompt — are inputs *to* the harness (tool schemas, a system prompt)
or invariants the harness's tool-calling step should respect, not separate
mechanisms. It's also the one place in the codebase where every model
decision and every tool call passes through, which is exactly why it's the
natural place to bolt on the production-reliability concerns the harness
here deliberately leaves out: confirmation gates on writes are done today
(in the prompt), but idempotency keys, retries, timeouts, rate limits, and
audit logging would all wrap this same loop rather than living anywhere else.

![Diagram of the agent harness loop: guest message goes to Claude, which either returns a final reply or requests a tool call; tool calls execute against the MCP server/SQLite and their results are appended back into the conversation before asking Claude again](docs/agent-harness.svg)

## MCP tools & data

The harness diagram treats "call the MCP tool" as one box; this one zooms
into what's on the other side of that call — the four tools
`mcp_server/server.py` actually exposes, and which tables in the mock
"Elasticsearch" index (`data/restaurant_booking.db`) each one touches.

The READ/WRITE split isn't just a naming convention — it's the thing the
harness's confirmation rule hangs off of. `search_restaurants` and
`get_availability` only ever run a `SELECT`, so the harness lets Claude call
them as many times as it wants while it's still figuring out what the guest
needs. `create_booking` and `cancel_booking` mutate state, so those are the
ones the system prompt requires an explicit guest confirmation for before
the harness will call them at all.

Notice the two write tools each touch **two** tables in a single call, not
one — `create_booking` both inserts a new `bookings` row *and* deducts the
seats it used from `availability`; `cancel_booking` both marks the
`bookings` row cancelled *and* releases those seats back. That pairing has
to happen together or the data goes inconsistent (a cancelled booking that
never frees its seats, or a "confirmed" booking that double-books a table)
— it's a small, concrete example of why write tools need more care than
read tools in production, not just a confirmation step.

![Diagram of MCP tools and the data they touch: an MCP client calls into the MCP server's four tools (search_restaurants and get_availability as read-only, create_booking and cancel_booking as writes); read tools query the restaurants and availability tables, while each write tool both touches the bookings table and adjusts the availability table's seat count](docs/mcp-tools-data.svg)

## What's real vs. mocked

- **Real**: Claude tool-use loop, actual MCP protocol (official `mcp` SDK,
  stdio transport), FastAPI microservice boundary, HTML/JS frontend.
- **Mocked**: SQLite stands in for Elasticsearch/a booking DB — swap
  `mcp_server/server.py`'s `_connect()`/SQL for real ES + Postgres calls
  without changing the tool interface or anything upstream of it. Session
  history is in-memory (fine for a demo, not for prod).

## Setup

```bash
uv venv --python 3.11 .venv
uv pip install --python .venv mcp anthropic fastapi "uvicorn[standard]" python-dotenv
uv pip install --python .venv -r evals/requirements.txt   # only needed to run evals/
.venv/bin/python data/seed_db.py        # (re)build the mock restaurant DB
export ANTHROPIC_API_KEY=sk-...
```

## Run (3 terminals)

```bash
# 1. Chatbot microservice (this also spawns the MCP server as a subprocess)
cd chat_service && ../.venv/bin/uvicorn main:app --port 8000 --reload

# 2. Static website
cd web && python3 -m http.server 5500

# 3. Open the site
open http://localhost:5500
```

Click the 💬 button bottom-right to open the concierge chat.

To sanity-check the MCP server in isolation (no LLM involved):

```bash
.venv/bin/python mcp_server/server.py   # should hang waiting on stdio — Ctrl+C to exit
```

## Suggested 30-minute demo flow

1. **(5 min) Frame the problem** — OpenAgent wants a chatbot so customers can
   search and book without clicking through filters. Show the architecture
   diagram above: UI → agent → tools → data. This is the shape of basically
   every enterprise agent.
2. **(10 min) Live demo** — Open the site, ask things like:
   - "Find me a good Italian place in the West Village" → watch the
     `search_restaurants` tool chip appear.
   - "What times are open there tonight for 2 people?" → `get_availability`.
   - "Book it for 7pm" → the agent restates the details and asks you to
     confirm *before* calling `create_booking` — point this out explicitly.
   - Try over-booking a slot (party of 8 into a 2-top) to show the write
     tool rejecting it gracefully instead of the agent hallucinating success.
3. **(10 min) Open the hood** — walk through `mcp_server/server.py` tool
   definitions, then `chat_service/main.py`'s loop (call Claude → tool_use? →
   call MCP tool → feed result back → repeat). Emphasize the read/write
   boundary and where you'd add auth, rate limiting, idempotency keys, and
   audit logging for production.
4. **(5 min) Tie to the course** — this demo took shortcuts (SQLite instead
   of ES, no auth, in-memory sessions) that the full course covers: context
   engineering (RAG/MCP/memory), and production reliability (deployment,
   evals, monitoring). The `evals/` suite (see below) is a small taste of
   the eval-driven-dev piece.

## Evals

`evals/` is a small eval-driven-dev harness: 25 hand-written cases (search,
availability, booking, booking edge cases, safety/robustness) checked two
independent ways — a deterministic check of the exact MCP tool calls the
agent should/shouldn't have made, and an LLM-as-judge check of whether the
actual conversation satisfies a plain-English criterion. A case only passes
if both agree. See `evals/cases.csv` for the full ground truth.

**Prerequisite:** the chat_service must already be running (see Run, step 1
above) — the harness drives it over real HTTP, the same path the frontend
uses.

```bash
# run the whole suite (resets the DB to its pristine seeded state before
# every single case, so cases are independent regardless of order)
.venv/bin/python evals/run_evals.py

# run just one case while iterating
.venv/bin/python evals/run_evals.py --case-id booking-001
```

This prints a pass/fail line per case and writes `evals/results.csv`, which
has the ground truth and the actual outcome side by side per row (expected
tool calls/conversation criterion vs. actual tool trace/reply/judge
reasoning) so failures are easy to inspect without digging through logs.

Note: this reruns the agent (and the judge) live against the API for every
case, so it costs real API calls and takes a few minutes for all 25 —
don't run it more than you need to while iterating; use `--case-id` to
target just the case you're working on.

## Repo layout

```
docs/agent-harness.svg   # diagram of the tool-use loop, embedded above
docs/mcp-tools-data.svg  # diagram of the 4 MCP tools + tables they touch
data/seed_db.py        # builds the mock restaurant index + seed data
mcp_server/server.py   # MCP server: search/read + booking/write tools
chat_service/main.py   # FastAPI + Claude tool-use loop + MCP client
chat_service/mcp_client.py
web/index.html         # OpenAgent-style landing page
web/style.css
web/chat.js            # chat widget wired to POST /chat
web/images/            # real food photos, one per restaurant (see note below)
evals/cases.csv         # 25 eval cases: inputs + two-part ground truth
evals/matcher.py        # deterministic tool-call-sequence checker
evals/judge.py          # LLM-as-judge for the conversation criterion
evals/run_evals.py      # harness: resets DB, drives chat_service, writes results.csv
evals/results.csv       # latest run's output (generated, not hand-edited)
```

Restaurant photos in `web/images/` are freely-licensed (public domain / CC) photos
pulled from Wikimedia Commons via its search API, not stock photos of any real
restaurant chain -- picked one at a time and screened to avoid any competitor
branding visible in-shot (one steak photo was rejected for exactly this reason).
