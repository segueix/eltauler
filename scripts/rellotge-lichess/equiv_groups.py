# Correspondència ROC del rival -> ELO de Lichess de la mateixa força (mateixa
# pèrdua mitjana per jugada), per grups de ritmes, amb interval al 95% per
# bootstrap (es remostregen alhora les jugades del rival i les de les persones).
# Ús: python3 -I equiv_groups.py bench-short.jsonl bench-long.jsonl
import sys, json, math, random
def wc(cp): return 2 / (1 + math.exp(-0.00368208 * max(-10000, min(10000, cp)))) - 1
rows = [json.loads(l) for f in sys.argv[1:] for l in open(f)]
rows = [r for r in rows if 'error' not in r and None not in (r.get('root'), r.get('human'), r.get('rival'))]
for r in rows:
    r['lh'] = max(0, wc(r['root']) - wc(r['human'])); r['lr'] = max(0, wc(r['root']) - wc(r['rival']))
GROUPS = {'curts': ('30s', '1+0', '3+2'), 'llargs': ('5+0', '10+0', '15+10'), 'tots': ('30s', '1+0', '3+2', '5+0', '10+0', '15+10')}
def equiv(sub, band):
    rv = [r for r in sub if r['band'] == band]
    m = sum(r['lr'] for r in rv) / len(rv)
    # corba humana suavitzada: pèrdua mitjana en finestres de 300 punts cada 25
    curve = []
    for lo in range(700, 2000, 25):
        w = [r['lh'] for r in sub if lo <= r['elo'] < lo + 300]
        if len(w) >= 300: curve.append((lo + 150, sum(w) / len(w)))
    best = min(curve, key=lambda c: abs(c[1] - m))
    inside = abs(best[1] - m) < 0.006
    return best[0] if inside else None, m
B = 120
for name, tcs in GROUPS.items():
    sub = [r for r in rows if r['tc'] in tcs]
    for band in ('<1000', '1000-1399', '1400-1799', '1800-2199'):
        roc = sum(r['roc'] for r in sub if r['band'] == band) / sum(1 for r in sub if r['band'] == band)
        e, m = equiv(sub, band)
        rnd = random.Random(7); bs = []
        for _ in range(B):
            s = [sub[rnd.randrange(len(sub))] for _ in sub]
            bs.append(equiv(s, band)[0])
        ok = sorted(x for x in bs if x is not None)
        out = f'fora de les dades ({sum(x is None for x in bs)}/{B} rèpliques)' if e is None else \
            f'Lichess ~{e}  (95%: {ok[int(.025*len(ok))]}-{ok[int(.975*len(ok))-1]}; {sum(x is None for x in bs)}/{B} fora)'
        print(f'{name:<7} ROC ~{roc:.0f}: pèrdua {m:.3f} -> {out}')
