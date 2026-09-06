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
pathlib.Path('tarkov-companion.html').write_text(html)
print('built tarkov-companion.html  (%.0f KB)' % (len(html)/1024))
PY
