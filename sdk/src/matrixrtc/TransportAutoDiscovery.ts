/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import { type IClientWellKnown, type MatrixClient } from "matrix-js-sdk";
import { type Transport } from "matrix-js-sdk/lib/matrixrtc";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { doNetworkOperationWithRetry } from "../utils/network";

type TransportDiscoveryClient = Pick<
  MatrixClient,
  "getDomain" | "_unstable_getRTCTransports"
>;

export interface TransportAutoDiscoveryProps {
  client: TransportDiscoveryClient;
  /** The transport type the media backend serves. */
  transportType: string;
  /** A transport to use when the homeserver advertises none of the type. */
  fallbackTransport?: Transport;
  wellKnownFetcher?: (domain: string) => Promise<IClientWellKnown>;
  logger: Logger;
}

export class TransportAutoDiscovery {
  private readonly client: TransportDiscoveryClient;
  private readonly transportType: string;
  private readonly fallbackTransport: Transport | undefined;
  private readonly wellKnownFetcher:
    | ((domain: string) => Promise<IClientWellKnown>)
    | undefined;
  private readonly logger: Logger;

  public constructor({
    client,
    transportType,
    fallbackTransport,
    wellKnownFetcher,
    logger,
  }: TransportAutoDiscoveryProps) {
    this.client = client;
    this.transportType = transportType;
    this.fallbackTransport = fallbackTransport;
    this.wellKnownFetcher = wellKnownFetcher;
    this.logger = logger.getChild("[TransportAutoDiscovery]");
  }

  public async discoverPreferredTransport(): Promise<Transport | null> {
    const backendTransport = await this.tryBackendTransports();
    if (backendTransport) {
      this.logger.info(
        `Found backend transport: ${JSON.stringify(backendTransport)}`,
      );
      return backendTransport;
    }

    const wellKnownTransport = await this.tryWellKnownTransports();
    if (wellKnownTransport) {
      this.logger.info(
        `Found .well-known transport: ${JSON.stringify(wellKnownTransport)}`,
      );
      return wellKnownTransport;
    }

    if (this.fallbackTransport) {
      this.logger.info(
        `Found fallback transport: ${JSON.stringify(this.fallbackTransport)}`,
      );
      return this.fallbackTransport;
    }

    return null;
  }

  private async tryBackendTransports(): Promise<Transport | null> {
    const client = this.client;
    this.logger.info("First try to use getRTCTransports end point ...");
    try {
      const transportList = await doNetworkOperationWithRetry(async () =>
        client._unstable_getRTCTransports(),
      );
      const first = transportList.find(
        (transport) => transport.type === this.transportType,
      );
      if (first) {
        return first;
      } else {
        this.logger.info(
          `No ${this.transportType} transport found in getRTCTransports end point`,
          transportList,
        );
      }
    } catch (ex) {
      this.logger.info(`Failed to use getRTCTransports end point: ${ex}`);
    }
    return null;
  }

  private async tryWellKnownTransports(): Promise<Transport | null> {
    const domain = this.client.getDomain();
    const fetcher = this.wellKnownFetcher;
    if (!domain || !fetcher) return null;

    try {
      const wellKnown = await fetcher(domain);
      const foci = wellKnown["org.matrix.msc4143.rtc_foci"];
      if (!Array.isArray(foci)) return null;
      return (
        foci.find(
          (transport): transport is Transport =>
            typeof transport === "object" &&
            transport !== null &&
            "type" in transport &&
            transport.type === this.transportType,
        ) ?? null
      );
    } catch (ex) {
      this.logger.info(`Failed to read .well-known for ${domain}: ${ex}`);
      return null;
    }
  }
}
