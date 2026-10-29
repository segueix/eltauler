# Fase 4 · Auditoria de comentaris, pedagogia i rendiment

## Objectiu

Verificar el sistema de llenguatge en català desenvolupat a les fases 1, 2 i 3 abans de donar-lo per estabilitzat. Aquesta fase no canvia els nivells ni l'algoritme de joc de Stockfish i Lozza.

## Eines

- `auditoria.js`: mesura cobertura de comentaris, varietat, silencis consecutius, repeticions exactes a quatre semijugades, inicis repetits, longitud excessiva i errades de contracció habituals.
- `preferVariety`: quan dues frases igualment verificades poden descriure una jugada, prefereix la que evita repetir l'inici de les frases recents. No modifica la prioritat dels motius ni inventa tàctiques.
- `scripts/audit-commentary.js`: reprodueix set escenaris de partides que acaben en mat o taules (tres miniatures amb moviments especificats i quatre simulacions deterministes de jugades legals). Mostra mesures per partida i temps d'execució aproximat.
- `tests/auditoria-fase4.test.js`: compara els resultats amb límits de qualitat, valida la correcció de la memòria entre jugades i prova explicacions dels jeroglífics.

## Correccions de qualitat

1. **Varietat**: evita repeticions consecutives de «Les blanques…», «La torre…» etc. sempre que el selector tingui una alternativa que expliqui el mateix motiu.
2. **Memòria**: segueix la casella real d'un peó passat encara que no hi hagi comentari intermedi; deixa de seguir una peça pressionada quan abandona la casella o és capturada. També té en compte la captura al pas.
3. **Llengua**: corregeix contraccions com «a el cavall» → «al cavall» i la concordança de les captures als jeroglífics («captura una torre»).
4. **Prosòdia Matxa**: respecta les majúscules a l'inici de frase i manté la forma original de «Taules» després de netejar duplicats.
5. **Rendiment**: compta una memòria acotada a 16 fils, selecciona frases en local sense xarxa i mesura els mil·lisegons necessaris per simular les retransmissions.

## Execució

`npm test -- --runInBand`

`npm run audit:commentary`

Les dades provenen de simulacions de jugades **legals**, no de partides realment disputades entre Stockfish i Lozza. L'auditoria no equival a una comprovació perceptiva de Matxa: la qualitat sonora final necessita una prova d'escolta en un navegador amb el servei disponible.

## Límits que comprova el test

- Tots els escenaris de partida finalitzen reglamentàriament.
- Cap nova frase detectada amb les regles d'auditoria no té «de el», «a el» ni puntuació inversemblant.
- No s'accepten locucions de més de 65 paraules.
- La cobertura supera el 15 % i les repeticions exactes representen com a màxim el 8 % de les semijugades, amb un marge de 3 casos per als escenaris curts.

Aquests llindars són **mínims de regressió**, no objectius suficients de qualitat editorial. Les dades de l'auditoria són accessibles als logs de CI sota l'etiqueta `AUDITORIA_FASE4`. Cal combinar-les amb lectura humana de partides i escolta real de Matxa per ajustar el registre de comentarista.

## Decisions de producte

La millora expressiva opera a la TV i, als jeroglífics, dins de les explicacions ja verificades. No envia posicions ni comentaris a cap servei extern addicional. Matxa continua essent en línia quan l'usuari l'ha activada i manté la veu catalana local com a alternativa.
