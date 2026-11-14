# La lliga: rival, ROC dels rivals i resultats simulats

Revisió de la lliga (deu jugadors, nou jornades, tots contra tots) després
d'incorporar el rival de Stockfish 19 i les capes del rellotge
(`ANALISI_RELLOTGE.md` §8-17), i funcions noves de la temporada: colors
alternats, desempats, puntuació, rendiment, l'escala de lligues del municipi
al món, personalitat dels rivals i partides consecutives a 30s i 1+0. Codi a
`app.js` (`createNewLeague`, `applyLeagueAfterGame`, `getAIDepth`,
`makeEngineMove`, `showLeagueInterlude`), `core.js` (secció «Lliga») i
`localitats.js` (municipis i comarques) i `nomslliga.js` (noms dels rivals);
proves a `tests/league.test.js`,
`tests/league-rival.test.js`, `tests/league-season.test.js` i
`tests/league-ladder.test.js`; scripts i dades a `scripts/lliga-lichess/`.

## 1. Què hi havia

| | abans | ara |
|---|---|---|
| Referència de la graella | l'ELO del rellotge de la temporada (o el principal) | igual (era correcte) |
| ROC dels nou rivals | referència ±25 a l'atzar, terra 50 | de −200 a +200 cada 50 (±10), dins de ROC 200-2000 (§3) |
| Motor del rival, lliga amb rellotge | Stockfish 19 + model de tria humana + capes del rellotge | igual |
| Motor del rival, lliga sense rellotge | el motor antic (`stockfish.js`) | Stockfish 19 + model de tria humana (§2) |
| Profunditat de cerca | fórmula pròpia: 8 + diferència/250 (7-9 per a tothom) | la del ROC, com a la partida lliure (§2) |
| Partides entre rivals | 35% de taules entre igualats; puntuació decantada cap al 50% | taules mesurades a Lichess per ritme i nivell; puntuació d'Elo exacta (§4) |
| Graella d'una lliga no començada | congelada amb la puntuació del dia que es va crear | segueix la puntuació actual fins a la primera jornada |

La lliga es crea sola (bàner de l'inici) i podia passar dies abans de la
primera jornada: la graella es quedava amb la puntuació d'aquell moment
(sovint just després del calibratge), i el text «Graella generada amb…»
ensenyava la puntuació actual, no la que s'havia fet servir. Ara, mentre no
s'ha jugat cap jornada, la graella es reajusta a la puntuació actual com quan se
li canvia el rellotge; un cop començada, queda congelada i el text mostra la
referència amb què es va sortejar.

## 2. El rival: Stockfish 19 i les capes del rellotge

**Lliga amb rellotge.** Ja hi arribava tot: Stockfish 19 al worker propi
(§16), el model de tria humana des de ROC 872 (§17), el temps de reflexió de
la persona equivalent i el tarannà de la partida (§15), les errades per
pressió (§13), el pressupost de cerca i la bandera (§10-12). Tot penja de
`getActiveStrengthElo`, que a la lliga dona el ROC del rival de la jornada.
L'única peça que no quadrava és la profunditat de cerca per sota de ROC 872
(vegeu més avall), que §16.4 ja apuntava com a límit.

**Lliga sense rellotge.** Ara el rival també és Stockfish 19
(`sf19RivalWanted`, `timedRivalActive`): el mateix worker, la mateixa força
calibrada (`timedRivalStrengthElo`), el model de tria humana des de ROC 872 i
la tria pel mateix camí amb què es va calibrar (`chooseHumanLikeMove` amb el
*bestmove* natiu), sense errades per pressió. Sense rellotge no hi ha
pressupost de cerca; s'hi posa un sostre igual a la reflexió més llarga que el
rival es permet sense rellotge (`UNTIMED_RIVAL_SEARCH_MAX_MS`, 4,5 s), perquè
en un mòbil lent la cerca de totes les jugades a profunditat 10 no faci
esperar més del compte (a l'escriptori, ~0,4 s de mediana). El worker es
prepara en obrir la lliga; si no arrenca en 10 s, la jornada es juga amb el
motor de sempre.

**Profunditat.** `getAIDepth` tenia una branca pròpia per a la lliga,
`8 + round((ROC rival − ROC jugador)/250)` ±1. Amb rivals a ±25 la diferència
no arribava mai a moure-la: tots els rivals cercaven a 7-9, fos quin fos el
nivell. Ara la profunditat surt del ROC del rival com a la partida lliure, que
és la corba amb què es van calibrar Stockfish 19 i el model:

| ROC del rival | 300 | 500 | 700 | 900 | 1100 | 1300 | 1500 | 1700 | 1900 |
|---|---|---|---|---|---|---|---|---|---|
| profunditat abans (lliga) | 7-9 | 7-9 | 7-9 | 7-9 | 7-9 | 7-9 | 7-9 | 7-9 | 7-9 |
| profunditat ara (±1) | 4 | 6 | 7 | 9 | 10 | 12 | 13 | 14 | 15 |

Des de ROC 872 el model de tria humana fixa la profunditat a 10 (la de
l'ajust) i la força la posa el model.

**Comprovat a l'app** (Chromium, `stockfish-19-lite-single.js` real):

- Lliga sense rellotge, rival de ROC 215 i 358: totes les cerques del rival van
  al worker de Stockfish 19 (`UCI_Elo` al mínim i la capa de nivells baixos,
  MultiPV 12, `go depth 5-6 movetime 4500`); el motor antic només revisa les
  jugades de l'usuari.
- Lliga a 3+2 (ELO del ritme 1150), rival de ROC 1352: model de tria humana al
  nivell 634, Stockfish 19 a força màxima amb MultiPV de totes les jugades i
  `go depth 10 movetime ~1000` (pressupost del rellotge).
- Sense errors de pàgina.

## 3. Quin ROC han de tenir els rivals

**La referència.** La de sempre, i és la correcta: la puntuació del jugador
al rellotge de la temporada (o la principal, si el ritme encara no en té).
Aquestes puntuacions surten de partides contra el mateix rival a ROC coneguts
(ajust Elo als ritmes, ajust adaptatiu cap al 50% sense rellotge), de manera
que un rival amb el ROC de la referència és, per construcció, un rival contra
qui s'espera fer la meitat dels punts. No cal cap conversió: el ROC del rival
i l'ELO del jugador són la mateixa escala. (La correspondència amb Lichess de
§15 només serveix per al temps de reflexió i les taules de §4.)

**La dispersió.** Abans, nou rivals a ±25: pràcticament iguals, el 50%
contra tots, i el ROC de cada rival no volia dir res. S'ha simulat la
temporada sencera (`simulate_league.js`, 30.000 temporades per cel·la,
3+2, referència 1200) amb el jugador jugant al seu nivell o desplaçat:

| dispersió | campió (al nivell / +100 / +200) | podi (al nivell / +100 / +200) | últim, al nivell | posició al nivell (desv.) | posicions per 100 punts | campió és un rival de +100 o més |
|---|---|---|---|---|---|---|
| ±25 (abans) | 9,2% / 29,0% / 57,0% | 29,3% / 61,4% / 86,4% | 9,8% | 5,5 (2,84) | 1,77 | 0% |
| ±100 | 5,5% / 20,2% / 44,7% | 24,6% / 55,8% / 82,0% | 5,9% | 5,5 (2,53) | 1,64 | 21% |
| ±150 | 3,4% / 14,4% / 35,3% | 20,5% / 49,6% / 77,5% | 3,6% | 5,5 (2,26) | 1,52 | 69% |
| **±200 (ara)** | **2,1% / 9,8% / 26,6%** | **17,4% / 42,9% / 71,3%** | **2,0%** | **5,5 (2,03)** | **1,38** | **84%** |
| ±300 | 0,7% / 3,6% / 12,7% | 10,9% / 30,3% / 56,4% | 0,7% | 5,5 (1,64) | 1,10 | 96% |

El que en surt:

- **La posició final diu el mateix del rendiment amb qualsevol dispersió**: la
  relació entre el que es mou la posició per cada 100 punts de rendiment i el
  soroll de la posició és 0,62-0,68 a totes. Separar els rivals no fa la
  classificació més «justa»; canvia la forma.
- **Cada jornada torna a ser diferent**: amb ±200, contra el més fluix
  s'espera un 76% dels punts i contra el més fort un 24%. És la dispersió més
  ampla amb què cap jornada no queda decidida d'entrada (favorit per sota del
  75-76%); a ±300 hi hauria partides del 85%.
- **La taula té favorits**: el campió és un rival de +100 o més el 84% de les
  temporades (abans, qualsevol dels nou per sorteig). Jugant al propi nivell
  s'acaba a mitja taula, i guanyar la lliga demana jugar per sobre (campió el
  2% de les vegades al nivell, el 10% amb +100 i el 27% amb +200).
- A Lichess, entre persones, la puntuació real segons la diferència és més
  plana que la fórmula Elo (amb 200 punts de diferència, el més fort en treu un
  0,679 i no un 0,760; `analyze_results.py` §3), perquè les puntuacions tenen
  soroll. La del jugador també en té, de manera que a l'app la diferència
  efectiva serà una mica menor que la nominal i les xifres de dalt són, per al
  jugador, el cas difícil.

Amb el ritme sense rellotge i a 1+0 surt el mateix (campió al nivell 2,2% i
1,9%; podi 17,8% i 15,6%).

**El rang.** El motor només juga entre ROC 200 i 2000 (`ELO_MIN`, `ELO_MAX`).
Abans un rival podia sortir amb ROC 50-199 i jugar com un de 200, o passar de
2000 i jugar com un de 2000. Ara, si la referència és a menys de 210 punts d'un
extrem, els rivals d'aquell costat s'hi encabeixen en proporció
(`leagueOpponentRating`): conserven l'ordre i el ROC que es veu és el que
juguen. Exemple, referència 250: 202, 214, 226, 238, 250, 300, 350, 400, 450.
Amb el jugador per sota de 200 o per sobre de 2000, els rivals d'aquell costat
queden a l'extrem: el motor no arriba més enllà.

Cada rival desa el seu desplaçament (`offset`): si el rellotge de la lliga
canvia abans de començar, la graella es torna a col·locar sobre la referència
nova dins del rang. Les lligues desades abans d'aquest canvi (sense
desplaçament) es mouen en bloc com sempre, ara també amb sostre.

## 4. Les partides entre rivals

Els resultats de les altres quatre partides de cada jornada se simulen.
Abans: un 35% de taules entre igualats (20% + 15%), i la resta repartida amb la
probabilitat d'Elo, de manera que la puntuació esperada quedava decantada cap
al 50% (un rival de 200 punts més en treia el 67% i no el 76%).

**Taules a Lichess** (`measure_results.py`, bolcat 2026-06: 40 trossos de 50 MB
repartits per tot el mes, 5,85 M de partides llegides i 3,62 M comptades dels
ritmes de l'app; s'hi descarten les abandonades i les de menys de dues
jugades). Entre jugadors a menys de 250 punts, per franja d'ELO mitjà:

| ELO mitjà | 1+0 | 3+2 | 5+0 | 10+0 | 15+10 | clàssic 30 min |
|---|---|---|---|---|---|---|
| 700 | 1,0% | 4,7% | 4,3% | 6,0% | 6,0% | — |
| 900 | 0,8% | 3,8% | 4,0% | 4,7% | 4,9% | — |
| 1100 | 1,1% | 3,1% | 3,8% | 4,1% | 4,0% | 4,9% |
| 1300 | 1,5% | 3,3% | 3,7% | 3,9% | 4,2% | 4,6% |
| 1500 | 1,9% | 3,6% | 3,9% | 4,0% | 4,6% | 4,5% |
| 1700 | 2,4% | 3,9% | 4,4% | 4,5% | 5,3% | 5,2% |
| 1900 | 2,9% | 4,9% | 4,9% | 5,3% | 7,3% | 8,3% |

(Cada cel·la amb entre 2.000 i 300.000 partides. El 30s només té dades des de
1700: 2,3% i 3,3%; per sota s'hi fa servir l'1+0.) **Als nivells de l'app es
fan entre deu i trenta vegades menys taules de les que simulava la lliga.**
Fins a 250 punts de diferència la taxa no canvia; després baixa (0,90 a 300,
0,77 a 400, 0,64 a 500, relatiu als igualats).

**El model** (`leagueDrawChance`, `leagueSimulatedResult`): la taxa de la
taula per al ritme de la temporada (la partida sense rellotge pren el clàssic,
i el 15+10 a 700 i 900), interpolada al nivell de Lichess a què s'assemblen
jugant els dos rivals (`clockEloForRoc` de la mitjana dels seus ROC, com el
rellotge de §15), i el factor de la diferència. La puntuació esperada és
exactament la d'Elo: P(guanya A) = E − taules/2. Les proves comproven les dues
coses amb 40.000 partides simulades.

## 5. Colors, desempats i puntuació

- **Colors alternats** (`leaguePlayerColors`): el jugador fa 5 partides amb un
  color i 4 amb l'altre, alternant jornada a jornada (el color de la primera se
  sorteja). Abans es tirava a l'atzar a cada partida i podien sortir-ne 7 de 9
  amb negres. La jornada desa el color (`leagueActiveMatch.playerColor`) i
  `startGame` el respecta.
- **Tots els resultats** de la temporada es desen (`currentLeague.results`:
  jornada, jugadors i punts), també els dels rivals entre ells.
- **Desempats** (`leagueStandings`), els de les lligues de tots contra tots:
  punts; enfrontament directe (punts entre els empatats, només si tots s'hi han
  enfrontat); victòries; Sonneborn-Berger (punts dels rivals guanyats més la
  meitat dels empatats); ROC i nom. Abans: victòries i ROC. Les lligues velles,
  sense resultats desats, desempaten com abans.
- **Les partides de lliga puntuen**: Elo (K=24, mínim ±8 com a la resta de
  l'app) contra el ROC del rival de la jornada, a l'ELO del ritme de la
  temporada o, sense rellotge, al principal. Abans no puntuaven enlloc. La
  graella no es mou: es va sortejar amb la puntuació d'inici de temporada.
- **Rendiment** (`leaguePerformanceRating`): l'ELO amb què la puntuació
  esperada contra els rivals que s'han tingut és la feta (amb el 100% o el 0%
  s'hi compta mig punt menys o més). Es veu durant la temporada i al final.

## 6. L'escala: del municipi al món

**On jugues.** En obrir la lliga per primer cop surt la finestra «On jugues?»
(`openLeagueHomeModal`): territori (Catalunya, País Valencià, Illes Balears,
Andorra, Catalunya Nord, Franja de Ponent, l'Alguer o fora dels Països
Catalans), municipi, comarca i província. A Catalunya el municipi es tria
d'una llista mentre s'escriu (els 947 municipis d'Idescat, sense accents ni
majúscules) i en surten la comarca i la província, també a les comarques
partides com la Cerdanya o la Selva. Als altres territoris la comarca (o
l'illa) es tria d'una llista que dona la província, i el municipi s'escriu.
Fora dels Països Catalans tot s'escriu, i també el país. La finestra ensenya
les set lligues que tocaran, amb «← hi comences» a la del territori (o «← hi
jugues» on es juga ara, si ja s'han fet temporades). Amb «Ara no» no torna a sortir en una setmana; el
botó de la localitat de la capçalera la torna a obrir. La localitat es desa a la
trajectòria (`chess_leagueCareer.home`) i se sincronitza; si la lliga encara
no ha començat, es torna a sortejar amb els noms i els rivals del lloc nou.

**Set nivells** (`LEAGUE_LEVELS`), amb el nom del lloc del jugador
(`leagueLevelName`, contraccions amb `catalanDe`):

| nivell | icona | lliga (exemple: Vic) | graella del Grup C · B · A |
|---|---|---|---|
| municipal | `ic-village` (cases) | Lliga de Vic | −120 · −108 · −96 |
| comarcal | `ic-mountain` (muntanyes) | Lliga Comarcal d'Osona | −84 · −72 · −60 |
| provincial | `ic-columns` (edifici de columnes) | Lliga Provincial de Barcelona | −48 · −36 · −24 |
| territori | `ic-castle` (castell) | Lliga Catalana (Valenciana, Balear, Andorrana...) | −12 · 0 · +12 |
| Països Catalans | `ic-map` (mapa) | Lliga dels Països Catalans | +24 · +36 · +48 |
| Europa | `ic-europe` (cercle de punts) | Lliga Europea | +60 · +72 · +84 |
| món | `ic-globe` (globus) | Lliga Mundial | +96 · +108 · +120 |

**Icones.** Totes les de la lliga són del joc d'icones de l'app (`<symbol
id="ic-...">` d'index.html: line-icons monocromes que hereten el color del
text i funcionen en mode fosc, dia i paper electrònic), mai emojis: els
nivells, la localitat (`ic-pin`), l'escalada (`ic-ladder`), el cadenat del
rellotge (`ic-lock`), el trofeu, les seccions plegables (calendari, tauler,
peó, trofeu) i els estils dels rivals (l'Atacant `ic-swords`, el Mur
`ic-wall`, el Caçador `ic-target`, l'Estratega `ic-compass`). Les pinta
`leagueIcon` (app.js); els països dels rivals van sense bandera.

**Una escala de 21 graons: C → B → A → C del nivell següent.** Cada nivell té
tres lligues, la C, la B i la A, i es puja d'un graó en un: de la C a la B, de
la B a la A, i de la A a la C del nivell següent (com a Remigi). En acabar la temporada, el podi puja un graó i
els tres últims en baixen un (`leagueNextTier`); de Municipal C no es baixa i
de Mundial A no es puja (allà, el primer és «Campió del món», amb el globus).
El graó viu a la trajectòria (`tier`, de 0 a 20) i a la lliga
(`ladder.tier`); el nom de la lliga porta el grup («Lliga Comarcal d'Osona ·
Grup B»).

**On es comença: com a mínim, a la lliga del territori.** Les trajectòries
noves comencen a la Lliga Catalana C (o la Valenciana, la Balear, l'Andorrana,
la de la Catalunya Nord, la de la Franja o l'Algueresa: graó 9,
`LEAGUE_START_TIER`), amb la graella a −12. Abans es començava a la Lliga Local
C i, jugant al nivell de la puntuació, s'arribava a la Lliga Catalana cap a la
temporada 32. La provincial, la comarcal i la local hi són per a qui baixa:
un cop s'ha jugat a la lliga del territori, l'escala mana i es pot baixar. Les
trajectòries d'abans que no hi havien arribat mai (el millor graó, `bestTier`,
per sota del 9) hi pugen (`leagueFloorTier`, a `loadLeagueCareer`); una
temporada d'abans que es jugui per sota acaba pujant-hi
(`finalizeLeagueSeason`). El millor graó desat continua essent el que s'ha
jugat de debò, i els graons de sota no es pinten mai com a fets a l'escalada.

*Abans*, el grup sortia de l'ELO mitjà de la graella (`leagueLevelGroup`, amb
llindars per nivell) i el podi pujava un nivell sencer: amb el mateix ELO, en
pujar es queda a la mateixa lletra del nivell següent (de Vic B a Comarcal B),
i la C, la B i la A no eren cap escala. Les trajectòries d'abans (només amb el
nivell) passen a la C d'aquell nivell; una lliga d'abans en joc es tanca des
del graó del seu nivell i grup (`leagueTierOf`).

**Els rivals continuen essent del nivell del jugador.** La graella es
reparteix com sempre (±200, §3) al voltant de la referència del jugador més el
desplaçament del graó (`leagueTierShift`): de −120 a Municipal C a +120 a
Mundial A, 12 punts per graó. És el mateix recorregut que tenien els set
nivells (40 punts per nivell), repartit entre els tres grups. No s'ha triat
una escala d'ELO fixa per graó perquè un jugador de 1600 hauria d'esperar
temporades senceres de partides guanyades al seu poble, i un de 500 no podria
fer res a la comarcal: així cada partida continua essent igualada i el que
canvia és l'exigència per pujar. El grup ja no depèn de l'ELO: canviar el
rellotge abans de començar mou la graella però no el grup.

**D'on són els rivals** (`rivalOrigins` de `localitats.js`): al municipal, del
poble (no es diu); a la comarcal, de municipis de la comarca; a la
provincial, de comarques de la província; a la del territori, de municipis de
Catalunya (o comarques del territori); a la dels Països Catalans, de ciutats de
tots els territoris; a l'europea i la mundial, de països. Es veu a sota del
nom a la classificació, a la franja del proper rival i a la secció dels rivals.

**Com es diuen els rivals** (`nomslliga.js`, `rivalNames`): noms de persona,
nom i cognom, que s'escauen a la lliga i es fan més internacionals a mesura
que es puja. Es combinen noms i cognoms comuns de cada lloc (dones i homes
gairebé a parts iguals); cap no és d'una persona coneguda ni porta el cognom
d'un gran jugador d'escacs.

| nivell | d'on són els noms | exemple (jugador de Vic) | noms catalans |
|---|---|---|---|
| municipal | del territori del jugador | Mireia Roig, Pol Guix | 100% |
| comarcal | del territori, alguns d'altres orígens | Eudald Bonet, Rubén Sánchez | 88% |
| provincial | encara més d'altres orígens | Ona Oliveras, Elena Popescu | 76% |
| territori | la gent que hi viu (espanyols, llatinoamericans, marroquins, romanesos, xinesos, pakistanesos) | Aina Grau, Khadija Haddad | 60% |
| Països Catalans | del territori de la ciutat d'origen: un de Palma, mallorquí; un de Perpinyà, rossellonès | Miquel Florit (Palma), Pepa Tormo (Alacant) | 30% (81% dels Països Catalans) |
| Europa | del país d'origen | Zofia Kowalska (Polònia), Thomas Mercier (França) | 0% |
| món | del país d'origen | Sakura Yamamoto (Japó), Hayk Harutyunyan (Armènia) | 0% |

Cada territori té els seus noms (catalans, valencians, de les Illes, de la
Catalunya Nord, andorrans, de la Franja i de l'Alguer) i la seva barreja
d'altres orígens (a Andorra, molts portuguesos; a les Illes, alemanys; a la
Catalunya Nord, francesos). Fora dels Països Catalans, els noms són del país
que s'ha escrit. Hi ha 69 repertoris: on el cognom canvia amb el gènere hi va
de dona i d'home (Kowalska, Kowalski; Jónsdóttir, Jónsson), i a la Xina, Corea
i el Vietnam el cognom va davant (Yoon Jae-won, Trần Thị Hương).

**Els noms van canviant**: dins d'una lliga no es repeteix cap nom ni, si es
pot, cap nom de pila ni cognom, i la trajectòria recorda els noms de les sis
darreres temporades (`chess_leagueCareer.recentNames`, 54 noms) perquè no
tornin a sortir. Sense el mòdul, la lliga fa servir els àlies d'abans
(`LEAGUE_FALLBACK_NAMES`).

**Simulat** (`simulate_ladder.js`, 4.000 temporades per graó, 3+2,
referència 1200; carreres de 60 temporades des de la Lliga Catalana C):

| graó | podi jugant al nivell | baixa jugant al nivell | podi amb +100 |
|---|---|---|---|
| Municipal C · B · A | 55% · 51% · 47% | — · 4% · 4% | 81% · 79% · 75% |
| Comarcal C · B · A | 42% · 39% · 36% | 6% · 6% · 7% | 69% · 68% · 63% |
| Provincial C · B · A | 30% · 26% · 23% | 8% · 11% · 13% | 59% · 54% · 51% |
| Catalana C · B · A | 20% · 16% · 14% | 15% · 17% · 20% | 47% · 43% · 40% |
| Països Catalans C · B · A | 12% · 11% · 9% | 23% · 25% · 29% | 34% · 31% · 29% |
| Europea C · B · A | 7% · 6% · 4% | 34% · 38% · 43% | 24% · 22% · 20% |
| Mundial C · B · A | 4% · 3% · 3%* | 47% · 52% · 56% | 18% · 14% · 12%* |

(*a Mundial A el podi no puja: és la probabilitat d'acabar-hi entre els tres
primers.) Començant a la Lliga Catalana C (1.000 carreres de 60 temporades),
un jugador que sempre juga a la seva puntuació hi passa el 63% del temps, el
66% arriba als Països Catalans (temporada 28 de mitjana) i el 82% baixa algun
cop a la provincial (el 10%, a la comarcal). Amb +50 de rendiment (qui millora
més de pressa que la puntuació), el 100% arriba als Països Catalans
(temporada 15) i el 69% a l'europea (34); amb +100, el 100% a l'europea
(temporada 20) i el 78% a la mundial (37). Començant a Municipal C, com
abans, a la Lliga Catalana s'hi arribava a la temporada 32. Les partides de
lliga puntuen (§5): qui millora de debò puja a l'escala.

**Pantalla.** A la capçalera, sota el nom, els set nivells de l'escalada
(acabats en verd, l'actual en taronja, el millor nivell amb vora daurada) i el
botó de la localitat amb el municipi i la comarca. La rajola **NIVELL** diu el nivell, el
grup i les zones (a Municipal C només «↑ podi»; a Mundial A, «↓ 3 últims»), i la
taula i la llegenda només marquen les zones que hi ha (a Municipal C la cua no
va de vermell). La secció plegable «L'escalada: del municipi al món» ensenya
els set nivells (el mundial a dalt) amb els seus grups en ordre, Grup C → Grup B
→ Grup A: els graons fets en verd, el d'ara en taronja («Ets aquí: Grup B») i el
millor graó en daurat.
Els graons de la capçalera l'obren. Al bàner de l'inici, el títol és la lliga
(«Lliga de Vic»); sense localitat, convida a triar-la.

En acabar, la revisió i la franja diuen on es jugarà la temporada següent
(`leagueTierMoveText`): «Puges al Grup B de la Lliga de Vic», «Puges al Grup A
de la Lliga de Vic», «Puges a la Lliga Comarcal d'Osona · Grup C», «Baixes a
la Lliga de Vic · Grup A» o «Continues al Grup B...». La trajectòria
(`chess_leagueCareer`) desa el graó (`tier`) i el nivell, el millor graó i el
millor nivell, la localitat i fins a 30 temporades (nom, ritme, posició,
punts, rendiment, nivell, grup, graó i graó següent); el palmarès en mostra
les 10 darreres.

**Les divisions d'abans.** Abans hi havia cinc divisions (Quarta a d'Honor,
−100 a +100). Una lliga de divisions que encara no ha començat passa a
l'escala en obrir-la (`upgradeLegacyLeague`); una de començada s'acaba amb la
seva divisió i en tancar-la l'escalada comença a la lliga del territori
(«L'escalada comença a la Lliga Catalana»). Les temporades velles del palmarès conserven el
nom de la divisió.

La finestra de revisió que surt en acabar la darrera jornada porta a dalt la
**posició final, gran** («2n» de 10, `leagueFinalReviewHtml`), del color del
podi (or, plata, bronze), del descens (vermell) o verd aigua a mitja taula, amb
els punts, el rendiment, si es puja o es baixa de nivell i el campió; si n'ets
tu, «Campió de la lliga» amb el trofeu. A la pantalla de la lliga, la franja del resum
també posa la posició gran a la capsa del costat.

## 7. Personalitat dels rivals

- **Estil**: cadascun té un dels quatre perfils de la TV (`TV_STYLES` de
  `stockfishtv.js`: l'Atacant, el Mur, el Caçador i l'Estratega), cap més de
  tres vegades. Després de triar la jugada (model de tria humana o tria
  anterior), entre les candidates que el motor valora a 12 centèsimes de peó o
  menys de la triada, per sobre o per sota, s'hi juga la que més s'avé amb
  l'estil (`leagueStyledChoice`). La diferència d'avaluació queda acotada per
  aquesta finestra, de manera que la força pràcticament no es mou. L'errada per
  pressió de rellotge no es toca, i amb un mat a la vista tampoc.
- **Repertori**: una obertura amb blanques i una defensa contra 1.e4 i una
  contra 1.d4, de la llista curada d'obertures de l'app (`CURATED_OPENINGS`, se
  n'ha comprovat que totes les línies són legals). El rival juga la seva línia
  mentre la partida la segueix i se la sap: 3 jugades pròpies per sota de ROC
  800, 5 fins a 1400 i 8 a partir d'aquí (`leagueBookMove`, `leagueBookDepth`).
  Les jugades de llibre passen pel mateix camí que les del motor: temps de
  reflexió humanitzat, rellotge i premoves.
- La pantalla de la lliga diu, del proper rival, el ROC, l'estil, el color de la
  jornada i què hi jugarà; i una secció plegable ensenya l'estil i el repertori
  dels nou.

Les lligues desades abans d'aquest canvi reben estil, repertori, colors i
divisió en obrir-les (`ensureLeaguePersonality`).

## 8. Lliga ràpida: partides consecutives a 30s i 1+0

A les lligues de 30s i 1+0 (`leagueAutoChains`), en acabar una jornada no surt
la revisió: surt una pantalla amb poc text. El resultat en curt
(«Victòria per temps · +13», `leagueShortResult`), el rellotge final, la
**jornada que toca, gran i en un requadre** («JORNADA 3/9»), «comença en» i el
compte enrere de 30 a 0. A sota, **les dues posicions a la classificació, cara
a cara**: la teva (insígnia verd aigua, punts i color amb què jugaràs) contra
la del proper rival (insígnia del color del seu estil, amb la icona a la
cantonada, punts i ROC). L'estil,
l'obertura i el nivell ja no hi surten en text (són a la pantalla de la lliga).
A zero comença sola la jornada següent; «Juga ara» no espera i «Inici»
l'atura.

Sortir no desactiva res: és el ritme de la lliga el que encadena les
partides. La propera jornada que es jugui (des de la lliga, el bàner de
l'inici o una missió) tornarà a acabar amb el compte enrere, i així fins a la
novena, que acaba amb la revisió normal i el resum de la temporada. La
partida es desa a l'historial igualment i es pot revisar des de la llista de
jornades.

Si la partida era amb rellotge, el resultat porta el **rellotge final** dels
dos jugadors («Tu» i el rival, cadascun a la capsa del color amb què jugava),
aquí, a la finestra de revisió de qualsevol partida amb rellotge i a la llista
«Les teves jornades» (`resultFinalClockHtml`, `leagueRoundClockText`).

Sota el rellotge final hi ha l'**encert**: el de la partida que s'acaba de
jugar i la **mitjana de les partides d'aquesta lliga** (amb quantes partides
compten). És el mateix percentatge de jugades bones que la revisió
(`finalPrecision`); la mitjana surt de les partides enllaçades a les jornades
(`currentLeagueGameLinks`) més la que s'acaba de jugar, sense comptar-la dues
vegades. Les partides sense cap jugada pròpia (perdudes de seguida per temps)
no hi compten (`leagueAccuracySummary`). Verd a partir del 80 %, daurat del 60
al 79 % i vermell per sota.

El compte enrere només corre amb l'app a la vista (amb la pestanya amagada
s'atura) i, si una altra pantalla tanca la finestra, s'atura sense començar
cap partida d'amagat.

**Tornades musicals.** Durant el compte enrere sona una tornada que
**l'app compon en aquell moment** (`radioambient.js`, `composeJingle`) i
sintetitza al dispositiu com la resta de música. És música **tranquil·la**,
per acompanyar entre partida i partida: tempos de 77 a 104 ppm, percussió
suau, salts de melodia curts i notes llargues. **No té final**: és un bucle
de 32 s (l'últim compàs és la dominant, que torna a la tònica en començar de
nou) que sona fins que comença la partida. Hi ha cinc
estils d'acompanyament: *Passeig de jornada*, *Tic-tac del rellotge*, *Rumba
de la classificació*, *Groove de la jugada* i *Himne de la lliga*; cada
transició en tria un de diferent de l'anterior
(`eltauler_league_jingle_last`). Cada peça tria també el **solista** (flauta,
vibràfon, piano elèctric, clarinet, trompa, cordes, arpa, guitarra, marimba,
celesta o acordió, segons l'estil) i una de dues **variants
d'acompanyament** (ritme de guitarra, línia de baix, arpegis, tic-tac sí o
no). La música és nova cada vegada: tonalitat, tempo, progressió d'acords en
frases A · A' · B amb cadència a la dominant, i una melodia amb notes de
l'acord als temps forts, passos per l'escala entre mig, el motiu de la
primera frase repetit a la segona i la tornada a la tònica en cada volta. Tot surt d'una
llavor (un enter); l'app recorda l'empremta de les 200 darreres peces
(`eltauler_league_jingle_seen`) i no en repeteix cap. La pantalla diu quina
sona («Sona: Rumba de la classificació · la menor · flauta»). La
mateixa música composta sona també de fons a la TV Stockfish vs Lozza (un
bucle de 32 s nou per a cada partida, `composeMelodyId`). Totes les peces
queden al **registre** de Configuració › Veus de lectura › «Música composta
per l'app» (`eltauler_composed_music`). De cada peça només es desa la
recepta (estil, llavor, on i quan va sonar, si és preferida: uns 90 bytes; el
so es torna a generar igual), de manera que se'n conserven les 200 darreres
(uns 18 kB) i fins a 100 preferides. La llista està ordenada
(`registryGroups`): **les 5 darreres** a la vista, després **les preferides**
i la resta a l'**Arxiu**, plegat i agrupat per dies («Avui», «Ahir», «dj., 5
de nov.»). Cada peça es pot escoltar (en bucle), marcar com a preferida o
**baixar en MP3**: l'app genera quatre voltes del bucle (uns 2 minuts, amb un
esvaïment de 3 s només al final del fitxer) i les codifica al navegador amb
lamejs (mono, 22.050 Hz, 64 kbps, ~1 MB), que només es baixa de cdnjs el
primer cop (`exportSamples`, `encodeMp3`, `mp3FileName`; nom del fitxer sense
accents). Les tornades antigues, que acabaven amb un acord, també es tornen a
generar en bucle. Comença
pel punt on va el compte enrere (si generar-la triga una mica; el bucle dona
la volta); es
pausa amb l'app amagada i s'apaga suaument amb «Juga ara», «Inici» o en
començar la jornada. Segueix la música de Configuració › Veus de lectura
(només sona si la música hi és activada, amb el seu volum). Durant la
partida amb rellotge no sona res.

**Comprovat a l'app** (1+0, Chromium, Stockfish 19 real): el rival de la
jornada 1, amb blanques i el Sistema Londres, obre 1.d4; en rendir-se apareix
el compte enrere amb el proper rival («AlfilFosc, 10è a la lliga, ROC 1106, el
Mur, hi jugues amb blanques, es defensa amb la Siciliana i la Benoni»), sense
la revisió; a zero comença la jornada 2 amb blanques; «Anar a l'inici» porta a
l'inici sense cap partida en marxa, i la jornada 3, començada des d'allà, torna
a acabar amb el compte enrere. Amb 1.e4, un rival amb l'Escandinava respon
1…d5. La jornada 9 acaba amb la revisió normal; en quedar 2n, la temporada es
tanca amb «Puges a Primera Divisió» i la següent lliga surt +50 punts. Les
partides reals han mogut l'ELO de 1+0 (tres derrotes: 1250 → 1202). Sense
errors de pàgina.

## 9. La pantalla de la lliga

La capçalera és un mosaic de quatre rajoles de colors —**jornada** (amb les
victòries, empats i derrotes), **rellotge** (el selector mentre la lliga no ha
començat; després, el ritme amb cadenat i l'ELO amb què es va sortejar la
graella), **nivell** (§6; la divisió a les lligues velles) i **rendiment**— i una franja amb el **proper rival**,
del color i la icona del seu estil (l'Atacant vermell amb les espases, el
Mur blau amb els maons, el Caçador taronja amb la diana, l'Estratega lila amb
la brúixola; icones de línia de l'app, §6). Amb la temporada acabada, la franja
és el resum (verda si es puja, vermella si es baixa). S'han tret el
«Rellotge» repetit, la frase de la divisió i la línia de punts per resultat
(ara és a la llegenda de sota la taula).

La mateixa paleta (colors pastel sòlids amb text fosc, `--lg-*` i classes
`lgc-*`) es fa servir a tota la pàgina: la posició a la taula (or, plata i
bronze al podi, vermell a la zona de descens), una franja verda o vermella a
les zones d'ascens i descens, un punt del color de l'estil de cada rival, els
punts, el resultat de les teves jornades, cada secció plegable amb el seu
color, el quadre d'enfrontaments (1 verd, 0 vermell, ½ groc), els rivals, el
palmarès i la pantalla entre partides. Es llegeix sobre els cinc fons foscos i
en mode dia; en paper electrònic passa a grisos i les zones van amb vora. Al
mòbil la taula hi cap sencera: s'hi amaguen les partides jugades (iguals per a
tothom) i el Sonneborn-Berger (que és al quadre i a la llegenda).

## 10. Límits

- **El rival de lliga sense rellotge no s'ha comparat amb el de la partida
  lliure sense rellotge.** Stockfish 19 i el model de tria humana es van
  calibrar per jugar com el rival antic *de les partides amb rellotge* al
  mateix ROC (§16-17), amb el pressupost del rellotge còmode. La puntuació
  principal surt de partides sense rellotge contra el motor antic, que tria
  per un camí una mica diferent (sense el *bestmove* natiu). La força hauria
  de ser la mateixa —sense rellotge la cerca arriba sempre a la profunditat
  que toca, i el rellotge còmode tampoc no la tallava gaire—, però no s'ha
  mesurat. Es pot fer amb l'arnès de §14 (`bench.js`) fent jugar els dos camins
  sense pressupost.
- La dispersió s'ha triat amb simulacions que donen al jugador un rendiment
  fix i la fórmula Elo; no hi ha dades de com puntuen les persones reals contra
  el rival per diferència de ROC.
- Les taules entre rivals són les de persones de Lichess; el rival no
  proposa ni accepta taules.
- Per sota de ROC ~870 el nivell de Lichess equivalent és per sota de les
  dades (§15) i s'hi fa servir la franja més baixa (700).
- Les jugades de llibre són teoria: durant les primeres jugades el rival
  juga millor del que li tocaria pel ROC (com una persona que es coneix la
  seva obertura). No s'ha mesurat l'efecte sobre els resultats; per això el
  llibre és curt als nivells baixos (3 jugades).
- L'efecte de l'estil sobre la força s'ha acotat (cada jugada canviada és a
  12 centèsimes de peó o menys de la triada, en tots dos sentits), no mesurat
  en partides.
- Les partides de lliga puntuen, però la graella no segueix la puntuació un cop
  començada la temporada: si el jugador puja molt durant la temporada, la
  lliga se li fa més fàcil fins a la següent.
- Els desplaçaments de l'escala (12 punts per graó, 40 per nivell) s'han
  triat amb simulacions de rendiment fix (§6), no amb dades de persones reals.
- Fora de Catalunya no hi ha llista de municipis (s'escriuen) i els rivals de
  la comarcal no tenen poble d'origen. Els noms de les comarques i dels
  municipis són els d'Idescat (novembre de 2026).

## 11. Proves

- `league-rival.test.js`: quan juga el rival de Stockfish 19 (lliga amb i
  sense rellotge, partida lliure amb rellotge sí; lliure sense rellotge,
  exercicis o motor caigut no); obrir la lliga el prepara; la profunditat de
  la lliga és la de la partida lliure per a tot el rang i ja no la fórmula
  antiga; `makeEngineMove` a la lliga sense rellotge (model de tria humana,
  totes les jugades, sostre de 4,5 s, cap errada per pressió encara que l'atzar
  hi caigui, línies recollides per profunditat; per sota de ROC 872, força
  calibrada i profunditat del ROC; sense Stockfish 19, com abans) i la tria pel
  camí calibrat.
- `league.test.js` (afegides): desplaçaments dels rivals (−200…+200, ±10,
  ordenats, mitjana del jugador), col·locació dins de 200-2000 als dos
  extrems i amb el jugador fora del rang, reajust de la graella amb
  desplaçaments (anar i tornar la deixa igual) i sense (lligues velles, ara amb
  sostre), lliga no començada que segueix la puntuació actual i començada que
  queda congelada, taules mesurades (rang, bullet < ritmes lents, nivell
  equivalent, factor de la diferència, ritme desconegut) i puntuació esperada
  d'Elo exacta amb 40.000 partides simulades.
- `sf19rival.test.js`: la decisió de preparar Stockfish 19 passa per
  `sf19RivalWanted`.
- Escala de graons (§6): 21 graons en l'ordre C, B, A per nivell, desplaçament
  de 12 punts per graó, el podi puja un graó i els tres últims en baixen un,
  els textos «Puges al Grup B…» / «… · Grup C», temporades senceres que pugen
  de la C a la B, de la B a la A i de la A a la C del nivell següent, campió del
  món només a Mundial A, i trajectòries i lligues d'abans dels graons; el
  mínim (`leagueFloorTier`): les trajectòries noves comencen a la lliga del
  territori C (també la Valenciana), les d'abans que no hi havien arribat hi
  pugen (també acabant una temporada començada per sota), i qui hi ha jugat
  baixa a la provincial si perd (`league-season.test.js`,
  `league-ladder.test.js`).
- `league-season.test.js` (§5-8): colors alternats i el color de la jornada a
  `startGame`; desempats (punts, directe només si tots s'han enfrontat,
  victòries, Sonneborn-Berger, lligues velles); rendiment (esperança igual a la
  puntuació, monotonia, extrems); divisions i desplaçament de la graella; una
  temporada sencera amb el codi real (45 resultats, cada parella un cop,
  colors desats, campió que puja i últim que baixa, palmarès); les partides de
  lliga puntuen i no es compten dues vegades; estils, repertori (totes les
  línies de la llista curada són legals), llibre (segueix, s'atura en sortir-se,
  torn i profunditat, defensa segons la primera jugada), estil acotat a la
  finestra (200 casos a l'atzar) i `tryLeagueBookMove` a l'app; partides
  consecutives (només 30s i 1+0, compte enrere 30 → 0 que arrenca la jornada,
  aturat amb l'app amagada o la finestra tancada, mostrat en lloc de la
  revisió i aturat per «Anar a l'inici»); i la pantalla (§9): les quatre
  rajoles i la franja del rival, colors de posició i d'estil, textos curts i
  la taula que cap al mòbil; el rellotge final amb el resultat (revisió,
  compte enrere i jornades), i res sense rellotge.

## 12. Com refer-ho

```bash
# Taules i puntuació per diferència (Lichess, ~25 min; cal pip install zstandard)
python3 -I scripts/lliga-lichess/measure_results.py results.json 40 50
python3 -I scripts/lliga-lichess/analyze_results.py results.json
python3 -I scripts/lliga-lichess/draw_table.py results.json   # → LEAGUE_DRAW_RATES
# Temporades simulades amb el codi de core.js
node scripts/lliga-lichess/simulate_league.js 30000 3+2 1200
# L'escala: podi i descens per graó i carreres des de la lliga del territori
node scripts/lliga-lichess/simulate_ladder.js 20000 3+2 1200
# Municipis de Catalunya (localitats.js): Idescat, codis territorials
curl -sS "https://www.idescat.cat/codis/?id=50&n=9&f=ssv"
```
