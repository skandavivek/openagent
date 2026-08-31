// Topic 10 driver (server half) -- streams the topic-4 harness loop's events
// live to a client, no polling, the same reactive-UI principle real opencode
// relies on.
//
// CORRECTION: an earlier version of this comment claimed real opencode uses
// WebSocket for exactly this "stream session/tool-call events to a UI" case.
// Checked directly against the real source (packages/opencode/src/server/
// routes/instance/httpapi/'s own AGENTS.md): that general event stream is
// actually Server-Sent Events (SSE) there, a one-directional push, which is
// arguably the better-fitting tool for this specific job. Real WebSocket
// usage in opencode is scoped to exactly one feature -- the embedded
// terminal (`pty`), which genuinely needs full-duplex (keystrokes flowing
// client->server while output streams server->client, simultaneously). This
// demo uses `ws` (matching opencode's real dependency) for a use case that,
// in the real codebase, is actually handled by SSE instead.
//
// This runs the topic-4 harness loop, but instead of (only) console.log-ing
// each HarnessEvent, it broadcasts them as JSON over a real WebSocket to
// whichever client(s) are connected -- run 10-websocket-tui/client.ts in a
// second terminal to see them arrive live, the same "no polling" property.
//
// Deviation, deliberate: no browser client. If this ran through a Codespaces
// forwarded port, a browser page would hit the exact bug openrestaurant's
// web/chat.js had (localhost means the viewer's machine, not the container).
// A terminal client run inside the same container sidesteps that entirely --
// see the openagent monorepo README history for that exact incident.

import { assembleSystemPrompt, type Model } from "../src/system-prompt"
import { buildTools } from "../src/tools"
import { createUserMessage, type HistoryMessage } from "../src/message-history"
import { runHarness, type HarnessEvent } from "../src/harness"

const PROJECT_ROOT = `${import.meta.dir}/project`
const PORT = 8123
const model: Model = { id: "claude-sonnet-5", providerID: "anthropic" }

const clients = new Set<import("bun").ServerWebSocket<unknown>>()

function broadcast(event: HarnessEvent) {
  const json = JSON.stringify(event)
  for (const ws of clients) ws.send(json)
}

Bun.serve({
  port: PORT,
  fetch(req, server) {
    if (server.upgrade(req)) return
    return new Response("WebSocket only -- run 10-websocket-tui/client.ts to connect", { status: 400 })
  },
  websocket: {
    open(ws) {
      clients.add(ws)
      console.log(`[server] client connected (${clients.size} total)`)
      if (clients.size === 1) runDemoTask() // kick off on first connection
    },
    close(ws) {
      clients.delete(ws)
    },
    message() {}, // clients don't send anything in this demo
  },
})

console.log(`[server] listening on ws://localhost:${PORT} -- waiting for a client to connect...`)

async function runDemoTask() {
  const system = assembleSystemPrompt(model, PROJECT_ROOT)
  const tools = buildTools(PROJECT_ROOT)
  const history: HistoryMessage[] = [createUserMessage("Read notes.txt and tell me what it says, one line.")]

  broadcast({ type: "model-call-start", turn: -1 }) // signal: harness starting
  const finalText = await runHarness(history, {
    modelId: model.id,
    system,
    tools,
    onEvent: (e) => {
      console.log(`[server] event: ${e.type}`)
      broadcast(e)
    },
  })
  broadcast({ type: "final-text", turn: -1, text: finalText })
  console.log(`[server] done: ${finalText}`)
}
