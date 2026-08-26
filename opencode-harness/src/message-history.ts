// Topic 3: User prompt / message history.
//
// Real opencode's actual design (session/message-v2.ts + prompt.ts): a
// message is NOT stored in the exact shape the model API expects. It's
// stored as a richer internal `MessageV2` (role, parts[], ids, timestamps,
// cost/token metadata) and only converted to the AI SDK's wire format
// (`MessageV2.toModelMessagesEffect`) right before the API call. That
// indirection is deliberate -- the stored form needs to support things the
// wire format doesn't (persistence, multiple providers with different wire
// shapes, editing/regenerating a past turn) without being coupled to
// whichever provider SDK happens to be in use that call.
//
// This ports that same two-layer shape at a much smaller scale: a
// HistoryMessage[] array (the stored form) + toModelMessages() (the
// conversion step). What's dropped: ids/timestamps/cost tracking, multiple
// providers, and persistence -- topic 8 (Drizzle+SQLite) adds real
// persistence on top of this same shape.

import type { ModelMessage } from "ai"

export type HistoryPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }

export interface HistoryMessage {
  role: "user" | "assistant" | "tool"
  parts: HistoryPart[]
}

export function createUserMessage(text: string): HistoryMessage {
  return { role: "user", parts: [{ type: "text", text }] }
}

// Real opencode: MessageV2.toModelMessagesEffect(msgs, model) -- the exact
// conversion step. This is why the user's message "goes into message
// history, not the system prompt": it's just another HistoryMessage that
// gets flattened into the `messages` array sent alongside `system`.
export function toModelMessages(history: HistoryMessage[]): ModelMessage[] {
  const out: ModelMessage[] = []
  for (const msg of history) {
    if (msg.role === "user") {
      const text = msg.parts.find((p): p is Extract<HistoryPart, { type: "text" }> => p.type === "text")?.text ?? ""
      out.push({ role: "user", content: text })
      continue
    }
    if (msg.role === "assistant") {
      out.push({
        role: "assistant",
        content: msg.parts.map((p) =>
          p.type === "text"
            ? { type: "text" as const, text: p.text }
            : { type: "tool-call" as const, toolCallId: p.toolCallId, toolName: p.toolName, input: p.input },
        ),
      })
      continue
    }
    // role === "tool"
    out.push({
      role: "tool",
      content: msg.parts
        .filter((p): p is Extract<HistoryPart, { type: "tool-result" }> => p.type === "tool-result")
        .map((p) => ({ type: "tool-result" as const, toolCallId: p.toolCallId, toolName: p.toolName, output: { type: "text" as const, value: String(p.output) } })),
    })
  }
  return out
}
