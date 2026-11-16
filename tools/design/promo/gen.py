#!/usr/bin/env python3
"""Promo images for WarpHub and WarpBuilder (16.11.2026), in the style of the November announcement image:
lime (WarpHub) or cyan (WarpBuilder) background, one black worm, logo, big uppercase title, black step cards and
a phone with a real app screen.

Screens come from the demo build: tools/ui-shots/promo.mjs (PR label ``ui-promo``), 390×844 at deviceScaleFactor 3.

    python3 tools/design/promo/gen.py <screens dir> <out dir> [slide id ...]

Output: <out dir>/<id>.png, 2160×2700 (4:5, rendered at 2× from a 1080×1350 layout). Needs Python Playwright and
the Inter Display font installed (Black weight comes from the installed Inter Display family).
"""
import base64
import pathlib
import sys

from slides import SLIDES

HERE = pathlib.Path(__file__).resolve().parent
LOGO = HERE.parents[2] / 'client/public/logo.png'
INK = '#111110'
THEMES = {'hub': {'bg': '#ECFE46', 'acc': '#ECFE46'}, 'builder': {'bg': '#6CF0E6', 'acc': '#6CF0E6'}}


def data_uri(p: pathlib.Path, mime: str) -> str:
    return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()


def worm(x: float, y: float, rot: float) -> str:
    seg = []
    for i in range(-8, 8):
        a, b = i * 280, i * 280 + 140
        s = -1 if i % 2 == 0 else 1
        seg.append(f'C{a + 42} {s * 63.84} {a + 98} {s * 63.84} {b} 0 C{b + 42} {-s * 63.84} {b + 98} {-s * 63.84} {a + 280} 0')
    d = f'M-2240 0 ' + ' '.join(seg)
    return f'<g transform="translate({x} {y}) rotate({rot})"><path d="{d}" fill="none" stroke="{INK}" stroke-width="58" stroke-linecap="round"/></g>'


def page(s: dict, screens: pathlib.Path) -> str:
    th = THEMES[s['product']]
    product = 'WarpHub' if s['product'] == 'hub' else 'WarpBuilder'
    steps = ''.join(
        f'<div class="card"><div class="num">{i + 1}</div><div><div class="ct">{t}</div><div class="cs">{d}</div></div></div>'
        for i, (t, d) in enumerate(s['steps'])
    )
    shot = data_uri(screens / f"{s['screen']}.jpg", 'image/jpeg')
    back = ''
    if s.get('screen2'):
        back = f'<div class="phone back"><img src="{data_uri(screens / (s["screen2"] + ".jpg"), "image/jpeg")}"></div>'
    wx, wy, wr = s.get('worm', (900, 260, 62))
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:1080px;height:1350px;background:{th['bg']};font-family:'Inter Display','Inter',sans-serif;color:{INK};position:relative;overflow:hidden}}
svg.bg{{position:absolute;inset:0}}
.left{{position:absolute;left:64px;top:64px;bottom:64px;width:{s.get('leftW', 470 if not s.get('screen2') else 440)}px;display:flex;flex-direction:column}}
.top{{display:flex;align-items:center;gap:18px}}
.top img{{width:80px;height:80px}}
.kick{{font-weight:800;font-size:28px;letter-spacing:.12em;text-transform:uppercase;line-height:1.1}}
.kick b{{display:block;font-weight:600;font-size:20px;letter-spacing:.14em;color:rgba(17,17,16,.66);margin-top:4px}}
h1{{margin-top:44px;font-weight:900;font-size:96px;line-height:.92;text-transform:uppercase;letter-spacing:-.01em}}
.sub{{margin-top:22px;font-weight:600;font-size:28px;line-height:1.28}}
.steps{{margin-top:auto;display:flex;flex-direction:column;gap:14px}}
.card{{background:{INK};border-radius:26px;padding:22px 22px;display:flex;gap:18px;align-items:center}}
.num{{flex:none;width:56px;height:56px;border-radius:16px;background:{th['acc']};color:{INK};display:grid;place-items:center;font-weight:900;font-size:30px}}
.ct{{color:#F4F4F0;font-weight:800;font-size:27px;line-height:1.12}}
.cs{{color:#B8B8B0;font-weight:500;font-size:20px;line-height:1.3;margin-top:5px}}
.foot{{margin-top:26px;display:flex;gap:16px;align-items:center;font-weight:800;font-size:24px;letter-spacing:.06em;text-transform:uppercase}}
.pill{{background:{INK};color:{th['acc']};border-radius:999px;padding:12px 26px;font-weight:800;font-size:26px;letter-spacing:.02em;text-transform:none}}
.phone{{position:absolute;right:{s.get('phoneR', 64 if not s.get('screen2') else 100)}px;top:{s.get('phoneT', 210 if not s.get('screen2') else 300)}px;width:420px;border-radius:62px;background:{INK};padding:12px;
  box-shadow:0 40px 80px rgba(17,17,16,.35),0 0 0 2px rgba(255,255,255,.08) inset}}
.phone img{{display:block;width:396px;border-radius:50px}}
.phone.back{{right:-190px;top:30px;transform:rotate(9deg) scale(.82);transform-origin:top right;box-shadow:0 30px 60px rgba(17,17,16,.3)}}
</style></head><body>
<svg class="bg" width="1080" height="1350" viewBox="0 0 1080 1350">{worm(wx, wy, wr)}</svg>
{back}
<div class="phone"><img src="{shot}"></div>
<div class="left">
 <div class="top"><img src="{data_uri(LOGO, 'image/png')}"><div class="kick">{product}<b>{s['kicker']}</b></div></div>
 <h1>{s['title']}</h1>
 <div class="sub">{s['sub']}</div>
 <div class="steps">{steps}</div>
 <div class="foot"><span>Клуб WBG</span><span class="pill">@WarpHubBot</span></div>
</div>
<script>
// заголовок не шире колонки: уменьшать, пока не поместится
const h=document.querySelector('h1');let f=96;while((h.scrollWidth>h.clientWidth)&&f>60){{f-=2;h.style.fontSize=f+'px'}}
</script>
</body></html>'''


def main() -> None:
    from playwright.sync_api import sync_playwright

    screens, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    only = set(sys.argv[3:])
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=2)
        for s in SLIDES:
            if only and s['id'] not in only:
                continue
            html = out / f"{s['id']}.html"
            html.write_text(page(s, screens), encoding='utf8')
            pg.goto(html.as_uri())
            pg.wait_for_timeout(300)
            # проверка: ничего не вылезло за колонку и за картинку
            bad = pg.evaluate("""() => { const L=document.querySelector('.left').getBoundingClientRect(); const r=[];
              for (const e of document.querySelectorAll('.left *')) { const b=e.getBoundingClientRect(); if (b.right>L.right+1||b.bottom>L.bottom+1) r.push(e.className||e.tagName); }
              const st=document.querySelector('.steps').getBoundingClientRect(), sb=document.querySelector('.sub').getBoundingClientRect();
              if (sb.bottom>st.top-12) r.push('sub overlaps steps'); const ph=document.querySelector('.phone:not(.back)').getBoundingClientRect(); if (L.right>ph.left-24) r.push('column hits phone'); return r; }""")
            pg.screenshot(path=str(out / f"{s['id']}.png"))
            html.unlink()
            print(s['id'], 'OK' if not bad else f'CHECK: {bad}')
        b.close()


if __name__ == '__main__':
    main()
