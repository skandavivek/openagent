// Topic 1: System prompt assembly.
//
// Faithful to opencode's real split across
// packages/opencode/src/session/system.ts + instruction.ts + prompt.ts, as
// verified directly against anomalyco/opencode's dev branch on 2026-08-30:
//   system = [...env, ...instructions, ...(mcpInstructions ? [mcpInstructions] : []), ...(skills ? [skills] : [])]
//   final  = [persona, ...system, userOverride].filter(Boolean).join("\n")
// The environment-block wording and the final-assembly join are matched
// exactly. What's simplified/dropped: persona() only ports 2 of the real
// (currently 8, and growing -- opencode adds new model families over time)
// dispatch branches; instructions only checks AGENTS.md (real also checks
// CLAUDE.md / CONTEXT.md / a global config path); skills() is hardcoded;
// the "project references" block and the newer `mcpInstructions` piece
// (instructions injected by connected MCP servers -- didn't exist when this
// was first written, added upstream since) are both dropped entirely.
//
// This file was checked against a live, actively-developed open source repo,
// not a frozen spec -- some of the above (branch count, minor plumbing) will
// drift further as opencode keeps shipping. The core mechanism (static
// system prompt assembled from these buckets, user message never touches it)
// is the stable, load-bearing claim; exact counts are not.
//
// Deviation: real opencode walks up from `process.cwd()` (wherever the user
// opened the project). This demo walks up from the script's own directory
// so `bun run 01-system-prompt/system-prompt.ts` finds the AGENTS.md next
// to it regardless of where you invoke it from.

import { readFileSync, existsSync } from "fs"
import { dirname, join } from "path"
import { execSync } from "child_process"

export type Model = { id: string; providerID: string }

// -- 1. Base persona: hardcoded .txt file selected by model ID -------------
// Real opencode: packages/opencode/src/session/system.ts `provider()` is a
// growing dispatch-by-substring function (8 branches as of 2026-08-30: a
// newer "muse" family, gpt-4/o1/o3 -> BEAST, gpt+codex -> CODEX, other gpt ->
// GPT, gemini- -> GEMINI, claude -> ANTHROPIC, trinity -> TRINITY, kimi ->
// KIMI, else -> DEFAULT). This demo only ports 2 of those branches
// (claude / default) -- same dispatch-by-substring pattern, fewer personas.
function persona(model: Model): string {
  const dir = join(import.meta.dir, "prompts")
  if (model.id.includes("claude")) return readFileSync(join(dir, "anthropic.txt"), "utf-8")
  return readFileSync(join(dir, "default.txt"), "utf-8")
}

// -- 2. Environment block: facts injected at call time ----------------------
// Real opencode: system.ts `environment()`. Faithful down to the exact
// wording of the model-ID line and the field list; the one thing genuinely
// dropped is the optional "project references" block (a newer, more niche
// feature -- additional directories the agent can access) since there's no
// reference-list concept in this demo.
function environment(model: Model): string {
  const cwd = process.cwd()
  const worktree = cwd // real opencode tracks these separately (e.g. git worktrees can differ); same value here
  let isGitRepo = "no"
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd, stdio: "pipe" })
    isGitRepo = "yes"
  } catch {
    /* not a git repo */
  }
  return [
    `You are powered by the model named ${model.id}. The exact model ID is ${model.providerID}/${model.id}`,
    `Here is some useful information about the environment you are running in:`,
    `<env>`,
    `  Working directory: ${cwd}`,
    `  Workspace root folder: ${worktree}`,
    `  Is directory a git repo: ${isGitRepo}`,
    `  Platform: ${process.platform}`,
    `  Today's date: ${new Date().toDateString()}`,
    `</env>`,
  ].join("\n")
}

// -- 3. Project instructions: walk UP the directory tree for AGENTS.md ------
// Real opencode: session/instruction.ts `system()` -- also checks CLAUDE.md,
// CONTEXT.md (deprecated), and a global config path. Simplified here to just
// AGENTS.md for one file, one lookup.
function walkUpForInstructions(startDir: string): string | undefined {
  let dir = startDir
  for (let i = 0; i < 20; i++) {
    const candidate = join(dir, "AGENTS.md")
    if (existsSync(candidate)) return readFileSync(candidate, "utf-8")
    const parent = dirname(dir)
    if (parent === dir) break // hit filesystem root
    dir = parent
  }
  return undefined
}

// -- 4. Skills list: static, from agent config -------------------------------
// Real opencode: system.ts `skills()`, formatted from the current agent's
// permission config. Hardcoded here as a stand-in.
function skills(): string | undefined {
  const available = ["code-review", "run-tests"]
  if (available.length === 0) return undefined
  return ["Available skills (invoke via the `skill` tool when relevant):", ...available.map((s) => `- ${s}`)].join(
    "\n",
  )
}

// -- 5. Final assembly -------------------------------------------------------
// Real opencode: llm/request.ts merges agent persona + system array + rare
// per-user override, in this order, joined with "\n" (a single newline --
// matched exactly here; the real output is this dense, not spaced out for
// readability).
// `projectDir` is where instructions get walked up from -- real opencode
// walks up from `instance.directory` (whatever project you opened), not from
// wherever this code happens to live. Defaults to this file's own directory
// so 01's standalone demo still finds its own AGENTS.md; other topics that
// import this (e.g. 02-tools) pass their own project directory instead.
export function assembleSystemPrompt(model: Model, projectDir: string = import.meta.dir, userOverride?: string): string {
  const env = environment(model)
  const instructions = walkUpForInstructions(projectDir)
  const skillsBlock = skills()

  const system = [env, instructions, skillsBlock].filter((x): x is string => Boolean(x))

  return [persona(model), ...system, userOverride].filter((x): x is string => Boolean(x)).join("\n")
}
