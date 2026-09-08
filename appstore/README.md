# App Store screenshots — Lend

Generated marketing screenshots composed from REAL app screens (demo
mode, fictional seeded data) — no mock UI, no invented features.

## Regenerate (Arabic set)

```
npm run dev          # in another shell (demo mode — no Supabase env)
npm run appstore:ar  # = node appstore/render.mjs
```

Outputs to `appstore/ar/`:

- `NN-lend-appstore-ar.png` — 1320×2868 (App Store Connect 6.9" slot)
- `NN-lend-appstore-ar-65.png` — 1284×2778 (6.5" slot)

The pipeline captures the five approved screens at iPhone 16 Pro Max
logical size (440×956 @3x) driving the real flows (the review wizard
is clicked through; approval is armed but never submitted), then
composes each capture into `template.html` and verifies exact
dimensions and the absence of an alpha channel. PNGs are untagged
(treated as sRGB).

## Shots

| # | Source screen | Headline |
|---|---|---|
| 01 | `/home` (`src/pages/Home.tsx`) | استأجر بثقة. ووثّق حقك. |
| 02 | `/review/RM-88231` step العرض (`src/pages/Review.tsx`) | راجع العرض والعقد بوضوح |
| 03 | `/review/RM-88231` step التأكيد (`src/pages/Review.tsx`) | وافق من التطبيق |
| 04 | `/track/contract/LND-Q7F3KD` (`src/pages/ContractTracking.tsx`) | تابع إيجارك من مكان واحد |
| 05 | `/merchant/home` (`src/pages/merchant/MerchantHome.tsx`) | للمتاجر: إيجارات منظّمة وموثّقة |

## English set later

Add a second SHOTS list in `render.mjs` with `locale: 'en'` and the
English copy — the template is direction-aware (`locale` flips
`dir`), fonts for Latin (Inter) are already bundled, and file names
follow `NN-lend-appstore-<locale><suffix>.png`.

## Notes

- `appstore/fonts/` bundles IBM Plex Sans Arabic + Inter (SIL OFL,
  via the @fontsource packages) so rendering needs no network; the
  same files are injected into the app pages during capture in place
  of the Google Fonts request, so captures use the production
  typefaces.
- Brand rules enforced by the template: no letter-spacing on Arabic
  (the Latin LEND wordmark alone carries 0.35em), the approved Lend
  mark geometry, one green phrase per shot, navy/beige alternation.
- Capture intermediates land in `appstore/.captures/` (gitignored).
