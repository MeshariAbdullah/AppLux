# Responsive layout QA — Lend

The app renders in one **MobileShell canvas** that adapts to the
viewport, with page content constrained again inside it by the shared
column classes. This checklist verifies the layout system across
device classes. Run it after any layout-affecting change; the
automated smoke suite (`npm run test:responsive`) covers the overflow
and shell-width invariants, this checklist covers what needs eyes.

## The system (what "correct" means)

| Breakpoint | Viewport | Shell canvas | Behavior |
|---|---|---|---|
| base | < 768px | up to 440px, full-bleed | phone layout, single column |
| `md` | 768–1023 (iPad portrait) | 720px centered card | wider gutters (32px), 2-col grids/forms, centered dialogs |
| `lg` | 1024–1279 (iPad landscape) | 960px centered card | DetailLayout pages go two-column with a sticky rail |
| `xl` | ≥ 1280 (desktop) | 1080px centered card | same as lg with more breathing room |

Content columns inside the canvas (`src/index.css`, mirrored by
`PageContainer`):

- `container-narrow` 520px — auth + focused forms
- `container-page` 640px — default reading/list column (padded
  `<Screen>` applies this automatically)
- `container-wide` 1024px — grid pages + two-column DetailLayout pages

Shared primitives (`src/components/layout`): `PageContainer`,
`ResponsiveGrid`, `DetailLayout`, `FormGrid`/`formGridFull`,
`ResponsiveStack`. Overlays: `Sheet`, `ConfirmSheet`,
`PaymentSimulationSheet` are bottom sheets under 768px and centered
dialogs (max 560px) from 768px.

## Viewports to check

360×740 (small phone) · 390×844 (iPhone) · 768×1024 (iPad portrait) ·
1024×768 (iPad landscape) · 1280×800 (desktop) · 1440×900 (wide).
Check Arabic (RTL, default) first, then English (LTR).

## Global invariants (every page, every viewport)

- [ ] No horizontal scroll on the document or inside the app scroller.
- [ ] Content sits in a centered column — nothing stretches
      edge-to-edge across a tablet/desktop canvas.
- [ ] The shell canvas itself never exceeds the width in the table
      above, and stays centered with even margins.
- [ ] Bottom nav / merchant tab bar: the four tabs stay a centered
      cluster (max 560px), not spread across the canvas.
- [ ] Primary actions (submit buttons, CTA rows) visible without
      sideways scrolling; touch targets ≥ 44px on phones.
- [ ] RTL: columns/grids mirror correctly; the DetailLayout rail sits
      LEFT in Arabic, RIGHT in English; chevrons/arrows point the
      right way.
- [ ] Dialogs: bottom sheet on phones (grab handle visible), centered
      card on tablet/desktop (no grab handle), Escape closes, focus
      lands inside.

## Per-area checks

### Auth (welcome, login, register, merchant welcome/login/register)
- [ ] Forms sit in the 520px column; fields and buttons never span a
      tablet edge-to-edge.
- [ ] Register steps 1–2: field pairs go two-column at ≥768px, the
      address textarea spans the full row; tab order unchanged.
- [ ] Welcome screens: CTAs capped at 440px, centered over the beige
      action sheet.

### Customer (home, stores, contracts, tracking, profile)
- [ ] Home: single centered 640px column; category grid stays 4-up.
- [ ] Stores: 1 column phone / 2 iPad portrait / 3 landscape+desktop;
      cards align top, names truncate.
- [ ] Contract/invoice/note tracking: centered reading column, sticky
      action bars still pinned to the bottom of the scroller.
- [ ] Disputes list: 2-up from 768px; chips wrap without overflow.
- [ ] Dispute details ≥1024px: status + claim facts become a sticky
      rail; evidence + phase panels fill the main column; on phones
      the order is unchanged.

### Merchant (dashboard, rentals, session wizard, damages, profile)
- [ ] Dashboard: stat tiles 2×2 on phones → one row of 4 at ≥768px;
      attention feed 2-up at ≥768px.
- [ ] Rentals list: 2-up at ≥768px inside the wide column.
- [ ] Rental session wizard: stays a focused 640px column at every
      size (deliberate — one decision at a time); its internal 2-col
      option grids still fit at 360px.
- [ ] Damage case details ≥1024px: hero + phase timeline + claim facts
      rail; evidence + panels main.

### Admin (home, users, merchants, cases, details)
- [ ] Admin home: module grid 2 / 3 / 4 columns as width grows.
- [ ] Users/merchants/cases lists: 2-up at ≥768px.
- [ ] Case details ≥1024px: summary rail + working main column.

### Overlays & misc
- [ ] Payment simulation sheet: centered dialog at ≥768px.
- [ ] Document preview overlay fits within the viewport at all sizes.
- [ ] Empty states and skeletons stay inside their columns (Stores
      skeletons render in the grid).

## Automated smoke suite

```
npm run test:responsive
```

Starts the Vite dev server (demo mode — a production build without
`VITE_SUPABASE_*` env shows the config-guard screen instead of the
app) and asserts — for every key public and demo-customer route at
all six viewports — render success, zero horizontal overflow, RTL
default, and the shell max-width. External requests (fonts) are
blocked inside the tests so offline/sandboxed CI never hangs. In an
environment with a system Chromium and no downloaded Playwright
browsers, point the runner at it:

```
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:responsive
```
