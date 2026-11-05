# Taxes d'errades greus amb el rellotge còmode per ritme, franja i tram de
# jugada (posicions obertes i decidides), a partir de la sortida de measure.py.
# Ús: python3 -I make_baseline.py full.json baseline.json
import sys, json
from collections import defaultdict
d = json.load(open(sys.argv[1]))
COMFORT = {'30s': 10, '1+0': 20, '3+2': 30, '5+0': 30}
ref = defaultdict(lambda: [0, 0, 0, 0])  # n_totes, greus_totes, n_obertes, greus_obertes
for key, v in d['stats'].items():
    tc, band, mb, cb = key.split('|')
    if float(cb.split('-')[0]) >= COMFORT[tc]:
        r = ref[f'{tc}|{band}|{mb}']
        r[0] += v[0]; r[1] += v[1]; r[2] += v[4]; r[3] += v[5]
out = {}
for k, r in ref.items():
    nd, ed = r[0] - r[2], r[1] - r[3]
    out[k] = {'bal': (r[3] / r[2]) if r[2] >= 200 else None, 'dec': (ed / nd) if nd >= 200 else None}
json.dump(out, open(sys.argv[2], 'w'))
print(len(out), 'cel·les de referència')
