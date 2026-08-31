// Topic 12: Observability -- real langfuse JS SDK, same account/keys as
// openrestaurant's Python instrumentation (openrestaurant/README.md's
// "Observability (Langfuse)" section).
//
// CORRECTION: an earlier version of this comment claimed `langfuse` is a
// real dependency of opencode's own package.json. That was wrong -- checked
// directly against the actual anomalyco/opencode repo (both origin/dev and
// GitHub code search) and `langfuse` appears nowhere in it. What I'd found
// was substantial hand-written Langfuse integration code sitting as
// uncommitted, never-pushed local changes in a stray clone on this machine
// -- leftover prototype work, not part of the real project. Langfuse here
// is a standard, common real-world choice for LLM observability (same
// reason openrestaurant uses it), not something opencode itself does.
//
// This hooks into the harness loop via the SAME onEvent callback topic 10
// (WebSocket/TUI) uses -- the harness doesn't know or care whether its
// events are going to a WebSocket, a console.log, or a tracing SDK, they're
// all just event consumers. That's worth noticing: one instrumentation
// point serves both a UI-streaming use case and an observability use case.
//
// Deviation: openrestaurant's Python side uses langfuse SDK v4's newer
// OTEL-based `start_as_current_observation`/`propagate_attributes` API,
// nesting every generation/tool span as a real child of one root span per
// turn. This uses the installed JS SDK (v3, langfuse.trace().span()/
// .generation()) instead -- an older, non-OTEL API shape with different
// method names. This keeps every observation as a direct child of one trace
// (flat, not nested per-turn) rather than replicating the exact hierarchy.

import { Langfuse } from "langfuse"
import type { HarnessEvent } from "./harness"

export function createLangfuseTracer(sessionId: string, input: string, modelId: string) {
  const langfuse = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  })

  const trace = langfuse.trace({ name: "harness_run", sessionId, input })
  let currentGeneration: ReturnType<typeof trace.generation> | undefined
  const toolSpans = new Map<string, ReturnType<typeof trace.span>>()

  function onEvent(e: HarnessEvent) {
    if (e.type === "model-call-start") {
      currentGeneration = trace.generation({ name: `turn-${e.turn}`, model: modelId })
    }
    if (e.type === "tool-call") {
      toolSpans.set(e.toolName, trace.span({ name: e.toolName, input: e.input }))
    }
    if (e.type === "tool-result") {
      toolSpans.get(e.toolName)?.end({ output: e.output })
    }
    if (e.type === "final-text") {
      currentGeneration?.end({ output: e.text })
      trace.update({ output: e.text })
    }
  }

  return {
    onEvent,
    traceUrl: `${process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com"}/trace/${trace.id}`,
    flush: () => langfuse.flushAsync(),
  }
}
