/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// Focused tests for the phone-style 1:1 voice mode signal exposed by
// `CallViewModel`. Lives in its own file so the URL-params mock used here
// (which pretends the host passed `phoneVoiceLayout=true`) doesn't leak
// into the rest of the suite — vitest scopes vi.mock() per test module.

import { afterEach, describe, test, vi } from "vitest";
import { NEVER, type Observable } from "rxjs";
import { type LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import type * as UrlParamsModule from "../../UrlParams";

vi.mock("rxjs", async (importOriginal) => ({
  ...(await importOriginal()),
  // Block interval() so the marble scheduler doesn't loop forever.
  interval: (): Observable<number> => NEVER,
}));
vi.mock("@livekit/components-core");
vi.mock("livekit-client/e2ee-worker?worker");
vi.mock("../../e2ee/matrixKeyProvider");

const getUrlParams = vi.hoisted(() => vi.fn(() => ({})));
// Partial mock: keep every other export from the real module (HeaderStyle,
// UserIntent enum, etc.), only override getUrlParams so we can stub the
// `phoneVoiceLayout` URL flag per test.
vi.mock("../../UrlParams", async (importOriginal) => ({
  ...(await importOriginal<typeof UrlParamsModule>()),
  getUrlParams,
}));

vi.mock("./localMember/LocalTransport", async (importOriginal) => ({
  ...(await importOriginal()),
  makeTransport: async (): Promise<LivekitTransport> =>
    Promise.resolve((await import("../../utils/test")).exampleTransport),
}));

import { initializeWidget } from "../../widget";
initializeWidget();

import { withTestScheduler } from "../../utils/test";
import {
  aliceParticipant,
  aliceRtcMember,
  localRtcMember,
} from "../../utils/test-fixtures";
import { constant } from "../Behavior";
import { withCallViewModel as withCallViewModelInMode } from "./CallViewModelTestUtils";
import { MatrixRTCMode } from "../../config/ConfigOptions";

describe.each([
  [MatrixRTCMode.Legacy],
  [MatrixRTCMode.Compatibility],
  [MatrixRTCMode.Matrix_2_0],
])("phoneVoiceMode (%s mode)", (mode) => {
  const withCallViewModel = withCallViewModelInMode(mode);

  afterEach(() => {
    // Reset the URL-params mock between tests so the flag never bleeds
    // across cases inside this file.
    getUrlParams.mockImplementation(() => ({}));
  });

  test("phoneVoiceMode$ defaults to false when the URL flag is unset", () => {
    withTestScheduler(({ expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
        },
        (vm) => {
          expectObservable(vm.phoneVoiceMode$).toBe("a", { a: false });
        },
      );
    });
  });

  test("phoneVoiceMode$ flips on when phoneVoiceLayout=true and local video is off", () => {
    getUrlParams.mockImplementation(() => ({ phoneVoiceLayout: true }));
    withTestScheduler(({ expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
        },
        (vm) => {
          // mockMuteStates() defaults videoEnabled to false, so phone-voice
          // mode is initially active.
          expectObservable(vm.phoneVoiceMode$).toBe("a", { a: true });
        },
      );
    });
  });

  test("showFooter$ stays on in phone-voice mode, even after tapping the screen", () => {
    getUrlParams.mockImplementation(() => ({ phoneVoiceLayout: true }));
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
          // Phone-sized, so the layout underneath is the edge-to-edge one-on-one one whose
          // controls a tap would normally swallow. A dialer never hides the hang-up button.
          windowSize$: behavior("a", { a: { width: 380, height: 700 } }),
        },
        (vm) => {
          schedule("-t", { t: () => vm.tapScreen() });
          expectObservable(vm.showFooter$).toBe("a", { a: true });
        },
      );
    });
  });
});
