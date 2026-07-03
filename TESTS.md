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
  resposta del rival era l’única legal»), i que sense prou dades només es diu
  «la millor jugada era...». També cobreix els fets del tauler
  (`createPvBoardHelpers`: escac, respostes legals, captura de dama, mat, peça
  penjada), `computePvForcingInfo`/`classifyPvLanguage` i la redacció catalana
  dels moviments (`descriuMovimentFets`: «la dama negra captura el peó a h2 amb
  escac», «el rei blanc captura la dama a h2», color sempre explícit).

## Integració contínua

`.github/workflows/tests.yml` executa `npm ci` + `npm test` a cada push i pull
request, de manera que cap canvi que trenqui la lògica provada es pugui fusionar
sense que salti l'alarma.

## Afegir més tests

Quan vulguis fer testejable una funció nova, mou-ne la part pura a `core.js`
(rebent per paràmetre el que abans llegia de variables globals), fes que la
funció d'`app.js` hi delegui, i afegeix el cas a `tests/`.
