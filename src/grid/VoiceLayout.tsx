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
import { Avatar } from "@vector-im/compound-web";
import CheckIcon from "@vector-im/compound-design-tokens/assets/web/icons/check";
import EndCallIcon from "@vector-im/compound-design-tokens/assets/web/icons/end-call";
import EarpieceIcon from "@vector-im/compound-design-tokens/assets/web/icons/earpiece";
import HeadphonesSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/headphones-solid";
import MicOffSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/mic-off-solid";
import MicOnSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/mic-on-solid";
import VoiceCallIcon from "@vector-im/compound-design-tokens/assets/web/icons/voice-call";
import VolumeOnSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/volume-on-solid";
import {
  type Room as MatrixRoom,
  type RoomMember,
  RoomStateEvent,
} from "matrix-js-sdk";

import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { type AudioOutputDeviceLabel } from "../state/MediaDevices";
import { type MuteStates } from "../state/MuteStates";
import { useMediaDevices } from "../MediaDevicesContext";
import { Modal } from "../Modal";
import styles from "./VoiceLayout.module.css";

interface Props {
  vm: CallViewModel;
  matrixRoom: MatrixRoom;
  muteStates: MuteStates;
}

interface MemberSummary {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

/**
 * Phone-style audio call layout. Renders avatar(s), name, phase indicator
 * and three primary controls (microphone / speakerphone / hangup) for a
 * 1:1 or small group voice call.
 *
 * Activated automatically by the layout selector when the URL parameter
 * `callIntent === "audio"` is set.
 */
export const VoiceLayout: FC<Props> = ({ vm, matrixRoom, muteStates }) => {
  const { t } = useTranslation();
  const connected = useObservableEagerState(vm.connected$);
  const reconnecting = useObservableEagerState(vm.reconnecting$);
  const ringing = useObservableEagerState(vm.ringing$);
  const audioEnabled = useObservableEagerState(muteStates.audio.enabled$);
  const toggleAudio = useObservableEagerState(muteStates.audio.toggle$);

  const mediaDevices = useMediaDevices();
  const availableOutputs = useObservableEagerState(
    mediaDevices.audioOutput.available$,
  );
  const selectedOutput = useObservableEagerState(
    mediaDevices.audioOutput.selected$,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const remoteMembers = useRemoteMembers(matrixRoom);
  const elapsedSeconds = useElapsedSeconds(connected);

  useConnectHaptic(connected);
  useOutgoingRingback(ringing && !connected);

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

  const phaseLabel = describePhase({
    t,
    connected,
    reconnecting,
    ringing,
    elapsedSeconds,
  });

  const title = useMemo(() => {
    if (remoteMembers.length === 1) return remoteMembers[0].displayName;
    if (remoteMembers.length > 1) {
      return (
        matrixRoom.name ||
        t("voice_layout.participants_count", { count: remoteMembers.length })
      );
    }
    return matrixRoom.name || "";
  }, [remoteMembers, matrixRoom.name, t]);

  return (
    <div className={styles.layout} data-phase={phaseLabel.phase}>
      <div className={styles.background} aria-hidden="true">
        {remoteMembers[0]?.avatarUrl !== undefined && (
          <img
            className={styles.backgroundImage}
            src={remoteMembers[0].avatarUrl}
            alt=""
          />
        )}
      </div>
      <div className={styles.top} />
      <span className={styles.phase}>{phaseLabel.text}</span>
      <div className={styles.avatars}>
        <AvatarGroup members={remoteMembers} />
      </div>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.controls}>
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

const AvatarGroup: FC<{ members: MemberSummary[] }> = ({ members }) => {
  if (members.length === 0) {
    return <Avatar id="self" name="" size="144px" />;
  }
  if (members.length === 1) {
    const m = members[0];
    return (
      <Avatar
        id={m.userId}
        name={m.displayName}
        src={m.avatarUrl}
        size="144px"
      />
    );
  }
  if (members.length === 2) {
    return (
      <div className={styles.avatarPair}>
        {members.map((m) => (
          <Avatar
            key={m.userId}
            id={m.userId}
            name={m.displayName}
            src={m.avatarUrl}
            size="120px"
          />
        ))}
      </div>
    );
  }
  return (
    <div className={styles.avatarGrid}>
      {members.slice(0, 4).map((m) => (
        <Avatar
          key={m.userId}
          id={m.userId}
          name={m.displayName}
          src={m.avatarUrl}
          size="96px"
        />
      ))}
    </div>
  );
};

function useRemoteMembers(matrixRoom: MatrixRoom): MemberSummary[] {
  const [members, setMembers] = useState<MemberSummary[]>(() =>
    collectRemoteMembers(matrixRoom),
  );
  useEffect(() => {
    // Refresh on RoomStateEvent.Members — covers join / leave / power level
    // and re-fires when membership profile state events arrive (which is the
    // mechanism behind name and avatar changes).
    const update = (): void => setMembers(collectRemoteMembers(matrixRoom));
    matrixRoom.on(RoomStateEvent.Members, update);
    return (): void => {
      matrixRoom.off(RoomStateEvent.Members, update);
    };
  }, [matrixRoom]);
  return members;
}

function collectRemoteMembers(matrixRoom: MatrixRoom): MemberSummary[] {
  const selfId = matrixRoom.client.getUserId();
  return matrixRoom
    .getJoinedMembers()
    .filter((m: RoomMember) => m.userId !== selfId)
    .map<MemberSummary>((m) => {
      const url = m.getAvatarUrl(
        matrixRoom.client.getHomeserverUrl(),
        288,
        288,
        "scale",
        false,
        false,
      );
      return {
        userId: m.userId,
        displayName: m.rawDisplayName || m.userId,
        avatarUrl: url ? url : undefined,
      };
    });
}

/**
 * Light haptic feedback for the primary controls. Mirrors the WhatsApp /
 * native-dialer feel: taps get a short tick, hangup gets a slightly stronger
 * burst so it feels decisive. Silently no-ops on platforms / configurations
 * that don't expose the Vibration API.
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
 * Plays a subtle haptic the moment the call moves from "connecting/ringing"
 * to "connected" — matches the WhatsApp behaviour of acknowledging the
 * remote side picking up. Fires once per connect transition; subsequent
 * reconnect blips don't re-trigger.
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
 * the call connects or ends. Plays through the system call audio output —
 * Element Call's existing `join_call` sample fires only on the remote
 * party joining and is too quiet to serve as a wait indicator.
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
        // Short fade in/out to avoid clicks.
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
      // Total cycle is 6 s (2 on + 4 off) per Bell System spec.
      timeoutId = setTimeout(playPulse, 6_000);
    };

    // Most mobile browsers block the AudioContext until a user gesture; the
    // call button tap qualifies, but the context can still come up suspended.
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

function useElapsedSeconds(connected: boolean): number {
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!connected) return undefined;
    setConnectedAt((prev) => prev ?? Date.now());
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return (): void => clearInterval(id);
  }, [connected]);
  if (connectedAt === null) return 0;
  return Math.max(0, Math.floor((Date.now() - connectedAt) / 1000));
}

interface PhaseLabel {
  phase: "connecting" | "ringing" | "in-call" | "reconnecting";
  text: string;
}

interface DescribePhaseInputs {
  t: TFunction;
  connected: boolean;
  reconnecting: boolean;
  ringing: boolean;
  elapsedSeconds: number;
}

function describePhase({
  t,
  connected,
  reconnecting,
  ringing,
  elapsedSeconds,
}: DescribePhaseInputs): PhaseLabel {
  if (reconnecting) {
    return {
      phase: "reconnecting",
      text: t("voice_layout.phase_reconnecting"),
    };
  }
  if (connected) {
    return { phase: "in-call", text: formatTimer(elapsedSeconds) };
  }
  if (ringing) {
    return { phase: "ringing", text: t("voice_layout.phase_ringing") };
  }
  return { phase: "connecting", text: t("voice_layout.phase_connecting") };
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
