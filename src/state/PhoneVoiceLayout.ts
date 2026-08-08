/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type PhoneVoiceLayout,
  type PhoneVoiceLayoutMedia,
} from "./layout-types";
import { type TileStore } from "./TileStore";

export function phoneVoiceLayout(
  media: PhoneVoiceLayoutMedia,
  prevTiles: TileStore,
): [PhoneVoiceLayout, TileStore] {
  const update = prevTiles.from(0);
  // A transparent spotlight, exactly as the one-on-one mobile layout registers it. Registering a
  // grid tile instead was quietly opting out of everything that makes the upstream call screen
  // look the way it does: the page gradient showing through the tile, the sound waves that ring
  // the avatar while someone speaks, and the avatar sizing that leaves room for them.
  update.registerSpotlight([media.spotlight], true, "transparent");
  const tiles = update.build();
  return [
    {
      type: media.type,
      spotlight: tiles.spotlightTile!,
    },
    tiles,
  ];
}
