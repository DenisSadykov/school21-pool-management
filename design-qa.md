# Penalty Mini App — lilac studio QA, 2026-10-18

final result: passed

## Current selected visual truth

The owner selected the first displayed image from the second ideation set,
then explicitly removed only the SCHOOL21 wordmark. That choice supersedes
the platform-like composition documented in the historical report below.

Source: `/Users/denissadykov/.codex/generated_images/01a01870-c8de-7fc3-ad92-f26e9ef45cef/exec-71cf2ff5-445c-4271-b8b9-b7ec701018f7.png`.
Source pixels: 853 × 1844; normalized to 390 × 844 CSS pixels for comparison.
Implementation: `http://127.0.0.1:3005/miniapp/penalties`.
IAB screenshot: `/tmp/penalty-studio-light-390-final.png`, 390 × 844, density 1.
Same state: synthetic selected pupil, preview of «Порядок на стенде», no running
timer and no committed penalty. Browser/device chrome is excluded.
Combined comparison: `/tmp/penalty-studio-comparison-final.png`, source left,
implementation right, opened together in one image. Full-view typography and
controls are readable at this scale; no extra focused crop was necessary.

## Required fidelity surfaces

- Typography: locally bundled open-source Oswald Bold for the two-line feature
  heading; bold system sans for task titles; readable 15px instructions. Cyrillic
  is supplied by the full official font file, with OFL included. Long live task
  titles and instructions wrap without truncation. Display-font optical weight
  differs slightly from the generated mock, a nonblocking P3 refinement.
- Layout: cream page, mascot beside the heading, pupil pill, paper ticket,
  separate duration, violet fixation action and flat three-destination menu.
  The latest 390 × 844 capture keeps the action and its explanatory hint above
  navigation. Longer actual catalog tasks scroll with reserved menu clearance.
  The wordmark removal is intentional; pupil options retain their pool numbers.
- Colors: cream #faf7f1, violet #5830d6, pale lilac paper and dark ink. Dark mode
  uses a violet-black canvas while retaining dark text on the light paper.
  Keyboard focus on paper controls has an explicit dark-violet outline.
- Images: actual supplied character WebP, contained without cropping; independent
  ImageGen paper-ticket raster (780 × 800, alpha WebP, approximately 98KB).
  Nine-slice border-image preserves paper edges around variable-length content.
  No placeholder images, CSS-drawn illustration, or handwritten SVG substitutes.
  Existing Lucide stroke icons match the source's simple icon family.
- Copy: approved heading, no SCHOOL21 wordmark; separate random selection and
  fixation; complete task instructions; «Таймер начнётся после фиксации».
  «Выбрать другое» retains the established accessible action name. No new rules,
  penalty records, permissions, notifications, or automatic timer completion.

## Comparison history

1. P2: initial ticket spacing pushed the helper under the persistent menu.
   Evidence: `/tmp/penalty-studio-comparison-before.png`. Reduced paper padding,
   header/ticket gaps and duration margin, without reducing tap targets.
2. P2: initial Google CSS download did not give the intended Cyrillic rendering.
   Replaced it with the full official Oswald font; no external font request at runtime.
3. Recaptured final IAB screenshot at the top of the document, re-opened combined
   source/implementation comparison. Primary action and helper are unobscured.
   No actionable P0/P1/P2 differences remain. Residual P3: exact generated font
   weight and decorative pencil-stroke placement are not pixel-identical.

## Interaction / verification

IAB: isolated login, pupil selection, random preview, own-task tab and text input.
The first visual fixture omitted the single-penalty polling response and caused
a fixture-only console error; the local fixture and automated fixture were
corrected, without changing production fetching or error handling.
Automated unit coverage retains signed preview/commit, replacement without timer
reset, confirmation after expiry, roles and navigation. New e2e coverage exercises
320/390px in both themes, full task copy, no wordmark, no auto-commit, explicit
commit and working-list navigation. All data is isolated and synthetic.

Backend: 404 passed. Frontend: 192 passed, 23 suites; production build passed.
Infra: 55 passed. E2e: final full rerun after the contrast/focus correction:
26 passed (23.3s), unchanged worker/retry/timeout settings. A pre-existing timestamp-at-collection
test failed on a slow run; relative signatures are now built at execution time,
with every rejection assertion unchanged. No application backend was changed.

## Historical report (superseded visual direction)

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
