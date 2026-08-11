/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { type FC } from "react";

// Importing the module installs window.controls, which is what the hook talks to.
import "../controls";
import { useOutgoingRingback } from "./VoiceFooter";

const Ringing: FC<{ active: boolean }> = ({ active }) => {
  useOutgoingRingback(active);
  return null;
};

describe("outgoing ringback", () => {
  let audioContext: { close: () => Promise<void>; resume: () => Promise<void> };

  beforeEach(() => {
    audioContext = {
      close: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
    };
    window.AudioContext = vi.fn(function AudioContextStub(this: object) {
      return audioContext;
    }) as unknown as typeof AudioContext;
  });

  afterEach(() => {
    delete window.controls.onRingingChanged;
  });

  test("is handed to the host when the host can play it", () => {
    const onRingingChanged = vi.fn();
    window.controls.onRingingChanged = onRingingChanged;

    const { rerender, unmount } = render(<Ringing active={true} />);
    expect(onRingingChanged).toHaveBeenLastCalledWith(true);
    // No audio context of our own: the host plays call audio, which lands on the right route.
    expect(window.AudioContext).not.toHaveBeenCalled();

    rerender(<Ringing active={false} />);
    expect(onRingingChanged).toHaveBeenLastCalledWith(false);

    unmount();
    expect(onRingingChanged).toHaveBeenLastCalledWith(false);
  });

  test("is played here when the host cannot", () => {
    render(<Ringing active={true} />);
    expect(window.AudioContext).toHaveBeenCalled();
  });
});
