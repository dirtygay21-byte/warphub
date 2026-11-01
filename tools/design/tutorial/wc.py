import sys, re
sys.path.insert(0,'.')
import gen
from gen import *
from kt import dice
def d_wc_round():
    ph=[('Инициатива','6 кубиков'),('Резерв','со 2-го раунда'),('Бой','активации')]
    b=''
    for i,(t,s) in enumerate(ph):
        x=12+i*102
        b+=f'<rect x="{x}" y="34" width="94" height="66" rx="10" fill="#2C2C29"/><circle cx="{x+16}" cy="50" r="10" fill="{A}"/><text x="{x+16}" y="54" text-anchor="middle" font-size="11" font-weight="800" fill="#111">{i+1}</text><text x="{x+47}" y="76" text-anchor="middle" font-size="12" font-weight="700" fill="#F4F4F0">{t}</text><text x="{x+47}" y="92" text-anchor="middle" font-size="10.5" fill="{F2}">{s}</text>'
        if i<2: b+=f'<path d="M{x+95} 67h6" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'
    b+=f'<text x="160" y="128" text-anchor="middle" font-size="11" fill="{F2}">Число раундов задаёт условие победы</text>'
    return svg(b,144)
def d_wc_card():
    st=[('Move','4″'),('Tough.','4'),('Wounds','15')]
    b=''
    for i,(k,v) in enumerate(st):
        x=14+i*100
        b+=f'<text x="{x+46}" y="34" text-anchor="middle" font-size="11.5" font-weight="700" fill="{F2}">{k}</text><rect x="{x}" y="42" width="92" height="38" rx="9" fill="#ECECE4"/><text x="{x+46}" y="68" text-anchor="middle" font-size="18" font-weight="800" fill="#141413">{v}</text>'
    cols=['Range','Attacks','Strength','Damage']; vals=['1','3','4','1/3']
    for i,(c,v) in enumerate(zip(cols,vals)):
        x=14+i*75
        b+=f'<rect x="{x}" y="96" width="69" height="20" rx="6" fill="#3B4A44"/><text x="{x+34.5}" y="110" text-anchor="middle" font-size="10.5" font-weight="700" fill="#F4F4F0">{c}</text><rect x="{x}" y="118" width="69" height="22" rx="6" fill="#2C2C29"/><text x="{x+34.5}" y="134" text-anchor="middle" font-size="13" font-weight="800" fill="{A}">{v}</text>'
    b+=f'<text x="160" y="160" text-anchor="middle" font-size="11" fill="{F3}">Пример · Damage 1/3 — обычное / критическое</text>'
    return svg(b,172)
def d_wc_init():
    roll=[(1,True),(3,True),(5,True),(6,True),(4,False),(4,False)]
    b=f'<text x="14" y="28" font-size="11" font-weight="700" fill="#F4F4F0">Бросок 6 кубиков</text>'
    for i,(v,single) in enumerate(roll):
        x=14+i*34
        b+=dice(x,38,v,True,single,26)
    b+=f'<text x="14" y="88" font-size="11" fill="{A}" font-weight="700">4 одиночных (singles)</text><text x="180" y="88" font-size="11" fill="{F2}">дубль 4–4</text>'
    b+=f'<rect x="232" y="34" width="72" height="34" rx="8" fill="#2C2C29"/><text x="268" y="49" text-anchor="middle" font-size="10" fill="{F2}">у соперника</text><text x="268" y="62" text-anchor="middle" font-size="11" font-weight="800" fill="{R}">3 одиночных</text>'
    b+=tag(160,122,'Больше одиночных — ваша инициатива',A)
    return svg(b,140)
def d_wc_combo():
    rows=[('Дубль','Double',2,'Рывок (+1 Move), Натиск (+1 Attacks)'),('Тройка','Triple',3,'Передышка, Вдохновение'),('Четвёрка','Quad',4,'Буйство: ход и атака')]
    b=''
    for i,(t,e,k,s) in enumerate(rows):
        y=22+i*42
        for j in range(k): b+=dice(14+j*18,y,'',True,False,16)
        b+=f'<text x="96" y="{y+8}" font-size="12" font-weight="700" fill="#F4F4F0">{t}</text><text x="96" y="{y+24}" font-size="10.5" fill="{F2}">{s}</text>'
    b+=f'<rect x="14" y="150" width="16" height="16" rx="4" fill="none" stroke="{A}" stroke-width="2"/><text x="38" y="162" font-size="11" fill="{A}">дикий кубик (wild) — дополнит любую группу</text>'
    return svg(b,176)
def d_wc_act():
    seq=[(True,'2'),(False,'2'),(True,'2'),(False,'2')]
    b=''
    for i,(m,a) in enumerate(seq):
        x=14+i*76; c=A if m else R
        b+=f'<rect x="{x}" y="28" width="68" height="60" rx="10" fill="#2C2C29" stroke="{c}" stroke-width="1.5"/><text x="{x+34}" y="52" text-anchor="middle" font-size="12" font-weight="800" fill="{c}">{"Вы" if m else "Враг"}</text><circle cx="{x+27}" cy="70" r="5" fill="{c}"/><circle cx="{x+41}" cy="70" r="5" fill="{c}"/>'
    b+=f'<text x="160" y="112" text-anchor="middle" font-size="11" fill="{F2}">по 2 действия за активацию</text>'
    b+=tag(160,140,'Боец активируется один раз за фазу')
    return svg(b,156)
def d_wc_actions():
    b=base(36,40)+f'<line x1="52" y1="40" x2="176" y2="40" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'+tag(112,22,'Move: до Move',A)
    b+=f'<circle cx="64" cy="112" r="26" fill="rgba(248,113,113,.07)" stroke="{R}" stroke-dasharray="3 3"/>'+base(64,112,13,R)+base(92,112)
    b+=f'<line x1="106" y1="112" x2="186" y2="112" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'+tag(146,94,'Disengage: до 3″',A)
    b+=f'<text x="64" y="156" text-anchor="middle" font-size="10.5" fill="{R}">в 1″ от врага</text>'
    b+=f'<rect x="212" y="58" width="96" height="70" rx="10" fill="#2C2C29"/><text x="260" y="80" text-anchor="middle" font-size="11.5" font-weight="700" fill="#F4F4F0">Attack</text><text x="260" y="98" text-anchor="middle" font-size="11.5" font-weight="700" fill="#F4F4F0">Wait</text><text x="260" y="116" text-anchor="middle" font-size="10" fill="{F2}">атака · ожидание</text>'
    return svg(b,168)
def d_wc_attack():
    rows=[('S больше T','3+'),('S = T','4+'),('S меньше T','5+')]
    b=''
    for i,(k,v) in enumerate(rows):
        x=10+i*102
        b+=f'<rect x="{x}" y="24" width="96" height="22" rx="6" fill="#3B4A44"/><text x="{x+48}" y="39" text-anchor="middle" font-size="11" font-weight="700" fill="#F4F4F0">{k}</text><rect x="{x}" y="48" width="96" height="24" rx="6" fill="#ECECE4"/><text x="{x+48}" y="65" text-anchor="middle" font-size="13" font-weight="800" fill="#141413">попадание {v}</text>'
    b+=f'<text x="14" y="96" font-size="11" fill="{F2}">Пример: Attacks 3, S 4 против T 4, Damage 1/3</text>'
    for i,(v,ok,cr) in enumerate([(6,True,True),(4,True,False),(2,False,False)]): b+=dice(14+i*32,106,v,ok,cr)
    b+=f'<text x="120" y="123" font-size="11.5" fill="#F4F4F0">3 + 1 = <tspan fill="{A}" font-weight="800">4 урона</tspan></text>'
    b+=f'<text x="160" y="156" text-anchor="middle" font-size="11" fill="{F3}">6 — критическое: урон по второму числу</text>'
    return svg(b,168)

CARDS=[
 ('Как устроен бой','Battle Round',None,d_wc_round,['Раунд — три фазы: инициатива, резерв (со 2-го раунда), бой.','Сколько раундов — задаёт условие победы (часто 4).','Каждый раунд всё начинается с броска инициативы.'],None),
 ('Карточка бойца','Fighter Card',None,d_wc_card,['**Move** — движение, **Toughness** — стойкость, **Wounds** — раны.','Оружие: **Range**, **Attacks**, **Strength**, **Damage** (обычный / критический).','Оружие с Range до 3 — ближний бой, дальше — стрельба.'],None),
 ('Инициатива','Initiative Phase','1',d_wc_init,['Каждый бросает 6 кубиков.','Одиночные (singles) — кубики без пары. У кого их больше — у того инициатива.','При равенстве — переброс (roll-off).'],'Остальные кубики — кубики способностей на этот раунд.'),
 ('Дубли и тройки','Abilities',None,d_wc_combo,['Совпавшие кубики — дубль, тройка или четвёрка: ими платят за способности.','Есть общие способности для всех и особые — у вашей варбанды.','Старшая группа может заменить младшую.'],'Один дикий кубик (wild) можно добавить к группе или сохранить на потом.'),
 ('Фаза боя','Combat Phase','3',d_wc_act,['Игроки по очереди активируют по одному бойцу. Кто ходит первым — решает игрок с инициативой.','Активация — 2 действия и до одной способности.','Нечем ходить — пас. Фаза кончается, когда оба спасовали подряд.'],None),
 ('Действия','Actions',None,d_wc_actions,['**Move** — до Move дюймов, можно прыгать, лезть, лететь.','**Disengage** — до 3″, закончить дальше 1″ от врагов.','**Attack** — атака оружием. **Wait** — ожидание: позже ещё одна активация с 1 действием.'],'Начать Move в 1″ от врага нельзя — сначала Disengage.'),
 ('Атака','Attack',None,d_wc_attack,['Бросьте столько кубиков, сколько Attacks у оружия.','Сравните силу S и стойкость цели T: попадание на 3+, 4+ или 5+.','Попадание — урон по первому числу Damage, шестёрка — по второму.'],None),
 ('Готов к игре','Next Steps',None,d_done,['Вы знаете весь раунд — остальное придёт в первой партии.','Бойцы и способности варбанды — в WarpBuilder.'],None),
]
CARDS=[(a,b,c,d,[re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',x) for x in e],f) for a,b,c,d,e,f in CARDS]
n=len(CARDS)
screens=[gen.card(i,c,n).replace('Как играть · 40K','Как играть · Warcry') for i,c in enumerate(CARDS)]
doc=f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Обучение Warcry</title><script src="./support.js"></script></head><body>
<x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&amp;family=Oswald:wght@500;600;700&amp;display=swap"><style>body{{margin:0}} b{{color:#F4F4F0;font-weight:700}}</style></helmet>
<div style="width:1640px;height:1680px;background:#0B0B0A;color:#F4F4F0;font-family:'Inter Tight',sans-serif;padding:60px 40px;box-sizing:border-box;display:flex;flex-wrap:wrap;gap:40px 36px;align-content:flex-start">{''.join(screens)}</div>
</x-dc></body></html>'''
open('../design/project/TutorialWarcry.dc.html','w').write(doc)
print('ok')
