// Topic 2: Tools -- the real, faithful tool registry (read/grep/glob/edit/
// write/shell) wired to the AI SDK's tool() helper, the same `ai` package
// opencode itself uses. The point from opencode-tools.md: the description +
// schema on each tool IS the prompt -- nothing here maps "task -> which tool."
//
// Exported as a factory, buildTools(projectRoot), rather than a fixed object,
// so every topic that needs tools (04-agent-harness, 07-sub-agents,
// 11-mcp-client) can point them at its own project directory.
//
// Two fidelity fixes made after a real failure surfaced in 04-agent-harness:
// 1. filePath descriptions now say "absolute path", matching opencode's real
//    read.ts/write.ts wording exactly. A vaguer "relative to project root"
//    description caused the model to reconstruct a wrong path after seeing
//    an absolute path echoed back from `read`'s own output.
// 2. Every tool's execute is wrapped in try/catch (`safe()` below) so a
//    thrown error becomes an "Error: ..." string result instead of an
//    uncaught rejection. Real opencode's actual behavior: a failed tool call
//    (e.g. InvalidArgumentsError) is fed back to the model as a result it
//    can see and retry from -- it never leaves the harness loop in a broken
//    state with a dangling, unresolved tool call.

import { tool } from "ai"
import { z } from "zod"
import { readTool } from "./tool-read"
import { grepTool } from "./tool-grep"
import { globTool } from "./tool-glob"
import { editTool } from "./tool-edit"
import { writeTool } from "./tool-write"
import { shellTool } from "./tool-shell"

function safe<A extends unknown[]>(fn: (...args: A) => Promise<string>): (...args: A) => Promise<string> {
  return async (...args: A) => {
    try {
      return await fn(...args)
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

export function buildTools(projectRoot: string) {
  return {
    read: tool({
      description: "Read a file or list a directory. Returns line-numbered content, capped at 2000 lines / 50KB.",
      inputSchema: z.object({
        filePath: z.string().describe("The absolute path to the file or directory to read"),
        offset: z.number().optional(),
        limit: z.number().optional(),
      }),
      execute: safe(async (params) => {
        console.log(`  [execute]    read(${JSON.stringify(params)})`)
        return readTool(params, projectRoot)
      }),
    }),
    grep: tool({
      description: "Search file contents by regex pattern. Real ripgrep under the hood.",
      inputSchema: z.object({
        pattern: z.string(),
        path: z.string().optional(),
        include: z.string().optional().describe('e.g. "*.py"'),
      }),
      execute: safe(async (params) => {
        console.log(`  [execute]    grep(${JSON.stringify(params)})`)
        return grepTool(params, projectRoot)
      }),
    }),
    glob: tool({
      description: "Find files by name pattern, e.g. '**/*.py'. Real ripgrep --files under the hood.",
      inputSchema: z.object({
        pattern: z.string(),
        path: z.string().optional(),
      }),
      execute: safe(async (params) => {
        console.log(`  [execute]    glob(${JSON.stringify(params)})`)
        return globTool(params, projectRoot)
      }),
    }),
    edit: tool({
      description:
        "Replace an exact string in a file with a new one. filePath must be absolute. oldString must match " +
        "exactly once in the file (use replaceAll for every occurrence), or the call fails and asks for more context.",
      inputSchema: z.object({
        filePath: z.string().describe("The absolute path to the file to edit"),
        oldString: z.string(),
        newString: z.string(),
        replaceAll: z.boolean().optional(),
      }),
      execute: safe(async (params) => {
        console.log(`  [execute]    edit(${params.filePath})`)
        return editTool(params, projectRoot)
      }),
    }),
    write: tool({
      description: "Write/overwrite a whole file with new content. Prefer edit for surgical changes.",
      inputSchema: z.object({
        filePath: z.string().describe("The absolute path to the file to write (must be absolute, not relative)"),
        content: z.string(),
      }),
      execute: safe(async (params) => {
        console.log(`  [execute]    write(${params.filePath})`)
        return writeTool(params, projectRoot)
      }),
    }),
    shell: tool({
      description: "Run a shell command inside the project directory.",
      inputSchema: z.object({
        command: z.string(),
      }),
      execute: safe(async (params) => {
        console.log(`  [execute]    shell(${params.command})`)
        return shellTool(params, projectRoot)
      }),
    }),
  }
}
