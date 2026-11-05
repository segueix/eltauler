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
