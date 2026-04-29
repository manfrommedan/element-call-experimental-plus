/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { type Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Inlines polyfills for ES features used by the runtime that are missing from
 * older Android system WebViews — most notably the Chromium < 119 builds
 * shipped on Huawei devices, where lack of `Promise.withResolvers` causes
 * matrix-js-sdk to die at module-evaluation time and the embedded app falls
 * through to the guest registration page on first run.
 *
 * The polyfill code lives in its own ES2015 source file (so it can be
 * version-controlled, syntax-checked, and edited in isolation) and is
 * injected at <head> start through Vite's stable HTML-tag injection API.
 * No coupling to upstream's internal HTML — surviving routine upstream
 * migrations is the whole point of keeping this plugin self-contained.
 */
export function legacyWebviewPolyfills(): Plugin {
  let polyfillCode: string | null = null;

  return {
    name: "legacy-webview-polyfills",
    enforce: "post",
    buildStart() {
      const polyfillPath = resolve(here, "promiseWithResolvers.polyfill.js");
      // Read once per build; surface the read error loudly if the file is
      // ever moved so we can never silently ship a bundle without it.
      polyfillCode = readFileSync(polyfillPath, "utf8");
      this.addWatchFile(polyfillPath);
    },
    transformIndexHtml() {
      if (polyfillCode === null) {
        throw new Error(
          "[legacy-webview-polyfills] polyfill source was not loaded; check buildStart hook.",
        );
      }
      return [
        {
          tag: "script",
          children: polyfillCode,
          injectTo: "head-prepend",
        },
      ];
    },
  };
}
