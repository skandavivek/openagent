# openagent

AI agent course repo. One Codespace, four case studies:

```
openagent/
├── .devcontainer/          # single Codespace config for the whole repo
├── pyproject.toml          # combined Python dependencies (uv-managed)
├── openrestaurant/         # restaurant-booking agent: FastAPI + real MCP server + SQLite + evals
├── open-deep-research/     # deep-research agent tutorials (exact copy of langchain-ai/deep_research_from_scratch for now — will be adapted into agent + observability case studies, e.g. LangSmith vs. Langfuse, week by week)
├── rag-from-scratch/       # RAG optimization (Ch3 of RAG-From-Scratch): basic vs. markdown parsing vs. re-ranking vs. hybrid search, with LLM-judge + DeepEval evals; only needs OPENAI_API_KEY
└── opencode-harness/       # agent harness engineering: 12 topics on opencode's real stack (Bun/TypeScript/Effect/Drizzle/AI SDK) — system prompt, tools, message history, the loop, permissions, compaction, sub-agents, persistence, WebSocket streaming, MCP client, observability
```

Each folder has its own README with the details of that project. This
top-level README only covers what's shared: the Codespace and the combined
dependency setup.

> [!IMPORTANT]
> **Using the Codespace? Everything is already installed. Do NOT run any install commands.**
>
> When the Codespace is created it automatically installs everything all four
> projects need: Python 3.11, `uv`, every Python package (including Jupyter) in
> one shared `.venv` at the repo root, Node.js/`npx`, Bun, and `ripgrep`.
> Wait for the "postCreateCommand" setup to finish on first launch (a few minutes),
> then you're ready.
>
> **Skip** every `uv sync`, `pip install`, `brew install`, `npm install`,
> `bun install`, `git clone` or "Prerequisites" step you see in this repo,
> including the ones in the sub-project READMEs. Those are only for running
> **locally, outside the Codespace**.
>
> All you need to do is:
> 1. Add your API keys to the `.env` at the repo root (see [below](#one-env-shared-by-all-projects)).
> 2. When you open a notebook, pick the **`.venv` (Python 3.11)** kernel from the repo root.

## Codespace / local setup

There is **one** combined dependency environment for the whole repo,
installed by `.devcontainer/devcontainer.json`'s `postCreateCommand` (see
`.devcontainer/post-create.sh`) — two toolchains, one Codespace:

- **Python** (`openrestaurant/`, `open-deep-research/`, `rag-from-scratch/`): root `pyproject.toml`, `uv sync` into one shared `.venv`.
- **Bun/TypeScript** (`opencode-harness/`): its own `package.json`, `bun install`, plus `ripgrep` (needed by its real `grep`/`glob` tools).

```bash
# LOCAL ONLY. The Codespace already ran this for you on creation; don't re-run it there.
bash .devcontainer/post-create.sh
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

## One `.env`, shared by all projects

A single `.env` at this repo's root covers `openrestaurant/`,
`open-deep-research/`, `rag-from-scratch/` and `opencode-harness/`, not separate per-project files:

```bash
cat > .env << 'EOF'
# openrestaurant/, opencode-harness/
ANTHROPIC_API_KEY=sk-ant-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# open-deep-research/ (OPENAI also covers rag-from-scratch/)
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
LANGSMITH_API_KEY=lsv2_...   # optional, for the eval cells
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
