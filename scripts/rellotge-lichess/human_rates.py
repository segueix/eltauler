# Taxa d'errades greus de les persones amb el rellotge còmode, en posicions
# obertes, per ritme i franja (amb l'ELO mitjà de la franja, tret de la mostra).
# Ús: python3 -I human_rates.py stats.json sample.jsonl
import sys, json
from collections import defaultdict
d = json.load(open(sys.argv[1]))
pop = defaultdict(lambda: [0, 0])
for k, v in d['stats'].items():
    tc, b, mb = k.split('|'); pop[(tc, b)][0] += v[0]; pop[(tc, b)][1] += v[1]
elo = defaultdict(list)
for l in open(sys.argv[2]):
    r = json.loads(l); elo[(r['tc'], r['band'])].append(r['elo'])
for tc in ['30s', '1+0', '3+2', '5+0', '10+0', '15+10']:
    cells = []
    for b in ['<1000', '1000-1399', '1400-1799', '1800-2199', '>=2200']:
        n, e = pop[(tc, b)]
        if n:
            cells.append(f'{b} (ELO ~{sum(elo[(tc, b)]) / max(1, len(elo[(tc, b)])):.0f}): {e / n * 100:.1f}% de {n}')
    print(tc + ': ' + '; '.join(cells))
