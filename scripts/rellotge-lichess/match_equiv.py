# Força equivalent: per a cada franja del rival, la finestra de 300 punts d'ELO
# de Lichess amb la mateixa pèrdua mitjana per jugada, i el perfil d'errades de
# totes dues bandes (amb interval de confiança al 95% per bootstrap).
# Ús: python3 -I match_equiv.py bench-short.jsonl bench-long.jsonl
import sys, json, math, random
def wc(cp): return 2 / (1 + math.exp(-0.00368208 * max(-10000, min(10000, cp)))) - 1
rows = [json.loads(l) for f in sys.argv[1:] for l in open(f)]
rows = [r for r in rows if 'error' not in r and None not in (r.get('root'), r.get('human'), r.get('rival'))]
L = lambda r, who: max(0, wc(r['root']) - wc(r[who]))
def prof(rs, who):
    ls = [L(r, who) for r in rs]; n = len(ls)
    return n, sum(ls) / n, sum(l >= 0.3 for l in ls) / n, sum(l < 0.02 for l in ls) / n
def ci(rs, who, k, B=400):
    rnd = random.Random(1)
    v = sorted(prof([rs[rnd.randrange(len(rs))] for _ in rs], who)[k] for _ in range(B))
    return round(v[int(.025 * B)] * 100, 1), round(v[int(.975 * B)] * 100, 1)
for band in ['<1000', '1000-1399', '1400-1799', '1800-2199']:
    rv = [r for r in rows if r['band'] == band]
    n, m, sev, ex = prof(rv, 'rival')
    roc = sum(r['roc'] for r in rv) / n
    best = None
    for lo in range(700, 2000, 25):
        w = [r for r in rows if lo <= r['elo'] < lo + 300]
        if len(w) < 600: continue
        hm = prof(w, 'human')
        if best is None or abs(hm[1] - m) < abs(best[1][1] - m): best = (lo, hm, w)
    lo, hm, w = best
    print(f"rival ROC ~{roc:.0f}: pèrdua {m:.3f}, greus {sev*100:.1f}% {ci(rv, 'rival', 2)}, exactes {ex*100:.1f}%")
    flag = '' if abs(hm[1] - m) < 0.01 else '  (cap finestra no hi arriba: fora de les dades)'
    print(f"   persones Lichess {lo}-{lo+300} (n {hm[0]}): pèrdua {hm[1]:.3f}, greus {hm[2]*100:.1f}% {ci(w, 'human', 2)}, exactes {hm[3]*100:.1f}%{flag}")
