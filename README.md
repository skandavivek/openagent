# openagent

AI agent course repo. One Codespace, three case studies:

```
openagent/
├── .devcontainer/          # single Codespace config for the whole repo
├── pyproject.toml          # combined Python dependencies (uv-managed)
├── openrestaurant/         # restaurant-booking agent: FastAPI + real MCP server + SQLite + evals
├── open-deep-research/     # deep-research agent tutorials (exact copy of langchain-ai/deep_research_from_scratch for now — will be adapted into agent + observability case studies, e.g. LangSmith vs. Langfuse, week by week)
└── opencode-harness/       # agent harness engineering: 12 topics on opencode's real stack (Bun/TypeScript/Effect/Drizzle/AI SDK) — system prompt, tools, message history, the loop, permissions, compaction, sub-agents, persistence, WebSocket streaming, MCP client, observability
```

Each folder has its own README with the details of that project. This
top-level README only covers what's shared: the Codespace and the combined
dependency setup.

## Codespace / local setup

There is **one** combined dependency environment for the whole repo,
installed by `.devcontainer/devcontainer.json`'s `postCreateCommand` (see
`.devcontainer/post-create.sh`) — two toolchains, one Codespace:

- **Python** (`openrestaurant/`, `open-deep-research/`): root `pyproject.toml`, `uv sync` into one shared `.venv`.
- **Bun/TypeScript** (`opencode-harness/`): its own `package.json`, `bun install`, plus `ripgrep` (needed by its real `grep`/`glob` tools).

```bash
bash .devcontainer/post-create.sh   # what the Codespace runs automatically on creation
```

The script also auto-switches off `master` onto a throwaway `codespace/...`
branch if that's what got checked out — `opencode-harness`'s topics give a
real model real `edit`/`write`/`shell` access, so nothing in this repo
should be exercised directly on `master`.

From there, follow [`openrestaurant/README.md`](openrestaurant/README.md),
[`open-deep-research/README.md`](open-deep-research/README.md), or
[`opencode-harness/README.md`](opencode-harness/README.md) for how to run
each project.

Note: `open-deep-research/pyproject.toml` and `uv.lock` are kept as-is (an
exact copy of the source repo) for reference; the Codespace itself only
uses the root `pyproject.toml`, so there's a single set of installed Python
dependencies, not two.

## One `.env`, shared by all three

A single `.env` at this repo's root covers `openrestaurant/`,
`open-deep-research/`, and `opencode-harness/` — not three separate files:

```bash
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
EOF
```

This works because `openrestaurant/chat_service/main.py` and
`open-deep-research/app.py` both call Python's `load_dotenv()` with no
path, which walks *upward* from the calling file looking for a `.env` and
stops at the first one it finds — since neither subfolder has its own
`.env` anymore, both land on this root one. `open-deep-research/langgraph.json`
points `"env"` at `"../.env"` for the same reason. `opencode-harness/`'s
`package.json` scripts (`bun run 01`, etc.) explicitly pass
`--env-file=../.env`, since Bun's own `.env` auto-loading only checks the
current working directory, not parent directories.

## Codespace port visibility (needed for `openrestaurant`'s UI)

`openrestaurant`'s chat widget runs a `fetch()` from the static site (port
5500) to the backend API (port 8000) — two different origins once both are
forwarded by Codespaces. Forwarded ports default to **Private**, and a
background `fetch()` to a different **Private** port's forwarded URL can
fail ("Failed to fetch") even though the backend is healthy and directly
visiting that URL in a new tab works fine — GitHub's private-port auth
proxy behaves differently for a full page navigation than for a
cross-origin `fetch()`.

Fix: in the **Ports** tab (same panel as **Terminal**, bottom of VS Code —
open it via `Ctrl/Cmd+Shift+P` → "Ports: Focus on Ports View" if it's not
already showing), right-click the row for port **8000** → **Port
Visibility** → **Public**. No restart needed — just try the chat again.
