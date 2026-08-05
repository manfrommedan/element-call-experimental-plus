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
// matrix-js-sdk hardcodes "lifetime": 30000 with no config hook; we patch it
// at bundle time so it survives any pnpm lock update without a patch file.
// The closeBundle guard ensures CI fails loudly if the literal ever disappears.
function phoneVoiceLifetimePlugin(): Plugin {
  let found = false;
  // Matches: "lifetime": 30000   (with optional trailing // comment)
  const PATTERN = /"lifetime"\s*:\s*30000(?:\s*\/\/[^\n]*)*/g;
  const REPLACEMENT =
    '"lifetime": (typeof window!=="undefined"&&window.location&&' +
    'window.location.hash.indexOf("phoneVoiceLayout=true")!==-1)?60000:30000';
  return {
    name: "phone-voice-lifetime",
    renderChunk(code: string) {
      if (!PATTERN.test(code)) return null;
      found = true;
      PATTERN.lastIndex = 0;
      return { code: code.replace(PATTERN, REPLACEMENT), map: null };
    },
    closeBundle() {
      if (!found) {
        throw new Error(
          '[phone-voice-lifetime] "lifetime":30000 not found in bundle — ' +
            "matrix-js-sdk was bumped; update the lifetime transform in vite-embedded.config.ts",
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
