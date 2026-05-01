/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { defineConfig, mergeConfig } from "vite";
import generateFile from "vite-plugin-generate-file";

import fullConfig from "./vite.config";

const base = "./";

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
