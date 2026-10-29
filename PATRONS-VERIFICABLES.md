# Fase 5 · Biblioteca de patrons escaquístics verificables

## Què s'ha incorporat

El Tauler incorpora **60 conceptes en català** al mòdul local `patrons.js`, distribuïts en 22 tàctics, 18 posicionals, 10 d'atac i defensa i 10 de finals. Cada entrada té identificador estable, denominació catalana, família i equivalència temàtica amb Lichess quan n'existeix.

**No són 60 detectors de força equivalent**: en la primera onada avançada, 30 disposen de detector automàtic geomètric; tres (`deflection`, `interference`, `sacrifice`) només es reconeixen sobre una línia completa de tres jugades prèviament certificada amb Stockfish. Els 27 restants tenen estat `pendent_de_validacio`. El catàleg diferencia `detector`, `variant_certificada` i `pendent_de_validacio`. El motor lingüístic **mai no comenta automàticament** una etiqueta pendent. El catàleg no confon etiquetar amb demostrar.

Els detectors automàtics disponibles cobreixen, entre altres motius, forquilles geomètriques, atacs dobles, coronacions, mats, enrocs, ocupació del centre, columnes obertes i semiobertes, torres doblades, torres a la setena, peons passats, peons doblats i aïllats, cadenes de peons, fianquets, captures sense atac immediat, activació del rei i diversos finals segons el material.

Els patrons geomètrics no afirmen que la jugada guanyi material ni que la combinació sigui forçada. Stockfish continua analitzant el valor de les jugades amb el sistema existent; les etiquetes de Lichess no substitueixen aquesta anàlisi.

## On s'utilitzen

- **Stockfish vs Lozza TV**: candidats explicatius posicionals de prioritat moderada que no desplacen els comentaris crítics de mat, forquilla, amenaça o error important.
- **Partides i entrenaments**: `gamebroadcast.js` i `boardexperience.js` afegeixen un comentari sobre patrons verificats **després** del moviment que ha fet el jugador; no revelen la resposta del rival ni interfereixen amb el rellotge.
- **Jeroglífics**: `jeropedagogia.js` recomputa els detectors després de cada jugada legal del jugador en la línia certificada per `hieroclosure.js`. Només es revelen els patrons del pas ja resolt; en acabar s'expliquen tots tres passos.

Les altres funcionalitats segueixen funcionant sense cap mòdul addicional: es tracta d'una capa optativa amb mecanismes de reserva.

## Lichess CC0: exemples i importació

La base pública de Lichess (https://database.lichess.org/) conté milions de problemes, sota llicència CC0. Les categories de temes es documenten a https://lichess.org/training/themes.

`data/patrons-lichess-cc0.json` conté **quatre exemples públics i atribuïts** procedents de les mostres oficials de Lichess. Les proves reprodueixen totes les jugades d'aquests exemples amb chess.js i comproven que són legals.

**Atenció a la semàntica de Lichess:** el camp `FEN` indica la posició **abans** del primer moviment de la llista `Moves`, que pertany al rival. La jugada `Moves[1]` és la primera de la solució del jugador. No es pot usar el `FEN` directament com l'inici del problema sense aplicar `Moves[0]`.

L'eina `scripts/import-lichess-patrons.js` permet seleccionar de manera reproduïble un subconjunt local d'un CSV de Lichess, limitar la popularitat mínima, equilibrar temes i **validar legalment totes les jugades**. Les etiquetes importades conserven explícitament l'estat d'anotació externa, no passen a ser deteccions locals automàtiques.

Per preparar el CSV descarregueu `lichess_db_puzzle.csv.zst` de Lichess i descomprimiu-lo fora del navegador. Després:

```sh
node scripts/import-lichess-patrons.js lichess_db_puzzle.csv data/patrons-lichess-seleccionats.json --limit=100 --min-popularity=70
```

El fitxer massiu original **no s'inclou** al repositori ni s'envia als usuaris. El subconjunt importat és un artefacte de preparació local: l'aplicació no l'interpreta automàticament com un jeroglífic complet de tres jugades.

## Proves i límits

```sh
npm test -- --runInBand
npm run audit:commentary
```

`tests/patrons.test.js` comprova la distribució dels 60 conceptes, la fiabilitat dels FEN i moviments, exemples tàctics, peons passats, columnes, finals, integració amb TV, jeroglífics, entrenament i importació local de Lichess.

**Primera onada de patrons avançats:** les clavades (`pin`), enfilades (`skewer`) i descobertes (`discoveredAttack`, `discoveredCheck`) comproven alineacions noves i jugades legals, i no afirmen guanys forçats. Les desviacions i interferències només es poden explicar en jeroglífics concloents, amb una variant certificada, desenllaç revalidat i una peça defensada capturada després de la pèrdua de defensa. No s'apliquen com a inferències lliures a Stockfish TV. Els sacrificis, l'atzucac, les fortaleses i els plans posicionals complexos continuen pendents. Una etiqueta temàtica de Lichess no activa mai cap detector.

**Límits intencionats:** la certificació de la línia acredita la variant principal i el desenllaç del jeroglífic, no que el motiu es produeixi contra totes les defenses possibles ni que qualsevol sacrifici sigui correcte. La redacció evita aquestes afirmacions.

## Llicències

Les dades de la base pública de Lichess són CC0. Les etiquetes i els exemples importats s'han de conservar amb atribució de font. Stockfish continua sotmès a les condicions de la seva llicència GPLv3, d'acord amb la distribució del projecte.


## Segona onada: sacrificis realment acceptats i compensació certificada

El patró `sacrifice` passa de `pendent_de_validacio` a `variant_certificada`. Només apareix després de resoldre un jeroglífic **ja verificat per Stockfish**, no com a etiqueta d'una jugada independent a la TV. Per reconèixer-lo, el sistema exigeix tot això:

- La peça oferta (cavall, alfil, torre o dama) és **capturada en la rèplica següent**; l'oferta sola o el gambit de peó no activa el detector.
- Després de la captura, el balanç material del jugador ha empitjorat **com a mínim dos punts respecte de la posició inicial**. Un intercanvi equivalent no és un sacrifici.
- La millor continuació del jugador després d'acceptar-lo segueix essent favorable segons Stockfish (mat forçat favorable o valoració de com a mínim +300 centipeons), a profunditat de com a mínim 14 i sense valors acotats.
- El desenllaç verificat del jeroglífic és un mat real o un guany material consolidat, i se'n comproven la línia legal i el FEN final.
- Si el rival tenia diverses defenses, es reanalitza la posició anterior a la captura amb MultiPV per contrastar **dues defenses principals**; si la consulta no retorna prou variants fiables, no es publica el motiu. L'anotació desa el nombre de defenses realment contrastades.
- La comprovació del rei no s'infereix de l'aspecte del tauler: quan el jugador queda en escac després de la captura, l'etiqueta només és possible si l'anàlisi de la continuació el resol amb avantatge. No es formula cap afirmació genèrica sobre un «rei segur».

**Limitacions explícites:** aquesta onada acredita sacrificis *acceptats* dins d'una variant concreta. No certifica sacrificis refusats, sacrificis de peó, compensació merament posicional o totes les defenses possibles, ni representa una garantia absoluta fora de la profunditat analitzada. Si falla la consulta de variants, l'exercici original pot continuar funcionant sense una etiqueta de sacrifici.

## Tercera onada: ofertes refusades i compensació posicional

- **Ofertes de sacrifici refusades** als jeroglífics de tres jugades: cal que el rival disposi d'una captura **legal** de la peça oferta, que no l'executi i que una anàlisi separada de la posició hipotètica després d'acceptar-la confirmi una continuació guanyadora per al jugador. La descripció diu explícitament «oferta de sacrifici refusada», no «sacrifici executat». No es mostra fins a resoldre l'exercici. Les variants que no es puguin analitzar queden sense etiqueta.
- **Compensació posicional**: `ElTaulerHieroClosure.createPositionalVerifier(Chess, analyze).verify({fen, move, reply})` permet validar específicament sacrificis de peces **acceptats** en una partida, encara que no es recuperi material ni hi hagi mat en tres. Exigeix jugada recomanada per Stockfish abans de l'oferta, captura legal inclosa en MultiPV, dèficit material real de ≥2 punts, avaluacions a profunditat 18 i 22 coherents (sense cotes), valoració després de la captura ≥−70 centipeons, PV reproduïble de ≥4 semijugades i absència de recuperació material immediata.
- El resultat separa **valoració del motor** dels **indicadors objectius**: escacs i captures de la PV com a indicis de la iniciativa, estat del rei en escac, peons doblats, illes de peons i peons passats. Aquests indicadors no es presenten com a causes demostrades de compensació.
- El verificador posicional queda com a API disponible per als fluxos d'anàlisi, sense executar exploracions costoses a cada moviment de Stockfish TV. No modifica el criteri de tres jugades dels jeroglífics ni els seus desenllaços concloents.


## Quarta onada: integració a la ressenya de partides

A la ressenya local d'una partida ja analitzada, la secció **«Sacrificis amb compensació posicional»** ofereix el botó **«Analitza sacrificis posicionals»**. No s'executa automàticament: profunditat 22 pot consumir bateria i el motor és compartit amb altres funcionalitats.

1. `reviewsacrifices.js` reconstrueix el PGN des de l'inici i només identifica jugades del color analitzat que consten a `moveReviews`, que ofereixen una peça i que el rival **captura** a la jugada següent amb pèrdua temporal de com a mínim dos punts. Una oferta refusada no entra en aquesta fase.
2. Com a màxim s'estudien **dos candidats per petició**, en sèrie i amb cancel·lació si es deixa la partida o el temps global d'anàlisi s'exhaureix. Es reserven els recursos del motor abans de començar.
3. Cada candidat es contrasta amb `createPositionalVerifier`: dues profunditats concordants, variació legal i absència de recaptura immediata. Cap resultat negatiu es presenta com a demostració que no existeixin sacrificis.
4. Els casos acreditats mostren la jugada amb enllaç al tauler, les dues avaluacions i els indicadors observables d'iniciativa i de peons. No es confonen indicadors amb raons demostrades.
5. Les troballes es desen a `entry.positionalSacrificeReview` en el **cos d'IndexedDB** de la partida, no a l'índex lleuger, i tenen una clau derivada de la seqüència de jugades i del color. Si canvia la partida, el resultat anterior no es mostra.

Els exercicis de tres jugades i la narració de Stockfish TV no canvien. Aquest sistema no utilitza cap LLM i no requereix cap clau d'IA.
