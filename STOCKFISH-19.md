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
  reals i **mineria per autojoc**, independent de les partides de l'usuari.
  Les dues fonts s'alternen a cada intent, i les posicions de partides que ja
  s'han provat sense èxit no es tornen a provar (`eltauler_cloud_hgTried`).
- Mineria per autojoc (com els bancs de problemes): Stockfish 19 juga
  partides senceres a profunditat 10, amb una obertura
  variada i la millor jugada després. Cada 1-2 jugades prova, en branques a
  part, fins a tres errors triats entre les seves jugades MultiPV (perden
  entre 2,5 i 9 peons; mai jugades il·legals), i la partida principal
  continua equilibrada. Les posicions on el bàndol que mou té una sola jugada
  guanyadora (≥ +3 peons, la segona < +2, diferència ≥ 1,5) i on la
  combinació es tanca a la tercera jugada dins la variant es desen com a
  llavors en aquest aparell (`eltauler_cloud_hgSeeds`, fins a 60). Primer es
  certifiquen les que la mateixa partida ja demostrava. Mesurat amb
  Stockfish 19 real: ~6 % de les llavors acaben en jeroglífic; segons la
  sort, entre un cada mig minut i un cada pocs minuts d'autojoc.
- Certificació d'una llavor: variant principal a profunditat 14 i, dins
  seu, les finestres de cinc mitges jugades on el guany es materialitza just
  a la tercera jugada (comprovació sense motor de `hieroclosure.js`). Si la
  combinació és més llarga, el jeroglífic comença més endavant. Només
  aquestes finestres passen la verificació completa a profunditat 16; cada
  llavor es prova un sol cop.
- **Reserva minada per endavant** (`jeroglifics-reserva.js`): el mateix
  autojoc i la mateixa verificació, executats amb
  `node scripts/mine-hieroglyphics.js [--minutes 30] [--pages 3]` (Playwright,
  diverses pàgines en paral·lel). Quan la cua és buida, l'app en treu un de
  la reserva a l'instant (mai un de ja jugat, a la cua o resolt), i el
  generador de l'aparell omple la resta. Un test comprova que tota la reserva
  té la línia legal i la prova vàlida.
- «Generar ara» i obrir la secció amb la cua buida fan servir el mateix bucle
  sota demanda: espera la generació en curs en lloc de fallar, no es rendeix
  al primer intent sense resultat, mostra el temps a la barra, es pot aturar
  i acaba als 8 minuts; si s'ha demanat obrir-ne un, s'obre tan bon punt n'hi
  ha.
- En mòbils modestos es redueix la durada de l'autojoc, el
  temps de cerca i el nombre de posicions candidates. El generador respecta la cancel·lació,
  les preferències de generació en segon pla, els duplicats i les
  verificacions existents. El fitxer JavaScript i el WASM de Stockfish 19
  es desen en una memòria cau persistent amb el seu nom propi, sense
  substitució per `stockfish.js` en cas de manca de connexió.
