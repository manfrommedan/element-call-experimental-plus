/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PROMISE_PROTOTYPE = Promise;

/**
 * Re-executes the polyfill module body. vitest caches imports across
 * tests; resetting the registry first lets each test stub the runtime
 * however it likes and observe the polyfill installing (or not).
 */
async function installPolyfill(): Promise<void> {
  vi.resetModules();
  await import("./promiseWithResolvers");
}

describe("Promise.withResolvers polyfill", () => {
  let nativeWithResolvers: PromiseConstructor["withResolvers"] | undefined;

  beforeEach(() => {
    nativeWithResolvers = PROMISE_PROTOTYPE.withResolvers;
  });

  afterEach(() => {
    if (nativeWithResolvers !== undefined) {
      Object.defineProperty(PROMISE_PROTOTYPE, "withResolvers", {
        configurable: true,
        writable: true,
        value: nativeWithResolvers,
      });
    } else {
      delete (PROMISE_PROTOTYPE as { withResolvers?: unknown }).withResolvers;
    }
  });

  it("installs the helper when the runtime is missing it", async () => {
    delete (PROMISE_PROTOTYPE as { withResolvers?: unknown }).withResolvers;
    await installPolyfill();
    expect(typeof Promise.withResolvers).toBe("function");
  });

  it("returns an object whose promise resolves with the resolver value", async () => {
    delete (PROMISE_PROTOTYPE as { withResolvers?: unknown }).withResolvers;
    await installPolyfill();

    const { promise, resolve } = Promise.withResolvers<string>();
    resolve("hello");
    await expect(promise).resolves.toBe("hello");
  });

  it("returns an object whose promise rejects with the reject reason", async () => {
    delete (PROMISE_PROTOTYPE as { withResolvers?: unknown }).withResolvers;
    await installPolyfill();

    const { promise, reject } = Promise.withResolvers<string>();
    const reason = new Error("nope");
    reject(reason);
    await expect(promise).rejects.toBe(reason);
  });

  it("leaves a native implementation untouched", async () => {
    const sentinel = (): unknown => ({ promise: null, resolve: null, reject: null });
    Object.defineProperty(PROMISE_PROTOTYPE, "withResolvers", {
      configurable: true,
      writable: true,
      value: sentinel,
    });
    await installPolyfill();
    expect(Promise.withResolvers).toBe(sentinel);
  });
});
