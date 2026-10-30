# Rival Antídot — perfil detallat de debilitats

Aquest document descriu l'ampliació del perfil sense perdre el sistema de
categories que ja funcionava.

## Dues escales de diagnòstic

- **Categories**: vuit debilitats generals, deduïdes de les avaluacions de
  partides, errors desats i proves anteriors. Continuem mostrant-ne fins a tres.
- **Subtemes**: patrons concrets amb evidència, com forquilles, clavades,
  enfilades, peons passats, seguretat del rei, finals de torres i altres motius
  reconeguts per l'app. Es mostren fins a quatre indicis.

El perfil no converteix automàticament una errada genèrica en una forquilla:
només compten etiquetes existents i correctament atribuïbles a una categoria.
Per a errors antics amb una millor jugada desada, el client intenta reconèixer
únicament motius geomètrics estrictes amb força alta; quan no hi ha evidència
suficient, conserva només la categoria general.

Cada subtema mesura nombre d'ocasions, gravetat, recència, confiança i
resultats de proves. Un encert no s'inventa com a errada. Els reintents
respecten el **primer intent**, per no falsejar la progressió. El pes concret
reforça la prioritat d'una candidata de Stockfish, però **mai** passa per
davant dels límits objectius de centipeons, mat i material.

## Historial i compatibilitat

Els resums `antidoteStats` guarden `subthemes` de manera opcional, a més
de les categories i fases existents. Les entrades antigues que no tenen
`subthemes` es continuen llegint. Si hi ha revisions completes, se'n poden
recuperar etiquetes; si no n'hi ha, no es fabriquen dades.

No es barregen partides importades d'altres jugadors amb les dades pròpies
per construir el perfil. Els errors que el jugador desi en «Practica les
fallades» conserven el subtema de la prova.

Els motius detectats a partir de la geometria són indicis d'entrenament:
no són una certificació completa que aquella fos l'única refutació.
Per això la interfície n'indica el nombre d'ocasions i la confiança.

Proves: `tests/antidote-subthemes.test.js` i les proves preexistents
d'Antídot.
