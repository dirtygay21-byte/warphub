"""Supporter frames (Warp Flame, Club Crown, Banner): artboard + client export. Reuses helpers from gen.py."""
import json, math, re
LOGO_D = 'm657.12,490.32c-.27-.21-.54-.42-.82-.63-5.79-24.13-40.41-162.06-48.37-246.64-7.78-82.62-8.95-132.1-9.91-138.22-.19-1.2-.17-6.72-1.15-7.56-26.08-22.26-81.77-66.88-114.31-97.26.76,58.63-2.69,118.48,3.5,185.35,6.52,70.43,14.63,140.56,28.78,201.38-10.66.37-29.06,1.28-52.33,2.99,16.55-5.82,33.62-15.4,41.73-22.31v-.04c-.6-1.62-1.1-3.75-1.73-6.62-15.49-70.29-24.04-133.82-28.7-194.96l-60.82,13.08,6.31,66.72,17.87-3.84,7.51,75.4c-1.75,1.52-3.99,2-6.22,2.48-19.37,4.16-42.9-22.11-49.58-99.17-7.24-83.51,12.51-115.44,43.76-124.66,12.22-3.61,28.12-2.33,37.35.23-.79-22.43-1.19-44.76-1.37-67.22-11.12-2.19-30.11-3.25-47.72.4-51.31,10.62-95.12,70.2-91.26,185.2,24.29,23.94,37,59.41,39.4,92.63,1.44,19.97.15,36.76-3.37,51.22,2.83,4.23,5.81,8.12,8.95,11.62,10.88,12.47,23.59,20.76,38.71,24.14-30.79,3.12-65.17,7.41-99.37,13.24,18.27-10.49,29.34-25.23,35.66-43.06,7.78-20.87,9.93-46.13,5.01-76.84-5.8-36.26-23.52-67.5-49.83-74.4l-.29-2.02c18.65-19.65,22.84-50.35,18.62-77.2-3.46-22.05-11.33-42.76-25.12-54.92-8.88-7.86-18.24-11.47-27.69-12.65-24.55,5.53-49.57,10.49-74.7,14.72-.67.33-1.33.66-1.96,1l33.62,344.63c-7.75,2.13-15.26,4.31-22.5,6.49l-16.28-350.95c-18.97,3.09-37.98,5.75-56.89,7.92,4.42,32.55,28.33,208.82,32.05,240.03l-.59.2c-13.11-31.86-31.86-71.73-31.86-71.73l-18.11,4.76s-6.44,48.08-10.76,79.56l-.86.3c-4.72-30.72-28.73-209.3-33.89-247.74-23.09,1.18-45.73,1.46-67.61.69,12.53,50.09,84.4,337.47,93.72,374.73.65,2.6,1,3.98,1,3.98,37.74,18.19,67.08,43.79,108.7,75.54,1.7,1.29,9.57-1.66,11.45-2.21,6.52-1.9,13.06-3.73,19.62-5.51,13.11-3.57,107.8-29.33,172.17-35.75,54.07-5.39,101.68-12.87,155.97-14.89,16.6-.62,33.22-.91,49.84-.86,8.45.02,16.9.13,25.34.33,5.58.13,10.55-.23,15.8-.74l3.51,2.59c-.04-.3-.27-1.29-.65-2.87.22-.02.43-.04.65-.07Zm-525.76-31.72c.03-14.93-.43-33.91-.35-48.44.22-7.37,2.56-48.7,2.77-55.39l.56-.2c3.2,12.24,13.5,38.46,17.11,51.74,3.55,12.27,9.63,27.22,13.43,39.74-12.65,4.45-23.9,8.71-33.52,12.55ZM245.54,122.21c2.22-1.87,5.45-2.99,9.34-3.77,12.27-2.45,20.71,12.14,23.54,33,3.15,23.2-3.12,42.61-15.82,45.11l-7.73,1.52-9.33-75.86Zm36.39,227.3c-2.97.56-5.61,1.06-8.39.44l-11.54-93.86,8.25-1.6c13.66-2.65,27.98,11.27,32.18,41.78,4.54,32.97-6.61,50.61-20.49,53.25Z'  # club mini-logo (WBG.svg from the owner), viewBox 0 0 657.12 550.63
import gen  # noqa: E402  (runs gen.py once: regenerates Frames artboard and frames.generated.ts)
from gen import P, ring, dots, ticks, AV

LIME, GOLD, DARK = "#ECFE46", "#D4A84B", "#111110"

SDEFS = """
<linearGradient id="sp-goldv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6D2"/><stop offset="0.18" stop-color="#E9C46A"/><stop offset="0.42" stop-color="#8A6219"/><stop offset="0.6" stop-color="#F3D886"/><stop offset="0.82" stop-color="#A57A26"/><stop offset="1" stop-color="#5E400C"/></linearGradient>
<linearGradient id="sp-goldd" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFF6D2"/><stop offset="0.3" stop-color="#C99A3C"/><stop offset="0.7" stop-color="#6E4D12"/><stop offset="1" stop-color="#3A2806"/></linearGradient>
<linearGradient id="sp-limev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBFFD0"/><stop offset="0.35" stop-color="#ECFE46"/><stop offset="0.75" stop-color="#9DB300"/><stop offset="1" stop-color="#4E5A00"/></linearGradient>
<radialGradient id="sp-enamel" r="0.62"><stop offset="0.8" stop-color="#050505"/><stop offset="0.9" stop-color="#1A1C0A"/><stop offset="1" stop-color="#050505"/></radialGradient>
<radialGradient id="sp-aura-gold"><stop offset="48%" stop-color="#FFD36B" stop-opacity="0"/><stop offset="72%" stop-color="#FFD36B" stop-opacity="0.18"/><stop offset="100%" stop-color="#FFD36B" stop-opacity="0"/></radialGradient>
<linearGradient id="sp-cloth" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2B3300"/><stop offset="0.25" stop-color="#6E7D00"/><stop offset="0.5" stop-color="#9DB300"/><stop offset="0.75" stop-color="#6E7D00"/><stop offset="1" stop-color="#2B3300"/></linearGradient>
<radialGradient id="sp-aura-gold-strong"><stop offset="38%" stop-color="#FFD36B" stop-opacity="0"/><stop offset="58%" stop-color="#FFD36B" stop-opacity="0.55"/><stop offset="100%" stop-color="#FFB13B" stop-opacity="0"/></radialGradient>
<radialGradient id="sp-storm-outer"><stop offset="35%" stop-color="#B7D400" stop-opacity="0.95"/><stop offset="62%" stop-color="#5E7A00" stop-opacity="0.8"/><stop offset="85%" stop-color="#22300A" stop-opacity="0.45"/><stop offset="100%" stop-color="#101806" stop-opacity="0"/></radialGradient>
<radialGradient id="sp-storm-inner"><stop offset="55%" stop-color="#F8FFD6" stop-opacity="0.9"/><stop offset="80%" stop-color="#ECFE46" stop-opacity="0.7"/><stop offset="100%" stop-color="#9DB300" stop-opacity="0"/></radialGradient>
<radialGradient id="sp-storm-ray"><stop offset="0" stop-color="#F4FF9A"/><stop offset="0.6" stop-color="#ACC700" stop-opacity="0.7"/><stop offset="1" stop-color="#2E4A10" stop-opacity="0"/></radialGradient>
<radialGradient id="sp-storm-veil"><stop offset="40%" stop-color="#2E4A10" stop-opacity="0"/><stop offset="70%" stop-color="#7EA100" stop-opacity="0.6"/><stop offset="100%" stop-color="#101806" stop-opacity="0"/></radialGradient>
<filter id="sp-turb" x="-40%" y="-40%" width="180%" height="180%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="28" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="0.6"/></filter>
<filter id="sp-turb2" x="-40%" y="-40%" width="180%" height="180%"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="G" yChannelSelector="B"/></filter>
<linearGradient id="sp-bronze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CDB98A"/><stop offset="0.35" stop-color="#8C7647"/><stop offset="0.7" stop-color="#5E4B27"/><stop offset="1" stop-color="#3B2E16"/></linearGradient>
<linearGradient id="sp-bronzed" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#B29E70"/><stop offset="1" stop-color="#3B2E16"/></linearGradient>
<linearGradient id="sp-pole" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4A3418"/><stop offset="0.5" stop-color="#8A6A3A"/><stop offset="1" stop-color="#3A2810"/></linearGradient>
<linearGradient id="sp-cloth-dark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D1D1B"/><stop offset="0.45" stop-color="#0E0E0D"/><stop offset="0.7" stop-color="#232320"/><stop offset="1" stop-color="#0B0B0A"/></linearGradient>
<radialGradient id="sp-fade-g"><stop offset="0.7" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
<mask id="sp-fade" maskUnits="userSpaceOnUse" x="-125" y="-125" width="250" height="250"><circle r="122" fill="url(#sp-fade-g)"/></mask>
<radialGradient id="sp-velvet" cx="0.5" cy="0.3"><stop offset="0" stop-color="#3B4512"/><stop offset="1" stop-color="#121505"/></radialGradient>
<linearGradient id="sp-cloth-flag" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C9DB2A"/><stop offset="0.45" stop-color="#ECFE46"/><stop offset="1" stop-color="#B3C61E"/></linearGradient>
<linearGradient id="sp-patina" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A1F0B"/><stop offset="0.35" stop-color="#140F06"/><stop offset="0.6" stop-color="#3A2C10"/><stop offset="1" stop-color="#0E0A04"/></linearGradient>
<radialGradient id="sp-fog"><stop offset="0" stop-color="#C9CFB8" stop-opacity="0.75"/><stop offset="0.6" stop-color="#8E9580" stop-opacity="0.35"/><stop offset="1" stop-color="#5E6452" stop-opacity="0"/></radialGradient>
<filter id="sp-mist" x="-30%" y="-60%" width="160%" height="220%"><feTurbulence type="fractalNoise" baseFrequency="0.03 0.08" numOctaves="3" seed="21" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="22" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="2.2"/></filter>
<radialGradient id="sp-aura"><stop offset="48%" stop-color="#ECFE46" stop-opacity="0"/><stop offset="72%" stop-color="#ECFE46" stop-opacity="0.16"/><stop offset="100%" stop-color="#ECFE46" stop-opacity="0"/></radialGradient>
<radialGradient id="sp-core" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.4" stop-color="#F6FF9C"/><stop offset="1" stop-color="#ECFE46" stop-opacity="0"/></radialGradient>
<linearGradient id="sp-sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.9"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
<linearGradient id="sp-ribbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4FF8A"/><stop offset="0.45" stop-color="#ECFE46"/><stop offset="1" stop-color="#8FA300"/></linearGradient>
<linearGradient id="sp-ribbon-back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7C8C00"/><stop offset="1" stop-color="#3F4800"/></linearGradient>
<linearGradient id="sp-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF1B8"/><stop offset="0.5" stop-color="#C99A3C"/><stop offset="1" stop-color="#6E4D12"/></linearGradient>
<linearGradient id="sp-leafl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FBFFD0"/><stop offset="0.5" stop-color="#C9DB2A"/><stop offset="1" stop-color="#5E6B00"/></linearGradient>
<filter id="sp-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="sp-bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="sp-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.7"/></filter>
"""


def bevel_ring(r, w, outer="url(#sp-goldv)", inner="url(#sp-goldd)"):
    """Metal ring with a bevel: lit top edge, shaded bottom edge, fine dark grooves."""
    return (ring(r, w, outer) + ring(r - w * 0.18, w * 0.36, inner, 'opacity="0.55"')
            + ring(r + w / 2 - 0.4, 0.6, "#2A1C04", 'opacity="0.8"') + ring(r - w / 2 + 0.4, 0.6, "#2A1C04", 'opacity="0.8"'))


def gem(x, y, s, rot=0, color="lime"):
    """Faceted gem in a gold bezel with a highlight."""
    light, mid, dark = ("#FBFFD0", "#ECFE46", "#6E7D00") if color == "lime" else ("#FFFFFF", "#F4E7C0", "#8A6219")
    return (f'<g transform="translate({x} {y}) rotate({rot})" filter="url(#sp-shadow)">'
            f'<circle r="{s*1.32}" fill="url(#sp-goldv)" stroke="#3A2806" stroke-width="0.6"/>'
            f'<polygon points="0,{-s} {s*0.87},{-s*0.5} {s*0.87},{s*0.5} 0,{s} {-s*0.87},{s*0.5} {-s*0.87},{-s*0.5}" fill="{mid}"/>'
            f'<polygon points="0,{-s} {s*0.87},{-s*0.5} 0,0" fill="{light}"/>'
            f'<polygon points="{-s*0.87},{-s*0.5} 0,{-s} 0,0" fill="{mid}" opacity="0.85"/>'
            f'<polygon points="0,0 {s*0.87},{s*0.5} 0,{s}" fill="{dark}"/>'
            f'<polygon points="0,0 0,{s} {-s*0.87},{s*0.5}" fill="{dark}" opacity="0.7"/>'
            f'<circle cx="{-s*0.3}" cy="{-s*0.45}" r="{s*0.16}" fill="#FFFFFF" class="sp-glint"/></g>')


def filigree(r, n, color="url(#sp-goldv)"):
    """Fine engraved scrolls along the enamel band."""
    out = []
    for i in range(n):
        d = 360 * i / n
        a, b, c = P(r - 3, d - 5), P(r + 3.5, d), P(r - 3, d + 5)
        out.append(f'<path d="M{a[0]} {a[1]} Q{b[0]} {b[1]} {c[0]} {c[1]}" fill="none" stroke="{color}" stroke-width="0.9" stroke-linecap="round"/>')
        e = P(r + 0.5, d + 180 / n)
        out.append(f'<circle cx="{e[0]}" cy="{e[1]}" r="0.9" fill="#E9C46A"/>')
    return "".join(out)


def sheen(r, w, dur_class="sp-sweep"):
    """A polished highlight that travels around the ring."""
    a, b = P(r, -22), P(r, 22)
    return f'<g class="{dur_class}"><path d="M{a[0]} {a[1]} A{r} {r} 0 0 1 {b[0]} {b[1]}" fill="none" stroke="url(#sp-sheen)" stroke-width="{w}" stroke-linecap="round" opacity="0.75"/></g>'


# ---------- общая основа: золотой свет изнутри, готическая полоса с символами, золотой обод ----------
def g_quatrefoil(sz, fill):
    r = sz * 0.36
    return "".join(f'<circle cx="{x*r:.2f}" cy="{y*r:.2f}" r="{r:.2f}" fill="{fill}"/>' for x, y in ((1, 0), (-1, 0), (0, 1), (0, -1))) + f'<rect x="{-r*0.7:.2f}" y="{-r*0.7:.2f}" width="{r*1.4:.2f}" height="{r*1.4:.2f}" fill="#050505" transform="rotate(45)"/><circle r="{r*0.45:.2f}" fill="{fill}"/>'


def g_cross(sz, fill):
    a, b = sz, sz * 0.28
    return (f'<path d="M0 {-a} L{b} {-a*0.55} L{b*0.6} {-b*0.6} L{a*0.55} {-b} L{a} 0 L{a*0.55} {b} L{b*0.6} {b*0.6} L{b} {a*0.55} L0 {a} '
            f'L{-b} {a*0.55} L{-b*0.6} {b*0.6} L{-a*0.55} {b} L{-a} 0 L{-a*0.55} {-b} L{-b*0.6} {-b*0.6} L{-b} {-a*0.55} Z" fill="{fill}"/>')


def g_fleur(sz, fill):
    s_ = sz
    return (f'<path d="M0 {-s_} Q{s_*0.38} {-s_*0.35} {s_*0.12} {s_*0.15} L{-s_*0.12} {s_*0.15} Q{-s_*0.38} {-s_*0.35} 0 {-s_} Z" fill="{fill}"/>'
            f'<path d="M{-s_*0.12} {s_*0.05} Q{-s_*0.9} {-s_*0.1} {-s_*0.7} {-s_*0.6} Q{-s_*0.45} {-s_*0.15} {-s_*0.1} {s_*0.25} Z" fill="{fill}"/>'
            f'<path d="M{s_*0.12} {s_*0.05} Q{s_*0.9} {-s_*0.1} {s_*0.7} {-s_*0.6} Q{s_*0.45} {-s_*0.15} {s_*0.1} {s_*0.25} Z" fill="{fill}"/>'
            f'<rect x="{-s_*0.45}" y="{s_*0.22}" width="{s_*0.9}" height="{s_*0.18}" fill="{fill}"/>'
            f'<path d="M0 {s_*0.4} L{-s_*0.18} {s_*0.95} L{s_*0.18} {s_*0.95} Z" fill="{fill}"/>')


def g_trefoil(sz, fill):
    r = sz * 0.34
    return "".join(f'<circle cx="{r*math.cos(math.radians(a)):.2f}" cy="{r*math.sin(math.radians(a)):.2f}" r="{r*0.95:.2f}" fill="{fill}"/>' for a in (-90, 30, 150)) + f'<circle r="{r*0.5:.2f}" fill="#050505"/>'


def gothic_band(r_in, r_out, n=16):
    """Inner edge: black band between gold lines, gothic symbols set radially, small rivets between."""
    mid = (r_in + r_out) / 2
    w = r_out - r_in
    out = [ring(mid, w, "#070707"), ring(r_in, 1.1, "url(#sp-goldv)"), ring(r_out, 1.1, "url(#sp-goldv)")]
    glyphs = [g_cross, g_quatrefoil, g_fleur, g_trefoil]
    for i in range(n):
        d = 360 * i / n
        x, y = P(mid, d)
        out.append(f'<g transform="translate({x} {y}) rotate({d})" class="sp-rune" style="animation-delay:{(i*0.25)%4:.2f}s">{glyphs[i % 4](w*0.36, "url(#sp-goldv)")}</g>')
        rx, ry = P(mid, d + 180 / n)
        out.append(f'<circle cx="{rx}" cy="{ry}" r="0.8" fill="#E9C46A" opacity="0.8"/>')
    return "".join(out)


def golden_core():
    """Golden light from within: a warm glow over the avatar edge that slowly breathes."""
    return (f'<g filter="url(#sp-bloom)" class="sp-throb">{ring(AV + 1, 7, "#FFD36B", "opacity=\"0.85\"")}</g>'
            f'{ring(AV + 0.6, 1.2, "#FFF1B8", "opacity=\"0.9\"")}')


def lightning_band(r_in, r_out, n=7):
    """Narrow band between avatar and outer ring: lightning crackles along it and flashes."""
    out = [ring((r_in + r_out) / 2, r_out - r_in, "#0A0408"), ring(r_in, 1, "url(#sp-goldv)"), ring(r_out, 1, "url(#sp-goldv)")]
    import random
    rnd = random.Random(7)
    for i in range(n):
        start = i * 360 / n + rnd.uniform(-10, 10)
        span = rnd.uniform(28, 46)
        pts = []
        for k in range(15):
            d = start + span * k / 14
            r = r_in + 1.5 + rnd.uniform(0, r_out - r_in - 3)
            pts.append("%.1f,%.1f" % P(r, d))
        branch = []
        bd = start + span * rnd.uniform(0.3, 0.7)
        for k in range(5):
            r = r_in + 1.5 + rnd.uniform(0, r_out - r_in - 3)
            branch.append("%.1f,%.1f" % P(r, bd + k * 2.2))
        delay = (i * 0.47) % 2.6
        out.append(f'<g class="sp-shimmer" style="animation-delay:{delay:.2f}s" filter="url(#sp-glow)">'
                   f'<polyline points="{" ".join(pts)}" fill="none" stroke="#ECFE46" stroke-width="1.6" stroke-linejoin="round"/>'
                   f'<polyline points="{" ".join(pts)}" fill="none" stroke="#FFFFFF" stroke-width="0.6" stroke-linejoin="round"/>'
                   f'<polyline points="{" ".join(branch)}" fill="none" stroke="#F4FF9A" stroke-width="0.5"/></g>')
    return "".join(out)


def text_band(r_in, r_out, text):
    """Black band with a gothic (blackletter) inscription running around it."""
    mid = (r_in + r_out) / 2
    pid = "sp-inscription"
    circle = f'M0 {-mid} A{mid} {mid} 0 1 1 -0.01 {-mid}'
    return (ring(mid, r_out - r_in, "#070707") + ring(r_in, 1.1, "url(#sp-goldv)") + ring(r_out, 1.1, "url(#sp-goldv)")
            + f'<path id="{pid}" d="{circle}" fill="none"/>'
            + f'<text font-family="UnifrakturMaguntia, serif" font-size="{(r_out-r_in)*0.74:.1f}" fill="url(#sp-goldv)" dy="{(r_out-r_in)*0.27:.1f}">'
            + f'<textPath href="#{pid}" startOffset="0" textLength="{2*math.pi*mid - 2:.1f}" lengthAdjust="spacing">{text}</textPath></text>')


def skull_glyph(sz, fill):
    s_ = sz
    return (f'<path d="M{-s_*0.8} {-s_*0.15} Q{-s_*0.8} {-s_} 0 {-s_} Q{s_*0.8} {-s_} {s_*0.8} {-s_*0.15} Q{s_*0.8} {s_*0.3} {s_*0.45} {s_*0.4} L{s_*0.45} {s_*0.8} L{-s_*0.45} {s_*0.8} L{-s_*0.45} {s_*0.4} Q{-s_*0.8} {s_*0.3} {-s_*0.8} {-s_*0.15} Z" fill="{fill}"/>'
            f'<circle cx="{-s_*0.33}" cy="{-s_*0.18}" r="{s_*0.23}" fill="#070707"/><circle cx="{s_*0.33}" cy="{-s_*0.18}" r="{s_*0.23}" fill="#070707"/>'
            f'<path d="M0 {s_*0.12} L{-s_*0.1} {s_*0.32} L{s_*0.1} {s_*0.32} Z" fill="#070707"/>')


def bones_glyph(sz, fill):
    s_ = sz
    one = lambda rot: (f'<g transform="rotate({rot})"><rect x="{-s_*0.12}" y="{-s_*0.8}" width="{s_*0.24}" height="{s_*1.6}" fill="{fill}"/>'
                       + "".join(f'<circle cx="{x*s_*0.14}" cy="{y*s_*0.82}" r="{s_*0.17}" fill="{fill}"/>' for x in (-1, 1) for y in (-1, 1)) + '</g>')
    return one(45) + one(-45)


def ossuary_band(r_in, r_out, n=14):
    """Matte band with small skulls alternating with crossed bones (Banner)."""
    mid = (r_in + r_out) / 2
    w = r_out - r_in
    out = [ring(mid, w, "#151513"), ring(r_in, 1.1, "url(#sp-bronze)"), ring(r_out, 1.1, "url(#sp-bronze)")]
    for i in range(n):
        d = 360 * i / n
        x, y = P(mid, d)
        glyph = skull_glyph(w * 0.34, "#D9D2BC") if i % 2 == 0 else bones_glyph(w * 0.34, "#BDB49A")
        out.append(f'<g transform="translate({x} {y}) rotate({d})">{glyph}</g>')
    return "".join(out)


def base(outer=AV + 16, band="gothic", glow=True, metal="url(#sp-goldv)"):
    parts = []
    if glow:
        parts.append(golden_core())
    if band == "gothic":
        parts.append(gothic_band(AV + 2.5, AV + 12.5))
    elif band == "lightning":
        parts.append(lightning_band(AV + 2.5, AV + 12.5))
    elif band == "text":
        parts.append(text_band(AV + 2.5, AV + 16.5, "The Imperium Will Live Forever ✠ The Imperium Will Live Forever ✠ "))
    elif band == "ossuary":
        parts.append(ossuary_band(AV + 2.5, AV + 12.5))
    parts.append(bevel_ring(outer, 3.6, metal, "url(#sp-goldd)" if glow else "url(#sp-bronzed)"))
    if glow:
        parts.append(sheen(outer, 3.6))
    return parts


# ---------- Пламя варпа: живой огонь, вспышки, искры ----------
def tongue(deg, r0, h, w, delay, layer):
    fill = {"outer": "#9DB300", "mid": "#ECFE46", "core": "#FFFBE0"}[layer]
    op = {"outer": 0.55, "mid": 0.85, "core": 0.95}[layer]
    sk = 8 if (int(deg) // 15) % 2 else -8
    return (f'<g transform="rotate({deg}) translate(0 {-r0})"><path class="sp-fire" style="animation-delay:{delay:.2f}s" '
            f'd="M{-w} 0 C{-w} {-h*0.4} {-w*0.2} {-h*0.55} {w*0.15*sk/8} {-h} C{w*0.35} {-h*0.6} {w} {-h*0.35} {w} 0 Z" fill="{fill}" opacity="{op}"/></g>')


def warp_flame():
    """Warp storm: turbulent magenta clouds radiating behind the avatar, swirling slowly; lightning in the storm."""
    g = []
    storm = (f'<circle r="{AV+62}" fill="url(#sp-storm-outer)"/>'
             + "".join(f'<ellipse cx="0" cy="{-(AV+26 + (i % 3) * 6)}" rx="{8 + (i % 3) * 4}" ry="{30 + (i % 4) * 9}" fill="url(#sp-storm-ray)" transform="rotate({i*15 + (i % 2) * 6})" opacity="{0.5 + (i % 3) * 0.17:.2f}"/>' for i in range(24))
             + f'<circle r="{AV+20}" fill="url(#sp-storm-inner)"/>')
    g.append(f'<g mask="url(#sp-fade)"><g filter="url(#sp-turb)"><g class="af-spin">{storm}</g></g></g>')
    g.append(f'<g filter="url(#sp-turb2)" opacity="0.8"><g class="af-spin-rev"><circle r="{AV+44}" fill="url(#sp-storm-veil)"/></g></g>')
    # sparks
    for i in range(14):
        d = i * 25.7 + 9
        x, y = P(AV + 28 + (i % 4) * 5, d)
        g.append(f'<circle class="sp-drift" style="animation-delay:{(i * 0.31) % 2.4:.2f}s;--dx:{math.cos(math.radians(d-90))*10:.1f}px;--dy:{math.sin(math.radians(d-90))*10:.1f}px" cx="{x}" cy="{y}" r="{0.9 + (i % 3) * 0.45:.1f}" fill="#F8FFD6" filter="url(#sp-glow)"/>')
    g.append(FRONT)
    g += base(band="lightning")
    return g


# ---------- Корона клуба: готическая корона, парит над рамкой ----------
def kings_crown(cx, cy, s):
    """Antique king's crown after the owner's reference: blackened gold, five spear points with diamond insets
    (centre tallest, outer two curved like horns), gold scrollwork on the body, a studded band."""
    gold, ink = "url(#sp-goldv)", "#140F06"
    o = []
    def spear(x, h, w, curve=0.0):
        # spear point rising from the body; curve bends the outer points outward like horns
        X = cx + x * s
        top = (X + curve * s, cy - h * s)
        return (f'<path d="M{X - w*s:.1f} {cy - 0.42*s:.1f} Q{X - w*s*0.9 + curve*s*0.4:.1f} {cy - h*s*0.62:.1f} {X - w*s*0.35 + curve*s*0.8:.1f} {cy - h*s*0.8:.1f} '
                f'L{top[0]:.1f} {top[1]:.1f} L{X + w*s*0.35 + curve*s*0.8:.1f} {cy - h*s*0.8:.1f} Q{X + w*s*0.9 + curve*s*0.4:.1f} {cy - h*s*0.62:.1f} {X + w*s:.1f} {cy - 0.42*s:.1f} Z" '
                f'fill="url(#sp-patina)" stroke="{gold}" stroke-width="{s*0.045:.2f}" stroke-linejoin="round"/>'
                f'<path d="M{X + curve*s*0.75:.1f} {cy - h*s*0.86:.1f} L{X + w*s*0.22 + curve*s*0.7:.1f} {cy - h*s*0.72:.1f} L{X + curve*s*0.62:.1f} {cy - h*s*0.58:.1f} L{X - w*s*0.22 + curve*s*0.7:.1f} {cy - h*s*0.72:.1f} Z" '
                f'fill="none" stroke="{gold}" stroke-width="{s*0.03:.2f}"/>')
    o.append(spear(-1.0, 0.95, 0.12, -0.18))
    o.append(spear(1.0, 0.95, 0.12, 0.18))
    o.append(spear(-0.56, 1.22, 0.15))
    o.append(spear(0.56, 1.22, 0.15))
    o.append(spear(0, 1.62, 0.2))
    # body: dark plate with a scalloped top between the points
    o.append(f'<path d="M{cx-1.08*s:.1f} {cy+0.05*s:.1f} L{cx-1.06*s:.1f} {cy-0.42*s:.1f} Q{cx-0.8*s:.1f} {cy-0.3*s:.1f} {cx-0.66*s:.1f} {cy-0.5*s:.1f} '
             f'Q{cx-0.36*s:.1f} {cy-0.32*s:.1f} {cx-0.2*s:.1f} {cy-0.62*s:.1f} Q{cx:.1f} {cy-0.5*s:.1f} {cx+0.2*s:.1f} {cy-0.62*s:.1f} Q{cx+0.36*s:.1f} {cy-0.32*s:.1f} {cx+0.66*s:.1f} {cy-0.5*s:.1f} '
             f'Q{cx+0.8*s:.1f} {cy-0.3*s:.1f} {cx+1.06*s:.1f} {cy-0.42*s:.1f} L{cx+1.08*s:.1f} {cy+0.05*s:.1f} Z" fill="url(#sp-patina)" stroke="{gold}" stroke-width="{s*0.045:.2f}" stroke-linejoin="round"/>')
    # scrollwork: mirrored C/S scrolls in raised gold
    def scroll(sx):
        f = lambda x: cx + sx * x * s
        return (f'<path d="M{f(0.08):.1f} {cy-0.1*s:.1f} C{f(0.08):.1f} {cy-0.36*s:.1f} {f(0.34):.1f} {cy-0.4*s:.1f} {f(0.36):.1f} {cy-0.2*s:.1f} C{f(0.38):.1f} {cy-0.06*s:.1f} {f(0.22):.1f} {cy-0.04*s:.1f} {f(0.22):.1f} {cy-0.16*s:.1f}" fill="none" stroke="{gold}" stroke-width="{s*0.05:.2f}" stroke-linecap="round"/>'
                f'<path d="M{f(0.42):.1f} {cy-0.02*s:.1f} C{f(0.5):.1f} {cy-0.3*s:.1f} {f(0.78):.1f} {cy-0.32*s:.1f} {f(0.8):.1f} {cy-0.16*s:.1f} C{f(0.82):.1f} {cy-0.04*s:.1f} {f(0.66):.1f} {cy-0.02*s:.1f} {f(0.68):.1f} {cy-0.13*s:.1f}" fill="none" stroke="{gold}" stroke-width="{s*0.045:.2f}" stroke-linecap="round"/>'
                f'<path d="M{f(0.36):.1f} {cy-0.2*s:.1f} Q{f(0.5):.1f} {cy-0.5*s:.1f} {f(0.62):.1f} {cy-0.46*s:.1f}" fill="none" stroke="{gold}" stroke-width="{s*0.03:.2f}" stroke-linecap="round"/>')
    o.append(scroll(-1) + scroll(1))
    o.append("".join(f'<circle cx="{cx:.1f}" cy="{cy - y*s:.1f}" r="{s*0.04:.2f}" fill="{gold}"/>' for y in (0.36, 0.48, 0.6, 0.72)))
    o.append(f'<circle cx="{cx:.1f}" cy="{cy-0.14*s:.1f}" r="{s*0.07:.2f}" fill="{gold}"/>')
    # band: studs top and bottom rows, small pointed arch in the centre
    o.append(f'<path d="M{cx-1.1*s:.1f} {cy+0.02*s:.1f} Q{cx:.1f} {cy+0.14*s:.1f} {cx+1.1*s:.1f} {cy+0.02*s:.1f} L{cx+1.08*s:.1f} {cy+0.34*s:.1f} Q{cx:.1f} {cy+0.48*s:.1f} {cx-1.08*s:.1f} {cy+0.34*s:.1f} Z" fill="url(#sp-patina)" stroke="{gold}" stroke-width="{s*0.05:.2f}"/>')
    for k in range(17):
        t = -1 + k / 8
        yb = cy + 0.08 * s + 0.11 * s * (1 - t * t)
        o.append(f'<circle cx="{cx + t*s:.1f}" cy="{yb + 0.17*s:.1f}" r="{s*0.045:.2f}" fill="{gold}"/>')
        if k % 2 == 0:
            o.append(f'<circle cx="{cx + t*s:.1f}" cy="{yb + 0.04*s:.1f}" r="{s*0.035:.2f}" fill="{gold}"/>')
    o.append(f'<path d="M{cx-0.09*s:.1f} {cy+0.22*s:.1f} L{cx-0.09*s:.1f} {cy+0.1*s:.1f} Q{cx:.1f} {cy-0.02*s:.1f} {cx+0.09*s:.1f} {cy+0.1*s:.1f} L{cx+0.09*s:.1f} {cy+0.22*s:.1f} Z" fill="{gold}" stroke="{ink}" stroke-width="0.4"/>')
    return f'<g filter="url(#sp-shadow)">{"".join(o)}</g>'


def club_crown():
    g = [f'<circle r="{AV+60}" fill="url(#sp-aura-gold-strong)" class="af-breathe"/>',
         f'<g filter="url(#sp-bloom)" class="sp-throb">{ring(AV + 10, 26, "#FFD36B", "opacity=\"0.55\"")}</g>']
    g.append(FRONT)
    g += base(AV + 20, band="text")
    cx, cy = P(AV + 28, 0)
    g.append(f'<ellipse class="sp-throb" cx="{cx}" cy="{cy+12}" rx="36" ry="6" fill="#FFD36B" filter="url(#sp-bloom)" opacity="0.7"/>')
    g.append(f'<g class="sp-float">{kings_crown(cx, cy, 33)}</g>')
    return g


def metal_leaf(x, y, rot, length, fill):
    return (f'<g transform="translate({x} {y}) rotate({rot})">'
            f'<path d="M0 0 Q{length*0.42} {-length*0.36} {length} 0 Q{length*0.42} {length*0.36} 0 0 Z" fill="{fill}" stroke="#2A1C04" stroke-width="0.7"/>'
            f'<path d="M1 0 L{length*0.86} 0" stroke="#3A2806" stroke-width="0.5" opacity="0.6"/></g>')


def wreath_crown(cx, cy, r):
    """Laurel wreath (upper arc), seen from the front, floating."""
    out = []
    for side in (-1, 1):
        for i in range(9):
            t = i / 8
            d = side * (12 + t * 80)
            x, y = cx + r * math.sin(math.radians(d)), cy - r * math.cos(math.radians(d)) * 0.42
            rot = 90 + d * 0.9 if side > 0 else -90 + d * 0.9
            ln = 17 - t * 5
            out.append(metal_leaf(x, y, rot - side * 35 + (180 if side < 0 else 0), ln, "url(#sp-leafl)" if i % 3 == 0 else "url(#sp-leaf)"))
            out.append(metal_leaf(x, y, rot + side * 35 + (180 if side < 0 else 0), ln * 0.85, "url(#sp-leaf)"))
    out.append(f'<circle cx="{cx}" cy="{cy - r*0.42 - 1}" r="3.2" fill="url(#sp-goldv)" stroke="#2A1C04" stroke-width="0.5"/>')
    return "".join(out)


def banner():
    """Club standard: a pole planted diagonally across the avatar, a large black banner with the logo and name
    waving on the right; skulls and bones on the inner band; matte, no glow; floating laurel wreath on top."""
    g = []
    # pole behind the avatar: planted at the lower left, rising to the upper right
    x0, y0, x1, y1 = -92, 86, 86, -96
    g.append(f'<g filter="url(#sp-shadow)"><line x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" stroke="url(#sp-pole)" stroke-width="4.2" stroke-linecap="round"/>'
             f'<path d="M{x1+1} {y1-1} L{x1+11} {y1-14} L{x1+5} {y1+3} Z" fill="url(#sp-bronze)" stroke="#2A1C04" stroke-width="0.6"/>'
             f'<circle cx="{x1-2}" cy="{y1+2}" r="3" fill="url(#sp-bronze)" stroke="#2A1C04" stroke-width="0.5"/></g>')
    # long straight rectangular banner: hoist edge along the pole near the top, flying out to the lower right;
    # local frame: x — away from the pole, y — down along the pole; the cloth waves (SMIL)
    L, H = 100, 50
    ang = math.degrees(math.atan2(y0 - y1, x0 - x1)) - 90  # rotate local +y onto the pole (top → bottom)
    hx, hy = x1 - 0.08 * (x1 - x0), y1 - 0.08 * (y1 - y0)  # hoist starts a bit below the tip
    N, K = 16, 24  # points along the length, keyframes
    lam = L * 0.9   # wavelength
    def wave(x, ph, A=4.2):
        # amplitude grows from the hoist (fixed) to the free edge; wave travels outward
        return A * (x / L) ** 1.2 * math.sin(2 * math.pi * x / lam - ph)
    def cloth(ph):
        top = " ".join(f"L{L*k/N:.1f} {wave(L*k/N, ph):.2f}" for k in range(1, N + 1))
        bot = " ".join(f"L{L*k/N - 1.5*(k/N)**2:.1f} {H + wave(L*k/N, ph + 0.35):.2f}" for k in range(N, -1, -1))
        return f"M0 0 {top} {bot} Z"
    phases = [2 * math.pi * t / K for t in range(K + 1)]
    frames = ";".join(cloth(p) for p in phases)
    # folds: light and dark strips that follow the wave slope
    strips = []
    for k in range(1, N):
        x0_, x1_ = L * k / N, L * (k + 1) / N
        def strip(ph):
            return (f"M{x0_:.1f} {wave(x0_, ph):.2f} L{x1_:.1f} {wave(x1_, ph):.2f} L{x1_:.1f} {H + wave(x1_, ph + 0.35):.2f} L{x0_:.1f} {H + wave(x0_, ph + 0.35):.2f} Z")
        slope = lambda ph: (wave(x1_, ph) - wave(x0_, ph)) / (x1_ - x0_)
        ops = ";".join(f"{max(0.0, min(0.42, slope(p) * 0.9)):.2f}" for p in phases)
        lops = ";".join(f"{max(0.0, min(0.22, -slope(p) * 0.6)):.2f}" for p in phases)
        sd = ";".join(strip(p) for p in phases)
        strips.append(f'<path d="{strip(0)}" fill="#000"><animate attributeName="d" dur="3.6s" repeatCount="indefinite" values="{sd}"/><animate attributeName="opacity" dur="3.6s" repeatCount="indefinite" values="{ops}"/></path>'
                      f'<path d="{strip(0)}" fill="#FFFFFF"><animate attributeName="d" dur="3.6s" repeatCount="indefinite" values="{sd}"/><animate attributeName="opacity" dur="3.6s" repeatCount="indefinite" values="{lops}"/></path>')
    def logo_on_flag():
        # mini-logo printed on the cloth, upright on screen, moving with the wave at its position
        lx, ly, w = L * 0.56, H * 0.5, 36.0
        sc = w / 657.12
        hgt = 550.63 * sc
        ys = ";".join(f"0 {wave(lx, p) * 0.9 + 0.0:.2f}" for p in phases)
        return (f'<g><animateTransform attributeName="transform" type="translate" dur="3.6s" repeatCount="indefinite" values="{ys}"/>'
                f'<g transform="translate({lx:.1f} {ly:.1f}) rotate({-ang:.1f}) translate({-w/2:.1f} {-hgt/2:.1f}) scale({sc:.5f})">'
                f'<path d="{LOGO_D}" fill="#111110"/></g></g>')

    g.append(f'<g transform="translate({hx:.1f} {hy:.1f}) rotate({ang:.1f})" filter="url(#sp-shadow)">'
             f'<path d="{cloth(0)}" fill="url(#sp-cloth-flag)" stroke="#111110" stroke-width="1.6" stroke-linejoin="round">'
             f'<animate attributeName="d" dur="3.6s" repeatCount="indefinite" values="{frames}"/></path>'
             + "".join(strips)
             + logo_on_flag() +
             '</g>')
    g.append(f'<g filter="url(#sp-mist)" opacity="0.75"><g class="sp-drift-x"><ellipse cx="-10" cy="{AV+22}" rx="120" ry="26" fill="url(#sp-fog)"/><ellipse cx="40" cy="{AV+4}" rx="90" ry="18" fill="url(#sp-fog)" opacity="0.7"/></g></g>')
    g.append(FRONT)
    g += base(band="ossuary", glow=False, metal="url(#sp-bronze)")
    g.append(f'<g filter="url(#sp-mist)" opacity="0.55"><g class="sp-drift-x2"><ellipse cx="10" cy="{AV+30}" rx="110" ry="16" fill="url(#sp-fog)"/></g></g>')
    # floating laurel wreath above the frame: larger and crisp
    g.append(f'<g class="sp-float">{wreath_crown(0, -(AV + 30), 40)}</g>')
    return g


SUPPORTERS = [
    ("flame", "Пламя варпа", "Буря варпа: клубящаяся зелёная энергия расходится за аватаром, в узком кольце переливаются молнии, искры", warp_flame),
    ("crown", "Корона клуба", "Старинная королевская корона из чернёного золота парит над рамкой; готическая надпись по кольцу; пульсирующее сияние", club_crown),
    ("banner", "Знамя", "Лаймовое знамя с мини-логотипом клуба плавно развевается за аватаром, внизу стелется туман; черепа и кости по кольцу; лавровый венок", banner),
]

SCSS = """
@keyframes sp-sweep{to{transform:rotate(360deg)}}
@keyframes sp-throb{0%,100%{opacity:.75}50%{opacity:1}}
@keyframes sp-current{to{stroke-dashoffset:-76}}
@keyframes sp-drift{0%{transform:translate(0,0);opacity:0}25%{opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}
@keyframes sp-glint{0%,70%,100%{opacity:.35}80%{opacity:1}}
@keyframes sp-fire{0%,100%{transform:scaleY(1) skewX(0)}25%{transform:scaleY(1.18) skewX(4deg)}50%{transform:scaleY(.86) skewX(-3deg)}75%{transform:scaleY(1.08) skewX(2deg)}}
@keyframes sp-flash{0%,82%,100%{opacity:0;transform:scale(.4)}88%{opacity:1;transform:scale(1.15)}94%{opacity:.4;transform:scale(1)}}
@keyframes sp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes sp-banner{0%,100%{transform:skewX(0)}50%{transform:skewX(1.2deg)}}
@keyframes sp-rune{0%,100%{opacity:.75}50%{opacity:1}}
@keyframes sp-wave{0%,100%{transform:translateY(0)}50%{transform:translateY(1.2px)}}
.sp-sweep{animation:sp-sweep 6s cubic-bezier(.45,0,.55,1) infinite;transform-origin:0 0;transform-box:view-box}
.sp-throb{animation:sp-throb 2.6s ease-in-out infinite}
.sp-current{animation:sp-current 2.4s linear infinite}
.sp-drift{animation:sp-drift 2.4s ease-out infinite}
.sp-glint{animation:sp-glint 4s ease-in-out infinite}
.sp-fire{animation:sp-fire 1.3s ease-in-out infinite;transform-origin:center bottom;transform-box:fill-box}
.sp-flash{animation:sp-flash 3.3s ease-out infinite;transform-origin:center;transform-box:fill-box}
.sp-float{animation:sp-float 3.4s ease-in-out infinite}
.sp-banner{animation:sp-banner 5s ease-in-out infinite;transform-origin:50% 0;transform-box:fill-box}
.sp-flag{animation:sp-flag 3.6s ease-in-out infinite;transform-origin:0 0;transform-box:view-box}
@keyframes sp-flag{0%,100%{transform:skewY(0)}50%{transform:skewY(-2.5deg)}}
.sp-shimmer{animation:sp-shimmer 1.8s ease-in-out infinite}
@keyframes sp-shimmer{0%,100%{opacity:.55}25%{opacity:1}40%{opacity:.75}60%{opacity:1}80%{opacity:.65}}
.sp-glowpulse{animation:sp-glowpulse 3s ease-in-out infinite;transform-origin:0 0;transform-box:view-box}
@keyframes sp-glowpulse{0%,100%{opacity:.6;transform:scale(.97)}50%{opacity:1;transform:scale(1.04)}}
.sp-bolt{animation:sp-bolt 2.6s steps(1,end) infinite}
@keyframes sp-bolt{0%,100%{opacity:0}6%{opacity:1}9%{opacity:.2}12%{opacity:1}20%{opacity:0}}
.sp-drift-x{animation:sp-drift-x 9s ease-in-out infinite}
.sp-drift-x2{animation:sp-drift-x 7s ease-in-out infinite reverse}
@keyframes sp-drift-x{0%,100%{transform:translateX(-10px)}50%{transform:translateX(12px)}}
.sp-rune{animation:sp-rune 4s ease-in-out infinite}
.sp-wave{animation:sp-wave 3.2s ease-in-out infinite}
"""


FRONT = "<!--FRONT-->"


def split(parts):
    """Layers: everything before FRONT is drawn behind the avatar, the rest over it."""
    if FRONT in parts:
        k = parts.index(FRONT)
        return "".join(parts[:k]), "".join(parts[k + 1:])
    return "", "".join(parts)


VIEWBOX = {"flame": (-125, -125, 250, 250), "crown": (-130, -142, 260, 267), "banner": (-125, -125, 300, 250)}


def avatar_svg(parts, size=230, key="flame"):
    back, front = split(parts)
    back, front = (x.replace("__LOGO__", "/_blob/7b582958cfeda80067335cecef6b973f") for x in (back, front))
    vb = VIEWBOX[key]
    return (f'<svg width="{size * vb[2] / vb[3]:.0f}" height="{size}" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" aria-hidden="true" style="margin-right:{-size * (vb[2] - vb[3]) / vb[3]:.0f}px"><defs>{gen.DEFS.replace("<defs>","").replace("</defs>","")}{SDEFS}</defs>'
            f'{back}<circle r="{AV}" fill="#2A2A27"/><text y="12" text-anchor="middle" font-family="Oswald" font-size="34" font-weight="600" fill="#F4F4F0">ИФ</text>{front}</svg>')


def af_css():
    css = gen.CSS
    for c in ["spin-slow", "spin-rev", "spin", "pulse", "twinkle", "breathe", "eyes"]:
        css = re.sub(r"\." + re.escape(c) + r"\{", ".af-" + c + "{", css)
    return css


cells = "".join(
    f'<div style="display:flex;flex-direction:column;align-items:center;gap:10px;width:360px;text-align:center">'
    f'{avatar_svg(fn(), key=key)}'
    f'<span style="display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;background:#ECFE46;color:#101010;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">★ {title}</span>'
    f'<span style="font-size:17px;font-weight:700">Поддерживает клуб</span>'
    f'<span style="font-size:14px;color:#B8B8B0;line-height:1.4;max-width:300px">{sub}</span></div>'
    for key, title, sub, fn in SUPPORTERS
)
html = f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Поддержка клуба</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&amp;family=Oswald:wght@500;600;700&amp;family=UnifrakturMaguntia&amp;display=swap">
<style>{af_css()}{SCSS}</style>
</helmet>
<div style="width:1280px;height:540px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#1b1d0c 0%,#111110 60%);color:#F4F4F0;font-family:'Inter Tight',sans-serif;padding:28px 36px;box-sizing:border-box">
  <div style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#8E8E86">Профиль · особый статус</div>
  <h1 style="margin:6px 0 4px;font-family:Oswald;font-size:34px;font-weight:600;text-transform:uppercase">Поддержка клуба</h1>
  <p style="margin:0 0 18px;font-size:15px;color:#B8B8B0">Три особые рамки для тех, кто поддерживает клуб. Назначает администратор; рамка заменяет рамку ранга, под именем — значок со званием.</p>
  <div style="display:flex;justify-content:space-between">{cells}</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1280,"height":540}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
"""
open("../design/project/Supporter.dc.html", "w").write(html)

# client export (prefix ids, keep af-/sp- classes)
def pref(m):
    for i in ["sp-fog", "sp-mist", "sp-patina", "sp-cloth-flag", "sp-velvet", "sp-fade-g", "sp-fade", "sp-aura-gold-strong", "sp-aura-gold", "sp-cloth-dark", "sp-cloth", "sp-storm-outer", "sp-storm-inner", "sp-storm-ray", "sp-storm-veil", "sp-turb2", "sp-turb", "sp-bronzed", "sp-bronze", "sp-pole", "sp-inscription", "sp-goldv", "sp-goldd", "sp-limev", "sp-enamel", "sp-aura", "sp-core", "sp-sheen", "sp-ribbon-back", "sp-ribbon", "sp-leafl", "sp-leaf", "sp-glow", "sp-bloom", "sp-shadow", "sp-banner-curve"]:
        m = m.replace(f'id="{i}"', f'id="af-{i}"').replace(f"url(#{i})", f"url(#af-{i})").replace(f'href="#{i}"', f'href="#af-{i}"')
    return m
ts = ("// Сгенерировано из макета «Поддержка клуба» (design canvas, 30.10.2026) — не править вручную.\n"
      f"export const SUPPORTER_DEFS = {json.dumps(pref(SDEFS), ensure_ascii=False)};\n\n"
      f"/** viewBox по дизайнам: аватар — круг радиусом {AV} в точке 0,0 */\n"
      f"export const SUPPORTER_VIEWBOX = {json.dumps(VIEWBOX)} as const;\n\n"
      "/** back — под аватаром (стяг), front — поверх краёв аватара */\n"
      "export const SUPPORTER_MARKUP: Record<\"flame\" | \"crown\" | \"banner\", { back: string; front: string }> = "
      + json.dumps({k: dict(zip(("back", "front"), map(pref, split(fn())))) for k, _, _, fn in SUPPORTERS}, ensure_ascii=False, indent=2) + ";\n")
open("supporters.generated.ts", "w").write(ts)
print("supporter ok", len(html), len(ts))
