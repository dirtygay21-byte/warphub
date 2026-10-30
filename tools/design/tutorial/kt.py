import sys, re
sys.path.insert(0,'.')
import gen
from gen import *
G='#E8B84A'
def dice(x,y,v,ok=True,crit=False,size=24):
    fill='#ECECE4' if ok else '#3A3A36'
    st=f' stroke="{A}" stroke-width="2.5"' if crit else ''
    return f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="6" fill="{fill}"{st}/><text x="{x+size/2}" y="{y+size/2+5}" text-anchor="middle" font-size="13" font-weight="800" fill="{"#141413" if ok else F3}">{v}</text>'
def d_kt_game():
    b=''
    for i in range(4):
        x=12+i*76
        b+=f'<rect x="{x}" y="26" width="70" height="92" rx="10" fill="#2C2C29"/><text x="{x+35}" y="46" text-anchor="middle" font-size="11.5" font-weight="800" fill="{A}">TP {i+1}</text>'
        b+=f'<rect x="{x+8}" y="56" width="54" height="22" rx="6" fill="#3B4A44"/><text x="{x+35}" y="71" text-anchor="middle" font-size="10" fill="#F4F4F0">Стратегия</text>'
        b+=f'<rect x="{x+8}" y="84" width="54" height="22" rx="6" fill="rgba(236,254,70,.18)"/><text x="{x+35}" y="99" text-anchor="middle" font-size="10" fill="{A}">Перестрелка</text>'
    b+=f'<text x="160" y="146" text-anchor="middle" font-size="11" fill="{F2}">4 переломных момента (Turning Points)</text>'
    return svg(b,160)
def d_kt_card():
    st=[('APL','2'),('Move','6″'),('Save','3+'),('Wounds','8')]
    b=''
    for i,(k,v) in enumerate(st):
        x=14+i*76
        b+=f'<text x="{x+34}" y="36" text-anchor="middle" font-size="11.5" font-weight="700" fill="{F2}">{k}</text><rect x="{x}" y="44" width="68" height="40" rx="9" fill="#ECECE4"/><text x="{x+34}" y="71" text-anchor="middle" font-size="18" font-weight="800" fill="#141413">{v}</text>'
    cols=['Atk','Hit','Dmg']; vals=['4','3+','3/4']
    for i,(c,v) in enumerate(zip(cols,vals)):
        x=14+i*100
        b+=f'<rect x="{x}" y="100" width="92" height="20" rx="6" fill="#3B4A44"/><text x="{x+46}" y="114" text-anchor="middle" font-size="11" font-weight="700" fill="#F4F4F0">{c}</text><rect x="{x}" y="122" width="92" height="22" rx="6" fill="#2C2C29"/><text x="{x+46}" y="138" text-anchor="middle" font-size="13" font-weight="800" fill="{A}">{v}</text>'
    b+=f'<text x="160" y="164" text-anchor="middle" font-size="11" fill="{F3}">Пример: Dmg 3/4 — обычный / критический урон</text>'
    return svg(b,176)
def d_kt_strategy():
    b=dice(40,30,5)+dice(70,30,3,False)
    b+=f'<text x="66" y="76" text-anchor="middle" font-size="11" fill="{F2}">D6 против D6</text>'+tag(66,98,'Инициатива',A)
    b+=f'<rect x="150" y="24" width="156" height="92" rx="12" fill="#2C2C29"/><text x="228" y="44" text-anchor="middle" font-size="11.5" font-weight="700" fill="#F4F4F0">Очки команд (CP)</text>'
    b+=f'<text x="162" y="68" font-size="11" fill="{F2}">с инициативой</text><text x="296" y="68" text-anchor="end" font-size="13" font-weight="800" fill="{A}">+1</text>'
    b+=f'<text x="162" y="92" font-size="11" fill="{F2}">без инициативы</text><text x="296" y="92" text-anchor="end" font-size="13" font-weight="800" fill="{A}">+2</text>'
    b+=f'<text x="160" y="146" text-anchor="middle" font-size="11" fill="{F3}">Старт — 2 CP, в 1-й фазе стратегии +1 каждому</text>'
    return svg(b,160)
def d_kt_firefight():
    seq=[('A','2'),('B','2'),('A','3'),('B','2'),('A','2')]
    b=''
    for i,(p,apl) in enumerate(seq):
        x=14+i*60; c=A if p=='A' else R
        b+=f'<rect x="{x}" y="30" width="52" height="64" rx="10" fill="#2C2C29" stroke="{c}" stroke-width="1.5"/><text x="{x+26}" y="54" text-anchor="middle" font-size="12" font-weight="800" fill="{c}">{"Вы" if p=="A" else "Враг"}</text>'
        for k in range(int(apl)): b+=f'<circle cx="{x+26-(int(apl)-1)*7+k*14}" cy="76" r="5" fill="{c}"/>'
        if i<4: b+=f'<path d="M{x+53} 62h6" stroke="#F4F4F0" stroke-width="1.5"/>'
    b+=f'<text x="160" y="118" text-anchor="middle" font-size="11" fill="{F2}">точки — очки действий (AP), не больше APL</text>'
    b+=tag(160,146,'Активировал — оперативник «отработан»')
    return svg(b,160)
def d_kt_orders():
    b=f'<rect x="20" y="24" width="130" height="96" rx="12" fill="#2C2C29"/><polygon points="85,38 103,56 85,74 67,56" fill="{A}"/><text x="85" y="96" text-anchor="middle" font-size="12.5" font-weight="800" fill="{A}">Engage</text><text x="85" y="112" text-anchor="middle" font-size="10.5" fill="{F2}">атака и контрдействие</text>'
    b+=f'<rect x="170" y="24" width="130" height="96" rx="12" fill="#2C2C29"/><polygon points="235,38 253,56 235,74 217,56" fill="none" stroke="#F4F4F0" stroke-width="2.5"/><text x="235" y="96" text-anchor="middle" font-size="12.5" font-weight="800" fill="#F4F4F0">Conceal</text><text x="235" y="112" text-anchor="middle" font-size="10.5" fill="{F2}">скрыт в укрытии</text>'
    b+=f'<text x="160" y="146" text-anchor="middle" font-size="11" fill="{F3}">Приказ выбирают при каждой активации</text>'
    return svg(b,160)
def d_kt_move():
    b=base(36,40)+f'<line x1="52" y1="40" x2="176" y2="40" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'+tag(112,22,'Reposition 1AP: до Move',A)
    b+=base(36,86)+f'<line x1="52" y1="86" x2="96" y2="86" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'+tag(150,86,'Dash 1AP: до 3″',A)
    b+=f'<circle cx="270" cy="132" r="26" fill="rgba(248,113,113,.07)" stroke="{R}" stroke-dasharray="3 3"/>'+base(270,132,13,R)
    b+=base(36,132)+f'<line x1="52" y1="132" x2="230" y2="132" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'+tag(140,114,'Charge 1AP: Move + 2″',A)
    b+=f'<text x="270" y="172" text-anchor="middle" font-size="10.5" fill="{R}">дистанция контроля 1″</text>'
    return svg(b,182)
def d_kt_cover():
    b=base(36,70)+base(286,70,13,R)+f'<path d="M248 48v44h12V48z" fill="#3A3A36" stroke="#5A5A54" stroke-width="1.5"/>'
    b+=f'<circle cx="286" cy="70" r="26" fill="none" stroke="{R}" stroke-dasharray="3 3"/>'
    b+=f'<line x1="52" y1="70" x2="244" y2="70" stroke="#F4F4F0" stroke-width="1.6" stroke-dasharray="5 4"/>'+tag(150,52,'Видит, но цель в укрытии')
    b+=f'<text x="286" y="112" text-anchor="middle" font-size="10.5" fill="{F2}">террейн в 1″</text>'
    b+=dice(60,124,'✓',True,False,26)+dice(92,124,'?',False,False,26)+dice(124,124,'?',False,False,26)
    b+=f'<text x="166" y="141" font-size="11" fill="{F2}">1 кубик — сразу успех</text>'
    return svg(b,166)
def d_kt_shoot():
    b=f'<text x="14" y="30" font-size="11" font-weight="700" fill="{A}">Атака: Atk 4, Hit 3+</text>'
    for i,(v,ok,cr) in enumerate([(6,True,True),(4,True,False),(3,True,False),(1,False,False)]): b+=dice(14+i*32,40,v,ok,cr)
    b+=f'<text x="170" y="30" font-size="11" font-weight="700" fill="{R}">Защита: 3 кубика, Save 4+</text>'
    for i,(v,ok,cr) in enumerate([(5,True,False),(2,False,False),(6,True,True)]): b+=dice(170+i*32,40,v,ok,cr)
    b+=f'<text x="14" y="94" font-size="11" fill="{F2}"><tspan fill="{A}" font-weight="700">6</tspan> — критический успех, <tspan font-weight="700" fill="#F4F4F0">1</tspan> — всегда провал</text>'
    b+=f'<text x="14" y="114" font-size="11" fill="{F2}">Обычный блок снимает обычный успех</text><text x="14" y="132" font-size="11" fill="{F2}">Критический блок — любой; 2 обычных — критический</text>'
    b+=tag(160,154,'Осталось 1 попадание → урон Dmg',A)
    return svg(b,168)
def d_kt_fight():
    b=base(130,60)+base(170,60,13,R)+f'<circle cx="130" cy="60" r="27" fill="none" stroke="{A}" stroke-dasharray="3 3" opacity=".6"/>'
    b+=tag(150,26,'Враг в 1″ — бой')
    seq=[('Вы','удар',A),('Враг','блок',R),('Вы','удар',A),('Враг','удар',R)]
    for i,(p,a,c) in enumerate(seq):
        x=14+i*76
        b+=f'<rect x="{x}" y="100" width="68" height="42" rx="9" fill="#2C2C29" stroke="{c}" stroke-width="1.2"/><text x="{x+34}" y="117" text-anchor="middle" font-size="11" font-weight="700" fill="{c}">{p}</text><text x="{x+34}" y="133" text-anchor="middle" font-size="10.5" fill="{F2}">{a}</text>'
    b+=f'<text x="160" y="162" text-anchor="middle" font-size="11" fill="{F3}">по одному кубику по очереди, начиная с атакующего</text>'
    return svg(b,172)
def d_kt_obj():
    b=f'<circle cx="160" cy="80" r="16" fill="{G}" opacity=".9"/><circle cx="160" cy="80" r="46" fill="none" stroke="rgba(232,184,74,.5)" stroke-dasharray="4 4"/>'
    b+=base(124,62)+base(126,104)+base(198,80,13,R)
    b+=f'<text x="124" y="66" text-anchor="middle" font-size="10" font-weight="800" fill="{A}">2</text><text x="126" y="108" text-anchor="middle" font-size="10" font-weight="800" fill="{A}">2</text><text x="198" y="84" text-anchor="middle" font-size="10" font-weight="800" fill="{R}">3</text>'
    b+=tag(60,150,'APL 2 + 2 = 4',A)+tag(260,150,'APL 3',R)
    b+=f'<text x="160" y="22" text-anchor="middle" font-size="10.5" fill="{G}">объект в 1″ от оперативника</text>'
    return svg(b,166)

CARDS=[
 ('Как устроен бой','Battle Sequence',None,d_kt_game,['Партия — 4 переломных момента (Turning Points).','Каждый — фаза стратегии, затем фаза перестрелки.','Поле — 30″ × 22″, у каждого игрока 10 кубиков D6.'],None),
 ('Датакарта','Operative Datacard',None,d_kt_card,['**APL** — сколько очков действий (AP) у оперативника за активацию.','**Move** — движение, **Save** — спасбросок, **Wounds** — раны.','Оружие: **Atk** — кубики атаки, **Hit** — сколько нужно, **Dmg** — урон.'],None),
 ('Фаза стратегии','Strategy Phase','1',d_kt_strategy,['Игроки бросают по D6 — у кого больше, тот получает инициативу (Initiative).','При ничьей решает игрок без инициативы.','Затем начисляются CP, и игроки по очереди используют гамбиты и приёмы (ploys) — по 1 CP.'],None),
 ('Фаза перестрелки','Firefight Phase','2',d_kt_firefight,['Игроки по очереди активируют по одному оперативнику, начиная с игрока с инициативой.','Активация: выбрать приказ и потратить AP на действия — не больше APL.','Одно действие нельзя повторить в одной активации.'],'Когда у вас все отработали, а у врага нет — один ваш оперативник с Engage может сделать контрдействие (Counteract) за 1 AP.'),
 ('Приказы','Orders',None,d_kt_orders,['**Engage** — обычные действия и контрдействие.','**Conceal** — в укрытии оперативник не может быть целью.'],'С приказом Conceal нельзя стрелять и нападать.'),
 ('Движение','Movement Actions',None,d_kt_move,['**Reposition** (1 AP) — до Move. **Dash** (1 AP) — до 3″.','**Charge** (1 AP) — Move + 2″, закончить в 1″ от врага.','**Fall Back** (2 AP) — выйти из 1″ от врага.'],'Дистанция контроля (control range) — 1″. Подходить в неё можно только нападением.'),
 ('Видимость и укрытие','Cover',None,d_kt_cover,['Цель видна, если от головы стрелка можно провести линию до любой части цели.','Цель в укрытии, если между ними есть террейн в 1″ от цели.','В укрытии один кубик защиты сразу считается успехом.'],'Ближе 2″ от стрелка укрытие не работает.'),
 ('Стрельба','Shoot',None,d_kt_shoot,['Атакующий бросает Atk кубиков: ≥ Hit — успех.','Защитник бросает 3 кубика: ≥ Save — блок.','Неотбитые попадания наносят урон: обычный или критический.'],'Нельзя стрелять, если враг уже в 1″ от вас.'),
 ('Ближний бой','Fight',None,d_kt_fight,['Действие **Fight** (1 AP) — если враг в 1″.','Оба бросают кубики атаки оружия ближнего боя.','По очереди каждый успех — удар (урон) или блок (снять успех врага).'],None),
 ('Раны и объекты','Injured · Objectives',None,d_kt_obj,['Меньше половины ран — оперативник ранен: −2″ к Move, Hit хуже на 1.','Объект оспаривают оперативники в 1″ от него.','Сложите APL: у кого сумма больше — тот контролирует объект.'],'Победные очки — по заданиям выбранной миссии.'),
 ('Готов к игре','Next Steps',None,d_done,['Вы знаете весь ход — остальное придёт в первой партии.','Команды и датакарты — в WarpBuilder.'],None),
]
CARDS=[(a,b,c,d,[re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',x) for x in e],f) for a,b,c,d,e,f in CARDS]
n=len(CARDS)
screens=[gen.card(i,c,n).replace('Как играть · 40K','Как играть · KT') for i,c in enumerate(CARDS)]
doc=f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Обучение Kill Team</title><script src="./support.js"></script></head><body>
<x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&amp;family=Oswald:wght@500;600;700&amp;display=swap"><style>body{{margin:0}} b{{color:#F4F4F0;font-weight:700}}</style></helmet>
<div style="width:2440px;height:1680px;background:#0B0B0A;color:#F4F4F0;font-family:'Inter Tight',sans-serif;padding:60px 40px;box-sizing:border-box;display:flex;flex-wrap:wrap;gap:40px 36px;align-content:flex-start">{''.join(screens)}</div>
</x-dc></body></html>'''
open('../design/project/TutorialKT.dc.html','w').write(doc)
print('ok')
