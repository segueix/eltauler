# Errades per pressió de rellotge: mesura amb partides de Lichess

D'aquí surt la taula `CLOCK_SLIP_EXCESS` de `core.js` (vegeu
`ANALISI_RELLOTGE.md` §13). Cal Python 3 amb `zstandard` (`pip install
zstandard`). Els scripts llegeixen el bolcat en flux, sense desar-lo.

```bash
URL=https://database.lichess.org/standard/lichess_db_standard_rated_2026-06.pgn.zst
# 1. Comptadors per ritme, franja, tram de jugada i tram de rellotge (~9 min)
curl -s $URL | python3 -I measure.py full.json 400000
python3 -I analyze2.py full.json 30s,1+0,3+2,5+0 bal 30    # entre partides (orientatiu)
python3 -I make_baseline.py full.json baseline.json
# 2. Cada jugador amb ell mateix (Mantel-Haenszel, un estrat per jugador i partida)
curl -s $URL | python3 -I measure_mh.py baseline.json mh.json 400000
python3 -I analyze_mh.py mh.json full.json
# 3. Contra el rival al mateix tram de la mateixa partida (la que fa servir el model)
curl -s $URL | python3 -I measure_pair.py baseline.json pair.json 400000
python3 -I analyze_mh.py pair.json full.json
python3 -I make_table.py pair.json full.json
```

`curl` acaba amb «Failure writing output» quan el script ja té prou partides i
deixa de llegir: és normal.

## Errades amb el rellotge còmode: el rival contra persones (§14)

```bash
# 1. Taxa humana amb el rellotge còmode i 500 posicions per ritme i franja (~4 min)
curl -s $URL | python3 -I measure_comfort.py stats.json sample.jsonl 280000
python3 -I human_rates.py stats.json sample.jsonl
# 2. El rival REAL (Chromium) a les mateixes posicions, al mateix ELO, jutjat
#    per Stockfish 19 a profunditat 12 (des de l'arrel del repo; ~40 min)
node scripts/rellotge-lichess/bench.js sample.jsonl bench-short.jsonl 30s,1+0,3+2 400 4 12
node scripts/rellotge-lichess/bench.js sample.jsonl bench-long.jsonl 5+0,10+0,15+10 250 4 12
python3 -I analyze_bench.py bench-short.jsonl bench-long.jsonl     # mateix ELO
python3 -I analyze_dist.py bench-short.jsonl bench-long.jsonl      # distribució de pèrdues
python3 -I match_equiv.py bench-short.jsonl bench-long.jsonl       # força equivalent
```

`measure_comfort.py` i `bench.js` sortegen la mostra i el rival: els números
canvien una mica d'una execució a una altra, dins dels intervals del document.

## Correspondència ROC → Lichess per al rellotge (§15)

```bash
python3 -I equiv_groups.py bench-short.jsonl bench-long.jsonl   # amb interval per bootstrap
```

D'aquí surten els punts de `ROC_CLOCK_ELO_POINTS` a `core.js`.

## Rival amb rellotge amb Stockfish 19: calibratge de la força (§16)

```bash
# Velocitat dels dos motors amb els pressupostos del rival
node scripts/rellotge-lichess/speed.js sample.jsonl
# Graella de nivells de Stockfish 19 (profunditat del ROC, com a l'app) a les
# posicions de calibratge, i nivell que iguala el motor anterior per franja
RIVAL_URL=stockfish-19-lite-single.js DEPTH_FROM_ROC=1 IDS=ids-cal.txt \
  LEVELS='{"<1000":[250,400,550,700],"1000-1399":[300,450,600,750],"1400-1799":[950,1150,1300,1450],"1800-2199":[1650,1800,1923,2000]}' \
  node scripts/rellotge-lichess/bench.js sample.jsonl grid.jsonl 30s,1+0,3+2,5+0,10+0,15+10 40 4 12
python3 -I fit_sf19.py grid.jsonl bench-short.jsonl bench-long.jsonl
# Validació amb posicions no usades, amb la taula de core.js tal com la fa servir l'app
RIVAL_URL=stockfish-19-lite-single.js DEPTH_FROM_ROC=1 LEVEL_CORE=1 IDS=ids-val3.txt \
  node scripts/rellotge-lichess/bench.js sample.jsonl val.jsonl 30s,1+0,3+2,5+0,10+0,15+10 40 4 12
python3 -I paired.py val.jsonl roc bench-short.jsonl bench-long.jsonl
```

Els fitxers d'ids són llistes d'identificadors `ritme|franja|línia` de la
mostra (40 per ritme i franja, disjunts entre calibratge i validació).
