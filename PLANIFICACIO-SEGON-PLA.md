# Planificació de la feina en segon pla segons la gamma del mòbil

El Tauler fa molta feina que l'usuari no demana directament. Fins ara cada peça
decidia pel seu compte quan treballar. En un mòbil modest se sumaven diverses
coses: dos motors WebAssembly a la memòria, anàlisis de minuts, el fil principal
ocupat amb chess.js mentre l'usuari tocava la pantalla... El resultat eren
batzegades i, de vegades, que el navegador tanqués l'app per falta de memòria.

Ara totes les feines pesades de fons passen per un sol planificador,
`rendiment.js` (`window.ElTaulerRendiment`, connectat a `app.js` amb `perf()`).

## 1. Com es decideix la gamma

| Senyal | Nota 0 | Nota 1 | Nota 2 | Nota 3 |
|---|---|---|---|---|
| Nuclis (`hardwareConcurrency`) | ≤ 2 | 3–4 | 5–6 | ≥ 7 |
| Memòria (`deviceMemory`, GB) | ≤ 2 | 3 | 4 | ≥ 6 |
| Prova de velocitat de JS (ms) | ≥ 25 | 12–25 | 6–12 | < 6 |

- El maquinari compta pel seu punt més feble (nuclis o memòria). Es fa la
  mitjana amb la prova de velocitat, i un ordinador hi suma un punt.
- Amb menys d'1,5 punts és **gamma baixa**, fins a 2,5 és **gamma mitjana** i a
  partir d'aquí és **gamma alta**.
- Hi ha dos límits que no es poden saltar. Amb ≤ 2 GB de memòria o ≤ 2 nuclis,
  sempre és gamma baixa. Amb 3 GB, com a molt gamma mitjana. La memòria és el
  que fa que el navegador tanqui l'app.
- La prova de velocitat dura uns mil·lisegons. Es fa amb l'app en repòs, un cop
  per setmana per aparell (`eltauler_cloud_perfBench`, que no viatja al núvol).
- **Rebaixa per pressió.** Si en 10 minuts hi ha tres episodis de pressió alta,
  la gamma baixa un graó durant la resta de la sessió i durant les 24 hores
  següents (`eltauler_cloud_perfPenalty`).
- **Configuració › Rendiment de l'aparell** permet forçar un mode: Automàtic,
  Estalvi (gamma baixa), Equilibrat (gamma mitjana) o Màxim (gamma alta). Al
  costat es mostra què s'ha detectat, per què i si ara està en pausa.

## 2. Senyals en temps real

- **Bloquejos del fil principal.** Es mesura el retard d'un temporitzador de
  250 ms, i també els `longtask` i `long-animation-frame` quan el navegador els
  dona. Un mateix bloqueig que arriba per dues vies es compta un sol cop. És
  pressió alta un bloqueig de ≥ 1 s, o tres de ≥ 200 ms en 30 s.
- **Memòria.** Si `performance.memory` arriba al 85 % del límit, és pressió alta.
- **Pressió alta.** Atura la feina opcional durant un temps (90 s en gamma
  baixa, 45 s en mitjana, 20 s en alta) i tanca de seguida els motors inactius.
  Les feines en marxa s'aturen a la jugada següent (`mustYield`).
- **Bateria.** Si no està carregant i baixa del 35 % (gamma baixa), del 25 %
  (mitjana) o del 15 % (alta), no es fa res d'opcional.
- **Interacció.** No es comença cap feina pesada fins que han passat 4 s
  (baixa), 2 s (mitjana) o 0,8 s (alta) des de l'últim toc, tecla o desplaçament.
- **App amagada.** No es fa res i les feines en marxa s'aturen.

## 3. Perfils per gamma

| | Baixa | Mitjana | Alta |
|---|---|---|---|
| Cicle de fons (`backgroundPrepTick`) | cada 8 s | cada 5 s | cada 4 s |
| Feines pesades alhora | 1 | 1 | 2 |
| Pantalles on es treballa | només inici, estadístiques i ajustos | qualsevol pantalla tranquil·la | qualsevol pantalla tranquil·la |
| Pausa entre jeroglífics generats | 20 s | 8 s | 1,5 s |
| Pausa entre exercicis preparats | 25 s | 8 s | 0,6 s |
| Jeroglífics nous a preparar a l'aparell | 2 | 3 | 6 |
| Autojoc: temps per jugada / partida | 250 ms / 25 s | 350 ms / 40 s | 400 ms / 50 s |
| Llavors certificades per intent | 2 | 3 | 4 |
| Partida interna: primera / interval | als 8 min / cada 20 min | als 5 min / cada 12 min | als 4 min / cada 10 min |
| Màxim d'auto-generats pendents | 6 | 10 | 12 |
| Jeroglífics per passada post-partida | 1 | 2 | 2 |
| Memòria del motor de jeroglífics (Hash) | 8 MB | 16 MB | 16 MB |
| Tancar el motor de jeroglífics si no fa res | als 45 s (i en començar una partida) | als 2 min | als 5 min |
| Resposta del rival de les partides diàries | 2,5 s | 4 s | 4 s |
| Índex d'obertures en repòs | als 15 s | als 6 s | als 4 s |
| Rival Antídot | mode de baix consum | normal | normal |

La validació dels jeroglífics no es rebaixa mai (Stockfish 19 a profunditat 16,
tres jugades úniques i final concloent). Un mòbil lent en fa menys, però tots
igual de fiables.

## 4. Inventari de feines en segon pla

| Feina | On | Motor | Planificació |
|---|---|---|---|
| Cicle de fons | `backgroundPrepTick` | — | Interval per gamma; es torna a programar sol i llegeix el perfil a cada volta. |
| Jeroglífics fins a l'objectiu | `hgTick` → `hgGenerateOne` | SF19 propi | `canStart('hiero')` abans de començar; ocupa un torn; cedeix amb pressió, bateria baixa o app amagada. |
| Passada després de cada partida | `hgPostGameTick` | SF19 propi | `canStart('postgame')`; 1 o 2 jeroglífics per partida segons la gamma; si s'interromp, es reprèn. |
| Partides internes periòdiques | `hgSelfPlayPeriodicTick` | SF19 propi | Torn `selfplay`; ús mínim, interval i màxim de pendents per gamma. |
| «Generar ara» / obrir sense nous | `hgManualGenerateBurst` | SF19 propi | Demanat per l'usuari: no espera torn (`force`), però l'ocupa perquè la resta s'esperi. |
| Preparació d'exercicis | `prepareBundleSequence` | Stockfish principal | Torn `prep`; en gamma baixa i mitjana mai alhora que un jeroglífic; cedeix amb pressió. |
| Motor de jeroglífics | `ensureHieroStockfish` | SF19 | Hash per gamma; es tanca per inactivitat o amb pressió (`registerIdleResource`). |
| Partides diàries | `processDailyGames` (cada 30 s) | worker propi | Lleuger (comptes enrere); la resposta del rival té un temps màxim per gamma i el worker es tanca en buidar la cua. |
| Índex d'obertures | `prewarmOpeningPositionGraph` | — | `requestIdleCallback` per trossos, amb un retard per gamma. |
| Ressenya i anàlisi profunda | `requestOpenAIReview`, anàlisi de la partida | Stockfish principal | Mentre dura, cap generació de jeroglífics (`deepReviewInProgress`). |
| Repertori personal | `buildPersonalOpening…` | worker propi | Atura la feina de fons mentre dura i tanca el motor en acabar. |
| Rival Antídot | `antidoteDeviceOptions` | SF19 propi | Mode de baix consum en gamma baixa; el motor es tanca en sortir de la partida. |
| Stockfish TV i partida col·lectiva | `stockfishtv.js`, `catalans.js` | motors propis | Són feina que l'usuari veu. Mentre la TV és activa no es fa feina de fons, i en gamma baixa tampoc mentre la partida col·lectiva és oberta (només pantalles tranquil·les). |
| Sincronització al núvol | `cloudsync.js` | — | Xarxa; el temporitzador d'aplicar (400 ms) només existeix mentre hi ha dades pendents. |
| Rellotges i comptes enrere | partides, pla, catalans | — | 1 s; lleugers. |
| Monitor del planificador | `rendiment.js` | — | Mostra cada 250 ms; mira la memòria cada segon i allibera motors cada 15 s. |

## 5. Regles generals

1. **Una feina pesada alhora** en gamma baixa i mitjana (un sol motor calculant
   per a la feina de fons). En gamma alta, dues.
2. **L'usuari va primer.** Res de pesat comença just després d'un toc. Res
   d'opcional durant una partida, un exercici o la TV.
3. **El motor de jeroglífics no hi és si no cal.** Es tanca per inactivitat, en
   començar una partida en gamma baixa i de seguida si hi ha pressió.
4. **La qualitat no es rebaixa.** Es redueix la quantitat i el ritme, mai la
   comprovació.
5. **Tot es pot reprendre.** Les passades post-partida, les llavors de
   l'autojoc i les posicions ja provades queden desades, així que una feina
   interrompuda no es perd.
