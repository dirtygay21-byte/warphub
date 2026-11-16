# Design generators

Python sources of the generated design files. Rules and audit: `docs/design-code.md`.

| Script | Produces |
|---|---|
| `frames/gen.py` | rank frames: canvas board `Frames.dc.html` + `frames.generated.ts` |
| `frames/supporter.py` | supporter frames: canvas board `Supporter.dc.html` + `supporters.generated.ts` |
| `promo/gen.py` (texts in `slides.py`) | promo images WarpHub / WarpBuilder, 2160×2700 PNG, from demo screens of `tools/ui-shots/promo.mjs` (PR label `ui-promo`) |
| `posters/gen.py` | A3 club posters (WarpHub, WarpBuilder, «Как начать») as PDF + PNG, vector QR codes checked by decoding |
| `tutorial/gen.py` (40K), `aos.py`, `kt.py`, `wc.py` | canvas boards `Tutorial*.dc.html` (the app drawings are hand-ported to `client/src/components/tutorial/TutorialDiagram.tsx`) |

Output paths inside the scripts point at the design session's working folders; adjust them before running.
After regenerating a `.generated.ts`, copy it to `client/src/components/ui/AvatarFrame/` and keep the `af-*` / `sp-*` CSS in `client/src/global.css` in sync.
