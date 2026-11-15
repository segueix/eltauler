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
- Per a aquests fets, l'Art de la Guerra té quatre famílies noves (*paciència*, *retirada*, *intercanvi* i *remat*) i les estratagemes en tenen dues més (27, «Fingir bogeria sense perdre el seny», i 36, «Retirar-se és la millor opció»).
- Les famílies i els estratagemes que surten més sovint tenen més frases: *paciència* i *defensa* 26, *finals* i *peons* 20, i els 12 estratagemes més freqüents (el mar, la bogeria, la cigala, el somriure, el cap, l'escala, la retirada, l'hoste, l'enemic cansat, Chencang, la cabra i el no-res) 8 en lloc de 4. En total, 248 màximes de l'Art de la Guerra i 160 frases de 28 estratagemes; la TV també en surt beneficiada. Els altres fets nous fan servir estratagemes que ja hi eren (el mar, deixar anar, la llenya, el cap, la cigala).
- Presentació: totes les màximes del botó (llibres, banc local i OpenAI) surten a la mateixa caixa (`.maxim-panel`), que ocupa tota l'amplada de l'estat; les fletxes de jugades passen a sota (a l'ordinador, abans la caixa quedava en uns 140 px). Les frases de l'Art de la Guerra porten el nom del llibre; les de les estratagemes es mostren soles, sense dir de quin estratagema vénen.
- Veu: si «Veu i ràdio» del tauler té la veu activada, les màximes es llegeixen en veu alta en sortir (`ElTaulerBoardExperience.say`), amb la mateixa veu que comenta les jugades. Només es llegeixen les frases.
- Sense ritme de retransmissió: un rellotge sintètic salta la separació mínima de la TV, però la memòria de cada llibre i un historial dels 8 últims textos (clau local `tauler_maximes_exercici_v1`, no sincronitzada) eviten repeticions. Amb les partides de prova: tots els passos tenen màxima, unes 330 de les 408 frases diferents i cap text repetit abans de 8 màximes (a la pràctica, unes 70).

## Diàlegs i seguiment del conflicte

La TV revalida fins a dos fils per jugada, fins i tot quan no hi ha comentari. Segueix peces sota pressió, amenaces amb una captura legal, peons passats, columnes, caselles centrals i la seguretat del rei. L'estat guarda què s'ha observat i què ja ha aparegut a la retransmissió. Un fil caduca quan deixa de complir les condicions o fa massa que no canvia.

Un diàleg pot explicar el reforç d'una defensa, una amenaça neutralitzada, un peó bloquejat o l'obertura d'una columna. Elia sol presentar la jugada i formular la pregunta. Grau explica la conseqüència amb peces, caselles o línies concretes. Els torns de text i veu es preparen junts i comparteixen el límit de 45 paraules. Els escacs, els mats i les urgències tenen prioritat. La resposta directa a un atac es pot explicar en format de diàleg si conserva la mateixa incidència.

Per exemple, en una seqüència de prova en què el cavall negre arriba a f6 i reforça el peó de d5:

- Elia pregunta «Com responen a la pressió sobre el peó de d5?».
- Grau respon «Ara el defensen dues peces. Abans en tenia una.».

La comparació d'alternatives reutilitza les dues variants de l'anàlisi de Stockfish que ja es calcula. Cal que surtin de la mateixa posició i profunditat, que la jugada feta sigui una de les dues primeres opcions, que hi hagi una diferència clara de valoració i que es puguin jugar legalment la jugada i la resposta de totes dues línies. Grau explica la resposta prevista com una variant. Si falten dades, es comenta el que es veu al tauler.

Els diàlegs alternen amb les intervencions individuals i les màximes. Amb el duet desactivat, la mateixa veu llegeix la narració i l'explicació. El controlador restaura la memòria en desfer jugades i talla els torns pendents en deixar la posició.

## Fase 9 · La visió d’en Grau: dues o tres jugades endavant

`visiograu.js` (`ElTaulerVisioGrau`) fa que en Grau miri **endavant**. A cada jugada, la TV ja analitza amb Stockfish a plena força la posició nova (MultiPV 2, fins a profunditat 16). En Grau en llegeix la **línia principal** i explica què passarà en les properes dues o tres jugades i **per què**.

### Les veus: intencions, no caselles

Ni l’Èlia ni en Grau no diuen mai cap casella; les caselles només són a la notació de la pantalla (llista de jugades i «Línia de Stockfish»). En Grau explica la **intenció** de les jugades:

- **Accions**: «fer escac amb la dama», «fer una forquilla amb el cavall a la dama i a la torre», «clavar el cavall contra el rei», «fer fora l’alfil amb un peó», «guanyar el peó central», «canviar les torres», «posar la dama a recer i, de passada, atacar el cavall», «protegir un peó de l’enroc», «treure el cavall de la dama per controlar el centre», «enrocar curt per posar el rei a recer», «empènyer el peó passat», «doblar les torres a la columna», «entrar a la setena fila», «plantar el cavall en un lloc avançat», «fer el fianchetto amb l’alfil del rei», «obrir una sortida al rei», «activar el rei».
- **Peces**: quan un bàndol en té dues del mateix tipus, es distingeixen pel nom de sempre: el cavall del rei, la torre de la dama i l’alfil del rei o de la dama (pel color de les caselles). Cavalls i torres es reconeixen des de la posició inicial i se segueixen jugada a jugada, enroc inclòs. Les peces rivals porten el color («el cavall del rei negre»), i la peça que acaba de jugar és «aquest cavall».
- **Peons**, pel paper que fan: el peó passat, el peó central, un peó de l’enroc, el peó de torre, un peó del flanc de dama.
- **Zones**: el centre, el flanc de rei o de dama, el camp rival, a prop del rei, la columna oberta, la setena fila, la gran diagonal.

Els comentaris de cada jugada els llegeix l’Èlia; en Grau parla als diàlegs i als resums. També són sense caselles els seguiments dels fils de conflicte («Fora de perill: ja no l’ataca cap peça rival.») i la comparació de variants.

**L’Èlia** fa servir la mateixa lectura del tauler:

- Quan comenta sola una jugada, la diu per la intenció: «Les blanques treuen el cavall del rei per controlar el centre», «Les negres fan fora l’alfil amb un peó», «Les blanques fan una forquilla amb l’alfil del rei al rei i a la torre del rei negre».
- La resta de fets verificats (clavades, amenaces, peons passats, pressió, millors jugades…) es mantenen, però cada referència a una casella es diu amb el nom de la peça que hi ha al tauler: «el peó d’e5» → «un peó central», «el cavall de c6» → «el cavall de la dama negra»; les caselles de destinació desapareixen i les columnes van sense lletra. Les millors jugades es diuen per la intenció («l’anàlisi preferia fer fora el cavall del rei negre amb un peó»). Si una frase no es pot dir bé sense caselles, no es diu i l’Èlia en diu la intenció.
- Als diàlegs, l’Èlia diu **què** s’ha jugat, sense caselles ni intenció («Les blanques avancen el peó de rei dues caselles.», «Les negres porten el cavall del rei cap al centre.»), i pregunta per què («Què hi busquen les negres?», «Per què ara?»). La intenció la respon en Grau; si en Grau només repetiria la frase de l’Èlia, no hi ha diàleg. Els peons sense un paper especial es diuen pel nom clàssic: el peó de rei, el peó d’alfil de dama, el peó de torre de rei.
- El text verificat original es conserva intern (memòria, narrativa, màximes); la pantalla, la veu i l’historial de la TV fan servir el de l’Èlia.

### Com es construeix l’explicació

1. **Lectura de la línia.** Es juguen amb chess.js fins a sis semijugades de la variant principal (vuit si cal acabar un canvi de peces). La lectura s’atura a la primera jugada il·legal.
2. **Intenció de cada jugada**, comprovada al tauler *després* de jugar-la i triada per importància: mat, coronació, forquilla, captura (guany, canvi o recuperació), escac, clavada, sortir de l’escac, posar una peça a recer, protegir, atacar o fer fora, enroc, setena fila, columnes, peó passat, rei rival, lloc avançat, fianchetto i gran diagonal, oferir un canvi, sortida al rei, desenvolupament, centre (només peons i peces menors, i no als finals) i rei actiu als finals. Si no n’hi ha cap, la jugada es diu per la zona on va.
3. **Tema estratègic** de les jugades que en Grau ha narrat (mai de les que no ha dit): material guanyat i per què, sacrifici compensat, forquilla, clavada, atac al rei, peó passat, columnes i setena fila, pressió sobre una peça, iniciativa, guanyar un temps, canvis (segons qui va per davant), oferir canvis, lloc avançat, maniobra, desenvolupament, centre, gran diagonal, rei actiu, consolidació o tensió. Si cap bàndol no en té cap, la fase és tranquil·la.
4. **Valoració** de Stockfish al final de la línia (equilibrada, lleuger, clar o decisiu), amb els peons per als avançats.

Garanties del material: es compara amb la posició d’abans de la jugada si aquesta era una captura (una recaptura no és cap guany), la línia narrada ha d’acabar quieta i el guany s’ha de mantenir fins al final de tota la línia llegida (una peça penjada a mitja línia no compta). Quan hi ha guany, se n’explica la causa comprovada: la peça queda sense defensa o té més atacants que defensors.

### El diàleg

- **L’Èlia** sempre diu primer la jugada (o el fet que s’hi ha vist, si és breu) i fa una de les 14 preguntes sobre el que ve.
- **En Grau** narra la línia: la resposta del rival i la continuació, i una segona parella de jugades (una tercera per als avançats). Si la mateixa intenció es repeteix, «tornarien a posar la dama a recer».
- **L’Èlia** pregunta per la lògica i **en Grau** l’explica amb el tema i la valoració. Si no hi cap, en Grau parla en dos torns seguits; al nivell bàsic, una sola parella de jugades i cap segona pregunta.
- Amb el duet desactivat, la primera pregunta es converteix en presentació i la segona queda com a pregunta retòrica.
- Sota el diàleg, la pantalla mostra la **línia de Stockfish** en notació (per exemple «14…Nf6 15.Re1 O-O 16.d4»), per a qui vulgui el detall.

### El seguiment

La previsió es guarda a la memòria de la retransmissió (`memory.visio`) i es revisa a cada semijugada, encara que la jugada no tingui diàleg:

- **Encert**: quan la partida arriba a la jugada clau del pla tal com s’havia anunciat, l’Èlia ho pregunta («Grau, és la jugada que anunciaves?») i en Grau ho confirma amb el fet comprovat, i hi afegeix la resposta que ara espera Stockfish.
- **Desviació**: si un bàndol se n’aparta abans de la jugada clau, en Grau diu què esperava Stockfish i, amb les dues anàlisis fiables, què costa: res, una mica o clarament. Les desviacions sense importància només es comenten cada 10 semijugades com a molt.
- Els fils de conflicte (pressió, amenaces, peons passats…) també miren endavant: si la línia de Stockfish torna a la mateixa casella, en Grau ho avança («Però Stockfish preveu que les blanques hi tornin amb la torre a d1.»).

### Ritme i límits

- Un pla com a molt cada 6 semijugades (8 si tornaria a ser del mateix bàndol), mai just després d’un altre diàleg, ni en jugades preparades, mats, urgències o posicions decidides (més de 6 peons de diferència).
- Profunditat mínima de 12 i anàlisi de la mateixa posició.
- Paraules de tot el diàleg: 66 (bàsic), 88 (mitjà), 96 (avançat). La narració de la línia té prioritat sobre la lògica i la valoració.
- Prioritat dels diàlegs: un fil de conflicte que es resol, el seguiment d’una previsió, la resta de fils, el pla, la comparació de variants i el fet de la jugada.
- La memòria es restaura en desfer jugades i es reinicia a cada partida. Si el fitxer no carrega, la TV continua amb els diàlegs d’abans; `visio: null` el desactiva.

Proves: `tests/visiograu.test.js`.
