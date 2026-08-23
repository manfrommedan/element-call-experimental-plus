/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from "vitest";
import { MatrixError } from "matrix-js-sdk";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  type LivekitTransportConfig,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";

import type { ResolvedConfigOptions } from "../../../config/ConfigOptions.ts";
import {
  RtcTransportAutoDiscovery,
  type RtcTransportAutoDiscoveryProps,
} from "./RtcTransportAutoDiscovery.ts";

type DiscoveryClient = RtcTransportAutoDiscoveryProps["client"];

const backendTransport: LivekitTransportConfig = {
  type: "livekit",
  livekit_service_url: "https://backend.example.org",
};

const configTransport: LivekitTransportConfig = {
  type: "livekit",
  livekit_service_url: "https://config.example.org",
};

const wellKnownTransport: LivekitTransportConfig = {
  type: "livekit",
  livekit_service_url: "https://well-known.example.org",
};

/**
 * A .well-known fetcher advertising the given transports under the MSC4143 key.
 * With no arguments it advertises nothing, which is the shape the tests that
 * predate the well-known step expect.
 */
function makeWellKnownFetcher(
  transports?: Transport[],
): RtcTransportAutoDiscoveryProps["wellKnownFetcher"] {
  return vi
    .fn()
    .mockResolvedValue(
      transports ? { "org.matrix.msc4143.rtc_foci": transports } : {},
    );
}

function makeClient(): MockedObject<DiscoveryClient> {
  return {
    getDomain: vi.fn().mockReturnValue("example.org"),
    baseUrl: "https://matrix.example.org",
    _unstable_getRTCTransports: vi.fn().mockResolvedValue([]),
    getOpenIdToken: vi.fn(),
    getDeviceId: vi.fn(),
  } as unknown as MockedObject<DiscoveryClient>;
}

function makeResolvedConfig(livekitServiceUrl?: string): ResolvedConfigOptions {
  return {
    livekit: livekitServiceUrl
      ? {
          livekit_service_url: livekitServiceUrl,
        }
      : undefined,
  } as ResolvedConfigOptions;
}

describe("RtcTransportAutoDiscovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  const VALID_TEST_CASES: Array<{ transports: Transport[] }> = [
    { transports: [backendTransport] },
    // will pick the first livekit transport in the list, even if there are other non-livekit transports
    { transports: [{ type: "not_livekit" }, backendTransport] },
  ];
  it.each(VALID_TEST_CASES)(
    "prefers backend transport other app config $transports",
    async ({ transports }) => {
      const client = makeClient();
      client._unstable_getRTCTransports.mockResolvedValue(transports);

      const discovery = new RtcTransportAutoDiscovery({
        client,
        resolvedConfig: makeResolvedConfig(configTransport.livekit_service_url),
        wellKnownFetcher: makeWellKnownFetcher(),
        logger: rootLogger,
      });

      const discoveredTransport = await discovery.discoverPreferredTransport();

      expect(discoveredTransport).toStrictEqual(backendTransport);
      expect(discoveredTransport).not.toStrictEqual(configTransport);

      expect(client._unstable_getRTCTransports).toHaveBeenCalledTimes(1);
    },
  );

  it("Retries limit_exceeded backend transport", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports
      .mockRejectedValueOnce(
        new MatrixError(
          {
            errcode: "M_LIMIT_EXCEEDED",
            error: "Too many requests",
            retry_after_ms: 100,
          },
          429,
        ),
      )
      .mockResolvedValue([backendTransport]);

    const discovery = new RtcTransportAutoDiscovery({
      client,
      resolvedConfig: makeResolvedConfig("https://config.example.org"),
      wellKnownFetcher: makeWellKnownFetcher(),
      logger: rootLogger,
    });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      backendTransport,
    );

    expect(client._unstable_getRTCTransports).toHaveBeenCalledTimes(2);
  });

  const INVALID_TEST_CASES: Array<{ transports: Transport[] }> = [
    { transports: [] },
    { transports: [{ type: "not_livekit" }] },
  ];
  it.each(INVALID_TEST_CASES)(
    "falls back to config when backend has no (valid) livekit transports $transports",
    async ({ transports }) => {
      const client = makeClient();
      client._unstable_getRTCTransports.mockResolvedValue(transports);

      const discovery = new RtcTransportAutoDiscovery({
        client,
        resolvedConfig: makeResolvedConfig(configTransport.livekit_service_url),
        wellKnownFetcher: makeWellKnownFetcher(),
        logger: rootLogger,
      });

      const discoveredTransport = await discovery.discoverPreferredTransport();
      expect(discoveredTransport).not.toStrictEqual(backendTransport);
      expect(discoveredTransport).toStrictEqual(configTransport);
    },
  );

  // The .well-known step is this fork's: upstream dropped it in v0.24.0, which
  // leaves any homeserver that advertises its SFU only there unable to call.
  it("falls back to well-known when the backend has no livekit transport", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports.mockResolvedValue([]);

    const discovery = new RtcTransportAutoDiscovery({
      client,
      resolvedConfig: makeResolvedConfig(configTransport.livekit_service_url),
      wellKnownFetcher: makeWellKnownFetcher([wellKnownTransport]),
      logger: rootLogger,
    });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      wellKnownTransport,
    );
  });

  it("prefers the backend transport over well-known", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports.mockResolvedValue([backendTransport]);

    const discovery = new RtcTransportAutoDiscovery({
      client,
      resolvedConfig: makeResolvedConfig(undefined),
      wellKnownFetcher: makeWellKnownFetcher([wellKnownTransport]),
      logger: rootLogger,
    });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      backendTransport,
    );
  });

  it("skips a well-known that advertises no livekit transport", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports.mockResolvedValue([]);

    const discovery = new RtcTransportAutoDiscovery({
      client,
      resolvedConfig: makeResolvedConfig(configTransport.livekit_service_url),
      wellKnownFetcher: makeWellKnownFetcher([{ type: "not_livekit" }]),
      logger: rootLogger,
    });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      configTransport,
    );
  });

  it("survives a well-known that cannot be fetched", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports.mockResolvedValue([]);

    const discovery = new RtcTransportAutoDiscovery({
      client,
      resolvedConfig: makeResolvedConfig(configTransport.livekit_service_url),
      wellKnownFetcher: vi.fn().mockRejectedValue(new Error("offline")),
      logger: rootLogger,
    });

    await expect(discovery.discoverPreferredTransport()).resolves.toStrictEqual(
      configTransport,
    );
  });

  it("returns null when backend and config are all unavailable", async () => {
    const client = makeClient();
    client._unstable_getRTCTransports.mockResolvedValue([]);

    const discovery = new RtcTransportAutoDiscovery({
      client,
      resolvedConfig: makeResolvedConfig(undefined),
      wellKnownFetcher: makeWellKnownFetcher(),
      logger: rootLogger,
    });

    await expect(discovery.discoverPreferredTransport()).resolves.toBeNull();
  });
});
