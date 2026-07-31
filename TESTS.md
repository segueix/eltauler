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
- **`premove.test.js`** — jugada anticipada de les partides amb rellotge.
  `premoveTargets` genera els destins marcables d'una peça quan el torn ENCARA
  és del rival (chess.js no en dóna cap, i per això calia un generador propi):
  destí ocupat per una peça pròpia (la recaptura), diagonals de peó cap a
  caselles buides, línies aturades per la primera peça del camí, enroc només
  amb el dret a la FEN i entrades corruptes que no rebenten. Amb chess.js real
  es comprova el desenllaç: `premoveMatchesLegalMove` deixa jugar la recaptura
  quan el rival menja de debò i anul·la la premove quan no.
- **`calibration.test.js`** — terra flexible de l'ELO d'usuari, ajust fi per
  resultat, fites d'ELO, i la cerca adaptativa del calibratge inicial (ROC del
  rival, qualitat i rendiment de les partides de calibratge).
- **`league.test.js`** — la lliga s'ancora al rellotge de la temporada.
  `leagueBaseRating` tria la referència amb què es genera la graella: l'ELO del
  ritme si aquell rellotge ja en té de propi (encara que sigui MÉS BAIX que el
  principal, com passa al bullet) i el principal si no —lliga sense rellotge o
  ritme sense calibrar—, amb terra i arrodoniment. `rebasedLeagueRatings` cobreix
  el canvi de rellotge abans de començar: el jugador passa a la referència nova i
  els rivals s'hi desplacen en bloc conservant les diferències del sorteig, sense
  tocar punts ni partides, sense baixar del terra i sense petar amb una lliga
  desada abans del canvi (sense referència anotada).
  `leagueRoundGameLinks` diu quina partida de l'historial és cada jornada
  perquè s'hi pugui clicar: mana l'id desat quan la partida encara hi és, i les
  jornades velles (jugades abans que se'n desés cap) es reconeixen pel nom del
  rival entre les partides de lliga posteriors a la creació de la temporada.
  Cobreix que cap partida no serveixi per a dues jornades, que una temporada
  anterior amb el mateix rival no s'hi coli, que les partides lliures i les
  importades en quedin fora, i que una jornada abandonada o amb la partida
  esborrada no deixi cap enllaç mort.
- **`collective.test.js`** — bucle autoregulat de les **partides col·lectives**
  (Catalans vs Stockfish), que serveix per esbrinar l'**ELO col·lectiu** d'un
  exèrcit que no en té. `collectiveGamePerformance` calcula el rendiment d'una
  partida (resultat contra un rival de força coneguda, afinat amb la qualitat de
  joc mesurada, que només compta quan no està topada pel terra del motor) i
  `updatedCollectiveRating` actualitza l'estimació amb pes decreixent i un sòl,
  dins dels límits del motor. La simulació del bucle sencer —Stockfish juga
  sempre a l'estimació vigent— cobreix que convergeixi tant amb un exèrcit feble
  (ROC) com amb un de fort partint de 1350, i que segueixi l'equip quan aquest
  canvia de força.
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
- **`gamestore.test.js`** — historial en dos nivells (`gamestore.js`): la
  separació d'una partida en **índex lleuger** (resultat, jugades, precisió,
  moment clau, resum per fases) i **cos pesat** (`moveReviews`, errades,
  ressenya d'IA), que l'índex no deixi passar mai cap camp pesat cap al
  localStorage, els resums que permeten respondre sense el cos (`hasBody`,
  `reviewedMoves`), el cicle `shedBody` → `attachBody` sense pèrdua, i que 200
  partides indexades càpiguen de sobres al document d'1 MiB de Firestore.
  També cobreix el **resum per fases del bessó** (`bessoPhaseStatsFromGame`):
  que el perfil surti idèntic calculat de les revisions o llegit del resum desat
  a l'índex, que una partida vella sense cap dels dos no trenqui res, i que un
  resum mal format es recalculi de les revisions.

- **`repertoire.test.js`** — repertori personal (`createRepertoireHelpers`): quines
  partides compten (mai les importades d'un PGN, que poden ser d'altres jugadors,
  ni les pràctiques d'errades), la construcció de l'arbre de jugades pròpies amb
  la marca de qui juga cada una (amb negres la primera de l'arbre és del rival),
  el recompte de freqüència, puntuació (victòria 1, taules ½) i precisió mitjana,
  la línia principal —la continuació més jugada mentre hi hagi mostra— i la
  detecció d'on es deixa el llibre creuant-ho amb el graf d'`obertures.js`,
  incloent-hi qui el deixa i que sense graf el llibre quedi com a desconegut en
  comptes d'inventar-se una desviació.

- **`personalopening.test.js`** — construcció de l'obertura personal
  (`createPersonalOpeningBuilder`). Cobreix la **porta de solidesa** (pèrdua
  mesurada contra la millor de la posició; sense avaluació, cap xifra
  inventada), la **tria de la jugada pròpia** (es respecta la teva si aguanta,
  se substitueix i s'explica si perd massa, i entre dues de sòlides manen la
  freqüència i el resultat), la **cobertura de rèpliques** per probabilitat
  —amb la confiança creixent amb la mostra i el motor omplint només el que no
  es confia, sense inflar mai la cua que es deixa fora—, i la construcció
  sencera amb un motor fals **coherent** (negamax d'una jugada sobre una
  avaluació de fulla). Hi ha dues proves clau del disseny: que la jugada pròpia
  que el MultiPV no ensenya es **mesura a part** i que, sense aquesta mesura, el
  repertori deixaria de ser el teu i passaria a ser el del motor; i que una
  mesura que no correspon a la jugada demanada **no es dona per bona**.

- **`openinghiero.test.js`** — jeroglífics d'OBERTURA
  (`createOpeningHieroglyphicHelpers`), els de la secció d'Obertures: que
  l'exercici surti sempre d'una obertura ja catalogada al repertori i comenci al
  **tercer o quart moviment** (el ply correcte per a cada color), que la solució
  siguin les jugades teòriques següents de la línia (fins a tres) amb les
  respostes del rival de la mateixa línia i sense rèplica sobrera a l'últim pas,
  que una línia massa curta no doni exercici, la classificació del motiu de cada
  jugada teòrica (enroc, clavada, fianchetto, palanca…) i la tria sense
  repetir-se. La prova de fons recorre el repertori REAL (`CURATED_OPENINGS`):
  cada obertura ha de donar almenys un exercici i tota la línia ha de ser legal
  des de la FEN de partida.

- **`openingbranches.test.js`** — les BRANQUES de cada obertura
  (`openingBranchAnchorPlies`, `buildOpeningBranchIndex`,
  `pickOpeningBranchSlot`, `buildOpeningHieroglyphicFromSlot`). El repertori
  catalogat té una sola línia per obertura i dona un centenar d'exercicis;
  enganxant-hi les línies de la base ECO que l'app ja carrega (`obertures.js`)
  se'n passa de 98 a 892. Es prova l'**àncora** —el prefix més curt que
  distingeix una obertura de les altres del repertori, perquè una línia italiana
  no acabi comptant com a branca de l'espanyola encara que comparteixin les dues
  primeres jugades—, que la regla **una posició, una resposta** es respecti (si
  la teoria hi ofereix més d'una jugada mana la que avalen més línies: l'exercici
  només en pot acceptar una), que les frases pedagògiques del repertori no
  viatgin a una branca a partir del punt on ja no la segueix, i que el nom de
  variant que es mostra sigui el de la **posició de partida** i no el del final
  de la línia (dir «Exchange Variation» abans de temps és delatar que la solució
  és una captura). Sense base ECO, l'índex encara dona les línies catalogades.
  Les proves de fons van contra les dades REALS (49 obertures × 3.626 línies
  ECO): cap obertura sense branques, cap posició de partida repetida, muntar
  l'índex ha de ser feina de text (per sota d'un segle de mil·lisegons, no els
  minuts que costaria construir tots els exercicis amb chess.js) i una mostra
  ampla de branques ha de donar exercicis legals de cap a peus.

- **`historygroups.test.js`** — grups desplegables de l'historial
  (`historyAgeGroup`, `groupHistoryEntriesByAge`, `historyGroupsOpenState`): que
  els grups es comptin per dies de **calendari** i no per finestres de 24 hores
  (les 23:50 d'ahir són «Ahir»), que la granularitat s'obri com toca —dia a dia
  la primera setmana, després setmanes, mesos i anys— i que els trams frontera
  no diguin bestieses («fa 12 mesos» no existeix: o són 11 mesos o és 1 any).
  Es comprova també que agrupar no perdi ni reordeni cap partida, que les
  entrades sense data (o amb data del futur, per un rellotge desajustat) tinguin
  el seu lloc en comptes de desaparèixer de la llista, i quins grups arriben
  desplegats: els més recents fins a completar el pressupost de partides
  visibles, amb el que ha triat l'usuari manant sempre per damunt.

- **`antidote.test.js`** — modalitat 🧬 **Rival Antídot**: Stockfish diu quines
  jugades són bones i El Tauler tria quina de les bones posa més a prova el
  jugador. Es cobreixen les quatre peces del sistema.
  **Perfil** (`buildAntidoteProfile`, `antidoteWeaknessWeight`,
  `antidoteConfidence`): que un perfil buit no inventi cap debilitat, que una
  sola mostra doni «indici inicial» i la confiança creixi de manera monòtona
  sense arribar mai a ser categòrica, que una errada d'ahir pesi més que una de
  fa quatre mesos i una errada greu més que una imprecisió, que les jugades
  bones no generin debilitats, que superar proves rebaixi el pes de manera
  progressiva **però que una sola prova superada no esborri una debilitat
  consolidada de 25 errades** (hi ha un terra), que fallar-les la reforci, i que
  dades corruptes (partides nul·les, categories inventades, `moveReviews` que és
  una cadena) no trenquin res. També que el **resum lleuger** desat a l'índex de
  l'historial (`antidoteStats`, el mateix patró que el `phaseStats` del bessó)
  doni exactament el mateix perfil que rellegir les revisions senceres.
  **Avaluacions** (`antidoteScoreValue`, `antidoteCpLoss`): que el mat i els
  centpeons **no es barregin mai aritmèticament** —abandonar un mat forçat és
  pèrdua infinita, un mat dues semijugades més llarg costa un símbol, un mat
  molt més llarg no s'accepta, rebre mat mai és admissible i, en una posició
  perduda per mat, allargar-lo és millor defensa—, i que els valors invàlids
  donin `null` i no zero.
  **Candidates** (`antidoteCandidateGuard`, `scoreAntidoteCandidate`,
  `chooseAntidoteCandidate`): que mai s'esculli una jugada fora del marge
  pedagògic del nivell (80/50/30 cp), que amb el perfil buit es jugui la millor
  jugada del motor, que entre dues jugades equivalents guanyi la que coincideix
  amb la debilitat però que **una diferència objectiva gran domini la
  coincidència pedagògica**, que no es converteixi una posició guanyada en
  igualada ni una igualada en perdedora, que no es penji material sense
  compensació (i que un sacrifici que el motor valora igual sí que s'accepti),
  que es conservi un mat forçat, que la repetició temàtica es penalitzi —menys
  si la categoria encara es falla— i que l'`rng` injectable doni resultats
  **deterministes** amb la mateixa llavor.
  **Detectors** (`createAntidoteDetectors`, amb `chess.js` real): forquilla de
  cavall de debò i **falsa forquilla** quan la peça penja, clavada creada per la
  jugada i cap clavada quan hi ha un peó pel mig, final de torres, mat,
  promoció, canvi de dames a la línia principal, millora tranquil·la com a
  recurs quan no hi ha res destacable, pèrdua de material immediata (la dama que
  es planta on un peó se la menja val 9) i jugades il·legals que no classifiquen
  res. També el model d'atacs propi (veu les **defenses** de peces pròpies, que
  la generació de jugades de chess.js no dona) i els peons passats i aïllats.
  **Proves pedagògiques** (`antidoteCreateTest`, `evaluateAntidoteResponse`,
  `updateAntidoteProgress`): que només neixi una prova amb un tema prou clar,
  que la PV desada quedi retallada, i la graella de resultats —bona → `passed`,
  acceptable → `partial`, error clar → `failed` i **ambigua → `inconclusive`**
  (sense mesura de pèrdua, o en una posició ja decidida abans de respondre, no
  es penalitza ningú)—, i que el progrés no compti dues vegades la mateixa
  prova.
  **Persistència**: serialització i restauració amb les línies de motor
  acotades i el nombre de proves limitat, estadístiques per tema, i sobretot
  **retrocompatibilitat**: una entrada d'historial sense cap camp Antídot (o amb
  el bloc corrupte) segueix funcionant i no aporta res al perfil.

## Verificació al navegador

A més de la suite de Jest, la modalitat Rival Antídot s'ha comprovat conduint
l'app REAL amb Playwright + Chromium (vegeu `.claude/skills/verify`): botó i
introducció a la pàgina principal, debilitats amb el seu grau de confiança,
partida completa amb el motor responent jugada rere jugada, **el worker
compartit sense MultiPV contaminat en acabar**, resum final amb les proves,
enviament d'una fallada al repàs d'errades existent, historial amb
`mode: "antidote"` que sobreviu a la recàrrega, ELO principal i ELO per ritme
intactes, amplada mòbil, perfil buit, funcionament sense Firebase, els dos
camins de fallback (cerca que peta i worker que no arrenca) i cap regressió a
Nova partida, Joc vista, Lliga ni jeroglífics.

## Integració contínua

`.github/workflows/tests.yml` executa `npm ci` + `npm test` a cada push i pull
request, de manera que cap canvi que trenqui la lògica provada es pugui fusionar
sense que salti l'alarma.

## Afegir més tests

Quan vulguis fer testejable una funció nova, mou-ne la part pura a `core.js`
(rebent per paràmetre el que abans llegia de variables globals), fes que la
funció d'`app.js` hi delegui, i afegeix el cas a `tests/`.

- **`antidote-feedback.test.js`** — comentari en viu del Rival Antídot, i
  sobretot la **invariant que el fa servir de res o no**: abans que el jugador
  decideixi, el panell no pot anomenar ni la debilitat ni el subtema. La prova
  no busca cadenes al codi font; agafa el missatge que retorna `core.js` i
  comprova que **cap** de les ~40 etiquetes visibles (`ANTIDOTE_WEAKNESS_IDS` +
  `ANTIDOTE_THEME_FAMILY`) hi apareix, ni cap jugada ni cap avaluació. El motiu
  és doble: detectar el problema tu sol és la meitat difícil de l’exercici —a
  la partida de veritat ningú no t’avisa— i, a més, el resultat de la prova
  alimenta el perfil (`antidoteApplyTestFeedback`), de manera que mesurar
  respostes amb pista faria baixar el pes d’una debilitat que en realitat
  continua fallant. Es comprova també que la consigna sigui **constant**
  (`antidoteTurnPrompt` no accepta cap argument i retorna sempre el mateix), per
  no delatar ni tan sols quins torns porten prova.
  A l’altra banda, que l’explicació **posterior** sí que ensenyi: diu el tema i
  el subtema, dona la millor resposta quan s’ha fallat o s’ha encertat a mitges
  (i no quan ja s’ha trobat), afegeix la pauta d’observació de la categoria,
  distingeix els quatre resultats amb estil propi, no llança avís emergent quan
  no hi ha conclusió i no escup mai `undefined` amb dades incompletes.
  I el **desfer**: quan el jugador tira la seva jugada enrere i torna a provar,
  el perfil ha de comptar el PRIMER intent, no el darrer (`firstResult`), perquè
  el que mesura la seva força a la partida de veritat és què va fer sense saber
  com acabaria. Es comprova que una prova fallada i després encertada segueixi
  pesant com a fallada, que encertar-la a la primera sí que compti com a
  superada, que `retried`/`firstResult` viatgin amb la prova desada i que les
  proves antigues sense aquests camps segueixin valent.

- **`tria.test.js`** — modalitat 🔀 **Tres camins**: test de 20 preguntes fet
  amb jugades TEVES que no vas fer del tot bé. A cada pregunta s'ensenyen les
  **tres millors jugades** de la posició (A, B i C, amb el seu tauler) i la que
  vas jugar de veritat com a «Original», per comparar.
  De la **porta d'entrada**: qualsevol jugada no encertada hi pot entrar (no cal
  que sigui una errada greu), la que vas encertar en queda fora, una pèrdua
  insignificant no compta com a fallada, i sense tres línies de motor desades la
  jugada no es pot fer servir. Res es repeteix dues vegades.
  De la **pregunta**: les tres opcions són les tres primeres línies del MultiPV,
  la correcta és sempre la primera, cadascuna porta la posició resultant per
  pintar el seu tauler i **cap no avança la resposta del rival** (el torn passa
  a l'altre color i prou). L'ordre A/B/C és estable per a una mateixa decisió
  però la bona no cau sempre a la mateixa lletra. Una línia il·legal o dues de
  repetides invaliden la pregunta en comptes de colar-la.
  De l'**ajust a l'ELO/ROC**: molta distància entre la 1a i la 2a és una
  pregunta fàcil i poca distància és difícil; com més fort és el jugador, més
  subtils se li demanen; l'objectiu no s'extrapola fora de la taula mesurada. La
  prova de fons comprova que, sobre un mateix fons ample de posicions REALS,
  un jugador de 2400 rep de mitjana preguntes més difícils que un de 900, que un
  test no buida mai una sola partida i que les preguntes es reparteixen entre
  partides diferents.
  De les **obertures**: el fons n'és desbordant —totes les partides en tenen, i
  sovint la MATEIXA, perquè cadascú juga el seu repertori— i sense filtre un
  test s'ompliria de variacions de les mateixes quatre jugades. Se'n deixa
  passar **una per posició** (dues partides que arriben a la mateixa posició
  són la mateixa pregunta, encara que hi juguessis coses diferents) i, en total,
  una quarta part del test. L'excepció són els **errors recurrents**: una
  decisió que has fallat en partides DIFERENTS no és soroll sinó un forat del
  repertori, i aquestes hi passen sempre i primer. Es comprova també que fallar
  dues vegades a la mateixa partida NO faci recurrent (sovint és la mateixa
  línia repetida un mal dia), que les altres fases no les toqui el filtre, i
  —la prova que evita el mal pitjor— que el sostre sigui una preferència i no
  una gana: amb un fons de només obertures variades, el test s'omple igualment
  en comptes de servir-ne cinc.
  De la **barreja de fases**: el test combina obertures, migjocs i finals. El
  repartiment fa torns rodons entre les tres (`triaInterleaveByPhase`), de
  manera que agafant-ne les primeres vint el test toca les tres encara que el
  fons sigui molt desigual —i el fons real ho és: moltes obertures, força
  migjocs i pocs finals. Hi ha també la prova que va destapar el problema de
  fons: el màxim per partida s'ha de repartir **al llarg** de la partida i no
  cobrir-se amb les primeres jugades, perquè les revisions vénen en ordre de
  joc i quedar-se amb el cap de la llista voldria dir servir sempre obertures
  i no arribar mai al migjoc d'aquella partida.
  De la **memòria entre tests**: una decisió encertada queda tancada i no torna
  MAI més; una de fallada queda pendent i va tornant fins que s'encerta (i
  llavors es tanca igual, encara que hagi costat diversos intents). Les pendents
  tenen prioritat però no poden omplir un test senceres —si ho fessin, deixaries
  de veure decisions noves—, tret que no hi hagi material nou, on val més
  repescar que servir un test escuat. El compte que anuncia el bàner descompta
  les ja encertades i NO descompta les fallades, que segueixen disponibles. Una
  memòria buida o corrupta no rebenta res.
  De la **puntuació i l'historial**: encertar la millor és correcte, qualsevol
  altra diu quants centipeons costava, triar la mateixa jugada que ja vas fer a
  la partida queda marcat a part (`repeatedOwnMove`), i el resum compta encerts,
  errades i el cost total en centipeons. Cada test acabat s'afegeix a un
  historial ordenat i limitat, i la sèrie de la gràfica d'evolució en surt amb
  el percentatge d'encert i la mitjana mòbil de tendència, ordenada per data
  encara que l'historial vingui desordenat.
  De la **llista de tests anteriors** (sota el test): cada test desa les claus
  de les decisions que hi van sortir, que és el que permet **rejugar-lo** amb
  les mateixes; les files van del més nou al més vell amb data, encert i el
  **nivell mitjà de les preguntes**, que surt d'invertir la corba
  dificultat↔ELO (`triaDifficultyToElo`, comprovat com a invers exacte de
  `triaTargetDifficulty` a totes les fites). Un test antic sense claus desades
  es marca com a no rejugable en comptes de fallar en silenci, i un sense
  dificultat desada no s'inventa cap nivell: el deixa buit.
