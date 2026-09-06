#!/bin/bash
# Inline style.css + data.js + app.js into one portable, double-clickable HTML file.
set -e
cd "$(dirname "$0")"
OUT="tarkov-companion.html"
python3 - <<'PY'
import re, pathlib
html = pathlib.Path('index.html').read_text()
css  = pathlib.Path('style.css').read_text()
data = pathlib.Path('data.js').read_text()
app  = pathlib.Path('app.js').read_text()
html = html.replace('<link rel="stylesheet" href="style.css">',
                    '<style>\n' + css + '\n</style>')
html = html.replace('<script src="data.js"></script>\n<script src="app.js"></script>',
                    '<script>\n' + data + '\n</script>\n<script>\n' + app + '\n</script>')
assert '<style>' in html and 'var DATA' in html, 'inline failed'

# The single file must work offline and on its own, so it cannot reference img/
# and must not pull 45 MB of originals from Fandom just to draw the cards.
# Embed the small thumbnails as data URIs; leave the zoom view remote so it only
# downloads the one image you actually click.
import json, re, base64
m = re.search(r'var DATA = (\{.*?\});\n', html, re.S)
if m:
    d = json.loads(m.group(1))
    embedded = 0
    inline_bytes = 0
    for mp in d.get('MAPS', []):
        for im in (mp.get('images') or []):
            t = str(im.get('thumb', ''))
            if t.startswith('img/'):
                p = pathlib.Path(t)
                if p.exists():
                    b = p.read_bytes()
                    im['thumb'] = 'data:image/jpeg;base64,' + base64.b64encode(b).decode()
                    inline_bytes += len(b)
                    embedded += 1
                else:
                    im['thumb'] = im['full']
            if str(im.get('mid', '')).startswith('img/'):
                im['mid'] = im['full']   # remote original, fetched only on click
    html = html[:m.start(1)] + json.dumps(d, ensure_ascii=False) + html[m.end(1):]
    print('  single-file: embedded %d thumbnails (%.1f MB of JPEG) as data URIs' % (embedded, inline_bytes/1024/1024))
pathlib.Path('tarkov-companion.html').write_text(html)
print('built tarkov-companion.html  (%.0f KB)' % (len(html)/1024))
PY
