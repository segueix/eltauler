# Distribució de pèrdues (probabilitat de guanyar) persona contra rival, mateixes posicions.
import sys, json, math
from collections import defaultdict
def wc(cp): return 2 / (1 + math.exp(-0.00368208 * max(-10000, min(10000, cp)))) - 1
rows = [json.loads(l) for f in sys.argv[1:] for l in open(f)]
rows = [r for r in rows if 'error' not in r and None not in (r.get('root'), r.get('human'), r.get('rival'))]
cells = defaultdict(list)
for r in rows:
    cells[r['band']].append(r)
    cells[(r['tc'], r['band'])].append(r)
TH = [0.05, 0.10, 0.20, 0.30, 0.50]
def prof(rs, who):
    ls = [max(0.0, wc(r['root']) - wc(r[who])) for r in rs]
    return sum(ls) / len(ls), [sum(l >= t for l in ls) / len(ls) for t in TH], sum(l < 0.02 for l in ls) / len(ls)
print('franja / ritme        qui      pèrdua mitjana   >=0,05  >=0,10  >=0,20  >=0,30  >=0,50   ~exacta(<0,02)')
keys = ['<1000', '1000-1399', '1400-1799', '1800-2199']
for k in keys + [(tc, b) for tc in ['30s','1+0','3+2','5+0','10+0','15+10'] for b in keys]:
    rs = cells.get(k)
    if not rs: continue
    for who in ('human', 'rival'):
        m, ps, ex = prof(rs, who)
        print(f"{str(k):<22} {('persona' if who=='human' else 'rival'):<8} {m:>10.4f}      " + '  '.join(f'{p*100:5.1f}%' for p in ps) + f'   {ex*100:5.1f}%')
    print()
