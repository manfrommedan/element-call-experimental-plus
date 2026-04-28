/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useObservableEagerState } from "observable-hooks";
import { type TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import CheckIcon from "@vector-im/compound-design-tokens/assets/web/icons/check";
import EndCallIcon from "@vector-im/compound-design-tokens/assets/web/icons/end-call";
import EarpieceIcon from "@vector-im/compound-design-tokens/assets/web/icons/earpiece";
import HeadphonesSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/headphones-solid";
import MicOffSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/mic-off-solid";
import MicOnSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/mic-on-solid";
import VideoCallIcon from "@vector-im/compound-design-tokens/assets/web/icons/video-call";
import VideoCallSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/video-call-solid";
import VoiceCallIcon from "@vector-im/compound-design-tokens/assets/web/icons/voice-call";
import VolumeOnSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/volume-on-solid";

import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { type AudioOutputDeviceLabel } from "../state/MediaDevices";
import { type MuteStates } from "../state/MuteStates";
import { useMediaDevices } from "../MediaDevicesContext";
import { Modal } from "../Modal";
import styles from "./VoiceFooter.module.css";

/** How long the video button stays in optimistic-pending state before it
 * gives up waiting for the camera publication to land. Permission denials
 * never resolve, so without a cap the spinner would spin forever. */
const VIDEO_TOGGLE_PENDING_TIMEOUT_MS = 5_000;

/** Audio-only calls skip the lobby, so the very first toggle of the video
 * button races the Android CAMERA permission dialog: the first getUserMedia
 * call rejects before the user has accepted, and the second press is what
 * actually enables video. Re-issue the toggle on a short interval until the
 * camera comes up — once permission is granted the next retry's
 * getUserMedia resolves and videoEnabled flips, stopping the loop. */
const VIDEO_TOGGLE_RETRY_INTERVAL_MS = 300;

/** Vibration durations for the three haptic flavours (ms). */
const HAPTIC_TAP_MS = 15;
const HAPTIC_CONNECT_MS = 25;
const HAPTIC_HANGUP_MS = 40;

/** North-American "precise" ringback pair (Hz). */
const RINGBACK_FREQUENCIES_HZ = [440, 480] as const;

/** Bell-System cadence: 2 s tone followed by 4 s of silence. */
const RINGBACK_PULSE_DURATION_S = 2;
const RINGBACK_CADENCE_MS = 6_000;
const RINGBACK_GAIN = 0.5;
const RINGBACK_RAMP_S = 0.05;

interface Props {
  vm: CallViewModel;
  muteStates: MuteStates;
  hidden?: boolean;
}

/**
 * Phone-style footer for audio-only calls: three primary controls
 * (microphone toggle, audio-output picker, hangup) plus light haptic
 * feedback on every tap. Replaces the standard {@link CallFooter} when the
 * call URL carries `callIntent === "audio"` so the rest of the in-call UI
 * (avatars, member tiles, auto video upgrade) remains the upstream layout.
 */
export const VoiceFooter: FC<Props> = ({ vm, muteStates, hidden }) => {
  const { t } = useTranslation();
  const audioEnabled = useObservableEagerState(muteStates.audio.enabled$);
  const toggleAudio = useObservableEagerState(muteStates.audio.toggle$);
  const videoEnabled = useObservableEagerState(muteStates.video.enabled$);
  const toggleVideo = useObservableEagerState(muteStates.video.toggle$);
  const participantCount = useObservableEagerState(vm.participantCount$);
  const ringing = useObservableEagerState(vm.ringing$);
  const elapsedSeconds = useElapsedSeconds(participantCount > 1);

  const mediaDevices = useMediaDevices();
  const availableOutputs = useObservableEagerState(
    mediaDevices.audioOutput.available$,
  );
  const selectedOutput = useObservableEagerState(
    mediaDevices.audioOutput.selected$,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  // Outgoing-call ringback while the recipient hasn't picked up yet. Driven by
  // the same `ringing$` signal upstream uses for its ringtone.mp3 loop, so the
  // two-tone dial tone stops the moment the call is picked up — using
  // participantCount as a proxy was racy because the LiveKit room can take a
  // beat to register the new participant after the recipient answers, leaving
  // the caller hearing ringback over a connected line. Upstream's mp3 loop is
  // suppressed in InCallView for audio-intent calls so the two don't double up.
  useOutgoingRingback(ringing);
  useConnectHaptic(participantCount > 1);
  useNotifyHostOnRemoteJoined(participantCount > 1);

  // Camera initialisation costs a noticeable beat (OS permission check + sensor
  // wake + LiveKit publication), and the video button stays visually idle for
  // that whole window if we wait on `videoEnabled` alone. Track a separate
  // "request pending" flag that flips on as soon as the user taps so the
  // button reads as active immediately and a spinner indicates we're working
  // on it. Cleared when the actual state catches up, or after a 5 s timeout
  // so a denied permission doesn't leave the button stuck in pending.
  const [videoPending, setVideoPending] = useState(false);
  useEffect(() => {
    if (videoPending && videoEnabled) setVideoPending(false);
  }, [videoEnabled, videoPending]);
  useEffect(() => {
    if (!videoPending) return undefined;
    // Audio-only calls skip the lobby, so the WebView never pre-warmed the
    // CAMERA runtime permission. The first toggle race-loses against the
    // Android permission dialog and the deferred getUserMedia rejects. Poll
    // toggleVideo on a short interval; the moment permission lands the next
    // retry's getUserMedia resolves and videoEnabled flips, ending the loop.
    const retryId = setInterval(() => {
      if (!videoEnabled && toggleVideo) toggleVideo();
    }, VIDEO_TOGGLE_RETRY_INTERVAL_MS);
    const giveUpId = setTimeout(
      () => setVideoPending(false),
      VIDEO_TOGGLE_PENDING_TIMEOUT_MS,
    );
    return (): void => {
      clearInterval(retryId);
      clearTimeout(giveUpId);
    };
  }, [videoPending, videoEnabled, toggleVideo]);
  const videoActive = videoEnabled || videoPending;

  const outputs = useMemo(
    () =>
      [...availableOutputs].map(([id, label]) => ({
        id,
        label: describeOutputLabel(label, t),
        kind: outputKindOf(label),
      })),
    [availableOutputs, t],
  );
  const activeOutput = outputs.find((o) => o.id === selectedOutput?.id);

  if (hidden) return null;

  return (
    <div className={styles.footer}>
      {participantCount > 1 && (
        <div className={styles.timer} aria-live="polite">
          {formatTimer(elapsedSeconds)}
        </div>
      )}
      <div className={styles.row}>
        <CircleButton
          label={
            audioEnabled
              ? t("voice_layout.microphone_on")
              : t("voice_layout.microphone_off")
          }
          active={!audioEnabled}
          onClick={
            toggleAudio
              ? (): void => {
                  haptic("tap");
                  toggleAudio();
                }
              : undefined
          }
          disabled={toggleAudio === null}
        >
          {audioEnabled ? <MicOnSolidIcon /> : <MicOffSolidIcon />}
        </CircleButton>
        <CircleButton
          label={
            activeOutput?.label ??
            t("voice_layout.audio_output", "Audio output")
          }
          active={
            activeOutput !== undefined && activeOutput.kind !== "earpiece"
          }
          onClick={() => {
            haptic("tap");
            setPickerOpen(true);
          }}
          disabled={outputs.length < 2}
        >
          {iconForOutputKind(activeOutput?.kind ?? "earpiece")}
        </CircleButton>
        <CircleButton
          label={
            videoActive
              ? t("voice_layout.video_on", "Camera on")
              : t("voice_layout.video_off", "Switch to video")
          }
          active={videoActive}
          pending={videoPending && !videoEnabled}
          onClick={
            toggleVideo
              ? (): void => {
                  haptic("tap");
                  if (!videoEnabled) setVideoPending(true);
                  toggleVideo();
                }
              : undefined
          }
          disabled={toggleVideo === null}
        >
          {videoActive ? <VideoCallSolidIcon /> : <VideoCallIcon />}
        </CircleButton>
        <CircleButton
          label={t("voice_layout.hangup")}
          variant="danger"
          onClick={() => {
            haptic("hangup");
            vm.hangup();
          }}
        >
          <EndCallIcon />
        </CircleButton>
      </div>
      <AudioOutputPicker
        open={pickerOpen}
        outputs={outputs}
        selectedId={selectedOutput?.id}
        onSelect={(id) => {
          haptic("tap");
          mediaDevices.audioOutput.select(id);
          setPickerOpen(false);
        }}
        onDismiss={() => setPickerOpen(false)}
      />
    </div>
  );
};

type OutputKind = "earpiece" | "speaker" | "headphones" | "default";

interface OutputOption {
  id: string;
  label: string;
  kind: OutputKind;
}

interface CircleButtonProps {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  pending?: boolean;
  variant?: "default" | "danger";
}

const CircleButton: FC<CircleButtonProps> = ({
  children,
  label,
  onClick,
  active,
  disabled,
  pending,
  variant,
}) => (
  <button
    type="button"
    className={styles.button}
    data-active={active ? "true" : "false"}
    data-pending={pending ? "true" : "false"}
    data-variant={variant ?? "default"}
    onClick={onClick}
    disabled={disabled}
    aria-busy={pending ? "true" : undefined}
    aria-label={label}
  >
    <span className={styles.buttonIcon} aria-hidden="true">
      {children}
      {pending && <span className={styles.buttonSpinner} aria-hidden="true" />}
    </span>
    <span className={styles.buttonLabel}>{label}</span>
  </button>
);

interface AudioOutputPickerProps {
  open: boolean;
  outputs: OutputOption[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onDismiss: () => void;
}

const AudioOutputPicker: FC<AudioOutputPickerProps> = ({
  open,
  outputs,
  selectedId,
  onSelect,
  onDismiss,
}) => {
  const { t } = useTranslation();
  return (
    <Modal
      title={t("voice_layout.audio_output_picker_title", "Audio output")}
      open={open}
      onDismiss={onDismiss}
      hideHeader
    >
      <ul className={styles.outputList} role="listbox">
        {outputs.map((output) => (
          <OutputRow
            key={output.id}
            output={output}
            selected={output.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </Modal>
  );
};

const OutputRow: FC<{
  output: OutputOption;
  selected: boolean;
  onSelect: (id: string) => void;
}> = ({ output, selected, onSelect }) => {
  const handle = useCallback(() => onSelect(output.id), [onSelect, output.id]);
  return (
    <li>
      <button
        type="button"
        className={styles.outputRow}
        data-active={selected ? "true" : "false"}
        onClick={handle}
        role="option"
        aria-selected={selected}
      >
        <span className={styles.outputIcon} aria-hidden="true">
          {iconForOutputKind(output.kind)}
        </span>
        <span className={styles.outputLabel}>{output.label}</span>
        {selected && (
          <span className={styles.outputCheck} aria-hidden="true">
            <CheckIcon />
          </span>
        )}
      </button>
    </li>
  );
};

function describeOutputLabel(
  label: AudioOutputDeviceLabel,
  t: TFunction,
): string {
  switch (label.type) {
    case "speaker":
      return t("voice_layout.speakerphone");
    case "earpiece":
      return t("voice_layout.regular_call");
    case "name":
      return label.name;
    case "default":
      return label.name ?? t("voice_layout.audio_output_default", "Default");
    case "number":
      return t("voice_layout.audio_output_unnamed", "Audio device {{number}}", {
        number: label.number,
      });
  }
}

function outputKindOf(label: AudioOutputDeviceLabel): OutputKind {
  switch (label.type) {
    case "speaker":
      return "speaker";
    case "earpiece":
      return "earpiece";
    case "name":
      return "headphones";
    default:
      return "default";
  }
}

function iconForOutputKind(kind: OutputKind): ReactNode {
  switch (kind) {
    case "earpiece":
      return <EarpieceIcon />;
    case "speaker":
      return <VolumeOnSolidIcon />;
    case "headphones":
      return <HeadphonesSolidIcon />;
    case "default":
      return <VoiceCallIcon />;
  }
}

/**
 * Light haptic feedback for the primary controls. Mirrors the WhatsApp /
 * native-dialer feel: taps get a short tick, hangup gets a slightly stronger
 * burst so it feels decisive. Silently no-ops when the Vibration API is
 * unavailable.
 */
function haptic(kind: "tap" | "hangup" | "connect"): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  switch (kind) {
    case "tap":
      navigator.vibrate(HAPTIC_TAP_MS);
      break;
    case "hangup":
      navigator.vibrate(HAPTIC_HANGUP_MS);
      break;
    case "connect":
      navigator.vibrate(HAPTIC_CONNECT_MS);
      break;
  }
}

/**
 * Counts wall-clock seconds since the call became active. Frozen at zero
 * before that and ticks once a second afterwards.
 */
function useElapsedSeconds(active: boolean): number {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    setStartedAt((prev) => prev ?? Date.now());
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return (): void => clearInterval(id);
  }, [active]);
  if (startedAt === null) return 0;
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

function formatTimer(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/**
 * Notifies the embedding host (e.g. Element X's call activity) that the
 * remote side has joined the call so it can stamp the call-summary timer
 * accurately — neither the local LiveKit join nor the first DeviceMute
 * echo are reliable proxies for that moment, so we surface a dedicated
 * widget-API message and let the host snoop on it.
 *
 * Fires once per active session; the message is shaped like a regular
 * fromWidget request so existing widget-message infrastructure forwards it
 * unchanged.
 */
function useNotifyHostOnRemoteJoined(joined: boolean): void {
  const [hasFired, setHasFired] = useState(false);
  useEffect(() => {
    if (!joined || hasFired) return;
    setHasFired(true);
    const target = window.parent !== window ? window.parent : window;
    target.postMessage(
      {
        api: "fromWidget",
        widgetId: "voice-layout-internal",
        requestId: `voice-remote-joined-${Date.now()}`,
        action: "io.element.call.remote_joined",
      },
      "*",
    );
  }, [joined, hasFired]);
}

/**
 * Subtle haptic the moment the call moves from "alone in the room" to
 * "remote participant joined" — the WhatsApp acknowledgement that the
 * other side picked up. Fires once per connect transition.
 */
function useConnectHaptic(connected: boolean): void {
  const [hasFired, setHasFired] = useState(false);
  useEffect(() => {
    if (connected && !hasFired) {
      haptic("connect");
      setHasFired(true);
    }
  }, [connected, hasFired]);
}

/**
 * Classic outgoing dial-tone (ringback) generated with the Web Audio API:
 * two superposed sine waves at 440 Hz and 480 Hz (the North-American
 * "precise" ringback pair), repeating in a 2 s on / 4 s off cadence until
 * the active flag flips false.
 */
function useOutgoingRingback(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtx) return undefined;
    const ctx: AudioContext = new AudioCtx();
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const playPulse = (): void => {
      if (cancelled) return;
      try {
        const start = ctx.currentTime;
        const duration = RINGBACK_PULSE_DURATION_S;
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        gainNode.gain.setValueAtTime(0, start);
        gainNode.gain.linearRampToValueAtTime(RINGBACK_GAIN, start + RINGBACK_RAMP_S);
        gainNode.gain.setValueAtTime(RINGBACK_GAIN, start + duration - RINGBACK_RAMP_S);
        gainNode.gain.linearRampToValueAtTime(0, start + duration);
        for (const frequency of RINGBACK_FREQUENCIES_HZ) {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = frequency;
          osc.connect(gainNode);
          osc.start(start);
          osc.stop(start + duration);
        }
      } catch {
        // AudioContext can land in a closed state mid-call; bail silently.
      }
      timeoutId = setTimeout(playPulse, RINGBACK_CADENCE_MS);
    };

    void ctx.resume().catch(() => undefined);
    playPulse();

    return (): void => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      void ctx.close().catch(() => undefined);
    };
  }, [active]);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
