# Ús: python3 -I paired.py nou.jsonl [roc|nivell] [clàssic.jsonl ...]
# Compara un rival nou (fitxer amb baseId/level) amb el rival actual (bench clàssic) a les mateixes posicions.
import sys, json, math
from collections import defaultdict
def wc(cp): return 2 / (1 + math.exp(-0.00368208 * max(-10000, min(10000, cp)))) - 1
classic = {}
for f in (sys.argv[3:] or ['bench-short.jsonl', 'bench-long.jsonl']):
    for l in open(f):
        r = json.loads(l)
        if 'error' not in r and None not in (r.get('root'), r.get('rival')): classic[r['id']] = r
new = [json.loads(l) for l in open(sys.argv[1])]
new = [r for r in new if 'error' not in r and None not in (r.get('root'), r.get('rival'))]
cells = defaultdict(list)
for r in new:
    c = classic.get(r['baseId'])
    if c: cells[(r['band'], r['level'] if len(sys.argv) < 3 or sys.argv[2] != 'roc' else 'roc')].append((r, c))
print(f"{'franja':<10} {'nivell':>7} {'n':>4}  {'pèrdua actual':>13} {'nou':>6} {'dif':>13}   {'greus act':>9} {'nou':>5}   {'exactes act':>11} {'nou':>5}   {'ms':>5}")
for (b, lv), pairs in sorted(cells.items(), key=lambda k: (k[0][0], k[0][1] if isinstance(k[0][1], (int, float)) else 0)):
    n = len(pairs)
    # pèrdua jutjada amb l'arrel de CADA execució (el jutge és el mateix motor i profunditat)
    ln = [max(0, wc(r['root']) - wc(r['rival'])) for r, c in pairs]
    lc = [max(0, wc(c['root']) - wc(c['rival'])) for r, c in pairs]
    d = [a - b2 for a, b2 in zip(ln, lc)]; md = sum(d) / n
    sd = math.sqrt(sum((x - md) ** 2 for x in d) / max(1, n - 1))
    f = lambda L, fn: sum(fn(x) for x in L) / n * 100
    print(f"{b:<10} {str(lv):>7} {n:>4}  {sum(lc)/n:>13.3f} {sum(ln)/n:>6.3f} {md:>+7.3f}±{1.96*sd/math.sqrt(n):.3f}   {f(lc, lambda x: x >= .3):>8.1f}% {f(ln, lambda x: x >= .3):>4.1f}%   {f(lc, lambda x: x < .02):>10.1f}% {f(ln, lambda x: x < .02):>4.1f}%   {sum(r['ms'] for r, c in pairs)/n:>5.0f}")
