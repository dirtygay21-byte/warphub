#!/usr/bin/env python3
"""Approved Ops 2025 maps, pass 3 (21.11.2026): exact board frame, drop zones re-measured, every lettered label.

Earlier passes (import-kt-maps.py, import-kt-maps-v2.py) mapped card pixels to the 30x22" board with a fixed crop
(1.5% / 1.8% margins). That crop is ~0.5" off on the Octarius cards (different margins), and drop-zone detection
failed on several cards (e.g. Bheta-Decima 2, 3, 5 took half the board). This pass:
  1. finds each card's board frame from its border lines and re-projects all stored geometry onto it;
  2. re-measures each drop zone as the strip of the drop-zone colour along its killzone edge (19 scanlines),
     rounded to 0.5" where the card is drawn to scale (30x22, square pixels); Gallowdark / Tomb World cards are not
     to scale (tile grids), there the measured value is kept and the guide carries no inch label;
  3. replaces `features` with every lettered label box on the card (kt_map_labels.py: OCR + template check +
     manual overrides), so a letter that appears several times on a map is listed several times.
Also merges the curated legend tools/roster-data/kt/map-keys.json into game.json → mapKey.
Usage: kt-map-fix.py [--dry]
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import kt_map_labels as labels  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / 'backend/roster-data/kt/game.json'
CARDS = ROOT / 'client/public/roster-maps/kt'
SCALE_FREE = {'Gallowdark', 'Tomb World'}

def rgb(path):
    im = Image.open(path).convert('RGBA')
    bg = Image.new('RGBA', im.size, 'white')
    bg.alpha_composite(im)
    return np.array(bg.convert('RGB')).astype(int)

def groups(idx):
    out, cur = [], [idx[0]]
    for i in idx[1:]:
        if i - cur[-1] <= 1:
            cur.append(i)
        else:
            out.append(cur); cur = [i]
    out.append(cur)
    return out

def frame(a):
    """Board frame (left, top, right, bottom) in px: inside of the outer border lines."""
    dark = a.max(axis=2) < 140
    rows = groups(list(np.where(dark.mean(axis=1) > .6)[0]))
    cols = groups(list(np.where(dark.mean(axis=0) > .6)[0]))
    return cols[0][-1] + 1, rows[0][-1] + 1, cols[-1][0], rows[-1][0]

def old_frame(a):
    h0, w0 = a.shape[:2]
    L, T = round(w0 * .015), round(h0 * .018)
    return L, T, round(w0 * .988), round(h0 * .98)

def reproject(pt, old, new):
    (L, T, R, B), (l, t, r, b) = old, new
    px = L + pt[0] * (R - L) / 30, T + pt[1] * (B - T) / 22
    return [round((px[0] - l) * 30 / (r - l), 3), round((px[1] - t) * 22 / (b - t), 3)]

def walk(v, old, new):
    """Re-project nested point lists ([x, y] leaves)."""
    if isinstance(v, list) and len(v) == 2 and all(isinstance(c, (int, float)) for c in v):
        return reproject(v, old, new)
    if isinstance(v, list):
        return [walk(x, old, new) for x in v]
    return v

def drop_depth(a, fr, edge):
    """Depth in px of the drop-zone colour strip along `edge`, from 19 scanlines.

    The zone colour is the median of the pixels just inside the edge over all scanlines; a scanline whose edge pixels
    differ (terrain drawn over the edge) is skipped. Terrain or labels over the zone only shorten a scanline, so the
    75th percentile of the remaining depths is used."""
    l, t, r, b = fr
    lines = []
    for k in range(1, 20):
        if edge in ('left', 'right'):
            y = round(t + (b - t) * k / 20)
            line = a[y, l:r] if edge == 'left' else a[y, l:r][::-1]
        else:
            x = round(l + (r - l) * k / 20)
            line = a[t:b, x] if edge == 'top' else a[t:b, x][::-1]
        lines.append(line)
    ref = np.median(np.concatenate([ln[3:9] for ln in lines]), axis=0)
    depths = []
    for line in lines:
        if np.abs(np.median(line[3:9], axis=0) - ref).sum() > 15:
            continue
        same = np.abs(line - ref).sum(axis=1) <= 24
        d, gap = 0, 0
        for i, ok in enumerate(same):
            if ok:
                d, gap = i + 1, 0
            else:
                gap += 1
                if gap > 4:  # grid lines interrupt the colour for 1-2 px
                    break
        depths.append(d)
    return float(np.percentile(depths, 75)), ref

def strip(edge, depth):
    return {
        'left': [[0, 0], [depth, 0], [depth, 22], [0, 22]],
        'right': [[30 - depth, 0], [30, 0], [30, 22], [30 - depth, 22]],
        'top': [[0, 0], [30, 0], [30, depth], [0, depth]],
        'bottom': [[0, 22 - depth], [30, 22 - depth], [30, 22], [0, 22]],
    }[edge]

def main():
    dry = '--dry' in sys.argv
    game = json.loads(GAME.read_text())
    found = labels.collect(game)
    report = []
    for m in game['maps']:
        a = rgb(CARDS / f"{m['killzone'].replace(' ', '-')}-{m['map']}.png")
        old, new = old_frame(a), frame(a)
        if 'frame' not in m:  # first run only: re-project the geometry of the earlier passes
            for key in ('zones', 'territories', 'dropZones', 'terrain', 'walls', 'doors'):
                m[key] = walk(m[key], old, new)
            for o in m['objectives']:
                o['x'], o['y'] = reproject([o['x'], o['y']], old, new)
        l, t, r, b = new
        guides, owner = [], {}
        for g in m['guides']:
            side, edge = g['side'], g['edge']
            px, ref = drop_depth(a, new, edge)
            # which player of the Universal Map Key this zone is: orange = Player 1, grey / blue = Player 2
            owner[side] = 'p1' if ref[0] - ref[2] > 60 else 'p2'
            inch = px * (30 / (r - l) if edge in ('left', 'right') else 22 / (b - t))
            scaled = m['killzone'] not in SCALE_FREE
            depth = round(inch * 2) / 2 if scaled else round(inch, 2)
            m['dropZones'][side] = [strip(edge, depth)]
            mid = 11 if edge in ('left', 'right') else 15
            at = {'left': [depth, mid], 'right': [30 - depth, mid], 'top': [mid, depth], 'bottom': [mid, 22 - depth]}[edge]
            guides.append({'edge': edge, 'at': at, 'd': depth, 'side': side, **({} if scaled else {'toScale': False})})
            report.append(f"{m['id']} {side} {edge}: {g['d']} → {depth}{'' if scaled else ' (not to scale)'}")
        m['guides'] = guides
        assert sorted(owner.values()) == ['p1', 'p2'], (m['id'], owner)
        m['keyPlayer'] = owner  # data side → Universal Map Key player (colour on the card)
        m['zones'] = m['dropZones']
        m['features'] = [{'label': i['label'], 'x': i['x'], 'y': i['y']} for i in found[m['id']]]
        m['frame'] = {'px': [int(v) for v in new], 'size': [int(a.shape[1]), int(a.shape[0])], 'toScale': m['killzone'] not in SCALE_FREE}
    keys = json.loads((ROOT / 'tools/roster-data/kt/map-keys.json').read_text())
    keys.pop('_comment', None)
    keys['colours'].pop('_comment', None)
    game['mapKey'] = keys
    game['mapImportV3'] = {
        'date': '2026-11-21',
        'method': 'Board frame from card border lines (geometry re-projected); drop zones re-measured as edge strips of the drop-zone colour (0.5" rounding on to-scale cards); features = every lettered label box (OCR + template + manual overrides, scripts/kt_map_labels.py).',
        'notToScale': sorted(SCALE_FREE),
    }
    print('\n'.join(report))
    if not dry:
        GAME.write_text(json.dumps(game, ensure_ascii=False, indent=2) + '\n')

if __name__ == '__main__':
    main()
