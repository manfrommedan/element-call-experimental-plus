/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type OneOnOneLayout, type OneOnOneLayoutMedia } from "./layout-types";
import { type TileStore } from "./TileStore";

/**
 * Produces a one-on-one layout with the given media. Pip is optional —
 * phone-style 1:1 voice mode hands the layout a media object without it,
 * and the layout renders the spotlight tile alone.
 */
export function oneOnOneLayout(
  media: OneOnOneLayoutMedia,
  prevTiles: TileStore,
): [OneOnOneLayout, TileStore] {
  const update = prevTiles.from(media.pip === undefined ? 1 : 2);
  if (media.pip !== undefined) update.registerGridTile(media.pip);
  update.registerGridTile(media.spotlight);
  const tiles = update.build();
  return [
    {
      type: media.type,
      spotlight: tiles.gridTilesByMedia.get(media.spotlight)!,
      pip:
        media.pip === undefined
          ? undefined
          : tiles.gridTilesByMedia.get(media.pip),
    },
    tiles,
  ];
}
