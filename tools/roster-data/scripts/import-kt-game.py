#!/usr/bin/env python3
"""Import Approved Ops rules without crossing mission-card boundaries."""
from pathlib import Path
import json
import re
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / 'backend/roster-data/kt/game.json'
URL = 'https://wahapedia.ru/kill-team3/the-rules/approved-ops-2025/'
STOP = {'Volkus', 'Gallowdark', 'Non-Specific Killzone Maps', 'Octarius', 'Tomb World', 'Bheta-Decima'}


def clean(text):
    text = re.sub(r'[\u200b\u200c\u200d\ufeff]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    text = text.replace('ADITIONAL RULES', 'ADDITIONAL RULES')
    text = re.sub(r'\s+([,.;:])', r'\1', text)
    return text


def main():
    game = json.loads(GAME.read_text())
    soup = BeautifulSoup(requests.get(URL, timeout=60).text, 'html.parser')
    headings = soup.find_all('h3')
    crit = []
    for number, name in enumerate(game['missionPack']['missions'], 1):
        title = f'{number}. {name}'
        heading = next(h for h in headings if h.get_text(' ', strip=True) == title)
        parts = []
        for element in heading.next_elements:
            if getattr(element, 'name', None) == 'h3':
                next_title = element.get_text(' ', strip=True)
                if next_title in STOP or re.match(r'^\d+\.\s', next_title):
                    break
            if isinstance(element, str) and element.strip():
                parts.append(element.strip())
        text = clean(' '.join(parts))
        if text.startswith(title):
            text = text[len(title):].strip()
        text = re.sub(r'\s*Crit Op$', '', text)
        assert text.startswith('MISSION ACTION') or text.startswith('ADDITIONAL RULES'), (title, text[:100])
        assert 'Crit Op' not in text, (title, text[-100:])
        crit.append({'id': name.lower().replace(' ', '-'), 'name': name, 'text': text})
    assert len(crit) == 9
    game['critOps'] = crit
    raw = requests.get(URL, timeout=60).text
    seen = set()
    tac = []
    for chunk in raw.split('<div class="cgCard')[1:]:
        fragment = BeautifulSoup('<div class="cgCard' + chunk.split("', '")[0], 'html.parser')
        name_node = fragment.select_one('.cgArchetypebellowName')
        archetype_node = fragment.select_one('.cgArchetypebellow')
        text_node = fragment.select_one('.cgText')
        if not name_node or not archetype_node or not text_node:
            continue
        name = clean(name_node.get_text(' ', strip=True))
        archetype = clean(archetype_node.get_text(' ', strip=True))
        key = (archetype, name)
        if key in seen:
            continue
        seen.add(key)
        tac.append({'id': name.lower().replace(' ', '-').replace('&', 'and'), 'name': name, 'archetype': archetype, 'text': clean(text_node.get_text(' ', strip=True))})
    assert len(tac) == 12
    game['tacOps'] = tac
    GAME.write_text(json.dumps(game, ensure_ascii=False, indent=2) + '\n')
    print('critOps', len(crit), 'tacOps', len(tac))


if __name__ == '__main__':
    main()
