# Com juguen les persones amb rellotge (i què n'ha de fer el motor)

Estudi de partides **reals** amb rellotge per calibrar el comportament del rival
d'El Tauler als ritmes contrarellotge. Les xifres d'aquest document són les que
hi ha, una per una, a la taula `HUMAN_CLOCK_STATS` de `core.js`.

## 1. D'on surten les dades

- **Font**: bolcat públic de Lichess, `lichess_db_standard_rated_2026-06`
  (`database.lichess.org`), partides classificades d'escacs estàndard.
- **Volum**: 4.600.000 partides llegides en flux, de les quals se n'han retingut
  **852.248 costats de jugador** amb rellotge anotat jugada a jugada als sis
  ritmes de l'app (30s, 1+0, 3+2, 5+0, 10+0 i 15+10) i dos de referència
  (2+1 i 3+0).
- **Què se n'ha mesurat, per costat**: jugades fetes, temps consumit, rellotge
  final, motiu del final de la partida i el rellotge després de cada jugada.
- **Precisió**: la marca `[%clk]` del bolcat va al segon. Per a mitjanes sobre
  desenes de milers de partides no és cap problema; sí que fa que el temps de
  la **primera** jugada als ritmes ràpids surti subestimat.

**Avís d'escales**: les franges són d'ELO de **Lichess**, que no és l'escala
ROC/ELO d'El Tauler ni l'ELO FIDE. La franja més fluixa mesurable (mitjana ~870)
és el comportament més fluix que existeix a les dades: Lichess amb prou feines
té partides per sota de ~600. Per això el model **no extrapola** per sota
d'aquesta franja; s'hi queda.

## 2. Quantes jugades es fan en el temps marcat

Jugades per bàndol i partida: mitjana ± desviació típica (± marge d'error al 95%
de la mitjana).

| ELO | 30s | 1+0 | 3+2 | 5+0 | 10+0 | 15+10 |
|---|---|---|---|---|---|---|
| <1000 | 19,0 ± 7,8 (±0,79) | 22,2 ± 8,2 (±0,28) | 28,2 ± 15,9 (±0,41) | 28,7 ± 14,8 (±0,30) | 27,4 ± 16,6 (±0,29) | 27,1 ± 16,7 (±0,30) |
| 1000-1199 | 24,9 ± 9,8 (±0,70) | 25,3 ± 8,7 (±0,23) | 29,9 ± 15,6 (±0,30) | 31,0 ± 15,2 (±0,25) | 29,8 ± 16,5 (±0,27) | 29,1 ± 16,2 (±0,32) |
| 1200-1399 | 25,2 ± 9,8 (±0,58) | 27,9 ± 9,4 (±0,18) | 31,2 ± 15,5 (±0,23) | 33,1 ± 15,5 (±0,22) | 31,3 ± 16,4 (±0,23) | 31,2 ± 16,7 (±0,30) |
| 1400-1599 | 27,5 ± 10,1 (±0,42) | 29,7 ± 10,2 (±0,16) | 32,3 ± 15,5 (±0,20) | 34,3 ± 15,5 (±0,19) | 32,6 ± 16,6 (±0,20) | 32,4 ± 16,8 (±0,31) |
| 1600-1799 | 30,2 ± 10,5 (±0,30) | 31,7 ± 10,8 (±0,15) | 33,9 ± 15,7 (±0,20) | 36,0 ± 15,6 (±0,20) | 34,3 ± 16,4 (±0,21) | 34,0 ± 16,9 (±0,35) |
| 1800-1999 | 33,5 ± 11,2 (±0,18) | 33,6 ± 11,7 (±0,15) | 35,3 ± 16,0 (±0,22) | 37,4 ± 15,6 (±0,22) | 36,0 ± 16,7 (±0,25) | 35,9 ± 17,2 (±0,47) |
| 2000-2199 | 35,5 ± 11,8 (±0,16) | 35,0 ± 12,7 (±0,18) | 36,0 ± 15,5 (±0,27) | 38,7 ± 15,6 (±0,35) | 36,9 ± 17,1 (±0,42) | 37,5 ± 17,3 (±0,81) |
| ≥2200 | 39,1 ± 14,3 (±0,18) | 38,0 ± 14,4 (±0,20) | 38,6 ± 17,2 (±0,43) | 39,1 ± 15,7 (±0,83) | 39,1 ± 17,3 (±0,91) | 40,1 ± 17,0 (±1,57) |

Tres coses que en surten:

1. **El marge d'error de la mitjana és petit** (dècimes de jugada) però **la
   dispersió entre partides és enorme** (±8 jugades a 1+0, ±16 als ritmes
   lents). Per decidir res per partida, la desviació típica mana; el marge
   d'error només diu que la mitjana està ben mesurada.
2. **Com més fluix és el jugador, menys jugades fa dins del mateix temps.** A
   1+0 la diferència entre la franja més fluixa i la més forta és de 16 jugades
   (22,2 contra 38,0): pràcticament el doble de partida.
3. **Als ritmes de 3 minuts en amunt la xifra s'estabilitza** al voltant de
   28-40 jugades i depèn molt més del nivell que del ritme: allà el que limita
   la partida ja no és el rellotge, és el tauler.

## 3. Temps per jugada i rellotge consumit

Segons per jugada (mitjana) i percentatge del rellotge inicial que s'arriba a
gastar:

| ELO | 30s | 1+0 | 3+2 | 5+0 | 10+0 | 15+10 |
|---|---|---|---|---|---|---|
| <1000 | 1,48 s · 84% | 2,29 s · 80% | 5,61 s · 85% | 5,89 s · 55% | 8,33 s · 38% | 14,22 s · 43% |
| 1200-1399 | 1,05 s · 80% | 1,77 s · 79% | 5,26 s · 89% | 5,25 s · 57% | 7,93 s · 41% | 17,78 s · 61% |
| 1600-1799 | 0,86 s · 82% | 1,54 s · 79% | 5,16 s · 95% | 5,01 s · 59% | 7,83 s · 45% | 20,18 s · 75% |
| ≥2200 | 0,62 s · 77% | 1,25 s · 76% | 5,47 s · 112% | 5,45 s · 68% | 8,93 s · 57% | 22,97 s · 100% |

(Als ritmes amb increment el percentatge pot passar del 100%: es gasta més temps
del que hi havia al principi perquè l'increment n'hi va afegint.)

El patró és **contraintuïtiu i important**: als ritmes ràpids el jugador fluix
gasta **més** temps per jugada que el fort (2,29 s contra 1,25 s a 1+0) i acaba
fent la meitat de jugades; als ritmes lents, en canvi, **infrautilitza** el
rellotge (només el 38% a 10+0, contra el 57% del jugador fort). No és el mateix
error: al bullet es queda sense temps, al ràpid es deixa temps sense fer servir.

## 4. Perdre per temps és el desenllaç normal del bullet

Percentatge de **partides acabades per temps** (qualsevol dels dos bàndols) i,
entre parèntesis, percentatge de **costats que perden per temps** (± marge
d'error al 95%):

| ELO | 30s | 1+0 | 3+2 | 5+0 | 10+0 | 15+10 |
|---|---|---|---|---|---|---|
| <1000 | **75,9%** (62,0 ±4,9) | **74,3%** (39,5 ±1,7) | 23,9% (12,2 ±0,8) | 24,9% (12,5 ±0,7) | 13,0% (6,5 ±0,4) | 9,5% (4,8 ±0,4) |
| 1200-1399 | 66,4% (46,2 ±3,0) | 66,9% (33,5 ±0,9) | 19,9% (10,0 ±0,4) | 21,1% (10,3 ±0,4) | 10,9% (5,4 ±0,3) | 8,2% (4,0 ±0,4) |
| 1600-1799 | 70,3% (43,8 ±1,4) | 60,5% (29,8 ±0,6) | 20,8% (10,4 ±0,4) | 21,4% (10,3 ±0,4) | 10,6% (5,1 ±0,3) | – |
| ≥2200 | 55,1% (20,4 ±0,5) | 45,0% (20,8 ±0,6) | 22,4% (10,4 ±0,8) | 23,3% (10,2 ±1,6) | 13,2% (5,7 ±1,2) | – |

**Tres de cada quatre partides d'un minut entre jugadors principiants s'acaben
amb una bandera.** No és una anècdota ni un accident: és com s'acaba el bullet.
Fins i tot entre jugadors de més de 2200, gairebé la meitat de les partides de
1+0 es decideixen pel rellotge.

I quan cau, cau aviat: a 1+0 i franja més fluixa, la bandera arriba a la jugada
14 (percentil 10), 23 (mediana) i 32 (percentil 90) — és a dir, **dins del rang
de durada d'una partida normal** (22,2 jugades de mitjana).

> La franja <1000 de 30s té una mostra petita (374 costats) i, a més, només el
> 17% hi juga contra un rival de força semblant: al hyperbullet gairebé no hi ha
> jugadors principiants. És la cel·la menys fiable de tot l'estudi.

## 5. La forma del consum sempre és la mateixa

Temps dedicat a cada jugada, dividit pel temps mitjà per jugada d'aquell perfil,
en funció de la jugada dividida per la jugada del pic:

| k / k<sub>pic</sub> | 0,15 | 0,25 | 0,40 | 0,60 | 0,80 | 1,00 | 1,25 | 1,60 | 2,00 | 2,60 |
|---|---|---|---|---|---|---|---|---|---|---|
| temps relatiu | 0,43 | 0,59 | 0,84 | 1,17 | 1,38 | **1,47** | 1,38 | 1,09 | 0,78 | 0,52 |

Les **48 corbes mesurades** (6 ritmes × 8 franges d'ELO) col·lapsen en aquesta
quan es reescalen així. I el pic cau sempre al mateix lloc:

> **k<sub>pic</sub> ≈ 0,57 × (jugades esperades de la partida)**

Es comença ràpid (obertura coneguda), es puja fins a un pic d'una vegada i mitja
el ritme mitjà cap a la meitat llarga de la partida, i s'abaixa després. Un
jugador fluix arriba al pic a la jugada 12-13; un de fort, a la 20-22.

## 6. Es juga pitjor com més ràpid és el ritme

Amb les partides que porten avaluació del motor (255.887 partides amb `[%eval]`),
pèrdua mitjana per jugada en centpeons i percentatge de jugades amb pèrdua
≥ 200 cp:

| ELO | 30s | 1+0 | 3+2 | 5+0 | 10+0 | 15+10 |
|---|---|---|---|---|---|---|
| 1200-1399 | 87,2 · 12,9% | 71,8 · 9,8% | 62,2 · 8,4% | 64,5 · 8,8% | 64,5 · 8,9% | 56,9 · 7,8% |
| 1600-1799 | 77,5 · 10,9% | 65,8 · 8,7% | 54,0 · 6,9% | 55,1 · 7,1% | 54,2 · 7,0% | 46,4 · 5,7% |
| ≥2200 | 65,9 · 8,8% | 53,5 · 6,7% | 37,1 · 4,1% | 39,1 · 4,4% | 34,4 · 3,7% | 30,7 · 3,3% |

A igualtat de franja, al hyperbullet es cometen un 65% més d'errades greus que a
15+10. **Avís**: els ELO de Lichess són d'una piscina diferent per a cada ritme,
de manera que un 1300 de bullet i un 1300 de ràpid no són igual de forts; la
comparació mostra l'ordre, no la magnitud exacta.

Val la pena registrar una **troballa negativa**, perquè evita un error de
disseny temptador: mirat per temps dedicat a la jugada, *més temps* correlaciona
amb *pitjor jugada* (a 1+0 i franja 1200-1399: 52 cp amb menys de 0,5 s; 130 cp
amb 8-16 s). No és que pensar faci mal: és que s'hi pensa justament a les
posicions difícils. Aquesta correlació **no** es pot fer servir per modelar la
qualitat de joc en funció del temps.

## 7. Què feia l'algorisme anterior

El model antic repartia el rellotge com `temps_restant / horitzó`, amb un
horitzó fix per ritme i fase (a 1+0: 34 jugades a l'obertura, 24 al mig joc, 15
al final), una reserva d'emergència i un sostre per jugada. Tres problemes:

1. **L'horitzó no depenia del nivell.** Les dades diuen que a 1+0 les jugades
   esperades van de 22 a 38 segons el nivell; el model en feia servir una de
   sola per a tothom.
2. **El repartiment era pla**, sense el pic de la secció 5.
3. **El motor no podia perdre per temps.** La combinació de reserva, mode
   d'emergència i el retall final `τ ≤ temps_restant/2` feia que el rellotge
   decaigués geomètricament i no arribés mai a zero. Al ritme on **tres de cada
   quatre partides es decideixen per bandera**, el rival tenia aquest desenllaç
   desactivat per construcció.

El tercer punt és el que fa que jugar a un minut sigui tan ingrat: la via de
victòria més freqüent del bullet real —guanyar per temps— estava tancada, i
només quedava guanyar a la fusta contra un motor.

## 8. El model nou

Tot viu a `core.js` i es prova a `tests/humantime.test.js`.

- **`HUMAN_CLOCK_STATS`**: per a cada ritme, quatre àncores d'ELO amb les
  jugades esperades, la seva desviació, el temps mitjà per jugada i la taxa de
  bandera **mesurats**. S'hi interpola per ELO i no s'extrapola per sota de la
  franja més fluixa mesurada.
- **`HUMAN_PACE_SHAPE`** i `humanPlannedSpendMs`: la corba universal de la
  secció 5, normalitzada perquè la suma d'una partida sencera doni exactament el
  consum mesurat.
- **Dues maneres de decidir el temps, barrejades per `clockAwareness`**: a
  cegues (el ritme del seu nivell, sense mirar el rellotge) i mirant el
  rellotge (la mateixa corba com a fracció del que li queda). Un principiant
  mira poc el rellotge (0,35) i un jugador fort molt (0,75). La part «a cegues»
  és la que permet que una partida que s'allarga acabi en bandera.
- **`rollClockTemperament`**: multiplicador de ritme tirat **una vegada per
  partida**. Hi ha partides que el rival juga còmode i partides que se li crema
  el rellotge. Té **mitjana 1 exacta** (la log-normal es normalitza pel biaix
  que hi introdueixen els talls a 0,4 i 3,2), de manera que la seva dispersió
  —`paceSigma`, que és amb què es calibra el risc de bandera— decideix QUINES
  partides es cremen el rellotge sense tocar els segons per jugada.
- **Pensada llarga**: amb una probabilitat petita per jugada, el rival s'encalla
  i hi deixa un tros gran del rellotge. És el mecanisme que fa caure banderes
  als ritmes amb increment, on cap ritme mitjà no esgotaria mai el temps. Té
  **sostre propi de cada ritme** (`HUMAN_DEEP_THINK_CEILING_MS`: de 5 s a 30s
  fins a 100 s a 15+10) i s'hi arriba de manera **asimptòtica**, de manera que
  cap dues pensades llargues no duren igual. I com que `spendMs` ja les porta a
  dins, el ritme de creuer les descompta amb el que costen DE DEBÒ en aquell
  ritme un cop el sostre les ha retallades (`HUMAN_DEEP_THINK_EFFECTIVE`),
  perquè no es comptin dues vegades: vegeu la secció 11.
- **Sòl físic per jugada**: un terç llarg del ritme mitjà d'aquell nivell (amb
  sostre d'un segon). Quan al rellotge ja no li queda ni per al sòl, **el motor
  cau de bandera**, com hi cau una persona.

Dels paràmetres del model, **només dos no estan mesurats sinó ajustats**
(`paceSigma` i `deepThinkRate`), i s'han calibrat contra el **risc de bandera
mesurat**: la probabilitat de caure a la jugada k havent arribat viu a la k-1,
acumulada sobre les 40 primeres jugades. És una magnitud condicional, i per tant
no la contamina el fet que moltes partides s'acabin abans a la fusta.

## 9. Verificació

Simulant amb el codi real de `core.js`, el risc de bandera acumulat queda dins
d'un punt o dos del mesurat a **23 de les 24 cel·les** (ritme × franja):

| ritme | ELO | risc simulat | risc mesurat |
|---|---|---|---|
| 1+0 | 880 | 127% | 127% |
| 1+0 | 1310 | 73% | 74% |
| 1+0 | 1700 | 44% | 43% |
| 1+0 | 2400 | 14% | 14% |
| 3+2 | 890 | 21% | 22% |
| 10+0 | 850 | 9,0% | 9,2% |
| 15+10 | 830 | 7,5% | 7,0% |

I la corba de rellotge que queda després de cada jugada segueix la mesurada. Per
exemple a 1+0, franja més fluixa (percentatge del rellotge inicial):

| jugada | 5 | 10 | 15 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|
| mesurat | 89 | 68 | 46 | 29 | 20 | 16 |
| model | 89 | 68 | 45 | 27 | 17 | 13 |

L'única cel·la que no encaixa és **30s a la franja <1000**, on el model cau de
bandera abans que les persones (risc 180% contra 117%): és, justament, la
cel·la amb 374 costats de mostra i rivals descompensats.

> Les xifres d'aquesta secció són les del model **abans** de la revisió de la
> secció 11, que va corregir el descompte de les pensades llargues. Allà hi ha
> el «abans i després» del risc de bandera i dels segons per jugada, mesurats
> tots dos amb el mateix simulador.

### Una comprovació que no s'ha ajustat a res

El risc de bandera és el que s'ha calibrat, de manera que veure'l encaixar no
demostra gran cosa. Aquesta segona comprovació sí que és una **predicció**: es
sortegen partides d'una durada treta d'una distribució els dos paràmetres de la
qual s'ajusten NOMÉS a dues xifres de durada (jugades de mitjana de totes les
partides i jugades de mitjana de les que s'acaben a la fusta), que no diuen res
de banderes. La taxa de bandera surt tota sola del model del rellotge:

| ritme | ELO | bandera predita | bandera mesurada |
|---|---|---|---|
| 1+0 | 880 | 28,9% | 39,5% |
| 1+0 | 1310 | 28,9% | 33,5% |
| 1+0 | 1700 | 28,8% | 29,8% |
| 30s | 1710 | 43,9% | 43,8% |
| 3+2 | 890 | 9,5% | 12,2% |
| 5+0 | 870 | 10,2% | 12,5% |
| 10+0 | 850 | 3,8% | 6,5% |
| 15+10 | 830 | 3,1% | 4,8% |

El model es queda una mica curt a les franges més fluixes (prediu ~29% de
banderes a 1+0 on la realitat n'és el 39,5%), és a dir, **erra cap al costat
prudent**: el rival cau de bandera una mica menys sovint que una persona del seu
nivell, no més.

Aquestes comprovacions no són d'un sol dia: viuen com a proves a
`tests/humantime.test.js` i tornen a executar-se a cada canvi.

## 10. Dues errades trobades conduint l'app

### 10.1. El temps de l'anàlisi es cobrava dues vegades

Conduint l'app real per verificar el model va sortir una cosa que no tenia res a
veure amb el model però que hi pesava molt: `makeEngineMove()` reiniciava sempre
la marca de temps del «pensament» del rival. Com que el rellotge del rival
comença a córrer en el moment que l'usuari mou, i entre aquell instant i la
cerca del motor l'app hi analitza la jugada de l'usuari (~1 s), aquell segon
**es cobrava al rellotge del rival sense comptar dins del seu temps de
reflexió**: cada jugada el motor gastava el que havia decidit MÉS el que havia
trigat l'anàlisi. A un minut, això són desenes de segons.

Ara la marca només es posa si l'usuari no acaba de moure. Mesurat a l'app real
amb `DEBUG_ENGINE_TIMING`, el temps de rellotge per jugada torna a ser el que
diu el model.

Queda una limitació coneguda: l'anàlisi de la jugada de l'usuari continua
corrent al rellotge del rival. Mentre l'objectiu de reflexió sigui més gran que
l'anàlisi no es nota (el temps ja hi és inclòs), però quan el rival va molt just
de temps no pot moure més ràpid del que triga l'anàlisi, i cau de bandera una
mica abans del que diu el model. En un dispositiu ràpid l'efecte és petit.

### 10.2. La cerca no mirava el rellotge (i pitjor com més alt el ROC)

El model decideix quant s'hi pensa, però qui gasta el rellotge de debò és la
**cerca** de Stockfish: mentre cerca, el rellotge del rival corre. I la cerca era
l'únic tros de la resposta que no mirava el rellotge —`makeEngineMove()` enviava
`go depth D` sense cap límit de temps—, de manera que el sostre real el posava el
binari, no el model.

Com que la profunditat creix amb el nivell (`eloToSearchDepth`: 12 a 16 per sobre
del terra del motor) i les jugades del rival es cerquen amb MultiPV, el cost puja
molt de pressa amb el ROC. Mesurat amb el binari inclòs (Chromium, tres posicions
d'obertura i migjoc, MultiPV 5):

| nivell | profunditat | temps de cerca |
|---|---|---|
| ROC 800 | 8 | 0,12-0,13 s |
| ROC 1400 | 12 | 1,5-2,4 s |
| ROC 1700 | 13 | 3,4-4,4 s |
| ROC 2000 | 15 | 7,9-13,5 s |
| ROC 2000 | 16 | 10,3-20,8 s |

A 1+0 el model vol gastar 1,2 s per jugada a ROC 2000. Conduint l'app real (1+0,
ROC 2000, jugant a l'instant) el rival gastava **7,2 s, 15,0 s, 26,3 s** i queia
de bandera a la **quarta** jugada, sense haver jugat malament ni una sola vegada:
el rellotge se n'anava a la cerca. És exactament el que es veia jugant —com més
roc, més s'entrabancava el rival amb el rellotge— i per això no passava als
nivells baixos, on la cerca val una dècima de segon.

Ara la cerca porta sostre de temps real (`go depth D movetime B`), amb `B` calculat
a `engineSearchBudgetMs` (core.js) a partir del MATEIX model: el temps que
dedicaria a la jugada més difícil d'aquesta posició de rellotge, menys el que ja
s'ha consumit des que l'usuari ha mogut, i mai més enllà de la bandera. Així el
sostre no mossega quan el model vol pensar-hi (als ritmes lents no canvia res) i
només retalla la cerca que gastaria més del que el nivell es pot permetre. Sense
rellotge no hi ha sostre: la cerca es deixa completar com sempre.

La mateixa partida, després: **2,1 s de mitjana** per jugada (1,0-2,2 s de rutina
i una pensada llarga de 6,0 s), dotze jugades i 34,5 s encara al rellotge. A 10+0
i ROC 2000, on el sostre no arriba a mossegar, el rival segueix gastant 3-6 s per
jugada amb pensades llargues de 15 s, com abans.

### 10.3. Les jugades més ràpides que el tic sortien gratis (i la premove, sempre)

La tercera errada era del rellotge de l'USUARI, no del model del rival, i va
sortir per un símptoma invers al de la 10.2: al bullet, un jugador que
encadenés jugades instantànies i premoves **guanyava contínuament per temps**,
perquè el seu rellotge amb prou feines es movia.

La causa era de comptabilitat pura. El rellotge només cobrava el bàndol actiu
als **tics periòdics** (cada 200 ms; 50 ms sota els 10 s), i la jugada que
acabava el torn es limitava a reiniciar la marca de temps (`lastTs`) sense
cobrar el tram corregut des de l'últim tic. Conseqüències, de menor a major:

1. **Tota jugada perdonava fins a un tic sencer** (~100 ms de mitjana). Això
   afectava els dos bàndols per igual i quedava dissimulat.
2. **Una jugada més ràpida que el tic no pagava RES**: si el torn sencer cabia
   entre dos tics, cap tic no hi queia a dins i el reinici de la marca
   s'empassava tot el temps. Un jugador ràpid al bullet (150-250 ms per
   jugada) jugava la partida quasi sencera amb el rellotge aturat, mentre el
   rival pagava religiosament les seves reflexions d'1-2 s.
3. **La premove era el cas extrem**: s'executa sola en 0-4 ms de màquina, així
   que mai no coincidia amb cap tic i sortia exactament gratis, jugada rere
   jugada.

No hi havia cap compensació de latència que «regalés» temps (el joc és local i
no en cal cap), ni cap resta negativa: el temps no s'AFEGIA, simplement no es
cobrava. El resultat pràctic era el mateix: la bandera pròpia no podia caure
mai jugant ràpid, i totes les partides llargues s'acabaven amb la bandera del
rival.

L'arranjament, tot a `app.js` amb l'aritmètica a `core.js`
(`clockTickDeltaMs`, `clockMoveSpendMs`) i provat a `tests/clock.test.js`:

- **La jugada que acaba el torn paga el residu** des de l'últim tic abans de
  passar el torn: cap tram no queda mai sense cobrar, ni amb el fil principal
  entrebancat (el tram es cobra igualment quan arriba la jugada).
- **La premove paga un mínim fix de 0,1 s** (el conveni dels servidors
  ràpids): mai no és gratis, i una ràfega de premoves amb el rellotge al
  límit també pot acabar en bandera pròpia.
- **Cronòmetre monotònic** (`performance.now` en lloc de `Date.now`): un
  ajust NTP o un canvi d'hora no pot generar deltes negatius. I encara que un
  delta arribés negatiu, el nucli el retalla a zero: **restar un delta
  negatiu sumaria temps**, i en un ritme sense increment el rellotge no pot
  pujar per cap camí que no sigui l'increment mateix.
- **Sostre estricte de compensació**: si mai s'aplica una compensació de
  latència (joc en línia), queda topada per jugada (200 ms) i pel temps
  realment transcorregut, de manera que no pot fer el cost negatiu.
- **La bandera mana sobre l'increment**: si pagar la jugada esgota el
  rellotge, l'increment ja no es cobra.

Amb el mateix guió d'abans (premoves de ~2 ms contra un rival que pensa
1,15 s), el jugador passa de pagar **0 ms per tota la partida** a pagar
0,1 s per premove i el temps real de la resta de jugades: el desenllaç per
temps torna a ser possible per als DOS bàndols, que és el que diuen les dades
de la secció 4.

## 11. El rival s'anava espaiant a mitja partida

Jugant, l'obertura anava bé i cap a la meitat de la partida el rival començava a
allargar-se: jugades cada vegada més separades i, de tant en tant, una pausa
llarguíssima. No era una impressió. Són dos defectes que se sumaven, i tots dos
cauen justament sobre el **pic** de la corba de la secció 5 —el punt de la
partida on el model ja preveu la jugada més lenta—, que és per això que no es
notava a l'obertura.

### 11.1. El descompte de les pensades llargues estava topat justament on cal

`spendMs` és el temps mitjà per jugada **mesurat**, i inclou les pensades
llargues. El ritme de creuer, doncs, ha de ser més baix: `cruiseMs = spendMs /
guany`, on el guany és el que les pensades llargues inflen la mitjana. Amb el
guany massa baix, el motor gasta creuer complet **i** pensades llargues a sobre.

El guany estava calculat com `1 + freqüència × 3,6` però **topat a 1,30**. I el
topall no mossegava mai on no calia: a 1+0, on la freqüència mesurada de
pensades llargues és del 3,6%, el guany real ja era 1,13 i el topall no hi
arribava. Mossegava a **10+0 i 15+10**, on la freqüència puja al 23% i al 35% i
on —això és el que ho fa pitjor— el rellotge **no** retalla les pensades, perquè
en aquests ritmes amb prou feines es gasta el 40% del temps. Resultat, mesurat
simulant el codi real al llarg de partides senceres:

| ritme | segons/jugada del model ÷ mesurat (abans) | (ara) |
|---|---|---|
| 30s | 0,92–1,05 | 0,92–0,98 |
| 1+0 | 0,93–0,98 | 0,95–0,97 |
| 3+2 | 0,99–1,08 | 0,86–0,98 |
| 5+0 | 0,96–1,10 | 0,89–1,02 |
| **10+0** | **1,10–1,37** | 0,87–1,06 |
| **15+10** | **1,01–1,59** | 0,81–1,10 |

A 15+10 i franja fluixa el rival gastava **23,4 s per jugada quan la persona que
imitava en gasta 14,7**. Un 59% de més, a cada jugada de cada partida.

La correcció és descomptar el que una pensada llarga costa **de debò** en aquell
ritme un cop tots els sostres l'han retallada (`HUMAN_DEEP_THINK_EFFECTIVE`: de
2,78 a 1+0 fins a 3,72 a 10+0, contra el 4,6 nominal de la distribució i contra
l'1,30 del topall). No és una xifra de gust: es deriva simulant el model mateix,
i el test «humantime» la torna a derivar a cada execució, de manera que no pot
quedar desfasada si algú toca els sostres o la corba.

**Per què no ho havia enxampat cap prova.** N'hi havia dues que miren el
consum, però totes dues miren el **rellotge que queda** amb una tolerància de 12
punts, i cap no mirava els **segons per jugada**. Un error del 59% repartit al
llarg d'una partida de 15 minuts no arriba a moure 12 punts de rellotge fins molt
tard. Ara hi ha una prova per ritme que compara directament amb `spendMs`.

### 11.2. Una sola jugada podia parar la partida dos minuts

La pensada llarga s'aplica **després** del sostre escènic del ritme
(`profile.maxMs`) i el multiplica per fins a 7, de manera que aquell sostre no la
tocava mai: l'únic que la limitava era un valor fix de **dos minuts, igual per a
tots els ritmes**. Dos minuts és una jugada llarga però normal a 15+10, on el
jugador també té un quart d'hora. A 3+2 són **dos terços del rellotge sencer**.

Ara cada ritme té el seu sostre, i s'hi arriba de manera **asimptòtica** en lloc
de topar-hi: amb un sostre dur, totes les pensades que el superaven duraven
exactament el mateix i el rival repetia la mateixa pausa màxima una jugada sí i
l'altra també, cosa que no fa cap persona.

Pausa més llarga observada simulant 3.000 partides per ritme (el sostre de dos
minuts només s'arribava a tocar on hi ha rellotge per pagar-lo: als ritmes
ràpids el retallava abans el temps que quedava):

| ritme | pausa màxima (abans) | (ara) | jugades de més de 20 s |
|---|---|---|---|
| 30s | 14,9 s | 5,0 s | — |
| 1+0 | 32,9 s | 8,0 s | 0,0% (era 0,0%) |
| 3+2 | 80,7 s | 24,9 s | 2,0% (era 3,5%) |
| 5+0 | 88,9 s | 29,9 s | 3,0% (era 4,0%) |
| 10+0 | 120,0 s | 58,7 s | 7,5% (era 11,7%) |
| 15+10 | 120,0 s | 97,2 s | 23,4% (era 28,8%) |

Els sostres no són arbitraris: cada un és **el més curt que encara reprodueix el
risc de bandera** d'aquell ritme. Per sota, el rival deixa de poder perdre per
temps —i als ritmes lents la pensada llarga n'és l'únic mecanisme possible: cap
ritme mitjà no crema mai un rellotge de deu o quinze minuts—. Guanyar per temps
és una via de victòria que el jugador ha de tenir oberta, i ara hi ha una prova
per ritme que ho comprova (era fàcil tancar-la sense adonar-se'n, perquè als
ritmes lents passa poc).

### 11.3. On surten ara les banderes dels ritmes lents

Corregir 11.1 té una conseqüència que val la pena dir clarament: **el model
antic comprava el risc de bandera dels ritmes lents amb el mateix error de
pacing**. Gastant un 37% de més a 10+0 i un 59% a 15+10, el rellotge s'acabava.
Amb els segons per jugada correctes ja no s'acaba, i posar-hi el sostre de dos
minuts un altre cop tampoc no ho arregla (recupera només el 21% del risc a 10+0
i el 18% a 15+10): el forat no era el sostre, era el creuer.

La bandera havia de venir, doncs, del mecanisme que la provoca a les partides de
debò: **no una pensada monstruosa, sinó una partida sencera jugada a poc a poc**.
Això és `paceSigma`, el tarannà de la partida —i és, precisament, el paràmetre
que la secció 8 ja documentava com a ajustat contra el risc de bandera—. Fins ara
valia 0,42 a totes les files; ara és per ritme:

| ritme | 30s | 1+0 | 3+2 | 5+0 | 10+0 | 15+10 |
|---|---|---|---|---|---|---|
| paceSigma | 0,42 | 0,42 | 0,70 | 0,55 | 0,70 | 0,85 |

Que creixi amb la lentitud del ritme té sentit de mecanisme: a 30s i 1+0 el
rellotge s'esgota tot sol amb el ritme mitjà i no cal cap dispersió per fer caure
banderes; a 10+0 i 15+10 el ritme mitjà no l'esgotaria mai, i les banderes només
poden sortir de les partides que se'n surten.

Perquè aquesta dispersió es pogués moure sense arrossegar els segons per jugada
hi va caldre un arranjament previ: el tarannà es retalla a [0,4 · 3,2] i **el
retall li menjava la mitjana** (una log-normal amb mu = −σ²/2 té mitjana 1, però
retallada ja no), tant més com més ampla la dispersió. Ara es normalitza pel
biaix exacte del retall, de manera que la mitjana és 1 per construcció: pujar la
dispersió canvia **quines** partides es cremen el rellotge, no **quant** es gasta
de mitjana. Són dues coses que s'han de poder calibrar per separat.

Risc de bandera acumulat sobre les 40 primeres jugades (mateix simulador per a
les tres columnes, de manera que són comparables entre elles):

| ritme | ELO | model antic | model nou | mesurat |
|---|---|---|---|---|
| 1+0 | 880 | 103% | **118%** | 127% |
| 1+0 | 1310 | 47% | **58%** | 74% |
| 1+0 | 1700 | 30% | **32%** | 43% |
| 1+0 | 2400 | 11,0% | 6,9% | 14% |
| 3+2 | 890 | 20,9% | 19,2% | 22% |
| 10+0 | 850 | 9,5% | 7,2% | 9,2% |
| 15+10 | 830 | 7,3% | 4,8% | 7,0% |

A 1+0 el model nou s'acosta més a les dades que l'antic; als ritmes lents es
queda una mica curt, sempre pel costat prudent (el rival cau de bandera una mica
menys sovint que una persona del seu nivell, no més). I la corba de rellotge que
queda continua seguint la mesurada:

| 1+0, ELO 880 | j5 | j10 | j15 | j20 | j25 |
|---|---|---|---|---|---|
| mesurat | 89 | 68 | 46 | 29 | 20 |
| model | 89 | 69 | 46 | 30 | 19 |

### 11.4. El ritme de la partida arriba també a les pensades llargues

Queda el cas que trenca una partida encara que totes les mitjanes quadrin: el
jugador encadenant jugades de dos segons i el rival plantant-se, sense cap motiu
visible, a pensar-ne quaranta. La sincronització amb el ritme del jugador ja hi
era, però només tocava el temps de creuer.

Ara toca també la **freqüència** de les pensades llargues, amb el mateix marge
(±20-25%) i la mateixa idea: davant d'algú que va a la seva, un s'hi acaba
adaptant. Amb la partida anant de pressa les pensades llargues s'espaien; amb el
jugador rumiant-s'hi, el rival se sent més lliure de fer-ne. Mesurat a 10+0 amb
un jugador que mou cada 2 s: el rival passa de 8,0 s a 6,5 s de mitjana i les
jugades de més de 15 s baixen del 14,6% al 10,9%.

### 11.5. Comprovat conduint l'app

Les xifres d'aquesta secció surten de simular el codi real de `core.js` al llarg
de centenars de partides, que és l'única manera de veure una diferència
distribucional. Conduint l'app de debò (Chromium, 10+0, ROC 1500) el que es
comprova és que el model hi arriba sencer: en una partida de 25 jugades, el
rellotge que perd el rival a cada jugada coincideix amb l'espera real fins a
tres dècimes —les de la cerca i l'anàlisi—, de manera que la correcció de la
secció 10.1 continua dempeus i el rellotge no cobra res dues vegades. Les
jugades de rutina van de 1,3 s a 6 s, i les quatre pensades llargues de la
partida van costar 16,9 s, 34,5 s, 30,4 s i 29,7 s: totes per sota del sostre de
60 s del ritme, quan abans qualsevol d'elles hauria pogut arribar als dos
minuts.
