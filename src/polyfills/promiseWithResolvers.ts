/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Polyfill for `Promise.withResolvers` (ES2024) for Android system WebViews
 * older than Chromium 119 — most notably the build shipped on older Huawei
 * devices, where the bundle would otherwise die at module-evaluation time
 * because matrix-js-sdk reaches for the helper from its top-level code.
 *
 * Authored as a side-effect module so the entry can `import "./polyfills/..."`
 * before pulling in matrix-js-sdk; ESM's depth-first evaluation order
 * guarantees this body runs before any consumer body has a chance to call
 * `Promise.withResolvers` for the first time.
 */
if (typeof Promise !== "undefined" && typeof Promise.withResolvers !== "function") {
  Object.defineProperty(Promise, "withResolvers", {
    configurable: true,
    writable: true,
    value: function withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    } {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
  });
}

// Side-effect-only module: explicit empty export pins TypeScript's view of
// this file as a module rather than a global script.
export {};
