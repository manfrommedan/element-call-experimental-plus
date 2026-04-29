/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useCallback, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";
import classNames from "classnames";

import { type OneOnOneLayout as OneOnOneLayoutModel } from "../state/layout-types.ts";
import { type CallLayout, arrangeTiles } from "./CallLayout";
import styles from "./OneOnOneLayout.module.css";
import { type DragCallback, useUpdateLayout } from "./Grid";
import { useBehavior } from "../useBehavior";

/**
 * An implementation of the "one-on-one" layout, in which the remote participant
 * is shown at maximum size, overlaid by a small view of the local participant.
 *
 * When the model omits `pip` (phone-style 1:1 voice mode, gated upstream in
 * CallViewModel), the spotlight tile is expanded to fill the layer and the
 * local self-tile is not rendered at all.
 */
export const makeOneOnOneLayout: CallLayout<OneOnOneLayoutModel> = ({
  minBounds$,
  pipAlignment$,
}) => ({
  scrollingOnTop: false,

  fixed: function OneOnOneLayoutFixed({ ref }): ReactNode {
    useUpdateLayout();
    return <div ref={ref} />;
  },

  scrolling: function OneOnOneLayoutScrolling({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    const { width, height } = useObservableEagerState(minBounds$);
    const pipAlignmentValue = useBehavior(pipAlignment$);
    const { tileWidth, tileHeight } = useMemo(
      () => arrangeTiles(width, height, 1),
      [width, height],
    );
    // The model-level pip gate (see CallViewModel.localUserMediaForPip$ and
    // oneOnOneLayoutMedia$) is the single source of truth for whether the
    // self-tile renders. Reflect "no pip" in the layout chrome too: paint
    // the spotlight tile across the whole view and let the avatar grow to
    // phone-call proportions, rather than keeping the desktop-style remote
    // + local-PiP arrangement that assumes both tiles are visible.
    const audioMode = model.pip === undefined;

    const onDragLocalTile: DragCallback = useCallback(
      ({ xRatio, yRatio }) =>
        pipAlignment$.next({
          block: yRatio < 0.5 ? "start" : "end",
          inline: xRatio < 0.5 ? "start" : "end",
        }),
      [],
    );

    return (
      <div
        ref={ref}
        className={classNames(styles.layer, {
          [styles.audioMode]: audioMode,
        })}
      >
        <Slot
          id={model.spotlight.id}
          model={model.spotlight}
          className={styles.container}
          style={{ width: tileWidth, height: tileHeight }}
        >
          {model.pip && (
            <Slot
              className={classNames(styles.slot, styles.local)}
              id={model.pip.id}
              model={model.pip}
              onDrag={onDragLocalTile}
              data-block-alignment={pipAlignmentValue.block}
              data-inline-alignment={pipAlignmentValue.inline}
            />
          )}
        </Slot>
      </div>
    );
  },
});
