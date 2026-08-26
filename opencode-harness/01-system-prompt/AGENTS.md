# Project instructions (example)

This file stands in for a real project's `AGENTS.md` / `CLAUDE.md`. It's
picked up because `walkUpForInstructions()` in `system-prompt.ts` starts at
`process.cwd()` and walks upward looking for a file with this name -- same
algorithm opencode itself uses (`packages/opencode/src/session/instruction.ts`).

- Prefer TypeScript strict mode.
- Run tests before claiming a change works.
- Never invent a file path -- read the directory first.
