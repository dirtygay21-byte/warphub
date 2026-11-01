"""Generate the 'Avatar frames' artboard: 4 categories x 4 ranks, round frames as inline SVG (viewBox -110..110)."""
import math

AV = 52  # avatar radius


def P(r, deg):
    a = math.radians(deg - 90)
    return round(r * math.cos(a), 2), round(r * math.sin(a), 2)


def ring(r, w, color, extra=""):
    return f'<circle r="{r}" fill="none" stroke="{color}" stroke-width="{w}" {extra}/>'


def spike(r_in, r_out, deg, half, fill, stroke="none"):
    a = P(r_in, deg - half)
    b = P(r_out, deg)
    c = P(r_in, deg + half)
    return f'<path d="M{a[0]} {a[1]} L{b[0]} {b[1]} L{c[0]} {c[1]} Z" fill="{fill}" stroke="{stroke}" stroke-width="1.5" stroke-linejoin="round"/>'


def dots(r, n, size, fill, offset=0):
    out = []
    for i in range(n):
        x, y = P(r, offset + 360 * i / n)
        out.append(f'<circle cx="{x}" cy="{y}" r="{size}" fill="{fill}"/>')
    return "".join(out)


def ticks(r1, r2, n, color, w=2, offset=0):
    out = []
    for i in range(n):
        a = P(r1, offset + 360 * i / n)
        b = P(r2, offset + 360 * i / n)
        out.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>')
    return "".join(out)


# ---------- Warhammer: iron, rivets, gothic arches and spikes, lime ----------
def arch(r, deg, w, h, fill, stroke="none"):
    """Gothic pointed arch standing on radius r, pointing outward."""
    return (f'<path d="M{-w} 0 L{-w} {-h*0.45} Q{-w} {-h} 0 {-h} Q{w} {-h} {w} {-h*0.45} L{w} 0 Z" '
            f'transform="rotate({deg}) translate(0 {-r})" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')


def stud(r, deg, s, fill):
    x, y = P(r, deg)
    return f'<rect x="{x-s}" y="{y-s}" width="{2*s}" height="{2*s}" fill="{fill}" transform="rotate({deg+45} {x} {y})"/>'


def lancets(r, n, cls, gold, offset=0, h=11, w=3.2):
    return "".join(
        f'<path d="M{-w} 0 L{-w} {-h*0.5} Q{-w} {-h*0.88} 0 {-h} Q{w} {-h*0.88} {w} {-h*0.5} L{w} 0 Z" transform="rotate({offset + 360*i/n}) translate(0 {-r})" class="{cls}" stroke="{gold}" stroke-width="0.8"/>'
        for i in range(n)
    )


def keystone(r, gold, size, star=True):
    """Pointed-arch keystone on top of the band (Игрок, Опытный); the Veteran has the skull here."""
    x, y = P(r, 0)
    s = size
    out = f'<path d="M{x-s} {y+s*1.1} L{x-s*0.75} {y-s*0.5} Q{x} {y-s*1.6} {x+s*0.75} {y-s*0.5} L{x+s} {y+s*1.1} Z" fill="url(#iron)" stroke="{gold}" stroke-width="1.5"/>'
    if star:
        out += '<polygon points="' + " ".join(
            f"{x + (s*0.42 if k % 2 == 0 else s*0.17) * math.cos(math.radians(k * 45 - 90)):.2f},{y + (s*0.42 if k % 2 == 0 else s*0.17) * math.sin(math.radians(k * 45 - 90)):.2f}"
            for k in range(8)) + f'" fill="{gold}"/>'
    return out


def wh(t):
    g = []
    gold = "#D4A84B"
    if t == 0:
        # Новичок: тонкий железный обод с латунной кромкой и 4 заклёпками
        g.append(ring(AV + 4, 6, "url(#iron)"))
        g.append(ring(AV + 7.4, 1.2, gold))
        g.append(dots(AV + 4, 4, 1.8, "#E9E4D4", 45))
    if t == 1:
        # Игрок: обод шире, латунь с двух сторон, 8 тёмных стрельчатых окон
        g.append(ring(AV + 7, 12, "url(#iron)"))
        g.append(ring(AV + 13.2, 1.6, gold))
        g.append(ring(AV + 1.2, 1.6, gold))
        g.append(lancets(AV + 2.5, 8, "glass-dim", gold, 22.5, 9, 2.8))
        g.append(dots(AV + 7, 8, 1.7, "#E9E4D4", 0))
    if t == 2:
        # Опытный: широкий обод, 12 светящихся окон, 4 шпиля и аркбутаны
        for d in (90, 270):
            g.append(buttress(d, AV + 18, 50, 12, gold))
        for d in (45, 135, 225, 315):
            g.append(spire(d, AV + 16, 26, 6.5, "url(#iron)", gold, "glass-static"))
        g.append(ring(AV + 9, 16, "url(#iron)"))
        g.append(ring(AV + 17.2, 2, gold))
        g.append(ring(AV + 1.4, 2, gold))
        g.append(lancets(AV + 3.5, 12, "glass-static", gold, 15, 11, 3.2))
        g.append(dots(AV + 15, 12, 1.6, "#E9E4D4", 0))
        g.append(ticks(AV + 13, AV + 16, 36, "#ECFE46", 1, 5))
    if t == 3:
        g += wh_veteran()
    return g


def spire(deg, r0, h, w, fill, trim, glass="glass"):
    """Gothic pinnacle: shaft with pointed top, crockets (small hooks) along the edges and a finial."""
    p = (f'M{-w} 0 L{-w} {-h*0.55} L{-w*0.55} {-h*0.62} L0 {-h} L{w*0.55} {-h*0.62} L{w} {-h*0.55} L{w} 0 Z')
    crockets = "".join(
        f'<path d="M{sx*w*0.62} {-h*k} l{sx*3.2} -2.2 l{-sx*1.4} 3.4 Z" fill="{trim}"/>' for k in (0.66, 0.76, 0.86) for sx in (-1, 1)
    )
    finial = f'<circle cy="{-h-2.6}" r="2.6" fill="{trim}"/><path d="M-3.6 {-h-2.6} L3.6 {-h-2.6} M0 {-h-6.2} L0 {-h+1}" stroke="{trim}" stroke-width="1.4"/>'
    window = f'<path d="M-2.4 {-h*0.18} L-2.4 {-h*0.38} Q0 {-h*0.5} 2.4 {-h*0.38} L2.4 {-h*0.18} Z" class="{glass}"/>'
    return (f'<g transform="rotate({deg}) translate(0 {-r0})"><path d="{p}" fill="{fill}" stroke="{trim}" stroke-width="1.3" stroke-linejoin="round"/>'
            f'{crockets}{window}{finial}</g>')


def buttress(deg, r0, span, rise, trim):
    """Flying-buttress arch between two spires, drawn along the ring."""
    a, b = P(r0, deg - span / 2), P(r0, deg + span / 2)
    top = P(r0 + rise, deg)
    return (f'<path d="M{a[0]} {a[1]} Q{top[0]} {top[1]} {b[0]} {b[1]}" fill="none" stroke="{trim}" stroke-width="2.2"/>'
            f'<path d="M{a[0]} {a[1]} Q{top[0]} {top[1]} {b[0]} {b[1]}" fill="none" stroke="#111110" stroke-width="0.8" stroke-dasharray="2 3"/>')


def skull(x, y, s, trim):
    """Generic stylised skull keystone with laurel; eye sockets glow."""
    return (f'<g transform="translate({x} {y}) scale({s})">'
            f'<path d="M-9 -2 Q-9 -12 0 -12 Q9 -12 9 -2 Q9 3 5 5 L5 9 L-5 9 L-5 5 Q-9 3 -9 -2 Z" fill="#E9E4D4" stroke="#111110" stroke-width="1"/>'
            f'<ellipse class="eyes" cx="-3.6" cy="-2.5" rx="2.6" ry="2.9" fill="#ECFE46"/><ellipse class="eyes" cx="3.6" cy="-2.5" rx="2.6" ry="2.9" fill="#ECFE46"/>'
            f'<path d="M0 1 L-1.3 3.6 L1.3 3.6 Z" fill="#111110"/>'
            f'<path d="M-3 9 L-3 6.5 M0 9 L0 6.5 M3 9 L3 6.5" stroke="#111110" stroke-width="0.9"/>'
            + "".join(f'<ellipse cx="{sx*(11+i*3.2)}" cy="{4-i*3.4}" rx="3.2" ry="1.4" fill="{trim}" transform="rotate({sx*(-40-i*12)} {sx*(11+i*3.2)} {4-i*3.4})"/>' for sx in (-1, 1) for i in range(3))
            + '</g>')


def purity_seal(x, y, trim, strips=True):
    """Wax seal with two parchment strips that sway."""
    strips_svg = (f'<g class="sway" style="transform-origin:{x}px {y}px">'
              f'<path d="M{x-6} {y+4} L{x-9} {y+30} L{x-5} {y+27} L{x-2} {y+31} L{x-1} {y+5} Z" fill="#E6D9B5"/>'
              f'<path d="M{x+2} {y+5} L{x+4} {y+25} L{x+7} {y+22} L{x+10} {y+26} L{x+7} {y+4} Z" fill="#D9CA9E"/>'
              + "".join(f'<line x1="{x-7+k*0.2}" y1="{y+11+k*4}" x2="{x-3.5}" y2="{y+11+k*4}" stroke="#7A6A4A" stroke-width="0.7"/>' for k in range(3))
              + '</g>')
    seal = (f'<circle cx="{x}" cy="{y}" r="9.5" fill="#9E1B22" stroke="#6E1016" stroke-width="1.5"/>'
            f'<circle cx="{x}" cy="{y}" r="6" fill="none" stroke="#C9343C" stroke-width="1"/>'
            + '<polygon points="' + " ".join(f"{x + (4.4 if k % 2 == 0 else 1.7) * math.cos(math.radians(k * 45 - 90)):.2f},{y + (4.4 if k % 2 == 0 else 1.7) * math.sin(math.radians(k * 45 - 90)):.2f}" for k in range(8)) + f'" fill="{trim}"/>')
    return (strips_svg if strips else "") + seal


def chain(deg_from, deg_to, r, trim):
    out = []
    n = 7
    for i in range(n):
        d = deg_from + (deg_to - deg_from) * i / (n - 1)
        sag = math.sin(math.pi * i / (n - 1)) * 7
        x, y = P(r + sag, d)
        out.append(f'<ellipse cx="{x}" cy="{y}" rx="2.6" ry="1.6" fill="none" stroke="{trim}" stroke-width="1.2" transform="rotate({d + (90 if i % 2 else 0)} {x} {y})"/>')
    return "".join(out)


def wh_veteran():
    gold, iron = "#D4A84B", "url(#iron)"
    g = []
    # aura
    g.append(f'<circle r="{AV+40}" fill="url(#whaura)" class="breathe"/>')
    # buttresses and spires (cathedral crown)
    for d in [22.5 + 45 * i for i in range(8)]:
        g.append(buttress(d, AV + 22, 34, 14, gold))
    for i, d in enumerate([45 * k for k in range(8)]):
        tall = i % 2 == 0
        if d == 0:
            continue  # top: skull keystone instead
        if d == 180:
            continue  # bottom: purity seal
        g.append(spire(d, AV + 19, 34 if tall else 25, 8 if tall else 6, iron, gold))
    # heavy iron band
    g.append(ring(AV + 11, 20, iron))
    g.append(ring(AV + 21, 2.4, gold))
    g.append(ring(AV + 1.5, 2.4, gold))
    # stained-glass tracery: 16 lancet windows in the band
    for d in [11.25 + 22.5 * i for i in range(16)]:
        g.append(f'<path d="M-3.4 0 L-3.4 -6 Q-3.4 -11 0 -12.5 Q3.4 -11 3.4 -6 L3.4 0 Z" transform="rotate({d}) translate(0 {-(AV + 5)})" class="glass" stroke="{gold}" stroke-width="0.8"/>')
    # rivets between windows
    g.append(dots(AV + 18, 16, 1.7, "#E9E4D4", 0))
    # rotating runic ring of lime marks inside the band edge
    g.append('<g class="spin-slow">' + ticks(AV + 15.5, AV + 19.5, 48, "#ECFE46", 1.1) + "</g>")
    # chains on the lower sides
    g.append(chain(118, 152, AV + 23, "#8E8E86"))
    g.append(chain(208, 242, AV + 23, "#8E8E86"))
    # skull keystone with laurel on top, purity seal at the bottom
    sx, sy = P(AV + 30, 0)
    g.append(f'<path d="M{sx-15} {sy+16} L{sx-11} {sy-8} Q{sx} {sy-24} {sx+11} {sy-8} L{sx+15} {sy+16} Z" fill="#262624" stroke="{gold}" stroke-width="1.6"/>')
    g.append(skull(sx, sy + 2, 1.05, gold))
    bx, by = P(AV + 24, 180)
    g.append(purity_seal(bx, by - 2, gold))
    return g


# ---------- D&D: gold, leaves, runes, d20 ----------
def leaf(r, deg, size, fill):
    x, y = P(r, deg)
    return f'<ellipse cx="{x}" cy="{y}" rx="{size}" ry="{size/2.2}" fill="{fill}" transform="rotate({deg} {x} {y})"/>'


def d20(x, y, s, fill, stroke):
    pts = " ".join(f"{x + s*math.cos(math.radians(a-90)):.1f},{y + s*math.sin(math.radians(a-90)):.1f}" for a in range(0, 360, 60))
    inner = f"M{x} {y-s} L{x - s*0.87:.1f} {y + s/2:.1f} L{x + s*0.87:.1f} {y + s/2:.1f} Z"
    return f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/><path d="{inner}" fill="none" stroke="{stroke}" stroke-width="1.2"/>'


def runes(r, n, color, size=4):
    out = []
    shapes = ["M0 -1 L0 1 M-0.6 -0.4 L0.6 0.4", "M-0.6 -1 L0.6 1 M0.6 -1 L-0.6 1", "M0 -1 L0 1 M0 -0.2 L0.7 -0.8", "M-0.6 1 L0 -1 L0.6 1"]
    for i in range(n):
        d = 360 * i / n
        x, y = P(r, d)
        out.append(f'<path d="{shapes[i % 4]}" transform="translate({x} {y}) rotate({d}) scale({size})" stroke="{color}" stroke-width="{1.4/size:.2f}" fill="none" stroke-linecap="round"/>')
    return "".join(out)


def dnd(t):
    g = []
    gold, violet = "#E8C66A", "#9B7BFF"
    if t == 0:
        # Новичок: амулет искателя приключений — золотое кольцо и 4 фиолетовых камня
        g.append(ring(AV + 4, 2.5, gold))
        g.append(ring(AV + 8, 0.8, gold, 'opacity="0.5"'))
        for d in (0, 90, 180, 270):
            x, y = P(AV + 4, d)
            g.append(f'<rect x="{x-3.6}" y="{y-3.6}" width="7.2" height="7.2" fill="{violet}" stroke="{gold}" stroke-width="1.2" transform="rotate(45 {x} {y})"/>')
    if t == 1:
        # Игрок: живая лоза — две переплетённые ветви, листья и камень в оправе сверху
        for phase, color, wdt in ((0, "#7DAA5A", 2.6), (math.pi, gold, 2)):
            pts = []
            for k in range(181):
                th = 2 * math.pi * k / 180
                r = AV + 7 + 3.2 * math.sin(10 * th + phase)
                pts.append(f"{r*math.cos(th - math.pi/2):.2f},{r*math.sin(th - math.pi/2):.2f}")
            g.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{color}" stroke-width="{wdt}" stroke-linejoin="round"/>')
        for d in range(18, 360, 36):
            g.append(leaf(AV + 11, d, 7, "#7DAA5A"))
        x, y = P(AV + 9, 0)
        g.append(f'<circle cx="{x}" cy="{y}" r="7.5" fill="#2A2140" stroke="{gold}" stroke-width="1.6"/>')
        g.append(f'<rect x="{x-3.8}" y="{y-3.8}" width="7.6" height="7.6" fill="{violet}" transform="rotate(45 {x} {y})"/>')
    if t == 2:
        g.append(ring(AV + 4, 2, gold))
        g.append(ring(AV + 18, 2, gold))
        g.append(runes(AV + 11, 16, violet, 4))
        x, y = P(AV + 18, 180)
        g.append(d20(x, y, 13, "#2A2140", gold))
    if t == 3:
        g.append(f'<circle r="{AV+24}" fill="url(#dndglow)"/>')
        g.append(ring(AV + 4, 2.5, gold))
        g.append(ring(AV + 22, 2.5, gold))
        g.append('<g class="spin">' + runes(AV + 13, 20, violet, 4.5) + "</g>")
        g.append('<g class="spin-rev">' + ticks(AV + 26, AV + 31, 36, gold, 1.4) + "</g>")
        x, y = P(AV + 22, 0)
        g.append(f'<g class="pulse">{d20(x, y, 15, "#3A2C5C", gold)}</g>')
        for d, s in ((60, 3), (130, 2.4), (230, 2.8), (300, 2.2)):
            sx, sy = P(AV + 36, d)
            g.append(f'<path class="twinkle" style="animation-delay:{d/100:.1f}s" d="M{sx} {sy-s*2} L{sx+s/2} {sy-s/2} L{sx+s*2} {sy} L{sx+s/2} {sy+s/2} L{sx} {sy+s*2} L{sx-s/2} {sy+s/2} L{sx-s*2} {sy} L{sx-s/2} {sy-s/2} Z" fill="{gold}"/>')
    return g


# ---------- Painting: brush strokes, colour, drips ----------
def painting(t):
    g = []
    if t == 0:
        g.append(ring(AV + 4, 4, "#FF6B9A", 'stroke-linecap="round" stroke-dasharray="120 6 60 8 140 10"'))
    if t == 1:
        g.append(ring(AV + 5, 5, "#FF6B9A", 'stroke-linecap="round" stroke-dasharray="90 40 70 30"'))
        g.append(ring(AV + 5, 5, "#4FC3F7", 'stroke-linecap="round" stroke-dasharray="0 95 60 45 50 20" '))
        g.append(ring(AV + 10, 1.5, "#F4F4F0", 'opacity="0.25"'))
    if t == 2:
        g.append(ring(AV + 7, 8, "url(#paint)"))
        for d, ln in ((160, 14), (180, 22), (205, 10)):
            x, y = P(AV + 10, d)
            g.append(f'<path d="M{x-3} {y} Q{x-3} {y+ln} {x} {y+ln+4} Q{x+3} {y+ln} {x+3} {y} Z" fill="url(#paint)"/>')
        g.append(dots(AV + 18, 6, 2.2, "#ECFE46", 30))
    if t == 3:
        g.append(f'<g class="spin">{ring(AV + 8, 11, "url(#paint)")}</g>')
        g.append(ring(AV + 15, 1.5, "#F4F4F0", 'opacity="0.35"'))
        for d, ln, delay in ((150, 16, 0), (180, 26, 0.6), (210, 12, 1.2)):
            x, y = P(AV + 12, d)
            g.append(f'<path class="drip" style="animation-delay:{delay}s" d="M{x-3.5} {y} Q{x-3.5} {y+ln} {x} {y+ln+5} Q{x+3.5} {y+ln} {x+3.5} {y} Z" fill="#FF6B9A"/>')
        for d, c, s in ((20, "#4FC3F7", 6), (70, "#ECFE46", 4.5), (110, "#FF9F43", 5), (250, "#A3E635", 5.5), (320, "#9B7BFF", 4.5)):
            x, y = P(AV + 28, d)
            g.append(f'<circle class="pop" style="animation-delay:{d/120:.2f}s" cx="{x}" cy="{y}" r="{s}" fill="{c}"/>')
    return g


# ---------- Club visits: board-game track, tokens, dice ----------
def die(x, y, s, n, fill="#F4F4F0"):
    pips = {1: [(0, 0)], 3: [(-1, -1), (0, 0), (1, 1)], 5: [(-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)], 6: [(-1, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (1, 1)]}[n]
    out = [f'<rect x="{x-s}" y="{y-s}" width="{2*s}" height="{2*s}" rx="{s*0.3}" fill="{fill}"/>']
    out += [f'<circle cx="{x + px*s*0.5}" cy="{y + py*s*0.5}" r="{s*0.14:.2f}" fill="#111110"/>' for px, py in pips]
    return "".join(out)


def visits(t):
    g = []
    teal, orange = "#2DD4BF", "#FF9F43"
    if t == 0:
        g.append(ring(AV + 4, 3, teal, 'stroke-linecap="round" stroke-dasharray="1 8"'))
        g.append(ring(AV + 4, 1, teal, 'opacity="0.4"'))
    if t == 1:
        g.append(ring(AV + 5, 3, teal))
        colors = ["#FF6B9A", "#ECFE46", "#4FC3F7", orange, "#A3E635", "#9B7BFF"]
        for i, c in enumerate(colors):
            x, y = P(AV + 5, 30 + 60 * i)
            g.append(f'<circle cx="{x}" cy="{y}" r="5" fill="{c}" stroke="#111110" stroke-width="2"/>')
    if t == 2:
        n = 24
        for i in range(n):
            d0, d1 = 360 * i / n + 1.5, 360 * (i + 1) / n - 1.5
            a, b = P(AV + 6, d0), P(AV + 6, d1)
            c, e = P(AV + 16, d1), P(AV + 16, d0)
            fill = [teal, "#1F3B38", orange, "#1F3B38"][i % 4]
            g.append(f'<path d="M{a[0]} {a[1]} A{AV+6} {AV+6} 0 0 1 {b[0]} {b[1]} L{c[0]} {c[1]} A{AV+16} {AV+16} 0 0 0 {e[0]} {e[1]} Z" fill="{fill}"/>')
        x, y = P(AV + 22, 180)
        g.append(die(x, y + 2, 11, 5))
    if t == 3:
        n = 30
        g.append('<g class="spin-slow">')
        for i in range(n):
            d0, d1 = 360 * i / n + 1.2, 360 * (i + 1) / n - 1.2
            a, b = P(AV + 7, d0), P(AV + 7, d1)
            c, e = P(AV + 19, d1), P(AV + 19, d0)
            fill = [teal, "#173230", orange, "#173230", "#ECFE46", "#173230"][i % 6]
            g.append(f'<path d="M{a[0]} {a[1]} A{AV+7} {AV+7} 0 0 1 {b[0]} {b[1]} L{c[0]} {c[1]} A{AV+19} {AV+19} 0 0 0 {e[0]} {e[1]} Z" fill="{fill}"/>')
        g.append("</g>")
        g.append(ring(AV + 22, 1.5, teal, 'opacity="0.6"'))
        for d, n_, delay in ((315, 6, 0), (45, 3, 0.5)):
            x, y = P(AV + 33, d)
            g.append(f'<g class="roll" style="animation-delay:{delay}s; transform-origin:{x}px {y}px">{die(x, y, 10, n_)}</g>')
        x, y = P(AV + 26, 180)
        g.append(f'<g class="pulse">{die(x, y + 4, 9, 1, orange)}</g>')
    return g


DEFS = """<defs>
<radialGradient id="dndglow"><stop offset="60%" stop-color="#9B7BFF" stop-opacity="0"/><stop offset="85%" stop-color="#9B7BFF" stop-opacity="0.22"/><stop offset="100%" stop-color="#9B7BFF" stop-opacity="0"/></radialGradient>
<linearGradient id="iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6A6A62"/><stop offset="0.5" stop-color="#2E2E2B"/><stop offset="1" stop-color="#4A4A44"/></linearGradient>
<radialGradient id="whaura"><stop offset="55%" stop-color="#ECFE46" stop-opacity="0"/><stop offset="80%" stop-color="#ECFE46" stop-opacity="0.14"/><stop offset="100%" stop-color="#ECFE46" stop-opacity="0"/></radialGradient>
<linearGradient id="glassg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4FF9A"/><stop offset="1" stop-color="#7C8A1E"/></linearGradient>
<linearGradient id="paint" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6B9A"/><stop offset="0.35" stop-color="#FF9F43"/><stop offset="0.6" stop-color="#ECFE46"/><stop offset="0.8" stop-color="#4FC3F7"/><stop offset="1" stop-color="#9B7BFF"/></linearGradient>
</defs>"""

CATS = [
    ("Warhammer", "Игры и тренировки 40K, AoS, Kill Team, Warcry — готика, металл, шипы", wh),
    ("D&D", "Сессии с мастером — фэнтези, руны, кубик d20", dnd),
    ("Покраска", "Покраска миниатюр — мазки кисти, цвет, капли", painting),
    ("Посещение клуба", "Настолки и общение — игровое поле, фишки, кубики", visits),
]
RANKS = [("Новичок", "0–4 игры"), ("Игрок", "5–14 игр"), ("Опытный", "15–39 игр"), ("Ветеран", "40+ игр, анимация")]


def frame_svg(fn, t, size=176):
    body = "".join(fn(t))
    return (
        f'<svg width="{size}" height="{size}" viewBox="-110 -110 220 220" aria-hidden="true">{DEFS}'
        f'<circle r="{AV}" fill="#2A2A27"/><text y="12" text-anchor="middle" font-family="Oswald" font-size="34" font-weight="600" fill="#F4F4F0">ИФ</text>'
        f"{body}</svg>"
    )


rows = []
for name, sub, fn in CATS:
    cells = "".join(
        f'<div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:220px">{frame_svg(fn, t)}'
        f'<span style="font-size:17px;font-weight:700">{rk}</span><span style="font-size:13px;color:#8E8E86">{cnt}</span></div>'
        for t, (rk, cnt) in enumerate(RANKS)
    )
    rows.append(
        f'<section style="display:flex;align-items:center;gap:24px;padding:18px 0;border-top:1px solid rgba(255,255,255,0.08)">'
        f'<div style="width:220px;flex:0 0 auto"><div style="font-family:Oswald;font-size:26px;font-weight:600;text-transform:uppercase">{name}</div>'
        f'<div style="margin-top:6px;font-size:14px;color:#B8B8B0;line-height:1.4">{sub}</div></div>{cells}</section>'
    )

CSS = """
body{margin:0}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes spinrev{to{transform:rotate(-360deg)}}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.75;transform:scale(1.08)}}
@keyframes glow{0%,100%{filter:drop-shadow(0 0 0 rgba(236,254,70,0))}50%{filter:drop-shadow(0 0 6px rgba(236,254,70,.7))}}
@keyframes twinkle{0%,100%{opacity:.2;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}
@keyframes drip{0%{transform:translateY(-4px);opacity:0}30%{opacity:1}100%{transform:translateY(6px);opacity:0}}
@keyframes pop{0%,100%{transform:scale(.4);opacity:.3}50%{transform:scale(1);opacity:1}}
@keyframes roll{0%,70%{transform:rotate(0)}85%{transform:rotate(90deg)}100%{transform:rotate(90deg)}}
.spin{animation:spin 18s linear infinite;transform-origin:0 0;transform-box:view-box}
.spin-slow{animation:spin 40s linear infinite;transform-origin:0 0;transform-box:view-box}
.spin-rev{animation:spinrev 30s linear infinite;transform-origin:0 0;transform-box:view-box}
.pulse{animation:pulse 2.4s ease-in-out infinite;transform-origin:center;transform-box:fill-box}
.wh-glow{animation:glow 3s ease-in-out infinite}
@keyframes flicker{0%,100%{opacity:.95}40%{opacity:.6}60%{opacity:1}80%{opacity:.75}}
@keyframes breathe{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes eyes{0%,100%{opacity:.55}50%{opacity:1}}
.glass{fill:url(#glassg);animation:flicker 3.4s ease-in-out infinite}
.glass-static{fill:url(#glassg);opacity:.85}
.glass-dim{fill:#3B4214}
.breathe{animation:breathe 4s ease-in-out infinite}
.sway{animation:sway 3.6s ease-in-out infinite;transform-box:view-box}
.eyes{animation:eyes 2.4s ease-in-out infinite}
.twinkle{animation:twinkle 2.2s ease-in-out infinite;transform-origin:center;transform-box:fill-box}
.drip{animation:drip 2.6s ease-in infinite}
.pop{animation:pop 2.8s ease-in-out infinite;transform-origin:center;transform-box:fill-box}
.roll{animation:roll 3.2s ease-in-out infinite;transform-box:view-box}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
"""

html = f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Рамки аватара</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&amp;family=Oswald:wght@500;600;700&amp;display=swap">
<style>{CSS}</style>
</helmet>
<div style="width:1280px;height:1200px;position:relative;overflow:hidden;background:#111110;color:#F4F4F0;font-family:'Inter Tight',sans-serif;padding:28px 36px;box-sizing:border-box">
  <div style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#8E8E86">Профиль · прогресс игрока</div>
  <h1 style="margin:6px 0 4px;font-family:Oswald;font-size:34px;font-weight:600;text-transform:uppercase">Рамки аватара</h1>
  <p style="margin:0 0 14px;font-size:15px;color:#B8B8B0">Своя рамка у каждой категории; с рангом растёт и усложняется, но всегда остаётся круглой. «Ветеран» — с анимацией (отключается при «уменьшить движение»).</p>
  {''.join(rows)}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1280,"height":1200}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
"""
open("../design/project/Frames.dc.html", "w").write(html)
print("ok", len(html))


# ---------- export for the client (client/src/components/ui/AvatarFrame/frames.generated.ts) ----------
import re, json

CLASSES = ["spin-slow", "spin-rev", "spin", "pulse", "wh-glow", "twinkle", "drip", "pop", "roll", "glass-static", "glass-dim", "glass", "breathe", "sway", "eyes"]
IDS = ["iron", "paint", "dndglow", "whaura", "glassg"]


def prefixed(markup):
    markup = re.sub(r'class="([^"]+)"', lambda m: 'class="' + " ".join("af-" + c if c in CLASSES else c for c in m.group(1).split()) + '"', markup)
    for i in IDS:
        markup = markup.replace(f'id="{i}"', f'id="af-{i}"').replace(f"url(#{i})", f"url(#af-{i})")
    return markup


EXTENT = []
out = {}
for key, (_, _, fn) in zip(["warhammer", "dnd", "painting", "visits"], CATS):
    out[key] = [prefixed("".join(fn(t))) for t in range(4)]
defs = prefixed(DEFS.replace("<defs>", "").replace("</defs>", ""))
css = prefixed_css = CSS
ts = (
    "// Сгенерировано из макета «Рамки аватара» (design canvas, 30.10.2026) — не править вручную.\n"
    "// SVG-разметка рамок в координатах viewBox -110..110, аватар — круг радиусом 52 в центре.\n"
    f"export const FRAME_DEFS = {json.dumps(defs, ensure_ascii=False)};\n\n"
    "export const FRAME_MARKUP: Record<\"warhammer\" | \"dnd\" | \"painting\" | \"visits\", [string, string, string, string]> = "
    + json.dumps(out, ensure_ascii=False, indent=2)
    + ";\n"
)
open("frames.generated.ts", "w").write(ts)
print("ts", len(ts))
