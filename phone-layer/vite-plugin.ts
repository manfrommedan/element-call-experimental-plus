/*
Copyright 2026 manfrommedan (Element X+ phone-layer fork)

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial.
Please see LICENSE files in the repository root for full details.
*/

/**
 * Vite plugin that swaps imports from `<repo>/src/<rel>` to
 * `<repo>/phone-layer/src/<rel>` when a mirror file exists.
 *
 * Activated via the `FORK_PHONE_LAYER=1` env var. When unset, the
 * plugin returns `null` from `resolveId` (a no-op for the resolver
 * pipeline) and the build is byte-equivalent to upstream.
 *
 * The plugin walks `phone-layer/src/` once at config time and caches
 * the set of relative paths that have a fork override. `resolveId`
 * runs at `enforce: "pre"` so it sees imports before any other
 * resolver has had a chance to claim them; we still let Vite do the
 * normal resolution first via `this.resolve(..., { skipSelf: true })`
 * so we can match against the resolved absolute path rather than the
 * raw specifier. That handles relative (`./Foo`), bare-package, and
 * tsconfig-path-mapped imports uniformly.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

export const PHONE_LAYER_ENV = "FORK_PHONE_LAYER";

export interface PhoneLayerOptions {
  /** Project root. Defaults to the repo root inferred from this file. */
  rootDir?: string;
}

/**
 * Walks `dir` recursively and returns the set of paths relative to it.
 * Returns an empty set if `dir` does not exist.
 */
function listMirroredFiles(dir: string): Set<string> {
  if (!existsSync(dir)) return new Set();
  const out = new Set<string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        out.add(relative(dir, full));
      }
    }
  };
  walk(dir);
  return out;
}

export function phoneLayerOverridePlugin(
  options: PhoneLayerOptions = {},
): Plugin | null {
  if (process.env[PHONE_LAYER_ENV] !== "1") return null;

  const rootDir =
    options.rootDir ?? pathResolve(dirname(fileURLToPath(import.meta.url)), "..");
  const srcDir = pathResolve(rootDir, "src");
  const phoneLayerSrcDir = pathResolve(rootDir, "phone-layer/src");
  const mirrors = listMirroredFiles(phoneLayerSrcDir);

  if (mirrors.size === 0) {
    // Plugin requested but nothing to override yet — register a noisy
    // no-op so it shows up in the plugin list during dev.
    return {
      name: "phone-layer-override:empty",
      enforce: "pre",
    };
  }

  return {
    name: "phone-layer-override",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!importer) return null;
      const resolved = await this.resolve(source, importer, {
        skipSelf: true,
      });
      if (!resolved || resolved.external) return null;
      const id = resolved.id.split("?")[0];
      if (!id.startsWith(srcDir + "/")) return null;
      const rel = relative(srcDir, id);
      if (!mirrors.has(rel)) return null;
      return join(phoneLayerSrcDir, rel);
    },
  };
}

/** Glob patterns to add to Vitest's `test.include` in fork mode. */
export function phoneLayerTestIncludes(): readonly string[] {
  return process.env[PHONE_LAYER_ENV] === "1"
    ? ["phone-layer/src/**/*.test.{ts,tsx}"]
    : [];
}
