#!/usr/bin/env python3
"""A3 posters for the club (16.11.2026): WarpHub, WarpBuilder and «Как начать», in the style of the promo images
(tools/design/promo). Real app screens from tools/ui-shots/promo.mjs; QR codes drawn as vector (reportlab's QR encoder).

    python3 tools/design/posters/gen.py <screens dir> <out dir>

Output per poster: <id>.pdf (A3, 297×420 mm, vector text, screens embedded at full resolution) and <id>.png (preview).
Each QR code is decoded back with OpenCV before saving; a poster whose QR does not read back is an error.
"""
import base64
import pathlib
import sys

from reportlab.graphics.barcode.qrencoder import QRCode, QRErrorCorrectLevel

ROOT = pathlib.Path(__file__).resolve().parents[3]
LOGO = ROOT / 'client/public/logo.png'
INK = '#111110'
BOT = 'https://t.me/WarpHubBot'  # client/src/utils/telegramApp.ts → WARPHUB_BOT_URL
BOOSTY = 'https://boosty.to/wbg'  # client/src/components/booking/boosty.ts → BOOSTY_GENERAL_URL
W, H = 1123, 1587  # A3 in CSS px (96 dpi)

ICONS = {
    'calendar': '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M12 14v4M10 16h4"/>',
    'swords': '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4"/><path d="m7 17-3 3"/><path d="m3 19 2 2"/>',
    'trophy': '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'gamepad': '<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/>',
    'bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    'layers': '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    'checks': '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    'book': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    'lang': '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
    'dice': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M16 8h.01M8 8h.01M8 16h.01M16 16h.01M12 12h.01"/>',
    'map': '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15M9 3.236v15"/>',
}

POSTERS = [
    {
        'id': 'poster-1-warphub', 'bg': '#ECFE46', 'product': 'WarpHub', 'kicker': 'Приложение клуба в Telegram',
        'title': 'Клуб в твоём телефоне',
        'sub': 'Запись за стол, соперники, лига, турниры и мини-игры — в одном боте.',
        'screens': ['hub-booking-time', 'hub-opponents', 'hub-league-table'],
        'features': [
            ('calendar', 'Запись за минуту', 'Свободные столы и время сразу видно'),
            ('swords', 'Ищут соперника', 'Присоединяйтесь к игре в один тап'),
            ('target', 'Лига: рейтинг Эло', 'Сезон каждый квартал, по каждой игре'),
            ('trophy', 'Турниры', 'Швейцарская система, пары и таблица'),
            ('gamepad', 'Мини-игры', 'Лучший результат недели — скидка'),
            ('bell', 'Напоминания', 'Бот напомнит за час до игры'),
        ],
        'qrs': [(BOT, 'Наведите камеру', 'Откроется @WarpHubBot')],
    },
    {
        'id': 'poster-2-warpbuilder', 'bg': '#6CF0E6', 'product': 'WarpBuilder', 'kicker': 'Ростеры и игры в WarpHub',
        'title': 'Ростеры Warhammer',
        'sub': '40K, Age of Sigmar, Kill Team и Warcry: сборка, правила и игра.',
        'screens': ['wb-home', 'wb-40k-ru-popover', 'wb-ta-board'],
        'features': [
            ('layers', '4 игры в одном', '40K, AoS, Kill Team, Warcry'),
            ('checks', 'Ростер без ошибок', 'Очки и ограничения — на ходу'),
            ('book', 'Правила рядом', 'Нажмите на термин — текст правила'),
            ('lang', 'RU / EN', 'Русский или оригинальный текст'),
            ('dice', 'Трекер партии', 'Ходы, инициатива, CP — Kill Team'),
            ('map', 'Test Army', 'Расстановка и расчёт атаки — 40K'),
        ],
        'qrs': [(BOT, 'Открыть WarpHub', '@WarpHubBot → WarpBuilder'), (BOOSTY, 'Доступ по подписке', 'boosty.to/wbg')],
    },
]


def data_uri(p: pathlib.Path, mime: str) -> str:
    return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()


def qr_svg(url: str) -> str:
    q = QRCode(3, QRErrorCorrectLevel.M)
    q.addData(url)
    q.make()
    n = q.getModuleCount()
    rects = ''.join(f'<rect x="{c}" y="{r}" width="1.03" height="1.03"/>' for r in range(n) for c in range(n) if q.isDark(r, c))
    return f'<svg viewBox="-4 -4 {n + 8} {n + 8}" shape-rendering="crispEdges"><rect x="-4" y="-4" width="{n + 8}" height="{n + 8}" fill="#fff"/><g fill="{INK}">{rects}</g></svg>'


def worm(x: float, y: float, rot: float, width: int = 70) -> str:
    seg = []
    for i in range(-8, 8):
        a, b = i * 280, i * 280 + 140
        s = -1 if i % 2 == 0 else 1
        seg.append(f'C{a + 42} {s * 63.84} {a + 98} {s * 63.84} {b} 0 C{b + 42} {-s * 63.84} {b + 98} {-s * 63.84} {a + 280} 0')
    return f'<g transform="translate({x} {y}) rotate({rot}) scale(1.25)"><path d="M-2240 0 {" ".join(seg)}" fill="none" stroke="{INK}" stroke-width="{width}" stroke-linecap="round"/></g>'


CSS = f'''
@page{{size:297mm 420mm;margin:0}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px}}
body{{font-family:'Inter Display','Inter',sans-serif;color:{INK};position:relative;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
svg.bg{{position:absolute;inset:0}}
.wrap{{position:absolute;inset:60px;display:flex;flex-direction:column}}
.top{{display:flex;align-items:center;gap:20px}}
.top img{{width:92px;height:92px}}
.kick{{font-weight:800;font-size:34px;letter-spacing:.12em;text-transform:uppercase;line-height:1.05}}
.kick b{{display:block;font-weight:600;font-size:22px;letter-spacing:.14em;color:rgba(17,17,16,.66);margin-top:6px}}
h1{{margin-top:30px;font-weight:900;font-size:112px;line-height:.9;text-transform:uppercase;letter-spacing:-.01em;max-width:1000px}}
.sub{{margin-top:20px;font-weight:600;font-size:32px;line-height:1.25;max-width:960px}}
.phones{{flex:1;min-height:0;margin:30px 0 26px;display:flex;justify-content:center;align-items:center;gap:34px}}
.phone{{height:100%;aspect-ratio:1170/2532;background:{INK};border-radius:40px;padding:9px;box-shadow:0 28px 60px rgba(17,17,16,.32)}}
.phone img{{display:block;width:100%;height:100%;border-radius:32px}}
.phone.mid{{height:104%;margin-top:-4%}}
.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}}
.f{{background:{INK};border-radius:24px;padding:20px 20px;display:flex;gap:16px;align-items:center}}
.ic{{flex:none;width:56px;height:56px;border-radius:16px;background:var(--acc);display:grid;place-items:center}}
.ic svg{{width:32px;height:32px}}
.ft{{color:#F4F4F0;font-weight:800;font-size:25px;line-height:1.1}}
.fs{{color:#B8B8B0;font-weight:500;font-size:18px;line-height:1.28;margin-top:5px}}
.bar{{margin-top:22px;background:{INK};border-radius:30px;padding:22px 26px;display:flex;align-items:center;gap:26px;color:#F4F4F0}}
.q{{display:flex;align-items:center;gap:20px}}
.q svg{{width:176px;height:176px;border-radius:16px;flex:none}}
.qt{{font-weight:800;font-size:30px;line-height:1.1}}
.qs{{color:var(--acc);font-weight:700;font-size:24px;margin-top:8px}}
.club{{margin-left:auto;text-align:right;font-weight:900;font-size:30px;letter-spacing:.06em;text-transform:uppercase;line-height:1.15}}
.club b{{display:block;color:#B8B8B0;font-weight:600;font-size:19px;letter-spacing:.1em}}
'''


def poster(p: dict, screens: pathlib.Path) -> str:
    phones = ''.join(
        f'<div class="phone{" mid" if i == 1 else ""}"><img src="{data_uri(screens / (s + ".jpg"), "image/jpeg")}"></div>' for i, s in enumerate(p['screens'])
    )
    feats = ''.join(
        f'<div class="f"><div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="{INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{ICONS[i]}</svg></div>'
        f'<div><div class="ft">{t}</div><div class="fs">{d}</div></div></div>'
        for i, t, d in p['features']
    )
    qrs = ''.join(f'<div class="q">{qr_svg(u)}<div><div class="qt">{t}</div><div class="qs">{s}</div></div></div>' for u, t, s in p['qrs'])
    club = '' if len(p['qrs']) > 1 else '<div class="club">Клуб WBG<b>WarpHub · WarpBuilder</b></div>'
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body style="background:{p['bg']};--acc:{p['bg']}">
<svg class="bg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{worm(560, 960, -20)}</svg>
<div class="wrap">
 <div class="top"><img src="{data_uri(LOGO, 'image/png')}"><div class="kick">{p['product']}<b>{p['kicker']}</b></div></div>
 <h1>{p['title']}</h1>
 <div class="sub">{p['sub']}</div>
 <div class="phones">{phones}</div>
 <div class="grid">{feats}</div>
 <div class="bar">{qrs}{club}</div>
</div></body></html>'''


def start_poster() -> str:
    steps = [
        ('1', 'Наведите камеру', 'на QR-код — откроется бот @WarpHubBot'),
        ('2', 'Откройте приложение', 'прямо в Telegram, ничего не нужно устанавливать'),
        ('3', 'Запишитесь за стол', 'или найдите соперника на ближайшую игру'),
    ]
    st = ''.join(f'<div class="f"><div class="ic n">{n}</div><div><div class="ft">{t}</div><div class="fs">{d}</div></div></div>' for n, t, d in steps)
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS}
.big{{flex:1;display:flex;align-items:center;justify-content:center}}
.qbox{{background:{INK};border-radius:48px;padding:34px;box-shadow:0 30px 70px rgba(17,17,16,.3);text-align:center}}
.qbox svg{{width:520px;height:520px;border-radius:24px;display:block}}
.qbox .qs{{color:#ECFE46;font-size:40px;font-weight:800;margin-top:22px;letter-spacing:.01em}}
.n{{font-weight:900;font-size:32px;color:{INK}}}
.grid{{grid-template-columns:1fr}}
.f{{padding:20px 24px}}
.ft{{font-size:30px}} .fs{{font-size:21px}}
.chips{{margin-top:20px;display:flex;gap:14px;align-items:center;font-weight:800;font-size:26px}}
.chip{{background:{INK};color:#ECFE46;border-radius:999px;padding:12px 24px}}
.chip.c{{color:#6CF0E6}}
</style></head>
<body style="background:#ECFE46;--acc:#ECFE46">
<svg class="bg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{worm(560, 790, -20)}</svg>
<div class="wrap">
 <div class="top"><img src="{data_uri(LOGO, 'image/png')}"><div class="kick">WarpHub<b>Клуб WBG в Telegram</b></div></div>
 <h1>Как начать</h1>
 <div class="sub">Запись за стол, поиск соперника, лига и ростеры — всё в одном боте.</div>
 <div class="big"><div class="qbox">{qr_svg(BOT)}<div class="qs">@WarpHubBot</div></div></div>
 <div class="grid">{st}</div>
 <div class="chips"><span class="chip">WarpHub — клуб</span><span class="chip c">WarpBuilder — ростеры</span><span style="margin-left:auto;letter-spacing:.06em;text-transform:uppercase;font-weight:900">Клуб WBG</span></div>
</div></body></html>'''


def check_qr(png: pathlib.Path, expected: list[str]) -> None:
    import cv2

    img = cv2.imread(str(png))
    ok, found, _, _ = cv2.QRCodeDetector().detectAndDecodeMulti(img)
    got = sorted(x for x in (found if ok else []) if x)
    if got != sorted(expected):
        raise SystemExit(f'{png.name}: QR read back {got}, expected {sorted(expected)}')


def main() -> None:
    from playwright.sync_api import sync_playwright

    screens, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    pages = [(p['id'], poster(p, screens), [u for u, _, _ in p['qrs']]) for p in POSTERS]
    pages.append(('poster-3-start', start_poster(), [BOT]))
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=2)
        for pid, html, urls in pages:
            f = out / f'{pid}.html'
            f.write_text(html, encoding='utf8')
            pg.goto(f.as_uri())
            pg.wait_for_timeout(400)
            over = pg.evaluate("""() => { const w=document.querySelector('.wrap').getBoundingClientRect(); const r=[];
              for (const e of document.querySelectorAll('.wrap *')) { const b=e.getBoundingClientRect();
                if (b.width && (b.right>w.right+1 || b.bottom>w.bottom+1 || b.left<w.left-1)) r.push((e.className||e.tagName)+'');
              } return [...new Set(r)].slice(0,6); }""")
            pg.screenshot(path=str(out / f'{pid}.png'))
            pg.pdf(path=str(out / f'{pid}.pdf'), width='297mm', height='420mm', print_background=True)
            f.unlink()
            check_qr(out / f'{pid}.png', urls)
            print(pid, 'OK' if not over else f'CHECK overflow: {over}')
        b.close()


if __name__ == '__main__':
    main()
