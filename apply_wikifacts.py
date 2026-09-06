#!/usr/bin/env python3
"""Apply scraped wiki facts to quests.json: trader, level gate, loyalty gate, exact objectives, rep rewards."""
import json

quests = json.load(open('quests.json'))
facts = json.load(open('wikifacts.json'))
by = {q['id']: q for q in quests}

MAPNAMES = {"Customs","Factory","Woods","Interchange","Shoreline","Reserve","The Lab","Lighthouse",
            "Streets of Tarkov","Ground Zero","Terminal","The Labyrinth","Icebreaker"}

changed = {'trader':0,'level':0,'gate':0,'maps':0,'objectives':0,'rep':0}

for qid, f in facts.items():
    if 'error' in f or qid not in by: continue
    q = by[qid]

    # trader
    if f.get('given_by') and f['given_by'] != q['trader']:
        q['trader'] = f['given_by']; changed['trader'] += 1

    # gate: character level, else trader loyalty, else chain/none
    lvl = f.get('char_level')
    loy = f.get('loyalty')
    if lvl is not None:
        if q['level'] != lvl: changed['level'] += 1
        q['level'] = lvl
        q['gate'] = {'kind': 'level', 'label': 'Lv ' + str(lvl)}
    elif loy:
        q['level'] = 1
        q['gate'] = {'kind': 'loyalty', 'label': f"{loy['trader']} LL{loy['ll']}",
                     'trader': loy['trader'], 'll': loy['ll']}
    else:
        q['level'] = 1
        q['gate'] = {'kind': 'chain', 'label': 'chain / no stated gate'}
    changed['gate'] += 1

    if f.get('karma'):
        q['gate']['karma'] = f['karma']

    # maps from the infobox location field
    locs = [l for l in f.get('location', []) if l in MAPNAMES]
    if locs and locs != q.get('maps'):
        q['maps'] = locs; changed['maps'] += 1
    elif not locs and not q.get('maps'):
        q['maps'] = ['Any']

    # exact objectives straight off the wiki
    objs = [o for o in f.get('objectives', []) if o and len(o) < 300]
    if objs:
        q['objectives'] = objs; changed['objectives'] += 1

    # trader rep rewards - directly useful for the LL4 grind
    if f.get('rep'):
        q['rep'] = f['rep']; changed['rep'] += 1

    # the wiki's own stale Kappa flag, kept separate from the verified 4 prereqs
    q['reqkappa_wiki'] = bool(f.get('reqkappa_wiki_flag'))

json.dump(quests, open('quests.json','w'), ensure_ascii=False, indent=1)
print("applied:", changed)

gates = {}
for q in quests:
    gates[q.get('gate',{}).get('kind','?')] = gates.get(q.get('gate',{}).get('kind','?'),0)+1
print("gate kinds:", gates)

# how many have real rep data
withrep = [q for q in quests if q.get('rep')]
print(f"{len(withrep)} quests carry trader rep reward data")
big = sorted(((float(v), q['name'], t) for q in quests for t,v in (q.get('rep') or {}).items()
              if float(v) >= 0.25), reverse=True)[:12]
print("\nbiggest rep awards in this dataset:")
for v,n,t in big: print(f"   {t:12} +{v:<6} {n}")
