// Topic 4: The agent harness -- the actual loop, real opencode's
// packages/opencode/src/session/prompt.ts `runLoop`:
//   while (true) {
//     call model with {system, messages, tools}
//     if stop_reason !== "tool_use": return final text
//     execute tool(s), append tool_call + tool_result to messages
//   }
//
// This calls generateText with stopWhen: stepCountIs(1) so the AI SDK does
// exactly ONE model call + auto-executes that call's tool result (same as
// real opencode delegates single-step mechanics to the AI SDK's ai-sdk.ts),
// but WE decide whether to loop again by checking finishReason -- the loop
// itself is explicit here, not hidden behind the AI SDK's own multi-step
// stopWhen machinery (which is what 02-tools/ uses for simplicity, and which
// is exactly as real -- opencode's own real loop is this same pattern, just
// hand-written instead of using the SDK's stopWhen(N>1) convenience).
//
// Deviation: no compaction (topic 6), no persistence (topic 8) -- history is
// a plain in-memory array here.

import { anthropic } from "@ai-sdk/anthropic"
import { generateText, stepCountIs, type ToolSet } from "ai"
import { type HistoryMessage, toModelMessages } from "./message-history"

export interface HarnessOptions {
  modelId: string
  system: string
  tools: ToolSet
  maxTurns?: number
  onEvent?: (event: HarnessEvent) => void
}

export type HarnessEvent =
  | { type: "model-call-start"; turn: number }
  | { type: "tool-call"; turn: number; toolName: string; input: unknown }
  | { type: "tool-result"; turn: number; toolName: string; output: unknown }
  | { type: "final-text"; turn: number; text: string }

// Mutates `history` in place (appends every turn's messages) and returns the
// final assistant text -- same contract as real opencode's loop: history is
// the one thing that grows, system and tools stay fixed for the whole call.
export async function runHarness(history: HistoryMessage[], opts: HarnessOptions): Promise<string> {
  const maxTurns = opts.maxTurns ?? 10

  for (let turn = 0; turn < maxTurns; turn++) {
    opts.onEvent?.({ type: "model-call-start", turn })

    const result = await generateText({
      model: anthropic(opts.modelId),
      system: opts.system,
      messages: toModelMessages(history),
      tools: opts.tools,
      stopWhen: stepCountIs(1), // one model call per harness turn -- we own the outer loop
    })

    const step = result.steps[0]

    if (result.finishReason !== "tool-calls") {
      // Real opencode: stop_reason !== "tool_use" -> final answer, loop ends.
      history.push({ role: "assistant", parts: [{ type: "text", text: result.text }] })
      opts.onEvent?.({ type: "final-text", turn, text: result.text })
      return result.text
    }

    // Real opencode: append the tool_use message, then the tool_result
    // message, then loop back to call the model again with both in history.
    history.push({
      role: "assistant",
      parts: step.toolCalls.map((c) => ({
        type: "tool-call" as const,
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        input: c.input,
      })),
    })
    history.push({
      role: "tool",
      parts: step.toolResults.map((r) => ({
        type: "tool-result" as const,
        toolCallId: r.toolCallId,
        toolName: r.toolName,
        output: r.output,
      })),
    })
    for (const c of step.toolCalls) opts.onEvent?.({ type: "tool-call", turn, toolName: c.toolName, input: c.input })
    for (const r of step.toolResults)
      opts.onEvent?.({ type: "tool-result", turn, toolName: r.toolName, output: r.output })
  }

  throw new Error(`Harness hit maxTurns (${maxTurns}) without reaching a final answer`)
}
