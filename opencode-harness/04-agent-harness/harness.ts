// Topic 4 driver -- the full spine: 1 (system prompt) + 2 (tools) + 3
// (message history) combined into 4's real loop (src/harness.ts). This is
// the first genuinely complete mini-harness in this series -- everything
// after this (5-12) extends this same loop rather than building a new one.
//
//   bun run 04-agent-harness/harness.ts "add a multiply function and use it"

import { assembleSystemPrompt, type Model } from "../src/system-prompt"
import { buildTools } from "../src/tools"
import { createUserMessage, type HistoryMessage } from "../src/message-history"
import { runHarness, type HarnessEvent } from "../src/harness"

const PROJECT_ROOT = `${import.meta.dir}/project`
const model: Model = { id: "claude-sonnet-5", providerID: "anthropic" }

const task =
  process.argv[2] ??
  "Add a multiply(a, b) function to calc.py, next to add/subtract, and print multiply(4, 5) at the bottom. " +
    "Use a surgical edit, then run the script to confirm the output is correct."

function logEvent(e: HarnessEvent) {
  if (e.type === "model-call-start") console.log(`\n-- turn ${e.turn}: calling model --`)
  if (e.type === "tool-call") console.log(`  [tool-call]   ${e.toolName}(${JSON.stringify(e.input)})`)
  if (e.type === "tool-result") console.log(`  [tool-result] ${e.toolName} -> ${JSON.stringify(e.output).slice(0, 120)}`)
  if (e.type === "final-text") console.log(`\n-- turn ${e.turn}: final answer, loop ends (finishReason !== "tool-calls") --`)
}

async function main() {
  const system = assembleSystemPrompt(model, PROJECT_ROOT)
  const tools = buildTools(PROJECT_ROOT)
  const history: HistoryMessage[] = [createUserMessage(task)]

  console.log(`Project: ${PROJECT_ROOT}`)
  console.log(`Task: ${task}`)

  const finalText = await runHarness(history, {
    modelId: model.id,
    system,
    tools,
    onEvent: logEvent,
  })

  console.log("\n" + "=".repeat(70))
  console.log("FINAL:", finalText)
  console.log("=".repeat(70))
  console.log(`\n${history.length} history entries after the loop ended.`)
}

main()
