---
name: School21 Pool Management
description: Observed incumbent application styles; extraction only.
colors:
  accent: "#0969da"
  accent-dim: "#0550ae"
  accent-muted: "rgba(9, 105, 218, 0.1)"
  button-fg: "#ffffff"
  text-primary: "#1f2328"
  text-secondary: "#59636e"
  text-muted: "#6e7781"
  bg-dark: "#f6f8fa"
  bg-card: "#ffffff"
  bg-elevated: "#f6f8fa"
  bg-hover: "#f3f4f6"
  bg-sidebar: "#ffffff"
  border: "#d0d7de"
  border-soft: "#d8dee4"
  success: "#1a7f37"
  danger: "#cf222e"
  warning: "#9a6700"
  note-text: "#6c4f11"
  note-strong-text: "#8b2c00"
  note-control-bg: "rgba(255, 255, 255, 0.62)"
  note-subtle-bg: "rgba(246, 248, 250, 0.72)"
  light-bg-dark: "#f6f7f9"
  light-bg-elevated: "#ffffff"
  light-border: "#e5e7eb"
  light-border-soft: "#edf0f4"
  dark-accent: "#58a6ff"
  dark-accent-dim: "#79b8ff"
  dark-accent-muted: "rgba(88, 166, 255, 0.14)"
  dark-button-bg: "#2381e8"
  dark-button-hover: "#3993f3"
  dark-text-primary: "#edf2f7"
  dark-text-secondary: "#aab6c4"
  dark-text-muted: "#7f8c9d"
  dark-bg-dark: "#0b0f14"
  dark-bg-card: "#121820"
  dark-bg-elevated: "#18202a"
  dark-bg-hover: "#202a35"
  dark-bg-sidebar: "#0f141b"
  dark-border: "#2a3542"
  dark-border-soft: "#202a35"
  dark-success: "#56d364"
  dark-danger: "#ff7b72"
  dark-warning: "#e3b341"
  dark-note-text: "#f0d98a"
  dark-note-strong-text: "#ffb77c"
  dark-note-control-bg: "rgba(11, 15, 20, 0.36)"
  dark-note-subtle-bg: "rgba(18, 24, 32, 0.62)"
typography:
  headline:
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontSize: "0.875rem"
    fontWeight: 600
  table-heading:
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "normal"
  badge:
    fontFamily: 'ui-monospace, SFMono-Regular, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace'
    fontSize: "0.68rem"
    fontWeight: 650
rounded:
  sm: "3px"
  md: "4px"
  lg: "6px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  2xl: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.button-fg}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
  button-primary-hover:
    backgroundColor: "{colors.accent-dim}"
  button-primary-dark:
    backgroundColor: "{colors.dark-button-bg}"
    textColor: "{colors.button-fg}"
  button-primary-dark-hover:
    backgroundColor: "{colors.dark-button-hover}"
  button-secondary:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "0 12px"
  navigation-active:
    backgroundColor: "{colors.accent-muted}"
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
    padding: "0 10px"
  form-panel:
    backgroundColor: "{colors.bg-card}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
---

# Design System: School21 Pool Management

## Overview

This document records the existing working interface: compact system typography, blue actions and links, neutral surfaces, thin borders, and small rounded corners. It establishes no new identity, metaphor, palette, or component behavior. Existing CSS remains implementation authority; the frontmatter is its extracted token reference.

Sources are `frontend/src/styles/theme.css`, `Pages.css`, `App.css`, `Navbar.css`, and `Sidebar.css`; `frontend/src/pages/MyNotes.jsx` and `frontend/src/styles/MyNotes.css` provide the ordinary extension example. `docs/student-notes.md` and `.impeccable/surfaces/frontend-src-pages-mynotes-jsx.md` explicitly preserve the incumbent world. Original-checkout `PRODUCT.md` supports familiar patterns, both themes, visible keyboard focus, and reduced motion; it is not present in this worktree and was read only.

**Key Characteristics:**

- Compact system typography and semantic blue accents.
- Thin borders and tonal surface separation.
- Theme-aware controls with visible keyboard focus.
- Responsive stacking and larger touch controls.

Evidence limits: `.impeccable/review/desktop.png` (1280 × 900) and `mobile.png` (390 × 844) show the light-theme MyNotes list after an edit, with a success message, search, ordering, and pagination. The refreshed desktop capture shows the expanded 210px sidebar, as confirmed by the user after the test waits were updated. They corroborate those captured states only. Dark theme, editor, confirmation, hover, and focus details below come from source, not a fresh rendered review. No browser was used. No synthetic tonal ramps or qualitative identity claims were added.

## Colors

### Primary

The accent family supplies blue links, selected navigation, focus outlines, and standard primary actions. In root and explicit light styles, `--button-bg` equals `accent`, and `--button-hover` equals `accent-dim`; `--info` equals `accent`. Dark buttons have separate blue values and must not be substituted with the dark link accent.

### Neutral

Text uses primary, secondary, and muted levels. Page background, panel, elevated control, hover, and sidebar each have semantic assignments. Borders use regular and soft variants. Names follow CSS, including the historical `bg-dark` name, which denotes the page background in both themes.

Frontmatter entries without a theme prefix reproduce `:root`. Explicit `[data-theme="light"]` changes page background, elevated background, and the two border colors; the `light-*` entries record those changes. `[data-theme="dark"]` overrides are represented by `dark-*` entries. Unchanged values inherit from root. No light/dark averaging or palette normalization is implied.

### Semantic status

Success, danger, and warning colors have corresponding dark overrides. Status text, badges, and destructive controls use those meanings. Existing badges pair text with a tinted background and border; their literal tints remain in the component snippets. Warm note gradients already exist in the theme but are not used by the MyNotes list. Their exact CSS is in the sidecar because gradients are backgrounds, not color primitives.

## Typography

Body uses the existing system UI stack and a 14px size with 1.5 line height. Page headings inherit that stack and use the extracted headline role. There is no extracted display-font or hero-type system.

Shared form labels use the label role; table headings use the smaller table-heading role with normal letter spacing and no forced uppercase. Badges use the incumbent mono stack, including its repeated `SFMono-Regular` entry. Sidebar section labels are a local uppercase treatment (0.75rem, weight 600, 0.08em tracking).

MyNotes locally uses 1.05rem secondary headings, 0.8rem timestamps/counters, and 0.875rem labels/privacy text. Note prose preserves line breaks and wraps long content, with 1.6 line height and a 75ch maximum; empty-state copy is limited to 65ch. Mobile MyNotes fields use 16px text. These are surface observations, not additions to a global type scale.

## Layout

The shell is a column flex layout with a 48px top bar and a flex content row. The desktop sidebar is 210px wide, with a 58px closed variant. Main content scrolls independently and has 14px vertical / 22px horizontal padding. Shared pages and the optional centered container have a 1400px maximum; pages are not automatically centered.

Shared page headers arrange title and actions in a row with a 14px bottom margin. Reusable spacing follows the extracted six-step scale, while layout styles also contain literal measurements. Shared forms use auto-fit columns with a 150px minimum; utility grids use 300px or 250px column minima. Tables keep their own horizontal overflow container.

At `max-width: 768px`, page headers and form actions stack, primary/secondary buttons become full width, and form rows become one column. Main content uses 14px horizontal padding and bottom padding of `calc(108px + env(safe-area-inset-bottom, 0px))`; its last child has an additional safe-area-aware bottom margin. The mobile shell uses `100dvh`. The sidebar becomes a fixed drawer below the top bar, at `min(292px, calc(100vw - 36px))`, with an overlay.

MyNotes is a local 1050px-wide page: toolbar columns are `minmax(0, 1fr) 220px`, gap 16px, margin 20px vertically. At the shared breakpoint the toolbar stacks with a 12px gap. Its editor padding changes from 20px to 14px, and its footer and selected-peer scope stack. Its buttons and input/select controls have a 44px minimum height at all widths. These measurements do not replace shared defaults.

## Elevation & Depth

Pages, notes entries, the top bar, and active navigation primarily use borders and tonal layering. MyNotes entries are flat rows with top dividers; the editor is a bordered panel without a shadow. Existing shadow tokens remain available: small, medium, and large have exact root and dark values in the sidecar. A theme-toggle thumb uses the small shadow; floating dropdowns and mobile drawers also define their own literal shadows.

Global state transitions use `150ms ease-in-out`; body theme colors transition with `180ms ease`. The existing loading logo rotates over 1.1s and the pool badge has a 4.8s pulse. These are observed exceptions, not a requirement to animate new panels. Reduced-motion styles reduce global animation/transition durations to 0.01ms and disable the pool pulse.

## Shapes

The shared radius vocabulary is small (3px), medium (4px), and large (6px). Standard buttons and panels use the large radius; single-line fields and navigation use medium. Borders are normally 1px. Existing pills use 999px and avatars use 50%; navbar compact controls use 10px. Those component-local shapes do not expand the shared radius tokens.

MyNotes fields and icon actions use medium corners. Its editor uses large corners. Its note entries retain a simple horizontal divider rather than a separate card silhouette.

## Components

### Buttons

Shared primary and secondary buttons use 14px text, weight 600, 1.4285 line height, 12px horizontal padding, and an 8px icon gap. Minimum height is the global control height: 30px normally, 44px for coarse pointers or at the mobile breakpoint. Primary buttons use button background/foreground tokens and blue translucent borders; hover uses the button-hover token. Secondary controls use elevated/hover surfaces and regular/secondary-text border states. Keyboard focus uses a 2px accent outline with 2px offset.

MyNotes reuses these variants and adds its 44px minimum and disabled opacity (0.55) with a not-allowed cursor. Its transparent edit/delete icon buttons are 44px wide with 18px Lucide icons. Delete confirmation stays inline. These local states are not asserted for every shared button.

### Inputs / Fields

Shared single-line controls use the global height, medium corners, elevated background, 1px border, and 12px horizontal padding. Textareas use 9px vertical padding, 1.5 line height, and vertical resize. Focus changes border to accent and background to card, with a 3px focus-ring shadow; focus-visible also supplies the global outline. Selects use an existing inline SVG chevron.

MyNotes overrides field background to card and padding to 10px 12px. Search reserves 38px left padding for its 18px icon. Labels remain visible above controls; textareas retain vertical resize and 1.6 line height.

### Cards / Containers

Shared form panels use card background, 1px border, large corners, and large spacing padding. Tables use the same bordered surface and corner treatment; headers use elevated backgrounds and cells use 9px 12px padding, with bottom dividers and tonal row hover. MyNotes uses this form vocabulary for editing and a flat list for saved entries.

### Chips / Badges

Shared confirmed/pending badges have a 20px minimum height, 1px 6px padding, small corners, mono type, and semantic text plus translucent background/border. User role pills are a separate navbar treatment using accent-muted, accent text, and fully rounded corners.

### Navigation

Sidebar links use secondary text, medium corners, 10px horizontal padding, a 9px icon gap, and the global control height. Hover changes to elevated surface and primary text; active links use accent-muted, accent text, and weight 600 with no shadow. Their icons render at 14px with a 1.75 stroke despite the JSX icon-size prop. Existing route-specific icon colors are local overrides; MyNotes reuses the students tone. The mobile drawer and top-bar menu follow the shared 768px breakpoint.

## Do's and Don'ts

### Do:

- Do reuse semantic CSS variables and their existing light/dark overrides.
- Do retain shared system typography, thin borders, and compact corner radii.
- Do preserve visible keyboard focus and reduced-motion behavior.
- Do keep MyNotes-specific sizing and list composition scoped to that surface.

### Don't:

- Don't treat the root palette as the explicit light-theme palette where overrides exist.
- Don't replace dark primary-button colors with the dark link accent.
- Don't promote note gradients or navbar pill shapes into every panel.
- Don't present screenshot-unseen states as visually verified.
