# Nivell d'entrada del model (ELO) que fa jugar el rival com el rival anterior a cada ROC.
# Posicions del banc amb la jugada del rival anterior; jutge = la taula de profunditat 10.
# Calibratge amb les posicions d'entrenament i validació amb les reservades (id % 3 == 0).
# D'aquí surten els punts de HUMAN_CHOICE_ROC_POINTS a core.js (§17).
# Ús: python3 -I calib_human.py features.jsonl model.json bench-short.jsonl bench-long.jsonl
import sys, json, math, numpy as np
from collections import defaultdict
feats = {}
for l in open(sys.argv[1]):
    r = json.loads(l); feats[r['id']] = r
model = json.load(open(sys.argv[2]))
W = [np.array(w) for w in model['w']]
bench = {}
for f in sys.argv[3:5]:
    for l in open(f):
        r = json.loads(l)
        if r['id'] in feats and r.get('rivalUci') in feats[r['id']]['moves']: bench[r['id']] = r
def zof(elo): return max(model['zMin'] - 2, min(model['zMax'], (elo - model['center']) / model['scale']))  # extrapola fins a 2 unitats per sota
def exp_loss(r, elo):
    X = np.array(r['x']); z = zof(elo)
    u = sum((z ** d) * (X @ W[d]) for d in range(len(W)))
    p = np.exp(u - u.max()); p /= p.sum()
    L = X[:, 0]
    return float(p @ L), float(p @ (L >= .3)), float(p @ (L < .02))
GRID = list(range(0, 2601, 50))
for split, cond in (('calibratge', lambda i: i % 3 != 0), ('validació', lambda i: i % 3 == 0)):
    by = defaultdict(list)
    for bid, b in bench.items():
        if cond(int(bid.split('|')[2])): by[b['band']].append(b)
    print(f'\n== {split}')
    for band in ['<1000', '1000-1399', '1400-1799', '1800-2199']:
        rs = by[band]
        roc = np.mean([min(2000, b['elo']) for b in rs])
        rival = np.mean([feats[b['id']]['x'][feats[b['id']]['moves'].index(b['rivalUci'])][0] for b in rs])
        human = np.mean([feats[b['id']]['x'][feats[b['id']]['human']][0] for b in rs])
        curve = [(e, np.mean([exp_loss(feats[b['id']], e)[0] for b in rs])) for e in GRID]
        sol = None
        for (e0, m0), (e1, m1) in zip(curve, curve[1:]):
            if (m0 - rival) * (m1 - rival) <= 0 and m0 != m1: sol = e0 + (e1 - e0) * (m0 - rival) / (m0 - m1); break
        at = {e: m for e, m in curve}
        print(f"{band:<10} n {len(rs)} ROC ~{roc:.0f}: rival anterior {rival:.3f}, persona {human:.3f}; model a ELO 0/400/800/1200/1600/2000: "
              + ' '.join(f'{at[e]:.3f}' for e in (0, 400, 800, 1200, 1600, 2000)) + f"  -> nivell {('%.0f' % sol) if sol is not None else 'fora del rang'}")
