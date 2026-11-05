# Mesura com empitjora la precisió segons el rellotge que queda a qui mou.
# Llegeix un PGN .zst de Lichess per stdin (en flux) i escriu un JSON amb
# comptadors per (ritme, franja d'ELO, tram de jugada, tram de rellotge).
#
# Ús: curl -s <url.pgn.zst> | python3 -I measure.py <sortida.json> <max_partides_amb_eval>
import sys, re, json, math, io, time
import zstandard

OUT = sys.argv[1]
MAX_EVAL_GAMES = int(sys.argv[2]) if len(sys.argv) > 2 else 60000

TCS = {'30+0': '30s', '60+0': '1+0', '180+2': '3+2', '300+0': '5+0'}
BANDS = [(0, 1000, '<1000'), (1000, 1400, '1000-1399'), (1400, 1800, '1400-1799'),
         (1800, 2200, '1800-2199'), (2200, 4000, '>=2200')]
# Trams de rellotge en segons (el que li queda a qui mou, en començar el torn).
CLOCK_EDGES = {
    '30s': [0, 2, 4, 6, 10, 15, 20, 31],
    '1+0': [0, 2, 4, 6, 10, 15, 20, 30, 45, 61],
    '3+2': [0, 3, 6, 10, 15, 20, 30, 60, 120, 400],
    '5+0': [0, 3, 6, 10, 15, 20, 30, 60, 120, 301],
}
MOVE_EDGES = [1, 11, 21, 31, 41, 61, 200]  # trams de número de jugada

def band_of(elo):
    for lo, hi, name in BANDS:
        if lo <= elo < hi:
            return name
    return None

def bucket(edges, v):
    for i in range(len(edges) - 1):
        if edges[i] <= v < edges[i + 1]:
            return f'{edges[i]}-{edges[i+1]}'
    return None

def wc(cp):  # probabilitat de guanyar a l'escala de Lichess, de -1 a 1
    return 2 / (1 + math.exp(-0.00368208 * cp)) - 1

TOKEN = re.compile(r'\{([^}]*)\}')
EVAL = re.compile(r'\[%eval\s+(#?-?[\d.]+)\]')
CLK = re.compile(r'\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]')

def parse_eval(s):
    if s.startswith('#'):
        n = int(s[1:])
        return 1000 if n > 0 else -1000  # mat: avantatge decidit
    return max(-1000, min(1000, round(float(s) * 100)))

stats = {}  # clau -> [n, errades_greus(wc>=0.3), errades(wc>=0.2), suma_cp_perduda, n_equilibrades, greus_equilibrades]
def add(key, loss_wc, loss_cp, balanced):
    s = stats.get(key)
    if s is None:
        s = stats[key] = [0, 0, 0, 0, 0, 0]
    s[0] += 1
    s[1] += loss_wc >= 0.3
    s[2] += loss_wc >= 0.2
    s[3] += loss_cp
    if balanced:
        s[4] += 1
        s[5] += loss_wc >= 0.3

games_seen = 0
eval_games = 0
t0 = time.time()

def process(headers, movetext):
    global eval_games
    tc = TCS.get(headers.get('TimeControl'))
    if not tc or '[%eval' not in movetext or '[%clk' not in movetext:
        return
    try:
        we, be = int(headers.get('WhiteElo', '0')), int(headers.get('BlackElo', '0'))
    except ValueError:
        return
    bands = {'w': band_of(we), 'b': band_of(be)}
    comments = TOKEN.findall(movetext)
    evals, clocks = [], []
    for c in comments:
        e = EVAL.search(c); k = CLK.search(c)
        if not k:
            return
        evals.append(parse_eval(e.group(1)) if e else None)
        clocks.append(int(k.group(1)) * 3600 + int(k.group(2)) * 60 + float(k.group(3)))
    if len(clocks) < 10:
        return
    eval_games += 1
    base = {'30s': 30, '1+0': 60, '3+2': 180, '5+0': 300}[tc]
    prev_eval = 15  # posició inicial ~ +0,15
    for ply in range(len(clocks)):
        color = 'w' if ply % 2 == 0 else 'b'
        # Rellotge en començar el torn: el que li quedava després de la seva jugada anterior.
        clock_start = clocks[ply - 2] if ply >= 2 else base
        ev = evals[ply]
        if ev is None or prev_eval is None:
            prev_eval = ev
            continue
        before = prev_eval if color == 'w' else -prev_eval
        after = ev if color == 'w' else -ev
        loss_wc = max(0.0, wc(before) - wc(after))
        loss_cp = max(0, before - after)
        balanced = abs(before) <= 300
        move_no = ply // 2 + 1
        mb = bucket(MOVE_EDGES, move_no)
        cb = bucket(CLOCK_EDGES[tc], clock_start)
        band = bands[color]
        if mb and cb and band:
            add(f'{tc}|{band}|{mb}|{cb}', loss_wc, loss_cp, balanced)
        prev_eval = ev

def dump():
    with open(OUT, 'w') as f:
        json.dump({'games_seen': games_seen, 'eval_games': eval_games, 'stats': stats,
                   'fields': ['n', 'greus_wc30', 'errades_wc20', 'suma_cp', 'n_equilibrades', 'greus_equilibrades']}, f)

dctx = zstandard.ZstdDecompressor(max_window_size=2**31)
reader = io.TextIOWrapper(dctx.stream_reader(sys.stdin.buffer, read_size=1 << 20), encoding='utf-8', errors='replace')
headers, movetext = {}, []
in_moves = False
for line in reader:
    if line.startswith('['):
        if in_moves:
            games_seen += 1
            process(headers, ' '.join(movetext))
            headers, movetext, in_moves = {}, [], False
            if games_seen % 200000 == 0:
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
