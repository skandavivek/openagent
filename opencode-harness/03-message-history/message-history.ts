// Topic 3 driver -- see src/message-history.ts for the real implementation.
//
// Demonstrates the actual teaching point: conversational state lives in the
// growing message history, NOT the system prompt (which stays byte-for-byte
// identical across both calls below). Two real Claude calls, same system
// prompt both times, history is what carries "42" from turn 1 to turn 2.

import { anthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import { assembleSystemPrompt, type Model } from "../src/system-prompt"
import { createUserMessage, toModelMessages, type HistoryMessage } from "../src/message-history"

const model: Model = { id: "claude-sonnet-5", providerID: "anthropic" }
const system = assembleSystemPrompt(model, import.meta.dir)
const history: HistoryMessage[] = []

async function turn(userText: string) {
  history.push(createUserMessage(userText))
  console.log(`user: ${userText}`)

  const result = await generateText({
    model: anthropic(model.id),
    system, // identical both turns -- watch it never change
    messages: toModelMessages(history),
  })

  history.push({ role: "assistant", parts: [{ type: "text", text: result.text }] })
  console.log(`assistant: ${result.text}\n`)
}

async function main() {
  await turn("My favorite number is 42. Just acknowledge it, nothing else.")
  await turn("What's my favorite number? Answer with just the number.")

  console.log("=".repeat(70))
  console.log(`Final history: ${history.length} messages, system prompt unchanged (${system.length} chars both calls)`)
  console.log("The model answered turn 2 correctly because '42' is in messages[], not because system changed.")
}

main()
