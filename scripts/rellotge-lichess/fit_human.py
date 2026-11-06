# Model de tria humana (§17): logit condicional amb pesos polinòmics en l'ELO.
#   u(jugada) = x · (w0 + z·w1 [+ z²·w2]),  z = (ELO - 1500) / 500 (retallat al rang de dades)
#   P(jugada) = softmax(u) entre les jugades legals de la posició
# Ajust per màxima versemblança (L-BFGS, L2 = 1e-3) amb un terç de les posicions reservat (id % 3 == 0).
# DEG=1 (el de core.js) o DEG=2. Cal numpy i scipy.
# Ús: DEG=1 python3 -I fit_human.py features.jsonl model.json [bench-short.jsonl bench-long.jsonl]
import sys, json, math, numpy as np
from scipy.optimize import minimize
from collections import defaultdict

rows = [json.loads(l) for l in open(sys.argv[1])]
K = len(rows[0]['x'][0])
Z_MIN, Z_MAX = -2.2, 3.6
def zof(elo): return min(Z_MAX, max(Z_MIN, (elo - 1500) / 500))

def pack(sel):
    X = np.concatenate([np.array(r['x'], np.float64) for r in sel])
    seg = np.concatenate([[0], np.cumsum([len(r['x']) for r in sel])])[:-1]
    z = np.concatenate([np.full(len(r['x']), zof(r['elo'])) for r in sel])
    hum = seg + np.array([r['human'] for r in sel])
    return X, seg, z, hum
train = [r for r in rows if int(r['id'].split('|')[2]) % 3 != 0]
test = [r for r in rows if int(r['id'].split('|')[2]) % 3 == 0]
Xt, segt, zt, humt = pack(train)
LAMBDA = 1e-3

DEG = int(__import__('os').environ.get('DEG', '2'))   # grau del polinomi en z dels pesos
def probs(theta, X, seg, z):
    u = sum((z ** d) * (X @ theta[d * K:(d + 1) * K]) for d in range(DEG + 1))
    m = np.maximum.reduceat(u, seg)
    e = np.exp(u - np.repeat(m, np.diff(np.append(seg, len(u)))))
    s = np.add.reduceat(e, seg)
    return e / np.repeat(s, np.diff(np.append(seg, len(u)))), u, m, s

def nll(theta):
    p, u, m, s = probs(theta, Xt, segt, zt)
    ll = (u[humt] - m - np.log(s)).sum()
    # gradient: sum_j p_j z^d x_j - z_h^d x_h
    g = [(((p * zt ** d)[:, None] * Xt).sum(0) - ((zt[humt] ** d)[:, None] * Xt[humt]).sum(0)) for d in range(DEG + 1)]
    n = len(segt)
    return -ll / n + LAMBDA * (theta @ theta), np.concatenate(g) / n + 2 * LAMBDA * theta

res = minimize(nll, np.zeros((DEG + 1) * K), jac=True, method='L-BFGS-B', options={'maxiter': 3000})
theta = res.x
print('ajust:', res.message, 'nll entrenament', round(res.fun, 4), 'posicions', len(train), '/', len(test), 'reservades')
json.dump({'w': [[round(v, 5) for v in theta[d * K:(d + 1) * K]] for d in range(DEG + 1)], 'zMin': Z_MIN, 'zMax': Z_MAX,
           'center': 1500, 'scale': 500, 'trainPositions': len(train)}, open(sys.argv[2], 'w'))

# --- Avaluació a les posicions reservades ---
Xs, segs, zs, hums = pack(test)
p, *_ = probs(theta, Xs, segs, zs)
lossv = Xs[:, 0]
ends = np.append(segs, len(p))
bench = {}
for f in sys.argv[3:5]:
    for l in open(f):
        r = json.loads(l); bench[r['id']] = r
agg = defaultdict(lambda: defaultdict(float))
for i, r in enumerate(test):
    a, e = ends[i], ends[i + 1]
    pi, li = p[a:e], lossv[a:e]
    h = r['human']
    key_list = (r['band'], 'TOTES')
    vals = {
        'model_argmax_match': float(np.argmax(pi) == h),
        'model_sample_match': float(pi[h]),
        'model_loss': float(pi @ li), 'model_severe': float(pi @ (li >= .3)), 'model_exact': float(pi @ (li < .02)),
        'human_loss': float(li[h]), 'human_severe': float(li[h] >= .3), 'human_exact': float(li[h] < .02),
        'logp': float(math.log(max(pi[h], 1e-12))), 'n_moves': e - a,
    }
    b = bench.get(r['id'])
    if b and b.get('rivalUci') in r['moves']:
        k = r['moves'].index(b['rivalUci'])
        vals.update({'rival_n': 1, 'rival_match': float(k == h), 'rival_loss': float(li[k]), 'rival_severe': float(li[k] >= .3), 'rival_exact': float(li[k] < .02)})
    for key in key_list:
        agg[key]['n'] += 1
        for kk, v in vals.items(): agg[key][kk] += v
print(f"\n{'franja':<10} {'n':>5} | encert: model (més prob./sortejat)  rival | pèrdua pers/model/rival | greus pers/model/rival | exactes pers/model/rival")
for key in ['<1000', '1000-1399', '1400-1799', '1800-2199', '>=2200', 'TOTES']:
    s = agg[key]; n = s['n']; nr = max(1, s['rival_n'])
    if not n: continue
    print(f"{key:<10} {int(n):>5} | {s['model_argmax_match']/n*100:5.1f}% / {s['model_sample_match']/n*100:5.1f}%   "
          f"{s['rival_match']/nr*100:5.1f}% | "
          f"{s['human_loss']/n:.3f} {s['model_loss']/n:.3f} {s['rival_loss']/nr:.3f} | "
          f"{s['human_severe']/n*100:4.1f} {s['model_severe']/n*100:4.1f} {s['rival_severe']/nr*100:4.1f} | "
          f"{s['human_exact']/n*100:4.1f} {s['model_exact']/n*100:4.1f} {s['rival_exact']/nr*100:4.1f}   (rival n {int(s['rival_n'])})")
print('\nlog-versemblança mitjana per posició (reservades):', round(agg['TOTES']['logp'] / agg['TOTES']['n'], 4),
      ' a l\'atzar:', round(-np.mean([math.log(len(r['x'])) for r in test]), 4))
