# Rival Antídot · 5. Seguiment del progrés real

El percentatge acumulat d'encerts indica rendiment històric, **no** una millora.
El nou informe (antidoteprogress.js) només compara el rendiment en proves
homogènies i mostra les mostres emprades. No assigna un ELO artificial.

## Criteris

- Font de veritat: les proves finalitzades a l'historial de partides pròpies
  d'Antídot; viatgen amb la sincronització de l'historial. No hi ha un nou
  comptador que es pugui duplicar entre dispositius.
- Primer intent: els reintents compten segons firstResult, mai segons el
  resultat millorat després de desfer la jugada. Si consta retried sense
  firstResult, s'exclou; també s'exclouen pendents i inconclusives.
- Homogeneïtat: mateix tema, mateixa fase i mateix ritme (p. ex. 3+2 contra
  3+2). Quan la fase o el ritme no s'indica, s'agrupa separadament.
- Dues finestres temporals consecutives, sense solapament, de 4 a 8 proves
  cadascuna; cada finestra requereix almenys dues partides diferents.
  Superada = 1, parcial = 0,5, fallada = 0.
- El diagnòstic de **millora consistent** requereix 8 proves per finestra,
  almenys 3 partides a cada finestra, diferència mínima de 16 punts
  percentuals i llindar conservador de soroll (1,28 errors estàndard).
  No és una certificació estadística d'una evolució causal.
- Amb menys evidència però canvi d'almenys 20 punts s'indica només
  «Indici de millora» o «Indici de retrocés». En cas contrari,
  «Sense canvi clar» o «Mostra insuficient».

L'informe es calcula al moment de mirar les estadístiques o acabar la partida;
no grava estimacions en perfils ni interfereix amb la selecció segura de
candidates de Stockfish 19. No atribueix a una categoria completa la millora
d'un altre ritme o fase; sempre mostra el context i el nombre de proves.

Proves de regressió: tests/antidote-progress-real.test.js.
