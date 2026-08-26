# opencode-harness

Agent harness engineering case study, using **opencode's actual stack**
(Bun, TypeScript, Effect, Drizzle, the Vercel AI SDK) rather than a Python
reimplementation -- companion to [`openrestaurant/`](../openrestaurant/) and
[`open-deep-research/`](../open-deep-research/) in this repo.

Every topic below is a real, runnable file, faithful to a specific piece of
opencode's real source (`/home/skanda/opencode` when this was built) --
each file's header comment says exactly what's ported verbatim, what's
simplified, and why. Where a real bug surfaced from actually running these
(several did -- a path-confusion bug, an unenforced permission check, a
missing file/directory branch in `grep`), the fix and the reasoning are also
in the comments, not just in this README.

## The spine (1 -> 4)

These four build on each other -- by the end of 4 you have one complete,
working mini-harness. Everything after extends this same loop.

| # | Topic | Run | What it shows |
|---|---|---|---|
| 1 | System prompt | `bun run 01` | persona + env + `AGENTS.md` + skills assembly, matched to opencode's real wording/order |
| 2 | Tools | `bun run 02 "<task>"` | real `read`/`grep`/`glob`/`edit`/`write`/`shell`, ripgrep-backed, real Claude tool-use call |
| 3 | Message history | `bun run 03` | why conversational state lives in `messages[]`, not the system prompt (which never changes across the 2 calls) |
| 4 | Agent harness | `bun run 04 "<task>"` | the explicit loop-until-`end_turn`, combining 1+2+3 for real |

## Extensions (5 -> 12)

Each of these picks up the topic-4 harness and extends one piece of it.

| # | Topic | Run | Extends |
|---|---|---|---|
| 5 | Permission system | `bun run 05` | a real ask/allow/deny ruleset (run directly in a terminal to get a live y/n prompt) |
| 6 | Compaction | `bun run 06` | summarizing history via a second real LLM call when it overflows |
| 7 | Sub-agents | `bun run 07` | the `task` tool -- a nested harness loop with its own fresh context |
| 8 | Drizzle + SQLite | `bun run 08` | real persistence (via Bun's built-in `bun:sqlite`, one of opencode's actual drivers) replacing the in-memory array |
| 9 | Effect-TS | `bun run 09` | the same permission check from topic 5, rewritten in opencode's real paradigm (typed errors, DI via `Layer`) -- standalone, nothing else imports it |
| 10 | WebSocket/TUI | `bun run 10:server` (terminal 1) + `bun run 10:client` (terminal 2) | streaming harness events live, no polling -- a plain terminal client, deliberately not a browser page (see Codespaces note below) |
| 11 | MCP client | `bun run 11` | consuming `openrestaurant/mcp_server/server.py`'s real MCP server from TypeScript -- cross-language, zero changes to that server |
| 12 | Observability | `bun run 12` | real Langfuse JS SDK tracing the harness loop, same account as `openrestaurant`'s Python instrumentation |

## Setup

Dependencies install automatically via this repo's root `.devcontainer/`
(Bun + `bun install` + `ripgrep`, alongside the Python side for
`openrestaurant`/`open-deep-research`) -- see the top-level README. Add your
own `ANTHROPIC_API_KEY` (and `LANGFUSE_*` for topic 12) to the repo-root
`.env` -- shared with `openrestaurant`/`open-deep-research`, not a separate
file here. Each topic's `package.json` script passes
`--env-file=../.env` explicitly, since Bun's own `.env` auto-loading only
checks the current working directory, not parent directories.

Each numbered topic has its own `project/` sample directory it operates on
(sandboxed only in the sense that it's a small throwaway directory, not a
hard path restriction -- see `src/project-path.ts`'s header comment for why
there's no path jail here, matching how opencode itself actually scopes
tools). **Run this on a scratch branch or a fresh Codespace**, not on work
you care about -- topics 2, 4, 5, and 7 give a real model real `edit`/
`write`/`shell` access.

## `src/`, not per-topic silos

Real implementation code lives in `src/` (one file per opencode concept:
`system-prompt.ts`, `tools.ts`, `harness.ts`, `permission.ts`, `db.ts`, ...),
imported by each numbered topic's thin driver script -- same convention as
`open-deep-research`'s `notebooks/` importing from `src/deep_research_from_scratch/`.
This matters once topics depend on more than one earlier topic (topic 4 needs
1+2+3; topic 11 needs 2+4): every topic imports from the same place
regardless of which topic introduced what, and a topic like 5 can upgrade
`src/permission.ts`'s stub into something real without editing another
topic's folder.

## A note on fidelity

These are **faithful re-creations using opencode's real libraries and
patterns**, not literal copies of opencode's source files -- the real files
are wired into opencode's internal `@opencode-ai/core` package and a large
Effect `Layer`/`Context.Service` DI graph that isn't runnable standalone
outside that monorepo. Where something is simplified (e.g., `edit`'s fuzzy
fallback matching, `shell`'s destructive-command detection using a keyword
heuristic instead of a real tree-sitter AST parse), the file's header comment
says so explicitly and explains why.
