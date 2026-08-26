// Topic 5: Permission system -- upgrades the "always allow" stub topics 2-4
// used into a real ruleset, matching opencode's actual ctx.ask() contract
// (packages/opencode/src/permission/*): a permission type + patterns are
// checked against a ruleset; the first matching rule's action wins; "ask"
// really blocks and waits for a human when one is attached (a real
// interactive prompt here, not a simulation) -- exactly what makes
// `openrestaurant`'s "confirm before write" pattern a harness-engineering
// concept, not something specific to that one demo.
//
// Deviation: real opencode's ruleset is per-agent/per-session config loaded
// from opencode.jsonc, with the `always` list persisted so a user's "always
// allow" choice sticks across future calls in the same session. This is a
// fixed, hardcoded ruleset + no persistence of "always" choices across runs.

import { createInterface } from "readline"

export type PermissionResult = "allow" | "deny" | "ask"

export interface AskInput {
  permission: string
  patterns: string[]
  always?: string[]
  metadata?: Record<string, unknown>
}

export interface Rule {
  pattern: string // "*" or an exact string -- simple matcher, not full glob
  action: PermissionResult
}

// Permissive default -- matches the "always allow" stub topics 2-4 already
// depend on for unattended runs (no TTY, nothing to ask). Real opencode's
// actual default leans stricter than this; see strictRuleset below for that
// version, which 05-permission-system's own driver uses to demonstrate a
// real ask-and-block prompt without silently changing 2-4's behavior
// underneath them.
export const defaultRuleset: Record<string, Rule[]> = {
  read: [{ pattern: "*", action: "allow" }],
  grep: [{ pattern: "*", action: "allow" }],
  glob: [{ pattern: "*", action: "allow" }],
  edit: [{ pattern: "*", action: "allow" }],
  "shell.read": [{ pattern: "*", action: "allow" }],
  "shell.write": [{ pattern: "*", action: "allow" }],
}

// Real opencode: this ships as user/project config (opencode.jsonc), not
// hardcoded. Read: allow silently; edit/shell.write: ask a human.
export const strictRuleset: Record<string, Rule[]> = {
  read: [{ pattern: "*", action: "allow" }],
  grep: [{ pattern: "*", action: "allow" }],
  glob: [{ pattern: "*", action: "allow" }],
  "shell.read": [{ pattern: "*", action: "allow" }],
  edit: [{ pattern: "*", action: "ask" }],
  "shell.write": [{ pattern: "*", action: "ask" }],
}

function matches(pattern: string, value: string): boolean {
  return pattern === "*" || pattern === value
}

function resolveAction(permission: string, ruleset: Record<string, Rule[]>): PermissionResult {
  const rules = ruleset[permission] ?? []
  for (const rule of rules) {
    if (matches(rule.pattern, "*")) return rule.action // only "*" patterns supported (see matches())
  }
  return "ask" // no matching rule -- real opencode's real default is also to ask
}

async function promptHuman(input: AskInput): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.log(
      `  [permission] ${input.permission} ${JSON.stringify(input.patterns)} -> DENY ` +
        `(would ask a human, but stdin isn't a TTY -- no one to ask, so deny rather than silently allow)`,
    )
    return false
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer: string = await new Promise((resolve) =>
    rl.question(
      `  [permission] allow ${input.permission} ${JSON.stringify(input.patterns)}? [y/N] `,
      (a) => resolve(a),
    ),
  )
  rl.close()
  return answer.trim().toLowerCase() === "y"
}

// Module-level "active ruleset" rather than threading a ruleset param through
// every tool-*.ts function's signature (six files: read/grep/glob/edit/write/
// shell). Simpler for a teaching demo; real opencode instead carries this on
// actual session/agent config passed through context, not global state --
// worth knowing this is a shortcut, not the production-faithful shape.
let activeRuleset: Record<string, Rule[]> = defaultRuleset
export function setActiveRuleset(ruleset: Record<string, Rule[]>): void {
  activeRuleset = ruleset
}

export async function ask(input: AskInput, ruleset: Record<string, Rule[]> = activeRuleset): Promise<PermissionResult> {
  const action = resolveAction(input.permission, ruleset)

  if (action === "allow" || action === "deny") {
    console.log(`  [permission] ${input.permission} ${JSON.stringify(input.patterns)} -> ${action}`)
    return action
  }

  const approved = await promptHuman(input)
  return approved ? "allow" : "deny"
}
