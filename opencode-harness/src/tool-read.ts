// Faithful port of packages/opencode/src/tool/read.ts's real algorithm and
// output format. Deviations: no LSP warm-up, no image/PDF base64 attachment
// path (out of scope for a text-tool demo), no Effect Schema (plain checks) --
// everything else (caps, output shape, binary detection, fuzzy miss) is real.

import { readFileSync, statSync, readdirSync, existsSync } from "fs"
import path from "path"
import { resolveProjectPath } from "./project-path"
import { ask } from "./permission"

const DEFAULT_READ_LIMIT = 2000
const MAX_LINE_LENGTH = 2000
const MAX_BYTES = 50 * 1024

const BINARY_EXTENSIONS = new Set([
  ".zip", ".tar", ".gz", ".exe", ".dll", ".so", ".class", ".jar", ".war", ".7z",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".bin", ".dat", ".obj",
  ".o", ".a", ".lib", ".wasm", ".pyc", ".pyo",
])

// Real read.ts: extension blocklist, then a non-printable-byte-ratio heuristic
// over a sample of the file.
function isBinaryFile(filepath: string, sample: Buffer): boolean {
  if (BINARY_EXTENSIONS.has(path.extname(filepath).toLowerCase())) return true
  if (sample.length === 0) return false
  let nonPrintable = 0
  for (const byte of sample) {
    if (byte === 0) return true
    if (byte < 9 || (byte > 13 && byte < 32)) nonPrintable++
  }
  return nonPrintable / sample.length > 0.3
}

// Real read.ts: fuzzy substring match against sibling filenames when the
// exact path isn't found ("Did you mean one of these?").
function missMessage(filepath: string): string {
  const dir = path.dirname(filepath)
  const base = path.basename(filepath).toLowerCase()
  let suggestions: string[] = []
  try {
    suggestions = readdirSync(dir)
      .filter((item) => item.toLowerCase().includes(base) || base.includes(item.toLowerCase()))
      .map((item) => path.join(dir, item))
      .slice(0, 3)
  } catch {
    /* directory doesn't exist either */
  }
  if (suggestions.length > 0) {
    return `File not found: ${filepath}\n\nDid you mean one of these?\n${suggestions.join("\n")}`
  }
  return `File not found: ${filepath}`
}

export interface ReadParams {
  filePath: string
  offset?: number
  limit?: number
}

export async function readTool(params: ReadParams, projectRoot: string): Promise<string> {
  const filepath = resolveProjectPath(projectRoot, params.filePath)
  const permission = await ask({ permission: "read", patterns: [path.relative(process.cwd(), filepath)], always: ["*"] })
  if (permission !== "allow") throw new Error(`Permission denied: read ${filepath}`)

  if (!existsSync(filepath)) throw new Error(missMessage(filepath))
  const stat = statSync(filepath)

  if (stat.isDirectory()) {
    const items = readdirSync(filepath, { withFileTypes: true })
      .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
      .sort((a, b) => a.localeCompare(b))
    const offset = params.offset || 1
    const limit = params.limit ?? DEFAULT_READ_LIMIT
    const sliced = items.slice(offset - 1, offset - 1 + limit)
    const truncated = offset - 1 + sliced.length < items.length
    return [
      `<path>${filepath}</path>`,
      `<type>directory</type>`,
      `<entries>`,
      sliced.join("\n"),
      truncated
        ? `\n(Showing ${sliced.length} of ${items.length} entries. Use 'offset' to continue.)`
        : `\n(${items.length} entries)`,
      `</entries>`,
    ].join("\n")
  }

  // Real read.ts samples the first 4KB to sniff binary/image/PDF before
  // committing to a full text read.
  const fd = readFileSync(filepath)
  const sample = fd.subarray(0, Math.min(4096, fd.length))
  if (isBinaryFile(filepath, sample)) throw new Error(`Cannot read binary file: ${filepath}`)

  const allLines = fd.toString("utf-8").split("\n")
  const offset = params.offset || 1
  const limit = params.limit ?? DEFAULT_READ_LIMIT
  const start = offset - 1
  if (start > allLines.length && !(allLines.length === 0 && offset === 1)) {
    throw new Error(`Offset ${offset} is out of range for this file (${allLines.length} lines)`)
  }

  const raw: string[] = []
  let bytes = 0
  let cut = false
  let more = false
  for (let i = start; i < allLines.length; i++) {
    if (raw.length >= limit) {
      more = true
      break
    }
    const line = allLines[i].length > MAX_LINE_LENGTH ? allLines[i].slice(0, MAX_LINE_LENGTH) + "... (line truncated)" : allLines[i]
    const size = Buffer.byteLength(line, "utf-8") + (raw.length > 0 ? 1 : 0)
    if (bytes + size > MAX_BYTES) {
      cut = true
      more = true
      break
    }
    raw.push(line)
    bytes += size
  }

  let output = [`<path>${filepath}</path>`, `<type>file</type>`, "<content>\n"].join("\n")
  output += raw.map((line, i) => `${i + offset}: ${line}`).join("\n")
  const last = offset + raw.length - 1
  if (cut) {
    output += `\n\n(Output capped at ${MAX_BYTES / 1024} KB. Showing lines ${offset}-${last}. Use offset=${last + 1} to continue.)`
  } else if (more) {
    output += `\n\n(Showing lines ${offset}-${last} of ${allLines.length}. Use offset=${last + 1} to continue.)`
  } else {
    output += `\n\n(End of file - total ${allLines.length} lines)`
  }
  output += "\n</content>"
  return output
}
