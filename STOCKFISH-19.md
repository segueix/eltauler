# Stockfish 19 (prova pilot a Stockfish vs Lozza TV)

`stockfish-19-lite-single.js` i `stockfish-19-lite-single.wasm` són la versió
**lite d'un sol fil** de [Stockfish.js 19](https://github.com/nmrugg/stockfish.js)
(paquet npm `stockfish` 19.0.1, 2026), basat en
[Stockfish](https://github.com/official-stockfish/Stockfish), amb la xarxa
neuronal petita `nn-61e7af4bb97d`. Llicència **GPLv3** (el codi font és als
dos enllaços).

- Integritat (la mateixa que publica npm):
  - `stockfish-19-lite-single.js` — `sha256-zLEw1/8pQIUxxH2Fmkn5HVnU9ILQWlPrGjIxpPYkyRo=`
  - `stockfish-19-lite-single.wasm` — `sha256-7k8RW9stMsrflsraEEoFtewlfXrW9XWCGQtJvHHwlt4=`
- Per què aquesta versió: uns 1,9 MB, i la d'un sol fil funciona a GitHub
  Pages sense les capçaleres d'aïllament entre orígens (COOP/COEP) que
  necessiten les de diversos fils.
- Opcions UCI (font oficial, `engine.cpp` i `search.h`): `Skill Level` 0–20,
  `UCI_LimitStrength` i `UCI_Elo` 1320–3190, que Stockfish calibra amb l'Elo
  CCRL de partides ràpides entre motors.
- On es fa servir: només a Stockfish vs Lozza TV, si es tria a «Motor de
  Stockfish». La resta de l'app continua amb `stockfish.js` (Stockfish
  2019-08-15). Si el motor nou no carrega, la TV torna sola al clàssic.
