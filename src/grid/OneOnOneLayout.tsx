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
import { getUrlParams } from "../UrlParams";

/**
 * An implementation of the "one-on-one" layout, in which the remote participant
 * is shown at maximum size, overlaid by a small view of the local participant.
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
    // Switch the layout into "phone call" presentation when the host has
    // requested an audio-only call. The active CSS rules drop the local PiP,
    // expand the spotlight tile to fill the view, and switch the tile chrome
    // to canvas colours — see OneOnOneLayout.module.css.
    const audioMode = getUrlParams().callIntent === "audio";

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
          <Slot
            className={classNames(styles.slot, styles.local)}
            id={model.pip.id}
            model={model.pip}
            onDrag={onDragLocalTile}
            data-block-alignment={pipAlignmentValue.block}
            data-inline-alignment={pipAlignmentValue.inline}
          />
        </Slot>
      </div>
    );
  },
});
