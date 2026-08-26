// High-level port of packages/opencode/src/tool/shell.ts. What's faithful:
// the real 30,000-char output cap, and the real list of file-modifying
// command names that opencode treats as needing stricter permission
// (packages/opencode/src/tool/shell.ts line ~29, the `FILES` set).
//
// What's NOT ported: real opencode parses the command into a full shell AST
// via tree-sitter (`tree-sitter-bash` / `tree-sitter-powershell`, native/WASM
// parsers) to correctly detect destructive operations buried inside
// pipelines, subshells, command substitution, etc. -- e.g. it can tell that
// `echo $(rm -rf /)` contains an `rm` even though `rm` isn't the first word
// of the command. We deliberately don't pull in a native tree-sitter
// dependency here (see the harness README's Codespace-limitations note), so
// this uses a much simpler heuristic: split on shell control operators
// (&&, ||, ;, |) and check whether the first word of each resulting segment
// is a file-modifying command. Real, but easy to fool -- exactly why the
// real implementation needed a real parser instead.

import { execFile } from "child_process"
import { ask } from "./permission"

const MAX_OUTPUT_LENGTH = 30_000

// Real shell.ts's FILES set (line 29), minus the PowerShell-only aliases.
const FILE_MODIFYING_COMMANDS = new Set(["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown"])

function looksDestructive(command: string): boolean {
  const segments = command.split(/&&|\|\||;|\|/)
  return segments.some((segment) => {
    const firstWord = segment.trim().split(/\s+/)[0]
    return firstWord && FILE_MODIFYING_COMMANDS.has(firstWord)
  })
}

export interface ShellParams {
  command: string
}

export async function shellTool(params: ShellParams, cwd: string): Promise<string> {
  const destructive = looksDestructive(params.command)
  const permission = await ask({
    permission: destructive ? "shell.write" : "shell.read",
    patterns: [params.command],
    always: destructive ? [] : ["*"],
  })
  if (permission !== "allow") throw new Error(`Permission denied: shell "${params.command}"`)

  return new Promise((resolve, reject) => {
    execFile("bash", ["-c", params.command], { cwd, timeout: 30_000 }, (err, stdout, stderr) => {
      const combined = (stdout + stderr).slice(0, MAX_OUTPUT_LENGTH)
      if (err && !stdout && !stderr) return reject(err)
      resolve(combined || "(no output)")
    })
  })
}
