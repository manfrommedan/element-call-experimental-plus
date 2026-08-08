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
import {
  combineLatest,
  distinctUntilChanged,
  map,
  NEVER,
  of,
  switchMap,
  type Observable,
} from "rxjs";
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
  alice,
  aliceId,
  aliceParticipant,
  aliceRtcMember,
  aliceUserId,
  local,
  localId,
  localRtcMember,
} from "../../utils/test-fixtures";
import { constant } from "../Behavior";
import { withCallViewModel as withCallViewModelInMode } from "./CallViewModelTestUtils";
import { MatrixRTCMode } from "../../config/ConfigOptions";
import { type Layout } from "../layout-types";
import { MatrixRTCSessionEvent } from "matrix-js-sdk/lib/matrixrtc";
import { type CallNotificationWrapper } from "./CallNotificationLifecycle";

// The same stand-in the other CallViewModel tests keep locally; there is no shared one.
function mockRingEvent(
  eventId: string,
  lifetimeMs: number,
): CallNotificationWrapper {
  return {
    event_id: eventId,
    lifetime: lifetimeMs,
    notification_type: "ring",
    sender: local.userId,
  } as unknown as CallNotificationWrapper;
}

// Who ends up where, as a line of text: marble assertions compare by deep equality, and a
// string says which tile held whom more plainly than a nest of arrays does.
function places$(layout$: Observable<Layout>): Observable<string> {
  return layout$.pipe(
    switchMap((l) =>
      l.type === "spotlight-landscape"
        ? combineLatest(
            [l.spotlight.media$, ...l.grid.map((vm) => vm.media$)],
            (spotlight, ...grid) =>
              `big: ${spotlight.map((vm) => vm.id).join(", ")} | column: ${grid
                .map((vm) => vm.id)
                .join(", ")}`,
          )
        : of(l.type),
    ),
    // Identical repeats within a frame are combineLatest catching up, not anything that
    // reaches the screen.
    distinctUntilChanged(),
  );
}

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

  test("the layout switch appears once the phone is on its side, and not before", () => {
    getUrlParams.mockImplementation(() => ({ phoneVoiceLayout: true }));
    withTestScheduler(({ behavior, expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
          // Upright first, then turned on its side.
          windowSize$: behavior("ab", {
            a: { width: 360, height: 800 },
            b: { width: 800, height: 360 },
          }),
        },
        (vm) => {
          // Upright the switch has one answer, and a control with one answer is only in
          // the way; on its side there is room for the tiles it chooses.
          expectObservable(
            vm.layoutSwitchVm$.pipe(map((switchVm) => switchVm !== null)),
          ).toBe("ab", { a: false, b: true });
        },
      );
    });
  });

  test("turning the phone on its side gives Element Call's own tiles, not a grid", () => {
    getUrlParams.mockImplementation(() => ({ phoneVoiceLayout: true }));
    withTestScheduler(({ behavior, expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
          windowSize$: behavior("ab", {
            a: { width: 360, height: 800 },
            b: { width: 800, height: 360 },
          }),
        },
        (vm) => {
          // A "grid" here would be the bug it replaced: in a call of two it collapses to one
          // tile, and that tile is your own. The speaker-plus-column layout keeps the other
          // person in the big tile where you can see who you are talking to.
          // distinctUntilChanged because the turn passes through the old layout once more
          // within the same frame as combineLatest catches up on the new window size. That
          // is a repeat of what was already on screen, not a flicker anyone can see.
          expectObservable(
            vm.layout$.pipe(
              map((l) => l.type),
              distinctUntilChanged(),
            ),
          ).toBe("ab", {
            a: "phone-voice",
            b: "spotlight-landscape",
          });
        },
      );
    });
  });

  test("the tiles put the other person in the spotlight and you in the column", () => {
    getUrlParams.mockImplementation(() => ({ phoneVoiceLayout: true }));
    withTestScheduler(({ behavior, expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
          windowSize$: behavior("a", { a: { width: 800, height: 360 } }),
        },
        (vm) => {
          expectObservable(places$(vm.layout$)).toBe("a", {
            // ":0" is the tile index each media view model carries.
            a: `big: ${aliceId}:0 | column: ${localId}:0`,
          });
        },
      );
    });
  });

  test("the tiles show who is being rung, not yourself", () => {
    getUrlParams.mockImplementation(() => ({ phoneVoiceLayout: true }));
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      withCallViewModel(
        {
          roomMembers: [alice, local], // A direct call, nobody has picked up yet
          windowSize$: behavior("a", { a: { width: 800, height: 360 } }),
        },
        (vm, rtcSession) => {
          schedule("n", {
            n: () => {
              // Braces on purpose: schedule() insists its actions return nothing, and emit()
              // hands back a boolean.
              rtcSession.emit(
                MatrixRTCSessionEvent.DidSendCallNotification,
                mockRingEvent("$notif1", 30),
              );
            },
          });

          // The dialler centres your own avatar while ringing, on purpose. Carried into the
          // tiles that reads as being on a call with yourself, so the person being rung takes
          // the big tile here and you stay in the column.
          expectObservable(places$(vm.layout$)).toBe("(ab)", {
            // Before the notification goes out there is nobody but you in the call, so you
            // are the only tile there is to show — the same instant upstream has.
            a: `big: ${localId}:0 | column: ${localId}:0`,
            b: `big: ringing:${aliceUserId} | column: ${localId}:0`,
          });
        },
        { waitForCallPickup: true },
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
