/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useMemo } from "react";
import { useObservableEagerState } from "observable-hooks";

import { type PhoneVoiceLayout as PhoneVoiceLayoutModel } from "../state/layout-types.ts";
import { type CallLayout, arrangeTiles } from "./CallLayout";
import styles from "./PhoneVoiceLayout.module.css";
import { useUpdateLayout } from "./Grid";

export const makePhoneVoiceLayout: CallLayout<PhoneVoiceLayoutModel> = ({
  minBounds$,
}) => ({
  scrollingOnTop: false,

  fixed: function PhoneVoiceLayoutFixed({ ref }): ReactNode {
    useUpdateLayout();
    return <div ref={ref} />;
  },

  scrolling: function PhoneVoiceLayoutScrolling({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    const { width, height } = useObservableEagerState(minBounds$);
    const { tileWidth, tileHeight } = useMemo(
      () => arrangeTiles(width, height, 1),
      [width, height],
    );

    return (
      <div ref={ref} className={styles.layer}>
        <Slot
          id={model.spotlight.id}
          model={model.spotlight}
          className={styles.container}
          style={{ width: tileWidth, height: tileHeight }}
        />
      </div>
    );
  },
});
