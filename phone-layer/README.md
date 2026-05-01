# phone-layer

Fork-only sources for Element X+'s phone-style voice call experience. The
upstream Element Call codebase under `src/` stays bit-identical to
`origin/livekit`; everything fork-specific lives here and is plugged in
at build time via a small Vite resolver plugin.

## Goals

* `pnpm build` produces an upstream-equivalent bundle when
  `FORK_PHONE_LAYER` is unset — no fork code shipped, no fork tests run.
* `FORK_PHONE_LAYER=1 pnpm build` produces our embedded bundle, with the
  phone-style call view wired in.
* `git diff origin/livekit -- src/` returns zero changes once migration
  finishes. Every fork-only file lives under `phone-layer/`.

## Architecture

Element Call already has a clean layout system: each layout is a
self-contained triple of `state/<Name>Layout.ts`,
`grid/<Name>Layout.tsx`, and (sometimes) `grid/<Name>Layout.module.css`.
`CallViewModel.ts` selects between layouts in a switch on the layout
type tag from `state/layout-types.ts`.

The phone-style voice call view is currently bolted on by overloading
`OneOnOneLayout.{ts,tsx,module.css}` and threading `phoneVoiceLayout`
checks through `CallViewModel.ts`. Migration target is a clean
first-class layout in line with the upstream pattern:

* `phone-layer/src/state/PhoneVoiceLayout.ts`         — pure layout fn
* `phone-layer/src/grid/PhoneVoiceLayout.tsx`         — layout component
* `phone-layer/src/grid/PhoneVoiceLayout.module.css`  — its styles
* `phone-layer/src/components/VoiceFooter.{tsx,module.css}` — used by it
* `"phone-voice"` added as a tag in `layout-types.ts` (single touchpoint
  in `src/`, kept as a trivial extension of the discriminated union)
* `CallViewModel.ts` selection clause: a `case "phone-voice"` next to
  the existing layouts

After the refactor, `src/state/CallViewModel/CallViewModel.ts` retains
exactly one fork-touched line — the new switch case — which we still
override via the alias plugin so `src/` stays pristine.

## Build hookup

`vite.config.ts` registers `phoneLayerOverridePlugin()` (defined in
`phone-layer/vite-plugin.ts`). The plugin walks `phone-layer/src/`
once at config time, then overrides `resolveId` to redirect any import
that would resolve under `<repo>/src/<rel>` to
`<repo>/phone-layer/src/<rel>` when the mirror file exists. It's a
no-op when `FORK_PHONE_LAYER` is unset or `phone-layer/src/` is empty.

`vitest.config.ts` extends `test.include` to also pick up
`phone-layer/src/**/*.test.{ts,tsx}` in fork mode, so net-new tests
(PhoneVoiceMode.test.ts, etc.) run alongside upstream's suite.

The two assumptions worth flagging:

1. **No tsconfig path remapping** — fork files use the same relative
   import idiom as upstream so the alias plugin handles them via the
   normal resolver (vs. needing parallel paths in tsconfig.json).
2. **Single source of truth for entry** — `index.html` references
   `src/main.tsx`. The alias plugin catches HTML script-tag resolution
   too (it runs at the `resolveId` hook, not `transform`), so a
   `phone-layer/src/main.tsx` mirror also takes over the entry.

## Migration plan

| Step | Files | Mechanism |
| --- | --- | --- |
| 0 | `phone-layer/README.md`, `phone-layer/vite-plugin.ts`, vite/vitest config wiring | this commit |
| 1 | net-new files: `components/VoiceFooter.{tsx,module.css}`, `polyfills/promiseWithResolvers.{ts,test.ts}`, `state/CallViewModel/PhoneVoiceMode.test.ts` | move-only, no upstream rewrite |
| 2 | layout extraction: split fork-overloaded `OneOnOneLayout` into a new `PhoneVoiceLayout` triple; restore `OneOnOneLayout.{ts,tsx,module.css}` to upstream | upstream-aligned refactor |
| 3 | remaining mechanism-B files: `UrlParams.ts`, `state/initialMuteState.ts`, `state/layout-types.ts`, `state/CallViewModel/CallViewModel.ts`, `state/CallViewModel/remoteMembers/ConnectionFactory.ts`, `tile/SpotlightTile.tsx`, `room/InCallView.{tsx,module.css}`, `room/RoomPage.tsx`, `room/__snapshots__/InCallView.test.tsx.snap`, `main.tsx` | move to `phone-layer/src/`, restore `src/` from `origin/livekit` |
| 4 | snapshot drift verification under the alias plugin | `FORK_PHONE_LAYER=1 pnpm test --run` should be green |

Steps 1, 2, 3 each ship as a separate commit so the diff stays
reviewable.

## Verification

After every step:

```sh
# vanilla — must be byte-identical to upstream
pnpm test --run
pnpm build

# fork — picks up the phone-layer
FORK_PHONE_LAYER=1 pnpm test --run
FORK_PHONE_LAYER=1 pnpm build
```
