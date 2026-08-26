// High-level port of packages/opencode/src/tool/edit.ts (737 lines in the
// real file). What's faithful here: the exact-match algorithm and its exact
// error messages, the "must be unique unless replaceAll" rule, and the
// per-path lock. What's NOT ported (kept as comments, not code, per scope):
//
// - Real edit.ts tries several FALLBACK matchers before giving up on an exact
//   match: whitespace/indentation-normalized matching, and a couple more
//   strategies borrowed from Cline's and Gemini CLI's editors. None of that
//   is reproduced here -- this only does the exact-match path.
// - `isDisproportionateMatch()`: a real safety check that rejects a fuzzy
//   match if it's much larger than oldString (guards against a fallback
//   matcher accidentally swallowing way more text than intended). Not
//   applicable here since there's no fallback matcher to guard.
// - Line-ending normalization (\r\n vs \n) so oldString matches regardless
//   of which the file actually uses. Not handled here.

import { readFileSync, existsSync, writeFileSync } from "fs"
import path from "path"
import { resolveProjectPath } from "./project-path"
import { ask } from "./permission"

// Real edit.ts: a real per-file-path lock so two concurrent `edit` calls to
// the SAME file can't race (both read the old content, both write, second
// one silently clobbers the first). The LLM is explicitly encouraged
// elsewhere to call tools in parallel, so this isn't a hypothetical case.
const locks = new Map<string, Promise<unknown>>()
async function withLock<T>(filepath: string, fn: () => Promise<T>): Promise<T> {
  const prior = locks.get(filepath) ?? Promise.resolve()
  const next = prior.then(fn, fn)
  locks.set(
    filepath,
    next.catch(() => {}),
  )
  return next
}

export interface EditParams {
  filePath: string
  oldString: string
  newString: string
  replaceAll?: boolean
}

// Real edit.ts `replace()` (line 682): exact-match only version.
function replace(content: string, oldString: string, newString: string, replaceAll = false): string {
  if (oldString === newString) {
    throw new Error("No changes to apply: oldString and newString are identical.")
  }
  if (oldString === "") {
    throw new Error(
      "oldString cannot be empty when editing an existing file. Provide the exact text to replace, or use write for an intentional full-file replacement.",
    )
  }

  const count = content.split(oldString).length - 1
  if (count === 0) {
    throw new Error(
      "Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.",
    )
  }
  if (count > 1 && !replaceAll) {
    throw new Error("Found multiple matches for oldString. Provide more surrounding context to make the match unique.")
  }

  return replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString)
}

export async function editTool(params: EditParams, projectRoot: string): Promise<string> {
  const filepath = resolveProjectPath(projectRoot, params.filePath)

  return withLock(filepath, async () => {
    if (!existsSync(filepath)) throw new Error(`File ${filepath} not found`)

    const contentOld = readFileSync(filepath, "utf-8")
    const contentNew = replace(contentOld, params.oldString, params.newString, params.replaceAll)

    const permission = await ask({
      permission: "edit",
      patterns: [path.relative(process.cwd(), filepath)],
      always: ["*"],
      metadata: {},
    })
    if (permission !== "allow") throw new Error(`Permission denied: edit ${filepath}`)

    writeFileSync(filepath, contentNew, "utf-8")
    return "Edit applied successfully."
  })
}
