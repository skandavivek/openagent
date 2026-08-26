// Topic 6: Compaction -- real opencode's actual description (mental-model.md):
// "When the context window gets too large: (1) summarize prior turns via a
// SEPARATE LLM call, (2) replace old history with the synthetic summary
// message, (3) the loop continues from there." The system prompt itself is
// NOT touched -- the summary goes into message history, same bucket the
// user's messages already live in.
//
// Deviation: real opencode triggers this on actual token-count vs. the
// model's real context window; this uses a crude character-count proxy and a
// small hardcoded threshold so it's actually demonstrable without needing to
// stuff a real 100K-token conversation first. The summarization prompt here
// is also just mine -- real opencode's actual compaction prompt (what it
// asks the model to preserve vs. drop) isn't ported.

import { anthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import { type HistoryMessage, toModelMessages } from "./message-history"

export function approximateSize(history: HistoryMessage[]): number {
  return JSON.stringify(history).length
}

// Mutates `history` in place, same convention as runHarness(). Returns
// whether it actually compacted (so a driver can log it).
export async function maybeCompact(
  history: HistoryMessage[],
  modelId: string,
  threshold: number,
  keepRecent = 2,
): Promise<boolean> {
  if (approximateSize(history) < threshold || history.length <= keepRecent) return false

  const toSummarize = history.slice(0, -keepRecent)
  const recent = history.slice(-keepRecent)

  const transcript = toModelMessages(toSummarize)
    .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n")

  const result = await generateText({
    model: anthropic(modelId),
    prompt:
      "Summarize this conversation concisely. Preserve any concrete facts, decisions, or " +
      "user-stated preferences that matter for continuing it correctly -- drop pleasantries " +
      `and tool-call plumbing that don't affect future turns.\n\n${transcript}`,
  })

  history.length = 0
  history.push({ role: "user", parts: [{ type: "text", text: `[Earlier conversation summarized]: ${result.text}` }] })
  history.push(...recent)
  return true
}
