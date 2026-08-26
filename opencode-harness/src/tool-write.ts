// Faithful port of packages/opencode/src/tool/write.ts. Uses the real `diff`
// package's createTwoFilesPatch, the same library opencode itself depends on
// (see opencode's package.json: "diff": "8.0.2") -- this computes a real
// unified diff between old and new content, which is exactly what the
// permission prompt shows the user before the write is allowed to proceed.
// Deviation: no LSP diagnostics pass afterward (out of scope, no LSP here).

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs"
import path from "path"
import { createTwoFilesPatch } from "diff"
import { resolveProjectPath } from "./project-path"
import { ask } from "./permission"

export interface WriteParams {
  filePath: string
  content: string
}

export async function writeTool(params: WriteParams, projectRoot: string): Promise<string> {
  const filepath = resolveProjectPath(projectRoot, params.filePath)
  const exists = existsSync(filepath)
  const contentOld = exists ? readFileSync(filepath, "utf-8") : ""

  const diff = createTwoFilesPatch(filepath, filepath, contentOld, params.content)

  const permission = await ask({
    permission: "edit",
    patterns: [path.relative(process.cwd(), filepath)],
    always: ["*"],
    metadata: { diff },
  })
  if (permission !== "allow") throw new Error(`Permission denied: write ${filepath}`)

  console.log("  [diff]")
  console.log(
    diff
      .split("\n")
      .map((l) => "    " + l)
      .join("\n"),
  )

  mkdirSync(path.dirname(filepath), { recursive: true })
  writeFileSync(filepath, params.content, "utf-8")

  return "Wrote file successfully."
}
