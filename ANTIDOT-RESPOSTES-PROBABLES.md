# Rival Antídot · Segona comprovació de respostes temptadores

## Què fa
Stockfish 19 continua triant jugades fortes i respectant els límits de pèrdua
de centipeons, material i mat. Després de la primera cerca MultiPV, el programa
pot identificar una resposta que **sembla natural** per al jugador (captura,
escac, promoció, enroc o una jugada senzilla de desenvolupament) i en comprova
el cost amb una segona cerca independent del mateix motor.

Aquesta anàlisi no afirma que una persona tingui un 60% o un 80% de
probabilitats de fer aquella jugada: no disposem de dades calibrades per
posició. La puntuació de *plausibilitat* és un criteri heurístic per decidir
què cal comprovar, **no una probabilitat estadística**. Només les respostes
que el motor verifica com a errors clars reben un avantatge pedagògic moderat
i només si encaixen amb alguna debilitat observada.

## Límits i seguretat
- Com a màxim 2 comprovacions extra en partides sense rellotge.
- En ritmes ràpids/clàssics, 1 comprovació; cap en blitz o bullet.
- Temps d'anàlisi limitat, amb menys càrrega en mòbils i processadors lents.
- Si l'anàlisi falla, expira o presenta mats/avaluacions dubtoses, es descarta
  la predicció i es conserva la selecció normal de Stockfish.
- Una cerca expirada implica descartar el worker abans de fer-ne una altra.
- La partida no mostra pistes abans que el jugador decideixi.
- En respondre, es comprova si ha triat aquella resposta temptadora.
  La coincidència es registra al resum i a les proves desades.
- Les partides antigues, sense prediccions, continuen funcionant igual.

Proves de validació: `tests/antidote-probable.test.js`, a més de les proves
anteriors de selecció segura i d'historial.
