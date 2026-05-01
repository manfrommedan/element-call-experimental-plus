/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { type RTCCallIntent } from "matrix-js-sdk/lib/matrixrtc";

// phoneVoiceLayout overrides callIntent because the Rust SDK has no
// JOIN_EXISTING_VOICE / START_CALL_VOICE variants yet, so group voice calls
// can't be expressed through callIntent alone.
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
