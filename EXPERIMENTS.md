# Element Call - experiments fork

This branch carries small UX changes targeting the embedded Android client (Element X
Android - experiments). Everything is opt-in via a URL flag so the standard Element Call
behaviour is unchanged for any host that doesn't pass the flag.

## ⚠️ Disclaimer

* **Unofficial.** Not affiliated with, endorsed by, or coordinated with Element Hq Ltd. or
  the Element Call team.
* **Experimental.** Builds are produced from a moving branch; expect rough edges.
* **As is, at your own risk.** No warranty, no support contract, no SLA.
* **Don't kick us.** Please don't open issues against `element-hq/element-call` for
  changes that originated here.

## What's different from upstream

### 📞 Phone-style 1:1 voice call layout (opt-in via `phoneVoiceLayout=true`)

When the embedding host adds `phoneVoiceLayout=true` to the Element Call widget URL,
audio-only 1:1 calls render with:

* A four-button bottom row (microphone / audio output / video / hang up) replacing the
  standard `CallFooter`.
* The remote tile expanded to fill the screen, local PiP suppressed, the "Calling…"
  ringing-status overlay hidden.
* A synthesised classic 440 + 480 Hz Bell-System ringback while waiting for pickup.
  The upstream lobby ringtone, earpiece overlay, and obscured-content gate are
  suppressed since the phone-style layout already covers the same ground.

Without the flag, every screen behaves exactly like upstream Element Call - including
the lobby ringtone, the earpiece overlay, and the standard `CallFooter`.

### 🛡️ Legacy Android WebView polyfill

A small `Promise.withResolvers` polyfill is injected at the top of the embedded
`index.html` so the bundle boots cleanly on older Android system WebViews
(notably Huawei devices on Chromium &lt; 119). The polyfill is contained in a dedicated
file (`vite-plugins/promiseWithResolvers.polyfill.js`) and inlined through Vite's
stable HTML-tag injection API, so the rest of the project remains browser-list driven.

## Building

```bash
pnpm install
pnpm vite build --config vite-embedded.config.ts
```

The embedded bundle lands in `dist/` and is what the Element X Android fork ships as
static assets under `app/src/main/assets/element-call/`.

Tests:

```bash
pnpm tsc --noEmit
pnpm vitest run src/UrlParams.test.ts
```

## Activating the phone-style layout from a host app

Append `&phoneVoiceLayout=true` to the widget URL fragment query, after the standard
widget params (it lives in the URL hash alongside `widgetId`, `parentUrl`, `intent=audio`,
etc.). The flag is declared in `UrlParams.ts` as a member of `UrlConfiguration` and
defaults to `false` so any host that doesn't pass it gets upstream behaviour.

## License

Same AGPL-3.0-only / LicenseRef-Element-Commercial dual licensing as upstream.
