# Tests automatitzats

Proves mínimes amb [Jest](https://jestjs.io/) per a la lògica crítica de l'app.

## Com executar-les

```bash
npm install   # només el primer cop (instal·la Jest i chess.js)
npm test      # executa tota la suite
```

## Arquitectura

L'app és un únic fitxer gran (`app.js`) pensat per al navegador, sense sistema
de mòduls. Per poder-la provar sense refactoritzar-ho tot, la **lògica pura**
(sense estat global, DOM ni xarxa) viu a `core.js` i a `redactor.js`:

- `core.js` exporta les funcions tant com a global del navegador
  (`window.ElTaulerCore`) com a mòdul de Node (`module.exports`), gràcies a un
  embolcall UMD.
- `redactor.js` (mateix embolcall UMD, `window.ElTaulerRedactor`) conté el
  corrector i auditor de català normatiu dels textos de l'entrenador, i la
  redacció local del diagnòstic longitudinal.
- `app.js` carrega tots dos (via `<script>` a `index.html`, abans d'`app.js`) i
  hi **delega** mitjançant embolcalls prims. Així hi ha una única font de veritat
  i els tests proven el mateix codi que s'executa al navegador.

## Què es prova (`tests/`)

- **`elo.test.js`** — limitació i normalització d'ELO, conversió
  dificultat↔nivell, ROC→ELO del motor i profunditat de cerca.
- **`adaptation.test.js`** — càlcul del delta d'ELO adaptatiu (resultat,
  precisió, ratxes, flux) i avaluació de la qualitat de partida.
- **`openings.test.js`** — parseig de PGN, construcció del trie d'obertures i
  cerca/anàlisi, incloent-hi una comprovació de sanitat sobre les dades reals
  d'`obertures.js`.
- **`humantime.test.js`** — gestió del rellotge del rival. Cobreix l'estimació
  de dificultat d'una jugada (`estimateMoveComplexity`), la matriu
  ELO–complexitat, la fase a partir del FEN i, sobretot, el **model de rellotge
  calibrat amb partides reals**: que la taula `HUMAN_CLOCK_STATS` (mesurada sobre
  4,6 M de partides de Lichess) tingui la forma esperada, que `humanClockProfile`
  interpoli per ELO sense extrapolar per sota de la franja mesurada (el cas d'un
  ROC molt baix), que el pla sencer sumi el temps mesurat de la partida, i que
  una simulació amb el codi REAL reprodueixi la corba de consum del rellotge i
  el risc de bandera observats. Inclou la comprovació de fons: a 1+0 i ROC baix
  el motor pot caure de bandera —perquè és el que fa una persona d'aquell
  nivell— i als ritmes lents gairebé mai.
- **`calibration.test.js`** — terra flexible de l'ELO d'usuari, ajust fi per
  resultat, fites d'ELO, i la cerca adaptativa del calibratge inicial (ROC del
  rival, qualitat i rendiment de les partides de calibratge).
- **`redactor.test.js`** — corrector normatiu del català de l'entrenador
  (subjuntiu per indicatiu, participi per imperatiu, castellanismes,
  terminologia, concordances), auditoria de fiabilitat (xifres inventades,
  percentatges sense %, notació SAN, residus de JSON) i redacció local del
  diagnòstic (fidelitat a les dades, determinisme, concordança).
- **`review.test.js`** — qualitat de la ressenya postpartida: validació forta
  de les errades abans de mostrar-les (FEN present, número de jugada dins de
  la partida, jugades legals, jugada feta diferent de la millor), clau de
  deduplicació entre «Moments clau» i «Errades comentades», línia de color del
  jugador, línies de fase amb nombre de jugades i avís de poques dades, lliçó
  del dia i pla de 10 minuts, detecció de text inacabat (punts suspensius i
  connectors penjats) i escurçament per frases senceres sense «…».
- **`forcing.test.js`** — llenguatge prudent per a les línies del motor (PV):
  amb `chess.js` real (devDependency, la mateixa versió que carrega el
  navegador) es verifica que una PV com «Bf4 Qxh2+ Kxh2» NO es presenta com a
  «seqüència forçada» quan el rival tenia altres opcions (es diu «una possible
  variant del motor és...»), que sí que es pot dir «forçada» amb mat demostrat
  (per chess.js o per `score mate` del motor) o amb resposta única legal («la
  resposta del rival era l’única legal»), que sense prou dades només es diu
  «la millor jugada era...», i el cas «perduda igualment»: si fins i tot la
  millor resposta del rival el deixa clarament perdut, la variant no forçada
  es reforça amb «totes el deixaven igual de perdut». També cobreix els fets del tauler
  (`createPvBoardHelpers`: escac, respostes legals, captura de dama, mat, peça
  penjada), `computePvForcingInfo`/`classifyPvLanguage` i la redacció catalana
  dels moviments (`descriuMovimentFets`: «la dama negra captura el peó a h2 amb
  escac», «el rei blanc captura la dama a h2», color sempre explícit).
- **`voice.test.js`** — veu de l'entrenador (casual / equilibrada / tècnica):
  normalització d'estils (valors invàlids o antics cauen a `balanced`), lliçó
  del dia, avís de poques dades, pla de 10 minuts i intro de color amb les
  mateixes dades i tres redaccions, i narració de la PV amb la mateixa
  prudència en tots els registres (cap veu no diu «forçada» sense demostració
  i cap text no queda tallat).
- **`puzzles.test.js`** — jeroglífics tàctics: validació pas a pas de la solució
  de 3 jugades (`puzzleSubmitMove`), criteris d'acceptació, dedup per FEN,
  dificultat/explicació i, sobretot, el **classificador de final tàctic**
  (`createHieroglyphicMotifHelpers` amb chess.js real): mat, escac amb/sense
  avantatge, forquilla real rei+dama i falsa forquilla (peça que penja), clavada,
  descoberta, promoció, guany de dama/torre i cap final permès (`none`). També el
  filtre per preferència de final (`requiredFinalMotifs`) i les metadades d'una
  variant legal treta d'una FEN real (`hieroglyphicVariantMeta`:
  `origin: 'game_variant'`, conserva `sourceGameId`/`sourceFen` sense alterar la
  partida).
- **`import.test.js`** — importació de partides externes (PGN): separació d'un
  fitxer amb diverses partides, lectura de capçaleres (amb cometes escapades),
  neteja del movetext (comentaris `{...}` i `;`, variants niades, NAGs, números
  de jugada enganxats, enroc amb zeros, resultat), rejugada legal dels tokens
  netejats amb chess.js real, mapatge Result→etiqueta de l'historial (coherent
  amb `entryOutcome`), detecció del color del jugador pel nom d'usuari i el nom
  llegible dels jugadors (`pgnPlayersLabel`: capçaleres White/Black amb
  prioritat i, si no n'hi ha, el nom del fitxer PGN netejat).
- **`voice-nomenclature.test.js`** — nomenclatura de jugades per veu (font única
  de veritat): `descriuJugadaPerVeu` (redactor) redacta la MATEIXA jugada com a
  acció en infinitiu (casual: «portar el cavall de f3 a h4»), clàusula sense
  color per acompanyar la SAN (equilibrada: «el cavall de f3 va a h4»; tècnica:
  «es reubica a») i casos de captura, coronació, mat i enroc, sense color ni
  UCI; `reviewMoveIdentityOk` (core) rebutja un moment la jugada del qual no
  coincideix amb la partida real en aquell ply (cap «Jugada 14 · Nh4» si el PGN
  fa Ne4) i que el número de jugada quadri amb el comptador de la FEN; i
  `auditReviewVoiceText` (core) detecta UCI visible, SAN nua en casual, la
  fletxa maquinal «→», la construcció «vas jugar el cavall … va a …» i el text
  tallat amb el·lipsi. El poliment de registres també s'hi cobreix: l'avanç de
  peó es diu «el peó de la columna a fins a a4» (mai «de a a a4»), i en mode
  expert la casella d'origen apareix encara que no calgui desambiguar («el
  cavall de f3 captura a e5»), mentre que en casual s'omet quan no cal.

## Integració contínua

`.github/workflows/tests.yml` executa `npm ci` + `npm test` a cada push i pull
request, de manera que cap canvi que trenqui la lògica provada es pugui fusionar
sense que salti l'alarma.

## Afegir més tests

Quan vulguis fer testejable una funció nova, mou-ne la part pura a `core.js`
(rebent per paràmetre el que abans llegia de variables globals), fes que la
funció d'`app.js` hi delegui, i afegeix el cas a `tests/`.
