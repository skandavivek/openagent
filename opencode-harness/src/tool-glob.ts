// Faithful port of packages/opencode/src/tool/glob.ts + core/src/ripgrep.ts's
// `glob` method: real opencode's glob tool is ALSO ripgrep-backed (`rg --files
// --glob=<pattern>`), not a separate globbing library. Same real binary as grep.

import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import { resolveProjectPath } from "./project-path"
import { ask } from "./permission"

const run = promisify(execFile)
const LIMIT = 100

export interface GlobParams {
  pattern: string
  path?: string
}

export async function globTool(params: GlobParams, projectRoot: string): Promise<string> {
  const permission = await ask({ permission: "glob", patterns: [params.pattern], always: ["*"] })
  if (permission !== "allow") throw new Error(`Permission denied: glob ${params.pattern}`)

  const cwd = params.path ? resolveProjectPath(projectRoot, params.path) : projectRoot
  const args = ["--no-config", "--files", `--glob=${params.pattern}`, "--glob=!**/.git/**", "."]

  let stdout = ""
  try {
    const result = await run("rg", args, { cwd })
    stdout = result.stdout
  } catch (err: any) {
    if (err.code === 1) stdout = "" // no files matched
    else if (err.code === "ENOENT") {
      throw new Error("ripgrep (`rg`) is not installed -- required for glob, same binary as grep.")
    } else throw err
  }

  const files = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/^(?:\.[\\/])+/, ""))
    .slice(0, LIMIT)

  if (files.length === 0) return "No files found"

  const output = files.map((f) => path.resolve(cwd, f))
  if (files.length === LIMIT) {
    output.push("", `(Results truncated: showing first ${LIMIT} results. Consider a more specific pattern.)`)
  }
  return output.join("\n")
}
