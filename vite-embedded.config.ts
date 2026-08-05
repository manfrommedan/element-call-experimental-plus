/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig, mergeConfig, type Plugin } from "vite";
import generateFile from "vite-plugin-generate-file";

import fullConfig from "./vite.config";

const base = "./";

// Extends phone-voice calls to 60 s ring timeout when phoneVoiceLayout=true.
// matrix-js-sdk hardcodes the ring notification lifetime at 30 s with no config
// hook, so we rewrite the literal at bundle time instead of carrying a patch
// file, which pnpm refuses to pin against a git dependency.
//
// The key may or may not be quoted and the number may be minified to 3e4, so
// the pattern covers both. closeBundle fails the build unless exactly one site
// was rewritten: zero means the sdk moved the literal, more than one means it
// is no longer unambiguous and the anchor needs revisiting.
function phoneVoiceLifetimePlugin(): Plugin {
  let hits = 0;
  const PATTERN = /(["']?lifetime["']?\s*:\s*)(?:30000|3e4)\b/g;
  const REPLACEMENT =
    '$1(typeof window!=="undefined"&&window.location&&' +
    'window.location.hash.indexOf("phoneVoiceLayout=true")!==-1?60000:30000)';
  return {
    name: "phone-voice-lifetime",
    renderChunk(code: string) {
      const matches = code.match(PATTERN);
      if (!matches) return null;
      hits += matches.length;
      return { code: code.replace(PATTERN, REPLACEMENT), map: null };
    },
    closeBundle() {
      if (hits !== 1) {
        throw new Error(
          `[phone-voice-lifetime] expected one 30s lifetime literal, found ${hits} — ` +
            "matrix-js-sdk changed shape; revisit the transform in vite-embedded.config.ts",
        );
      }
    },
  };
}

// Config for embedded deployments (possibly hosted under a non-root path)
export default defineConfig((env) =>
  mergeConfig(
    fullConfig({ ...env, packageType: "embedded" }),
    defineConfig({
      base, // Use relative URLs to allow the app to be hosted under any path
      publicDir: false, // Don't serve the public directory which only contains the favicon
      build: {
        // Source maps are not useful inside the embedded WebView (no
        // devtools at runtime) and account for ~17 MB of dead weight in
        // the host APK. Drop them for embedded builds; the dev SPA build
        // keeps sourcemap=true through the parent config so local
        // debugging is unaffected.
        sourcemap: false,
      },
      plugins: [
        phoneVoiceLifetimePlugin(),
        generateFile([
          {
            type: "json",
            output: "./config.json",
            data: {
              matrix_rtc_session: {
                wait_for_key_rotation_ms: 5000,
                delayed_leave_event_restart_ms: 4000,
                delayed_leave_event_delay_ms: 18000,
              },
            },
          },
        ]),
      ],
    }),
  ),
);
