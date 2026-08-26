// Topic 8 driver -- see src/db.ts for the real schema/queries.
// Runs 2 turns, persisting every message to real SQLite as it happens (not
// just an in-memory array). Then opens a BRAND NEW db handle on the same
// file -- simulating a process restart -- reloads history purely from disk,
// and makes a 3rd call proving the reloaded rows are what the model actually
// sees, not something still held in a JS variable from before.

import { unlinkSync, existsSync } from "fs"
import { anthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import { assembleSystemPrompt, type Model } from "../src/system-prompt"
import { createUserMessage, toModelMessages } from "../src/message-history"
import { openDb, ensureSession, saveMessage, loadHistory } from "../src/db"

const DB_PATH = `${import.meta.dir}/session.db`
const SESSION_ID = "demo-session-1"
const model: Model = { id: "claude-sonnet-5", providerID: "anthropic" }
const system = assembleSystemPrompt(model, import.meta.dir)

if (existsSync(DB_PATH)) unlinkSync(DB_PATH) // clean slate each demo run

async function main() {
  console.log(`DB file: ${DB_PATH}\n`)

  // -- "process 1": two turns, persisted as they happen ----------------------
  let db = openDb(DB_PATH)
  ensureSession(db, SESSION_ID)

  for (const userText of [
    "My favorite color is teal. Just acknowledge.",
    "My pet's name is Waffles. Just acknowledge.",
  ]) {
    const userMsg = createUserMessage(userText)
    saveMessage(db, SESSION_ID, userMsg)
    const history = loadHistory(db, SESSION_ID)
    const result = await generateText({ model: anthropic(model.id), system, messages: toModelMessages(history) })
    saveMessage(db, SESSION_ID, { role: "assistant", parts: [{ type: "text", text: result.text }] })
    console.log(`user: ${userText}\nassistant: ${result.text}\n`)
  }

  console.log("-- simulating a process restart: new db handle, same file --\n")

  // -- "process 2": fresh handle, nothing held in memory from process 1 -----
  db = openDb(DB_PATH)
  const reloadedHistory = loadHistory(db, SESSION_ID)
  console.log(`Reloaded ${reloadedHistory.length} messages from disk (0 held in memory from before).`)

  const finalMsg = createUserMessage("What's my favorite color and my pet's name? One line.")
  reloadedHistory.push(finalMsg)
  const result = await generateText({
    model: anthropic(model.id),
    system,
    messages: toModelMessages(reloadedHistory),
  })
  console.log(`\nuser: ${finalMsg.parts[0].type === "text" ? finalMsg.parts[0].text : ""}`)
  console.log(`assistant: ${result.text}`)
}

main()
