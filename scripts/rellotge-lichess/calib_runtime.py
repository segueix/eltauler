# Nivell del model de tria humana per ROC (§17) amb el que el model veu a l'app: probabilitats amb
# els trets de la CERCA REAL (build_runtime.js) i pèrdua jutjada amb la taula de profunditat 10
# (features.jsonl de build_features.js). L'objectiu per franja és la pèrdua mitjana del rival anterior
# a les mateixes posicions. Calibratge amb id % 3 != 0 i validació amb id % 3 == 0 (els grups de
# l'ajust). Amb els punts de core.js, també la taula de totes les posicions (esperances, no un sorteig).
# Ús: python3 -I calib_runtime.py features.jsonl runtime-features.jsonl model.json bench-short.jsonl bench-long.jsonl \
#        '[[872,400],[1226,481],[1604,940],[1942,1720]]'
import sys, json, numpy as np
judge, human = {}, {}
for l in open(sys.argv[1]):
    r = json.loads(l); judge[r['id']] = dict(zip(r['moves'], [x[0] for x in r['x']])); human[r['id']] = r['moves'][r['human']]
model = json.load(open(sys.argv[3])); W = [np.array(w) for w in model['w']]
old = {}
for f in sys.argv[4:6]:
    for l in open(f):
        r = json.loads(l); old[r['id']] = r
POINTS = json.loads(sys.argv[6]) if len(sys.argv) > 6 else None

def elo_for(roc):
    P = POINTS; i = 0
    while i < len(P) - 2 and roc > P[i + 1][0]: i += 1
    (r0, e0), (r1, e1) = P[i], P[i + 1]
    return round(e0 + (e1 - e0) * (roc - r0) / (r1 - r0))

rows = []
for l in open(sys.argv[2]):
    r = json.loads(l); J = judge.get(r['id']); o = old.get(r['id'])
    if not J or not o or o['rivalUci'] not in J or any(m not in J for m in r['moves']): continue
    rows.append(dict(band=r['band'], roc=r['roc'], X=np.array(r['x']), L=np.array([J[m] for m in r['moves']]),
                     moves=r['moves'], old=J[o['rivalUci']], oldMatch=o['rivalUci'] == human[r['id']],
                     hum=J[human[r['id']]], humMove=human[r['id']],
                     split='val' if int(r['id'].split('|')[2]) % 3 == 0 else 'cal'))

def probs(row, elo):
    z = min(model['zMax'], max(model['zMin'], (elo - model['center']) / model['scale']))
    u = sum((z ** d) * (row['X'] @ W[d]) for d in range(len(W))); p = np.exp(u - u.max()); return p / p.sum()

GRID = list(range(400, 3301, 25))
BANDS = ['<1000', '1000-1399', '1400-1799', '1800-2199']
rng = np.random.default_rng(11)
def ci(d):
    bs = d[rng.integers(0, len(d), (2000, len(d)))].mean(1); return np.percentile(bs, [2.5, 97.5])
for split in ('cal', 'val'):
    print(f'\n== {split}')
    for band in BANDS:
        rs = [r for r in rows if r['split'] == split and r['band'] == band]
        if not rs: continue
        target = np.mean([r['old'] for r in rs])
        curve = [(e, np.mean([float(probs(r, e) @ r['L']) for r in rs])) for e in GRID]
        sol = None
        for (e0, m0), (e1, m1) in zip(curve, curve[1:]):
            if (m0 - target) * (m1 - target) <= 0 and m0 != m1: sol = e0 + (e1 - e0) * (m0 - target) / (m0 - m1); break
        line = f"{band:<10} n {len(rs):4d} ROC ~{np.mean([r['roc'] for r in rs]):.0f}: anterior {target:.3f} -> nivell " + \
               (f'{sol:.0f}' if sol is not None else ('<400' if curve[0][1] < target else 'fora del rang'))
        if POINTS:
            d = np.array([float(probs(r, elo_for(r['roc'])) @ r['L']) - r['old'] for r in rs]); lo, hi = ci(d)
            line += f" | amb els punts: dif {d.mean():+.3f} (IC95 {lo:+.3f} a {hi:+.3f})"
        print(line)

if POINTS:
    print('\n== totes les posicions, amb els punts')
    print('franja | n | ROC | pèrdua pers / anterior / model [dif, IC95] | greus % pers/ant/model | exactes % pers/ant/model | encert jugada humana % ant/model')
    for band in BANDS + ['totes']:
        rs = [r for r in rows if band == 'totes' or r['band'] == band]
        a = []
        for r in rs:
            p = probs(r, elo_for(r['roc'])); L = r['L']
            ph = p[r['moves'].index(r['humMove'])] if r['humMove'] in r['moves'] else 0.0
            a.append([r['hum'], r['old'], float(p @ L), r['hum'] >= .3, r['old'] >= .3, float(p @ (L >= .3)),
                      r['hum'] < .02, r['old'] < .02, float(p @ (L < .02)), r['oldMatch'], ph, r['roc']])
        a = np.array(a, float); m = a.mean(0); d = a[:, 2] - a[:, 1]; lo, hi = ci(d)
        print(f"{band} | {len(a)} | {m[11]:.0f} | {m[0]:.3f} / {m[1]:.3f} / {m[2]:.3f} [{d.mean():+.3f}, {lo:+.3f} a {hi:+.3f}] | "
              f"{m[3]*100:.1f} / {m[4]*100:.1f} / {m[5]*100:.1f} | {m[6]*100:.1f} / {m[7]*100:.1f} / {m[8]*100:.1f} | "
              f"{m[9]*100:.1f} / {m[10]*100:.1f}")
