// Topic 1 driver -- demonstrates src/system-prompt.ts's assembleSystemPrompt()
// in isolation (no LLM call yet). See src/system-prompt.ts for the real
// implementation and its fidelity notes against opencode's actual source.

import { assembleSystemPrompt, type Model } from "../src/system-prompt"

const model: Model = { id: "claude-sonnet-5", providerID: "anthropic" }
const prompt = assembleSystemPrompt(model, import.meta.dir) // this folder's own AGENTS.md

console.log("=".repeat(70))
console.log("ASSEMBLED SYSTEM PROMPT (sent once, unchanged for the whole session)")
console.log("=".repeat(70))
console.log(prompt)
console.log("=".repeat(70))
console.log(`\n${prompt.length} chars. Note what's NOT here: no user message.`)
console.log("That goes into message history instead -- see 03-message-history/.")
