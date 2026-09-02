# TRENCHER

Private desk. Paper gulag + Hatch live clip wallet.

This repo is the app. **Do not commit the hot-wallet secret.** That lives in the browser (or on a box you control), never in git.

## grok.me

Publish from Grok as usual. Seat **cloud** with a desk code so phone and laptop share one Hatch.

## DigitalOcean (always-on)

A $6 App or Droplet pointed at this private repo keeps a process up. It serves the site. Scout still needs a hunter (a tab with the desk unlocked, or later a worker). The hot key is not in this repo.

Create an App in DigitalOcean → GitHub → `whoyoujoshin/trencher` → HTTP port **8080**.

## Local

```
npm ci
npm run dev
```

Listens on port 8080.
