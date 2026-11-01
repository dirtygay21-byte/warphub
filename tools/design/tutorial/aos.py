import sys, html, math
sys.path.insert(0,'.')
import gen
from gen import *
G='#E8B84A'  # objective
def d_aos_round():
    b=f'<rect x="20" y="26" width="22" height="22" rx="5" fill="#ECECE4"/><circle cx="31" cy="37" r="2.4" fill="#111"/><rect x="50" y="26" width="22" height="22" rx="5" fill="#ECECE4"/><circle cx="56" cy="32" r="2" fill="#111"/><circle cx="66" cy="42" r="2" fill="#111"/>'
    b+=f'<text x="46" y="68" text-anchor="middle" font-size="11" fill="{F2}">бросок</text><text x="46" y="82" text-anchor="middle" font-size="11" fill="{F2}">приоритета</text>'
    b+=f'<path d="M84 46h22" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'
    b+=f'<rect x="114" y="24" width="90" height="56" rx="10" fill="#2C2C29"/><text x="159" y="48" text-anchor="middle" font-size="12" font-weight="700" fill="{A}">Ход 1</text><text x="159" y="66" text-anchor="middle" font-size="10.5" fill="{F2}">7 фаз</text>'
    b+=f'<rect x="214" y="24" width="90" height="56" rx="10" fill="#2C2C29"/><text x="259" y="48" text-anchor="middle" font-size="12" font-weight="700" fill="#F4F4F0">Ход 2</text><text x="259" y="66" text-anchor="middle" font-size="10.5" fill="{F2}">7 фаз</text>'
    b+=tag(160,112,'Победитель решает, кто ходит первым',A)
    b+=f'<text x="160" y="142" text-anchor="middle" font-size="11" fill="{F3}">Ничья — решает тот, кто ходил первым в прошлом раунде</text>'
    return svg(b,160)
def d_phases():
    names=['Начало хода','Фаза героев','Движение','Стрельба','Нападение','Бой','Конец хода']
    b=''
    for i,n in enumerate(names):
        y=20+i*21
        c=A if 0<i<6 else F3
        b+=f'<rect x="20" y="{y}" width="280" height="18" rx="6" fill="#2C2C29"/><text x="34" y="{y+13}" font-size="11" font-weight="800" fill="{c}">{i+1}</text><text x="52" y="{y+13}" font-size="11.5" fill="#F4F4F0">{n}</text>'
    return svg(b,176)
def d_warscroll():
    st=[('Move','5″'),('Health','2'),('Save','4+'),('Control','1')]
    b=f'<circle cx="160" cy="76" r="54" fill="#2C2C29" stroke="{A}" stroke-width="2"/><line x1="106" y1="76" x2="214" y2="76" stroke="rgba(255,255,255,.18)"/><line x1="160" y1="22" x2="160" y2="130" stroke="rgba(255,255,255,.18)"/>'
    pos=[(133,52),(187,52),(133,104),(187,104)]
    for (k,v),(x,y) in zip(st,pos):
        b+=f'<text x="{x}" y="{y}" text-anchor="middle" font-size="18" font-weight="800" fill="#F4F4F0">{v}</text>'
    lab=[(60,46,'Move — движение'),(260,46,'Health — здоровье'),(60,112,'Save — спасбросок'),(260,112,'Control — контроль')]
    for x,y,t in lab: b+=f'<text x="{x}" y="{y}" text-anchor="middle" font-size="10.5" fill="{F2}">{t}</text>'
    b+=f'<text x="160" y="152" text-anchor="middle" font-size="11" fill="{F3}">Пример варскролла пехоты</text>'
    return svg(b,166)
def d_cp():
    b=''
    for i in range(5):
        c=A if i<4 else '#F4F4F0'
        b+=f'<circle cx="{36+i*34}" cy="44" r="13" fill="none" stroke="{c}" stroke-width="2.4" {"stroke-dasharray=\"3 3\"" if i==4 else ""}/><text x="{36+i*34}" y="48" text-anchor="middle" font-size="10" font-weight="800" fill="{c}">CP</text>'
    b+=f'<text x="88" y="78" text-anchor="middle" font-size="11" fill="{F2}">4 CP каждому</text><text x="172" y="78" text-anchor="middle" font-size="11" fill="#F4F4F0">+1 отстающему</text>'
    b+=f'<rect x="210" y="26" width="96" height="40" rx="10" fill="#2C2C29"/><text x="258" y="44" text-anchor="middle" font-size="11" font-weight="700" fill="{A}">Rally</text><text x="258" y="59" text-anchor="middle" font-size="10" fill="{F2}">6 кубиков, 4+</text>'
    for i,v in enumerate([6,2,4,5,1,4]):
        x=40+i*40; ok=v>=4
        b+=f'<rect x="{x}" y="100" width="26" height="26" rx="6" fill="{"#ECECE4" if ok else "#3A3A36"}"/><text x="{x+13}" y="118" text-anchor="middle" font-size="13" font-weight="800" fill="{"#141413" if ok else F3}">{v}</text>'
    b+=f'<text x="160" y="148" text-anchor="middle" font-size="11" fill="{F2}">4 очка сбора: лечение или возврат моделей</text>'
    return svg(b,162)
def d_aos_move():
    b=f'<circle cx="270" cy="128" r="40" fill="rgba(248,113,113,.08)" stroke="{R}" stroke-dasharray="4 4"/>'+base(270,128,13,R)
    b+=base(40,46)+f'<line x1="56" y1="46" x2="186" y2="46" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'+tag(120,28,'Обычный ход: до Move',A)+f'<circle cx="200" cy="46" r="13" fill="none" stroke="{A}" stroke-width="2" stroke-dasharray="3 3"/>'
    b+=base(40,112)+f'<line x1="56" y1="112" x2="206" y2="112" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'+tag(124,94,'Бег: Move + D6″',A)
    b+=f'<text x="270" y="84" text-anchor="middle" font-size="10.5" fill="{R}">зона боя 3″</text>'
    b+=f'<text x="130" y="158" text-anchor="middle" font-size="11" fill="{F2}">в зону боя врага заходить нельзя</text>'
    return svg(b,170)
def d_aos_shoot():
    b=base(36,56)+base(286,56,14,R)+f'<line x1="52" y1="56" x2="270" y2="56" stroke="#F4F4F0" stroke-width="1.6" marker-end="url(#ah)"/>'+tag(160,40,'Видит и в пределах Range')
    b+=tick(36,70,92)+tick(286,70,92)+meas(36,286,86,'Range = 18″')
    b+=f'<circle cx="80" cy="140" r="34" fill="rgba(248,113,113,.08)" stroke="{R}" stroke-dasharray="4 4"/>'+base(64,140)+base(98,140,13,R)
    b+=f'<text x="210" y="136" text-anchor="middle" font-size="11.5" font-weight="700" fill="{R}">В бою — не стреляет</text><text x="210" y="152" text-anchor="middle" font-size="10.5" fill="{F2}">если нет Shoot in Combat</text>'
    return svg(b,182)
def d_aos_charge():
    b=tag(160,30,'Бросок 2D6 = 7″',A)+base(40,86)+base(282,86,14,R)
    b+=f'<circle cx="282" cy="86" r="28" fill="none" stroke="{A}" stroke-dasharray="3 3" opacity=".7"/>'
    b+=f'<line x1="56" y1="86" x2="250" y2="86" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/><circle cx="264" cy="86" r="13" fill="none" stroke="{A}" stroke-width="2" stroke-dasharray="3 3"/>'
    b+=tick(277,100,126)+tick(268,100,126)+tag(272,140,'½″',A)
    b+=f'<text x="140" y="124" text-anchor="middle" font-size="11" fill="{F2}">закончить в ½″ от видимого врага</text>'
    return svg(b,160)
def d_aos_fight():
    b=f'<circle cx="150" cy="84" r="58" fill="rgba(248,113,113,.06)" stroke="{R}" stroke-dasharray="4 4"/>'+base(150,84,14,R)
    b+=base(108,52)+base(104,108)+base(232,140)
    b+=f'<path d="M218 134 C196 124 184 116 172 104" fill="none" stroke="{A}" stroke-width="1.8" marker-end="url(#aa)"/>'+tag(252,160,'Подход до 3″',A)
    b+=f'<text x="150" y="20" text-anchor="middle" font-size="10.5" fill="{R}">зона боя 3″</text>'
    b+=f'<text x="262" y="46" text-anchor="middle" font-size="11" fill="{F2}">игроки по очереди</text><text x="262" y="62" text-anchor="middle" font-size="11" fill="{F2}">выбирают юнит</text>'
    return svg(b,176)
def d_aos_attack():
    cols=['Atk','Hit','Wnd','Rnd','Dmg']; vals=['2','3+','3+','1','1']
    b=''
    for i,(c,v) in enumerate(zip(cols,vals)):
        x=10+i*61
        b+=f'<rect x="{x}" y="20" width="57" height="22" rx="6" fill="#3B4A44"/><text x="{x+28.5}" y="35" text-anchor="middle" font-size="11" font-weight="700" fill="#F4F4F0">{c}</text><rect x="{x}" y="46" width="57" height="24" rx="6" fill="#ECECE4"/><text x="{x+28.5}" y="63" text-anchor="middle" font-size="13" font-weight="800" fill="#141413">{v}</text>'
    steps=[('Попадание','≥ Hit'),('Ранение','≥ Wnd'),('Спасбросок','− Rend'),('Урон','= Dmg')]
    for i,(t,s) in enumerate(steps):
        x=10+i*78
        b+=f'<rect x="{x}" y="86" width="70" height="56" rx="10" fill="#2C2C29"/><text x="{x+35}" y="108" text-anchor="middle" font-size="11" font-weight="700" fill="#F4F4F0">{t}</text><text x="{x+35}" y="126" text-anchor="middle" font-size="10.5" fill="{F2}">{s}</text>'
        if i<3: b+=f'<path d="M{x+71} 114h6" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'
    b+=f'<text x="160" y="162" text-anchor="middle" font-size="11" fill="{F3}">1 — всегда провал · 6 на попадание — критическое</text>'
    return svg(b,174)
def d_objective():
    b=f'<circle cx="160" cy="84" r="62" fill="none" stroke="rgba(232,184,74,.5)" stroke-dasharray="4 4"/><circle cx="160" cy="84" r="16" fill="{G}" opacity=".9"/><text x="160" y="88" text-anchor="middle" font-size="10" font-weight="800" fill="#111">ОБ</text>'
    for x,y in [(110,58),(108,92),(122,124)]: b+=base(x,y)
    for x,y in [(210,60),(214,104)]: b+=base(x,y,13,R)
    b+=tag(60,160,'Control 3',A)+tag(262,160,'Control 2',R)
    b+=f'<text x="160" y="20" text-anchor="middle" font-size="10.5" fill="{G}">объект в зоне боя модели (3″)</text>'
    return svg(b,176)

CARDS=[
 ('Раунд битвы','Battle Round',None,d_aos_round,['В раунде два хода: сначала ходит один игрок, затем другой.','С 2-го раунда игроки бросают кубик приоритета (priority roll). Победитель решает, кто ходит первым.','В 1-м раунде решает тот, кто первым закончил расстановку.'],'Можно отдать первый ход сопернику — иногда так выгоднее.'),
 ('Фазы хода','Turn Phases',None,d_phases,['Ход — 7 фаз по порядку.','В каждой фазе сначала действует активный игрок, затем соперник.','Юнит использует не больше одной базовой (Core) способности за фазу.'],None),
 ('Варскролл','Warscroll',None,d_warscroll,['**Move** — на сколько дюймов ходит модель.','**Health** — сколько урона выдерживает одна модель.','**Save** — спасбросок (меньше — лучше), **Control** — вес модели на объекте.'],None),
 ('Очки команд','Command Points',None,d_cp,['В начале раунда каждый игрок получает 4 CP. Отстающий по очкам (underdog) — 5.','CP тратят на команды, например **Rally** в фазе героев.','Rally: 6 кубиков, каждая 4+ — очко сбора. Очки лечат юнит или возвращают погибшие модели.'],'Неиспользованные CP сгорают в конце раунда.'),
 ('Фаза движения','Movement Phase','3',d_aos_move,['**Обычный ход** (Normal Move) — до Move дюймов.','**Бег** (Run) — Move + D6″.','**Отступление** (Retreat) — выйти из боя: юнит получает D3 смертельного урона.'],'В зону боя врага (3″) ходом заходить нельзя. После бега и отступления — без стрельбы и нападения.'),
 ('Фаза стрельбы','Shooting Phase','4',d_aos_shoot,['Цель должна быть видна и в пределах дальности оружия (Range).','Можно разделить атаки юнита между несколькими целями.'],'Юнит в бою не стреляет, если у оружия нет Shoot in Combat.'),
 ('Фаза нападения','Charge Phase','5',d_aos_charge,['Юнит не в бою и без бега/отступления бросает 2D6.','Двигается не дальше выпавшего и заканчивает в пределах ½″ от видимого врага.','Нападение даёт право бить в фазе боя.'],None),
 ('Фаза боя','Combat Phase','6',d_aos_fight,['Игроки по очереди выбирают юнит для удара, начиная с активного игрока.','Перед атаками — **подход** (pile-in) до 3″, не дальше от цели.','Юнит в бою обязан сражаться, если может.'],None),
 ('Атака','Attack Sequence',None,d_aos_attack,['**Попадание**: D6 ≥ Hit. **Ранение**: D6 ≥ Wound.','**Спасбросок**: защитник бросает D6 и вычитает Rend. Не меньше Save — атака отражена.','Иначе цель получает урон, равный Damage.'],'Шестёрка на попадание — критическое (Crit): срабатывают способности оружия.'),
 ('Объекты','Objectives',None,d_objective,['Модель борется за объект, если он в её зоне боя (3″).','Сложите Control своих моделей у объекта. У кого больше — тот контролирует.','Контроль проверяют в конце каждого хода; объект остаётся вашим, пока его не заберут.'],'Победные очки за объекты и задания — по правилам выбранного батлплана.'),
 ('Готов к игре','Next Steps',None,d_done,['Вы знаете весь ход — остальное придёт в первой партии.','Варскроллы и способности — в WarpBuilder.'],None),
]
import re
CARDS=[(a,b,c,d,[re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',x) for x in e],f) for a,b,c,d,e,f in CARDS]
n=len(CARDS)
screens=[gen.card(i,c,n).replace('Как играть · 40K','Как играть · AoS') for i,c in enumerate(CARDS)]
doc=f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Обучение AoS</title><script src="./support.js"></script></head><body>
<x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&amp;family=Oswald:wght@500;600;700&amp;display=swap"><style>body{{margin:0}} b{{color:#F4F4F0;font-weight:700}}</style></helmet>
<div style="width:2440px;height:1680px;background:#0B0B0A;color:#F4F4F0;font-family:'Inter Tight',sans-serif;padding:60px 40px;box-sizing:border-box;display:flex;flex-wrap:wrap;gap:40px 36px;align-content:flex-start">{''.join(screens)}</div>
</x-dc></body></html>'''
open('../design/project/TutorialAoS.dc.html','w').write(doc)
print('ok')
