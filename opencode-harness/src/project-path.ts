// Faithful to how real opencode actually scopes tools: relative paths
// resolve against `instance.directory` (the project you opened), absolute
// paths are used as given, and touching something OUTSIDE that directory is
// not blocked -- assertExternalDirectoryEffect() just routes it through
// ctx.ask() so the user gets prompted. There is no extra "sandbox" boundary
// in real opencode, so there isn't one here either. Root-agnostic: each
// topic's driver script passes its own project root (its own "project/"
// sample directory) rather than this file hardcoding one.

import path from "path"

export function resolveProjectPath(projectRoot: string, requested: string): string {
  return path.isAbsolute(requested) ? requested : path.resolve(projectRoot, requested)
}

export function isOutsideProject(projectRoot: string, resolved: string): boolean {
  return resolved !== projectRoot && !resolved.startsWith(projectRoot + path.sep)
}
