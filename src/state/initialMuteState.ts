/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { type RTCCallIntent } from "matrix-js-sdk/lib/matrixrtc";

/**
 * Calculates the initial mute state for media devices based on configuration.
 *
 * It is not always possible to start the call with audio/video unmuted due to
 * privacy concerns. This function encapsulates the logic to determine the
 * appropriate initial state.
 *
 * @param allowJoinUnmutedViaIntent Whether the host vouches for the intent
 *   enough to start the user unmuted without a lobby (see
 *   `HostBridge.allowJoinUnmutedViaIntent`).
 *
 * `phoneVoiceLayout` is a host-supplied flag (Element X's "Phone-style voice
 * calls" Labs option) used as an override for `callIntent`: when set, the call
 * is treated as voice regardless of whether the host could express that
 * through `callIntent`. This is needed for group voice calls because the
 * upstream Rust SDK does not yet expose `JOIN_EXISTING_VOICE` /
 * `START_CALL_VOICE` intent variants, so the host has no way to communicate
 * "group voice" through `callIntent` alone.
 */
export function calculateInitialMuteState(
  skipLobby: boolean,
  callIntent: RTCCallIntent | undefined,
  allowJoinUnmutedViaIntent: boolean,
  phoneVoiceLayout: boolean = false,
): { audioEnabled: boolean; videoEnabled: boolean } {
  logger.debug(
    `calculateInitialMuteState: skipLobby=${skipLobby}, callIntent=${callIntent} allowJoinUnmutedViaIntent=${allowJoinUnmutedViaIntent} phoneVoiceLayout=${phoneVoiceLayout}`,
  );

  if (skipLobby && !allowJoinUnmutedViaIntent) {
    // The lobby is skipped, so the user gets no chance to adjust their devices
    // before joining, and nobody has vouched for the intent: default to muted
    // to protect their privacy.
    return {
      audioEnabled: false,
      videoEnabled: false,
    };
  }

  // A host that vouches for the intent is a trusted environment, so it allows
  // unmuted by default. Same for when showing a lobby, as users can adjust
  // their settings there. Video starts disabled when the call intent is
  // "audio" or when the host has flagged this as a phone-style voice call.
  return {
    audioEnabled: true,
    videoEnabled: callIntent != "audio" && !phoneVoiceLayout,
  };
}
