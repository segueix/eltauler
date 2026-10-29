# Fase 5 · Biblioteca de patrons escaquístics verificables

## Què s'ha incorporat

El Tauler incorpora **60 conceptes en català** al mòdul local `patrons.js`, distribuïts en 22 tàctics, 18 posicionals, 10 d'atac i defensa i 10 de finals. Cada entrada té identificador estable, denominació catalana, família i equivalència temàtica amb Lichess quan n'existeix.

**No són 60 detectors de força equivalent**: 26 tenen detector automàtic inicial basat en les regles i les posicions; la resta tenen estat `pendent_de_validacio` perquè identificar-los de manera fiable requereix calcular defenses, comparar variants o analitzar plans amb Stockfish. El motor lingüístic **mai no comenta automàticament** una etiqueta pendent. El catàleg no confon etiquetar amb demostrar.

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

**Límits intencionats:** no es confirma automàticament cap sacrifici, desviació, interferència, atzucac, fortalesa o avantatge estratègic només per la seva geometria. Aquests motius requereixen detectors i verificacions de variants amb Stockfish addicionals; no es publiquen com a fets fins que hi siguin.

## Llicències

Les dades de la base pública de Lichess són CC0. Les etiquetes i els exemples importats s'han de conservar amb atribució de font. Stockfish continua sotmès a les condicions de la seva llicència GPLv3, d'acord amb la distribució del projecte.
