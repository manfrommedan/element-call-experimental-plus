/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Polyfill for Promise.withResolvers (ES2024) for Android system WebViews
 * older than Chromium 119 — most notably the build shipped on older Huawei
 * devices. Without this, matrix-js-sdk evaluates its top-level use of the
 * helper before any application code can polyfill it, and the bundle dies
 * during boot.
 *
 * Authored as a standalone ES2015 script so it can be injected into the
 * embedded entry HTML at <head> start, where it runs before any module
 * graph evaluation regardless of how the upstream entry chunk is wired.
 */
(function () {
  if (typeof Promise === "undefined" || typeof Promise.withResolvers === "function") {
    return;
  }
  Object.defineProperty(Promise, "withResolvers", {
    configurable: true,
    writable: true,
    value: function () {
      var resolve;
      var reject;
      var promise = new Promise(function (resolveFn, rejectFn) {
        resolve = resolveFn;
        reject = rejectFn;
      });
      return { promise: promise, resolve: resolve, reject: reject };
    },
  });
})();
