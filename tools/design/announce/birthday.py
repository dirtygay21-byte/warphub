#!/usr/bin/env python3
"""Club birthday announcement (16.11.2026): «Клубу WBG — 3 года», 28 ноября, суббота.
Style of the bot notification cards and promo images: lime background, black worm, logo, Inter Display Black, black chips.

    python3 tools/design/announce/birthday.py <out dir>

Output:
  wbg-3-news.gif   1200×600 (2:1, news cover in WarpHub, animated, seamless loop)
  wbg-3-news.mp4   same animation for a Telegram channel (plays as a looping animation)
  wbg-3-news.png   static 2:1 (bot broadcast — the bot sends broadcast images as photos)
  wbg-3-event.png  1200×900 (4:3, event banner)
The animation loops: every moving part (worm, confetti, rotating ring, pulse) returns to its start at t = 1.
"""
import base64
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
LOGO = 'data:image/png;base64,' + base64.b64encode((ROOT / 'client/public/logo.png').read_bytes()).decode()
FRAMES, FPS = 48, 16  # 3 s loop

HTML = r'''<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:__W__px;height:__H__px;overflow:hidden}
body{background:#ECFE46;font-family:'Inter Display','Inter',sans-serif;color:#111110;position:relative}
svg{position:absolute;inset:0}
.txt{position:absolute;left:56px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;width:__TW__px}
.top{display:flex;align-items:center;gap:14px;margin-bottom:__GAP__px}
.top img{width:60px;height:60px}
.kick{font-weight:800;font-size:22px;letter-spacing:.12em;text-transform:uppercase;line-height:1.1}
.kick b{display:block;font-weight:600;font-size:15px;letter-spacing:.14em;color:rgba(17,17,16,.66);margin-top:3px}
.l1{font-weight:900;font-size:__L1__px;line-height:.9;text-transform:uppercase}
.l2{font-weight:900;font-size:__L2__px;line-height:.86;text-transform:uppercase;letter-spacing:-.02em;margin-top:6px;white-space:nowrap}
.chips{display:flex;gap:10px;margin-top:__GAP__px;flex-wrap:wrap}
.chip{background:#111110;color:#F4F4F0;border-radius:14px;padding:10px 16px;font-weight:800;font-size:26px;display:flex;gap:10px;align-items:baseline}
.chip i{font-style:normal;color:#B8B8B0;font-weight:600;font-size:15px;letter-spacing:.1em;text-transform:uppercase}
.inv{margin-top:__GAP__px;font-weight:700;font-size:26px;line-height:1.3}
</style></head><body>
<svg id="bg" width="__W__" height="__H__" viewBox="0 0 __W__ __H__"></svg>
<div class="txt">
 <div class="top"><img src="__LOGO__"><div class="kick">WarpHub<b>День рождения клуба</b></div></div>
 <div class="l1">Клубу WBG</div>
 <div class="l2">3 года!</div>
 <div class="inv">Празднуем 28 ноября, в субботу.<br>Приходите праздновать вместе с нами!</div>
 <div class="chips"><div class="chip">Клуб WBG</div><div class="chip" style="color:#ECFE46">@WarpHubBot</div></div>
</div>
<svg id="fg" width="__W__" height="__H__" viewBox="0 0 __W__ __H__"></svg>
<script>
const W=__W__, H=__H__, BX=__BX__, BY=__BY__, BR=__BR__;
// детерминированный «случайный» конфетти
let seed=7; const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
const COLORS=['#111110','#111110','#F4F4F0','#6CF0E6','#111110'];
const conf=[...Array(46)].map(()=>({x:rnd()*W,y:rnd(),k:rnd()<.5?1:2,r:rnd()*360,rk:(rnd()<.5?-1:1)*(rnd()<.5?1:2),c:COLORS[Math.floor(rnd()*COLORS.length)],s:6+rnd()*9,sh:rnd()<.35?'c':'r',sw:rnd()*2*Math.PI}));
function wormPath(){let d='M-2240 0 ';for(let i=-8;i<8;i++){const a=i*280,b=a+140,s=i%2===0?-1:1;
  d+=`C${a+42} ${s*63.84} ${a+98} ${s*63.84} ${b} 0 C${b+42} ${-s*63.84} ${b+98} ${-s*63.84} ${a+280} 0 `}return d}
const WP=wormPath();
const RING='WBG\u00a0·\u00a03\u00a0ГОДА\u00a0\u00a0✦\u00a0\u00a0'; const REP=4;
function render(t){
  const TAU=2*Math.PI;
  // червь: сдвиг ровно на один период волны (560: два полупериода) за цикл
  document.getElementById('bg').innerHTML=
    `<g transform="translate(${BX} ${BY}) rotate(-68) translate(${-560*t} 0)"><path d="${WP}" fill="none" stroke="#111110" stroke-width="54" stroke-linecap="round"/></g>`;
  let fg='';
  // значок: чёрный круг, кольцо текста поворачивается на одну повторяемую часть за цикл
  const rot=-(360/REP)*t, pulse=1+0.035*Math.sin(TAU*t);
  fg+=`<defs><path id="ring" d="M ${BX-BR*.8} ${BY} a ${BR*.8} ${BR*.8} 0 1 1 ${BR*1.6} 0 a ${BR*.8} ${BR*.8} 0 1 1 ${-BR*1.6} 0"/></defs>`;
  fg+=`<circle cx="${BX}" cy="${BY+14}" r="${BR}" fill="rgba(17,17,16,.22)"/>`;
  fg+=`<circle cx="${BX}" cy="${BY}" r="${BR}" fill="#111110"/>`;
  fg+=`<circle cx="${BX}" cy="${BY}" r="${BR*.68}" fill="none" stroke="#ECFE46" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round" transform="rotate(${360*t} ${BX} ${BY})"/>`;
  fg+=`<g transform="rotate(${rot} ${BX} ${BY})"><text font-family="Inter Display" font-weight="800" font-size="${BR*.12}" letter-spacing="${BR*.01}" fill="#ECFE46"><textPath href="#ring" textLength="${TAU*BR*.8-4}" lengthAdjust="spacing">${RING.repeat(REP)}</textPath></text></g>`;
  fg+=`<g transform="translate(${BX} ${BY}) scale(${pulse})"><text x="0" y="${BR*.14}" text-anchor="middle" font-family="Inter Display" font-weight="900" font-size="${BR*.74}" fill="#ECFE46">28</text>`+
      `<text x="0" y="${BR*.35}" text-anchor="middle" font-family="Inter Display" font-weight="800" font-size="${BR*.15}" letter-spacing="${BR*.02}" fill="#F4F4F0">НОЯБРЯ</text>`+
      `<text x="0" y="${BR*.5}" text-anchor="middle" font-family="Inter Display" font-weight="600" font-size="${BR*.1}" letter-spacing="${BR*.03}" fill="#B8B8B0">СУББОТА</text></g>`;
  // звёздочки вокруг значка мерцают
  for(let i=0;i<6;i++){const a=TAU*i/6+.4, rr=BR*1.18, x=BX+Math.cos(a)*rr, y=BY+Math.sin(a)*rr, s=(9+6*Math.sin(TAU*(t+i/6)))*BR/170;
    fg+=`<path d="M${x} ${y-s*1.6} L${x+s*.45} ${y-s*.45} L${x+s*1.6} ${y} L${x+s*.45} ${y+s*.45} L${x} ${y+s*1.6} L${x-s*.45} ${y+s*.45} L${x-s*1.6} ${y} L${x-s*.45} ${y-s*.45}Z" fill="#111110"/>`}
  // конфетти: k экранов за цикл — бесшовно
  for(const c of conf){const span=H+60, y=((c.y+c.k*t)%1)*span-30, x=c.x+10*Math.sin(TAU*t+c.sw), r=c.r+c.rk*360*t;
    fg+= c.sh==='c' ? `<circle cx="${x}" cy="${y}" r="${c.s*.45}" fill="${c.c}"/>`
       : `<rect x="${x-c.s/2}" y="${y-c.s*.3}" width="${c.s}" height="${c.s*.6}" rx="1.5" fill="${c.c}" transform="rotate(${r} ${x} ${y})"/>`}
  document.getElementById('fg').innerHTML=fg;
}
render(0);
</script></body></html>'''

LAYOUTS = {
    # width, height, text column, line sizes, badge centre and radius
    'news': dict(W=1200, H=600, TW=620, L1=78, L2=168, GAP=22, BX=930, BY=300, BR=190),
    'event': dict(W=1200, H=900, TW=640, L1=80, L2=156, GAP=30, BX=940, BY=450, BR=205),
}


def page(name: str) -> str:
    h = HTML.replace('__LOGO__', LOGO)
    for k, v in LAYOUTS[name].items():
        h = h.replace(f'__{k}__', str(v))
    return h


def main() -> None:
    from PIL import Image
    from playwright.sync_api import sync_playwright

    out = pathlib.Path(sys.argv[1])
    frames_dir = out / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, L in LAYOUTS.items():
            pg = b.new_page(viewport={'width': L['W'], 'height': L['H']}, device_scale_factor=1 if name == 'news' else 2)
            f = out / f'{name}.html'
            f.write_text(page(name), encoding='utf8')
            pg.goto(f.as_uri())
            pg.wait_for_timeout(300)
            # текст не выходит за колонку и не заходит на значок
            bad = pg.evaluate(f"""() => {{ const r=[]; for (const e of document.querySelectorAll('.txt *')) {{ const b=e.getBoundingClientRect();
              if (b.width && (b.right > {L['BX'] - L['BR'] - 10} || b.bottom > {L['H']} || b.top < 0)) r.push(e.className||e.tagName); }} return r; }}""")
            if bad:
                raise SystemExit(f'{name}: text overlaps the badge or the edge: {bad}')
            if name == 'event':
                pg.evaluate('render(0.18)')
                pg.screenshot(path=str(out / 'wbg-3-event.png'))
            else:
                pg2 = b.new_page(viewport={'width': L['W'], 'height': L['H']}, device_scale_factor=2)
                pg2.goto(f.as_uri())
                pg2.wait_for_timeout(300)
                pg2.evaluate('render(0.18)')
                pg2.screenshot(path=str(out / 'wbg-3-news.png'))
                for i in range(FRAMES):
                    pg.evaluate(f'render({i / FRAMES})')
                    pg.screenshot(path=str(frames_dir / f'{i:03d}.png'))
            f.unlink()
        b.close()

    frames = [Image.open(frames_dir / f'{i:03d}.png').convert('RGB') for i in range(FRAMES)]
    # одна палитра на все кадры: цвета карточки + сглаживание
    pal = frames[0].quantize(colors=64, method=Image.Quantize.MEDIANCUT)
    q = [fr.quantize(palette=pal, dither=Image.Dither.NONE) for fr in frames]
    q[0].save(out / 'wbg-3-news.gif', save_all=True, append_images=q[1:], duration=1000 // FPS, loop=0, optimize=True, disposal=1)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', str(frames_dir / '%03d.png'),
                    '-vf', 'loop=3:48:0,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart',
                    str(out / 'wbg-3-news.mp4')], check=True)
    for p_ in frames_dir.iterdir():
        p_.unlink()
    frames_dir.rmdir()
    for n in ['wbg-3-news.gif', 'wbg-3-news.mp4', 'wbg-3-news.png', 'wbg-3-event.png']:
        print(n, round((out / n).stat().st_size / 1024), 'KB')


if __name__ == '__main__':
    main()
