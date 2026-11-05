# Taula CLOCK_SLIP_EXCESS de core.js: excés d'errades greus per jugada en
# posicions obertes, de la comparació amb el rival al mateix tram de la mateixa
# partida (sortida de measure_pair.py), totes les franges, suavitzada perquè no
# creixi amb els segons (agregació de trams veïns ponderada per mostra, PAVA).
# Ús: python3 -I make_table.py pair.json full.json
import sys, json
d = json.load(open(sys.argv[1]))
base = json.load(open(sys.argv[2]))
COMFORT = {'30s': 10, '1+0': 20, '3+2': 30, '5+0': 30}
comf = {}
for key, v in base['stats'].items():
    tc, band, mb, cb = key.split('|')
    if float(cb.split('-')[0]) >= COMFORT[tc]:
        c = comf.setdefault(tc, [0, 0]); c[0] += v[4]; c[1] += v[5]
table = {}
for tc in ['30s', '1+0', '3+2', '5+0']:
    rows = []
    for key, a in d['acc'].items():
        t, b, kind, cb = key.split('|')
        if t == tc and b == 'ALL' and kind == 'bal' and a[4] >= 500 and a[1] > 0:
            lo, hi = map(float, cb.split('-'))
            rows.append(((lo + hi) / 2, comf[tc][1] / comf[tc][0] * (a[0] / a[1] - 1), a[4]))
    rows.sort()
    merged = [[x * n, n, [s]] for s, x, n in rows]
    changed = True
    while changed:
        changed = False
        for j in range(len(merged) - 1):
            if merged[j][0] / merged[j][1] < merged[j + 1][0] / merged[j + 1][1]:
                merged[j] = [merged[j][0] + merged[j + 1][0], merged[j][1] + merged[j + 1][1], merged[j][2] + merged[j + 1][2]]
                del merged[j + 1]; changed = True; break
    table[tc] = [[s, round(w / n, 3)] for w, n, xs in merged for s in xs] + [[COMFORT[tc], 0]]
    print(f"'{tc}': {table[tc]},")
