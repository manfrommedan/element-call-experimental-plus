/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactNode, useEffect, useMemo, useState } from "react";
import { useObservableEagerState } from "observable-hooks";
import { type TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Avatar } from "@vector-im/compound-web";
import EndCallIcon from "@vector-im/compound-design-tokens/assets/web/icons/end-call";
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
import { type MuteStates } from "../state/MuteStates";
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
  const audioOutputSwitcher = useObservableEagerState(vm.audioOutputSwitcher$);
  const earpieceMode = useObservableEagerState(vm.earpieceMode$);
  const audioEnabled = useObservableEagerState(muteStates.audio.enabled$);
  const toggleAudio = useObservableEagerState(muteStates.audio.toggle$);

  const remoteMembers = useRemoteMembers(matrixRoom);
  const elapsedSeconds = useElapsedSeconds(connected);

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
          onClick={toggleAudio ?? undefined}
          disabled={toggleAudio === null}
        >
          {audioEnabled ? <MicOnSolidIcon /> : <MicOffSolidIcon />}
        </CircleButton>
        <CircleButton
          label={
            earpieceMode
              ? t("voice_layout.regular_call")
              : t("voice_layout.speakerphone")
          }
          active={!earpieceMode}
          onClick={audioOutputSwitcher?.switch}
          disabled={audioOutputSwitcher === null}
        >
          {earpieceMode ? <VoiceCallIcon /> : <VolumeOnSolidIcon />}
        </CircleButton>
        <CircleButton
          label={t("voice_layout.hangup")}
          variant="danger"
          onClick={vm.hangup}
        >
          <EndCallIcon />
        </CircleButton>
      </div>
    </div>
  );
};

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
