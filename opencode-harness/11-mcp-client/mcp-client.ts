// Topic 11 driver -- see src/mcp-client.ts for the real connection logic.
// Connects to openrestaurant/mcp_server/server.py -- a real, independent
// Python MCP server, no changes made to it -- fetches its tool list, and
// runs it through the SAME harness loop (src/harness.ts) topics 4-10 use.
// This is the actual point: from the harness's perspective, an MCP-fetched
// tool and a local tool (src/tools.ts) are indistinguishable -- both are
// just entries in the `tools` object passed to generateText().

import path from "path"
import { assembleSystemPrompt, type Model } from "../src/system-prompt"
import { createUserMessage, type HistoryMessage } from "../src/message-history"
import { runHarness, type HarnessEvent } from "../src/harness"
import { connectMcpTools } from "../src/mcp-client"

const REPO_ROOT = path.resolve(import.meta.dir, "../../")
const PYTHON_BIN = path.join(REPO_ROOT, ".venv/bin/python")
const MCP_SERVER = path.join(REPO_ROOT, "openrestaurant/mcp_server/server.py")

const model: Model = { id: "claude-sonnet-5", providerID: "anthropic" }

function logEvent(e: HarnessEvent) {
  if (e.type === "tool-call") console.log(`[tool-call]   ${e.toolName}(${JSON.stringify(e.input)})`)
  if (e.type === "tool-result") console.log(`[tool-result] ${e.toolName} -> ${JSON.stringify(e.output).slice(0, 200)}`)
}

async function main() {
  const { tools, close } = await connectMcpTools(PYTHON_BIN, [MCP_SERVER])

  try {
    const system = assembleSystemPrompt(model, import.meta.dir)
    const history: HistoryMessage[] = [createUserMessage("Do you have any Italian restaurants? Just name one.")]

    const finalText = await runHarness(history, { modelId: model.id, system, tools, onEvent: logEvent })

    console.log("\n" + "=".repeat(70))
    console.log("FINAL:", finalText)
    console.log("=".repeat(70))
    console.log("\nThat tool call went through real MCP (JSON-RPC over stdio) to a real")
    console.log("Python process, and back -- same server openrestaurant's own chat_service uses.")
  } finally {
    await close()
  }
}

main()
