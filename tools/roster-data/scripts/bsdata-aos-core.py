#!/usr/bin/env python3
"""
Основные способности оружия и ключевых слов AoS 4 из BSData (решение владельца 30.10.2026: второй источник AoS —
BSData age-of-sigmar-4th) → client/src/features/roster/aos/core-rules.json. Подсказки в карточке юнита (07.11.2026):
нажатие на способность оружия («Crit (Mortal)», «Anti-X (+1 Rend)»…) или ключевое слово (FLY, WARD…) открывает текст.

  python3 tools/roster-data/scripts/bsdata-aos-core.py --repo /path/to/age-of-sigmar-4th

Тексты — как в файле игры BSData («Age of Sigmar 4.0.gst»); FLY и Ward сверены с Core Rules (Wahapedia, разделы 15.4 и 18.1).
Разметка BSData (**жирный**, ^^КЛЮЧЕВОЕ^^) убирается. Ничего не дописывается: нет правила в файле — нет подсказки.
"""
import argparse
import datetime
import html
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = os.path.join(ROOT, 'client', 'src', 'features', 'roster', 'aos', 'core-rules.json')

WEAPON = ['Anti-X (+1 Rend)', 'Charge (+1 Damage)', 'Companion', 'Crit (2 Hits)', 'Crit (Auto-wound)', 'Crit (Mortal)', 'Shoot In Combat']
# ключевое слово варскролла → основная способность с тем же смыслом (профили «Ability (Passive)» в файле игры)
KEYWORDS = {'FLY': 'Fly', 'WARD': 'Ward Save', 'CHAMPION': 'Champion', 'MUSICIAN': 'Musician', 'STANDARD BEARER': 'Standard Bearer', 'BEAST': 'Beast'}


def clean(s: str) -> str:
    s = html.unescape(s).replace('\xa0', ' ')
    s = s.replace('**', '').replace('^^', '')
    return re.sub(r'[ \t]+', ' ', s).strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    a = ap.parse_args()
    gst = os.path.join(a.repo, 'Age of Sigmar 4.0.gst')
    s = open(gst, encoding='utf8').read()
    weapon = []
    for name in WEAPON:
        m = re.search(r'<rule [^>]*name="' + re.escape(name) + r'"[^>]*>.*?<description>(.*?)</description>', s, re.S)
        if not m:
            sys.exit(f'нет правила оружия «{name}» в {gst}')
        weapon.append({'name': 'Shoot in Combat' if name == 'Shoot In Combat' else name, 'text': clean(m.group(1))})
    keywords = []
    for kw, name in KEYWORDS.items():
        m = re.search(r'<profile [^>]*name="' + re.escape(name) + r'"[^>]*>(.*?)</profile>', s, re.S)
        e = m and re.search(r'<characteristic name="Effect"[^>]*>(.*?)</characteristic>', m.group(1), re.S)
        if not e:
            sys.exit(f'нет способности «{name}» в {gst}')
        keywords.append({'keyword': kw, 'name': name, 'text': clean(e.group(1))})
    commit = subprocess.run(['git', '-C', a.repo, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    date = subprocess.run(['git', '-C', a.repo, 'log', '-1', '--format=%cs'], capture_output=True, text=True).stdout.strip()
    out = {
        'source': {
            'name': 'BSData age-of-sigmar-4th · Age of Sigmar 4.0.gst',
            'url': 'https://github.com/BSData/age-of-sigmar-4th',
            'commit': commit,
            'date': date,
            'checked': datetime.date.today().isoformat(),
            'note': 'FLY и Ward сверены с Core Rules AoS 4 (Wahapedia, 15.4 и 18.1)',
        },
        'weaponAbilities': weapon,
        'keywords': keywords,
    }
    with open(OUT, 'w', encoding='utf8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{OUT}: способностей оружия {len(weapon)}, ключевых слов {len(keywords)} ({commit[:7]}, {date})')


if __name__ == '__main__':
    main()
