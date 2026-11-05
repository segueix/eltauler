# Efecte del rellotge DINS de cada jugador i partida (estimador de Mantel-Haenszel
# de raó de taxes, un estrat per costat de partida). El "temps de risc" de cada
# jugada és la seva taxa esperada segons el tram de jugada (referència amb el
# rellotge còmode, baseline.json), de manera que la fase de la partida queda
# descomptada i la complexitat de cada partida, el nivell del dia i el ritme
# propi del jugador s'anul·len perquè cada costat es compara amb ell mateix.
#
#   RR_c = sum_g O_gc * E_gR / (E_gc + E_gR)  /  sum_g O_gR * E_gc / (E_gc + E_gR)
#   (c = tram de rellotge baix, R = rellotge còmode del mateix costat)
#
# Ús: curl -s <url> | python3 -I measure_mh.py baseline.json sortida.json max_partides
import sys, re, json, math, io, time
from collections import defaultdict
import zstandard

BASE = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
MAX_EVAL_GAMES = int(sys.argv[3])

TCS = {'30+0': '30s', '60+0': '1+0', '180+2': '3+2', '300+0': '5+0'}
BASEMS = {'30s': 30, '1+0': 60, '3+2': 180, '5+0': 300}
COMFORT = {'30s': 10, '1+0': 20, '3+2': 30, '5+0': 30}
BANDS = [(0, 1000, '<1000'), (1000, 1400, '1000-1399'), (1400, 1800, '1400-1799'),
         (1800, 2200, '1800-2199'), (2200, 4000, '>=2200')]
CLOCK_EDGES = {
    '30s': [0, 2, 4, 6, 10, 31],
    '1+0': [0, 2, 4, 6, 10, 15, 20, 61],
    '3+2': [0, 3, 6, 10, 15, 20, 30, 400],
    '5+0': [0, 3, 6, 10, 15, 20, 30, 301],
}
MOVE_EDGES = [1, 11, 21, 31, 41, 61, 200]

def band_of(elo):
    for lo, hi, name in BANDS:
        if lo <= elo < hi:
            return name
def bucket(edges, v):
    for i in range(len(edges) - 1):
        if edges[i] <= v < edges[i + 1]:
            return f'{edges[i]}-{edges[i+1]}'
def wc(cp):
    return 2 / (1 + math.exp(-0.00368208 * cp)) - 1

TOKEN = re.compile(r'\{([^}]*)\}')
EVAL = re.compile(r'\[%eval\s+(#?-?[\d.]+)\]')
CLK = re.compile(r'\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]')
def parse_eval(s):
    if s.startswith('#'):
        return 1000 if int(s[1:]) > 0 else -1000
    return max(-1000, min(1000, round(float(s) * 100)))

# acc[(tc, band|ALL, kind, clockbucket)] = [num, den, O_c, E_c, n_c]
acc = defaultdict(lambda: [0.0, 0.0, 0, 0.0, 0])
games_seen = eval_games = 0
t0 = time.time()

def side_game(tc, band, moves):
    # moves: llista de (tram_jugada, segons, equilibrada, greu)
    for kind in ('bal', 'dec'):
        O = defaultdict(int); E = defaultdict(float); N = defaultdict(int)
        for mb, sec, bal, severe in moves:
            if (kind == 'bal') != bal:
                continue
            r = BASE.get(f'{tc}|{band}|{mb}')
            rate = r and r[kind]
            if not rate:
                continue
            cb = 'R' if sec >= COMFORT[tc] else bucket(CLOCK_EDGES[tc], sec)
            O[cb] += severe; E[cb] += rate; N[cb] += 1
        if 'R' not in E or E['R'] <= 0:
            continue
        for cb in E:
            if cb == 'R':
                continue
            T = E[cb] + E['R']
            for b in (band, 'ALL'):
                a = acc[(tc, b, kind, cb)]
                a[0] += O[cb] * E['R'] / T
                a[1] += O['R'] * E[cb] / T
                a[2] += O[cb]; a[3] += E[cb]; a[4] += N[cb]

def process(headers, movetext):
    global eval_games
    tc = TCS.get(headers.get('TimeControl'))
    if not tc or '[%eval' not in movetext or '[%clk' not in movetext:
        return
    try:
        elos = {'w': int(headers.get('WhiteElo', '0')), 'b': int(headers.get('BlackElo', '0'))}
    except ValueError:
        return
    evals, clocks = [], []
    for c in TOKEN.findall(movetext):
        e = EVAL.search(c); k = CLK.search(c)
        if not k:
            return
        evals.append(parse_eval(e.group(1)) if e else None)
        clocks.append(int(k.group(1)) * 3600 + int(k.group(2)) * 60 + float(k.group(3)))
    if len(clocks) < 10:
        return
    eval_games += 1
    per = {'w': [], 'b': []}
    prev = 15
    for ply in range(len(clocks)):
        color = 'w' if ply % 2 == 0 else 'b'
        sec = clocks[ply - 2] if ply >= 2 else BASEMS[tc]
        ev = evals[ply]
        if ev is not None and prev is not None:
            before = prev if color == 'w' else -prev
            after = ev if color == 'w' else -ev
            mb = bucket(MOVE_EDGES, ply // 2 + 1)
            if mb:
                per[color].append((mb, sec, abs(before) <= 300, (wc(before) - wc(after)) >= 0.3))
        prev = ev
    for color in 'wb':
        band = band_of(elos[color])
        if band:
            side_game(tc, band, per[color])

def dump():
    res = {}
    for (tc, b, kind, cb), a in acc.items():
        res[f'{tc}|{b}|{kind}|{cb}'] = a
    json.dump({'games_seen': games_seen, 'eval_games': eval_games, 'acc': res}, open(OUT, 'w'))

dctx = zstandard.ZstdDecompressor(max_window_size=2**31)
reader = io.TextIOWrapper(dctx.stream_reader(sys.stdin.buffer, read_size=1 << 20), encoding='utf-8', errors='replace')
headers, movetext, in_moves = {}, [], False
for line in reader:
    if line.startswith('['):
        if in_moves:
            games_seen += 1
            process(headers, ' '.join(movetext))
            headers, movetext, in_moves = {}, [], False
            if games_seen % 500000 == 0:
                dump()
                print(f'{games_seen} partides, {eval_games} amb avaluació, {time.time()-t0:.0f} s', file=sys.stderr, flush=True)
            if eval_games >= MAX_EVAL_GAMES:
                break
        m = re.match(r'\[(\w+)\s+"(.*)"\]', line)
        if m:
            headers[m.group(1)] = m.group(2)
    elif line.strip():
        in_moves = True
        movetext.append(line.strip())
dump()
print(f'FET: {games_seen} partides, {eval_games} amb avaluació, {time.time()-t0:.0f} s', file=sys.stderr, flush=True)
