/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Plugin } from "vite";

/**
 * Inlines polyfills for ES features used by the runtime that are missing
 * from older Android system WebViews — most notably the Chromium < 119
 * builds shipped on Huawei devices, where lack of `Promise.withResolvers`
 * causes the bundle to fail at startup and the embedded app falls through
 * to the guest registration page.
 *
 * Kept out of the entry HTML template so the build can stay browser-list
 * driven for the public deployment, with this plugin opting the embedded
 * configuration into a slightly broader compatibility window.
 */
export function legacyWebviewPolyfills(): Plugin {
  const promiseWithResolvers =
    "<script>if(!Promise.withResolvers){Promise.withResolvers=function(){var r,j,p=new Promise(function(a,b){r=a;j=b;});return{promise:p,resolve:r,reject:j};};}</script>";

  return {
    name: "legacy-webview-polyfills",
    enforce: "post",
    transformIndexHtml(html) {
      const anchor = /<script>\s*window\.global\s*=\s*window;\s*<\/script>/;
      if (!anchor.test(html)) {
        // Anchor moved upstream — surface it loudly instead of silently
        // shipping a build without the polyfill.
        throw new Error(
          "[legacy-webview-polyfills] anchor missed in index.html; update the plugin.",
        );
      }
      return html.replace(anchor, (match) => match + promiseWithResolvers);
    },
  };
}
