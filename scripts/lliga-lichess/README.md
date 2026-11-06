# Lliga: taules entre rivals i dispersió dels ROC (LLIGA.md)

Cal Python 3 amb `zstandard` (`pip install zstandard`). Des de l'arrel del repo:

```bash
# 1. Resultats de Lichess per ritme, franja d'ELO mitjà i diferència (~25 min).
#    Llegeix 40 trossos de 50 MB repartits per tot el bolcat 2026-06 (peticions
#    per rang: el fitxer té marcs zstd independents) i només en mira les capçaleres.
python3 -I scripts/lliga-lichess/measure_results.py results.json 40 50
# 2. Taules entre igualats, taules segons la diferència i puntuació del més fort
python3 -I scripts/lliga-lichess/analyze_results.py results.json
# 3. Taula de LEAGUE_DRAW_RATES (core.js): franges de 200 punts, |dif| <= 250
python3 -I scripts/lliga-lichess/draw_table.py results.json
# 4. Temporades simulades amb leagueOpponentRating i leagueSimulatedResult de core.js
node scripts/lliga-lichess/simulate_league.js 30000 3+2 1200
```

Els trossos són sempre els mateixos (repartits a parts iguals pel fitxer), així
que la mesura es repeteix exacta. La simulació no fa servir cap llavor fixa: els
números canvien una mica d'una execució a una altra.
