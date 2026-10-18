# Penalty Mini App — implementation QA, 2026-10-17

final result: passed

## Current visual truth

The owner superseded the separate Telegram palette with the existing platform's
design language. The earlier selected mock still defines the centered heading
and hand-drawn characters, not the final colors, radii, or typography.

Evidence directory (all captures contain isolated test data):
`/Users/denissadykov/.codex/visualizations/2026/09/10/01a08b8d-f63c-7712-9bab-31423f067c3a/penalty-miniapp-2026-10-17/qa/`.

Source: `platform-style-source-light-390.jpg`, 390 × 844 pixels, captured from
the actual platform dashboard rendered inside the Mini App. Dark source:
`platform-style-source-dark-390.jpg`, 390 × 844 pixels.
Secondary composition reference: `../reel-centered-v2.png`, 853 × 1844 pixels,
viewed at its native density and normalized to 390 pixels wide when comparing.
Its old spelling and violet controls are intentionally superseded.

Implementation: http://127.0.0.1:3005/miniapp/penalties.
Primary screenshot: `platform-style-pending-light-final-390.jpg`, 390 × 844.
Active state: `platform-style-active-dark-fixed-390.jpg`, 390 × 844.
Working list: `platform-style-working-dark-390.jpg`, 390 × 844.
CSS viewport 390 × 844; screenshot density 1 pixel/CSS pixel. No browser chrome
or synthetic device frame is included. Source and implementation were opened
together in the same multi-image comparison input, not claimed as a stitched
side-by-side image. The auxiliary HTML comparison was not used as evidence
because the browser disallows local file URLs.

## Required fidelity surfaces

- Typography: same `--font-ui` as the platform, 14px ordinary controls/text,
  26px centered feature heading, 600–700 emphasis. The larger centered heading
  is the owner's explicit exception to the dashboard's smaller left heading.
  Long pupil nicknames truncate within the native select, not over its label.
- Layout: same platform 4px button/6px card radius, 1px border, flat surfaces,
  12–16px section rhythm. Native-sized 46–50px actions retain mobile usability.
  Three equal navigation tracks have >=56px tap height. The main pending CTA
  is above navigation at 390 × 844. Active long-description CTA bottom after
  correction is 758.74px, navigation starts at 772.61px. Smaller viewports
  scroll normally with 90px bottom clearance and no horizontal overflow.
- Colors: no independent Telegram palette; aliases use `--bg-dark`, `--bg-card`,
  `--text-primary`, `--text-secondary`, `--accent`, `--button-bg`, `--border`.
  Light background computed rgb(246,247,249), primary rgb(9,105,218); dark
  background rgb(11,15,20), primary rgb(35,129,232). Shared saved theme and
  accents are preserved. Theme changes made in the embedded platform apply
  immediately when returning to the roulette.
- Imagery: actual optimized alpha WebP asset, 233KB, not CSS/SVG imitation.
  Both original characters, hatching, purple shirt, cord and wristband remain;
  handwritten words/signatures are removed. Full characters are contained, not
  cropped. Pending image is 198px high; active image is intentionally 100px
  to keep task actions visible. Lucide icons match the platform's icon family.
  Built-in ImageGen produced the raster asset; prompt and PNG are retained at
  `../assets/miniapp-hero-prompt.txt` and `../assets/miniapp-hero-art-v1.png`.
  Consumed file: `frontend/public/penalty-miniapp-hero.webp`.
- Copy: correct «Выдаватель пенальти», distinct «Выдать другое» and
  «Зафиксировать пенальти». The timer starts only after fixation, and task
  changes explicitly state that the same two-hour timer continues.

Focused comparison evidence: `platform-style-controls-light-final-390.jpg`,
390 × 468 crop from the actual browser view, inspected together with the full
platform/card source and selected illustration mock. At this density the form
labels, icons, borders, selected row, and action typography are fully readable.

## Iteration history

1. Initial separate native Telegram theme was valid for the earlier brief but
   superseded by the owner's latest request. Replaced all color, font and radius
   definitions with the platform tokens. Evidence: final pending capture above.
2. [P2, fixed] Native global dark-select decoration repeated arrows over the
   pupil nickname. More specific scoped background-image:none restores exactly
   one library chevron. Before: `platform-style-active-dark-390.jpg`; after:
   `platform-style-active-dark-fixed-390.jpg` (computed background-image:none).
3. [P2, fixed] Active long-description primary action extended to 793.74px under
   the bottom menu at 772.61px. Reduced only the active mascot height from 135px
   to 100px (90px on narrow devices). Recapture confirms bottom 758.74px.
4. [P2, fixed] Main site navigation would have left Telegram Web's allowed
   entry URL. Embed the real platform with hash routing and in-memory return
   callbacks, not an iframe or external browser. Evidence:
   `platform-embedded-schedule-light-390.jpg`, 390 × 844. Main platform
   authentication/initial-password requirements are not bypassed.

No actionable P0/P1/P2 visual findings remain. The larger centered title,
mascot, selected reel row and bottom navigation are intentional feature-specific
differences, not a redesign of the rest of the platform.

## Interaction and responsive checks

- Server-selected preview/reroll leaves the existing penalty/timer unchanged.
- Fixation adds the pupil to «Отрабатывают сейчас»; opening their row restores
  the same task and deadline. Completing a quick task records history and assigns
  another without resetting the deadline. Reload restoration tested.
- Expired synthetic session requests explicit confirmation, then waits for
  unlocking; no automatic unlock or early finish. Existing 4-hour penalties
  require two confirmed two-hour units (server tests).
- Actual platform dashboard and schedule open inside the same app, and return
  navigation preserves the Mini App client/preview. Ordinary site login remains
  necessary if its separate session is absent.
- 320 × 740, 390 × 844 and 768 × 1024 views checked; 320px long-nickname and
  list captures are `platform-style-long-nick-light-320.jpg`,
  `platform-style-working-dark-320.jpg`; tablet list:
  `platform-style-working-dark-768.jpg`. No horizontal overflow. Keyboard
  labels/focus, confirmation dialog focus containment and reduced motion are
  implemented and covered by code/tests.
- Fresh browser console after initial load and embedded-platform transition:
  zero warning/error entries. Older HMR/test-server-restart logs excluded.
- Automated: backend/infra 286 passed; frontend 166 passed; production build
  successful; added Python modules pass Bandit; git diff --check clean.

## Release boundary / remaining verification

This is a working local implementation, not a production deployment. No real
messages, production penalties or production schema were changed. Actual
Telegram device launch and production nginx -t still require release validation.
Before publishing, follow `infra/play2go/README.md`: fresh backup, explicit
additive migration, application release, separately validated scoped nginx
configuration and command-menu synchronization. The existing external browser
protection is retained outside the two Mini App entry routes.
