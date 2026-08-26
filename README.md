# openagent

AI agent course repo — teaching material for "Build AI Agents for
Enterprises" and other courses. One Codespace, three case studies:

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
