# Excés d'errades greus per jugada segons el rellotge que queda, respecte del
# MATEIX nivell i el MATEIX tram de jugada amb el rellotge còmode.
#   excés(c) = sum_m n(m,c) * (taxa(m,c) - taxa_còmode(m)) / sum_m n(m,c)
# També el factor observat/esperat. Interval al 95% per bootstrap de cel·les no;
# s'usa l'error binomial de l'observat (dominant).
import sys, json, math
from collections import defaultdict

d = json.load(open(sys.argv[1]))
tcs = sys.argv[2].split(',') if len(sys.argv) > 2 else ['30s', '1+0', '3+2', '5+0']
metric = sys.argv[3] if len(sys.argv) > 3 else 'all'   # all | bal
thr = sys.argv[4] if len(sys.argv) > 4 else '30'       # 30 (greu) | 20 (errada)
COMFORT = {'30s': 10, '1+0': 20, '3+2': 30, '5+0': 30}
BANDS = ['<1000', '1000-1399', '1400-1799', '1800-2199', '>=2200']
ni, ei = (0, 1) if metric == 'all' else (4, 5)
if metric == 'unbal':
    for v in d['stats'].values():
        v.append(v[0]-v[4]); v.append(v[1]-v[5])
    ni, ei = 6, 7
if thr == '20':
    assert metric == 'all'; ni, ei = 0, 2
print(f"partides {d['games_seen']}, amb avaluació {d['eval_games']}; mètrica {metric}, llindar {thr}")

def lo(b):
    return float(b.split('-')[0])

out = {}
for tc in tcs:
    cells = defaultdict(lambda: [0] * 8)
    for key, v in d['stats'].items():
        t, band, mb, cb = key.split('|')
        if t == tc:
            c = cells[(band, mb, cb)]
            for i in range(len(v)):
                c[i] += v[i]
    cbs = sorted({k[2] for k in cells}, key=lo)
    print(f'\n===== {tc} (còmode: >= {COMFORT[tc]} s) =====')
    print('franja       ' + ''.join(f'{cb:>13}' for cb in cbs))
    pooled = defaultdict(lambda: [0, 0.0, 0.0])  # cb -> n, obs, exp
    base_rates = {}
    for band in BANDS + ['TOTES']:
        bands = BANDS if band == 'TOTES' else [band]
        ref = {}
        for (b, mb, cb), v in cells.items():
            if b in bands and lo(cb) >= COMFORT[tc]:
                r = ref.setdefault(mb, [0, 0]); r[0] += v[ni]; r[1] += v[ei]
        # taxa base (rellotge còmode, totes les jugades)
        bn = sum(r[0] for r in ref.values()); be = sum(r[1] for r in ref.values())
        base_rates[band] = be / bn if bn else None
        cols = []
        for cb in cbs:
            n = obs = exp = 0
            for (b, mb, c), v in cells.items():
                if b in bands and c == cb and v[ni] and mb in ref and ref[mb][0] >= 200:
                    n += v[ni]; obs += v[ei]; exp += v[ni] * ref[mb][1] / ref[mb][0]
            if n >= 400:
                excess = (obs - exp) / n
                se = math.sqrt(max(obs, 1)) / n
                cols.append(f'{excess*100:+5.1f}±{1.96*se*100:3.1f}')
                if band == 'TOTES':
                    out.setdefault(tc, {})[cb] = {'n': n, 'excess': excess, 'ratio': obs / exp if exp else None, 'se': se}
            else:
                cols.append('-')
        print(f'{band:<13}' + ''.join(f'{c:>13}' for c in cols))
    print('taxa base (còmode): ' + ', '.join(f'{b} {r*100:.1f}%' for b, r in base_rates.items() if r is not None))
    if tc in out:
        print('factor obs/esp (totes): ' + ', '.join(f"{cb}: x{v['ratio']:.2f}" for cb, v in out[tc].items()))
json.dump(out, open(sys.argv[1].replace('.json', f'-excess-{metric}-{thr}.json'), 'w'), indent=1)
