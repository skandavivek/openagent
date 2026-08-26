// Topic 8: Persistence -- real Drizzle ORM + real SQLite (via Bun's built-in
// `bun:sqlite` driver, which is genuinely one of opencode's own real,
// supported drivers -- packages/opencode/src/storage/db.bun.ts -- not a
// stand-in). Real opencode's actual schema (packages/core/src/session/
// sql.ts) has SessionTable + PartTable with many more columns (cost/token
// counters, project association, parent/child session links for sub-agents).
// This is a trimmed two-table version of the same idea: sessions + messages,
// messages storing `parts` as JSON (matching HistoryMessage from topic 3).
//
// Deviation: no drizzle-kit migration tooling -- schema is bootstrapped with
// a plain CREATE TABLE IF NOT EXISTS instead of a migration file. Fine for a
// two-table demo; a real project maintains schema changes as migrations.

import { Database } from "bun:sqlite"
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { eq } from "drizzle-orm"
import type { HistoryMessage } from "./message-history"

export const sessionsTable = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
})

export const messagesTable = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  parts: text("parts").notNull(), // JSON.stringify(HistoryPart[])
  createdAt: integer("created_at").notNull(),
})

export function openDb(path: string): BunSQLiteDatabase {
  const sqlite = new Database(path)
  const db = drizzle(sqlite)
  db.run(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)`)
  db.run(
    `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, parts TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  )
  return db
}

export function ensureSession(db: BunSQLiteDatabase, sessionId: string): void {
  const existing = db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId)).all()
  if (existing.length === 0) db.insert(sessionsTable).values({ id: sessionId, createdAt: Date.now() }).run()
}

export function saveMessage(db: BunSQLiteDatabase, sessionId: string, msg: HistoryMessage): void {
  db.insert(messagesTable)
    .values({ sessionId, role: msg.role, parts: JSON.stringify(msg.parts), createdAt: Date.now() })
    .run()
}

export function loadHistory(db: BunSQLiteDatabase, sessionId: string): HistoryMessage[] {
  const rows = db.select().from(messagesTable).where(eq(messagesTable.sessionId, sessionId)).all()
  return rows.map((r) => ({ role: r.role as HistoryMessage["role"], parts: JSON.parse(r.parts) }))
}
