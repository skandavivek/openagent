// Topic 2 driver -- see src/tools.ts for the real tool implementations.
//
// This wires topic 1's real assembleSystemPrompt() into the `system` field --
// real opencode NEVER calls the model with tools alone, it always sends
// {system, messages, tools} together, every call (opencode-user-input-flow.md).
// Pass your own task as an argv, or it defaults to the TODO-fixing demo:
//   bun run 02-tools/tools.ts "create a file called hello.txt saying hi"

import { anthropic } from "@ai-sdk/anthropic"
import { generateText, stepCountIs } from "ai"
import { buildTools } from "../src/tools"
import { assembleSystemPrompt, type Model } from "../src/system-prompt"

const PROJECT_ROOT = `${import.meta.dir}/project`
const model: Model = { id: "claude-sonnet-5", providerID: "anthropic" }

const task =
  process.argv[2] ??
  "There's a Python script and a notes.md file with a TODO in the project directory. " +
    "Find the TODO, read the relevant code, make the described change with a surgical edit " +
    "(not a full rewrite), then run the script with `python3 <file>` to confirm it still works. " +
    "Report what you changed and the script's output."

async function main() {
  const system = assembleSystemPrompt(model, PROJECT_ROOT)
  console.log(`Project directory: ${PROJECT_ROOT}`)
  console.log(`System prompt: ${system.length} chars (see 01-system-prompt/ to print it in full)`)
  console.log(`Task: ${task}\n`)

  const result = await generateText({
    model: anthropic(model.id),
    system,
    tools: buildTools(PROJECT_ROOT),
    stopWhen: stepCountIs(10),
    prompt: task,
  })

  console.log("\n" + "=".repeat(70))
  console.log("FINAL TEXT:", result.text)
  console.log("=".repeat(70))
  console.log(`\n${result.steps.length} steps:`)
  for (const [i, step] of result.steps.entries()) {
    const calls = step.toolCalls.map((c) => c.toolName)
    console.log(`  step ${i + 1}: ${calls.length ? calls.join(", ") : "(final text)"}`)
  }
}

main()
