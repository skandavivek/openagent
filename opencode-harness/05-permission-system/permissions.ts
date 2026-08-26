// Topic 5 driver -- see src/permission.ts for the real ruleset/ask mechanics.
//
// Switches on strictRuleset (edit + shell.write require a human "ask"), then
// asks the model to edit a file. In a real terminal (TTY attached), this
// actually blocks and prompts you with a real y/n question -- try running
// this file directly in your own terminal, not through an automated runner,
// to see the live prompt. Piped/non-interactive runs (no TTY) auto-deny
// rather than silently allow, and you'll see the model react to the denial
// the same way it reacts to any other tool failure (src/tools.ts's safe()
// wrapper turns it into an "Error: ..." result the model can read and retry
// or give up on).
//
// Real emergent result worth keeping, not a bug to chase: when `write` gets
// denied, a model can route around it via `shell` (`echo ... >> file`) --
// shellTool's looksDestructive() heuristic doesn't recognize `echo` as
// file-modifying, so shell.read stays allowed and the edit happens anyway.
// This is exactly why real opencode's shell tool needs full tree-sitter AST
// parsing instead of a first-word check: a permission gate is only as strong
// as its coverage across every path to the same side effect, not just the
// one tool you thought to gate.

import { assembleSystemPrompt, type Model } from "../src/system-prompt"
import { buildTools } from "../src/tools"
import { createUserMessage, type HistoryMessage } from "../src/message-history"
import { runHarness, type HarnessEvent } from "../src/harness"
import { setActiveRuleset, strictRuleset } from "../src/permission"

const PROJECT_ROOT = `${import.meta.dir}/project`
const model: Model = { id: "claude-sonnet-5", providerID: "anthropic" }

function logEvent(e: HarnessEvent) {
  if (e.type === "tool-call") console.log(`  [tool-call]   ${e.toolName}(${JSON.stringify(e.input)})`)
  if (e.type === "tool-result") console.log(`  [tool-result] ${e.toolName} -> ${JSON.stringify(e.output).slice(0, 150)}`)
  if (e.type === "final-text") console.log(`\n-- final answer --`)
}

async function main() {
  setActiveRuleset(strictRuleset)
  console.log(process.stdin.isTTY ? "TTY attached -- edit will prompt you for real.\n" : "No TTY -- edit will auto-deny (see src/permission.ts promptHuman()).\n")

  const system = assembleSystemPrompt(model, PROJECT_ROOT)
  const tools = buildTools(PROJECT_ROOT)
  const history: HistoryMessage[] = [createUserMessage("Add 'walk the dog' as a new line in todo.txt.")]

  const finalText = await runHarness(history, { modelId: model.id, system, tools, onEvent: logEvent })

  console.log("\n" + "=".repeat(70))
  console.log("FINAL:", finalText)
}

main()
