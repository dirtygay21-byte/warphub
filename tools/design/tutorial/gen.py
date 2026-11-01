# Генератор артборда «Обучение 40K» для канваса (концепт). Рисунки — оригинальные SVG.
import html
A='#ECFE46'; R='#FF6B5B'; F2='#B8B8B0'; F3='#8E8E86'; T='#22221F'
DEFS=f'''<defs>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#F4F4F0"/></marker>
<marker id="aa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{A}"/></marker>
<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{R}"/></marker>
<pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="rgba(255,255,255,.07)"/></pattern>
</defs>'''
def base(x,y,r=13,c=A,lab=''):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="#121211" stroke="{c}" stroke-width="2.5"/><circle cx="{x}" cy="{y}" r="{r-6}" fill="{c}" opacity=".22"/>'+(f'<text x="{x}" y="{y+4}" text-anchor="middle" font-size="11" font-weight="700" fill="{c}">{lab}</text>' if lab else '')
def tag(x,y,t,c='#F4F4F0',bg='#2C2C29'):
    w=len(t)*6.6+14
    return f'<rect x="{x-w/2}" y="{y-11}" width="{w}" height="20" rx="10" fill="{bg}"/><text x="{x}" y="{y+3}" text-anchor="middle" font-size="11.5" font-weight="700" fill="{c}">{html.escape(t)}</text>'
def meas(x1,x2,y,t,c='#F4F4F0',m='ah'):
    return f'<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" stroke="{c}" stroke-width="1.6" marker-start="url(#{m})" marker-end="url(#{m})"/>'+tag((x1+x2)/2,y-14,t,c)
def tick(x,y1,y2):
    return f'<line x1="{x}" y1="{y1}" x2="{x}" y2="{y2}" stroke="rgba(255,255,255,.45)" stroke-dasharray="3 3"/>'
def svg(body,h=170):
    return f'<svg width="320" height="{h}" viewBox="0 0 320 {h}" style="display:block;border-radius:14px;background:{T}" font-family="Inter Tight">{DEFS}<rect width="320" height="{h}" fill="url(#dots)"/>{body}</svg>'
def ruin(x,y,w,h):
    return f'<path d="M{x} {y+h}V{y+10}l8-10h{w*0.4}v12h{w*0.2}V{y}h{w*0.4-8}v{h}z" fill="#3A3A36" stroke="#5A5A54" stroke-width="1.5"/>'

def d_round():
    names=['Командование','Движение','Стрельба','Нападение','Сражение']
    b=''; import math
    for i,n in enumerate(names):
        a=-math.pi/2+i*2*math.pi/5; x=160+62*math.cos(a)*1.55; y=100+62*math.sin(a)
        b+=f'<circle cx="{x:.0f}" cy="{y:.0f}" r="13" fill="{A}"/><text x="{x:.0f}" y="{y+4:.0f}" text-anchor="middle" font-size="12" font-weight="800" fill="#111">{i+1}</text>'
        ty=y+28 if y>100 else y-19
        b+=f'<text x="{x:.0f}" y="{ty:.0f}" text-anchor="middle" font-size="11" fill="{F2}">{n}</text>'
    b+=f'<ellipse cx="160" cy="100" rx="96" ry="62" fill="none" stroke="rgba(236,254,70,.35)" stroke-width="1.5" stroke-dasharray="4 5"/>'
    b+=f'<text x="160" y="96" text-anchor="middle" font-size="12" font-weight="700" fill="#F4F4F0">Ход игрока 1</text><text x="160" y="112" text-anchor="middle" font-size="11" fill="{F3}">затем ход игрока 2</text>'
    return svg(b,200)
def d_profile():
    st=[('M','6″'),('T','4'),('Sv','3+'),('W','2'),('Ld','6+'),('OC','2')]
    b=''
    for i,(k,v) in enumerate(st):
        x=14+i*50
        b+=f'<text x="{x+22}" y="38" text-anchor="middle" font-size="12" font-weight="700" fill="{F2}">{k}</text><rect x="{x}" y="46" width="44" height="44" rx="9" fill="#ECECE4"/><text x="{x+22}" y="75" text-anchor="middle" font-size="19" font-weight="800" fill="#141413" font-family="Oswald">{v}</text>'
    b+=f'<text x="14" y="116" font-size="11" fill="{F3}">Пример: отряд пехоты</text>'
    b+=f'<path d="M36 128v14h40" fill="none" stroke="{A}" stroke-width="1.4"/><text x="82" y="146" font-size="11.5" fill="{A}">на сколько дюймов ходит модель</text>'
    return svg(b,160)
def d_command():
    b=f'<rect x="18" y="24" width="120" height="74" rx="12" fill="#2C2C29"/><text x="78" y="56" text-anchor="middle" font-size="26" font-weight="800" fill="{A}" font-family="Oswald">+1 CP</text><text x="78" y="80" text-anchor="middle" font-size="11" fill="{F2}">каждому игроку</text>'
    b+=base(194,60,14,R)+base(222,52,14,R)+f'<circle cx="208" cy="82" r="14" fill="none" stroke="{R}" stroke-width="2" stroke-dasharray="3 3" opacity=".6"/><circle cx="236" cy="78" r="14" fill="none" stroke="{R}" stroke-width="2" stroke-dasharray="3 3" opacity=".6"/>'
    b+=f'<text x="214" y="118" text-anchor="middle" font-size="11" fill="{F2}">осталось меньше половины</text>'
    b+=f'<rect x="262" y="40" width="22" height="22" rx="5" fill="#ECECE4"/><circle cx="268" cy="46" r="2" fill="#111"/><circle cx="278" cy="56" r="2" fill="#111"/><rect x="288" y="40" width="22" height="22" rx="5" fill="#ECECE4"/><circle cx="294" cy="46" r="2" fill="#111"/><circle cx="299" cy="51" r="2" fill="#111"/><circle cx="304" cy="56" r="2" fill="#111"/>'
    b+=f'<text x="286" y="82" text-anchor="middle" font-size="11.5" font-weight="700" fill="#F4F4F0">2D6 ≥ Ld?</text>'
    b+=tag(160,150,'Меньше Ld — боевой шок: OC 0',R,'rgba(255,107,91,.14)')
    return svg(b,172)
def d_move():
    b=base(40,52)+f'<line x1="56" y1="52" x2="186" y2="52" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'+tag(120,36,'Обычный ход: до M = 6″',A)+f'<circle cx="200" cy="52" r="13" fill="none" stroke="{A}" stroke-width="2" stroke-dasharray="3 3"/>'
    b+=base(40,124)+f'<line x1="56" y1="124" x2="250" y2="124" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'+tag(150,108,'Рывок: M + D6″',A)+f'<circle cx="264" cy="124" r="13" fill="none" stroke="{A}" stroke-width="2" stroke-dasharray="3 3"/>'
    b+=f'<text x="150" y="156" text-anchor="middle" font-size="11" fill="{F2}">после рывка — без стрельбы и нападения</text>'
    return svg(b,170)
def d_weapon():
    cols=['RANGE','A','BS','S','AP','D']; vals=['24″','2','3+','4','-1','1']; xs=[44,104,150,196,242,290]
    b=f'<rect x="10" y="40" width="300" height="30" rx="8" fill="#3B4A44"/><rect x="10" y="70" width="300" height="32" rx="0" fill="#ECECE4"/><rect x="10" y="94" width="300" height="8" rx="4" fill="#ECECE4"/>'
    for c,v,x in zip(cols,vals,xs):
        b+=f'<text x="{x}" y="60" text-anchor="middle" font-size="12" font-weight="700" fill="#F4F4F0">{c}</text><text x="{x}" y="92" text-anchor="middle" font-size="15" font-weight="800" fill="#141413">{v}</text>'
    b+=f'<text x="14" y="128" font-size="11.5" fill="{F2}"><tspan fill="{A}" font-weight="700">BS 3+</tspan> — на кубике нужно 3 или больше, чтобы попасть</text>'
    b+=f'<text x="14" y="148" font-size="11.5" fill="{F2}"><tspan fill="{A}" font-weight="700">A 2</tspan> — две атаки за каждую модель</text>'
    return svg(b,166)
def d_los():
    b=base(36,56)+base(286,56,14,R)+f'<line x1="52" y1="56" x2="270" y2="56" stroke="#F4F4F0" stroke-width="1.6" marker-end="url(#ah)"/>'+tag(160,40,'Видит')
    b+=tick(49,70,92)+tick(272,70,92)+meas(49,272,86,'Range = 24″')
    b+=base(36,140)+ruin(196,112,44,42)+base(286,140,14,R)+f'<line x1="52" y1="140" x2="186" y2="140" stroke="{R}" stroke-width="1.6" stroke-dasharray="5 4"/><text x="236" y="168" font-size="11" fill="{R}" font-weight="700">стена</text>'+tag(120,124,'Не видит',R,'rgba(255,107,91,.14)')
    return svg(b,180)
def d_attack():
    steps=[('1','Попадание','≥ BS'),('2','Ранение','S против T'),('3','Спасбросок','Sv + AP'),('4','Урон','− D ран')]
    b=''
    for i,(n,t,s) in enumerate(steps):
        x=10+i*78
        b+=f'<rect x="{x}" y="22" width="70" height="72" rx="10" fill="#2C2C29"/><circle cx="{x+16}" cy="40" r="10" fill="{A}"/><text x="{x+16}" y="44" text-anchor="middle" font-size="11" font-weight="800" fill="#111">{n}</text><text x="{x+35}" y="68" text-anchor="middle" font-size="11" font-weight="700" fill="#F4F4F0">{t}</text><text x="{x+35}" y="84" text-anchor="middle" font-size="10.5" fill="{F2}">{s}</text>'
        if i<3: b+=f'<path d="M{x+71} 58h6" stroke="{A}" stroke-width="2" marker-end="url(#aa)"/>'
    w=[('S ≥ 2T','2+'),('S > T','3+'),('S = T','4+'),('S < T','5+'),('S ≤ T/2','6+')]
    for i,(k,v) in enumerate(w):
        x=10+i*61
        b+=f'<rect x="{x}" y="110" width="57" height="22" rx="6" fill="#3B4A44"/><text x="{x+28.5}" y="125" text-anchor="middle" font-size="10.5" font-weight="700" fill="#F4F4F0">{html.escape(k)}</text><rect x="{x}" y="136" width="57" height="22" rx="6" fill="#ECECE4"/><text x="{x+28.5}" y="152" text-anchor="middle" font-size="12" font-weight="800" fill="#141413">{v}</text>'
    return svg(b,170)
def d_charge():
    b=base(160,90)+base(56,90,14,R)+base(272,90,14,R)
    b+=tick(70,104,128)+tick(147,104,128)+meas(70,147,122,'9″',R,'ar')
    b+=tick(173,104,128)+tick(258,104,128)+meas(173,258,122,'8″',A,'aa')
    b+=tag(160,34,'Бросок 2D6 = 8″',A)
    b+=f'<text x="108" y="152" text-anchor="middle" font-size="10.5" fill="{R}">не хватает</text><text x="216" y="152" text-anchor="middle" font-size="10.5" fill="{A}">можно напасть</text>'
    return svg(b,166)
def d_fight():
    b=''
    for i,y in enumerate([50,84,118]):
        b+=base(96,y)
    for i,y in enumerate([50,84]): b+=base(132,y,13,R)
    b+=base(220,118,13,R)
    b+=f'<circle cx="96" cy="84" r="62" fill="none" stroke="rgba(236,254,70,.45)" stroke-dasharray="4 4"/>'
    b+=f'<path d="M206 118 C180 118 160 112 148 100" fill="none" stroke="{A}" stroke-width="1.8" marker-end="url(#aa)"/>'+tag(250,148,'Сближение до 3″',A)
    b+=tag(60,150,'атакуют в 2″',A)
    b+=f'<text x="250" y="56" font-size="11" fill="{F2}" text-anchor="middle">1 Сближение</text><text x="250" y="74" font-size="11" fill="{F2}" text-anchor="middle">2 Атаки</text><text x="250" y="92" font-size="11" fill="{F2}" text-anchor="middle">3 Объединение 3″</text>'
    return svg(b,170)
def d_done():
    b=''
    items=['Собери армию в WarpBuilder','Запишись на обучающую игру','Возьми кубики и рулетку']
    for i,t in enumerate(items):
        y=36+i*40
        b+=f'<rect x="16" y="{y-16}" width="26" height="26" rx="8" fill="{A}"/><path d="M{22} {y-3}l5 5 9-10" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"/><text x="54" y="{y+2}" font-size="13" font-weight="600" fill="#F4F4F0">{t}</text>'
    return svg(b,150)

CARDS=[
 ('Раунд битвы','Battle Round',None,d_round,['Игра идёт раундами. В каждом раунде сначала полностью ходит один игрок, затем другой.','Ход — это 5 фаз по порядку.','Расстояния меряются в дюймах (″) — от края базы до края базы.'],'Пропустить фазу нельзя, но в фазе можно ничего не делать.'),
 ('Профиль юнита','Unit Profile',None,d_profile,['<b>M</b> — движение, <b>T</b> — стойкость, <b>Sv</b> — спасбросок','<b>W</b> — раны одной модели, <b>Ld</b> — лидерство','<b>OC</b> — контроль цели: сколько модель «весит» на объекте'],None),
 ('Командная фаза','Command Phase','1',d_command,['Оба игрока получают по 1 очку командования (CP) — их тратят на стратагемы.','Юнит, потерявший больше половины моделей (или ран), бросает 2D6.','Меньше Ld — боевой шок до вашей следующей командной фазы.'],'В боевом шоке: OC 0 и нельзя использовать стратагемы.'),
 ('Фаза движения','Movement Phase','2',d_move,['<b>Обычный ход</b> (Normal) — до M дюймов.','<b>Рывок</b> (Advance) — M + D6″.','<b>Отступление</b> (Fall Back) — выйти из ближнего боя.'],'После рывка или отступления нельзя нападать в этот ход.'),
 ('Фаза стрельбы','Shooting Phase','3',d_weapon,['Юниты по очереди стреляют по врагам в пределах дальности и в поле зрения.','Цели для всего оружия юнита объявляются сразу.'],None),
 ('Видимость','Line of Sight','3',d_los,['Модель должна буквально видеть цель.','Дальность — от края базы до края базы.','Цель в террейне, которая не стреляла, видна только с 15″ (Detection Range).'],'Монстры и техника видны всегда.'),
 ('Совершение атаки','Making Attacks',None,d_attack,['Попадание: D6 ≥ BS (в ближнем бою — WS). Шестёрка — всегда успех.','Ранение: сравни силу S и стойкость T по таблице.','Спасбросок: D6 − AP. Меньше Sv — модель теряет D ран.'],'Атаку назначает защищающийся — сначала на уже раненые модели.'),
 ('Фаза нападения','Charge Phase','4',d_charge,['Выбери юнит и цели в пределах 12″.','Брось 2D6 — это дальность рывка в дюймах.','Дотянулся до цели — юнит в ближнем бою и бьёт первым.'],'После рывка (Advance) или отступления нападать нельзя.'),
 ('Фаза сражения','Fight Phase','5',d_fight,['Сначала бьют юниты с Fights First — например, те, кто напал в этот ход.','<b>Сближение</b> до 3″, затем атаки моделей в 2″ от врага.','<b>Объединение</b> до 3″ — к врагу или к объекту.'],None),
 ('Готов к игре','Next Steps',None,d_done,['Ты знаешь весь ход — остальное придёт в первой партии.','Подробные правила юнитов — в WarpBuilder.'],None),
]

def topbar(i,n):
    dots=''.join(f'<span style="flex:1;height:4px;border-radius:2px;background:{A if k<=i else "rgba(255,255,255,.14)"}"></span>' for k in range(n))
    return f'''<div style="display:flex;align-items:center;gap:10px;height:56px;padding:0 14px">
<span style="display:flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:12px;border:1px solid rgba(255,255,255,.14)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F4F4F0" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg></span>
<span style="flex:1;display:flex;flex-direction:column"><span style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:{F3}">Как играть · 40K</span><span style="font-size:15px;font-weight:600">Шаг {i+1} из {n}</span></span>
<span style="display:flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:12px;border:1px solid rgba(255,255,255,.14)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F4F4F0" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></span></div>
<div style="display:flex;gap:4px;padding:0 16px 10px">{dots}</div>'''

def card(i,c,n):
    title,en,num,fn,pts,warn=c
    badge=f'<span style="display:inline-flex;width:28px;height:28px;transform:rotate(45deg);border-radius:6px;background:{A};align-items:center;justify-content:center;margin-left:10px"><span style="transform:rotate(-45deg);font-size:14px;font-weight:800;color:#111">{num}</span></span>' if num else ''
    li=''.join(f'<li style="display:flex;gap:10px;font-size:14.5px;line-height:1.4;color:#E6E6DF"><span style="flex:none;width:6px;height:6px;margin-top:8px;border-radius:2px;background:{A}"></span><span>{p}</span></li>' for p in pts)
    w=f'<div style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;background:rgba(255,107,91,.10);border:1px solid rgba(255,107,91,.35)"><span style="flex:none;display:flex;width:22px;height:22px;transform:rotate(45deg);border-radius:5px;background:{R};align-items:center;justify-content:center"><span style="transform:rotate(-45deg);font-weight:900;font-size:13px;color:#111">!</span></span><span style="font-size:13.5px;line-height:1.4">{warn}</span></div>' if warn else ''
    cta=''
    if i==n-1:
        cta=f'<div style="display:flex;flex-direction:column;gap:8px"><span style="display:flex;height:50px;align-items:center;justify-content:center;border-radius:14px;background:{A};color:#111;font-weight:700;font-size:15.5px">Записаться на обучающую игру</span><span style="display:flex;height:46px;align-items:center;justify-content:center;border-radius:14px;border:1px solid rgba(255,255,255,.14);font-weight:600;font-size:15px">Открыть WarpBuilder</span></div>'
    nav='' if cta else f'''<div style="position:absolute;left:16px;right:16px;bottom:18px;display:flex;gap:10px"><span style="display:flex;flex:1;height:50px;align-items:center;justify-content:center;border-radius:14px;border:1px solid rgba(255,255,255,.14);font-weight:600;font-size:15px;color:{F2 if i else F3}">Назад</span><span style="display:flex;flex:2;height:50px;align-items:center;justify-content:center;border-radius:14px;background:{A};color:#111;font-weight:700;font-size:15.5px">Далее</span></div>'''
    return f'''<div style="position:relative;width:360px;height:760px;flex:none;border-radius:28px;overflow:hidden;background:#111110;border:1px solid rgba(255,255,255,.08)">{topbar(i,n)}
<div style="display:flex;flex-direction:column;gap:14px;padding:4px 20px 0">
<div><div style="display:flex;align-items:center"><span style="font-family:Oswald;font-size:30px;font-weight:600;line-height:1.05;text-transform:uppercase">{title}</span>{badge}</div><span style="font-size:14px;color:{F3}">{en}</span></div>
{fn()}
<ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px">{li}</ul>
{w}{cta}</div>{nav}</div>'''

def hub():
    games=[('40K','Warhammer 40,000','10 шагов · 5 мин',True),('AoS','Age of Sigmar','скоро',False),('KT','Kill Team','скоро',False),('WC','Warcry','скоро',False)]
    rows=''.join(f'''<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-top:1px solid rgba(255,255,255,.06)"><span style="display:flex;width:46px;height:46px;align-items:center;justify-content:center;border-radius:12px;background:{A if on else "rgba(255,255,255,.08)"};color:{"#111" if on else F2};font-family:Oswald;font-weight:700;font-size:16px">{c}</span><span style="flex:1;display:flex;flex-direction:column"><span style="font-size:16.5px;font-weight:700">{t}</span><span style="font-size:13.5px;color:{F2}">{s}</span></span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="{A if on else F3}" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></div>''' for c,t,s,on in games)
    return f'''<div style="position:relative;width:360px;height:760px;flex:none;border-radius:28px;overflow:hidden;background:#111110;border:1px solid rgba(255,255,255,.08)">
<div style="display:flex;align-items:center;justify-content:center;height:56px;font-size:17px;font-weight:600">Как играть</div>
<div style="display:flex;flex-direction:column;gap:16px;padding:4px 20px">
<div style="position:relative;padding:20px;border-radius:20px;background:linear-gradient(160deg,rgba(236,254,70,.18),rgba(236,254,70,.02));border:1px solid rgba(236,254,70,.3)"><span style="font-family:Oswald;font-size:28px;font-weight:600;text-transform:uppercase;line-height:1.05">Первая игра<br>без паники</span><p style="margin:8px 0 0;font-size:14.5px;line-height:1.4;color:#E6E6DF">Короткие карточки со схемами: как устроен ход, как стрелять и драться.</p></div>
<span style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:{F3}">Выберите игру</span>
<div style="border-radius:18px;overflow:hidden;background:#1A1A18;border:1px solid rgba(255,255,255,.1);margin-top:-6px">{rows.replace('border-top:1px solid rgba(255,255,255,.06)','',1)}</div>
<p style="margin:0;font-size:13px;color:{F3};line-height:1.4">Правила пересказаны кратко. Источник и редакция указаны в конце каждого курса.</p>
</div></div>'''

n=len(CARDS)
screens=[hub()]+[card(i,c,n) for i,c in enumerate(CARDS)]
grid=''.join(screens)
doc=f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Обучение 40K</title><script src="./support.js"></script></head><body>
<x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&amp;family=Oswald:wght@500;600;700&amp;display=swap"><style>body{{margin:0}} b{{color:#F4F4F0;font-weight:700}}</style></helmet>
<div style="width:2440px;height:1680px;background:#0B0B0A;color:#F4F4F0;font-family:'Inter Tight',sans-serif;padding:60px 40px;box-sizing:border-box;display:flex;flex-wrap:wrap;gap:40px 36px;align-content:flex-start">{grid}</div>
</x-dc></body></html>'''
open('../design/project/Tutorial40K.dc.html','w').write(doc)
print('ok',len(doc))
