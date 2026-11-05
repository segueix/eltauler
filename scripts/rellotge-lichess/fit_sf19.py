# Nivell de Stockfish 19 que juga com el motor anterior a cada ROC: per a cada
# franja, la pèrdua mitjana del rival SF19 a cada nivell de la graella contra la
# del rival anterior a les MATEIXES posicions; s'interpola el nivell on
# coincideixen. Interval per bootstrap de posicions.
# Ús: python3 -I fit_sf19.py grid.jsonl bench-short.jsonl bench-long.jsonl
import sys, json, math, random
from collections import defaultdict
def wc(cp): return 2 / (1 + math.exp(-0.00368208 * max(-10000, min(10000, cp)))) - 1
grid = [json.loads(l) for l in open(sys.argv[1])]
grid = [r for r in grid if 'error' not in r and None not in (r.get('root'), r.get('rival'))]
classic = {}
for f in sys.argv[2:]:
    for l in open(f):
        r = json.loads(l)
        if 'error' not in r and None not in (r.get('root'), r.get('rival')): classic[r['id']] = r
loss = lambda r: max(0, wc(r['root']) - wc(r['rival']))
by = defaultdict(lambda: defaultdict(dict))  # band -> baseId -> level -> loss
for r in grid:
    if r['baseId'] in classic: by[r['band']][r['baseId']][r['level']] = loss(r)
def solve(ids, band_rows, levels):
    tgt = sum(loss(classic[i]) for i in ids) / len(ids)
    curve = [(lv, sum(band_rows[i][lv] for i in ids) / len(ids)) for lv in levels]
    for (l0, m0), (l1, m1) in zip(curve, curve[1:]):
        if (m0 - tgt) * (m1 - tgt) <= 0 and m0 != m1:
            return l0 + (l1 - l0) * (m0 - tgt) / (m0 - m1), tgt, curve
    return (levels[0] if tgt > curve[0][1] else levels[-1]) * (1 if True else 0), tgt, curve
out = {}
for band, rows in by.items():
    levels = sorted({lv for d in rows.values() for lv in d})
    ids = [i for i, d in rows.items() if all(lv in d for lv in levels)]
    roc = sum(classic[i]['roc'] for i in ids) / len(ids)
    s, tgt, curve = solve(ids, rows, levels)
    rnd = random.Random(3); bs = []
    for _ in range(300):
        sample = [ids[rnd.randrange(len(ids))] for _ in ids]
        bs.append(solve(sample, rows, levels)[0])
    bs.sort()
    edge = '' if curve[-1][1] <= tgt <= curve[0][1] else '  (FORA DE LA GRAELLA)'
    print(f"{band:<10} ROC ~{roc:.0f} (n {len(ids)}): pèrdua anterior {tgt:.3f}; SF19 " +
          ', '.join(f'{lv}: {m:.3f}' for lv, m in curve) + f"  -> nivell {s:.0f} (95%: {bs[7]:.0f}-{bs[292]:.0f}){edge}")
    out[band] = {'roc': round(roc), 'level': round(s), 'ci': [round(bs[7]), round(bs[292])]}
json.dump(out, open(sys.argv[1].replace('.jsonl', '-fit.json'), 'w'), indent=1)
