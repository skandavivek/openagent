// Topic 12 driver -- see src/observability.ts for the real tracer.

import { assembleSystemPrompt, type Model } from "../src/system-prompt"
import { buildTools } from "../src/tools"
import { createUserMessage, type HistoryMessage } from "../src/message-history"
import { runHarness, type HarnessEvent } from "../src/harness"
import { createLangfuseTracer } from "../src/observability"

const PROJECT_ROOT = `${import.meta.dir}/project`
const model: Model = { id: "claude-sonnet-5", providerID: "anthropic" }

async function main() {
  const system = assembleSystemPrompt(model, PROJECT_ROOT)
  const tools = buildTools(PROJECT_ROOT)
  const task = "List the files in this directory, one per line."
  const history: HistoryMessage[] = [createUserMessage(task)]

  const sessionId = crypto.randomUUID()
  const tracer = createLangfuseTracer(sessionId, task, model.id)

  const finalText = await runHarness(history, {
    modelId: model.id,
    system,
    tools,
    onEvent: (e: HarnessEvent) => {
      if (e.type === "tool-call") console.log(`[tool-call]   ${e.toolName}(${JSON.stringify(e.input)})`)
      if (e.type === "tool-result") console.log(`[tool-result] ${e.toolName}`)
      tracer.onEvent(e)
    },
  })

  console.log("\n" + "=".repeat(70))
  console.log("FINAL:", finalText)
  console.log("=".repeat(70))

  await tracer.flush()
  console.log(`\nTrace: ${tracer.traceUrl}`)
}

main()
