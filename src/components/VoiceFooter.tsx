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
import { Button as CpdButton, Tooltip } from "@vector-im/compound-web";
import CheckIcon from "@vector-im/compound-design-tokens/assets/web/icons/check";
import HeadphonesSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/headphones-solid";
import VoiceCallIcon from "@vector-im/compound-design-tokens/assets/web/icons/voice-call";
import VolumeOnSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/volume-on-solid";

import {
  EndCallButton,
  MicButton,
  VideoButton,
} from "../button/Button";
import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { type AudioOutputDeviceLabel } from "../state/MediaDevices";
import { type MuteStates } from "../state/MuteStates";
import { useMediaDevices } from "../MediaDevicesContext";
import { Modal } from "../Modal";
import styles from "./VoiceFooter.module.css";

// Cap so a denied CAMERA permission doesn't leave the spinner stuck.
const VIDEO_TOGGLE_PENDING_TIMEOUT_MS = 5_000;
// Retry past the Android permission dialog race on the first toggle.
const VIDEO_TOGGLE_RETRY_INTERVAL_MS = 300;

const HAPTIC_TAP_MS = 15;
const HAPTIC_CONNECT_MS = 25;
const HAPTIC_HANGUP_MS = 40;

// North-American "precise" ringback (Bell cadence: 2 s on, 4 s off).
const RINGBACK_FREQUENCIES_HZ = [440, 480] as const;
const RINGBACK_PULSE_DURATION_S = 2;
const RINGBACK_CADENCE_MS = 6_000;
// 0.35 × 2 oscillators = 0.70 peak; sits below the [-1, 1] clip ceiling.
const RINGBACK_GAIN = 0.35;
const RINGBACK_RAMP_S = 0.08;

interface Props {
  vm: CallViewModel;
  muteStates: MuteStates;
  hidden?: boolean;
}

export const VoiceFooter: FC<Props> = ({ vm, muteStates, hidden }) => {
  const { t } = useTranslation();
  const audioEnabled = useObservableEagerState(muteStates.audio.enabled$);
  const toggleAudio = useObservableEagerState(muteStates.audio.toggle$);
  const videoEnabled = useObservableEagerState(muteStates.video.enabled$);
  const toggleVideo = useObservableEagerState(muteStates.video.toggle$);
  const participantCount = useObservableEagerState(vm.participantCount$);
  const ringingVm = useObservableEagerState(vm.ringingVm$);
  const ringing = ringingVm !== null;

  const mediaDevices = useMediaDevices();
  const availableOutputs = useObservableEagerState(
    mediaDevices.audioOutput.available$,
  );
  const selectedOutput = useObservableEagerState(
    mediaDevices.audioOutput.selected$,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  useOutgoingRingback(ringing);
  useConnectHaptic(participantCount > 1);
  useNotifyHostOnRemoteJoined(participantCount > 1);

  // Optimistic-pending until videoEnabled catches up or the timeout fires.
  const [videoPending, setVideoPending] = useState(false);
  useEffect(() => {
    if (videoPending && videoEnabled) setVideoPending(false);
  }, [videoEnabled, videoPending]);
  useEffect(() => {
    if (!videoPending) return undefined;
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
      [...availableOutputs].map(([id, label]) => {
        const kind = outputKindOf(label);
        return {
          id,
          label: describeOutputLabel(label, t),
          kindLabel: genericLabelForOutputKind(kind, t),
          kind,
        };
      }),
    [availableOutputs, t],
  );
  const activeOutput = outputs.find((o) => o.id === selectedOutput?.id);
  const isAlternateOutputActive =
    activeOutput !== undefined && activeOutput.kind !== "earpiece";
  const audioOutputIcon = useMemo(() => {
    switch (activeOutput?.kind) {
      case "speaker":
        return VolumeOnSolidIcon;
      case "headphones":
        return HeadphonesSolidIcon;
      case "earpiece":
      default:
        return VoiceCallIcon;
    }
  }, [activeOutput?.kind]);

  const onMicClick = useCallback((): void => {
    if (!toggleAudio) return;
    haptic("tap");
    toggleAudio();
  }, [toggleAudio]);

  const onVideoClick = useCallback((): void => {
    if (!toggleVideo) return;
    haptic("tap");
    if (!videoEnabled) setVideoPending(true);
    toggleVideo();
  }, [toggleVideo, videoEnabled]);

  const onAudioOutputClick = useCallback((): void => {
    haptic("tap");
    setPickerOpen(true);
  }, []);

  const onHangupClick = useCallback((): void => {
    haptic("hangup");
    vm.hangup();
  }, [vm]);

  const onAudioOutputSelect = useCallback(
    (id: string): void => {
      haptic("tap");
      mediaDevices.audioOutput.select(id);
      setPickerOpen(false);
    },
    [mediaDevices.audioOutput],
  );

  const onPickerDismiss = useCallback((): void => setPickerOpen(false), []);

  if (hidden) return null;

  return (
    <>
      <div className={styles.footer}>
        {/* All four controls stay on one row. Hanging up deserves to stand apart, but a row of
        its own costs a whole band of height, and on a short screen or in landscape that is the
        band the avatar needs. It reads as the odd one out by colour instead. */}
        <div className={styles.row}>
          <div className={styles.control}>
            <MicButton
              size="lg"
              enabled={audioEnabled}
              onClick={onMicClick}
              disabled={toggleAudio === null}
            />
            <span className={styles.label}>
              {audioEnabled
                ? t("voice_layout.microphone_on")
                : t("voice_layout.microphone_off")}
            </span>
          </div>
          <div className={styles.control}>
            <Tooltip
              label={
                activeOutput?.kindLabel ??
                t("voice_layout.audio_output", "Audio output")
              }
            >
              <CpdButton
                iconOnly
                size="lg"
                kind={isAlternateOutputActive ? "primary" : "secondary"}
                Icon={audioOutputIcon}
                onClick={onAudioOutputClick}
                disabled={outputs.length < 2}
              />
            </Tooltip>
            {/* The label answers "where is the sound going", which the icon alone never did. */}
            <span className={styles.label}>
              {activeOutput?.kindLabel ?? t("voice_layout.audio_output")}
            </span>
          </div>
          <div className={styles.control}>
            <VideoButton
              size="lg"
              enabled={videoActive}
              onClick={onVideoClick}
              disabled={toggleVideo === null}
            />
            <span className={styles.label}>
              {videoActive
                ? t("voice_layout.video_on")
                : t("voice_layout.video_off")}
            </span>
          </div>
          <div className={styles.control}>
            <EndCallButton size="lg" onClick={onHangupClick} />
            <span className={styles.label}>
              {t("voice_layout.hangup")}
            </span>
          </div>
        </div>
        <AudioOutputPicker
          open={pickerOpen}
          outputs={outputs}
          selectedId={selectedOutput?.id}
          onSelect={onAudioOutputSelect}
          onDismiss={onPickerDismiss}
        />
      </div>
    </>
  );
};

type OutputKind = "earpiece" | "speaker" | "headphones" | "default";

interface OutputOption {
  id: string;
  label: string;
  kind: OutputKind;
}

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
      <div className={styles.outputList} role="listbox">
        {outputs.map((output) => (
          <OutputRow
            key={output.id}
            output={output}
            selected={output.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
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

function genericLabelForOutputKind(kind: OutputKind, t: TFunction): string {
  switch (kind) {
    case "speaker":
      return t("voice_layout.speakerphone");
    case "earpiece":
      return t("voice_layout.regular_call");
    case "headphones":
      return t("voice_layout.audio_output_headphones", "Headphones");
    case "default":
      return t("voice_layout.audio_output_default", "Default");
  }
}

function iconForOutputKind(kind: OutputKind): ReactNode {
  switch (kind) {
    case "speaker":
      return <VolumeOnSolidIcon />;
    case "headphones":
      return <HeadphonesSolidIcon />;
    case "earpiece":
    case "default":
      return <VoiceCallIcon />;
  }
}

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

// Surfaces a fromWidget message so the embedding host (Element X) can
// stamp the call-summary timer; LiveKit join / DeviceMute echo are unreliable.
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

function useConnectHaptic(connected: boolean): void {
  const [hasFired, setHasFired] = useState(false);
  useEffect(() => {
    if (connected && !hasFired) {
      haptic("connect");
      setHasFired(true);
    }
  }, [connected, hasFired]);
}

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
