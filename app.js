/* ── Tarkov Companion — engine ───────────────────────────────────── */
(function () {
  'use strict';
  var KEY = 'tkv-companion-v1';
  var S = { done: {}, level: 1, open: {}, openKeys: {}, closedGroups: {} };
  var el = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ── persistence ── */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var p = JSON.parse(raw);
        S.done = p.done || {};
        S.level = p.level || 1;
        S.closedGroups = p.closedGroups || {};
        S.openKeys = p.openKeys || {};
      }
    } catch (e) { /* first run or blocked storage */ }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ done: S.done, level: S.level, closedGroups: S.closedGroups, openKeys: S.openKeys }));
    } catch (e) { toast('Storage blocked — progress won\'t persist'); }
  }
  var tT;
  function toast(msg) {
    var t = el('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(tT); tT = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  /* ── lookups ── */
  var Q = DATA.QUESTS, M = DATA.MAPS, T = DATA.TRADERS;
  var qById = {}; Q.forEach(function (q) { qById[q.id] = q; });
  var traderOrder = {}; T.forEach(function (t, i) { traderOrder[t.name] = i; });
  var traderByName = {}; T.forEach(function (t) { traderByName[t.name] = t; });

  function questsFor(trader) { return Q.filter(function (q) { return q.trader === trader; }); }
  function isDone(q) { return !!S.done[q.id]; }
  function missingPrereqs(q) {
    if (!q.req || !q.req.length) return [];
    return q.req.filter(function (id) { return !S.done[id]; })
      .map(function (id) { return qById[id] ? qById[id].name : id; });
  }
  function lockReason(q) {
    if (q.gate && q.gate.kind === 'level' && q.level > S.level) return 'Needs level ' + q.level;
    if (q.gate && q.gate.kind === 'loyalty') {
      var t = traderByName[q.gate.trader];
      if (t && q.gate.ll >= 2) {
        var need = { 2: 1, 3: 2, 4: 3 };
        // loyalty gates are not level gates, but LL2+ implies a rough level floor
        var floors = { Prapor: [0,0,6,21,36], Therapist: [0,0,5,18,37], Skier: [0,0,7,22,38],
          Peacekeeper: [0,0,8,19,37], Mechanic: [0,0,12,26,40], Ragman: [0,0,12,27,42],
          Jaeger: [0,0,9,17,33], Ref: [0,0,15,25,35] };
        var f = floors[q.gate.trader];
        if (f && f[q.gate.ll] && f[q.gate.ll] > S.level)
          return q.gate.label + ' (~Lv ' + f[q.gate.ll] + ')';
      }
    }
    var mp = missingPrereqs(q);
    if (mp.length) return 'After: ' + mp.join(', ');
    return null;
  }
  function isAvailable(q) { return !isDone(q) && !lockReason(q); }

  /* ── filters ── */
  function readFilters() {
    return {
      s: el('qSearch').value.trim().toLowerCase(),
      trader: el('fTrader').value,
      map: el('fMap').value,
      diff: el('fDiff').value,
      sort: el('fSort').value,
      avail: el('fAvail').checked,
      kappa: el('fKappa').checked,
      hide: el('fHide').checked
    };
  }
  function matches(q, f) {
    if (f.trader && q.trader !== f.trader) return false;
    if (f.map && (q.maps || []).indexOf(f.map) === -1) return false;
    if (f.diff && String(q.difficulty) !== f.diff) return false;
    if (f.kappa && !q.kappa) return false;
    if (f.hide && isDone(q)) return false;
    if (f.avail && !isAvailable(q)) return false;
    if (f.s) {
      var hay = [q.name, q.trader, q.objective, q.unlocks, q.tip, (q.maps || []).join(' ')].join(' ').toLowerCase();
      if (hay.indexOf(f.s) === -1) return false;
    }
    return true;
  }

  /* ── render: quests ── */
  var DIFFNAME = { 1: 'Trivial', 2: 'Easy', 3: 'Moderate', 4: 'Hard', 5: 'Brutal' };

  function questRow(q) {
    var done = isDone(q), lr = done ? null : lockReason(q);
    var cls = 'q' + (done ? ' done' : '') + (lr ? ' locked' : '') + (S.open[q.id] ? ' open' : '');
    var maps = (q.maps || []).map(function (m) { return '<span class="tag map">' + esc(m) + '</span>'; }).join('');
    var lvlCls = gateClass(q);
    var h = '';
    h += '<div class="' + cls + '" data-q="' + esc(q.id) + '">';
    h += '<div class="qhead" data-toggle="' + esc(q.id) + '">';
    h += '<input type="checkbox" data-done="' + esc(q.id) + '"' + (done ? ' checked' : '') + ' title="Mark complete">';
    h += '<span class="caret2">▶</span>';
    h += '<span class="qname">' + esc(q.name) + '</span>';
    h += '<span class="qmeta">';
    if (lr) h += '<span class="tag" style="color:var(--txt3)">' + esc(lr) + '</span>';
    h += maps;
    h += '<span class="' + lvlCls + '" title="' + esc(gateTitle(q)) + '">' + esc(lvlLabel(q)) + '</span>';
    if (q.kappa) h += '<span class="tag kappa">Kappa gate</span>';
    if (q.pending) h += '<span class="tag" style="color:var(--txt3);border-style:dashed" title="' + esc(q.pending) + '">unverified</span>';
    h += '<span class="tag d' + esc(q.difficulty) + '">' + esc(DIFFNAME[q.difficulty] || q.difficulty) + '</span>';
    h += '</span></div>';

    h += '<div class="qbody">';
    h += '<div class="qb-row"><span class="lab">Objective</span><span class="val">' + esc(q.objective) + '</span></div>';
    if (q.objectives && q.objectives.length)
      h += '<div class="qb-row"><span class="lab">Exact objectives, from the wiki</span>' +
        '<ul class="lootlist">' + q.objectives.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul></div>';
    if (q.rep && Object.keys(q.rep).length)
      h += '<div class="qb-row"><span class="lab">Reputation</span><div class="pills">' +
        Object.keys(q.rep).map(function (t) {
          var v = parseFloat(q.rep[t]);
          var big = v >= 0.25, neg = v < 0;
          return '<span class="pill" style="border-color:' + (neg ? 'rgba(180,69,58,.5)' : big ? 'rgba(217,169,74,.55)' : 'var(--line2)') +
            ';color:' + (neg ? 'var(--red)' : big ? 'var(--gold)' : 'var(--txt2)') + '">' +
            esc(t) + ' ' + esc(q.rep[t]) + '</span>';
        }).join('') + '</div></div>';
    if (q.unlocks) h += '<div class="qb-row"><span class="lab">Why it matters</span><span class="val">' + esc(q.unlocks) + '</span></div>';
    if (q.tip) h += '<div class="tipbox"><span class="lab">How to actually do it</span>' + esc(q.tip) + '</div>';
    if (q.pending) h += '<div class="tipbox" style="border-color:rgba(140,111,168,.35);background:rgba(140,111,168,.06);border-left-color:var(--purple)">' +
      '<span class="lab" style="color:var(--purple)">Confirm in game</span>' + esc(q.pending) + '</div>';
    h += '<div class="links">';
    if (q.wiki) h += '<a class="lk" target="_blank" rel="noopener" href="' + esc(q.wiki) + '">Wiki walkthrough ↗</a>';
    h += '<a class="lk" target="_blank" rel="noopener" href="https://tarkov.dev/task/' + esc(slug(q.name)) + '">tarkov.dev ↗</a>';
    h += '<a class="lk" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=' +
      encodeURIComponent('Escape from Tarkov ' + q.name + ' quest guide 2026') + '">Video guide ↗</a>';
    (q.maps || []).forEach(function (m) {
      var mm = M.filter(function (x) { return x.name === m; })[0];
      if (mm && mm.dev) h += '<a class="lk" target="_blank" rel="noopener" href="' + esc(mm.dev) + '">' + esc(m) + ' map ↗</a>';
    });
    h += '</div></div></div>';
    return h;
  }

  function slug(n) { return String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function groupBlock(title, sub, list, gid) {
    var done = list.filter(isDone).length, pct = list.length ? Math.round(done / list.length * 100) : 0;
    var closed = S.closedGroups[gid] ? ' closed' : '';
    var h = '<div class="qgroup' + closed + '" data-g="' + esc(gid) + '">';
    h += '<div class="qgroup-h" data-group="' + esc(gid) + '"><span class="caret">▼</span>';
    h += '<span class="name">' + esc(title) + '</span>';
    if (sub) h += '<span class="role">' + esc(sub) + '</span>';
    h += '<span class="prog">' + done + '/' + list.length;
    h += '<span class="bar"><i style="width:' + pct + '%"></i></span>' + pct + '%</span></div>';
    h += '<div class="qlist">' + list.map(questRow).join('') + '</div></div>';
    return h;
  }

  function renderQuests() {
    var f = readFilters(), out = el('qOut');
    var pool = Q.filter(function (q) { return matches(q, f); });

    if (!pool.length) {
      out.innerHTML = '<div class="empty"><b>Nothing matches those filters</b>Loosen the level or difficulty filter, or clear the search.</div>';
      renderStats(); return;
    }

    var h = '';
    if (f.sort === 'trader') {
      T.forEach(function (t) {
        var list = pool.filter(function (q) { return q.trader === t.name; });
        if (!list.length) return;
        list.sort(function (a, b) { return a.level - b.level || a.name.localeCompare(b.name); });
        h += groupBlock(t.name, t.role, list, 'tr-' + t.name);
      });
      var orphan = pool.filter(function (q) { return !traderByName[q.trader]; });
      if (orphan.length) h += groupBlock('Other', '', orphan, 'tr-other');
    } else if (f.sort === 'map') {
      var seen = {};
      M.forEach(function (m) {
        var list = pool.filter(function (q) { return (q.maps || []).indexOf(m.name) !== -1; });
        if (!list.length) return;
        list.forEach(function (q) { seen[q.id] = 1; });
        list.sort(function (a, b) { return a.level - b.level; });
        h += groupBlock(m.name, list.length + ' quests here', list, 'mp-' + m.name);
      });
      var any = pool.filter(function (q) { return !seen[q.id]; });
      if (any.length) h += groupBlock('Any location / hideout', '', any, 'mp-any');
    } else {
      pool.sort(f.sort === 'level'
        ? function (a, b) { return a.level - b.level || a.difficulty - b.difficulty; }
        : function (a, b) { return b.difficulty - a.difficulty || a.level - b.level; });
      h += '<div class="qlist" style="border-radius:3px">' + pool.map(questRow).join('') + '</div>';
    }
    out.innerHTML = h;
    renderStats();
  }

  function renderStats() {
    var done = Q.filter(isDone).length;
    var avail = Q.filter(isAvailable).length;
    var kappaTotal = Q.filter(function (q) { return q.kappa; }).length;
    var kappaDone = Q.filter(function (q) { return q.kappa && isDone(q); }).length;
    var future = Q.filter(function (q) { return !isDone(q) && q.gate && q.gate.kind === 'level' && q.level > S.level; })
      .sort(function (a, b) { return a.level - b.level; });
    var nextGate = future.length ? future[0] : null;
    var pct = Q.length ? Math.round(done / Q.length * 100) : 0;

    el('qStats').innerHTML =
      stat('Tracked quests done', done + '<span style="font-size:15px;color:var(--txt3)">/' + Q.length + '</span>', pct + '% of this list', '') +
      stat('Doable right now', avail, 'at level ' + S.level + ', prereqs met', 'g') +
      stat('Kappa gate quests', kappaDone + '<span style="font-size:15px;color:var(--txt3)">/' + kappaTotal + '</span>', 'the named Collector prerequisites', 'p') +
      stat('Next level gate', nextGate ? 'Lv ' + nextGate.level : '—',
        nextGate ? nextGate.name + ' (' + nextGate.trader + ')' : 'nothing gated above you', 'b');
    el('nQuests').textContent = done + '/' + Q.length;
    el('nMaps').textContent = M.length;
  }
  function stat(k, v, m, c) {
    return '<div class="stat ' + c + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="m">' + esc(m) + '</div></div>';
  }

  /* ── render: maps ── */
  function dots(n) {
    var h = '<span class="diffdots">';
    for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
    return h + '</span>';
  }
  function renderMaps() {
    var s = el('mSearch').value.trim().toLowerCase();
    var sort = el('mSort').value, starterOnly = el('mStarter').checked;
    var list = M.filter(function (m) {
      if (starterOnly && !m.starter) return false;
      if (!s) return true;
      var hay = [m.name, m.tip, (m.bosses || []).map(function (b) { return b.name; }).join(' '),
        (m.loot || []).map(function (l) { return l.name; }).join(' '),
        (m.keys || []).map(function (k) { return k.name + ' ' + k.opens; }).join(' '),
        (m.extractNames || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(s) !== -1;
    });
    list.sort(sort === 'name' ? function (a, b) { return a.name.localeCompare(b.name); }
      : sort === 'quests' ? function (a, b) { return (b.questCount || 0) - (a.questCount || 0); }
        : function (a, b) { return a.difficulty - b.difficulty || a.name.localeCompare(b.name); });

    if (!list.length) { el('mOut').innerHTML = '<div class="empty"><b>No maps match</b>Try a boss name, key name or loot area.</div>'; return; }

    el('mOut').innerHTML = list.map(function (m) {
      var myQuests = Q.filter(function (q) { return (q.maps || []).indexOf(m.name) !== -1; });
      var qDone = myQuests.filter(isDone).length;
      var h = '<div class="mcard' + (m.starter ? ' pick' : '') + '">';
      h += '<div class="mtop"><h3>' + esc(m.name) + (m.starter ? '<span class="starter">START HERE</span>' : '') +
        (m.upcoming ? '<span class="starter" style="background:rgba(140,111,168,.15);border-color:rgba(140,111,168,.5);color:#b096c9">REWORK INCOMING</span>' : '') + '</h3>';
      h += '<div class="mspecs"><span><b>Size</b> ' + esc(m.size) + '</span><span><b>Raid</b> ' + esc(m.duration) + '</span>' +
        '<span><b>Players</b> ' + esc(m.players) + '</span><span><b>Exits</b> ' + esc(m.extracts) + '</span></div>';
      h += '<div class="mspecs" style="margin-top:8px"><span><b>New-player difficulty</b> ' + dots(m.difficulty) + '</span>';
      if (myQuests.length) h += '<span><b>Your quests here</b> ' + qDone + '/' + myQuests.length + '</span>';
      h += '</div></div><div class="mbody">';

      if (m.tip) h += '<div class="tipbox" style="margin-top:0"><span class="lab">Veteran read</span>' + esc(m.tip) + '</div>';
      if (m.upcoming) h += '<div class="tipbox" style="border-color:rgba(140,111,168,.4);background:rgba(140,111,168,.07);border-left-color:var(--purple)">' +
        '<span class="lab" style="color:var(--purple)">Changing soon — not live yet</span>' + esc(m.upcoming) + '</div>';
      if (m.pending) h += '<div class="tipbox" style="border-color:var(--line2);background:rgba(255,255,255,.02);border-left-color:var(--txt3)">' +
        '<span class="lab">Intel gap</span>' + esc(m.pending) + '</div>';
      if (m.images && m.images.length)
        h += row('Visual map guide', '<div class="gal">' + m.images.map(function (im, i) {
          return '<figure data-lb="' + esc(m.name) + '" data-i="' + i + '">' +
            '<span class="zoomhint">ZOOM</span>' +
            '<img loading="lazy" src="' + esc(im.thumb) + '" alt="' + esc(m.name + ' — ' + im.caption) + '"' +
            ' onerror="this.style.display=\'none\';this.parentNode.classList.add(\'imgfail\')">' +
            '<figcaption>' + esc(im.caption) + '</figcaption></figure>';
        }).join('') + '</div>');
      if (m.notes)
        h += row('Good to know', '<p style="margin:0;font-size:12.5px;color:var(--txt2)">' + esc(m.notes) + '</p>');
      if (m.docs && m.docs.length)
        h += row('Battle Pass documents here', m.docs.map(function (d) {
          return '<span class="pill">' + esc(d) + '</span>'; }).join(''), 1);
      if (m.extractNames && m.extractNames.length)
        h += row('Learn these extracts first', m.extractNames.map(function (e) { return '<span class="pill">' + esc(e) + '</span>'; }).join(''), 1);
      if (m.bosses && m.bosses.length)
        h += row('Bosses', '<ul class="dl">' + m.bosses.map(function (b) {
          return '<li><b>' + esc(b.name) + '</b>' + (b.chance ? ' <span style="color:var(--txt3)">· ' + esc(b.chance) + '</span>' : '') +
            (b.threat ? '<br>' + esc(b.threat) : '') + '</li>';
        }).join('') + '</ul>');
      if (m.loot && m.loot.length)
        h += row('Best loot runs', '<ul class="dl">' + m.loot.map(function (l) {
          return '<li><b>' + esc(l.name) + '</b> — ' + esc(l.yield) + '</li>';
        }).join('') + '</ul>');
      if (m.keys && m.keys.length)
        h += row('Keys worth carrying', '<ul class="dl">' + m.keys.map(function (k) {
          return '<li><b>' + esc(k.name) + '</b> — ' + esc(k.opens) + '</li>';
        }).join('') + '</ul>');
      if (m.traders && m.traders.length)
        h += row('Sends you here most', m.traders.map(function (t) { return '<span class="pill">' + esc(t) + '</span>'; }).join(''), 1);

      h += '<div class="links">';
      if (m.wiki) h += '<a class="lk" target="_blank" rel="noopener" href="' + esc(m.wiki) + '">Wiki ↗</a>';
      if (m.dev) h += '<a class="lk" target="_blank" rel="noopener" href="' + esc(m.dev) + '">Interactive map ↗</a>';
      h += '<a class="lk" target="_blank" rel="noopener" href="https://mapgenie.io/tarkov/maps/' + esc(slug(m.name)) + '">Map Genie ↗</a>';
      h += '<button class="lk" data-mapquests="' + esc(m.name) + '">Quests on this map →</button>';
      h += '</div></div></div>';
      return h;
    }).join('');
  }
  function row(lab, inner, pills) {
    return '<div class="mrow"><span class="lab">' + lab + '</span>' + (pills ? '<div class="pills">' + inner + '</div>' : inner) + '</div>';
  }

  /* ── lightbox ── */
  var LB = { map: null, i: 0 };
  function lbOpen(mapName, i) {
    var m = M.filter(function (x) { return x.name === mapName; })[0];
    if (!m || !m.images || !m.images.length) return;
    LB.map = m; LB.i = Math.max(0, Math.min(m.images.length - 1, i));
    lbPaint(); el('lb').classList.add('on');
    document.body.style.overflow = 'hidden';
  }
  function lbClose() {
    el('lb').classList.remove('on');
    el('lb').classList.remove('zoom');
    document.body.style.overflow = '';
    LB.map = null;
  }
  function lbStep(d) {
    if (!LB.map) return;
    var n = LB.map.images.length;
    LB.i = (LB.i + d + n) % n;
    el('lb').classList.remove('zoom');
    lbPaint();
  }
  function lbPaint() {
    var im = LB.map.images[LB.i], n = LB.map.images.length;
    el('lbTitle').textContent = LB.map.name;
    el('lbCap').textContent = im.caption + (n > 1 ? '  ·  ' + (LB.i + 1) + ' of ' + n : '');
    var zoomed = el('lb').classList.contains('zoom');
    var img = el('lbImg');
    img.onerror = function () {
      el('lbCap').textContent = im.caption + '  ·  image failed to load — use "Image source" to open it on the wiki';
    };
    img.src = zoomed ? im.full : im.mid;
    img.alt = LB.map.name + ' — ' + im.caption;
    el('lbSrc').href = im.source;
    el('lbWiki').href = LB.map.wiki;
    el('lbDev').href = LB.map.dev;
    el('lbZoom').textContent = zoomed ? 'Fit' : 'Full res';
    el('lbNav').style.display = n > 1 ? 'flex' : 'none';
  }
  function lbToggleZoom() {
    if (!LB.map) return;
    el('lb').classList.toggle('zoom');
    lbPaint();
  }

  /* ── render: collectables + karma + rep (inside the paths pane) ── */
  function renderExtras() {
    var C = DATA.COLLECTABLES, K = DATA.KARMA, R = DATA.REP || [];
    var h = '';

    if (C) {
      var done = C.items.filter(function (i) { return S.done['coll:' + i]; }).length;
      var pct = Math.round(done / C.items.length * 100);
      var trapBy = {};
      (C.traps || []).forEach(function (t) {
        t.item.split(' / ').forEach(function (n) { trapBy[n.trim()] = t.why; });
      });

      h += '<div class="path" style="margin:0 0 18px"><div class="path-h">';
      h += '<h3>The 44 Collector items</h3>';
      h += '<div class="sub">All found in raid · hand over to Fence</div>';
      h += '<p class="head">' + esc(C.note) + '</p>';
      h += '<div class="path-prog">' + done + '/' + C.items.length + ' held';
      h += '<span class="bar"><i style="width:' + pct + '%"></i></span>' + pct + '%</div>';
      h += '</div><div class="path-b" style="padding:14px 18px">';
      h += '<div class="collgrid">' + C.items.map(function (i) {
        var id = 'coll:' + i, on = !!S.done[id], trap = trapBy[i];
        return '<div class="coll' + (on ? ' done' : '') + '">' +
          '<input type="checkbox" data-pathdone="' + esc(id) + '"' + (on ? ' checked' : '') + '>' +
          '<label>' + esc(i) + '</label>' +
          (trap ? '<span class="warn" title="' + esc(trap) + '">!</span>' : '') + '</div>';
      }).join('') + '</div>';

      h += '<div class="dead" style="margin-top:16px"><span class="lab">Ways people lose these by accident</span><ul>' +
        (C.traps || []).map(function (t) {
          return '<li><b>' + esc(t.item) + '</b> — ' + esc(t.why) + '</li>';
        }).join('') + '</ul></div>';

      if (C.cultist_circle) {
        h += '<div class="tipbox" style="margin-top:14px"><span class="lab">Farm them with the Cultist Circle</span>' +
          esc(C.cultist_circle) + '</div>';
      }
      if (C.cultist_caveat) {
        h += '<div class="tipbox" style="border-color:rgba(140,111,168,.35);background:rgba(140,111,168,.06);border-left-color:var(--purple)">' +
          '<span class="lab" style="color:var(--purple)">Confirm in game</span>' + esc(C.cultist_caveat) + '</div>';
      }
      h += '</div></div>';
    }

    if (K) {
      h += '<div class="path" style="margin:0 0 18px"><div class="path-h">';
      h += '<h3>' + esc(K.title) + '</h3>';
      h += '<p class="head">' + esc(K.what) + '</p></div>';
      h += '<div class="path-b" style="padding:14px 18px">';
      h += '<div class="karma"><div class="col up"><h5>Karma gained</h5><ul>' +
        K.gain.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>';
      h += '<div class="col dn"><h5>Karma lost</h5><ul>' +
        K.loss.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div></div>';
      h += '<div class="tipbox"><span class="lab">Fastest safe route to +3</span>' + esc(K.fastest) + '</div>';
      h += '</div></div>';
    }

    if (R.length) {
      h += '<p class="eyebrow" style="margin-top:4px">The real Kappa wall</p>';
      h += '<h2 class="sec" style="margin-bottom:14px">Fastest route to LL4 with each trader</h2>';
      h += '<div class="rgrid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">';
      R.forEach(function (t) {
        var last = t.gate === '—';
        h += '<div class="rcard" style="border-left-color:' + (last ? 'var(--orange)' : 'var(--gold)') + '">';
        h += '<h4>' + esc(t.trader) + '</h4>';
        if (!last) h += '<span class="tag" style="color:var(--gold);border-color:rgba(217,169,74,.45);margin-bottom:9px;display:inline-block">' + esc(t.gate) + '</span>';
        h += '<p style="color:var(--txt2);font-size:12.5px;margin-top:8px">' + esc(t.advice) + '</p></div>';
      });
      h += '</div>';
    }

    el('extrasOut').innerHTML = h;
  }

  /* ── render: myth buster ── */
  var MYTH_CAT = '';
  function renderMyths() {
    var M = DATA.MYTHS;
    if (!M) return;
    var items = M.items || [];
    var cats = [];
    items.forEach(function (i) { if (cats.indexOf(i.cat) === -1) cats.push(i.cat); });

    var h = '';
    h += '<div class="mfilter"><button data-mcat=""' + (MYTH_CAT === '' ? ' class="on"' : '') + '>All ' + items.length + '</button>';
    h += '<button data-mcat="__high"' + (MYTH_CAT === '__high' ? ' class="on"' : '') + '>High impact ' +
      items.filter(function (i) { return i.impact === 'high'; }).length + '</button>';
    cats.forEach(function (c) {
      h += '<button data-mcat="' + esc(c) + '"' + (MYTH_CAT === c ? ' class="on"' : '') + '>' + esc(c) + '</button>';
    });
    h += '</div>';

    var shown = items.filter(function (i) {
      if (MYTH_CAT === '') return true;
      if (MYTH_CAT === '__high') return i.impact === 'high';
      return i.cat === MYTH_CAT;
    });

    shown.forEach(function (i) {
      h += '<div class="myth' + (i.impact === 'high' ? ' high' : '') + '">';
      h += '<span class="myth-cat">' + esc(i.cat) + (i.impact === 'high' ? ' · high impact' : '') + '</span>';
      h += '<div class="myth-top">';
      h += '<div class="myth-w"><span class="lab">What most players still believe</span><p>' + esc(i.believe) + '</p></div>';
      h += '<div class="myth-r"><span class="lab">What is actually true now</span><p>' + esc(i.actual) + '</p></div>';
      h += '</div>';
      if (i.detail) h += '<div class="myth-d">' + esc(i.detail) + '</div>';
      if (i.verify) h += '<div class="myth-v"><b>Check it:</b> ' + esc(i.verify) + '</div>';
      h += '</div>';
    });

    el('mythOut').innerHTML = h;
    [].forEach.call(el('mythOut').querySelectorAll('[data-mcat]'), function (b) {
      b.addEventListener('click', function () { MYTH_CAT = b.dataset.mcat; renderMyths(); });
    });
  }

  /* ── render: derived edge (computed, not reported) ── */
  var LOOT_PICK = 'LEDX';
  function money(n) { return n == null ? '—' : Number(n).toLocaleString('en-US'); }

  function renderEdge() {
    var D = DATA.DERIVED;
    if (!D) { el('edgeOut').innerHTML = '<div class="empty"><b>No derived data</b></div>'; return; }
    var cpo = D.cost_per_open || [], arb = D.arbitrage || [], chains = D.chain_roi || [];
    var cheapest = cpo[0], dearest = cpo[cpo.length - 1];
    var bestArb = arb[0], bestChain = chains[0];
    var h = '';

    h += '<div class="big">';
    h += '<div class="bigstat"><div class="l">Cheapest door in the game</div><div class="n">' +
      money(cheapest && cheapest.cpo) + ' ₽</div><div class="s">per open — <b>' + esc(cheapest ? cheapest.name : '') +
      '</b> on ' + esc(cheapest ? cheapest.map : '') + '</div></div>';
    h += '<div class="bigstat r"><div class="l">Most expensive door</div><div class="n">' +
      money(dearest && dearest.cpo) + ' ₽</div><div class="s">per open — <b>' + esc(dearest ? dearest.name : '') +
      '</b>. That is ' + (cheapest && dearest ? Math.round(dearest.cpo / cheapest.cpo).toLocaleString() : '?') +
      '× the cheapest.</div></div>';
    h += '<div class="bigstat g"><div class="l">Best chain multiple</div><div class="n">' +
      (bestChain ? bestChain.multiple + '×' : '—') + '</div><div class="s"><b>' + esc(bestChain ? bestChain.key : '') +
      '</b> — ' + money(bestChain && bestChain.cost) + ' ₽ yields ' + money(bestChain && bestChain.downstream_value) +
      ' ₽ of other keys</div></div>';
    h += '<div class="bigstat g"><div class="l">Best risk-free margin</div><div class="n">+' +
      money(bestArb && bestArb.margin) + ' ₽</div><div class="s"><b>' + esc(bestArb ? bestArb.key : '') +
      '</b> — buy on the flea, sell to the trader. No raid required.</div></div>';
    h += '</div>';

    /* arbitrage */
    if (arb.length) {
      h += '<p class="eyebrow">Trader pays more than the flea asks</p>';
      h += '<h2 class="sec">Vendor arbitrage</h2>';
      h += '<p class="hint">The wiki lists flea prices and trader buy-backs on different pages and never compares them. These are the gaps. Positive margin means you can buy the key and immediately sell it to the trader for a profit — the room is a bonus.</p>';
      h += '<div class="panel" style="padding:4px 14px 10px;overflow-x:auto"><table class="mtable"><thead><tr>' +
        '<th>Key</th><th>Flea ask</th><th>Trader pays</th><th>Margin</th><th>Verdict</th></tr></thead><tbody>';
      arb.forEach(function (a) {
        var good = a.margin > 5000;
        h += '<tr><td><span class="kn">' + esc(a.key) + '</span><span class="mp">' + esc(a.map) + '</span></td>';
        h += '<td style="font-family:var(--mono)">' + money(a.flea) + '</td>';
        h += '<td style="font-family:var(--mono)">' + money(a.buyback) + (a.trader ? ' <span style="color:var(--txt3)">' + esc(a.trader) + '</span>' : '') + '</td>';
        h += '<td style="font-family:var(--mono);font-weight:700;color:' + (a.margin > 0 ? 'var(--green)' : 'var(--red)') + '">' +
          (a.margin > 0 ? '+' : '') + money(a.margin) + '</td>';
        h += '<td class="wy">' + (good ? 'Free money — the trader outbids the market.' :
          a.margin >= 0 ? 'Break-even, so using the key costs you nothing.' : 'Slightly under; effectively free to own.') + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }

    /* chains */
    if (chains.length) {
      h += '<p class="eyebrow" style="margin-top:26px">Keys that pay for other keys</p>';
      h += '<h2 class="sec">The key dependency graph</h2>';
      h += '<p class="hint">Built by cross-referencing every key\'s loot table against every other key\'s name. Buying the left-hand key means you stop buying the right-hand ones.</p>';
      chains.filter(function (c) { return c.multiple && c.multiple >= 1; }).forEach(function (c) {
        var full = (D.graph && D.graph.gateways || []).filter(function (g) { return g.key === c.key; })[0];
        h += '<div class="chain"><div class="hd"><span class="kn">' + esc(c.key) + '</span>' +
          '<span class="tag map">' + esc(c.map) + '</span>' +
          '<span class="mult">' + c.multiple + '×</span></div>';
        h += '<div class="flow">' + money(c.cost) + ' ₽ &nbsp;→&nbsp; ' + c.yields_n + ' key' + (c.yields_n === 1 ? '' : 's') +
          ' &nbsp;→&nbsp; ' + money(c.downstream_value) + ' ₽ of downstream value</div>';
        if (full && full.keys) {
          h += '<div class="drops">' + full.keys.map(function (kn) {
            return '<span class="drop' + (kn === c.best ? ' hero' : '') + '">' + esc(kn) +
              (kn === c.best ? ' · ' + money(c.best_value) + ' ₽' : '') + '</span>';
          }).join('') + '</div>';
        }
        h += '</div>';
      });
    }

    /* loot reverse index */
    var idx = D.loot_index || {};
    var items = Object.keys(idx);
    if (items.length) {
      h += '<p class="eyebrow" style="margin-top:26px">Work backwards from what you need</p>';
      h += '<h2 class="sec">Loot → cheapest door</h2>';
      h += '<p class="hint">Pick an item and this ranks every keyed room containing it by roubles per unit. Dead keys are struck through and pushed to the bottom.</p>';
      h += '<div class="lootsel">' + items.map(function (i) {
        return '<button data-loot="' + esc(i) + '"' + (i === LOOT_PICK ? ' class="on"' : '') + '>' + esc(i) + '</button>';
      }).join('') + '</div>';
      var hits = idx[LOOT_PICK] || [];
      h += '<div class="panel" style="padding:14px 16px"><div class="lootpick"><h5>' + esc(LOOT_PICK) +
        ' — ' + hits.length + ' keyed rooms contain it</h5>';
      hits.forEach(function (x) {
        h += '<div class="lootrow' + (x.dead ? ' dead' : '') + '">' +
          '<span class="pu">' + (x.per_unit ? money(x.per_unit) + ' ₽' : 'unpriced') + '</span>' +
          '<span class="qt">×' + x.count + '</span>' +
          '<span class="kk">' + esc(x.key) + (x.dead ? ' <span style="color:var(--red);font-size:10px">DEAD KEY</span>' : '') + '</span>' +
          '<span class="mm">' + esc(x.map) + '</span></div>';
      });
      h += '</div></div>';
    }

    /* full cost-per-open ladder */
    h += '<p class="eyebrow" style="margin-top:26px">Every priced key, ranked</p>';
    h += '<h2 class="sec">Cost per open</h2>';
    h += '<p class="hint">' + cpo.length + ' of ' + (cpo.length + (D.unpriced || []).length) +
      ' keys have a parseable price and durability. The rest are unpurchasable, free in-raid spawns, or have no published price.</p>';
    h += '<div class="panel" style="padding:4px 14px 10px;overflow-x:auto;max-height:640px"><table class="mtable"><thead><tr>' +
      '<th>#</th><th>₽ / open</th><th>Key</th><th>Price</th><th>Uses</th><th>Tier</th><th>Opens</th></tr></thead><tbody>';
    cpo.forEach(function (k, i) {
      h += '<tr><td style="font-family:var(--mono);color:var(--txt3)">' + (i + 1) + '</td>';
      h += '<td style="font-family:var(--mono);font-weight:700;color:var(--gold)">' + money(k.cpo) + '</td>';
      h += '<td><span class="kn">' + esc(k.name) + '</span><span class="mp">' + esc(k.map) + '</span></td>';
      h += '<td style="font-family:var(--mono)">' + money(k.price_n) + '</td>';
      h += '<td style="font-family:var(--mono)">' + esc(k.uses_n) + '</td>';
      h += '<td><span class="tier ' + esc(k.tier) + '">' + esc(k.tier === 'skip' ? '✕' : k.tier) + '</span></td>';
      h += '<td class="wy">' + esc(String(k.opens || '').slice(0, 110)) + '</td></tr>';
    });
    h += '</tbody></table></div>';

    el('edgeOut').innerHTML = h;
    [].forEach.call(el('edgeOut').querySelectorAll('[data-loot]'), function (b) {
      b.addEventListener('click', function () { LOOT_PICK = b.dataset.loot; renderEdge(); });
    });
  }

  /* ── render: mode split (top of the Keys tab) ── */
  function stClass(v) {
    v = (v || '').toLowerCase();
    if (v.indexOf('best') === 0) return 'best';
    if (v.indexOf('good') === 0) return 'good';
    if (v.indexOf('poor') === 0) return 'poor';
    if (v.indexOf('unavail') === 0) return 'unav';
    return 'fine';
  }
  function renderModes() {
    var D = DATA.MODES;
    if (!D) return '';
    var h = '';

    h += '<div class="dead" style="border-left-color:var(--gold);background:rgba(217,169,74,.05);border-color:rgba(217,169,74,.28);margin:0 0 20px">';
    h += '<span class="lab" style="color:var(--gold)">The thing everyone gets wrong</span>';
    h += '<p style="margin:0;font-size:13px;color:#e4ded0">' + esc(D.headline) + '</p></div>';

    if (D.one_liners && D.one_liners.length) {
      h += '<div class="modecards">';
      D.one_liners.forEach(function (m) {
        var cls = /pve/i.test(m.mode) ? ' pve' : /season/i.test(m.mode) ? ' season' : '';
        h += '<div class="modecard' + cls + '"><h4>' + esc(m.mode) + '</h4><p>' + esc(m.advice) + '</p></div>';
      });
      h += '</div>';
    }

    if (D.divergences && D.divergences.length) {
      h += '<p class="eyebrow">Where the answer changes most</p>';
      h += '<h2 class="sec" style="margin-bottom:12px">The five keys whose value flips between modes</h2>';
      D.divergences.forEach(function (d) {
        h += '<div class="divg"><h5>' + esc(d.key) + '</h5>';
        h += '<p class="mech">' + esc(d.mechanic) + '</p>';
        h += '<p class="eff">' + esc(d.effect) + '</p></div>';
      });
    }

    if (D.agnostic && D.agnostic.length) {
      h += '<p class="eyebrow" style="margin-top:22px">Safe in any mode</p>';
      h += '<h2 class="sec" style="margin-bottom:12px">Buy these whatever you play</h2>';
      h += '<div class="rgrid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));margin-bottom:22px">';
      D.agnostic.forEach(function (a) {
        h += '<div class="rcard" style="border-left-color:var(--green)"><h4>' + esc(a.key) + '</h4>' +
          '<p style="color:var(--txt3);font:10px/1 var(--mono);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">' + esc(a.map) + '</p>' +
          '<p style="color:var(--txt2);font-size:12.5px">' + esc(a.why) + '</p></div>';
      });
      h += '</div>';
    }

    if (D.table && D.table.length) {
      h += '<p class="eyebrow">Side by side</p>';
      h += '<h2 class="sec">Every ranked key across the three modes</h2>';
      h += '<p class="hint">Sorted so the keys that move most between modes come first.</p>';
      h += '<div class="panel" style="padding:4px 14px 10px;overflow-x:auto"><table class="mtable"><thead><tr>' +
        '<th>Key</th><th>PvP Zone</th><th>PvE Zone</th><th>Season</th><th>Why it moves</th></tr></thead><tbody>';
      D.table.forEach(function (r) {
        h += '<tr><td><span class="kn">' + esc(r.key) + '</span><span class="mp">' + esc(r.map) + '</span></td>';
        ['pvp_zone', 'pve_zone', 'pvp_season'].forEach(function (k) {
          h += '<td><span class="st ' + stClass(r[k]) + '">' + esc(r[k]) + '</span></td>';
        });
        h += '<td class="wy">' + esc(r.why_it_moves) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }

    if (D.mechanics && D.mechanics.length) {
      h += '<p class="eyebrow" style="margin-top:26px">The rules underneath</p>';
      h += '<h2 class="sec">What actually differs between the modes</h2>';
      h += '<p class="hint">' + D.mechanics.length + ' mechanics that change how a key should be valued.</p>';
      h += '<div class="panel" style="padding:4px 14px 10px;overflow-x:auto"><table class="mtable"><thead><tr>' +
        '<th>Topic</th><th>PvP Zone</th><th>PvE Zone</th><th>Season</th><th>Why it matters for keys</th></tr></thead><tbody>';
      D.mechanics.forEach(function (m) {
        var unv = (m.confidence || '') !== 'verified';
        h += '<tr><td><span class="kn">' + esc(m.topic) + '</span>' +
          (unv ? '<span class="mp" style="color:var(--purple)">' + esc(m.confidence) + '</span>' : '') + '</td>';
        h += '<td class="wy">' + esc(m.pvp_zone) + '</td><td class="wy">' + esc(m.pve_zone) + '</td>';
        h += '<td class="wy">' + esc(m.pvp_season) + '</td>';
        h += '<td class="wy" style="color:var(--txt2)">' + esc(m.why_it_matters_for_keys) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }

    if (D.unresolved && D.unresolved.length) {
      h += '<div class="dead" style="margin-top:22px;border-left-color:var(--purple);background:rgba(140,111,168,.05);border-color:rgba(140,111,168,.28)">';
      h += '<span class="lab" style="color:var(--purple)">Open questions — verify before betting money on these</span><ul>';
      D.unresolved.forEach(function (u) { h += '<li>' + esc(u) + '</li>'; });
      h += '</ul></div>';
    }
    return h;
  }

  /* ── render: keys ── */
  function keyRows(mapName, list) {
    return list.map(function (k) {
      var id = mapName + '::' + k.name;
      var open = !!S.openKeys[id];
      var cls = 'k' + (open ? ' open' : '') + (k.tier === 'skip' ? ' skiptier' : '');
      var h = '<div class="' + cls + '" data-k="' + esc(id) + '">';
      h += '<div class="khead" data-ktoggle="' + esc(id) + '">';
      h += '<span class="tier ' + esc(k.tier) + '" title="' + esc(TIERNAME[k.tier] || '') + '">' + esc(k.tier === 'skip' ? '✕' : k.tier) + '</span>';
      h += '<span class="caret2">▶</span>';
      h += '<span class="kname">' + esc(k.name) + '</span>';
      h += '<span class="kopens">' + esc(k.opens) + '</span>';
      h += '<span class="kmeta">';
      if (k.approx_price && k.approx_price !== 'unverified') h += '<span class="tag" style="color:var(--gold);border-color:rgba(217,169,74,.4)">' + esc(k.approx_price) + '</span>';
      if (k.uses) h += '<span class="tag">' + esc(k.uses) + '</span>';
      if (k.secure_container_ok === 'no') h += '<span class="tag" style="color:var(--red);border-color:rgba(180,69,58,.55)" title="Does not fit a secure container — you lose it on death">no container</span>';
      if (k.quest_use && k.quest_use.length) h += '<span class="tag" style="color:var(--purple);border-color:rgba(140,111,168,.5)">quest</span>';
      if (k.corrections && k.corrections.length) h += '<span class="tag" style="color:var(--purple);border-color:rgba(140,111,168,.5);border-style:dashed" title="Adversarial check flagged corrections on this entry">' + k.corrections.length + ' flagged</span>';
      h += '</span></div>';

      h += '<div class="kbody">';
      if (k.value_note) h += '<div class="tipbox" style="margin-top:12px"><span class="lab">Verdict</span>' + esc(k.value_note) + '</div>';
      h += '<div class="kgrid">';
      if (k.where_is_the_door) h += field('Where the door is', esc(k.where_is_the_door));
      if (k.loot && k.loot.length) h += field('What is inside', '<ul class="lootlist">' + k.loot.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>');
      if (k.key_spawns && k.key_spawns.length) h += field('Where the key spawns', '<ul class="lootlist">' + k.key_spawns.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>');
      var buy = [];
      if (k.trader_source) buy.push('<b>Sold by:</b> ' + esc(k.trader_source));
      if (k.approx_price) buy.push('<b>Price:</b> ' + esc(k.approx_price));
      if (k.uses) buy.push('<b>Uses:</b> ' + esc(k.uses));
      if (k.secure_container_ok && k.secure_container_ok !== 'unverified') buy.push('<b>Secure container:</b> ' + esc(k.secure_container_ok));
      if (buy.length) h += field('Getting one', buy.join('<br>'));
      if (k.quest_use && k.quest_use.length) h += field('Needed for quests', k.quest_use.map(function (q) { return '<span class="pill">' + esc(q) + '</span>'; }).join(' '));
      h += '</div>';
      if (k.corrections && k.corrections.length) {
        h += '<div class="dead" style="border-left-color:var(--purple);background:rgba(140,111,168,.05);border-color:rgba(140,111,168,.28)">';
        h += '<span class="lab" style="color:var(--purple)">Adversarial check flagged ' + k.corrections.length +
          (k.corrections.length === 1 ? ' correction' : ' corrections') + '</span><ul>';
        k.corrections.forEach(function (c) {
          h += '<li><b>' + esc(c.field || 'note') + '</b>' +
            (c.confidence ? ' <span class="tag" style="padding:2px 5px;font-size:8.5px;color:var(--txt3)">' + esc(c.confidence) + '</span>' : '') +
            '<br><span style="color:var(--txt3)">claimed:</span> ' + esc(String(c.was || '').slice(0, 240)) +
            '<br><span style="color:var(--gold)">corrected:</span> ' + esc(String(c.should_be || '').slice(0, 400)) + '</li>';
        });
        h += '</ul></div>';
      }
      h += '<div class="links">';
      if (k.wiki_url) h += '<a class="lk" target="_blank" rel="noopener" href="' + esc(k.wiki_url) + '">Key wiki ↗</a>';
      else if (k.no_wiki_note) h += '<span class="lk" style="border-style:dashed;cursor:help" title="' + esc(k.no_wiki_note) + '">No wiki page</span>';
      var mm = M.filter(function (x) { return x.name === mapName; })[0];
      if (mm && mm.dev) h += '<a class="lk" target="_blank" rel="noopener" href="' + esc(mm.dev) + '">' + esc(mapName) + ' map ↗</a>';
      h += '</div></div></div>';
      return h;
    }).join('');
  }
  function lvlLabel(q) {
    return (q.gate && q.gate.label) || (q.level > 1 ? 'Lv ' + q.level : 'no stated gate');
  }
  function gateClass(q) {
    var k = q.gate && q.gate.kind;
    if (k === 'loyalty') return 'tag loy';
    if (k === 'chain') return 'tag chain';
    return 'tag lvl' + (q.level > S.level ? ' gate' : '');
  }
  function gateTitle(q) {
    var k = q.gate && q.gate.kind;
    if (k === 'loyalty') return 'Gated by trader loyalty level, not character level — ' + q.gate.label;
    if (k === 'chain') return 'No character level or loyalty gate stated on the wiki — availability follows chain progress';
    return 'Requires character level ' + q.level;
  }
  var TIERNAME = { S: 'Buy immediately', A: 'Strong', B: 'Situational', C: 'Marginal', skip: 'Do not buy' };
  function field(lab, inner) {
    return '<div class="kfield"><span class="lab">' + lab + '</span><div class="v">' + inner + '</div></div>';
  }

  function renderKeys() {
    var K = DATA.KEYS || {};
    var out = el('keysOut');
    var modeHtml = renderModes();
    if (!K.maps || !K.maps.length) {
      out.innerHTML = modeHtml +
        '<div class="empty" style="border:1px dashed var(--line2);border-radius:3px;margin-top:22px">' +
        '<b>The per-map key list is still being researched</b>' +
        'Every key on all 13 maps, with its loot, door location and key spawns, lands here when the sweep finishes.</div>';
      return;
    }

    var s = el('kSearch').value.trim().toLowerCase();
    var mapF = el('kMap').value, tierF = el('kTier').value, hideSkip = el('kHideSkip').checked;

    var syn = K.synthesis;
    var h = modeHtml;

    /* global summary */
    if (syn) {
      h += '<div class="stats">';
      h += stat('Keys documented', String(K.stats ? K.stats.keys : '—'), 'across ' + (K.stats ? K.stats.maps : 0) + ' maps', '');
      h += stat('Dead money', String((syn.dead_money || []).length), 'keys not worth buying any more', '');
      h += stat('Free to farm', String((syn.free_farm_keys || []).length), 'never pay for these', 'g');
      h += stat('Container warnings', String((syn.container_warnings || []).length), 'keys you lose on death', 'b');
      h += '</div>';

      if (syn.global_buy_order && syn.global_buy_order.length) {
        h += '<div class="panel" style="padding:16px 18px;margin:0 0 16px">';
        h += '<p class="eyebrow" style="margin-bottom:4px">If your roubles are limited</p>';
        h += '<h2 class="sec" style="margin-bottom:14px">Buy them in this order</h2>';
        h += '<ul class="buyorder">' + syn.global_buy_order.map(function (b) {
          return '<li><span class="r">' + esc(b.rank) + '</span><div><div class="kn">' + esc(b.key) +
            '</div><div class="mp">' + esc(b.map) + '</div><div class="wy">' + esc(b.why) + '</div></div>' +
            (b.approx_price ? '<span class="pr">' + esc(b.approx_price) + '</span>' : '') + '</li>';
        }).join('') + '</ul></div>';
      }

      if (syn.dead_money && syn.dead_money.length) {
        h += '<div class="dead" style="margin:0 0 16px"><span class="lab">Dead money — stop buying these</span><ul>' +
          syn.dead_money.map(function (d) {
            return '<li><b>' + esc(d.key) + '</b> <span style="color:var(--txt3)">(' + esc(d.map) + ')</span> — ' + esc(d.why) + '</li>';
          }).join('') + '</ul></div>';
      }

      h += '<div class="rgrid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr));margin:0 0 16px">';
      if (syn.best_value_keys && syn.best_value_keys.length) {
        h += '<div class="rcard" style="border-left-color:var(--gold)"><h4>Best return on investment</h4><ul class="dl">' +
          syn.best_value_keys.map(function (b) {
            return '<li><b>' + esc(b.rank) + '. ' + esc(b.key) + '</b> <span style="color:var(--txt3)">' + esc(b.map) + '</span><br>' +
              esc(b.why) + (b.roi_note ? ' <span style="color:var(--gold)">' + esc(b.roi_note) + '</span>' : '') + '</li>';
          }).join('') + '</ul></div>';
      }
      if (syn.free_farm_keys && syn.free_farm_keys.length) {
        h += '<div class="rcard" style="border-left-color:var(--green)"><h4>Never buy — farm these</h4><ul class="dl">' +
          syn.free_farm_keys.map(function (f) {
            return '<li><b>' + esc(f.key) + '</b> <span style="color:var(--txt3)">' + esc(f.map) + '</span><br>' + esc(f.where) + '</li>';
          }).join('') + '</ul></div>';
      }
      if (syn.container_warnings && syn.container_warnings.length) {
        h += '<div class="rcard" style="border-left-color:var(--red)"><h4>Will not fit a secure container</h4><ul class="dl">' +
          syn.container_warnings.map(function (c) {
            return '<li><b>' + esc(c.key) + '</b> <span style="color:var(--txt3)">' + esc(c.map) + '</span><br>' + esc(c.note) + '</li>';
          }).join('') + '</ul></div>';
      }
      if (syn.general_principles && syn.general_principles.length) {
        h += '<div class="rcard" style="border-left-color:var(--blue)"><h4>How key economics actually works</h4><ul class="dl">' +
          syn.general_principles.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>';
      }
      h += '</div>';
    }

    /* per-map key lists */
    var verdictBy = {};
    if (syn && syn.per_map_verdict) syn.per_map_verdict.forEach(function (v) { verdictBy[v.map] = v; });

    var shown = 0, shownKeys = 0;
    K.maps.forEach(function (mk) {
      if (mapF && mk.map !== mapF) return;
      var list = (mk.keys || []).filter(function (k) {
        if (tierF && k.tier !== tierF) return false;
        if (hideSkip && k.tier === 'skip') return false;
        if (!s) return true;
        var hay = [k.name, k.opens, k.where_is_the_door, k.value_note, k.trader_source,
          (k.loot || []).join(' '), (k.key_spawns || []).join(' '), (k.quest_use || []).join(' ')].join(' ').toLowerCase();
        return hay.indexOf(s) !== -1;
      });
      if (!list.length && !s) { /* keep map visible with intro */ } else if (!list.length) return;
      shown++; shownKeys += list.length;

      var order = { S: 0, A: 1, B: 2, C: 3, skip: 4 };
      list.sort(function (a, b) { return (order[a.tier] - order[b.tier]) || a.name.localeCompare(b.name); });

      var gid = 'mk-' + mk.map;
      var closed = S.closedGroups[gid] ? ' closed' : '';
      var v = verdictBy[mk.map];
      h += '<div class="mapkeys' + closed + '">';
      h += '<div class="mapkeys-h" data-group="' + esc(gid) + '"><span class="caret">▼</span>';
      h += '<span class="nm">' + esc(mk.map) + '</span>';
      if (v && v.key_gated) h += '<span class="gate ' + esc(v.key_gated) + '">' + esc(v.key_gated) + ' key-gated</span>';
      if (mk.confidence === 'NEEDS_REWORK')
        h += '<span class="gate heavily" title="The adversarial checker judged more than a third of this map\'s entries problematic">low confidence</span>';
      else if (mk.confidence === 'MOSTLY_SOLID')
        h += '<span class="gate moderately" title="Verified with corrections applied as annotations">checked</span>';
      h += '<span class="ct">' + list.length + ' keys</span></div>';

      h += '<div class="kintro">';
      if (v && v.verdict) h += '<div class="row"><span class="lab" style="font:700 9.5px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--txt3);display:block;margin-bottom:6px">Verdict</span><span style="font-size:13px">' + esc(v.verdict) + '</span></div>';
      if (mk.starter_kit && mk.starter_kit.length) {
        h += '<div class="row"><span class="lab" style="font:700 9.5px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--txt3);display:block;margin-bottom:6px">Buy these first</span><div class="starter">';
        mk.starter_kit.forEach(function (sk, i) {
          h += '<span class="pill loot"><span class="snum">' + (i + 1) + '</span> ' + esc(sk) + '</span>';
        });
        h += '</div></div>';
      }
      if (mk.key_economics) h += '<div class="row"><span class="lab" style="font:700 9.5px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--txt3);display:block;margin-bottom:6px">How keys pay here</span><span style="font-size:12.5px;color:var(--txt2)">' + esc(mk.key_economics) + '</span></div>';
      if (mk.map_level_corrections && mk.map_level_corrections.length) {
        h += '<div class="dead" style="border-left-color:var(--purple);background:rgba(140,111,168,.05);border-color:rgba(140,111,168,.28)">';
        h += '<span class="lab" style="color:var(--purple)">Map-level corrections from the adversarial check</span><ul>';
        mk.map_level_corrections.forEach(function (c) {
          h += '<li><b>' + esc(c.key_name || c.field || 'note') + '</b> — ' + esc(String(c.should_be || '').slice(0, 400)) + '</li>';
        });
        h += '</ul></div>';
      }
      if (mk.obsolete_keys && mk.obsolete_keys.length) {
        h += '<div class="dead"><span class="lab">Now permanently unlocked or worthless — do not buy</span><ul>' +
          mk.obsolete_keys.map(function (o) { return '<li><b>' + esc(o.name) + '</b> — ' + esc(o.why) + '</li>'; }).join('') + '</ul></div>';
      }
      h += '</div>';

      h += '<div class="kwrap">' + keyRows(mk.map, list) + '</div></div>';
    });

    if (!shown) h += '<div class="empty"><b>No keys match</b>Try a loot item name like LEDX, or clear the filters.</div>';
    out.innerHTML = h;
    el('kCount').textContent = shownKeys ? shownKeys + ' keys shown' : '';
  }

  /* ── render: unlock paths ── */
  function pathUnits(p) {
    var out = [];
    (p.steps || []).forEach(function (s) {
      if (s.kind === 'req') (s.items || []).forEach(function (i) { out.push('req:' + p.id + ':' + i.id); });
      else (s.quests || []).forEach(function (qid) { out.push(qid); });
    });
    return out;
  }

  function renderPaths() {
    renderExtras();
    el('pathsOut').innerHTML = (DATA.PATHS || []).map(function (p) {
      var units = pathUnits(p);
      var done = units.filter(function (u) { return S.done[u]; }).length;
      var pct = units.length ? Math.round(done / units.length * 100) : 0;

      var s = '<div class="path"><div class="path-h">';
      s += '<h3>' + esc(p.title) + '</h3><div class="sub">' + esc(p.subtitle) + '</div>';
      s += '<p class="head">' + esc(p.headline) + '</p>';
      s += '<p class="rw"><b>Reward:</b> ' + esc(p.reward) + '</p>';
      s += '<div class="path-prog">' + done + '/' + units.length + ' done';
      s += '<span class="bar"><i style="width:' + pct + '%"></i></span>' + pct + '%</div>';
      s += '</div><div class="path-b">';

      (p.steps || []).forEach(function (st, i) {
        var ids = st.kind === 'req'
          ? (st.items || []).map(function (x) { return 'req:' + p.id + ':' + x.id; })
          : (st.quests || []);
        var d = ids.filter(function (x) { return S.done[x]; }).length;
        s += '<div class="step' + (ids.length && d === ids.length ? ' done' : '') + '">';
        s += '<div class="step-h"><span class="step-n">' + (i + 1) + '</span>';
        s += '<span class="step-l">' + esc(st.label) + '</span>';
        s += '<span class="step-c">' + d + '/' + ids.length + '</span></div>';
        if (st.note) s += '<p class="step-note">' + esc(st.note) + '</p>';

        if (st.kind === 'req') {
          (st.items || []).forEach(function (it) {
            var id = 'req:' + p.id + ':' + it.id, on = !!S.done[id];
            s += '<div class="pq' + (on ? ' done' : '') + '">';
            s += '<input type="checkbox" data-pathdone="' + esc(id) + '"' + (on ? ' checked' : '') + '>';
            s += '<label><b>' + esc(it.label) + '</b> <span style="color:var(--txt3)">— ' + esc(it.detail) + '</span></label>';
            s += '</div>';
          });
        } else {
          (st.quests || []).forEach(function (qid, k) {
            var q = qById[qid]; if (!q) return;
            var on = isDone(q);
            s += '<div class="pq' + (on ? ' done' : '') + '">';
            s += '<input type="checkbox" data-pathdone="' + esc(qid) + '"' + (on ? ' checked' : '') + '>';
            if (k) s += '<span class="arrow">&#8627;</span>';
            s += '<label>' + esc(q.name) + '</label>';
            s += '<span class="who">' + esc(q.trader) + ' &middot; ' + esc(lvlLabel(q)) + '</span>';
            s += '<a target="_blank" rel="noopener" href="' + esc(q.wiki) + '" title="Wiki walkthrough">&#8599;</a>';
            s += '</div>';
          });
        }
        s += '</div>';
      });
      s += '</div>';

      if (p.gotchas && p.gotchas.length) {
        s += '<div class="gotchas"><span class="lab">Things that will catch you out</span><ul>' +
          p.gotchas.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>';
      }
      return s + '</div>';
    }).join('');
  }

  /* ── render: progression ── */
  function renderProgress() {
    var h = '';
    h += '<div class="stats">';
    (DATA.MILESTONES || []).forEach(function (ms) {
      var hit = S.level >= ms.level;
      h += '<div class="stat ' + (hit ? 'g' : '') + '"><div class="k">Level ' + esc(ms.level) + (hit ? ' ✓' : '') + '</div>' +
        '<div class="v" style="font-size:15px;line-height:1.35;margin:9px 0 5px">' + esc(ms.what) + '</div>' +
        '<div class="m">' + esc(ms.why) + '</div></div>';
    });
    h += '</div>';

    h += '<p class="eyebrow" style="margin-top:26px">Traders</p>';
    h += '<div class="mgrid">';
    T.forEach(function (t) {
      var list = questsFor(t.name), done = list.filter(isDone).length;
      var pct = list.length ? Math.round(done / list.length * 100) : 0;
      h += '<div class="mcard"><div class="mtop"><h3>' + esc(t.name) + '</h3>';
      h += '<div class="mspecs"><span>' + esc(t.role) + '</span></div>';
      h += '<div class="mspecs" style="margin-top:8px"><span><b>Tracked</b> ' + done + '/' + list.length + '</span>' +
        '<span class="bar" style="width:120px"><i style="width:' + pct + '%"></i></span></div></div>';
      h += '<div class="mbody">';
      if (t.currency) h += row('Trades in', '<span class="pill loot">' + esc(t.currency) + '</span>', 1);
      if (t.ll && t.ll.length) h += row('Loyalty levels', '<ul class="dl">' + t.ll.map(function (l) {
        return '<li><b>' + esc(l.tier) + '</b> — ' + esc(l.req) + '</li>';
      }).join('') + '</ul>');
      if (t.why) h += '<div class="tipbox" style="margin-top:0"><span class="lab">Why you care</span>' + esc(t.why) + '</div>';
      h += '<div class="links">';
      if (t.wiki) h += '<a class="lk" target="_blank" rel="noopener" href="' + esc(t.wiki) + '">Wiki ↗</a>';
      h += '<button class="lk" data-traderquests="' + esc(t.name) + '">Show quests →</button>';
      h += '</div></div></div>';
    });
    h += '</div>';
    el('pOut').innerHTML = h;
  }

  function renderMeta() {
    var P = DATA.PATCH, K = DATA.KAPPA || null;
    var h = '';

    h += '<div class="stats">';
    h += stat('Live version', esc(P.version || '—'), 'shipped ' + esc(P.released || ''), '');
    h += stat('Season', 'S1', esc(P.season || ''), 'p');
    h += stat('Full release', '1.0', esc(P.release_1_0 || ''), 'b');
    h += stat('Maps live', String(M.length), 'playable locations', 'g');
    h += '</div>';

    if (P.wipe_note) {
      h += '<div class="rcard" style="border-left-color:var(--orange);margin:0 0 22px">';
      h += '<h4>Was there a wipe?</h4><p style="color:var(--txt2);font-size:13px">' + esc(P.wipe_note) + '</p></div>';
    }

    if (K) {
      h += '<p class="eyebrow" style="margin-top:8px">Endgame</p>';
      h += '<div class="mcard" style="margin:0 0 26px"><div class="mtop"><h3>' + esc(K.title) + '</h3>';
      h += '<div class="mspecs"><span>' + esc(K.note) + '</span></div></div><div class="mbody">';
      h += row('Requirements', '<ul class="dl">' + (K.req || []).map(function (r) {
        return '<li>' + esc(r) + '</li>';
      }).join('') + '</ul>');
      if (K.reward) h += row('Reward', '<span class="pill loot">' + esc(K.reward) + '</span>', 1);
      if (K.reality) h += '<div class="tipbox"><span class="lab">Where the real wall is</span>' + esc(K.reality) + '</div>';
      if (K.caveat) h += '<div class="tipbox" style="border-color:rgba(180,69,58,.35);background:rgba(180,69,58,.06);border-left-color:var(--red)">' +
        '<span class="lab" style="color:var(--red)">Conflicting sources — verify</span>' + esc(K.caveat) + '</div>';
      h += '<div class="links"><a class="lk" target="_blank" rel="noopener" href="' + esc(K.wiki) + '">Collector wiki ↗</a>' +
        '<button class="lk" data-kappafilter="1">Show the 4 prerequisite quests →</button></div>';
      h += '</div></div>';
    }

    h += '<p class="eyebrow">Changes and traps</p>';
    h += '<div class="rgrid" style="grid-template-columns:repeat(auto-fill,minmax(360px,1fr))">';
    (DATA.CHANGES || []).forEach(function (c) {
      var upcoming = /upcoming|not live/i.test(c.tag || '');
      var trap = /trap/i.test(c.tag || '');
      var col = upcoming ? 'var(--purple)' : trap ? 'var(--red)' : 'var(--blue)';
      h += '<div class="rcard" style="border-left-color:' + col + '">';
      h += '<h4>' + esc(c.topic) + '</h4>';
      if (c.tag) h += '<span class="tag" style="color:' + col + ';border-color:' + col + ';margin-bottom:9px;display:inline-block">' + esc(c.tag) + '</span>';
      h += '<p style="color:var(--txt2);font-size:12.5px;margin-top:8px">' + esc(c.detail) + '</p></div>';
    });
    h += '</div>';

    el('metaOut').innerHTML = h;
    var kb = el('metaOut').querySelector('[data-kappafilter]');
    if (kb) kb.addEventListener('click', function () {
      el('qSearch').value = ''; el('fTrader').value = ''; el('fMap').value = '';
      el('fKappa').checked = true; el('fSort').value = 'difficulty';
      renderQuests(); showPane('quests');
    });
  }

  function renderResources() {
    el('rOut').innerHTML = (DATA.RESOURCES || []).map(function (r) {
      return '<div class="rcard"><h4>' + esc(r.name) + '</h4><p>' + esc(r.what) + '</p>' +
        '<a class="lk" target="_blank" rel="noopener" href="' + esc(r.url) + '">Open ↗</a></div>';
    }).join('');
  }

  /* ── tabs ── */
  var PANES = ['myths','quests','maps','keys','edge','paths','progress','meta','resources'];
  function showPane(name, skipHash) {
    if (PANES.indexOf(name) === -1) name = 'quests';
    if (!skipHash && location.hash.slice(1) !== name) {
      try { history.replaceState(null, '', '#' + name); } catch (e) { location.hash = name; }
    }
    [].forEach.call(document.querySelectorAll('.tab'), function (t) { t.classList.toggle('on', t.dataset.pane === name); });
    [].forEach.call(document.querySelectorAll('.pane'), function (p) { p.classList.toggle('on', p.id === 'pane-' + name); });
    if (name === 'maps') renderMaps();
    if (name === 'progress') renderProgress();
    if (name === 'meta') renderMeta();
    if (name === 'paths') renderPaths();
    if (name === 'keys') renderKeys();
    if (name === 'edge') renderEdge();
    if (name === 'myths') renderMyths();
    if (!skipHash) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── events ── */
  function wire() {
    el('tabs').addEventListener('click', function (e) {
      var t = e.target.closest('.tab'); if (t) showPane(t.dataset.pane);
    });

    ['qSearch', 'fTrader', 'fMap', 'fDiff', 'fSort', 'fAvail', 'fKappa', 'fHide'].forEach(function (id) {
      el(id).addEventListener(id === 'qSearch' ? 'input' : 'change', renderQuests);
    });
    ['mSearch', 'mSort', 'mStarter'].forEach(function (id) {
      el(id).addEventListener(id === 'mSearch' ? 'input' : 'change', renderMaps);
    });

    el('lvl').addEventListener('input', function () {
      var v = parseInt(this.value, 10);
      S.level = isNaN(v) ? 1 : Math.max(1, Math.min(79, v));
      save(); renderQuests();
      if (el('pane-progress').classList.contains('on')) renderProgress();
    });

    el('qOut').addEventListener('click', function (e) {
      var cb = e.target.closest('[data-done]');
      if (cb) {
        var id = cb.dataset.done;
        if (cb.checked) S.done[id] = 1; else delete S.done[id];
        save(); renderQuests();
        e.stopPropagation(); return;
      }
      var g = e.target.closest('[data-group]');
      if (g) {
        var gid = g.dataset.group;
        if (S.closedGroups[gid]) delete S.closedGroups[gid]; else S.closedGroups[gid] = 1;
        save(); renderQuests(); return;
      }
      var head = e.target.closest('[data-toggle]');
      if (head) {
        var qid = head.dataset.toggle;
        if (S.open[qid]) delete S.open[qid]; else S.open[qid] = 1;
        head.parentNode.classList.toggle('open', !!S.open[qid]);
      }
    });

    el('mOut').addEventListener('click', function (e) {
      var fig = e.target.closest('[data-lb]');
      if (fig) { lbOpen(fig.dataset.lb, parseInt(fig.dataset.i, 10) || 0); return; }
      var b = e.target.closest('[data-mapquests]');
      if (!b) return;
      el('fMap').value = b.dataset.mapquests;
      el('fSort').value = 'level'; el('qSearch').value = '';
      renderQuests(); showPane('quests');
    });
    ['kSearch', 'kMap', 'kTier', 'kHideSkip'].forEach(function (id) {
      var n = el(id); if (n) n.addEventListener(id === 'kSearch' ? 'input' : 'change', renderKeys);
    });
    el('keysOut').addEventListener('click', function (e) {
      var g = e.target.closest('[data-group]');
      if (g) {
        var gid = g.dataset.group;
        if (S.closedGroups[gid]) delete S.closedGroups[gid]; else S.closedGroups[gid] = 1;
        save(); renderKeys(); return;
      }
      var kh = e.target.closest('[data-ktoggle]');
      if (kh) {
        var kid = kh.dataset.ktoggle;
        if (S.openKeys[kid]) delete S.openKeys[kid]; else S.openKeys[kid] = 1;
        kh.parentNode.classList.toggle('open', !!S.openKeys[kid]);
      }
    });

    ['pathsOut', 'extrasOut'].forEach(function (host) {
      el(host).addEventListener('click', function (e) {
        var cb = e.target.closest('[data-pathdone]');
        if (!cb) return;
        var id = cb.dataset.pathdone;
        if (cb.checked) S.done[id] = 1; else delete S.done[id];
        save(); renderPaths(); renderQuests();
      });
    });

    el('pOut').addEventListener('click', function (e) {
      var b = e.target.closest('[data-traderquests]');
      if (!b) return;
      el('fTrader').value = b.dataset.traderquests;
      el('fMap').value = ''; el('qSearch').value = '';
      renderQuests(); showPane('quests');
    });

    el('expandAll').addEventListener('click', function () {
      var anyClosed = Q.some(function (q) { return !S.open[q.id]; });
      S.open = {};
      if (anyClosed) Q.forEach(function (q) { S.open[q.id] = 1; });
      this.textContent = anyClosed ? 'Collapse' : 'Expand';
      renderQuests();
    });

    el('resetBtn').addEventListener('click', function () {
      if (!confirm('Clear all quest completion and reset level to 1?')) return;
      S.done = {}; S.level = 1; S.closedGroups = {};
      el('lvl').value = 1; save(); renderQuests(); toast('Progress cleared');
    });
    el('exportBtn').addEventListener('click', function () {
      var blob = JSON.stringify({ v: 1, level: S.level, done: Object.keys(S.done) });
      navigator.clipboard && navigator.clipboard.writeText(blob).then(
        function () { toast('Progress copied to clipboard'); },
        function () { prompt('Copy your progress:', blob); }
      ) || prompt('Copy your progress:', blob);
    });
    el('importBtn').addEventListener('click', function () {
      var raw = prompt('Paste exported progress JSON:');
      if (!raw) return;
      try {
        var p = JSON.parse(raw);
        S.done = {}; (p.done || []).forEach(function (id) { S.done[id] = 1; });
        S.level = p.level || 1; el('lvl').value = S.level;
        save(); renderQuests(); toast('Progress imported');
      } catch (e) { toast('That JSON did not parse'); }
    });

    el('lbClose').addEventListener('click', lbClose);
    el('lbZoom').addEventListener('click', lbToggleZoom);
    el('lbPrev').addEventListener('click', function () { lbStep(-1); });
    el('lbNext').addEventListener('click', function () { lbStep(1); });
    el('lbImg').addEventListener('click', lbToggleZoom);
    el('lb').addEventListener('click', function (e) { if (e.target === this) lbClose(); });

    // drag to pan when zoomed
    (function () {
      var st = el('lbStage'), down = false, sx = 0, sy = 0, l = 0, t = 0;
      st.addEventListener('mousedown', function (e) {
        down = true; sx = e.pageX; sy = e.pageY; l = st.scrollLeft; t = st.scrollTop;
        e.preventDefault();
      });
      document.addEventListener('mouseup', function () { down = false; });
      document.addEventListener('mousemove', function (e) {
        if (!down) return;
        st.scrollLeft = l - (e.pageX - sx);
        st.scrollTop = t - (e.pageY - sy);
      });
    })();

    document.addEventListener('keydown', function (e) {
      if (el('lb').classList.contains('on')) {
        if (e.key === 'Escape') { lbClose(); return; }
        if (e.key === 'ArrowRight') { lbStep(1); return; }
        if (e.key === 'ArrowLeft') { lbStep(-1); return; }
        if (e.key === ' ' || e.key === 'z') { e.preventDefault(); lbToggleZoom(); return; }
        return;
      }
      if (e.target.matches('input,select,textarea')) {
        if (e.key === 'Escape') { e.target.value = ''; renderQuests(); renderMaps(); e.target.blur(); }
        return;
      }
      if (e.key === '/') { e.preventDefault(); showPane('quests'); el('qSearch').focus(); }
      var panes = { '1': 'myths', '2': 'quests', '3': 'maps', '4': 'keys', '5': 'edge', '6': 'paths', '7': 'progress', '8': 'meta' };
      if (panes[e.key]) showPane(panes[e.key]);
    });
  }

  /* ── boot ── */
  function boot() {
    load();
    el('lvl').value = S.level;
    el('patchTag').textContent = DATA.PATCH.tag;
    el('dataStamp').textContent = 'Data verified ' + DATA.STAMP + ' · ' + (DATA.PATCH.version || '');
    var nm = el('nMeta'); if (nm) nm.textContent = (DATA.CHANGES || []).length;
    var np = el('nPaths'); if (np) np.textContent = (DATA.PATHS || []).length;
    var nm2 = el('nMyths'); if (nm2) nm2.textContent = ((DATA.MYTHS||{}).items||[]).length;

    T.forEach(function (t) {
      el('fTrader').insertAdjacentHTML('beforeend', '<option value="' + esc(t.name) + '">' + esc(t.name) + '</option>');
    });
    M.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (m) {
      el('fMap').insertAdjacentHTML('beforeend', '<option value="' + esc(m.name) + '">' + esc(m.name) + '</option>');
    });

    (DATA.KEYS && DATA.KEYS.maps ? DATA.KEYS.maps : []).forEach(function (mk) {
      el('kMap').insertAdjacentHTML('beforeend', '<option value="' + esc(mk.map) + '">' + esc(mk.map) + '</option>');
    });
    var nk = el('nKeys');
    if (nk) nk.textContent = (DATA.KEYS && DATA.KEYS.stats ? DATA.KEYS.stats.keys : 0) || '';

    wire(); renderQuests(); renderResources(); renderMyths();

    var start = location.hash.slice(1);
    showPane(PANES.indexOf(start) !== -1 ? start : 'myths', true);
    window.addEventListener('hashchange', function () {
      var n = location.hash.slice(1);
      if (PANES.indexOf(n) !== -1) showPane(n, true);
    });
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
