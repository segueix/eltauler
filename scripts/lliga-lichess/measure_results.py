"""Resultats de partides de Lichess per ritme, nivell i diferència d'ELO.

Llegeix trossos del bolcat .pgn.zst repartits per tot el mes (peticions per
rang: el fitxer té marcs zstd independents, i cada tros es descomprimeix a
partir del primer marc que conté) i només en mira les capçaleres. Compta
victòries de blanques, taules i victòries de negres per (ritme, franja de
l'ELO mitjà de 100 en 100, diferència blanques-negres de 50 en 50). Els
ritmes són els de l'app (els seus equivalents de Lichess) i els clàssics de
30 minuts, com a referència de les partides sense rellotge.

    python3 -I measure_results.py results.json [trossos=40] [MB per tros=50]
"""
import io
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import zstandard

URL = 'https://database.lichess.org/standard/lichess_db_standard_rated_2026-06.pgn.zst'
TCS = {'30+0': '30s', '60+0': '1+0', '180+2': '3+2', '300+0': '5+0',
       '600+0': '10+0', '900+10': '15+10', '1800+0': 'classic', '1800+20': 'classic'}
SKIP_TERMINATIONS = {'Abandoned', 'Rules infraction', 'Unterminated'}
MAGIC = b'\x28\xb5\x2f\xfd'


def file_size():
    out = subprocess.run(['curl', '-sI', URL], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.lower().startswith('content-length:'):
            return int(line.split(':')[1])
    raise SystemExit('sense mida')


def count_chunk(start, size):
    data = subprocess.run(['curl', '-s', '-r', f'{start}-{start + size - 1}', URL],
                          capture_output=True).stdout
    at = data.find(MAGIC)
    counts, read, kept = {}, 0, 0
    if at < 0:
        return counts, read, kept
    reader = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(data[at:]), read_across_frames=True)
    text = io.TextIOWrapper(reader, encoding='utf-8', errors='replace')
    head, started = {}, False
    try:
        for line in text:
            if line.startswith('[Event '):
                started, head = True, {}
            if not started:
                continue                      # tros de partida del començament
            if line.startswith('['):
                sp = line.find(' ')
                head[line[1:sp]] = line[sp + 2:line.rfind('"')]
                continue
            if not head or not line.strip():
                continue
            h, head = head, {}
            read += 1
            tc = TCS.get(h.get('TimeControl'))
            res = h.get('Result')
            if not tc or res not in ('1-0', '0-1', '1/2-1/2') or h.get('Termination') in SKIP_TERMINATIONS:
                continue
            try:
                we, be = int(h['WhiteElo']), int(h['BlackElo'])
            except (KeyError, ValueError):
                continue
            # Partides de menys de dues jugades: no s'han jugat.
            if ' 2. ' not in ' ' + line:
                continue
            band = (we + be) // 200 * 100
            diff = int(round((we - be) / 50.0)) * 50
            if -600 <= diff <= 600:
                c = counts.setdefault(f'{tc}|{band}|{diff}', [0, 0, 0])
                c[0 if res == '1-0' else (1 if res == '1/2-1/2' else 2)] += 1
                kept += 1
    except zstandard.ZstdError:
        pass                                  # el tros acaba a mig marc
    return counts, read, kept


def main():
    out_path = sys.argv[1]
    chunks = int(sys.argv[2]) if len(sys.argv) > 2 else 40
    size = int(float(sys.argv[3]) * 1e6) if len(sys.argv) > 3 else 50_000_000
    total = file_size()
    starts = [int(i * (total - size) / max(1, chunks - 1)) for i in range(chunks)]
    counts, read, kept = {}, 0, 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, (c, r, k) in enumerate(pool.map(lambda s: count_chunk(s, size), starts)):
            for key, v in c.items():
                acc = counts.setdefault(key, [0, 0, 0])
                for j in range(3):
                    acc[j] += v[j]
            read += r
            kept += k
            print(f'tros {i + 1}/{chunks}: {read} llegides, {kept} comptades', file=sys.stderr, flush=True)
    with open(out_path, 'w') as f:
        json.dump({'read': read, 'kept': kept, 'chunks': chunks, 'chunkBytes': size, 'counts': counts}, f)


if __name__ == '__main__':
    main()
