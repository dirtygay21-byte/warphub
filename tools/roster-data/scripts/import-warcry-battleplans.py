#!/usr/bin/env python3
"""Import Warcrier battleplan text and official deployment-card links."""
from pathlib import Path
import json
import re
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / 'backend/roster-data/warcry/game.json'
BASE = 'https://warcrier.net'
CORRECTIONS = {
    'arc placed': 'are placed',
    'scorts': 'scores',
    'battJe': 'battle',
    ' lf ': ' If ',
    'or or': 'or',
}


def clean(text):
    text = re.sub(r'[\u200b\u200c\u200d\ufeff]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    for source, replacement in CORRECTIONS.items():
        text = text.replace(source, replacement)
    return re.sub(r'\s+([,.;:])', r'\1', text)


def get(path):
    response = requests.get(BASE + path, timeout=60)
    response.raise_for_status()
    return BeautifulSoup(response.text, 'html.parser')


def sections(path, expected):
    soup = get(path)
    expected = {'Cut off the Head' if name == 'Cut of the Head' else name for name in expected}
    result = []
    for heading in soup.find_all('h4'):
        name = heading.get_text(' ', strip=True).replace('\u200b', '').strip()
        name = {'Cut of the Head': 'Cut off the Head'}.get(name, name)
        if name not in expected:
            continue
        parts = []
        for element in heading.next_elements:
            if getattr(element, 'name', None) in ('h3', 'h4'):
                break
            if isinstance(element, str) and element.strip():
                parts.append(element.strip())
        text = clean(' '.join(parts))
        end = None
        match = re.search(r'(?:after|at the end of) the (first|second|third|fourth|fifth) battle round', text, re.I)
        if match:
            end = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5}[match.group(1).lower()]
        numeric = re.search(r'battle ends after (\d+) battle rounds', text, re.I)
        if numeric:
            end = int(numeric.group(1))
        alternate = re.search(r'after the end of the (first|second|third|fourth|fifth) battle round', text, re.I)
        if alternate:
            end = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5}[alternate.group(1).lower()]
        result.append({'id': re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-'), 'name': name, 'text': text, 'endRound': end})
    assert len(result) == len(expected), (path, len(result), len(expected))
    return result


def main():
    game = json.loads(GAME.read_text())
    deployment_a = game['deploymentOptions']['tableA']
    deployment_b = game['deploymentOptions']['tableB']
    victory_a = game['victoryOptions']['tableA']
    victory_b = game['victoryOptions']['tableB']
    soup = get('/docs/battles/battleplan-generator/deployment-maps')
    images = {}
    for heading in soup.find_all('h4'):
        name = heading.get_text(' ', strip=True).replace('\u200b', '').strip()
        image = heading.find_next('img')
        if image and image.get('src'):
            images[name] = image['src']
    game['deployments'] = [
        {'id': re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-'), 'name': name, 'table': table, 'image': images[name], 'points': []}
        for table, names in [('tableA', deployment_a), ('tableB', deployment_b)]
        for name in names
    ]
    game['victories'] = {
        'tableA': sections('/docs/battles/battleplan-generator/victory-conditions', victory_a),
        'tableB': sections('/docs/battles/battleplan-generator/victory-conditions', victory_b),
    }
    soup = get('/docs/battles/battleplan-generator/twists')
    current_twists = [heading.get_text(' ', strip=True).replace('\u200b', '').strip() for heading in soup.find_all('h4')][:18]
    twists = sections('/docs/battles/battleplan-generator/twists', current_twists)
    game['twists'] = twists
    GAME.write_text(json.dumps(game, ensure_ascii=False, indent=2) + '\n')
    print('deployments', len(game['deployments']), 'victories', sum(len(v) for v in game['victories'].values()), 'twists', len(twists))


if __name__ == '__main__':
    main()
