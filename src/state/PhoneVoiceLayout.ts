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
  const update = prevTiles.from(1);
  update.registerGridTile(media.spotlight);
  const tiles = update.build();
  return [
    {
      type: media.type,
      spotlight: tiles.gridTilesByMedia.get(media.spotlight)!,
    },
    tiles,
  ];
}
