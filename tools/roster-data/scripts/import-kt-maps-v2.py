#!/usr/bin/env python3
"""Build structured Approved Ops map data without changing the legacy renderer contract.

Source: cached Wahapedia map cards. Drop zones are verified against the cards, not inferred from rules.
Legacy `zones` now means actual drop zones; `territories` preserves the larger player territories.
"""
from __future__ import annotations
import json
from pathlib import Path
import cv2
import numpy as np
import pytesseract

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / 'backend/roster-data/kt/game.json'
CARDS = ROOT / 'tools/roster-data/kt/map-cards'
EXPECTED = {
    'Non-Specific Killzone Maps': [],
    'Volkus': list('ABCDEFGHIJKLMN'),
    'Gallowdark': [f'{c}{n}' for c in 'AB' for n in range(1, 4)],
    'Tomb World': [f'{c}{n}' for c in 'AB' for n in range(1, 5)] + [f'C{n}' for n in range(1, 6)] + ['T'],
    'Octarius': list('ABCDEFGHI'),
    'Bheta-Decima': list('ABCD'),
}
EXPECTED_BY_MAP = {
    ('Octarius', 4): list('ABCDEFGH'),
}
LABEL_OVERRIDES = {
    ('Tomb World', 1, 'C4'): (200, 375),
    ('Tomb World', 1, 'C5'): (210, 125),
    ('Tomb World', 5, 'C5'): (420, 300),
    ('Volkus', 3, 'I'): (250, 400),
    ('Volkus', 3, 'K'): (480, 410),
    ('Volkus', 4, 'I'): (580, 200),
    ('Volkus', 5, 'I'): (440, 225),
    ('Volkus', 6, 'I'): (325, 320),
    ('Octarius', 1, 'F'): (700, 500),
    ('Octarius', 2, 'I'): (660, 95),
    ('Octarius', 5, 'I'): (395, 490),
    ('Octarius', 1, 'E'): (500, 350),
    ('Octarius', 4, 'E'): (720, 100),
    ('Octarius', 5, 'F'): (95, 290),
    ('Octarius', 6, 'F'): (140, 225),
    ('Octarius', 6, 'I'): (280, 280),
}

OV = {
    ('Non-Specific Killzone Maps', 1): {'p1': [[0, 18.964], [30, 18.964], [30, 22], [0, 22]], 'p2': [[0, 0], [30, 0], [30, 3.036], [0, 3.036]]},
    ('Non-Specific Killzone Maps', 2): {'p1': [[0, 18.964], [30, 18.964], [30, 22], [0, 22]], 'p2': [[0, 0], [30, 0], [30, 3.036], [0, 3.036]]},
    ('Non-Specific Killzone Maps', 3): {'p1': [[0, 18.964], [30, 18.964], [30, 22], [0, 22]], 'p2': [[0, 0], [30, 0], [30, 3.036], [0, 3.036]]},
    ('Non-Specific Killzone Maps', 4): {'p1': [[0, 0], [4.656, 0], [4.656, 22], [0, 22]], 'p2': [[25.256, 0], [30, 0], [30, 22], [25.256, 22]]},
    ('Non-Specific Killzone Maps', 5): {'p1': [[0, 0], [4.656, 0], [4.656, 22], [0, 22]], 'p2': [[25.256, 0], [30, 0], [30, 22], [25.256, 22]]},
    ('Non-Specific Killzone Maps', 6): {'p1': [[0, 0], [5.095, 0], [5.095, 22], [0, 22]], 'p2': [[25.256, 0], [30, 0], [30, 22], [25.256, 22]]},
    ('Volkus', 5): {'p1': [[0, 19.0057], [30, 19.0057], [30, 22], [0, 22]]},
    ('Octarius', 1): {'p1': [[0.5237, 0.5546], [4.3017, 0.5546], [4.3017, 21.4084], [0.5237, 21.4084]], 'p2': [[25.6234, 0.5916], [29.3641, 0.5916], [29.3641, 21.4084], [25.6234, 21.4084]]},
    ('Octarius', 2): {'p1': [[0.5237, 0.5546], [4.3017, 0.5546], [4.3017, 21.4084], [0.5237, 21.4084]], 'p2': [[25.6234, 0.5916], [29.3641, 0.5916], [29.3641, 21.4084], [25.6234, 21.4084]]},
    ('Octarius', 3): {'p1': [[0.5237, 0.5546], [4.3017, 0.5546], [4.3017, 21.4084], [0.5237, 21.4084]], 'p2': [[25.6234, 0.5916], [29.3641, 0.5916], [29.3641, 21.4084], [25.6234, 21.4084]]},
    ('Octarius', 4): {'p1': [[0, 0], [30, 0], [30, 3.036], [0, 3.036]], 'p2': [[0.5237, 18.6723], [29.3641, 18.6723], [29.3641, 21.4084], [0.5237, 21.4084]]},
    ('Octarius', 5): {'p1': [[0, 0], [30, 0], [30, 3.036], [0, 3.036]], 'p2': [[0.5237, 18.6723], [29.3641, 18.6723], [29.3641, 21.4084], [0.5237, 21.4084]]},
    ('Octarius', 6): {'p1': [[0, 0], [30, 0], [30, 3.036], [0, 3.036]], 'p2': [[0.5237, 18.6723], [29.3641, 18.6723], [29.3641, 21.4084], [0.5237, 21.4084]]},
}

def area(poly):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1]))) / 2

def crop(im):
    h0, w0 = im.shape[:2]
    return im[round(h0 * .018):round(h0 * .98), round(w0 * .015):round(w0 * .988)]

def drop_candidates(im, zones):
    h, w = im.shape[:2]
    bw, bh = max(2, round(w * .025)), max(2, round(h * .025))
    border = np.concatenate([im[:, :bw].reshape(-1, 3), im[:, -bw:].reshape(-1, 3), im[:bh].reshape(-1, 3), im[-bh:].reshape(-1, 3)])
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, .25)
    _, _, centres = cv2.kmeans(border.astype(np.float32), 6, None, criteria, 8, cv2.KMEANS_PP_CENTERS)
    result = []
    for colour in centres.astype(int):
        dist = np.linalg.norm(im.astype(float) - colour[None, None, :], axis=2)
        mask = (dist < 24).astype('uint8') * 255
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((13, 13), np.uint8))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            if cv2.contourArea(c) < 500:
                continue
            x, y, wc, hc = cv2.boundingRect(c)
            if x > bw and x + wc < w - bw and y > bh and y + hc < h - bh:
                continue
            rect = [[x * 30 / w, y * 22 / h], [(x + wc) * 30 / w, y * 22 / h], [(x + wc) * 30 / w, (y + hc) * 22 / h], [x * 30 / w, (y + hc) * 22 / h]]
            result.append({'rect': [[round(a, 3), round(b, 3)] for a, b in rect], 'area': cv2.contourArea(c) * 30 * 22 / (w * h), 'colour': colour.tolist()})
    return result

def drop_zones(im, m):
    candidates = drop_candidates(im, m['zones'])
    out = {}
    for side in ['p1', 'p2']:
        territory = sum(area(x) for x in m['zones'][side])
        def match(c):
            r, g, b = c['colour']
            return (r - g < 35 and r - b < 35) if side == 'p1' else (r - g > 25 and r - b > 15)
        valid = [c for c in candidates if c['area'] > 10 and c['area'] < territory * .98 and match(c)]
        best = min(valid, key=lambda c: sum(c['colour']) if sum(c['colour']) > 60 else 10000, default=None)
        out[side] = [best['rect']] if best else []
    override = OV.get((m['killzone'], m['map']), {})
    for side in ['p1', 'p2']:
        if side in override:
            out[side] = [override[side]]
    return out

def label_boxes(im, expected):
    h, w = im.shape[:2]
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    contours, _ = cv2.findContours((gray < 110).astype('uint8') * 255, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    found = []
    for c in contours:
        x, y, wc, hc = cv2.boundingRect(c)
        area = cv2.contourArea(c)
        if not (5 <= hc <= 22 and 5 <= wc <= 35 and 30 <= area <= 400 and .4 <= wc / hc <= 4):
            continue
        pad = 4
        crop_img = im[max(0, y - pad):min(h, y + hc + pad), max(0, x - pad):min(w, x + wc + pad)]
        crop_img = cv2.resize(crop_img, None, fx=8, fy=8, interpolation=cv2.INTER_CUBIC)
        text = pytesseract.image_to_string(crop_img, config='--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789').strip()
        if text:
            found.append((text, x + wc / 2, y + hc / 2))
    # Single B is frequently the only missed label; a focused pass recovers it reliably.
    if 'B' in expected and not any(t == 'B' for t, _, _ in found):
        for c in contours:
            x, y, wc, hc = cv2.boundingRect(c)
            area = cv2.contourArea(c)
            if not (5 <= hc <= 25 and 5 <= wc <= 45 and 20 <= area <= 500 and .3 <= wc / hc <= 4):
                continue
            pad = 6
            crop_img = im[max(0, y - pad):min(h, y + hc + pad), max(0, x - pad):min(w, x + wc + pad)]
            crop_img = cv2.resize(crop_img, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
            text = pytesseract.image_to_string(crop_img, config='--psm 8 -c tessedit_char_whitelist=B').strip()
            if text == 'B':
                found.append(('B', x + wc / 2, y + hc / 2))
                break
    return found

def full_page_labels(im, expected):
    scale = 3
    big = cv2.resize(im, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    data = pytesseract.image_to_data(big, config='--psm 11', output_type=pytesseract.Output.DICT)
    found = []
    for i, text in enumerate(data['text']):
        text = text.strip().replace('Al', 'A1')
        if text not in expected:
            continue
        x = (data['left'][i] + data['width'][i] / 2) / scale
        y = (data['top'][i] + data['height'][i] / 2) / scale
        found.append((text, x, y))
    return found

def focused_labels(im, expected):
    import concurrent.futures
    h, w = im.shape[:2]
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    contours, _ = cv2.findContours((gray < 110).astype('uint8') * 255, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    aliases = {
        'A2': {'A2', '12'},
        'A4': {'A4', '14'},
        'B1': {'B1', '13'},
        'C3': {'C3', '23'},
        'C4': {'C4', '14'},
        'C5': {'C5', 'A5', '2A5'},
    }
    def find(wanted):
        accepted = aliases.get(wanted, {wanted})
        for c in contours:
            x, y, wc, hc = cv2.boundingRect(c)
            area = cv2.contourArea(c)
            if not (5 <= hc <= 25 and 5 <= wc <= 45 and 20 <= area <= 500 and .3 <= wc / hc <= 4):
                continue
            pad = 6
            crop_img = im[max(0, y - pad):min(h, y + hc + pad), max(0, x - pad):min(w, x + wc + pad)]
            crop_img = cv2.resize(crop_img, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
            text = pytesseract.image_to_string(crop_img, config='--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789').strip().replace('Al', 'A1')
            if text in accepted:
                return (wanted, x + wc / 2, y + hc / 2)
        return None
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        return [result for result in pool.map(find, expected) if result]

def nearest_poly(point, polygons):
    if not polygons:
        return []
    x, y = point
    def distance(poly):
        contour = np.array(poly, dtype='float32')
        inside = cv2.pointPolygonTest(contour, (x, y), False) >= 0
        if inside:
            return 0
        cx = sum(p[0] for p in poly) / len(poly)
        cy = sum(p[1] for p in poly) / len(poly)
        return (cx - x) ** 2 + (cy - y) ** 2
    return min(polygons, key=distance)

def lines(im, white=False):
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    mask = (gray > 220).astype('uint8') * 255 if white else (gray < 80).astype('uint8') * 255
    edges = cv2.Canny(mask, 40, 120)
    detected = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=15, minLineLength=18, maxLineGap=4)
    result = []
    if detected is not None:
        h, w = im.shape[:2]
        for line in detected[:, 0]:
            x1, y1, x2, y2 = [round(float(v), 3) for v in line]
            result.append([[round(x1 * 30 / w, 3), round(y1 * 22 / h, 3)], [round(x2 * 30 / w, 3), round(y2 * 22 / h, 3)]])
    return result

def drop_guides(drops):
    guides = []
    for side, polygons in drops.items():
        for rect in polygons:
            if len(rect) != 4:
                continue
            xs, ys = [p[0] for p in rect], [p[1] for p in rect]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
            if x0 < 1 and x1 < 29:
                guides.append({'edge': 'left', 'at': [round(x1, 3), round(yc, 3)], 'd': round(x1, 3), 'side': side})
            if x1 > 29 and x0 > 1:
                guides.append({'edge': 'right', 'at': [round(x0, 3), round(yc, 3)], 'd': round(30 - x0, 3), 'side': side})
            if y0 < 1 and y1 < 21:
                guides.append({'edge': 'top', 'at': [round(xc, 3), round(y1, 3)], 'd': round(y1, 3), 'side': side})
            if y1 > 21 and y0 > 1:
                guides.append({'edge': 'bottom', 'at': [round(xc, 3), round(y0, 3)], 'd': round(22 - y0, 3), 'side': side})
    return guides

def main():
    import sys
    only = sys.argv[1] if len(sys.argv) > 1 else None
    game = json.loads(GAME.read_text())
    problems = []
    for m in game['maps']:
        zone = m['killzone']
        if only and zone != only:
            continue
        print(f'Processing {zone} {m["map"]}', flush=True)
        path = CARDS / f"{zone.replace(' ', '-')}-{m['map']}.png"
        src = cv2.cvtColor(cv2.imread(str(path)), cv2.COLOR_BGR2RGB)
        im = crop(src)
        h, w = im.shape[:2]
        h0, w0 = src.shape[:2]
        left, top = round(w0 * .015), round(h0 * .018)
        def board(x, y):
            return ((x - left) * 30 / w, (y - top) * 22 / h)
        drops = drop_zones(im, m)
        if 'territories' not in m:
            m['territories'] = m['zones']
        m['dropZones'] = drops
        # Backward-compatible field: the actual deployment zone, no longer the whole territory.
        m['zones'] = drops
        m['guides'] = drop_guides(drops)
        expected = EXPECTED_BY_MAP.get((zone, m['map']), EXPECTED[zone])
        labels = label_boxes(src, expected)
        if zone in ['Gallowdark', 'Tomb World']:
            labels += full_page_labels(src, expected)
        best = {}
        for text, x, y in labels:
            if text not in expected:
                continue
            best.setdefault(text, board(x, y))
        missing = [x for x in expected if x not in best]
        for text, x, y in focused_labels(src, missing):
            best.setdefault(text, board(x, y))
        for label, (x, y) in LABEL_OVERRIDES.items():
            if label[0] == zone and label[1] == m['map']:
                best[label[2]] = board(x, y)
        missing = [x for x in expected if x not in best]
        if missing:
            problems.append(f"{m['id']}: missing labels {', '.join(missing)}")
        m['features'] = [
            {
                'label': text,
                'x': round(point[0], 3),
                'y': round(point[1], 3),
                'poly': nearest_poly(point, m['terrain']),
            }
            for text, point in best.items()
        ]
        m['walls'] = lines(im)
        m['doors'] = lines(im, white=True)
    game['mapImportV2'] = {
        'method': 'Border-color drop zones with source-image overrides, OCR labels, Hough wall/door lines and drop-zone guides. Legacy polygons and objective coordinates are preserved.',
        'problems': problems,
    }
    GAME.write_text(json.dumps(game, ensure_ascii=False, indent=2) + '\n')
    print(f'Maps: {len(game["maps"])}; problems: {len(problems)}')
    for problem in problems:
        print(problem)

if __name__ == '__main__':
    main()
