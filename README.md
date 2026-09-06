# Tarkov Companion

A single-file, offline-capable companion for **Escape from Tarkov** — built against patch `1.1.0.1.46911` (Season 1: KORD BREACH) and verified on 6 September 2026.

**→ [Open the app](https://alockwood-lab.github.io/tarkov-companion/)**

No install, no account, no tracking. Progress saves to your own browser via `localStorage`. You can also download [`tarkov-companion.html`](tarkov-companion.html) and open it offline — it's fully self-contained.

---

## Why this exists

Most Tarkov tools reformat the wiki. This one tries to do the two things a wiki structurally cannot:

1. **Tell you what changed under you.** Patch 1.1.0.0 reworked quests, Kappa, insurance, trader loyalty and the economy. If your knowledge is from 2024–2025, a lot of it is now wrong in specific, expensive ways.
2. **Compute across the whole dataset.** A wiki stores facts one page at a time. It never divides price by durability across 254 keys, never compares a trader buy-back to a flea ask, and never cross-references every key's loot table against every other key's name.

## What's in it

| Tab | What it does |
|---|---|
| **Start here** | 20 red/green pairs: what players still believe vs what the wiki says today. Each row cites where to verify it. |
| **Quests** | 89 quests with wiki-exact objectives, real gates, trader rep rewards and route tips. |
| **Maps** | All 13 live maps with boss threat, loot runs, keys, and 21 embedded community 2D/3D map images (zoomable). |
| **Keys** | All 254 keys across 13 maps — loot behind each door, precise door location, where the key itself spawns, price, uses, container eligibility. |
| **Edge** | Computed: cost-per-open ranked, vendor arbitrage, the key dependency graph, and a loot→cheapest-door reverse index. |
| **Unlock paths** | Kappa and Lightkeeper as tickable step-by-step chains, plus the 44-item Collector checklist. |
| **Progression** | Level milestones, per-trader LL4 routes, Scav karma table. |
| **Patch state** | The 13 things 1.1.0.0 changed, and what's coming in 1.1.5.0 (clearly labelled not-live). |

## A few findings

- **Shooter Born in Heaven is a Mechanic quest**, not Jaeger's. Gated purely on Mechanic LL4, no prerequisite quest.
- **Kappa's long checklist is gone.** Collector names four prerequisite quests; the real wall is LL4 rep with seven traders.
- **Key barters inverted.** Trader buy prices rose ~25% in 1.1.0.0, so Therapist LL1 for the Dorm 206 key costs ~106,000 ₽ of goods against a 10,000 ₽ flea price.
- **Keys are on the Uninsurable Items list** — in every mode, and always were. The secure container is the only protection, and nearly every key fits it.
- **Cost-per-open spans 98,000×**, from ZB-014 at 51 ₽ to Prapor's letter at 5,000,000 ₽. The Reserve marked keys are 10-use, making them the most expensive doors in the game per entry.

## Verification

- All **135 quest/map wiki links** and **63 embedded images** return HTTP 200.
- Quest data is scraped directly from the Fandom MediaWiki API, not hand-written — see [`scrape_quests.py`](scrape_quests.py). That pass corrected 12 wrong traders and 16 wrong level requirements.
- Key research was fanned out one agent per map, each followed by an **adversarial verifier** whose priority was catching dead links and rooms 1.x permanently unlocked. 187 corrections were raised; they're attached to the individual keys so you see both the claim and the challenge.
- Four maps (Interchange, Factory, Ground Zero, Icebreaker) are badged **low confidence** where the verifier judged more than a third of entries problematic.
- Prices are single-market snapshots and **durability data is the weakest link** — the current wiki infobox no longer renders max-uses, so treat use counts as unverified.

Where something couldn't be confirmed it says so rather than guessing.

## Build

Data lives in JSON fragments; the HTML is assembled from them.

```bash
python3 scrape_quests.py     # pull quest facts from the wiki API
python3 apply_wikifacts.py   # apply them to quests.json
python3 derive.py            # compute cost-per-open, graph, arbitrage, loot index
python3 assemble.py          # JSON fragments -> data.js
./build.sh                   # inline everything -> tarkov-companion.html
```

## Corrections welcome

If a number here is wrong, open an issue with the wiki page that disproves it. Being wrong in public and fixed quickly beats being vague.

---

Not affiliated with Battlestate Games. Map images are community work hosted on the [Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com/) and credited in-app with links back to their source pages.
