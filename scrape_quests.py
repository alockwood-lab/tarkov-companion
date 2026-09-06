#!/usr/bin/env python3
"""Scrape authoritative quest facts from the Fandom wikitext for every quest in quests.json."""
import json, urllib.request, urllib.parse, re, concurrent.futures

UA = {'User-Agent': 'Mozilla/5.0'}

def wikitext(title):
    u = ("https://escapefromtarkov.fandom.com/api.php?action=parse&prop=wikitext&format=json&redirects=1&page="
         + urllib.parse.quote(title))
    d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40))
    return d['parse']['wikitext']['*'], d['parse'].get('title', title)

def links(s):
    return [m.group(1).split('|')[0].strip() for m in re.finditer(r'\[\[([^\]]+)\]\]', s or '')]

def infobox_field(t, name):
    m = re.search(r'^\|\s*' + re.escape(name) + r'\s*=\s*(.*)$', t, re.M)
    return m.group(1).strip() if m else ''

def section(t, name):
    m = re.search(r'==\s*' + re.escape(name) + r'\s*==\s*\n(.*?)(?=\n==[^=]|\Z)', t, re.S)
    return m.group(1) if m else ''

def bullets(s):
    out = []
    for ln in s.split('\n'):
        ln = ln.strip()
        if ln.startswith('*') and not ln.startswith('**'):
            txt = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', ln.lstrip('* ').strip())
            txt = re.sub(r'\[\[([^\]]+)\]\]', r'\1', txt)
            txt = re.sub(r"'''?", '', txt)
            txt = re.sub(r'<[^>]+>', '', txt).strip()
            if txt: out.append(txt)
    return out

def scrape(q):
    title = urllib.parse.unquote(q['wiki'].rsplit('/wiki/', 1)[1]).replace('_', ' ')
    try:
        t, resolved = wikitext(title)
        if resolved and resolved != title:
            title = resolved
    except Exception as e:
        return q['id'], {'error': f'{type(e).__name__}'}

    req = section(t, 'Requirements')
    obj = section(t, 'Objectives')
    rew = section(t, 'Rewards')

    char_lvl = None
    m = re.search(r'Must be level\s+(\d+)', req, re.I)
    if m: char_lvl = int(m.group(1))

    loyal = None
    m = re.search(r'Must reach Loyalty Level\s+(\d+)\s+with\s+\[\[([^\]|]+)', req, re.I)
    if m: loyal = {'ll': int(m.group(1)), 'trader': m.group(2).strip()}

    karma = None
    m = re.search(r'[Ss]cav karma.*?([+-]?\d+(?:\.\d+)?)', req)
    if m and 'karma' in req.lower(): karma = m.group(1)

    given = links(infobox_field(t, 'given by'))
    loc = links(infobox_field(t, 'location'))
    kappa_flag = 'yes' in infobox_field(t, 'reqkappa').lower()

    reps = {}
    for m in re.finditer(r'\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*Rep\s*<font[^>]*>\s*\'*([+-][\d.]+)', rew):
        reps[m.group(1).strip()] = m.group(2)

    return q['id'], {
        'title': title,
        'given_by': given[0] if given else None,
        'location': loc,
        'char_level': char_lvl,
        'loyalty': loyal,
        'karma': karma,
        'reqkappa_wiki_flag': kappa_flag,
        'objectives': bullets(obj)[:6],
        'rep': reps,
        'req_raw': bullets(req)[:4],
    }

quests = json.load(open('quests.json'))
res = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    for qid, data in ex.map(scrape, quests):
        res[qid] = data

json.dump(res, open('wikifacts.json', 'w'), ensure_ascii=False, indent=1)

errs = {k: v for k, v in res.items() if 'error' in v}
print(f"scraped {len(res) - len(errs)}/{len(res)} quest pages ({len(errs)} errors)")
if errs:
    for k, v in errs.items(): print('  ERR', k, v['error'])

# ── diff report ──
by = {q['id']: q for q in quests}
print("\n=== TRADER MISMATCHES ===")
tm = 0
for qid, f in res.items():
    if 'error' in f or not f['given_by']: continue
    if f['given_by'] != by[qid]['trader']:
        tm += 1
        print(f"  {by[qid]['name'][:42]:44} mine={by[qid]['trader']:12} wiki={f['given_by']}")
print(f"  ({tm} mismatches)")

print("\n=== CHARACTER LEVEL GATES (wiki states one) ===")
lm = 0
for qid, f in res.items():
    if 'error' in f or f['char_level'] is None: continue
    if f['char_level'] != by[qid]['level']:
        lm += 1
        print(f"  {by[qid]['name'][:42]:44} mine=Lv{by[qid]['level']:<4} wiki=Lv{f['char_level']}")
print(f"  ({lm} level mismatches)")

nolvl = [qid for qid, f in res.items() if 'error' not in f and f['char_level'] is None]
print(f"\n=== NO CHARACTER LEVEL GATE AT ALL: {len(nolvl)} of {len(res)} quests ===")
loy = [(qid, f['loyalty']) for qid, f in res.items() if 'error' not in f and f['loyalty']]
print(f"=== GATED BY TRADER LOYALTY LEVEL INSTEAD: {len(loy)} quests ===")
