"""Thin wrapper that keeps one long-lived MCP server subprocess + session
alive for the lifetime of the FastAPI app, and adapts MCP tool schemas into
the shape the Anthropic Messages API expects.
"""
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Optional

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER_SCRIPT = Path(__file__).parent.parent / "mcp_server" / "server.py"
PYTHON_BIN = Path(__file__).parent.parent.parent / ".venv" / "bin" / "python"


class MCPToolClient:
    def __init__(self):
        self._stack = AsyncExitStack()
        self.session: Optional[ClientSession] = None

    async def start(self):
        params = StdioServerParameters(command=str(PYTHON_BIN), args=[str(SERVER_SCRIPT)])
        read, write = await self._stack.enter_async_context(stdio_client(params))
        self.session = await self._stack.enter_async_context(ClientSession(read, write))
        await self.session.initialize()

    async def stop(self):
        await self._stack.aclose()

    async def list_tools_for_claude(self) -> list[dict]:
        result = await self.session.list_tools()
        return [
            {
                "name": t.name,
                "description": t.description or "",
                "input_schema": t.inputSchema,
            }
            for t in result.tools
        ]

    async def call_tool(self, name: str, arguments: dict) -> str:
        result = await self.session.call_tool(name, arguments)
        return "\n".join(block.text for block in result.content if hasattr(block, "text"))
