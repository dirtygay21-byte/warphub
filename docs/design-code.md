# WarpHub design code

Recorded 30.10.2026. The visual rules behind today's work: avatar frames (rank and supporter), their animations, and the «Как играть» tutorial drawings. Use this before changing or adding any of them.

Live sources of truth:

- Design canvas «WarpHub Redesign Concept» (claude.ai artifact `GpSpEG6HyhbgkPJFRVV6bx`), boards Frames, Supporter, Tutorial40K, TutorialAoS, TutorialKT, TutorialWarcry.
- Generators in `tools/design/` (copied from the design session). Generated files must not be edited by hand.

## 1. Core tokens (client/src/global.css, tailwind.config)

| Token | Value | Use |
|---|---|---|
| accent | `#ECFE46` (236 254 70) | brand lime: active state, own models, primary buttons |
| accent-foreground | `#101010` | text on lime |
| bg / app-bg | `#111110` | screen background |
| bg-elevated | `#1A1A18` | cards, sheets |
| bg-field | `#242422` | grouped rows inside sheets |
| text / fg | `#F4F4F0` | main text |
| text-2 / fg-2 | `#B8B8B0` | secondary text |
| text-3 / fg-3 | `#8E8E86` | captions, kickers |
| danger | `#F87171` | enemy, "!" notes, errors |
| warn | `#FBBF24` | warnings |
| ease-out-soft | `cubic-bezier(0.2, 0.8, 0.2, 1)` | all enter / sheet motion |

Fonts: Inter Tight (body), Oswald (`font-display`, uppercase titles), UnifrakturMaguntia (only the Корона клуба inscription). Minimum UI text 12 px; touch targets 44 px (`.ds-hit`).

## 2. Rank frames (AvatarFrame)

Code: `client/src/components/ui/AvatarFrame/AvatarFrame.tsx` + `frames.generated.ts` (from `tools/design/frames/gen.py`).

Geometry (shared by all 16 frames):

- viewBox `-110 -110 220 220`, centre (0,0) = avatar centre; avatar radius `AV = 52` units.
- Frame always round (owner's rule). It is drawn over the avatar edge and never catches taps.
- Reach beyond the avatar by rank: `EXTENT = [62, 72, 92, 112]`. The component reserves margin so the frame never covers text.
- Profile shows the avatar at 104 px, so 1 unit = 1 px.
- Ids and classes are prefixed `af-` (ids: `af-iron`, `af-paint`, `af-dndglow`, `af-whaura`, `af-glassg`).

Ranks (backend `modules/progress/rules.ts`): Новичок 0–4, Игрок 5–14, Опытный 15–39, Ветеран 40+. Only confirmed bookings that already ended count; cancelled never count.

Category styles (each grows richer by rank, only Ветеран is fully animated):

| Category | Style | Materials / motifs | Ветеран motion |
|---|---|---|---|
| Warhammer | gothic, massive | iron ring with rivets, lancet windows with lime glass, spires, buttresses, skulls, chains | aura breathe, slow-spinning ring, flickering glass, eyes, swaying chains |
| D&D | fantasy | gold, leaves, runes, d20 | glow, spin and counter-spin, pulse, twinkling stars |
| Painting | growing, playful | brush strokes, colour, drips | spin, drips, popping colour dots |
| Visits | evolving board-game track | track, tokens, dice | slow spin, rolling die, pulse |

Locked decisions: Warhammer Ветеран unchanged; Игрок and Опытный have no top star cap and no bottom red ornament (keystone and seal removed); Опытный must lead naturally into Ветеран; D&D Новичок and Игрок clearly different.

## 3. Supporter frames (SupporterFrame)

Code: `SupporterFrame.tsx` + `supporters.generated.ts` (from `tools/design/frames/supporter.py`). Assigned per player in Admin → Поддержка клуба (`club_supporters`, titles `flame | crown | banner`). A supporter frame replaces the rank frame in Profile. Badge: «★ <title> · Поддерживает клуб». All three designs are LOCKED.

Structure:

- Two SVG layers split at the `<!--FRONT-->` marker: **back** (under the photo: banner, storm) and **front** (over the edge: rings, crown).
- Own viewBox per design: flame `-125 -125 250 250`, crown `-130 -142 260 267` (room for the crown above), banner `-125 -125 300 250` (flag flies right).
- Ids `af-sp-*`, classes `sp-*`. Gold gradients `af-sp-goldv` / `af-sp-goldd`; filters `turb`, `turb2`, `mist` (feTurbulence + displacement), `glow`, `bloom` (blur), `shadow`.
- Shared base: golden light from inside, gothic symbol band (quatrefoil, cross, fleur, trefoil), bevelled gold rim, sheen sweep.

| Title | Look | Motion |
|---|---|---|
| Пламя варпа (flame) | green warp storm from the owner's reference; lightning always visible and shimmering inside the narrow ring; no outer lightning | drift, throb, shimmer, sweep |
| Корона клуба (crown) | traditional gothic king's crown from the owner's photo, raised above the ring, in front; inscription "The Imperium Will Live Forever ✠" repeated all the way round; strong gold glow | float, throb, sweep |
| Знамя (banner) | long straight rectangular flag behind the avatar, flowing right, club lime colours with the WBG mini-logo (`LOGO_D` from `WBG.svg`); sharp laurel wreath; fog below and behind | SMIL wave on the cloth, fog drift-x / drift-x2, float |

## 4. Motion rules

- Frames animate with CSS classes (`af-*`, `sp-*` in global.css). Durations are slow and looping: spins 18 s / 30 s / 40 s, pulses 2.2–4 s, flag wave 3.6 s, fog 7–9 s.
- Rotations use `transform-box: view-box; transform-origin: 0 0` (rotate around the avatar centre); local effects use `fill-box; center`.
- Reduce motion: `@media (prefers-reduced-motion: reduce)` stops every `af-` and `sp-` class; SMIL `<animate>` tags (banner only) are stripped at render by `still()` in SupporterFrame.
- App-wide motion (`ds-enter` 220 ms, `ds-sheet` 280 ms, `ds-fade` 200 ms, `ds-pop` 600 ms, `ds-press`) also stops under reduce motion.

## 5. Tutorial drawings («Как играть»)

Code: `client/src/components/tutorial/` — `content.ts` (texts, one `TutorialGame` per game), `TutorialDiagram.tsx` (all drawings, keyed by `diagram`), `TutorialPages.tsx` (hub `/learn`, viewer `/learn/:game?step=N`). Canvas source: `tools/design/tutorial/*.py`.

Visual language (keep it for any new card):

- Board 320 units wide, dark panel `#22221F` with a 16-unit dot grid, rounded 14; scales to the card width.
- Bases seen from above: ring 2.5 stroke + 22 % fill. **Lime = yours, red `#F87171` = enemy, gold `#E8B84A` = objective.** Dashed circle = a range (combat range, control range, coherency); dashed base = where the model ends up.
- Distance = double-headed arrow with a pill label ("Range = 24″"); dotted ticks mark base edges (measure edge to edge).
- Stat tiles: light `#ECECE4` boxes with dark numbers; table headers `#3B4A44`; panels `#2C2C29`.
- Dice: light square = success, dark = fail, lime outline = critical / single.
- Card: Oswald uppercase title, English rules term underneath, lime diamond = phase number, 2–3 short points (`**term**` = bold), red "!" box = the key restriction, source line on the last card.
- Text in Russian in our own words; numbers only from the cited source; example stats are labelled «Пример».

Sources: 40K — club reference cards (WH40K_pamyatki_A5.pdf, 11th ed.); AoS — Core Rules AoS 4 (Wahapedia) + GW Quick Start Guide; Kill Team — GW Kill Team Lite Rules + KT Core Rules (Wahapedia); Warcry — Core Rules (Heart of Ghur, 2023) via rulespal.com.

Adding a game: add a `TutorialGame` in `content.ts`, add diagram keys + components + `HEIGHT` + `ALT` in `TutorialDiagram.tsx`, add a «Как играть» `ToolTile` on the game's WarpBuilder list screen.

## 6. Audit 30.10.2026 — findings

| # | Area | Finding | Severity | Suggested fix |
|---|---|---|---|---|
| 1 | Process | Generators and canvas scripts lived only in the temporary design session; generated files say "do not edit by hand" but had no source in the repo | High | Keep `tools/design/` in the repo (prepared) |
| 2 | Знамя performance | 86 KB of markup, 62 SMIL animations, feTurbulence mist filter — heaviest element in the app; may stutter on weak phones | Medium | Check on a low-end Android; if needed, fewer wave segments or a static mist image |
| 3 | Пламя performance | two turbulence + displacement filters under animated layers → constant repaint | Medium | Same check; cache the storm as a static layer and animate only light on top |
| 4 | Duplicate ids | SupporterFrame renders the defs twice (back and front SVG), so `af-sp-*` ids appear twice in the page | Low | Render defs only in the back SVG |
| 5 | Dead CSS | 10 `sp-` animations from earlier iterations are unused: current, glint, fire, flash, banner, flag, bolt, glowpulse, rune, wave | Low | Delete from global.css and supporter.py |
| 6 | Корона legibility | inscription is 10.4 px in a gothic font at 104 px avatar | Low–Medium | Owner to check on phone; option: 11.5–12 units |
| 7 | Font load | UnifrakturMaguntia is requested for every user, used only by Корона клуба | Low | Load only when a crown frame is shown, or subset to the inscription's letters |
| 8 | Tutorial text size | smallest drawing text is 10 units; on 320 px phones it renders about 8.75 px | Low–Medium | Raise 10 → 11 and 10.5 → 11 |
| 9 | Tutorial pills | pill width is estimated from character count (6.6 per char) — long or wide labels can overflow | Low | Keep labels short; measure with `getComputedTextLength` if it happens |
| 10 | Tutorial colours | drawings use hex constants instead of CSS tokens (values match today) | Info | Keep in sync if tokens change |

Verified fine: every rank frame stays round; reduce-motion covers all `af-`/`sp-` classes and the banner's SMIL; frames ignore taps and reserve their own space; tutorial arrow markers use unique ids per drawing (`useId`).

Not verified: real-device look and performance (no phone access from the design session).

## 7. Motion levels and the «Яркие эффекты» toggle

Recorded 06.11.2026 (owner's decision): subtle base animations for everyone, strong effects on by default and switchable in Profile → Настройки → «Яркие эффекты».

| Level (`<html data-fx>`) | When | What runs |
|---|---|---|
| `full` | default | base animations + strong effects |
| `base` | toggle off | base animations only |
| `reduced` | system «Reduce motion» on (overrides the toggle) | no strong effects; base animations stopped by the existing reduce-motion rules |

- Code: `client/src/stores/useEffectsStore.ts` (setting, `useFx()`), `client/src/components/EffectsRoot.tsx` (sets `data-fx`, wraps the app in `MotionConfig`).
- The setting is per device (`localStorage` key `warphub:fx-strong`), not per account: a weak phone and a strong laptop can differ.
- CSS: a strong effect's animation or transition uses the class `.fx-strong`; a purely decorative layer (burst, particles) uses `.fx-strong-only`. Both are off unless `data-fx="full"`.
- JS / `motion`: check `useFx().strong` before rendering a strong effect; `MotionConfig` already disables `motion` animations at `reduced`.
- Base vs strong: base = feedback the user needs (press, enter, sheet, loading skeleton, step change); strong = celebration and depth (bursts, glow, tilt, page depth, reward moments). A screen must work and read the same with strong effects off.
- Tokens: `--motion-fast` 150 ms (press, hover), `--motion-base` 220 ms (enter, step), `--motion-slow` 320 ms (sheet, page), `--motion-emphasis` 600 ms (success, reward); easing `--ease-out-soft` for movement, `--ease-spring` for small overshoot (pop, badge).
- Performance: animate only `transform` and `opacity`; no new blur or SVG filters on animated layers (see §6 findings 2–3).
- Base patterns (stage 2): lists get `.ds-stagger` (children fade up 40 ms apart, capped at 280 ms); loading lists and cards show `Skeleton` shapes of the real content instead of a spinner (spinners stay only inside buttons); dialogs: backdrop `ds-fade`, panel `ds-sheet` (not on panels centred with `translate`, the animation would reset the transform); booking steps slide by direction (forward from the right, back from the left).
- Strong effects (stage 3), always together with `.fx-strong` / `.fx-strong-only`: `fx-bump` (a number changed: VP in 40K/AoS, Kill Team, Warcry trackers; new rank label), `fx-dice` (roll-off dice), `fx-phase` (round and phase change in the 40K/AoS tracker), `fx-page` (section change in the main layout; fill-mode `backwards` so no transform stays on the wrapper and page dialogs keep their stacking), `fx-burst` (+ `fx-burst-late`) rings around an icon (booking success, new rank), `fx-press` (tappable cards: `NavRow`, `PickCard`, service cards — depth tilt and lime glow on press; without strong effects the normal `ds-press`). Booking-success confetti is a strong-only layer. «Новый ранг!» badge in «Мой прогресс» is base (always shown once after a rank rises; last seen ranks per device, key `warphub:seen-ranks`).
- Closing dialogs (stage 4): call `useDialogExit()` in the dialog (returns `true` while closing → add `ds-leaving` to the backdrop root) and wrap the place that shows it — `{open && <Dialog/>}` — in `<AnimatePresence>`. The dialog stays 180 ms: backdrop fades, `.ds-sheet` panel slides down; no clicks while closing; immediate at reduced motion. Done for News, access code, event registration, edit booking, cancel booking and cancel event; admin dialogs and the Boosty info sheet still close instantly.
- Stage 4 coverage: skeletons + stagger in Games (games, rewards, card game, collection), WarpBuilder roster lists (40K, AoS, Kill Team, Warcry, WarpBuilder home), Admin lists (events, news, table holds, Warhammer day).
- Toasts (06.11.2026): `toast.success | error | info(message)` from `client/src/stores/useToastStore.ts`, shown by `Toaster` (mounted once in `App` inside `EffectsRoot`). Bottom, above the section bar (wide screens with the sidebar: bottom edge); max 2; success/info 3 s, error 5 s; tap ✕ to close; `role="status"` / `role="alert"`; haptic ok/error; the same message is not shown twice. Use a toast only for an action that otherwise ends silently (cancel, save, register, profile refresh, access granted). Keep errors inside an open dialog inline, keep copy buttons' own «copied» state, keep full result screens (booking confirmation, D&D «done»). Admin actions are not wired yet.
