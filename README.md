# openagent

AI agent course repo — teaching material for "Build AI Agents for
Enterprises" and other courses. One Codespace, two case studies:

```
openagent/
├── .devcontainer/          # single Codespace config for the whole repo
├── pyproject.toml          # combined dependencies for both folders below (uv-managed)
├── openrestaurant/         # restaurant-booking agent: FastAPI + real MCP server + SQLite + evals
└── open-deep-research/     # deep-research agent tutorials (exact copy of langchain-ai/deep_research_from_scratch for now — will be adapted into agent + observability case studies, e.g. LangSmith vs. Langfuse, week by week)
```

Each folder has its own README with the details of that project. This
top-level README only covers what's shared: the Codespace and the Python
environment.

## Codespace / local setup

There is **one** dependency environment for the whole repo, defined in the
root `pyproject.toml` and installed by `.devcontainer/devcontainer.json`'s
`postCreateCommand`. Opening this repo in a Codespace (or running the
command below locally) installs everything needed to run both
`openrestaurant/` and `open-deep-research/` — no per-folder setup required.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # if uv isn't already installed
uv sync                                            # installs deps for the whole repo into ./.venv
.venv/bin/python openrestaurant/data/seed_db.py    # seeds the mock restaurant DB
```

From there, follow [`openrestaurant/README.md`](openrestaurant/README.md) or
[`open-deep-research/README.md`](open-deep-research/README.md) for how to
run each project — their run commands assume `.venv` at this repo root.

Note: `open-deep-research/pyproject.toml` and `uv.lock` are kept as-is (an
exact copy of the source repo) for reference; the Codespace itself only
uses the root `pyproject.toml` above, so there's a single set of installed
dependencies, not two.
