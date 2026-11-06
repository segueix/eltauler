"""Taules de resultats de Lichess per a la simulació de la lliga (LLIGA.md §4).

    python3 -I analyze_results.py results.json

1. Taules per ritme i franja d'ELO mitjà, entre jugadors igualats (|dif| <= 50).
2. Taules segons la diferència d'ELO, relatives a les dels igualats (tots els
   ritmes i franges junts, ponderat per cel·la).
3. Puntuació del més fort segons la diferència, contra la fórmula Elo
   (1 / (1 + 10^(-d/400))).
"""
import json
import math
import sys
from collections import defaultdict

TCS = ['30s', '1+0', '3+2', '5+0', '10+0', '15+10', 'classic']


def main():
    data = json.load(open(sys.argv[1]))
    counts = {tuple(k.split('|')): v for k, v in data['counts'].items()}
    print(f"partides llegides {data['read']}, comptades {data['kept']}")

    print('\n1. Taules entre igualats (|dif| <= 50), % (n)')
    bands = sorted({int(b) for (_, b, _) in counts})
    print('franja  ' + ' '.join(f'{tc:>14}' for tc in TCS))
    for band in bands:
        row = []
        for tc in TCS:
            w = d = l = 0
            for diff in ('-50', '0', '50'):
                v = counts.get((tc, str(band), diff))
                if v:
                    w += v[0]; d += v[1]; l += v[2]
            n = w + d + l
            row.append(f'{100 * d / n:5.1f}% ({n:6d})' if n >= 200 else ' ' * 14)
        print(f'{band:6d}  ' + ' '.join(row))

    print('\n2. Taules segons |dif|, relatives a |dif| <= 50 (mateix ritme i franja)')
    base = {}
    for (tc, band, diff), v in counts.items():
        if abs(int(diff)) <= 50:
            b = base.setdefault((tc, band), [0, 0])
            b[0] += v[1]; b[1] += sum(v)
    ratio = defaultdict(lambda: [0.0, 0.0])
    for (tc, band, diff), v in counts.items():
        b = base.get((tc, band))
        if not b or b[1] < 500 or b[0] == 0:
            continue
        p0 = b[0] / b[1]
        ad = abs(int(diff))
        ratio[ad][0] += v[1]            # taules observades
        ratio[ad][1] += sum(v) * p0     # taules esperades amb la taxa dels igualats
    for ad in sorted(ratio):
        o, e = ratio[ad]
        if e >= 50:
            print(f'|dif| {ad:4d}: {o / e:5.2f}  (taules {int(o)})')

    print('\n3. Puntuació del més fort segons la diferència (tots els ritmes)')
    by = defaultdict(lambda: [0.0, 0])
    for (tc, band, diff), v in counts.items():
        d = int(diff)
        if d == 0:
            continue
        w, dr, l = v
        n = w + dr + l
        stronger = (w + 0.5 * dr) if d > 0 else (l + 0.5 * dr)
        by[abs(d)][0] += stronger
        by[abs(d)][1] += n
    for ad in sorted(by):
        s, n = by[ad]
        if n >= 500:
            elo = 1 / (1 + 10 ** (-ad / 400))
            print(f'dif {ad:4d}: observat {s / n:.3f}  Elo {elo:.3f}  (n {n})')


if __name__ == '__main__':
    main()
