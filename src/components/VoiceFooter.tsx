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
import VoiceCallIcon from "@vector-im/compound-design-tokens/assets/web/icons/voice-call";
import VolumeOnSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/volume-on-solid";

import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { type AudioOutputDeviceLabel } from "../state/MediaDevices";
import { type MuteStates } from "../state/MuteStates";
import { useMediaDevices } from "../MediaDevicesContext";
import { Modal } from "../Modal";
import styles from "./VoiceFooter.module.css";

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
  const participantCount = useObservableEagerState(vm.participantCount$);

  const mediaDevices = useMediaDevices();
  const availableOutputs = useObservableEagerState(
    mediaDevices.audioOutput.available$,
  );
  const selectedOutput = useObservableEagerState(
    mediaDevices.audioOutput.selected$,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  // Outgoing-call ringback while we're alone in the room. Stops as soon as a
  // second participant joins, which matches the moment the remote side picks
  // up. Stays silent for receivers since they join a room that already has
  // the caller in it.
  useOutgoingRingback(participantCount === 1);
  useConnectHaptic(participantCount > 1);

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
      <CircleButton
        label={
          audioEnabled
            ? t("voice_layout.microphone_on")
            : t("voice_layout.microphone_off")
        }
        active={!audioEnabled}
        onClick={
          toggleAudio
            ? () => {
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
          activeOutput?.label ?? t("voice_layout.audio_output", "Audio output")
        }
        active={activeOutput !== undefined && activeOutput.kind !== "earpiece"}
        onClick={() => {
          haptic("tap");
          setPickerOpen(true);
        }}
        disabled={outputs.length < 2}
      >
        {iconForOutputKind(activeOutput?.kind ?? "earpiece")}
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
  variant?: "default" | "danger";
}

const CircleButton: FC<CircleButtonProps> = ({
  children,
  label,
  onClick,
  active,
  disabled,
  variant,
}) => (
  <button
    type="button"
    className={styles.button}
    data-active={active ? "true" : "false"}
    data-variant={variant ?? "default"}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
  >
    <span className={styles.buttonIcon} aria-hidden="true">
      {children}
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
      navigator.vibrate(15);
      break;
    case "hangup":
      navigator.vibrate(40);
      break;
    case "connect":
      navigator.vibrate(25);
      break;
  }
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
 * the active flag flips false. The bundled `join_call` sample only plays
 * once on the remote join event and is too quiet to bridge the wait, so
 * the synthesised tone fills the silence the caller would otherwise hear
 * after picking the contact.
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
        const duration = 2;
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        gainNode.gain.setValueAtTime(0, start);
        gainNode.gain.linearRampToValueAtTime(0.5, start + 0.05);
        gainNode.gain.setValueAtTime(0.5, start + duration - 0.05);
        gainNode.gain.linearRampToValueAtTime(0, start + duration);
        for (const frequency of [440, 480]) {
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
      timeoutId = setTimeout(playPulse, 6_000);
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
