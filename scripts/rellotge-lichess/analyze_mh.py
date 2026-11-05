# Raó de taxes de Mantel-Haenszel (dins de cada jugador i partida) i l'excés
# absolut que implica amb la taxa de referència de cada franja.
import sys, json, math
from collections import defaultdict

d = json.load(open(sys.argv[1]))
base = json.load(open(sys.argv[2]))  # full.json (per a les taxes còmodes per franja)
print(f"partides {d['games_seen']}, amb avaluació {d['eval_games']}")
BANDS = ['<1000', '1000-1399', '1400-1799', '1800-2199', '>=2200', 'ALL']
COMFORT = {'30s': 10, '1+0': 20, '3+2': 30, '5+0': 30}

# taxa còmoda (tots els trams de jugada) per ritme, franja i tipus de posició
comf = defaultdict(lambda: [0, 0, 0, 0])
for key, v in base['stats'].items():
    tc, band, mb, cb = key.split('|')
    if float(cb.split('-')[0]) >= COMFORT[tc]:
        for b in (band, 'ALL'):
            c = comf[(tc, b)]
            c[0] += v[0]; c[1] += v[1]; c[2] += v[4]; c[3] += v[5]
def comf_rate(tc, b, kind):
    c = comf[(tc, b)]
    return c[3] / c[2] if kind == 'bal' else (c[1] - c[3]) / (c[0] - c[2])

acc = defaultdict(dict)
for key, a in d['acc'].items():
    tc, b, kind, cb = key.split('|')
    acc[(tc, kind)][(b, cb)] = a
for (tc, kind) in sorted(acc):
    cells = acc[(tc, kind)]
    cbs = sorted({cb for (_, cb) in cells}, key=lambda s: float(s.split('-')[0]))
    print(f'\n===== {tc} · posicions {"equilibrades" if kind == "bal" else "decidides"} =====')
    print('franja        ' + ''.join(f'{cb:>16}' for cb in cbs))
    for b in BANDS:
        row = []
        for cb in cbs:
            a = cells.get((b, cb))
            if not a or a[4] < 300 or a[1] <= 0:
                row.append('-'); continue
            rr = a[0] / a[1]
            # error aproximat del log(RR): 1/sqrt(O_c) + 1/sqrt(O_R) (aprox. conservadora)
            se = math.sqrt(1 / max(a[2], 1) + 1 / max(a[1] * 0 + a[2], 1))
            excess = comf_rate(tc, b, kind) * (rr - 1)
            row.append(f'x{rr:4.2f} ({excess*100:+4.1f})')
        print(f'{b:<14}' + ''.join(f'{r:>16}' for r in row))
    print('n (ALL)       ' + ''.join(f'{int(cells.get(("ALL", cb), [0]*5)[4]):>16}' for cb in cbs))
