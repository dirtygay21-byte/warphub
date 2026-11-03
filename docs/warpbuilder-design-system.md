# WarpBuilder design system

Recorded 2026-11-04. This is the shared UI/UX context for Warhammer 40,000, Age of Sigmar, Kill Team and Warcry. Read it together with `docs/design-code.md` before changing roster, game, map or Test Army screens.

## 1. Source of truth and owner requirements

The existing Warhammer 40,000 and Age of Sigmar implementations are the reference. Their appearance and established interactions must not be redesigned while bringing Kill Team and Warcry to the same level of quality.

Owner's requirements:

- All four systems must use the same design language and offer the same level of convenience in rosters, game start/setup/tracking and Test Army.
- Kill Team and Warcry need correction across all these scenarios, not another standalone visual variant.
- Shared does not mean identical rules. Each system's setup sequence, phases, resources, maps and legal actions come from its own rules and data.
- Existing shared components must be preserved and extended. Do not create another `kit`, local card style, color scheme or one-off mobile layout.
- Work is decomposed into separately approved stages. Later stages must use the same context, not ad-hoc decisions from a single screen.

Current visual tokens, typography and motion rules live in `docs/design-code.md`. Inter Tight is the body font, Oswald is `font-display`; minimum UI text is 12 px and intended touch targets are 44 px (`.ds-hit`). No new palette is introduced here.

## 2. Shared implementation layers

### Application and builder primitives

- `ui/Home.tsx` — the four-game entry point and recent rosters.
- `ui/kit.tsx` — buttons, icons, `Sheet`, `Segmented`, `Field`, `Tag`, `Empty`.
- `ui/common/BuilderKit.tsx` — list headers, tool tiles, roster cards, bottom actions, editor headers, data/rule cards.

### Game primitives added in stage 1

- `ui/common/GameShell.tsx` — game header and container. System-specific width, kicker, title, master mode and undo appearance remain props.
- `ui/common/GameErrorBar.tsx` — bottom error panel with safe-area padding.
- `ui/common/SetupStep.tsx` — the established AoS setup card; `SkirmishStep` is a compatibility alias, not a second implementation.
- `ui/common/ScoreboardGrid.tsx` — two-player score grid.
- `ui/common/RoundDots.tsx` — round indicator with explicit Tailwind column classes for supported round counts.
- `ui/common/SavedGamesFrame.tsx` — shared saved-games header, empty state, Telegram Back behavior and system-specific note/rows.
- `ui/game/Online.tsx` — shared online start/status UI and labels for all four systems.

System-specific content belongs in adapters and feature components, not in a growing chain of `system === ...` branches inside shared primitives.

## 3. Global UI/UX contract

### Navigation

- Back returns to the previous meaningful screen without unexpectedly discarding the current game or roster.
- Telegram Back closes in this order: bottom sheet, full-screen map, Test Army side panel, then the current screen.
- Roster → game/Test Army → Back preserves the roster and the route context.
- Hidden or unmounted screens must not continue dispatching state changes.

### Mobile layout

- Base width follows the reference `max-w-lg`; existing wide breakpoints are preserved where present.
- Primary mobile actions are full width and respect `env(safe-area-inset-bottom)`.
- Long names wrap or intentionally truncate; the full value remains accessible in a details view.
- Tables and controls must not introduce full-page horizontal scrolling.
- Do not shrink controls or use dense multi-column layouts merely to fit more actions on one screen.
- Every visible control has a real action. Disabled controls explain the unmet requirement when the reason is not obvious.

### States and feedback

Every screen defines, as applicable:

- loading;
- empty state with a next action;
- load failure with retry;
- disabled state with a reason;
- success feedback using the established haptic/visual pattern;
- read-only mode without accidental editing;
- offline state and restoration of synchronization.

Game errors use `GameErrorBar`. Builder errors and validation use the established sheets/cards. Do not replace an actionable error with a dead-end page containing only Back.

### Editor contract

- Sticky header with the main resource, limits and validation.
- View/edit modes: read-only hides editing controls but keeps full datasheets and rules available.
- Bottom bar contains the contextual primary action and export.
- Menu contains game start, Test Army, duplication and deletion with confirmation.
- Validation issues link to the specific unit, operative or fighter.
- Import, export, duplicate and error wording follow one pattern across systems.

### Game start and saved games

- Saved games open a real library, not only the latest journal: date, players, mission/battleplan, round/stage, score, local/online, open and delete.
- New local game and two-phone game are separate cards.
- Online provides create/invite, join by code, player role, opponent presence, connection status and return to the library.
- Starting a new game does not erase previous saves. Old saves migrate without inventing scores or secret choices.

### Setup and tracker

- Setup follows the rules sequence with visible progress and controlled access to future steps.
- Completed steps are reviewable; unavailable steps explain what must happen first.
- Maps appear directly in the relevant setup step and in the tracker's collapsible battle details.
- Tracker order: round/phase, compact two-player score, initiative/active player, current phase actions, primary transition, score history, mission/battleplan details, result.
- Only legal actions for the current phase and seat are enabled. Secret choices are visible to their owner and shown to the opponent only as «selected, hidden».

### Online and private information

- Each phone acts only for its seat. Opponent turns and read-only states are explicit.
- Hidden selections must not be exposed through shared UI state or a public event journal. Reuse the existing private-secret mechanism where it covers the system; any required API extension is a separately approved task.
- Reconnecting and conflict resync preserve the event sequence and do not duplicate actions.

## 4. Scenario contracts

### Rosters

Kill Team keeps operatives / rules / ploys / equipment. Warcry keeps fighters / groups / rules. Both receive the shared editor behavior described above rather than replacing their domain-specific content.

### Kill Team game

Setup is driven by Approved Ops: players/rosters, killzone/map/terrain, crit op/objectives, roll-off and drop zones, operative/equipment selection, secret tac op, deployment confirmation.

Tracker separates Strategy, Firefight and end of turning point. VP, Crit/Kill/Tac, CP and kill grade remain readable in the compact score area. Tac op and primary op use private-selection UX.

### Warcry game

Setup covers players/warbands, battleplan/format, terrain step, deployment map/colors/groups, victory condition and twist. Missing terrain maps are never invented: use the rules' alternative terrain step when required.

Initiative and wild dice are sequential: roll → show results → allocate wild dice to singles/improve/save → validate budget → confirm → reserves/combat. Reserve groups appear only in their round. Activations and abilities reference actual fighters and abilities, not a generic `Ability N` button.

### Test Army

Picker order: saved deployment, roster, full map panel, side, opponent, deploy action. Saved entries include map, side, placed count, bases and opponent.

The shared board retains the established gestures, ruler, side panel and model information. Kill Team control range is 1″. Warcry deployment points are not objectives. Reserve groups cannot be deployed initially. Unknown base sizes are an explicit setup step, never fabricated.

### Maps

Map UI follows 40K/AoS: title, zoom, optional dimensions, selectable element details, legend, source credit and one coordinate convention. Vector maps are rendered from verified geometry; source images are for comparison, not a substitute for the implementation.

Kill Team territory and drop zone are separate data. Warcry off-board reserve positions remain off-board and are not clamped to the battlefield edge. Objectives, deployment points, reserves and snap points are different semantic types. `BoardField` extensions stay backward-compatible with the 60×44 and objective-range defaults used by 40K/AoS.

## 5. Data, saves and regression safety

- Do not invent rules, coordinates, distances, base sizes, points or relationships. Public sources and owner-approved data are authoritative.
- Saved games and Test Army saves use explicit schemas and migrations. Missing historical values remain unknown rather than fabricated.
- Existing 40K/AoS behavior is a regression boundary. Shared extraction must preserve markup, classes and interactions; visual comparison is required for affected screens.
- Legacy implementations are retired only after migration and reference checks, not while two versions still depend on them.

## 6. Stage map

1. Shared foundation and reference contract, with no visual changes to 40K/AoS.
2. Kill Team roster UX.
3. Warcry roster UX.
4. All 36 Kill Team maps and drop-zone/terrain geometry.
5. All 24 Warcry deployment maps and reserve geometry.
6. Shared map component and zoom/dimensions/legend.
7. Kill Team and Warcry Test Army integration.
8. Kill Team game start/setup/tracker, private selections and online UX.
9. Warcry game start/setup/tracker, sequential wild dice, reserves and online UX.
10. Four-system regression, mobile widths, all maps, online clients and production build.

Each stage is reviewed and approved separately. PR creation, merge and deployment remain separate owner approvals.

## 7. Verification contract

Where applicable, a stage is complete only after:

- TypeScript, lint and production build;
- focused rule/data/UI tests and existing relevant regression tests;
- comparison with the reference 40K/AoS screens;
- mobile checks at 320/360/390/430 px and the established wide layout;
- empty/loading/error/retry/read-only states and Telegram Back;
- local and two-client online flows with secret data hidden;
- all 36 + 24 maps visually compared with their sources at the map stages;
- a concise report of changes, tests, limitations and the next approval gate.

Stage 1 baseline: 44/44 focused tests pass, production build passes, and start/setup screens for both 40K and AoS are pixel-identical before and after extraction. The two lint warnings are pre-existing admin-code warnings, not new design-system exceptions.
