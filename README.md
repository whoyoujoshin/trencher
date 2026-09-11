# TRENCHER

Private desk. Paper gulag + Hatch live clip wallet.

This repo is the app. **Do not commit the hot-wallet secret.** That lives in the browser (or on a box you control), never in git.

## grok.me

Publish from Grok as usual. Seat **cloud** with a desk code so phone and laptop share one Hatch.

## DigitalOcean (always-on)

App Platform reads `.do/app.yaml` and the Dockerfile. It builds a Node server (not Vite) and listens on 8080. A small Postgres holds the chamber so hunter/watch survive deploys.

1. DigitalOcean → **Create** → **Apps** → GitHub → `whoyoujoshin/trencher` → branch `main`.
2. It should pick the Dockerfile. HTTP port **8080**.
3. Paste `XAI_API_KEY` (META) and `GMGN_API_KEY` (Warden) as runtime secrets if you want those rails live on the box.
4. Every push to `main` redeploys.

Without Postgres the chamber lives only until the next deploy. Attach the spec database (`trencher-db`) or set `DATABASE_URL` yourself.

Hot keys stay in the hunter tab. The box never holds them.

## Local

```
npm ci
npm run dev
```

Listens on port 8080.

Production image:

```
NITRO_PRESET=node-server npm run build
npm start
```
