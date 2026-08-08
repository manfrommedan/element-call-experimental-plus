/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode } from "react";

import { type PhoneVoiceLayout as PhoneVoiceLayoutModel } from "../state/layout-types.ts";
import { type CallLayout } from "./CallLayout";
import styles from "./PhoneVoiceLayout.module.css";
import { useUpdateLayout } from "./Grid";

export const makePhoneVoiceLayout: CallLayout<PhoneVoiceLayoutModel> = () => ({
  scrollingOnTop: false,
  foreground: "scrolling",

  // The spotlight sits in the fixed layer and fills it, the way the one-on-one mobile layout
  // arranges its own. Sizing it by hand here was what forced the tile into its own box instead of
  // letting it stretch behind the page gradient.
  fixed: function PhoneVoiceLayoutFixed({ ref, model, Slot }): ReactNode {
    useUpdateLayout();
    return (
      <div ref={ref} className={styles.layer}>
        <Slot id="spotlight" model={model.spotlight} className={styles.spotlight} />
      </div>
    );
  },

  scrolling: function PhoneVoiceLayoutScrolling({ ref }): ReactNode {
    useUpdateLayout();
    return <div ref={ref} />;
  },
});
