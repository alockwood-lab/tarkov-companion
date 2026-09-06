#!/usr/bin/env python3
"""Assemble data.js from the verified JSON fragments."""
import json, pathlib

core = json.load(open('core.json'))
data = {
    'STAMP': core['STAMP'],
    'PATCH': core['PATCH'],
    'MILESTONES': core['MILESTONES'],
    'TRADERS': core['TRADERS'],
    'KAPPA': core['KAPPA'],
    'CHANGES': core['CHANGES'],
    'PATHS': core['PATHS'],
    'COLLECTABLES': core['COLLECTABLES'],
    'KARMA': core['KARMA'],
    'REP': core['REP'],
    'MAPS': json.load(open('maps.json')),
    'QUESTS': json.load(open('quests.json')),
    'RESOURCES': json.load(open('resources.json')),
    'KEYS': json.load(open('keys.json')),
    'MODES': json.load(open('modes.json')),
    'DERIVED': json.load(open('derived.json')),
    'MYTHS': json.load(open('myths.json')),
}
# attach visual map guides
imgs = json.load(open('mapimages.json'))
# NOTE: Fandom's scale-to-width-down thumbnailer 404s on a real GET (it returns 200 to HEAD,
# which is how broken URLs got shipped once). Images are self-hosted in img/ instead.
attached = 0
for m in data['MAPS']:
    gallery = []
    for im in imgs.get(m['name'], []):
        gallery.append({
            'thumb': im['thumb_local'],
            'mid':   im['mid_local'],
            'full':  im['url'],          # original on the Fandom CDN - verified to work
            'caption': im['caption'],
            'source': im['source'],
        })
        attached += 1
    m['images'] = gallery
print('attached %d map images across %d maps' % (attached, sum(1 for m in data['MAPS'] if m['images'])))

body = json.dumps(data, ensure_ascii=False, indent=1)
pathlib.Path('data.js').write_text(
    '/* Tarkov Companion dataset — assembled by assemble.py. Edit the JSON fragments, not this file. */\n'
    'var DATA = ' + body + ';\n'
)
nkeys = sum(len(m.get('keys', [])) for m in data['KEYS'].get('maps', []))
print('data.js: %d quests, %d maps, %d traders, %d keys across %d maps, %d resources (%.0f KB)'
      % (len(data['QUESTS']), len(data['MAPS']), len(data['TRADERS']),
         nkeys, len(data['KEYS'].get('maps', [])), len(data['RESOURCES']), len(body)/1024))
