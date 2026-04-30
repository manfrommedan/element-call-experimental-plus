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
 * It is not always possible to start the widget with audio/video unmuted due to privacy concerns.
 * This function encapsulates the logic to determine the appropriate initial state.
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
  isWidgetMode: boolean,
  phoneVoiceLayout: boolean = false,
): { audioEnabled: boolean; videoEnabled: boolean } {
  logger.debug(
    `calculateInitialMuteState: skipLobby=${skipLobby}, callIntent=${callIntent} isWidgetMode=${isWidgetMode} phoneVoiceLayout=${phoneVoiceLayout}`,
  );

  if (skipLobby && !isWidgetMode) {
    // If not in widget mode and lobby is skipped, default to muted to protect user privacy.
    // In the SPA context we don't want to unmute users without giving them a chance to adjust their settings first.
    return {
      audioEnabled: false,
      videoEnabled: false,
    };
  }

  // Embedded contexts are trusted environments, so they allow unmuted by default.
  // Same for when showing a lobby, as users can adjust their settings there.
  // Video starts disabled when the call intent is "audio" or when the host
  // has flagged this as a phone-style voice call.
  const isVoiceCall = callIntent === "audio" || phoneVoiceLayout;
  return {
    audioEnabled: true,
    videoEnabled: !isVoiceCall,
  };
}
