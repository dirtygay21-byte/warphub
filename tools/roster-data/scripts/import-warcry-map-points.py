#!/usr/bin/env python3
"""Extract deployment groups and reserve rounds from official Warcry map cards."""
from pathlib import Path
import cv2
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
CARDS = ROOT / 'tools/roster-data/warcry/deployment-cards'
GAME = ROOT / 'backend/roster-data/warcry/game.json'
first = cv2.imread(str(CARDS / 'first-blood.png'))
death = cv2.imread(str(CARDS / 'death-spiral.png'), 0)
TEMPLATES = {
    'dagger': first[326:369, 584:624],
    'hammer': first[515:560, 425:465],
    'shield': first[326:369, 114:157],
}
RESERVE_TEMPLATES = {2: cv2.cvtColor(first, cv2.COLOR_BGR2GRAY)[130:162, 512:530], 3: death[130:162, 512:530]}
THRESHOLDS = {'dagger': .65, 'hammer': .60, 'shield': .65}
REFERENCE = {
    'dagger': {'red': 19, 'blue': -26},
    'hammer': {'red': -6, 'blue': -20},
    'shield': {'red': 3, 'blue': -21},
}
RESERVE_OVERRIDES = {
    ('stand-off', 'red', 'shield'): 2,
    ('the-unseen-blade', 'blue', 'dagger'): 2,
}
# Card geometry measured from the official 885x636 deployment cards.
BX, BY, BW, BH = 185 / 885, 160 / 636, 522 / 885, 376 / 636


def matches(image, template, threshold, suppression=30, limit=12):
    result = cv2.matchTemplate(image, template, cv2.TM_CCOEFF_NORMED)
    points = []
    for _ in range(limit):
        _, score, _, location = cv2.minMaxLoc(result)
        if score < threshold:
            break
        x, y = location
        if all((x - px) ** 2 + (y - py) ** 2 > suppression ** 2 for px, py, _ in points):
            points.append((x, y, score))
        cv2.rectangle(result, (x - 20, y - 20), (x + 20, y + 20), -1, -1)
    return points


def make_guides(points):
    guides = []
    for point in points:
        if point['reserve']:
            continue
        x, y = point['sourceX'], point['sourceY']
        dx, dy = abs(x - 15), abs(y - 11)
        for distance, target in [(dx, 'centre-x'), (dy, 'centre-y')]:
            for wanted in [4, 6, 8, 9]:
                if abs(distance - wanted) <= .3:
                    if target == 'centre-x':
                        to = [15.0, y]
                        at = [(x + 15) / 2, y]
                    else:
                        to = [x, 11.0]
                        at = [x, (y + 11) / 2]
                    guides.append({'from': [x, y], 'to': to, 'at': [round(at[0], 3), round(at[1], 3)], 'd': wanted, 'side': point['side'], 'group': point['group']})
    return guides


def orientation_for(width, height):
    # Orientation mark in the upper-left of every official card, converted to board coordinates.
    return {'kind': 'double-arrow', 'at': [round((70 / width - BX) * 30 / BW, 3), round((40 / height - BY) * 22 / BH, 3)]}


def main():
    game = json.loads(GAME.read_text())
    for deployment in game['deployments']:
        image = cv2.imread(str(CARDS / f"{deployment['id']}.png"))
        height, width = image.shape[:2]
        points = []
        for group, template in TEMPLATES.items():
            for x, y, score in matches(image, template, THRESHOLDS[group]):
                cx, cy = x + template.shape[1] / 2, y + template.shape[0] / 2
                rgb = image[max(0, round(cy) - 5):round(cy) + 5, max(0, round(cx) - 5):round(cx) + 5].reshape(-1, 3).mean(axis=0)
                difference = float(rgb[2] - rgb[0])
                side = min(REFERENCE[group], key=lambda s: abs(difference - REFERENCE[group][s]))
                px = (cx / width - BX) * 30 / BW
                py = (cy / height - BY) * 22 / BH
                points.append({'group': group, 'side': side, 'x': round(px, 3), 'y': round(py, 3), 'reserve': None, 'offboard': px < 0 or px > 30 or py < 0 or py > 22, '_difference': difference})
        for group in TEMPLATES:
            pair = sorted((point for point in points if point['group'] == group), key=lambda point: point['_difference'], reverse=True)
            if len(pair) == 2:
                pair[0]['side'], pair[1]['side'] = 'red', 'blue'
            for point in pair:
                del point['_difference']
        labels = []
        for reserve, template in RESERVE_TEMPLATES.items():
            for x, y, score in matches(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), template, .65, suppression=40, limit=20):
                labels.append({'x': x + template.shape[1] / 2, 'y': y + template.shape[0] / 2, 'reserve': reserve, 'score': score})
        labels.sort(key=lambda label: label['score'], reverse=True)
        unique_labels = []
        for label in labels:
            if all((label['x'] - other['x']) ** 2 + (label['y'] - other['y']) ** 2 > 40 ** 2 for other in unique_labels):
                unique_labels.append(label)
        labels = unique_labels
        assignments = []
        for label_index, label in enumerate(labels):
            for point_index, point in enumerate(points):
                px = point['x'] / 30 * BW + BX
                py = point['y'] / 22 * BH + BY
                distance = ((label['x'] / width - px) ** 2 + (label['y'] / height - py) ** 2) ** .5
                assignments.append((distance, label_index, point_index))
        assignments.sort()
        used_labels, used_points = set(), set()
        for distance, label_index, point_index in assignments:
            if distance >= .19:
                break
            if label_index in used_labels or point_index in used_points:
                continue
            used_labels.add(label_index)
            used_points.add(point_index)
            points[point_index]['reserve'] = labels[label_index]['reserve']
        for point in points:
            override = RESERVE_OVERRIDES.get((deployment['id'], point['side'], point['group']))
            if override is not None:
                point['reserve'] = override
            point['sourceX'] = point['x']
            point['sourceY'] = point['y']
            if point['offboard']:
                point['x'] = round(min(30, max(0, point['x'])), 3)
                point['y'] = round(min(22, max(0, point['y'])), 3)
        deployment['points'] = points
        deployment['guides'] = make_guides(points)
        deployment['orientation'] = orientation_for(width, height)
    problems = []
    for deployment in game['deployments']:
        points = deployment['points']
        if len(points) != 6:
            problems.append(f"{deployment['id']}: {len(points)} points")
        for side in ('red', 'blue'):
            if sorted(p['group'] for p in points if p['side'] == side) != ['dagger', 'hammer', 'shield']:
                problems.append(f"{deployment['id']}: wrong {side} groups")
    game['mapImport'] = {'method': 'Official card templates for Dagger/Shield/Hammer and RND labels; off-board reserves projected to battlefield edge.', 'problems': problems}
    game['mapImportV2'] = {'method': 'Raw off-board sourceX/sourceY preserved, source-verified reserve overrides, centre-line guides and orientation marks.', 'problems': problems}
    GAME.write_text(json.dumps(game, ensure_ascii=False, indent=2) + '\n')
    print('maps', len(game['deployments']), 'problems', problems)
    for deployment in game['deployments']:
        print(deployment['id'], ' '.join(f"{p['side'][0].upper()}{p['group'][0].upper()}{'R' + str(p['reserve']) if p['reserve'] else ''}" for p in deployment['points']))


if __name__ == '__main__':
    main()
