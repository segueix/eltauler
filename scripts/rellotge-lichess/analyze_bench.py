# Persona contra rival a les MATEIXES posicions, jutjats pel mateix motor.
# Ús: python3 -I analyze_bench.py bench.jsonl [bench2.jsonl ...]
import sys, json, math
from collections import defaultdict

def wc(cp):
    return 2 / (1 + math.exp(-0.00368208 * max(-10000, min(10000, cp)))) - 1

rows = []
for f in sys.argv[1:]:
    for l in open(f):
        r = json.loads(l)
        if 'error' in r or r.get('root') is None or r.get('human') is None or r.get('rival') is None:
            continue
        rows.append(r)
BANDS = ['<1000', '1000-1399', '1400-1799', '1800-2199']
TCS = ['30s', '1+0', '3+2', '5+0', '10+0', '15+10']
cells = defaultdict(list)
for r in rows:
    cells[(r['tc'], r['band'])].append(r)
    cells[('TOTS', r['band'])].append(r)

def stats(rs):
    n = len(rs)
    h = [wc(r['root']) - wc(r['human']) >= 0.3 for r in rs]
    v = [wc(r['root']) - wc(r['rival']) >= 0.3 for r in rs]
    hl = [r['lossLichess'] >= 0.3 for r in rs]
    d = [int(b) - int(a) for a, b in zip(h, v)]
    mean = sum(d) / n
    sd = math.sqrt(sum((x - mean) ** 2 for x in d) / max(1, n - 1))
    return n, sum(h) / n, sum(hl) / n, sum(v) / n, mean, 1.96 * sd / math.sqrt(n), \
        sum(r['ms'] for r in rs) / n, sum(r['maxDepth'] for r in rs) / n, sum(r['roc'] for r in rs) / n

print(f"{'ritme':<6} {'franja':<10} {'n':>4} {'ROC':>5} {'persona':>8} {'(Lichess)':>9} {'rival':>7} {'rival-persona':>15} {'ms':>6} {'prof':>5}")
for tc in TCS + ['TOTS']:
    for b in BANDS:
        rs = cells.get((tc, b))
        if not rs:
            continue
        n, h, hl, v, d, ci, ms, dep, roc = stats(rs)
        print(f"{tc:<6} {b:<10} {n:>4} {roc:>5.0f} {h*100:>7.1f}% {hl*100:>8.1f}% {v*100:>6.1f}% {d*100:>+8.1f}±{ci*100:>4.1f} {ms:>6.0f} {dep:>5.1f}")
    print()
