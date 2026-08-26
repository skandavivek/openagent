// Faithful port of packages/opencode/src/tool/grep.ts + core/src/ripgrep.ts.
// Real opencode shells out to the actual `rg` binary with these exact flags
// (--json --hidden --no-messages, glob-excluding .git) -- this does the same,
// not a JS regex reimplementation. Requires ripgrep installed (the devcontainer
// needs `apt-get install ripgrep` -- it's not in the base python:3.11 image).

import path from "path"
import { statSync } from "fs"
import { execFile } from "child_process"
import { promisify } from "util"
import { resolveProjectPath } from "./project-path"
import { ask } from "./permission"

const run = promisify(execFile)
const LIMIT = 100

export interface GrepParams {
  pattern: string
  path?: string
  include?: string
}

export async function grepTool(params: GrepParams, projectRoot: string): Promise<string> {
  const permission = await ask({ permission: "grep", patterns: [params.pattern], always: ["*"] })
  if (permission !== "allow") throw new Error(`Permission denied: grep ${params.pattern}`)

  // Real grep.ts: `path` can be a file OR a directory -- ripgrep's cwd must
  // be a directory, so a file path resolves to its parent dir instead
  // (this was missed in the first port and surfaced as a real ENOTDIR crash
  // the first time a model passed a file path here).
  const requested = params.path ? resolveProjectPath(projectRoot, params.path) : projectRoot
  let cwd = requested
  try {
    if (!statSync(requested).isDirectory()) cwd = path.dirname(requested)
  } catch {
    /* path doesn't exist yet -- let ripgrep report that */
  }
  const args = [
    "--no-config",
    "--json",
    "--hidden",
    "--no-messages",
    ...(params.include ? [`--glob=${params.include}`] : []),
    "--glob=!**/.git/**",
    "--",
    params.pattern,
    ".",
  ]

  let stdout = ""
  try {
    const result = await run("rg", args, { cwd })
    stdout = result.stdout
  } catch (err: any) {
    // rg exits 1 for "no matches" -- that's success, not an error, same as real opencode
    if (err.code === 1) return "No files found"
    if (err.code === "ENOENT") {
      throw new Error(
        "ripgrep (`rg`) is not installed. Real opencode's grep/glob tools require it -- " +
          "this demo shells out to the real binary rather than faking it in JS.",
      )
    }
    throw err
  }

  const rows: { path: string; line: number; text: string }[] = []
  for (const line of stdout.split("\n")) {
    if (!line) continue
    const json = JSON.parse(line)
    if (json.type !== "match") continue
    rows.push({
      path: path.resolve(cwd, json.data.path.text),
      line: json.data.line_number,
      text: json.data.lines.text.replace(/\n$/, ""),
    })
    if (rows.length >= LIMIT) break
  }

  if (rows.length === 0) return "No files found"

  const output = [`Found ${rows.length} matches${rows.length === LIMIT ? " (more matches available)" : ""}`]
  let current = ""
  for (const row of rows) {
    if (current !== row.path) {
      if (current !== "") output.push("")
      current = row.path
      output.push(`${row.path}:`)
    }
    output.push(`  Line ${row.line}: ${row.text}`)
  }
  return output.join("\n")
}
