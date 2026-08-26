// Topic 7: Sub-agents -- real opencode's `task` tool (packages/opencode/src/
// tool/task.ts): spawns a CHILD session with its own system prompt + message
// history -- a nested reduce loop, not a special mechanism. That's the whole
// insight: "sub-agent" isn't a different kind of thing from "agent", it's
// runHarness() called again with a fresh history, from inside a tool's
// execute function.
//
// Deviation: real task.ts has two modes -- foreground (blocks, returns the
// child's output, what this ports) and background (async, the parent is
// notified via an event when it finishes, and `task_id` can resume a prior
// background session's history). Background mode isn't implemented here --
// it needs real session persistence (topic 8) and an event bus (topic 10) to
// do properly, and is noted as a comment rather than a half-built mechanism.

import { tool } from "ai"
import { z } from "zod"
import { assembleSystemPrompt, type Model } from "./system-prompt"
import { buildTools } from "./tools"
import { createUserMessage, type HistoryMessage } from "./message-history"
import { runHarness } from "./harness"

export function buildTaskTool(model: Model, projectRoot: string) {
  return tool({
    description:
      "Spawn a sub-agent to handle a self-contained sub-task, with its own fresh context " +
      "(it does NOT see this conversation's history). Use this to delegate a chunk of work " +
      "that doesn't need the full conversation, keeping this context window smaller.",
    inputSchema: z.object({
      description: z.string().describe("Short (3-5 word) summary of the sub-task"),
      prompt: z.string().describe("The full, self-contained task for the sub-agent -- it has no other context"),
    }),
    execute: async ({ description, prompt }) => {
      console.log(`  [sub-agent]   spawning for: ${description}`)
      const childSystem = assembleSystemPrompt(model, projectRoot)
      const childHistory: HistoryMessage[] = [createUserMessage(prompt)]
      const result = await runHarness(childHistory, {
        modelId: model.id,
        system: childSystem,
        tools: buildTools(projectRoot),
        onEvent: (e) => {
          if (e.type === "tool-call") console.log(`    [sub-agent tool-call] ${e.toolName}(${JSON.stringify(e.input)})`)
        },
      })
      console.log(`  [sub-agent]   done: ${description}`)
      return result
    },
  })
}
