# El Tauler — guia per a Claude

PWA d'escacs en català (eltauler.cat). **Estàtica, sense build ni bundler**: fitxers
`.js` plans carregats amb `<script>` des d'`index.html` i servits per GitHub Pages.
Tot el text visible, els comentaris i els missatges de commit són **en català**.

## Regla d'or: fitxers enormes

`app.js` (~42.500 línies, 2,1 MB), `index.html` (~11.000 línies), `core.js` (~10.900)
i `stockfishtv.js` (~6.100) **no es llegeixen sencers**. Cerca amb `Grep`/`grep -n` i
llegeix només el tros necessari (`Read` amb `offset`/`limit`).
Mai no obris `lozza.js`, `stockfish.js`, `obertures.js`, `jeroglifics-reserva.js`,
`bulletbank.js`, `localitats.js` ni `data/*.json`: són dades o codi de tercers.

## Ordres

```bash
npm ci && npm test              # Jest (114 fitxers a tests/); també a CI (Node 22)
npx jest tests/core.test.js     # un sol fitxer
python3 -m http.server 8877 --bind 127.0.0.1   # servir l'app (vegeu /verify)
```

Per provar l'app al navegador real, fes servir la skill **`/verify`**
(`.claude/skills/verify/SKILL.md`): té tots els gotchas de Playwright d'aquest repo
(CDN que no carreguen, service worker, mode «tocar», TV, Matxa…).

## Arquitectura

- **Lògica pura** (sense DOM, xarxa ni estat global) → mòduls UMD: es carreguen al
  navegador com a `window.ElTauler<Nom>` i a Node amb `require`. Patró:
  `(function (root, factory) { … module.exports … else root.ElTaulerX = api })`.
  Si una cosa es pot provar sense DOM, ha d'anar en un mòdul així, no a `app.js`.
- **`app.js`** és el monòlit amb la UI, l'estat i l'orquestració; **delega** als
  mòduls amb embolcalls prims (una sola font de veritat).
- **Dades locals**: `localStorage` (claus amb prefix `chess_` i `eltauler_`).
  `cloudsync.js` en fa una instantània completa a Firebase (Auth Google +
  Firestore; vegeu `SINCRONITZACIO_FIREBASE.md` i `OPTIMITZACIO_FIREBASE.md`).
- **Motors d'escacs**: Stockfish 19 lite WASM (`stockfish-19-lite-single.*`, el
  compartit; vegeu `STOCKFISH-19.md`), Stockfish clàssic (`stockfish.js`) i Lozza
  (`lozza.js`, sense modificar). Llibreries externes per CDN: jQuery, chess.js 0.10.3,
  chessboard-js, chart.js, Firebase compat.
- **Veu**: Matxa (BSC/Aina) neuronal en línia; reserva Google TTS via
  `cloudflare/google-tts-worker.js` i `functions/api/google-tts.js`.
- **Desplegament**: push a `main` → `desplega-web.yml` publica a GitHub Pages i hi
  incrusta Remigi (app germana, repo `segueix/remigi`) amb `scripts/inject-*.py`.

## Mapa de fitxers (arrel)

| Àrea | Fitxers |
|---|---|
| Nucli pur | `core.js` (ELO, adaptació, qualitat de partida, trie d'obertures), `redactor.js` (corrector de català i redacció local), `gamestore.js` (historial en 2 nivells) |
| Sync / sistema | `cloudsync.js`, `sw.js`, `rendiment.js` (feina en segon pla segons gamma), `pantallaactiva.js`, `fonscolors.js`, `canviapp.js` (pas a Remigi), `manifest.json` |
| Lliga de llegendes TV (abans Stockfish vs Lozza) | `llegendes.js` (10 perfils, motor per jugador, calendari de lliga doble, classificació), `humanitzacio.js` (humanització dinàmica: tria entre candidates MultiPV, vegeu `HUMANITZACIO.md`), `stockfishtv.js` (nucli), `tvintro.js`, `tvleague.js` + `tvleague-ui.js`, `visiograu.js` (visió d'en Grau), `narrativa.js`, `historytv.js` (partides desades), `gamebroadcast.js`, `expressivitat.js`, `artdelaguerra.js`, `estratagemes.js`, `maximesexercici.js` |
| Veu i so | `veuneural.js`, `prosodia.js`, `radioambient.js`, `musicafons.js`, `sons.js`, `matxa-*.js` |
| Entrenament | `hieroclosure.js` + `jeropedagogia.js` + `jeroglifics-reserva.js` (jeroglífics), `patrons.js`, `tallerobertures.js`, `catalans.js` (partida col·lectiva), `bulletpractice.js` + `bulletbank.js`, `tutorial.js`, `reviewsacrifices.js`, `antidoteprogress.js`, `boardexperience.js` |
| Lliga | `nomslliga.js`, `localitats.js` (vegeu `LLIGA.md`) |
| Pàgines SEO | `nova-partida/`, `obertures/`, `catalans-vs-stockfish/` (només `index.html`), `laboratori-veu.html` |

Documentació per tema (md a l'arrel): `TESTS.md`, `LLIGA.md`, `NARRATIVA-TV.md`,
`STOCKFISH-19.md`, `LLEGENDES.md`, `PATRONS-VERIFICABLES.md`, `PEDAGOGIA-PROSODIA.md`,
`CATALA-EXPRESSIU.md`, `ANALISI_RELLOTGE.md`, `ANTIDOT-*.md`, `AUDITORIA-QUALITAT.md`,
`PLANIFICACIO-SEGON-PLA.md`, `MATXA-ONNX.md`, `GOOGLE-TTS-EMERGENCIA.md`, `HUMANITZACIO.md`.
Llegeix el md del tema abans de tocar-ne el codi.

## Mapa d'`app.js` (línies aproximades — ajusta-les amb grep)

Cerca la capçalera `/* ===== … ===== */` per anar-hi directe.

| ~Línia | Secció |
|---|---|
| 1071 | Notificacions internes (toast + confirm) |
| 2390 / 2564 | Historial amb reproductor de TV / veu, ràdio i marques dels taulers |
| 4163–4728 | Feedback d'obertures / teoria de les lliçons |
| 8014–9112 | Partides diàries (24 h per jugada) |
| 10176 / 10255 | Consentiment i capçalera inici / rànquing global |
| 15411–16826 | Moment clau, errades comentades (OpenAI), anàlisi per fases, ressenya local |
| 19373–20484 | El teu repertori, obertura personal, «Aprèn una obertura» |
| 24886 | Jeroglífics d'obertura |
| 27263–28210 | Entrenador invisible, SRS, repte diari, el teu bessó, tres camins |
| 29146 | Entrenament de tàctiques |
| 31585–31961 | Diagnòstic longitudinal, motor local de redacció per plantilles |
| 32405 / 33459 / 33730 | Rellotge de partida / sons / partida en viu |
| 37454 | Joc vista |
| 39016 | L'entrenador que parla (debrief + pla diari) |
| 41501–42078 | Motius tàctics, context de l'errada, rebost d'exercicis |

## Convencions que no et pots saltar

1. **Cache-busting**: cada `<script src="x.js?v=X.Y.Z">` d'`index.html` duu versió.
   Si canvies `x.js`, **puja'n el `?v=`** (patch o minor) a `index.html`.
   També es sol pujar `SW_VERSION` a `sw.js` quan el canvi s'ha de propagar als clients.
2. **Els tests llegeixen el codi font com a text.** Molts (`antidote-*`,
   `boardexperience`…) fan `fs.readFileSync('../app.js')` i tallen entre cadenes
   (`src.indexOf('function foo(')`) o comproven que conté certes línies. Si reanomenes
   una funció, un comentari-marcador o una constant d'`app.js`/`index.html`,
   **executa `npm test`** i actualitza el test afectat.
3. **Tot canvi de comportament va amb test** a `tests/<tema>.test.js`
   (Jest, `describe`/`test` en català). No obren navegador i no han de fer xarxa
   real: simula-la (`jest.fn`, com a `tests/google-tts-proxy.test.js`).
4. **Mòduls d'autoria generada: no s'editen a mà**: `jeroglifics-reserva.js`
   (`node scripts/mine-hieroglyphics.js`), `bulletbank.js` (`scripts/build-bullet-bank.js`),
   `data/patrons-lichess-cc0.json` (`scripts/import-lichess-patrons.js`),
   `tests/fixtures/tv-games.json` (`scripts/gen-tv-fixtures.js`).
5. **Verificat, no inventat**: els comentaris de la TV i els jeroglífics només diuen
   fets certificats per chess.js o Stockfish. Ni l'Èlia ni en Grau no diuen caselles
   (`/\b[a-h][1-8]\b/` no ha de casar amb `comment.say`). No afegeixis afirmacions
   tàctiques sense verificació.
6. **Català normatiu**: el text que llegeix l'alumne passa pel corrector de
   `redactor.js`. Respecta la veu del projecte (vegeu `CATALA-EXPRESSIU.md`).
7. **Sense dependències noves ni build**: res de bundlers, frameworks ni `import`
   ES al navegador. Les llibreries van per CDN a `index.html` (i al precache del SW si cal).
8. **El rellotge i la partida en curs són sagrats**: `boardexperience.js` i similars
   mai no modifiquen la partida ni el rellotge.

## Git

- Els bots (`github-actions[bot]`) publiquen a `main` (jeroglífics compartits, mats en
  tres, 2 cops al dia): **fes `git pull`/fetch abans de pujar** i espera conflictes
  a `jeroglifics-reserva.js`.
- Commits en català, en imperatiu: «Corregeix…», «Fes que…», «Amplia…». Els PR vénen de
  branques `codex/…` o `claude/…` i es fusionen a `main`.
- No facis PR ni commit si no te'l demanen.
