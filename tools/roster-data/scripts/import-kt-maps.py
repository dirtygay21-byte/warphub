#!/usr/bin/env python3
"""Vectorise Approved Ops map cards into WarpHub's 30x22 board model.

Source: Wahapedia Approved Ops 2025. Coordinates are derived from the card pixels,
not hand-invented. Approved Ops notes that maps are not exact terrain measurements.
"""
from __future__ import annotations
import concurrent.futures
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
import requests

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / 'backend/roster-data/kt/game.json'
CACHE = ROOT / 'tools/roster-data/kt/map-cards'
BASE = 'https://wahapedia.ru/kill-team3/img/maps/cards/'
FILES = {
    'Volkus': [f'Volkus2025-{i}.png' for i in range(1, 7)],
    'Gallowdark': [f'Gallowdark{i}.png' for i in range(1, 7)],
    'Non-Specific Killzone Maps': [f'Non-specific{i}.png' for i in range(1, 7)],
    'Tomb World': [f'Tomb-World{i}.png' for i in range(1, 7)],
    'Bheta-Decima': ['Bheta-Decima2025-1.png', 'Bheta-Decima2025-2.png', 'Bheta-Decima2025-3.png', 'Bheta-Decima2025-4.png', 'Bheta-Decima2025-55.png', 'Bheta-Decima2025-6.png'],
}
OCTARIUS = [
    'https://wahapedia.ru/kill-team3/img/kt3-update-20261029-72c80debd4a8f2a25a47.png',
    'https://wahapedia.ru/kill-team3/img/kt3-update-20261029-844c8b1db71a8b464850.png',
    'https://wahapedia.ru/kill-team3/img/kt3-update-20261029-2ff9571588c1e2747806.png',
    'https://wahapedia.ru/kill-team3/img/kt3-update-20261029-5b6792808f494465cc1e.png',
    'https://wahapedia.ru/kill-team3/img/kt3-update-20261029-57ec7197ea33dec5b75e.png',
    'https://wahapedia.ru/kill-team3/img/kt3-update-20261029-5786c7837b7706d8416c.png',
]
P2 = np.array([[227,157,121],[233,204,186],[209,144,111],[214,188,171],[202,177,161]])
P1 = np.array([[164,165,169],[193,192,197],[177,176,181],[150,151,155],[167,166,171],[142,143,147],[112,179,193],[171,204,212],[166,202,210],[170,203,210],[172,205,213],[167,203,211]])


def download(item):
    killzone, number, url = item
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / f'{killzone.replace(" ", "-")}-{number}.png'
    if not target.exists():
        response = requests.get(url, timeout=120)
        response.raise_for_status()
        target.write_bytes(response.content)
    return killzone, number, url, target


def palette_mask(image, palette, distance=32):
    delta = np.min(np.linalg.norm(image.astype(float)[:, :, None, :] - palette[None, None, :, :], axis=3), axis=2)
    return (delta < distance).astype('uint8') * 255


def polygons(mask, width, height, min_area=1800):
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((17, 17), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    result = []
    for contour in contours:
        if cv2.contourArea(contour) < min_area:
            continue
        approx = cv2.approxPolyDP(contour, 3, True).reshape(-1, 2)
        result.append([[round(float(x) * 30 / width, 3), round(float(y) * 22 / height, 3)] for x, y in approx])
    return result


def terrain_polygons(image, width, height):
    r, g, b = image[:, :, 0], image[:, :, 1], image[:, :, 2]
    mask = ((g > r + 5) & (g >= b - 8) & (r < 155) & (g < 165)).astype('uint8') * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    result = []
    for contour in contours:
        if cv2.contourArea(contour) < 350:
            continue
        approx = cv2.approxPolyDP(contour, 2.5, True).reshape(-1, 2)
        result.append([[round(float(x) * 30 / width, 3), round(float(y) * 22 / height, 3)] for x, y in approx])
    return result


def vectorise(killzone, number, url, path):
    image = np.array(Image.open(path).convert('RGB'))
    h0, w0 = image.shape[:2]
    # All approved cards have a decorative border around the actual grid.
    image = image[round(h0 * 0.018):round(h0 * 0.98), round(w0 * 0.015):round(w0 * 0.988)]
    height, width = image.shape[:2]
    zones = {
        'p1': polygons(palette_mask(image, P1), width, height),
        'p2': polygons(palette_mask(image, P2), width, height),
    }
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    circles = cv2.HoughCircles(gray, cv2.HOUGH_GRADIENT, 1.2, 45, param1=100, param2=32, minRadius=11, maxRadius=24)
    objectives = []
    if circles is not None:
        yy, xx = np.ogrid[:height, :width]
        for x, y, _ in np.round(circles[0], 1):
            distance = np.sqrt((xx - round(x)) ** 2 + (yy - round(y)) ** 2)
            pixels = image[(distance >= 11) & (distance <= 18)]
            if not len(pixels):
                continue
            red, green, blue = pixels[:, 0], pixels[:, 1], pixels[:, 2]
            orange = ((red > 220) & ((red.astype(int) - green) > 70) & (green < 160) & (blue < 120)).mean()
            luminance = pixels.mean(axis=1)
            dark = (luminance < 65).mean()
            white = (luminance > 220).mean()
            if orange > 0.15 or (dark > 0.2 and white > 0.25) or (white > 0.4 and dark < 0.1):
                px, py = float(x) * 30 / width, float(y) * 22 / height
                side = 'p2' if orange > 0.15 else 'centre' if dark > 0.2 else 'p1'
                objectives.append({'x': round(px, 3), 'y': round(py, 3), 'side': side})
    centre = next((point for point in objectives if point['side'] == 'centre'), None)
    if centre is None:
        centre = min(objectives, key=lambda p: (p['x'] - 15) ** 2 + (p['y'] - 11) ** 2, default=None)
    if centre:
        centre['id'] = 'centre'
    others = [p for p in objectives if p is not centre]
    others.sort(key=lambda p: (p['x'], p['y']))
    for index, point in enumerate(others, 1):
        if killzone == 'Octarius':
            depth = {side: max((cv2.pointPolygonTest(np.array(poly, dtype='float32'), (point['x'], point['y']), True) for poly in zones[side]), default=-1000) for side in ('p1', 'p2')}
            # Octarius 6: marker sits exactly on the dashed border; source card has teal Player 1 above, orange Player 2 below.
            point['id'] = ('home' if point['y'] < 13 else 'enemy') if number == 6 else ('home' if depth['p1'] > depth['p2'] else 'enemy')
        else:
            point['id'] = 'home' if point['side'] == 'p1' else 'enemy'
        del point['side']
    return {
        'id': f'{killzone.lower().replace(" ", "-")}-{number}',
        'killzone': killzone,
        'map': number,
        'sourceImage': url,
        'zones': zones,
        'objectives': objectives,
        'terrain': terrain_polygons(image, width, height),
    }


def main():
    items = [(killzone, number, BASE + filename) for killzone, files in FILES.items() for number, filename in enumerate(files, 1)]
    items += [('Octarius', i, url) for i, url in enumerate(OCTARIUS, 1)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        downloaded = list(pool.map(download, items))
    maps = [vectorise(*item) for item in downloaded]
    problems = []
    for item in maps:
        if not item['zones']['p1'] or not item['zones']['p2']:
            problems.append(f"{item['id']}: drop zone missing")
        if len(item['objectives']) != 3:
            problems.append(f"{item['id']}: expected 3 objectives, found {len(item['objectives'])}")
        elif sorted(point['id'] for point in item['objectives']) != ['centre', 'enemy', 'home']:
            problems.append(f"{item['id']}: objective roles are {[point['id'] for point in item['objectives']]}")
    game = json.loads(GAME.read_text())
    game['maps'] = maps
    game['mapImport'] = {
        'method': 'Vectorised from official map-card pixels; terrain contours approximate, as Approved Ops maps are not exact terrain measurements.',
        'problems': problems,
    }
    GAME.write_text(json.dumps(game, ensure_ascii=False, indent=2) + '\n')
    print(f'Maps: {len(maps)}; problems: {len(problems)}')
    for problem in problems:
        print(problem)


if __name__ == '__main__':
    main()
