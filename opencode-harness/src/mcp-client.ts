// Topic 11: MCP client -- real opencode is an MCP CLIENT itself (the
// mental-model doc: "MCP servers can add more tools dynamically"), using the
// same `@modelcontextprotocol/sdk` package this imports. `openrestaurant/`
// already has a real MCP SERVER (mcp_server/server.py, Python, stdio
// transport) -- this connects to that exact server from TypeScript, which is
// the actual point of MCP as a protocol: language doesn't matter on either
// side. openrestaurant/chat_service/mcp_client.py already does the same
// connection from Python; this is the same server, a different, cross-
// language client.
//
// Deviation: real opencode caches/pre-validates tool schemas and supports
// multiple concurrent MCP servers with namespacing; this connects to exactly
// one server and does the minimum needed to list + wrap its tools.

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { tool, jsonSchema, type ToolSet } from "ai"

export async function connectMcpTools(command: string, args: string[]): Promise<{ tools: ToolSet; close: () => Promise<void> }> {
  const transport = new StdioClientTransport({ command, args })
  const client = new Client({ name: "opencode-harness", version: "0.1.0" })
  await client.connect(transport)

  const { tools: mcpTools } = await client.listTools()
  console.log(`[mcp] connected, ${mcpTools.length} tool(s): ${mcpTools.map((t) => t.name).join(", ")}`)

  const tools: ToolSet = {}
  for (const mcpTool of mcpTools) {
    tools[mcpTool.name] = tool({
      description: mcpTool.description ?? "",
      inputSchema: jsonSchema(mcpTool.inputSchema as any),
      execute: async (input) => {
        console.log(`  [mcp-execute] ${mcpTool.name}(${JSON.stringify(input)})`)
        const result = await client.callTool({ name: mcpTool.name, arguments: input as Record<string, unknown> })
        const content = result.content as Array<{ type: string; text?: string }>
        return content.map((c) => c.text ?? "").join("\n")
      },
    })
  }

  return { tools, close: () => client.close() }
}
