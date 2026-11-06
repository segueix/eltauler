# La lliga: rival, ROC dels rivals i resultats simulats

Revisió de la lliga (deu jugadors, nou jornades, tots contra tots) després
d'incorporar el rival de Stockfish 19 i les capes del rellotge
(`ANALISI_RELLOTGE.md` §8-17). Codi a `app.js` (`createNewLeague`,
`applyLeagueAfterGame`, `getAIDepth`, `makeEngineMove`) i `core.js` (secció
«Lliga»); proves a `tests/league.test.js` i `tests/league-rival.test.js`;
scripts i dades a `scripts/lliga-lichess/`.

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

## 5. Límits

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

## 6. Proves

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

## 7. Com refer-ho

```bash
# Taules i puntuació per diferència (Lichess, ~25 min; cal pip install zstandard)
python3 -I scripts/lliga-lichess/measure_results.py results.json 40 50
python3 -I scripts/lliga-lichess/analyze_results.py results.json
python3 -I scripts/lliga-lichess/draw_table.py results.json   # → LEAGUE_DRAW_RATES
# Temporades simulades amb el codi de core.js
node scripts/lliga-lichess/simulate_league.js 30000 3+2 1200
```
