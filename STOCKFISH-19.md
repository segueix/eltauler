# Stockfish 19 (motor únic de Stockfish vs Lozza TV)

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
- On es fa servir: Stockfish 19 és l'única versió de Stockfish a
  **Stockfish vs Lozza TV** i al **generador de jeroglífics**. Cap de les
  dues seccions no retorna al Stockfish antic si el motor nou falla.
  La resta de l'app continua utilitzant el motor que tenia.
- Els jeroglífics tenen un *worker* Stockfish 19 independent del motor de
  les partides i de la TV. Les anàlisis MultiPV es fan en cua per evitar
  respostes barrejades; les combinacions només s'accepten quan es valida
  exactament una línia de tres jugades pròpies i dues rèpliques, amb
  un final tàctic verificable i alternatives controlades.
- Fonts de posicions: tàctiques de partides personals, variants de posicions
  reals i **partides entre dues instàncies lògiques de Stockfish 19** (mateix
  motor alternant els dos colors). El segon camí de l'autojoc explora algunes
  alternatives MultiPV de qualitat raonable perquè apareguin oportunitats
  tàctiques; la selecció d'una alternativa no prova que hi hagi un jeroglífic.
- En mòbils modestos es redueix la llargada de l'autojoc, el temps de cerca
  i el nombre de posicions candidates. El generador respecta la cancel·lació,
  les preferències de generació en segon pla, els duplicats i les
  verificacions existents. El fitxer JavaScript i el WASM de Stockfish 19
  es desen en una memòria cau persistent amb el seu nom propi, sense
  substitució per `stockfish.js` en cas de manca de connexió.
