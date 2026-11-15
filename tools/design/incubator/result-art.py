"""
Картинки существ «Рой: инкубатор» для экрана результата (16.11.2026).

Раньше контур рисовался CSS-фильтром drop-shadow поверх PNG 44×56; в Android WebView (Telegram) фильтр вместе с
image-rendering: pixelated давал чёрный прямоугольник с бежевой рамкой и полосой сбоку. Теперь контур запечён в файл:
существо обрезано по содержимому, обведено бежевым (#f4ecd8) на 1 пиксель исходника и увеличено ×4 без сглаживания.
Исходники для canvas игры (44×56) не меняются.

  python3 tools/design/incubator/result-art.py
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'client', 'public', 'games', 'incubator')
OUT = os.path.join(ROOT, 'result')
OUTLINE = (0xF4, 0xEC, 0xD8, 255)
SCALE = 4

os.makedirs(OUT, exist_ok=True)
for name in sorted(os.listdir(ROOT)):
    if not name.endswith('.png'):
        continue
    src = Image.open(os.path.join(ROOT, name)).convert('RGBA')
    l, t, r, b = src.getbbox()
    body = src.crop((l, t, r, b))
    w, h = body.size
    canvas = Image.new('RGBA', (w + 2, h + 2), (0, 0, 0, 0))
    # контур: 4 соседа (как прежний фильтр), затем само существо поверх
    mask = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    for dx, dy in ((0, 1), (2, 1), (1, 0), (1, 2)):
        mask.paste(body, (dx, dy), body)
    alpha = mask.getchannel('A').point(lambda a: 255 if a else 0)
    canvas.paste(Image.new('RGBA', canvas.size, OUTLINE), (0, 0), alpha)
    canvas.paste(body, (1, 1), body)
    canvas.resize((canvas.width * SCALE, canvas.height * SCALE), Image.NEAREST).save(os.path.join(OUT, name), optimize=True)
    print(name, body.size)
