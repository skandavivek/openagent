// Topic 7 driver -- see src/sub-agent.ts for the real mechanism.
// The parent harness gets a `task` tool alongside its normal tools; it can
// delegate a self-contained piece of work to a sub-agent that runs its own
// full loop with its own fresh history, then reports back one result.

import { assembleSystemPrompt, type Model } from "../src/system-prompt"
import { buildTools } from "../src/tools"
import { buildTaskTool } from "../src/sub-agent"
import { createUserMessage, type HistoryMessage } from "../src/message-history"
import { runHarness, type HarnessEvent } from "../src/harness"

const PROJECT_ROOT = `${import.meta.dir}/project`
const model: Model = { id: "claude-sonnet-5", providerID: "anthropic" }

function logEvent(e: HarnessEvent) {
  if (e.type === "tool-call") console.log(`[parent tool-call] ${e.toolName}(${JSON.stringify(e.input).slice(0, 100)})`)
  if (e.type === "tool-result" && e.toolName !== "task")
    console.log(`[parent tool-result] ${e.toolName} -> ${JSON.stringify(e.output).slice(0, 100)}`)
}

async function main() {
  const system = assembleSystemPrompt(model, PROJECT_ROOT)
  const tools = { ...buildTools(PROJECT_ROOT), task: buildTaskTool(model, PROJECT_ROOT) }
  const history: HistoryMessage[] = [
    createUserMessage(
      "Use a sub-agent (the task tool) to find every function name defined in this project and list them. " +
        "Then, using that result yourself, add a comment at the top of main.py listing those function names.",
    ),
  ]

  const finalText = await runHarness(history, { modelId: model.id, system, tools, onEvent: logEvent })

  console.log("\n" + "=".repeat(70))
  console.log("FINAL:", finalText)
  console.log("=".repeat(70))
  console.log(`\nParent history: ${history.length} entries -- the sub-agent's own exploration`)
  console.log("(its reads/greps) never entered the parent's history, only its final text did.")
}

main()
