// Topic 10 driver (client half) -- a plain terminal client, not a real TUI
// (opencode's actual TUI is SolidJS + a custom terminal-rendering engine,
// @opentui -- out of scope, see the harness README's Codespace-limitations
// note on native/heavy rendering deps). This proves the same underlying
// property real opencode's TUI relies on: the client never polls, it just
// reacts to whatever the server pushes.
//
// Run 10-websocket-tui/server.ts in one terminal first, then this in another.

const PORT = 8123
const ws = new WebSocket(`ws://localhost:${PORT}`)

ws.addEventListener("open", () => {
  console.log("[client] connected -- waiting for events (no polling happening here)")
})

ws.addEventListener("message", (msg) => {
  const event = JSON.parse(msg.data as string)
  if (event.type === "tool-call") console.log(`[client] << tool-call: ${event.toolName}(${JSON.stringify(event.input)})`)
  else if (event.type === "tool-result") console.log(`[client] << tool-result: ${event.toolName}`)
  else if (event.type === "final-text") {
    console.log(`[client] << final: ${event.text}`)
    process.exit(0)
  } else console.log(`[client] << ${event.type}`)
})

ws.addEventListener("close", () => {
  console.log("[client] disconnected")
})
