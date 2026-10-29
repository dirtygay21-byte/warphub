#!/usr/bin/env python3
"""Сверка очков юнитов AoS с BSData (age-of-sigmar-4th; его же показывает sigdex.io).

Запуск: python3 scripts/bsdata-aos-compare.py <путь к клону BSData/age-of-sigmar-4th>
Пишет aos/bsdata-compare.json: совпадения, расхождения очков, юниты только у нас / только в BSData.
Данные приложения не меняет: расхождения разбираются вручную (официальные документы GW важнее обоих).
Сопоставление имён: регистр и знаки не важны; «Scourge of Aqshy X» = «X (Scourge of Aqshy)»;
у юнитов с малым размером («X (2 models)») цена BSData сравнивается с любым из профилей.
"""
import glob, json, os, re, subprocess, sys, xml.etree.ElementTree as ET

BS = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/bsdata/age-of-sigmar-4th'
HERE = os.path.dirname(os.path.abspath(__file__))
OUR = os.path.join(HERE, '../../../backend/roster-data/aos')
tag = lambda e: e.tag.split('}')[-1]
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())

def season_name(name):
    m = re.match(r'^(Scourge of (?:Aqshy|Ghyran)) (.+)$', name)
    return f'{m.group(2)} ({m.group(1)})' if m else name

def costs(path):
    out, units = {}, set()
    for e in ET.parse(path).getroot().iter():
        if (tag(e) == 'selectionEntry' and e.get('type') == 'unit') or (tag(e) == 'entryLink' and e.get('type') == 'selectionEntry'):
            pts = next((float(cc.get('value')) for c in e if tag(c) == 'costs' for cc in c if cc.get('name') == 'pts'), None)
            if tag(e) == 'selectionEntry': units.add(norm(e.get('name')))
            if pts is not None or norm(e.get('name')) not in out: out[norm(e.get('name'))] = (e.get('name'), pts)
    return out, units

idx = json.load(open(os.path.join(OUR, 'index.json')))
rev = ET.parse(glob.glob(BS + '/*.gst')[0]).getroot().get('revision')
commit = subprocess.run(['git', '-C', BS, 'log', '-1', '--format=%h %cs'], capture_output=True, text=True).stdout.strip()
rep = {'bsdata': {'repo': 'https://github.com/BSData/age-of-sigmar-4th', 'revision': rev, 'commit': commit}, 'ours': idx['lastUpdate'], 'factions': []}
tot = dict(same=0, diff=0, onlyOurs=0, onlyBs=0)
for f in idx['factions']:
    d = json.load(open(os.path.join(OUR, 'f', f['id'] + '.json')))
    bs, units = {}, set()
    for p in sorted(glob.glob(BS + '/*.cat')):
        if os.path.basename(p) in (f['name'] + ' - Library.cat', f['name'] + '.cat'):
            c, u = costs(p); units |= u
            for k, v in c.items():
                if v[1] is not None or k not in bs: bs[k] = v
    ours = {}
    for w in d['warscrolls']:
        if w.get('kind') == 'manifestation': continue
        base = re.sub(r' \((?:\d+ models?)\)$', '', w['name'])
        ours.setdefault(norm(season_name(base)), []).append(w)
    same, diffs, only = 0, [], []
    for k, ws in ours.items():
        if k not in bs or bs[k][1] is None:
            if k not in bs: only.append(ws[0]['name'])
            continue
        v = int(bs[k][1])
        if any(w['cost'] == v for w in ws): same += 1
        else: diffs.append({'unit': ws[0]['name'], 'ours': [w['cost'] for w in ws], 'bsdata': v})
    onlyBs = sorted(bs[k][0] for k in bs if k in units and k not in ours and bs[k][1])
    tot['same'] += same; tot['diff'] += len(diffs); tot['onlyOurs'] += len(only); tot['onlyBs'] += len(onlyBs)
    rep['factions'].append({'id': f['id'], 'name': f['name'], 'same': same, 'diff': diffs, 'onlyOurs': sorted(only), 'onlyBs': onlyBs})
rep['total'] = tot
json.dump(rep, open(os.path.join(HERE, '../aos/bsdata-compare.json'), 'w'), ensure_ascii=False, indent=1)
print(rev, commit, tot)
for r in rep['factions']:
    for x in r['diff']: print(f"  {r['id']}: {x['unit']} — у нас {x['ours']}, BSData {x['bsdata']}")
