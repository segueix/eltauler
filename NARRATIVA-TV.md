# Memòria narrativa de Stockfish vs Lozza TV — fase 2

## Funció

La retransmissió deixa de presentar els motius verificats com a frases desconnectades. El mòdul local **narrativa.js** recorda els temes que l'espectador ha sentit i pot recuperar-los quan tornen a aparèixer de forma comprovable.

És una capa de **redacció contextual**, no un nou motor d'escacs. No s'atribueixen intencions als jugadors ni es dedueixen avantatges de cap expressió lingüística.

## Fils implementats

- Centre: ocupació i control de caselles centrals per un bàndol.
- Columnes: ocupació de columna oberta o semioberta i posterior duplicació de torres a la mateixa columna.
- Peons passats: aparició i avanç del mateix peó identificat per color i columna.
- Pressió: el mateix bàndol pressiona una peça a una casella concreta.
- Seguretat del rei: deteccions successives de pressió a la zona del rei adversari.
- Majoria de peons: accions al flanc de rei o de dama.

Les connexions s'identifiquen per l'etiqueta estructurada de cada motiu (kind/key/sig), no per coincidències aproximades entre textos. Només es recorden fets que realment s'han comentat. La continuïtat s'expressa com a recuperació d'un tema, sense afirmar que la pressió ha estat permanent entre les dues jugades.

Hi ha tancaments específics, amb comprovació del moviment legal, quan es captura una peça que prèviament havia estat identificada com a objectiu de pressió o un peó passat seguit durant la partida.

## Límits contra la monotonia i els errors

- Màxim de 16 fils de memòria per partida.
- Caducitat dels fils després de 48 semijugades sense tornar-ne a parlar.
- Un comentari narratiu ampliat com a màxim cada 8 semijugades.
- Un mínim de 3 semijugades des de la menció anterior per recuperar el fil.
- Comentaris de fins a 37 paraules quan s'hi afegeix context.
- Els mats, resums i avisos tàctics crítics conserven la formulació prioritària.
- Cap frase de continuïtat si no existeix un motiu verificat actualment.
- Memòria reiniciada a cada nova partida.

## Reprendre i desfer jugades

La memòria forma part de les instantànies ja guardades per cada moviment. Es restaura quan l'usuari tira enrere, es manté en pausa i es recomputa quan l'usuari pren el control. No s'emmagatzema a les preferències ni es comparteix entre dispositius.

La interfície mostra un discret resum de **fils comentats**; no els presenta com si fossin necessàriament plans actius o avantatges actuals.

## Proves

- `tests/narrativa.test.js`: continuïtat, comprovacions de captures, límits, immutabilitat, integració amb la TV i simulació.
- `npm test`: regressió general amb els comentaris, jugades legals i controls.
- Si el mòdul falla o no es carrega, els comentaris existents continuen funcionant.

## Fases següents

- **Fase 3**: explicacions dels jeroglífics i prosòdia de la veu Matxa.
- **Fase 4**: auditar partides completes, mesurar monotonia, validar la qualitat narrativa i optimitzar el rendiment.

## Fase 6 · L’Art de la Guerra integrat

- `artdelaguerra.js` s'injecta al navegador abans de `stockfishtv.js`.
- `tvBroadcastStep` només genera una màxima quan el comentari seleccionat es correspon amb un candidat verificat (`kind/key/sig`) i disposa de prova reglamentària o anàlisi fiable amb profunditat suficient.
- Els resums sense motiu directament verificat, mats, posicions preparades i desenllaços crítics no generen màximes; un sacrifici exigeix una variant certificada.
- El comentari factual continua intacte a `comment.text`; la màxima original va a `comment.maxim` i es mostra separada, sense falsa atribució històrica.
- Elia narra el fet i Grau llegeix la màxima, seqüencialment. Amb duet desactivat, s'utilitza una única veu. La síntesi Matxa es precalcula amb el mateix identificador i velocitat que s'emet.
- `memory.art` acompanya els canvis de jugada, es restaura en desfer i es reinicia a cada partida. El mòdul pot fallar o faltar sense impedir els comentaris normals.
- Proves noves d'elegibilitat, profunditat, cancel·lació implícita entre torns, duet, memòria i simulació.

## Fase 7 · Les 36 estratagemes i el prestatge de llibres

- `estratagemes.js` (`ElTaulerEstratagemes`) té 26 dels 36 estratagemes tradicionals xinesos —els que encaixen amb motius d'escacs que ja es verifiquen— amb 4 frases originals cadascun: 104 frases. Cada estratagema s'anomena pel seu títol en català almenys en una frase (per exemple, «Fer soroll a l'est i atacar a l'oest» per a l'atac doble, «Treure l'escala quan l'enemic és al terrat» per a la clavada o «Fer sortir el tigre de la muntanya» per eliminar el defensor). Cap frase no és una citació ni afirma una victòria segura.
- Mateix contracte i mateixes garanties que l'Art de la Guerra: només amb un comentari certificat i prova reglamentària o anàlisi fiable, mai en urgències ni posicions preparades, i el sacrifici només amb una variant certificada. Totes les frases d'un estratagema valen per a cadascun dels motius als quals està lligat.
- `tvBookshelf([art, estratagemes])` alterna els dos llibres amb el mateix contracte `choose`: primer prova el llibre que no ha parlat l'última vegada i, si no té res per al motiu (per exemple, l'Art no en té per als escacs), l'altre. Entre dues frases de qualsevol llibre hi ha com a mínim 7 semijugades, com abans; cada llibre conserva la seva memòria dins de `memory.art`.
- La pantalla indica d'on ve cada frase («L'Art de la Guerra · …» o «Les 36 estratagemes · …», amb el número i el títol de l'estratagema al text emergent). Grau la llegeix com fins ara.
- Proves: `tests/estratagemes.test.js` (catàleg, elegibilitat, ritme, memòria, alternança i simulació de partides reals sense canviar cap comentari factual).

## Fase 8 · Els llibres també als exercicis de dues jugades

- `maximesexercici.js` (`ElTaulerMaximesExercici`) porta les màximes de tots dos llibres al botó «Màxima» dels exercicis (tàctiques, errades, jeroglífics…). No detecta res pel seu compte: passa `tvCommentCandidates` per cada jugada del jugador de la línia fixa de l'exercici i només aprofita els fets comprovats amb el tauler o les regles.
- Pas 1: una màxima de conjunt (fets de les jugades següents) i una per a la jugada, de llibres i famílies diferents; pas 2 i següents: una. Si la jugada no té cap fet que els llibres reconeguin, la màxima surt de la resta de la línia; si tampoc, l'app torna a la màxima de sempre (OpenAI o el banc local).
- La cessió de material (família *cessió*, estratagema de la prunera) només surt quan la peça del jugador és capturada a la mateixa casella, el balanç cau almenys dos punts i la línia ve del motor o del rebost verificat; la línia d'emergència (`lineSource: 'emergency'`) no compta.
- Fets propis dels exercicis, comprovats amb les regles i que la TV no emet: jugada tranquil·la (`quiet-move`), retirada d'una peça cap a la seva primera fila (`retreat`) i intercanvi de peces del mateix valor amb recaptura possible (`exchange`). Els fets urgents de la TV hi arriben amb un nom propi, perquè en un exercici no hi ha cap avís que s'endarrereixi: mat (`mate-finish`), sortir de l'escac (`escape-check`), promoció (`promotion-step`) i atac doble amb escac (com a `fork`). A la TV els llibres continuen callant davant d'aquests fets.
- Per a aquests fets, l'Art de la Guerra té quatre famílies noves de 13 màximes (*paciència*, *retirada*, *intercanvi* i *remat*: 208 en total) i les estratagemes en tenen dues més (27, «Fingir bogeria sense perdre el seny», i 36, «Retirar-se és la millor opció»: 28 estratagemes i 112 frases). Els altres fets nous fan servir estratagemes que ja hi eren (el mar, deixar anar, la llenya, el cap, la cigala).
- Sense ritme de retransmissió: un rellotge sintètic salta la separació mínima de la TV, però la memòria de cada llibre i un historial dels 8 últims textos (clau local `tauler_maximes_exercici_v1`, no sincronitzada) eviten repeticions. Amb les partides de prova: tots els passos tenen màxima, unes 250 de les 320 frases diferents i cap text repetit abans de 8 màximes.
