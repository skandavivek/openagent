// Topic 6 driver -- see src/compaction.ts for the real mechanism.
// Small threshold on purpose so a handful of short turns actually trigger
// it -- a real conversation would need to fill an entire context window
// first, which isn't practical to demo directly.

import { anthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import { assembleSystemPrompt, type Model } from "../src/system-prompt"
import { createUserMessage, toModelMessages, type HistoryMessage } from "../src/message-history"
import { maybeCompact, approximateSize } from "../src/compaction"

const model: Model = { id: "claude-sonnet-5", providerID: "anthropic" }
const system = assembleSystemPrompt(model, import.meta.dir)
const history: HistoryMessage[] = []
const THRESHOLD = 300 // chars -- tiny on purpose, see header comment

async function turn(userText: string) {
  history.push(createUserMessage(userText))
  const result = await generateText({ model: anthropic(model.id), system, messages: toModelMessages(history) })
  history.push({ role: "assistant", parts: [{ type: "text", text: result.text }] })
  console.log(`user: ${userText}\nassistant: ${result.text}`)

  const before = approximateSize(history)
  console.log(`  [history size] ${before} chars (threshold: ${THRESHOLD})`)
  const compacted = await maybeCompact(history, model.id, THRESHOLD)
  if (compacted) {
    console.log(`  [compaction]   fired -- summarized down to ${approximateSize(history)} chars`)
  }
  console.log()
}

async function main() {
  await turn("My project's codename is Falcon and the deadline is March 3rd. Just acknowledge.")
  await turn("The budget is $12,000. Just acknowledge.")
  await turn("What's the codename, deadline, and budget I told you? Answer in one line.")

  console.log("=".repeat(70))
  console.log(`Final history: ${history.length} entries.`)
  console.log("If the answer above has all three facts right, compaction preserved them")
  console.log("even though the turns that stated them got summarized away.")
}

main()
