#!/usr/bin/env python3
"""Compute the things no wiki page contains: cost-per-open, the key dependency graph,
vendor arbitrage, and a loot->key reverse index."""
import json, re, itertools

K = json.load(open('keys.json'))
keys = []
for m in K['maps']:
    for kk in m['keys']:
        kk = dict(kk); kk['map'] = m['map']; keys.append(kk)

# ── 1. parse price and durability into numbers ──
NUM = r'([\d][\d,]{2,})'
def _v(raw):
    try: return int(float(raw.replace(',', '').rstrip('.')))
    except (ValueError, AttributeError): return None

def parse_price(s):
    """Prefer the LOWEST LIVE OFFER; fall back to any currency figure. Handles RUB / P / k."""
    if not s: return None
    if re.search(r'not purchasable|cannot be bought|no price|not tradeable|flea-banned|banned from flea|n/a', s, re.I):
        if not re.search(r'lowest (?:live )?offer', s, re.I): return None
    t = s.replace('\u2013','-').replace('\u2014','-')
    cands = []
    # explicit lowest-offer figure, either side of the phrase
    for pat in [r'lowest (?:live )?offer[^\d]{0,25}' + NUM,
                r'(?:roughly |about |~)?[\u20bdP]?' + NUM + r'\s*(?:RUB|roubles|\u20bd)?[^.;]{0,30}lowest (?:live )?offer']:
        m = re.search(pat, t, re.I)
        if m: cands.append(_v(m.group(1)))
    if not cands:
        # a range "~P240,000-272,750" or "~40,000-63,000" -> take the LOW end
        m = re.search(r'[~\u20bdP]?' + NUM + r'\s*-\s*[\u20bdP]?' + NUM, t)
        if m: cands.append(_v(m.group(1)))
    if not cands:
        for m in re.finditer(r'[\u20bdP]?' + NUM + r'\s*(?:RUB|roubles|\u20bd)?', t):
            v = _v(m.group(1))
            if v: cands.append(v); break
    cands = [c for c in cands if c and 300 <= c <= 30_000_000]
    return min(cands) if cands else None

def parse_uses(s):
    if not s: return None
    if re.search(r'\bsingle use\b|\b1 use\b|^1\b', str(s), re.I): return 1
    m = re.search(r'(\d+)', str(s))
    return int(m.group(1)) if m else None

def _num(raw):
    try: return int(float(raw.replace(',', '').rstrip('.')))
    except (ValueError, AttributeError): return None

def parse_buyback(k):
    """Trader buy-back price, mentioned in prose on the value_note / approx_price."""
    blob = ' '.join(filter(None, [k.get('value_note'), k.get('approx_price')]))
    m = re.search(r'(Therapist|Prapor|Mechanic|Skier|Peacekeeper|Ragman|Jaeger|Fence|Ref)\s+(?:buys?(?:\s+it)?(?:\s+back)?(?:\s+at|\s+for)?|pays)\s+~?([\d][\d,\.]*)', blob, re.I)
    if m:
        v = _num(m.group(2))
        return (m.group(1), v) if v else None
    m = re.search(r'buy-?back[^\d]{0,20}([\d][\d,\.]*)', blob, re.I)
    if m:
        v = _num(m.group(1))
        return (None, v) if v else None
    return None

for k in keys:
    k['price_n'] = parse_price(k.get('approx_price'))
    k['uses_n']  = parse_uses(k.get('uses'))
    k['cpo']     = round(k['price_n'] / k['uses_n']) if (k['price_n'] and k['uses_n']) else None
    bb = parse_buyback(k)
    k['buyback'] = {'trader': bb[0], 'price': bb[1]} if bb else None

priced = [k for k in keys if k['cpo']]
print(f"parsed a usable cost-per-open for {len(priced)}/{len(keys)} keys")

# ── 2. dependency graph: key A's room contains key B ──
name_by = {}
for k in keys:
    name_by.setdefault(k['name'].lower(), []).append(k)

edges = []
for a in keys:
    blob = ' | '.join((a.get('loot') or []))
    if not blob: continue
    for b in keys:
        if b is a or b['name'].lower() == a['name'].lower(): continue
        # require a reasonably specific name to avoid false hits
        if len(b['name']) < 12: continue
        if re.search(r'\b' + re.escape(b['name']) + r'\b', blob, re.I):
            edges.append({'from': a['name'], 'from_map': a['map'],
                          'to': b['name'], 'to_map': b['map'],
                          'to_price': b['price_n'], 'to_cpo': b['cpo'], 'to_tier': b['tier']})

# also mine key_spawns: "this key spawns inside <room>" where a key opens that room
for a in keys:
    for s in (a.get('key_spawns') or []):
        for b in keys:
            if b is a or len(b['name']) < 12: continue
            if re.search(r'\b' + re.escape(b['name']) + r'\b', s, re.I):
                edges.append({'from': b['name'], 'from_map': b['map'],
                              'to': a['name'], 'to_map': a['map'],
                              'to_price': a['price_n'], 'to_cpo': a['cpo'], 'to_tier': a['tier'],
                              'via_spawn': True})

# dedupe
seen = set(); uniq = []
for e in edges:
    sig = (e['from'], e['to'])
    if sig in seen: continue
    seen.add(sig); uniq.append(e)
edges = uniq

from collections import defaultdict
yields = defaultdict(list)
for e in edges: yields[e['from']].append(e)
gateways = sorted(yields.items(), key=lambda x: -len(x[1]))
print(f"dependency graph: {len(edges)} edges, {len(yields)} gateway keys")

# ── 3. vendor arbitrage: trader pays more than the flea asks ──
arb = []
for k in keys:
    bb = k.get('buyback')
    if bb and bb.get('price') and k['price_n']:
        margin = bb['price'] - k['price_n']
        if margin > -2000:
            arb.append({'key': k['name'], 'map': k['map'], 'flea': k['price_n'],
                        'trader': bb.get('trader'), 'buyback': bb['price'],
                        'margin': margin, 'uses': k['uses_n'], 'cpo': k['cpo'],
                        'note': k.get('value_note')})
arb.sort(key=lambda x: -x['margin'])
print(f"vendor arbitrage candidates: {len(arb)}")

# ── 4. loot -> key reverse index ──
TARGETS = ['LEDX','Physical Bitcoin','Bitcoin','graphics card','GPU','Intelligence folder',
           'Virtex','VPX','phased array','military COFDM','6-STEN','TerraGroup Labs keycard',
           'weapon box','Red Rebel','Golden 1GPhone','Tetriz','Ophthalmoscope','SSD','military cable',
           'Weapon case','moonshine','Lega Medal','GP coin','Toolset','military circuit board']
index = {}
for t in TARGETS:
    hits = []
    for k in keys:
        blob = ' | '.join((k.get('loot') or []))
        dead = (k.get('tier') == 'skip') or bool(re.search(r'always unlocked|no usage|no use\b|worthless|dead key', ' '.join(filter(None,[k.get('value_note'), k.get('opens')])), re.I))
        if re.search(re.escape(t), blob, re.I):
            n = len(re.findall(re.escape(t), blob, re.I))
            hits.append({'key': k['name'], 'map': k['map'], 'count': n, 'dead': dead,
                         'cpo': k['cpo'], 'price': k['price_n'], 'uses': k['uses_n'],
                         'tier': k['tier'], 'per_unit': round(k['cpo']/n) if k['cpo'] else None,
                         'where': k.get('where_is_the_door')})
    if hits:
        hits.sort(key=lambda h: (h['dead'], h['per_unit'] is None, h['per_unit'] or 0))
        index[t] = hits

print(f"loot reverse index: {len(index)} tracked items")

for g in gateways:
    pass
chain_roi = []
for gname, es in yields.items():
    src = next((x for x in keys if x['name'] == gname), None)
    if not src: continue
    downstream = [e for e in es if e.get('to_price')]
    if not downstream: continue
    total = sum(e['to_price'] for e in downstream)
    chain_roi.append({'key': gname, 'map': src['map'], 'cost': src['price_n'],
                      'yields_n': len(es), 'priced_n': len(downstream),
                      'downstream_value': total,
                      'multiple': round(total / src['price_n'], 1) if src['price_n'] else None,
                      'best': max(downstream, key=lambda e: e['to_price'])['to'],
                      'best_value': max(e['to_price'] for e in downstream)})
chain_roi.sort(key=lambda x: -(x['multiple'] or 0))

derived = {
 'chain_roi': chain_roi,
 'cost_per_open': sorted([{k2: k[k2] for k2 in
     ('name','map','tier','price_n','uses_n','cpo','opens','where_is_the_door','value_note')}
     for k in priced], key=lambda x: x['cpo']),
 'graph': {'edges': edges,
           'gateways': [{'key': g, 'map': (yields[g][0]['from_map'] if yields[g] else ''),
                         'yields': len(e), 'keys': [x['to'] for x in e]}
                        for g, e in gateways if len(e) >= 1]},
 'arbitrage': arb,
 'loot_index': index,
 'unpriced': [{'name': k['name'], 'map': k['map'], 'raw': k.get('approx_price')}
              for k in keys if not k['cpo']],
}
json.dump(derived, open('derived.json','w'), ensure_ascii=False, indent=1)

print("\n=== CHEAPEST DOORS IN THE GAME (₽ per open) ===")
for k in derived['cost_per_open'][:12]:
    print(f"  {k['cpo']:>7,} ₽/open  {k['name'][:42]:44} {k['map']:18} {k['uses_n']:>3}u  tier {k['tier']}")
print("\n=== MOST EXPENSIVE DOORS ===")
for k in derived['cost_per_open'][-8:]:
    print(f"  {k['cpo']:>9,} ₽/open  {k['name'][:42]:44} {k['map']:18} {k['uses_n']:>3}u")
