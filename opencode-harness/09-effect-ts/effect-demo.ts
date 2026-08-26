// Topic 9: Effect-TS -- real opencode is built entirely on Effect
// (`Effect.gen(function* () {...})`, `Layer`/`Context.Service` for DI,
// tagged errors instead of thrown exceptions). This is orthogonal to topics
// 1-8, not a new pipeline stage: it's a different way to STRUCTURE code you
// already have. To make the comparison concrete, this re-implements topic
// 5's permission check (05-permission-system/) in genuine Effect style.
//
// Standalone on purpose -- unlike topics 1-8, nothing downstream imports
// this, so it lives directly in its own folder rather than src/.
//
// Deviation: real opencode's actual services (`Context.Service` class-based
// helper, `LayerNode`, `serviceUse`) are more elaborate than plain
// `Context.Tag` + `Layer.succeed` used here -- same core idea (a typed,
// swappable dependency), simpler wiring.

import { Effect, Context, Layer, Data } from "effect"

// -- 1. Typed error -- a value in the type signature, not a thrown surprise -
// Compare: topic 5's plain `throw new Error(...)` in tool-*.ts. Nothing in
// TypeScript's type system tells a caller that function can throw. Here,
// PermissionDeniedError is part of checkPermission's actual return type --
// the compiler forces you to acknowledge it exists.
export class PermissionDeniedError extends Data.TaggedError("PermissionDeniedError")<{
  permission: string
}> {}

// -- 2. A service -- swappable via DI, same idea as opencode's real
// Context.Service<Service, Interface>() pattern (see src/permission.ts's
// comment about this being global state instead; this is the "real" shape).
export interface RulesetShape {
  resolve: (permission: string) => "allow" | "deny"
}
export class Ruleset extends Context.Tag("Ruleset")<Ruleset, RulesetShape>() {}

export const permissiveLayer = Layer.succeed(Ruleset, { resolve: () => "allow" })
export const strictLayer = Layer.succeed(Ruleset, {
  resolve: (permission) => (permission === "edit" || permission === "shell.write" ? "deny" : "allow"),
})

// -- 3. Effect.gen -- generator syntax standing in for async/await, but the
// return type Effect<void, PermissionDeniedError, Ruleset> encodes BOTH the
// possible failure AND the required dependency, unlike a plain
// `async function(): Promise<void>` which encodes neither.
function checkPermission(permission: string): Effect.Effect<void, PermissionDeniedError, Ruleset> {
  return Effect.gen(function* () {
    const ruleset = yield* Ruleset
    const action = ruleset.resolve(permission)
    console.log(`  [effect] ${permission} -> ${action}`)
    if (action === "deny") return yield* Effect.fail(new PermissionDeniedError({ permission }))
  })
}

const program = Effect.gen(function* () {
  yield* checkPermission("read")
  console.log("  read allowed -- proceeding")
  yield* checkPermission("edit")
  console.log("  this line never runs if edit was denied -- the yield* above short-circuits the whole generator")
})

async function main() {
  console.log("-- running with the permissive layer --")
  await Effect.runPromise(program.pipe(Effect.provide(permissiveLayer)))

  console.log("\n-- running the SAME program with the strict layer swapped in --")
  const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(strictLayer)))
  console.log(`  Exit: ${exit._tag}`)
  if (exit._tag === "Failure") {
    console.log(`  Typed failure caught, not an uncaught exception: ${JSON.stringify(exit.cause)}`)
  }

  console.log("\nSame program, two different Ruleset layers, same as swapping strictRuleset")
  console.log("in for defaultRuleset in 05-permission-system/ -- but here it's not optional to")
  console.log("handle the failure case, the type system requires it.")
}

main()
