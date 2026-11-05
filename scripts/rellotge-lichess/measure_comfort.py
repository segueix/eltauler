# Errades amb el rellotge CÒMODE, per ritme i franja d'ELO, i una mostra de
# posicions reals (per fer-hi jugar el rival). Llegeix un PGN .zst per stdin.
#
#   errada greu: caiguda >= 0,30 de la probabilitat de guanyar (escala Lichess)
#   posició oberta: |avaluació de qui mou| <= 300 cp
#   rellotge còmode: COMFORT segons o més en començar el torn
#
# Ús: curl -s <url> | python3 -I measure_comfort.py stats.json sample.jsonl max_partides_amb_eval
import sys, re, json, math, io, time, random
from collections import defaultdict
import zstandard

OUT, SAMPLE = sys.argv[1], sys.argv[2]
MAX_EVAL_GAMES = int(sys.argv[3])
K = 500  # posicions per ritme i franja
rng = random.Random(20261105)

TCS = {'30+0': '30s', '60+0': '1+0', '180+2': '3+2', '300+0': '5+0', '600+0': '10+0', '900+10': '15+10'}
BASE = {'30s': 30, '1+0': 60, '3+2': 180, '5+0': 300, '10+0': 600, '15+10': 900}
COMFORT = {'30s': 10, '1+0': 20, '3+2': 30, '5+0': 60, '10+0': 120, '15+10': 120}
BANDS = [(0, 1000, '<1000'), (1000, 1400, '1000-1399'), (1400, 1800, '1400-1799'),
         (1800, 2200, '1800-2199'), (2200, 4000, '>=2200')]
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
SANTOK = re.compile(r'^[a-hKQRBNO][^\s]*$')
def parse_eval(s):
    if s.startswith('#'):
        return 1000 if int(s[1:]) > 0 else -1000
    return max(-1000, min(1000, round(float(s) * 100)))
def sans_of(movetext):
    txt = TOKEN.sub(' ', movetext)
    out = []
    for t in txt.split():
        if re.match(r'^\d+\.+$', t) or t in ('1-0', '0-1', '1/2-1/2', '*'):
            continue
        t = re.sub(r'^\d+\.+', '', t)
        t = re.sub(r'[!?]+$', '', t)
        if t and SANTOK.match(t):
            out.append(t)
    return out

# stats[(tc, band, mb)] = [n, greus, errades(>=0.2), imprecisions(>=0.1), suma_wc]  (còmode, obertes)
stats = defaultdict(lambda: [0, 0, 0, 0, 0.0])
seen = defaultdict(int)
reservoir = defaultdict(list)
games_seen = eval_games = 0
t0 = time.time()

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
    sans = None
    prev = 15
    for ply in range(len(clocks)):
        color = 'w' if ply % 2 == 0 else 'b'
        sec = clocks[ply - 2] if ply >= 2 else BASE[tc]
        ev = evals[ply]
        if ev is not None and prev is not None and sec >= COMFORT[tc]:
            before = prev if color == 'w' else -prev
            after = ev if color == 'w' else -ev
            band = band_of(elos[color])
            mb = bucket(MOVE_EDGES, ply // 2 + 1)
            if band and mb and abs(before) <= 300:
                loss = max(0.0, wc(before) - wc(after))
                s = stats[(tc, band, mb)]
                s[0] += 1; s[1] += loss >= 0.3; s[2] += loss >= 0.2; s[3] += loss >= 0.1; s[4] += loss
                key = (tc, band)
                seen[key] += 1
                j = len(reservoir[key]) if len(reservoir[key]) < K else rng.randrange(seen[key])
                if j < K:
                    if sans is None:
                        sans = sans_of(movetext)
                    if len(sans) == len(clocks):
                        rec = {'tc': tc, 'band': band, 'elo': elos[color], 'oppElo': elos['b' if color == 'w' else 'w'],
                               'ply': ply, 'move': ply // 2 + 1, 'sec': sec, 'base': BASE[tc],
                               'evalBefore': before, 'lossLichess': round(loss, 4), 'severeLichess': loss >= 0.3,
                               'prefix': sans[:ply], 'human': sans[ply]}
                        if j < len(reservoir[key]):
                            reservoir[key][j] = rec
                        else:
                            reservoir[key].append(rec)
        prev = ev

def dump():
    json.dump({'games_seen': games_seen, 'eval_games': eval_games,
               'stats': {'|'.join(k): v for k, v in stats.items()},
               'seen': {'|'.join(k): v for k, v in seen.items()}}, open(OUT, 'w'))
    with open(SAMPLE, 'w') as f:
        for recs in reservoir.values():
            for r in recs:
                f.write(json.dumps(r) + '\n')

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
