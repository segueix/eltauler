# Rival amb el model de tria humana (benchhuman.js) contra el rival anterior (bench.js) i la persona,
# a les mateixes posicions i amb el mateix jutge: la taula de totes les jugades a profunditat 10.
# Ús: python3 -I analyze_human.py features.jsonl bench-human.jsonl bench-short.jsonl bench-long.jsonl
import sys, json, random
from collections import defaultdict
feats = {}
for l in open(sys.argv[1]):
    r = json.loads(l); feats[r['id']] = r
new = {}
for l in open(sys.argv[2]):
    r = json.loads(l)
    if 'move' in r and r['id'] in feats: new[r['id']] = r
old = {}
for f in sys.argv[3:5]:
    for l in open(f):
        r = json.loads(l)
        if r['id'] in new: old[r['id']] = r

def loss(f, uci):
    return f['x'][f['moves'].index(uci)][0] if uci in f['moves'] else None

rows = defaultdict(list)
for i, b in new.items():
    f = feats[i]; o = old.get(i)
    ln, lo, lh = loss(f, b['move']), loss(f, o['rivalUci']) if o else None, f['x'][f['human']][0]
    if ln is None or lo is None: continue
    h = f['moves'][f['human']]
    rec = dict(new=ln, old=lo, hum=lh, mnew=b['move'] == h, mold=o['rivalUci'] == h)
    rows[f['band']].append(rec); rows['TOTES'].append(rec)

def ci(xs, stat, n=1000):
    rnd = random.Random(5); vals = sorted(stat([xs[rnd.randrange(len(xs))] for _ in xs]) for _ in range(n))
    return vals[int(.025 * n)], vals[int(.975 * n)]

print(f"{'franja':<10} {'n':>5} | pèrdua mitjana: persona / anterior / model [IC95 dif.] | greus % pers/ant/model | exactes % pers/ant/model | encert jugada humana % ant/model")
for band in ['<1000', '1000-1399', '1400-1799', '1800-2199', 'TOTES']:
    xs = rows[band]
    if not xs: continue
    n = len(xs)
    m = lambda k: sum(x[k] for x in xs) / n
    sev = lambda k: sum(x[k] >= .3 for x in xs) / n * 100
    ex = lambda k: sum(x[k] < .02 for x in xs) / n * 100
    lo, hi = ci(xs, lambda s: sum(x['new'] - x['old'] for x in s) / len(s))
    print(f"{band:<10} {n:>5} | {m('hum'):.3f} / {m('old'):.3f} / {m('new'):.3f} [{lo:+.3f}, {hi:+.3f}] | "
          f"{sev('hum'):4.1f} {sev('old'):4.1f} {sev('new'):4.1f} | {ex('hum'):4.1f} {ex('old'):4.1f} {ex('new'):4.1f} | "
          f"{sum(x['mold'] for x in xs)/n*100:4.1f} {sum(x['mnew'] for x in xs)/n*100:4.1f}")

b = list(new.values())
def pct(v, q): v = sorted(v); return v[min(len(v) - 1, int(q * len(v)))]
for k in ('searchMs', 'chooseMs', 'depthUsed'):
    v = [r[k] for r in b]
    print(f"{k}: mediana {pct(v, .5)}, p90 {pct(v, .9)}, p99 {pct(v, .99)}, màx {max(v)}")
print('cerques amb totes les jugades puntuades:', sum(r['nCands'] == r['legal'] for r in b), '/', len(b),
      '| amb teoria disponible:', sum(r['book'] > 0 for r in b))
