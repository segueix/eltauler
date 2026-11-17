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

## Els noms als comentaris

- **Presentació** (`LG.intro`): lliga, jornada, noms i colors, i un detall que va canviant
  (estil de cada jugador, lloc a la classificació, motor de cadascú o el campió de la lliga anterior).
- **Narració de l'obertura** (`tvintro.js`, `openingTalk`): el pla s'atribueix al jugador pel
  seu nom en lloc del motor.
- **Observacions durant la partida** (`LG.remark` + `tvLegendStep`): a partir de la
  semijugada 10, amb 10 semijugades de distància i com a màxim 6 per partida. Primer el
  motor i el perfil del jugador que mou; després un tret històric **només si la jugada el
  compleix** (escac, canvi, enroc, torre activa…, comprovat amb chess.js). Només ocupen un
  silenci o una jugada de simple descripció: mai substitueixen un avís tàctic ni un diàleg.
  Cap text no diu caselles.
- **Resultat**: titular amb el nom del guanyador i una nota amb la classificació («Victòria
  d'Alekhine davant de Carlsen. Alekhine puja al lloc 2 amb 3 punts.»).

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
  reobertura, «Nova partida», Lozza caigut i mode heretat.
- Interfície comprovada a Chromium amb la skill `/verify` (vista d'escriptori i mòbil), amb els
  *workers* dels motors substituïts per uns de falsos per veure el final de partida i el canvi
  de lliga (el Stockfish real és massa lent en aquest entorn).

## Pendent

- **Calibrar** Lozza (profunditat 6) contra Stockfish (≈2500) amb partides reals: si un motor
  domina, la classificació reflectirà el motor i no el perfil. Els paràmetres són
  `CONFIG.POWER` i la relació de `tvLegendSide`.
- Comprovar si els perfils de Stockfish es noten (com ja es fa amb `tvPickStyledMove` i
  `tvMoveFeatures` en partides senceres des de Node).
