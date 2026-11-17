# Lliga de llegendes TV

La TV (abans «Stockfish vs Lozza TV») és ara una **lliga de dues voltes entre 10 jugadors
històrics**. Cada dispositiu genera les seves partides; Stockfish n'analitza i en
comenta les jugades. Codi: `llegendes.js` (perfils, calendari, classificació, textos),
`stockfishtv.js` (partida, motors, interfície) i el panell `#sftv-legends` d'`index.html`.

## Els 10 jugadors i el seu motor

La tria és **editorial** (campions que van definir com s'entén el joc; Tal, Petrosian o
Philidor en queden fora). Per canviar-ne un, n'hi ha prou amb editar `LEGENDS` a `llegendes.js`.

| Jugador | Estil (perfil) | Motor |
|---|---|---|
| Morphy | joc obert, desenvolupament ràpid i atac directe | Lozza |
| Steinitz | acumula petits avantatges i construeix la posició | Stockfish |
| Lasker | lluita pràctica, defensa tenaç | Lozza |
| Capablanca | claredat, simplificació i tècnica de final | Stockfish |
| Alekhine | atacs combinatoris i complicacions profundes | Lozza |
| Botvinnik | preparació sistemàtica i joc estratègic | Stockfish |
| Fischer | precisió, obertures preparades, joc directe | Stockfish |
| Karpov | estrangulament posicional, prevenció del contrajoc | Stockfish |
| Kasparov | iniciativa, dinamisme, preparació | Lozza |
| Carlsen | joc universal, exprimeix els finals | Stockfish |

**Per què aquest motor.** Stockfish admet un perfil d'estil: entre les `STYLE_MULTIPV`
millors jugades que valoren a `STYLE_WINDOW_CP` o menys de la que triaria al seu nivell,
tria la que encaixa amb els `weights` del jugador (trets de `tvMoveFeatures`). Això
serveix per als estils que són una manera de triar entre jugades bones (posicionals,
tècnics, universals). Lozza, amb la cerca curta que fixa la TV (profunditat limitada), juga
d'instint tàctic: és l'estil propi del motor i no se li aplica cap pes, i s'ha assignat als
jugadors d'atac i combinació. **És una decisió de disseny, no una mesura**: no s'ha
comprovat que Lozza jugui «més d'atac» que Stockfish.

**Nivell.** Tots juguen igual de fort (`CONFIG.POWER = 0.62`): amb Stockfish, ≈2500 d'Elo
del motor (UCI_Elo; no és l'Elo històric del jugador); amb Lozza, profunditat 6 i 203 ms.
És la mateixa relació que `tvMatchPlan` feia servir per aparellar Stockfish i Lozza, i
**no s'ha calibrat** (vegeu «Pendent»). El que distingeix els jugadors és el motor i el perfil.

## Format de la lliga

- Dues voltes, 90 partides: cada parella es troba **dues vegades, una amb cada color**.
  18 jornades de 5 partides; tothom juga a cada jornada. Cada jugador fa 9 partides amb
  blanques i 9 amb negres.
- **Aleatori però amb lògica de lliga**: el sorteig de les parelles i l'ordre de les jornades
  és aleatori en crear la lliga; dins la jornada en curs el partit es tria a l'atzar entre
  les partides pendents. No es passa a la jornada següent fins que s'acaba l'actual.
  El partit en curs es recorda (reobrir la TV no el canvia); «Nova partida» l'abandona
  (no compta) i en tria un altre de la mateixa jornada.
- **Classificació**: victòria 1, taules ½. Desempat: enfrontament directe, victòries i
  ordre alfabètic.
- **Fi de lliga**: quan les 90 partides estan jugades, s'anuncia el campió, es desa a
  l'historial (les 12 últimes lligues) i en comença una de nova. La classificació final es
  veu durant el resultat de l'última partida i la presentació de la partida següent diu qui
  va guanyar la lliga anterior.
- Només compten les partides **íntegrament automàtiques i acabades** (com abans): amb
  control manual, la partida no entra a la classificació.
- Estat desat a `localStorage` a la clau `tauler_tv_legends_v1` (sense prefix
  `chess_`/`eltauler_`: la sincronització al núvol no la recull). Un estat corrupte o amb
  un calendari incoherent comença una lliga nova (sense perdre l'historial vàlid).

## Els noms als comentaris i els diàlegs

- **Presentació** (`LG.introDialogue`): diàleg. L'Èlia diu la lliga, la jornada, els noms i
  els colors i pregunta; en Grau respon amb un detall que va canviant (estils, classificació
  dels dos amb què hi ha en joc, motors, o el campió de la lliga anterior).
- **Capa de noms** (`tvNameSides`, `tvNameComment` a `stockfishtv.js`): els comentaris que
  diuen «les blanques / les negres» passen a dir el jugador **sense tocar la concordança**:
  «per a les negres» → «per a Kasparov», «la dama blanca» → «la dama de Capablanca»,
  «Les blanques avancen» → «Les blanques de Capablanca avancen», «Mou Capablanca: …» o
  «Torn de Capablanca: …». No toca «amb les blanques» ni les peces que n'identifiquen una
  altra («el cavall de la dama blanca», «el peó negre de torre»). Dosi: en un diàleg, cada
  jugador com a molt un cop; en els comentaris d'una veu, cada bàndol una jugada sí i una no.
  El text intern verificat (`text`) no canvia; només el que es mostra i es diu.
- **Preguntes de l'Èlia amb noms**: «Què hi busca Fischer?», «Què ha de vigilar ara
  Karpov?», «Com ho concretaria Lasker?», «Grau, Alekhine fa el que anunciaves?»…, en
  alternança amb les generals. Les respostes d'en Grau ja no comencen sempre per «En aquesta
  línia»: hi ha diverses introduccions (sense repetir dos punts seguits).
- **Observacions dels jugadors** (`LG.remark` + `tvLegendStep`), sempre en diàleg i com a
  molt 7 per partida, a partir de la semijugada 10 i amb 10 semijugades de distància:
  1. el motor i el perfil del jugador que mou;
  2. **què hi ha en joc**: lloc i punts dels dos i què passaria si en guanya un (calculat
     amb la classificació real i el desempat, `LG.stakes`);
  3. si l'anàlisi fiable dona un **avantatge decisiu** a un bàndol, on el portaria guanyar;
  4. un **tret històric** només quan la jugada el compleix (escac, canvi, enroc…, amb chess.js).
  Ocupen un silenci o s'afegeixen a un comentari descriptiu d'una sola veu (l'Èlia el diu
  primer); mai substitueixen un avís tàctic, un diàleg ni una màxima. Cap text no diu caselles.
- **Narració de l'obertura** (`tvintro.js`): el pla s'atribueix al jugador pel seu nom.
- **Tancament** (`LG.resultDialogue`): en acabar, l'Èlia diu el resultat i en Grau la
  classificació. El primer lloc compartit es diu així («comparteixen el primer lloc»), no
  com a liderat, i abans de la primera partida no es diu cap lloc (l'ordre seria alfabètic).

## Pronúncia dels noms

La veu (Matxa i la del dispositiu) llegeix els noms amb una grafia adaptada al català, només a
la locució (`LG.speakNames`, aplicat a `tvSpeechText`): Mòrfi, Stàinits, Làsker, Aliókin,
Botvínnik, Fíxer, Kàrpov, Kaspàrov (Capablanca i Carlsen ja es llegeixen bé). A pantalla
sempre surt el nom original. Si algun nom sona malament, es corregeix al camp `spoken`.

## Visualització

- El comentari va **just després del tauler** (també al mòbil); després els controls i la
  classificació. Cada torn del diàleg porta l'etiqueta de qui parla (ÈLIA / GRAU).
- Barra del partit sobre el tauler (`#sftv-matchbar`): lliga, jornada i partit de la jornada.
  Les fitxes dels jugadors diuen el lloc i els punts a la lliga abans del motor.
- Ordinador: capçalera compacta, controls de veu en una fila, el tauler i les dues fitxes
  caben a la pantalla (`calc(100vh - 330px)`) i la columna lateral queda fixa i desplaçable.

## Com s'acaben les partides (perquè no s'encallin)

Amb els motors reals, dues partides de prova de cada sis s'arrossegaven: una amb un
avantatge decisiu des de la semijugada 50 que no s'acabava fins a la 129 (el mínim per
abandonar), una altra amb 41 semijugades seguides sense captures ni peons. Ara (paràmetres a
`TV_CONFIG`, només a la lliga):

- **Fase d'atac** (`LATE_ATTACK`, `tvLateAttack`): s'activa per a qui mou quan hi ha
  `STALL_HALFMOVES` (8) semijugades sense captures ni peons a partir de la 50, quan una
  posició es repeteix a partir de la 30, o sempre a partir de la 80. Stockfish tria entre
  jugades fins a 90 cp pitjors que la del seu nivell (en lloc de 50) amb un perfil que
  premia avançar peons (sobretot passats), escacs, amenaces, acostar-se al rei i activar el
  rei als finals, i que castiga desfer la jugada anterior i repetir posicions; conserva la
  meitat del perfil propi. Lozza no dona alternatives (ni `MultiPV` ni `searchmoves`):
  calcula 2 nivells més profund i amb un 50 % més de temps. Un cop un jugador hi entra, s'hi
  queda fins al final de la partida. L'Èlia i en Grau ho anuncien un cop i la fitxa del
  jugador ho diu.
- **Defalliment** (`SLUMP`, `tvPlanSlump`, `tvSlumpSide`): a l'inici de cada partida es
  decideix a l'atzar si n'hi haurà (3 de cada 4 partides), quin dels dos jugadors el patirà i
  a partir de quina semijugada (entre la 30 i la 60). Des d'aquell moment, si juga amb
  Stockfish baixa 300 d'Elo (o 3 nivells de «Skill Level»); si juga amb Lozza, calcula un
  nivell menys i amb un 30 % menys de temps. L'Èlia i en Grau ho comenten un cop («Des de la
  jugada 28, Kasparov juga amb menys precisió…»), la fitxa diu «Menys precisió» i el resultat
  ho recorda. Amb la finestra inicial (40–80), a les partides de prova arribava massa tard:
  la partida ja estava decantada i qui defallia sovint guanyava igualment.
- **Abandonament** des de la semijugada 60 (`LEAGUE_RESIGN_MIN_PLY`; el duel heretat manté la 129).
- **Taules per acord** (`tvAgreedDrawStep`): a partir de la semijugada 100, si l'anàlisi fiable
  dona |valoració| ≤ 40 cp durant 20 semijugades seguides i fa 16 semijugades que no hi ha
  captures ni peons (finals morts, com els d'alfils de colors oposats).

Mesura amb els motors reals (simulador fora del repo; 6 partides per tanda, poques per
treure'n percentatges): abans, durada mitjana de 98 semijugades, dues partides fins a la 129 i
un tram de 41 sense progrés; amb la configuració final, mitjana de 76 (màxim 109), 5 de 6
decisives i el tram més llarg sense progrés de 21.

## Degradacions

- **Lozza no es carrega**: els jugadors de Lozza juguen amb Stockfish i amb els pesos del seu
  perfil; la TV avisa («Lozza no disponible…») i els textos diuen el motor real.
- **`llegendes.js` no es carrega**: la TV torna al duel heretat Stockfish contra Lozza
  (`tvMatchPlan`, mode «Fins al mat»). Aquest codi es conserva només per a aquest cas.
- Amb la lliga activa s'amaguen la barra de nivell, «Massa fàcil/difícil», «Fins al mat»,
  els perfils aleatoris i el marcador de pronòstics (cada jugador té el seu nivell i perfil).

## Proves

- `tests/llegendes.test.js`: perfils, calendari (90 partides, parelles, colors, jornades),
  classificació i desempat, fi de lliga i lliga nova, estats corruptes, textos i observacions.
- `tests/lliga-llegendes-tv.test.js`: configuració per jugador, perfil amb pesos propis,
  flux real del controlador (motors simulats), resultat a la classificació, fi de lliga,
  reobertura, «Nova partida», Lozza caigut, mode heretat, capa de noms (concordança,
  exclusions, dosi i varietat), una partida real de les fixtures amb noms i sense caselles,
  i la presentació i el tancament en diàleg.
- Interfície comprovada a Chromium amb la skill `/verify` (vista d'escriptori i mòbil), amb els
  *workers* dels motors substituïts per uns de falsos per veure el final de partida i el canvi
  de lliga (el Stockfish real és massa lent en aquest entorn).

## Pendent

- **Calibrar** Lozza (profunditat 6) contra Stockfish (≈2500) amb partides reals: si un motor
  domina, la classificació reflectirà el motor i no el perfil. Els paràmetres són
  `CONFIG.POWER` i la relació de `tvLegendSide`.
- Comprovar si els perfils de Stockfish es noten (com ja es fa amb `tvPickStyledMove` i
  `tvMoveFeatures` en partides senceres des de Node).
