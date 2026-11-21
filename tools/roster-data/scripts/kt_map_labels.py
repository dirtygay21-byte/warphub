#!/usr/bin/env python3
"""Find every lettered label box on the official Approved Ops 2025 map cards (client/public/roster-maps/kt).

Label boxes are small dark-grey squares with white text; each box is cropped, enlarged and read with Tesseract
(whitelist of the killzone's key letters). Output: JSON {map id: [{label, x, y}]} in board inches (30x22).
Usage: kt_map_labels.py [out.json] [--crops DIR]   (crops: one PNG per box for visual review)
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import cv2, numpy as np, pytesseract

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / 'backend/roster-data/kt/game.json'
CARDS = ROOT / 'client/public/roster-maps/kt'
KEYS = {
    'Volkus': list('ABCDEFGHIJKLMN'),
    'Gallowdark': ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3'],
    'Tomb World': ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'C5', 'T'],
    'Octarius': list('ABCDEFGHIJK'),
    'Bheta-Decima': list('ABCD'),
    'Non-Specific Killzone Maps': [],
}

# Manual corrections after visual review of every box (map id, box x, box y) → label.
OVERRIDES = {
    ("octarius-3", 117, 459): "F",  # Tesseract reads this F as E (checked on the card)
}

def board_frame(im):
    """Inside of the card's outer border lines (transparent background counts as white)."""
    a = im.astype(int)
    dark = a.max(axis=2) < 140
    def groups(idx):
        out, cur = [], [idx[0]]
        for i in idx[1:]:
            if i - cur[-1] <= 1:
                cur.append(i)
            else:
                out.append(cur); cur = [i]
        out.append(cur)
        return out
    rows = groups(list(np.where(dark.mean(axis=1) > .6)[0]))
    cols = groups(list(np.where(dark.mean(axis=0) > .6)[0]))
    return cols[0][-1] + 1, rows[0][-1] + 1, cols[-1][0], rows[-1][0]

BOX_COLOURS = [(79, 85, 90), (79, 86, 91), (103, 103, 98), (0, 0, 0)]  # (0,0,0): Tomb World C1-C5 and T  # label-box fill on the cards (sampled)

def boxes(im):
    """Label boxes found through their glyphs: white glyph clusters whose surrounding ring is the label-box fill.
    (Box outlines often touch terrain drawn in the same colour, so the fill itself is not a reliable component.)"""
    a = im.astype(int)
    fill = np.zeros(im.shape[:2], bool)
    for c in BOX_COLOURS:
        fill |= np.abs(a - np.array(c)).sum(axis=2) <= 6
    white = (a.min(axis=2) >= 170).astype(np.uint8)
    n, _, stats, _ = cv2.connectedComponentsWithStats(white)
    glyphs = [tuple(int(v) for v in stats[i][:4]) for i in range(1, n) if 5 <= stats[i][3] <= 22 and stats[i][2] <= 18]
    # merge glyphs of one label (side by side, same baseline)
    glyphs.sort()
    groups = []
    for g in glyphs:
        for grp in groups:
            x, y, w, h = grp
            if abs(g[1] - y) <= 3 and abs(g[3] - h) <= 4 and 0 <= g[0] - (x + w) <= 4:
                grp[2] = g[0] + g[2] - x
                grp[1], grp[3] = min(y, g[1]), max(y + h, g[1] + g[3]) - min(y, g[1])
                break
        else:
            groups.append(list(g))
    out = []
    H, W = fill.shape
    for x, y, w, h in groups:
        pad = 3
        x0, y0, x1, y1 = max(x - pad, 0), max(y - pad, 0), min(x + w + pad, W), min(y + h + pad, H)
        ring = np.ones((y1 - y0, x1 - x0), bool)
        ring[pad:-pad, pad:-pad] = False
        if fill[y0:y1, x0:x1][ring].mean() >= .8:
            out.append((x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4))
    return out

def load(path):
    from PIL import Image
    im = Image.open(path).convert('RGBA')
    bg = Image.new('RGBA', im.size, 'white')
    bg.alpha_composite(im)
    return np.array(bg.convert('RGB'))

def norm(crop):
    """Grey crop → 24x32 zero-mean vector of the glyphs (white text), for template matching."""
    g = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY).astype(np.float32)
    g = cv2.resize(g, (32, 24), interpolation=cv2.INTER_AREA)
    g = (g > 170).astype(np.float32)
    return (g - g.mean()).ravel()

def read(im, box, allowed):
    x, y, w, h = box
    crop = im[y:y + h, x:x + w]
    g = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    g = cv2.resize(g, None, fx=6, fy=6, interpolation=cv2.INTER_CUBIC)
    _, b = cv2.threshold(g, 180, 255, cv2.THRESH_BINARY_INV)
    b = cv2.copyMakeBorder(b, 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)
    chars = ''.join(sorted(set(''.join(allowed))))
    txt = pytesseract.image_to_string(b, config=f'--psm 7 -c tessedit_char_whitelist={chars}').strip().replace(' ', '')
    fallback = False
    if txt not in allowed and txt + '1' in allowed:  # a narrow digit is often dropped: guess '1', the template decides
        txt, fallback = txt + '1', True
    if not txt and 'I' in allowed:  # a lone vertical stroke is not read by Tesseract
        txt, fallback = 'I', True
    return txt, crop, fallback

def main():
    args = sys.argv[1:]
    crops = Path(args[args.index('--crops') + 1]) if '--crops' in args else None
    out_path = Path(args[0]) if args and not args[0].startswith('--') else None
    result = collect(json.loads(GAME.read_text()), crops, verbose=True)
    text = json.dumps(result, ensure_ascii=False, indent=1)
    (out_path.write_text(text) if out_path else print(text))

def collect(game, crops=None, verbose=False):
    result, problems = {}, []
    for m in game['maps']:
        allowed = KEYS[m['killzone']]
        if not allowed:
            result[m['id']] = []
            continue
        im = load(CARDS / f"{m['killzone'].replace(' ', '-')}-{m['map']}.png")
        L, T, R, B = board_frame(im)
        found = []
        for k, box in enumerate(boxes(im)):
            txt, crop, fallback = read(im, box, allowed)
            x, y, w, h = box
            item = {'label': txt, 'x': round((x + w / 2 - L) * 30 / (R - L), 3), 'y': round((y + h / 2 - T) * 22 / (B - T), 3), 'px': [int(x), int(y), int(w), int(h)], 'map': m['id'], '_crop': crop, 'fallback': fallback}
            found.append(item)
            if crops:
                crops.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(crops / f"{m['id']}_{k:02d}_{txt or 'X'}.png"), cv2.cvtColor(crop, cv2.COLOR_RGB2BGR))
        result[m['id']] = found
    # second pass: within one killzone all labels share a font, so classify every box against per-label templates
    # built from the OCR reads (median image of each label); disagreements are resolved by the template.
    by_zone = {}
    for m in game['maps']:
        for item in result[m['id']]:
            by_zone.setdefault(m['killzone'], []).append(item)
    for zone, items in by_zone.items():
        allowed = KEYS[zone]
        vecs = [norm(item.pop('_crop')) for item in items]
        classes = {}
        for item, v in zip(items, vecs):
            if item['label'] in allowed:
                classes.setdefault(item['label'], []).append(v)
        tpl = {k: np.median(np.stack(v), axis=0) for k, v in classes.items()}
        for item, v in zip(items, vecs):
            scores = sorted(((float((v * t).sum() / (np.linalg.norm(v) * np.linalg.norm(t) + 1e-9)), k) for k, t in tpl.items()), reverse=True)
            best, second = scores[0], scores[1] if len(scores) > 1 else (0, '')
            if item['label'] not in allowed or (item.get('fallback') and best[1] != item['label']):
                problems.append(f"{item['map']}: {item['label']!r} → {best[1]} by template ({best[0]:.3f} vs {second[1]} {second[0]:.3f})")
                item['label'] = best[1]
            elif best[1] != item['label']:
                problems.append(f"{item['map']}: OCR {item['label']!r}, template {best[1]} ({best[0]:.3f}) — OCR kept, check")
            item.pop('fallback', None)
            item['score'] = round(best[0], 3)
            if best[0] < .5:  # not a label box (e.g. white caption text on a black panel)
                item['drop'] = True
            item.pop('map')
    for mid, items in result.items():
        result[mid] = [i for i in items if not i.pop('drop', False)]
        for i in result[mid]:
            fix = OVERRIDES.get((mid, i['px'][0], i['px'][1]))
            if fix:
                i['label'] = fix
    if verbose:
        print(f'maps {len(result)}, labels {sum(map(len, result.values()))}, problems {len(problems)}', file=sys.stderr)
        for p in problems:
            print(p, file=sys.stderr)
    return result

if __name__ == '__main__':
    main()
