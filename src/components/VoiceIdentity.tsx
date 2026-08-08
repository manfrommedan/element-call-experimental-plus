/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { useTranslation } from "react-i18next";
import { useObservableEagerState } from "observable-hooks";
import classNames from "classnames";
import { useIdColorHash } from "@vector-im/compound-web";

import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { useElapsedSeconds, formatTimer } from "./useElapsedSeconds";
import styles from "./VoiceIdentity.module.css";

interface Props {
  vm: CallViewModel;
  /** Who is on the other end. */
  name: string;
  /** Matrix ID the ambient wash takes its colour from, so it matches their avatar. */
  colourId: string;
  hidden: boolean;
}

/**
 * Who is being called and what the call is doing, as one block above the avatar.
 *
 * Split between the app bar and a line of its own, the two halves of that sentence made the eye
 * go to two places to answer one question. Every phone dialler worth copying sets them as a single
 * centred block, the name leading on size alone and the status following underneath.
 *
 * It sits in the flow rather than floating over the call, so the tile below is laid out in what is
 * left rather than underneath it. Nothing can end up on top of anything else, at any screen size,
 * because nothing overlaps to begin with.
 */
export const VoiceIdentity: FC<Props> = ({ vm, name, colourId, hidden }) => {
  const { t } = useTranslation();
  const participantCount = useObservableEagerState<number>(vm.participantCount$);
  const waitingForRemote = participantCount <= 1;
  const elapsedSeconds = useElapsedSeconds(!waitingForRemote);
  // The same hash Compound runs to colour an avatar, so the wash is the colour of the person
  // being called rather than one that merely resembles it.
  const colour = useIdColorHash(colourId);

  if (hidden) return null;

  return (
    <>
      <div className={styles.tint} data-colour={colour} aria-hidden />
      <div className={styles.identity}>
        <h1 className={styles.name}>{name}</h1>
        <p
          className={classNames(styles.status, {
            [styles.pending]: waitingForRemote,
          })}
          aria-live="polite"
        >
          {waitingForRemote
            ? t("voice_layout.phase_ringing")
            : formatTimer(elapsedSeconds)}
        </p>
      </div>
    </>
  );
};
