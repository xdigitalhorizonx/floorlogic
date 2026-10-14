"""QA for the FloorLogic logo build: IoU vs the source raster, browser cross-check, contact sheet.

Called by build.py (or: python -I tools/logo/qa.py --src <png> --work <dir>).
IoU: each SVG is placed back into the 1254x1254 source frame (nested <svg> with the inverse of the
transform the build applied), rasterised 1:1, thresholded at alpha 0.5 and compared with the
source's per-colour coverage >= 0.5 - separately for the mark and the wordmark.
"""
import json
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

import flogo as fl  # noqa: E402

NODE_DIR = os.path.join(HERE, 'node')
CHROME = r'C:/Program Files/Google/Chrome/Application/chrome.exe'
NAVY = '#12233d'


def inner(svg):
    """(viewBox w, h, inner markup) of an SVG file's text."""
    m = re.match(r'<svg[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*>(.*)</svg>$', svg, re.S)
    return float(m.group(1)), float(m.group(2)), m.group(3)


def placed(svg, k, tx, ty, W=1254, H=1254, bg=None):
    """Wrap a file so that its user space maps back onto source pixels (inverse of q = k*p + t)."""
    w, h, body = inner(svg)
    rect = f'<rect width="{W}" height="{H}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">{rect}'
            f'<svg x="{-tx / k}" y="{-ty / k}" width="{w / k}" height="{h / k}" viewBox="0 0 {w} {h}">{body}</svg></svg>')


def box_mask(src, kind, pad=12):
    m = src.mask(kind)
    ys, xs = np.nonzero(m)
    box = np.zeros_like(m)
    box[max(ys.min() - pad, 0):ys.max() + pad + 1, max(xs.min() - pad, 0):xs.max() + pad + 1] = True
    return m, box


def chrome_alpha(svg_text, work, tag):
    """Render inline SVG in headless Chrome on white and on black; recover alpha from the pair."""
    outs = []
    for bg in ('#ffffff', '#000000'):
        html = (f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:{bg}}}'
                f'svg{{display:block;width:1254px;height:1254px}}</style></head><body>{svg_text}</body></html>')
        hp = os.path.join(work, f'chrome-{tag}-{bg[1:]}.html')
        with open(hp, 'w', encoding='utf-8') as f:
            f.write(html)
        out = os.path.join(work, f'chrome-{tag}-{bg[1:]}.png')
        if os.path.exists(out):
            os.remove(out)
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--mute-audio', '--hide-scrollbars',
                        '--force-device-scale-factor=1', '--window-size=1254,1254',
                        f'--user-data-dir={os.path.join(work, "chrome-profile")}', '--no-first-run',
                        f'--screenshot={out}', 'file:///' + hp.replace('\\', '/')],
                       check=True, capture_output=True, timeout=120)
        outs.append(np.asarray(Image.open(out).convert('RGB')).astype(float))
    w, b = outs
    return 1.0 - (w - b).mean(2) / 255.0


def run(src, out, work, node_modules, summary):
    brand = os.path.join(out, 'brand')
    mark_src, mark_box = box_mask(src, 'mark')
    word_src, word_box = box_mask(src, 'word')
    names = sorted(f for f in os.listdir(brand) if f.endswith('.svg'))
    texts = {n: open(os.path.join(brand, n), encoding='utf-8').read() for n in names}
    fav = open(os.path.join(out, 'favicon.svg'), encoding='utf-8').read()

    # ---- static checks ----------------------------------------------------------------------
    problems = []
    ids = {}
    for n, t in list(texts.items()) + [('favicon.svg', fav)]:
        if re.search(r'<(image|text|font|foreignObject)\b|@font-face|font-family|base64', t):
            problems.append(f'{n}: raster/font content')
        if '<title' not in t:
            problems.append(f'{n}: no <title>')
        if len(t.encode()) >= 12 * 1024:
            problems.append(f'{n}: {len(t.encode())} B >= 12 KB')
        for i in re.findall(r'id="([^"]+)"', t):
            if i in ids:
                problems.append(f'id {i} repeated in {ids[i]} and {n}')
            ids[i] = n
        for ref in re.findall(r'url\(#([^)]+)\)', t):
            if not re.search(r'<linearGradient id="' + re.escape(ref) + '"', t):
                problems.append(f'{n}: url(#{ref}) does not point at a gradient')

    # ---- IoU (resvg) ------------------------------------------------------------------------
    jobs, keys = [], []
    for n in names:
        lay = summary['layouts'][n]
        for part in ('mark', 'word'):
            if part in lay:
                t = lay[part]
                jobs.append(dict(svgText=placed(texts[n], t['k'], t['tx'], t['ty']),
                                 out=os.path.join(work, f'qa-{n[:-4]}-{part}.png'), width=1254))
                keys.append((n, part))
    fl_ = summary['favicon_layout']
    jobs.append(dict(svgText=placed(fav, fl_['k'], fl_['tx'], fl_['ty']), out=os.path.join(work, 'qa-favicon-mark.png'),
                     width=1254))
    keys.append(('favicon.svg', 'mark'))
    outs = fl.resvg_render(jobs, work, node_modules, NODE_DIR, tag='qa')
    rows = {}
    for (n, part), o in zip(keys, outs):
        a = fl.png_alpha(o) >= 0.5
        if part == 'mark':
            v = fl.iou(a & mark_box, mark_src)
        else:
            v = fl.iou(a & word_box, word_src)
        rows.setdefault(n, {})[part] = v

    # ---- browser cross-check (Chrome renders the same wrappers) ----------------------------
    chrome = {}
    if os.path.exists(CHROME):
        for n in ('floorlogic-lockup-stacked.svg', 'floorlogic-lockup-horizontal-reversed.svg'):
            lay = summary['layouts'][n]
            res = {}
            for part in ('mark', 'word'):
                t = lay[part]
                al = chrome_alpha(placed(texts[n], t['k'], t['tx'], t['ty']), work, f'{n[:-4]}-{part}') >= 0.5
                res[part] = fl.iou(al & (mark_box if part == 'mark' else word_box),
                                   mark_src if part == 'mark' else word_src)
            chrome[n] = res

    print('\nQA - IoU vs source (binarised at 50% coverage, source scale)')
    print(f"{'file':44s} {'bytes':>6s} {'mark':>7s} {'word':>7s}")
    for n in names + ['favicon.svg']:
        size = len((texts.get(n) or fav).encode())
        r = rows.get(n, {})
        print(f"{n:44s} {size:6d} {r.get('mark', float('nan')):7.4f} {r.get('word', float('nan')):7.4f}")
    for n, r in chrome.items():
        print(f"chrome cross-check {n}: mark {r['mark']:.4f} word {r['word']:.4f}")
    print('static checks:', 'OK' if not problems else problems)

    sheet = contact_sheet(src, out, work, node_modules, texts, fav, summary)
    browser = browser_page(out, work) if os.path.exists(CHROME) else None
    report = dict(browser_check=browser, iou=rows, chrome=chrome, problems=problems, contact_sheet=sheet,
                  sizes={n: len(t.encode()) for n, t in texts.items()})
    with open(os.path.join(work, 'qa-report.json'), 'w') as f:
        json.dump(report, f, indent=1)
    print('contact sheet:', sheet)
    return report


def browser_page(out, work):
    """Every shipped file as a plain <img> in headless Chrome (white + navy), screenshot for review."""
    u = lambda p: 'file:///' + os.path.join(out, p).replace(os.sep, '/')
    cell = 'display:inline-block;margin:10px;padding:14px;vertical-align:top'
    rows = [
        ('#ffffff', [('brand/floorlogic-lockup-stacked.svg', 'height:220px'), ('brand/floorlogic-mark.svg', 'height:220px'),
                     ('brand/floorlogic-lockup-horizontal.svg', 'height:40px'), ('favicon.svg', 'height:32px'),
                     ('favicon.svg', 'height:16px'), ('apple-touch-icon.png', 'height:90px'), ('icon-192.png', 'height:96px')]),
        ('#12233d', [('brand/floorlogic-lockup-stacked-reversed.svg', 'height:220px'),
                     ('brand/floorlogic-mark-reversed.svg', 'height:220px'),
                     ('brand/floorlogic-lockup-horizontal-reversed.svg', 'height:40px')]),
    ]
    html = ['<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#e9ecf1;'
            'font:14px Segoe UI,Arial}</style></head><body>']
    for bg, items in rows:
        html.append(f'<div style="background:{bg};padding:8px">')
        html += [f'<div style="{cell}"><img src="{u(p)}" style="{st};display:block" alt="FloorLogic"></div>' for p, st in items]
        html.append('</div>')
    html.append('</body></html>')
    hp = os.path.join(work, 'browser-check.html')
    with open(hp, 'w', encoding='utf-8') as f:
        f.write(''.join(html))
    png = os.path.join(work, 'browser-check.png')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--mute-audio', '--hide-scrollbars',
                    '--force-device-scale-factor=1', '--window-size=1500,640',
                    f'--user-data-dir={os.path.join(work, "chrome-profile")}', '--no-first-run',
                    '--allow-file-access-from-files', f'--screenshot={png}', 'file:///' + hp.replace(os.sep, '/')],
                   check=True, capture_output=True, timeout=120)
    return png


# ----------------------------------------------------------------------------------------------
def _font(size):
    for p in ('C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def _dark_favicon(fav):
    m = re.search(r'@media\(prefers-color-scheme:dark\)\{(.*?)\}</style>', fav)
    return fav.replace(m.group(0), m.group(1) + '</style>')


def contact_sheet(src, out, work, node_modules, texts, fav, summary):
    R = lambda name: os.path.join(work, f'sheet-{name}.png')
    lay = summary['layouts']
    st = lay['floorlogic-lockup-stacked.svg']['word']
    hz = lay['floorlogic-lockup-horizontal.svg']['size']
    jobs = [
        dict(svgText=placed(texts['floorlogic-lockup-stacked.svg'], 1, st['tx'], st['ty'], bg='#fff'),
             out=R('stacked512'), width=512),
        dict(svg=os.path.join(out, 'brand', 'floorlogic-mark.svg'), out=R('mark512'), height=512, background='#fff'),
        dict(svg=os.path.join(out, 'brand', 'floorlogic-lockup-horizontal.svg'), out=R('h40'), height=40, background='#fff'),
        dict(svg=os.path.join(out, 'brand', 'floorlogic-lockup-horizontal-reversed.svg'), out=R('h40r'), height=40,
             background=NAVY),
        dict(svg=os.path.join(out, 'brand', 'floorlogic-lockup-horizontal.svg'), out=R('h80'), height=80, background='#fff'),
        dict(svg=os.path.join(out, 'brand', 'floorlogic-lockup-horizontal-reversed.svg'), out=R('h80r'), height=80,
             background=NAVY),
        dict(svg=os.path.join(out, 'brand', 'floorlogic-lockup-stacked-reversed.svg'), out=R('sr-a'), height=230,
             background='#0f1a2e'),
        dict(svg=os.path.join(out, 'brand', 'floorlogic-lockup-stacked-reversed.svg'), out=R('sr-b'), height=230,
             background='#1e3a5f'),
        dict(svg=os.path.join(out, 'brand', 'floorlogic-mark-reversed.svg'), out=R('mr'), height=230, background=NAVY),
        dict(svgText=fav, out=R('fav16'), width=16, background='#fff'),
        dict(svgText=fav, out=R('fav32'), width=32, background='#fff'),
        dict(svgText=_dark_favicon(fav), out=R('fav16d'), width=16, background='#35363a'),
        dict(svgText=_dark_favicon(fav), out=R('fav32d'), width=32, background='#35363a'),
    ]
    fl.resvg_render(jobs, work, node_modules, NODE_DIR, tag='sheet')
    S = lambda name: Image.open(R(name)).convert('RGB')
    srcim = Image.open(summary['src']).convert('RGB')
    mb = summary['layouts']['floorlogic-mark.svg']
    mx0, my0 = -mb['mark']['tx'], -mb['mark']['ty']
    mw, mh = mb['size']
    k = 512 / mh
    src_mark = srcim.crop((int(round(mx0)), int(round(my0)), int(round(mx0 + mw)), int(round(my0 + mh)))).resize(
        (int(round(mw * k)), 512), Image.LANCZOS)

    W = 2400
    sheet = Image.new('RGB', (W, 2140), '#e9ecf1')
    d = ImageDraw.Draw(sheet)
    f1, f2 = _font(30), _font(20)
    d.text((40, 24), 'FloorLogic logo rebuild - QA contact sheet', fill='#111', font=f1)
    iou = lambda n: summary.get('_iou', {}).get(n, {})

    def card(x, y, im, label, pad=16, bg='#ffffff'):
        w = max(im.width, int(d.textlength(label, font=f2))) + 2 * pad
        h = im.height + 2 * pad + 34
        d.rectangle([x, y, x + w, y + h], fill=bg, outline='#c5ccd6')
        sheet.paste(im, (x + pad, y + pad))
        d.text((x + pad, y + h - 30), label, fill='#333' if bg == '#ffffff' else '#dde3ea', font=f2)
        assert x + w <= W, f'contact sheet card "{label}" overflows'
        return x + w + 24

    y = 80
    x = 40
    x = card(x, y, srcim.resize((512, 512), Image.LANCZOS), 'SOURCE PNG @512')
    x = card(x, y, S('stacked512'), 'SVG stacked lockup @512 (same frame)')
    x = card(x, y, src_mark, 'SOURCE mark @512h')
    card(x, y, S('mark512'), 'SVG mark @512h')

    y = 680
    x = card(40, y, S('h40'), 'horizontal 40px @1x')
    card(x, y, S('h40r'), 'reversed 40px @1x on #12233D', bg=NAVY)
    y2 = y + 40 + 32 + 34 + 24
    x = card(40, y2, S('h80'), 'horizontal 40px @2x (80px)')
    card(x, y2, S('h80r'), 'reversed 40px @2x on #12233D', bg=NAVY)

    y = y2 + 80 + 32 + 34 + 30
    x = card(40, y, S('sr-a'), 'stacked reversed on #0F1A2E', bg='#0f1a2e')
    x = card(x, y, S('sr-b'), 'stacked reversed on #1E3A5F', bg='#1e3a5f')
    card(x, y, S('mr'), 'mark reversed on #12233D', bg=NAVY)

    y = y + 230 + 32 + 34 + 30
    up = lambda im, s: im.resize((im.width * s, im.height * s), Image.NEAREST)
    x = card(40, y, S('fav16'), '16px')
    x = card(x, y, S('fav32'), '32px')
    x = card(x, y, up(S('fav16'), 8), 'favicon.svg 16px x8')
    x = card(x, y, up(S('fav32'), 4), 'favicon.svg 32px x4')
    x = card(x, y, up(S('fav16d'), 8), 'dark-mode 16px x8', bg='#35363a')
    card(x, y, up(S('fav32d'), 4), 'dark-mode 32px x4', bg='#35363a')

    y = y + 128 + 32 + 34 + 30
    ico = Image.open(os.path.join(out, 'favicon.ico'))
    x = 40
    for s in (16, 32, 48):
        ico.size = (s, s)
        fr = ico.copy().convert('RGBA')
        bgim = Image.new('RGBA', fr.size, '#ffffff')
        bgim.alpha_composite(fr)
        x = card(x, y, up(bgim.convert('RGB'), 4 if s < 48 else 2), f'favicon.ico {s}px')
    at = Image.open(os.path.join(out, 'apple-touch-icon.png')).convert('RGB')
    x = card(x, y, at, 'apple-touch-icon 180')
    i192 = Image.open(os.path.join(out, 'icon-192.png')).convert('RGBA')
    chk = Image.new('RGBA', i192.size, '#f0f0f0')
    for yy in range(0, 192, 16):
        for xx in range(0, 192, 16):
            if (xx + yy) // 16 % 2:
                ImageDraw.Draw(chk).rectangle([xx, yy, xx + 15, yy + 15], fill='#d8d8d8')
    chk.alpha_composite(i192)
    x = card(x, y, chk.convert('RGB'), 'icon-192 (transparent)')
    mk = Image.open(os.path.join(out, 'icon-maskable-512.png')).convert('RGB').resize((256, 256), Image.LANCZOS)
    ov = mk.copy()
    ImageDraw.Draw(ov).ellipse([128 - 102.4, 128 - 102.4, 128 + 102.4, 128 + 102.4], outline='#e5484d', width=2)
    x = card(x, y, ov, 'maskable 512 + 80% safe zone')
    circ = Image.new('L', (256, 256), 0)
    ImageDraw.Draw(circ).ellipse([0, 0, 255, 255], fill=255)
    masked = Image.new('RGB', (256, 256), '#ffffff')
    masked.paste(mk, (0, 0), circ)
    card(x, y, masked, 'maskable, circle mask')

    path = os.path.join(work, 'contact-sheet.png')
    sheet.save(path)
    return path


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.dirname(HERE)), 'public'))
    ap.add_argument('--work', required=True)
    a = ap.parse_args()
    summary = json.load(open(os.path.join(a.work, 'model.json')))
    run(fl.Source(fl.load_source(a.src)), a.out, a.work, os.path.join(a.work, 'node', 'node_modules'), summary)
