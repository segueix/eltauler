"""Taula de taules per a leagueDrawChance (core.js, LLIGA.md §4).

    python3 -I draw_table.py results.json

Taxa de taules per ritme i franja de 200 punts d'ELO mitjà (centre de la
franja), entre jugadors a menys de 250 punts (fins allà la diferència no hi
fa res, vegeu analyze_results.py §2). La partida sense rellotge de l'app pren
els clàssics de 30 minuts on n'hi ha prou (n >= 1500) i, si no, el 15+10.
També la mateixa taxa segons la diferència, relativa a la dels igualats.
"""
import json
import sys

TCS = ['30s', '1+0', '3+2', '5+0', '10+0', '15+10', 'classic']
CENTERS = [700, 900, 1100, 1300, 1500, 1700, 1900]
MIN_N = 1500


def main():
    counts = {tuple(k.split('|')): v for k, v in json.load(open(sys.argv[1]))['counts'].items()}
    table = {}
    for tc in TCS:
        row = []
        for c in CENTERS:
            d = n = 0
            for (t, band, diff), v in counts.items():
                if t == tc and c - 100 <= int(band) < c + 100 and abs(int(diff)) <= 250:
                    d += v[1]; n += sum(v)
            row.append((d / n if n else None, n))
        table[tc] = row
    print('centre ' + ' '.join(f'{tc:>16}' for tc in TCS))
    for i, c in enumerate(CENTERS):
        cells = []
        for tc in TCS:
            p, n = table[tc][i]
            cells.append(f'{100 * p:5.2f}% ({n:7d})' if p is not None and n >= MIN_N else f'{"—":>16}')
        print(f'{c:6d} ' + ' '.join(cells))


if __name__ == '__main__':
    main()
