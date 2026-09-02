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
  nivell— i als ritmes lents gairebé mai. També cobreix el sostre de temps REAL
  de la cerca (`engineSearchBudgetMs`): sense rellotge no n'hi ha, mai passa del
  sostre del ritme ni de la bandera, descompta el temps ja consumit des que
  l'usuari ha mogut i no mossega el temps que el model vol dedicar a una jugada
  normal.
- **`premove.test.js`** — jugada anticipada de les partides amb rellotge.
  `premoveTargets` genera els destins marcables d'una peça quan el torn ENCARA
  és del rival (chess.js no en dóna cap, i per això calia un generador propi):
  destí ocupat per una peça pròpia (la recaptura), diagonals de peó cap a
  caselles buides, línies aturades per la primera peça del camí, enroc només
  amb el dret a la FEN i entrades corruptes que no rebenten. Amb chess.js real
  es comprova el desenllaç: `premoveMatchesLegalMove` deixa jugar la recaptura
  quan el rival menja de debò i anul·la la premove quan no.
- **`clock.test.js`** — comptabilitat del rellotge de partida i la seva
  invariant central: **sense increment, el rellotge d'un jugador no pot pujar
  mai**. `clockTickDeltaMs` retalla a zero els deltes negatius (un rellotge de
  sistema que recula no regala temps) i els valors corruptes;
  `clockMoveSpendMs` fa pagar a cada jugada el temps real del torn, posa el
  sòl fix de 0,1 s a la premove (mai no és gratis) i topa qualsevol
  compensació de latència pel sostre per jugada I pel temps transcorregut, de
  manera que el cost mai no és negatiu. Una rèplica fidel de la comptabilitat
  d'app.js (tics + pagament en acabar el torn) hi fa jugar una **ràfega de
  premoves consecutives** al bullet: cada premove costa exactament el mínim,
  el marcador del jugador no puja mai, el rival paga el residu entre l'últim
  tic i la seva jugada (el tram que abans es perdonava), una ràfega amb el
  rellotge al límit acaba en bandera pròpia, i als ritmes amb increment el
  rellotge només puja per l'increment —que la bandera anul·la si la jugada
  arriba tard. És la xarxa de seguretat contra l'errada 10.3
  d'`ANALISI_RELLOTGE.md`: les jugades més ràpides que el tic (200 ms) sortien
  gratis i les premoves jugaven mig bullet amb el rellotge aturat.
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
- **`collective.test.js`** — nivell de les **partides col·lectives** (Catalans vs
  Stockfish). L'exèrcit no té cap puntuació pròpia: el nivell el marca l'ELO/ROC
  de **Stockfish**, que s'adapta segons el resultat. `collectiveLadderStep`
  cobreix l'ajust, gros al principi i escurçat amb les partides però mai per sota
  del mínim, i `adaptedRivalStrength` que pugi en victòria de l'equip, baixi en
  derrota, es quedi en taules i no surti del rang del motor. La simulació de la
  sèrie sencera comprova que el nivell baixi fins a un exèrcit feble (mode ROC),
  pugi fins a un de fort, es quedi quiet quan ja està igualat i segueixi l'equip
  si aquest es reforça.
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
- **`tactics.test.js`** — secció ⚡ **Tàctiques**. D'una banda la rotació del
  banc (una posició resolta no torna fins que s'ha completat el cicle, i les
  dades corruptes mai deixen el cicle buit). De l'altra, la construcció d'un
  exercici a partir d'una línia JA verificada, sense motor
  (`createBundleSequenceHelpers`): línies de 3 i de 5 mitges jugades, exercicis
  d'**un sol pas** quan la millor jugada ja fa mat, tall de la línia quan la
  posició s'acaba o quan una jugada és il·legal, i metadades del motor per pas.
  Finalment, una comprovació sobre les dades REALS d'`app.js`: cap posició del
  banc no pot estar ja acabada (mat o taules) i **totes** han de tenir línia
  preparada de fàbrica a `TACTICS_BANK_SOLUTIONS`, legal i jugable fins al final.

  Aquest rebost estàtic es regenera amb el mateix Stockfish que porta l'app:

  ```bash
  node scripts/gen-tactics-solutions.js          # reescriu el bloc dins d'app.js
  node scripts/gen-tactics-solutions.js --dry    # només l'imprimeix
  ```

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
  mesura que no correspon a la jugada demanada **no es dona per bona**. La
  **profunditat** té bloc propi: es demana en jugades TEVES (5) i el color la
  desplaça —10 semijugades amb blanques i 11 amb negres, que hi obre el rival—,
  cap línia passa d'aquest límit, la principal hi arriba de debò, un `maxPlies`
  explícit continua manant i l'historial només es llegeix fins on es construeix.
  I sobretot, que cap línia no es queda a mitges: el sostre de probabilitat
  retalla l'AMPLADA i no la fondària (amb rèpliques molt repartides, on cap
  línia no arribaria al final pel sostre, totes hi arriben igualment) i el
  pressupost decideix quantes línies s'obren, no on s'acaben —amb pressupostos
  curts surten menys línies, però totes amb les teves 5 jugades.

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

- **`sounds.test.js`** — sons de la partida. La síntesi viu a `sons.js`
  (Web Audio, sense fitxers d'àudio) i la classificació de QUÈ ha de sonar a
  `core.js`: `soundKindForMove` amb jugades REALS de chess.js (jugada normal,
  captura i captura al pas, enroc curt i llarg, coronació amb i sense captura,
  l'escac que mana sobre la captura, i la jugada que acaba la partida que no
  sona perquè sona el resultat), `resultSoundKind` i `clockWarningLevel` (l'avís
  de temps baix: nivell 1 en entrar a la zona baixa del rellotge, nivell 2 als
  últims segons —la meitat de la zona, mai més de 5 s—, cap avís amb el rellotge
  a zero ni amb dades corruptes, i monotonia quan el temps baixa).
- **`livegame.test.js`** — partida en viu interrompuda. `app.js` desa una
  instantània de la partida en curs a cada jugada (i en amagar l'app); si la
  pestanya mor, l'app es tanca o s'actualitza a mitja partida, la pàgina d'inici
  ofereix reprendre-la. Es prova la validació de la instantània
  (`liveGameSnapshotIsValid`: versió, modes admesos —lliure, Joc vista, lliga—,
  color, jugades, rellotge coherent i mai a zero), la rejugada amb chess.js REAL
  (`liveGameReplay`: SAN «sloppy», i una jugada il·legal que invalida tota la
  instantània), què s'ofereix reprendre (`liveGameResumeInfo`: torn del jugador
  segons el seu color, caducitat als 7 dies, cap oferta sense jugades ni amb la
  partida ja acabada al tauler, rellotge conservat, instantània no mutada) i el
  text del bàner (`liveGameAgeLabel`, `liveGameBannerText`).
- **`dailynotify.test.js`** — avisos de les partides diàries:
  `dailyDeadlineWarningDue` (només dins de les 2 últimes hores del termini del
  jugador, una sola vegada per torn —el torn s'identifica per la marca d'inici—,
  mai un cop vençut ni quan toca moure al motor) i `dailyNotificationText`
  (resposta del rival, termini a punt de vèncer, derrota per temps i finals de
  partida, sense cap `undefined`).

- **`tutorial.test.js`** — els dos tutorials de `tutorial.js`. «Aprèn a
  jugar»: totes les posicions de les lliçons carreguen a chess.js REAL tal com
  estan escrites, cap exploració ni exercici parteix d'una partida acabada, cada
  exercici té almenys una solució legal i les jugades anunciades hi són, i quan
  la solució és una jugada concreta la resta de jugades legals es rebutgen.
  Casos concrets: jugada il·legal, equivocada i bona; el mat de dama que NO ha
  d'ofegar (l'ofegat es detecta amb missatge propi); mat del passadís; enroc
  curt i llarg, captura al pas i coronació amb qualsevol peça; sortir de
  l'escac; la forquilla de cavall. També el progrés (normalització, resum,
  etiqueta del bàner) i la «Guia d'El Tauler»: ids únics, text a cada targeta,
  accions dins del conjunt conegut i cobertura de totes les modalitats.

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

Els sons, la represa de partida i els avisos diaris també s'han comprovat amb
Playwright + Chromium sobre l'app REAL: partida lliure i partida 3+2 amb la
pestanya recarregada a mitja partida (bàner a l'inici, represa amb les mateixes
jugades, color, mode i rellotges, instantània esborrada en sortir), sons
registrats a la jugada humana i a la del motor, interruptors de Configuració
desats per dispositiu i conservats en recarregar, avís de termini de partida
diària (un per torn), notificació en segon pla amb enllaç profund i obertura
de la partida des d'aquell enllaç. Les regles de Firestore del rànquing s'han
provat amb l'emulador de Firestore (`@firebase/rules-unit-testing`): cada
usuari només pot crear, modificar o esborrar la seva entrada, i es deneguen les
escriptures sobre entrades d'altres, el reemplaçament del document sencer, els
camps desconeguts, els noms massa llargs, els ELO no numèrics o absurds i
qualsevol altre document de la col·lecció.

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
