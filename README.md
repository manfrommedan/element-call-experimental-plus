# Element Call — experiments

> ⚠️ **Unofficial experimental fork.**
> This is a community-maintained build that is **not affiliated with, endorsed by, or
> coordinated with Element Hq Ltd. or the Element Call team**. It carries an opt-in
> phone-style 1:1 voice call UI that the embedding host activates with the
> `phoneVoiceLayout=true` URL flag; without it Element Call behaves exactly like
> upstream. Works as is, at your own risk. Please don't kick us.

Upstream project (the one this fork is based on):
[**element-hq/element-call**](https://github.com/element-hq/element-call).
For everything not listed below, please refer to the upstream README and docs.

## What's different from upstream

See [EXPERIMENTS.md](EXPERIMENTS.md) for the full list of changes shipped on the
`experiments` branch.

## Building the embedded bundle

```bash
pnpm install
pnpm vite build --config vite-embedded.config.ts
```

The bundle lands in `dist/` and is what the Element X Android experiments fork ships as
static assets under `app/src/main/assets/element-call/`.

## License

Same AGPL-3.0-only / LicenseRef-Element-Commercial dual licensing as upstream.
