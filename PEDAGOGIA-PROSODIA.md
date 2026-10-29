# Fase 3 · Jeroglífics pedagògics i prosòdia catalana de Matxa

## Jeroglífics: explicacions per passos

El mòdul local **jeropedagogia.js** reconstrueix les cinc mitges jugades de cada jeroglífic: tres moviments del jugador i dues rèpliques del rival. Només funciona si `ElTaulerHieroClosure.matches(candidate)` valida el certificat del desenllaç.

- Abans d'encertar una jugada, no revela informació de la línia futura.
- Després del primer i del segon moviment encertats, mostra què ha fet la jugada ja efectuada (desplaçament, captura, escac o coronació).
- En acabar l'exercici, ofereix una explicació completa de les tres jugades i les respostes, el desenllaç i un consell educatiu sobre el tipus de final.
- Manté les comprovacions existents sobre les alternatives, la precisió de Stockfish i la validació de mats i guanys de material.
- Si les dades no són vàlides, deixa la presentació original i no publica explicacions no certificades.

Les explicacions són deterministes, estan redactades en català i no demanen cap accés de pagament.

## Prosòdia Matxa

El mòdul **prosodia.js** prepara el text pla per al sintetitzador neuronal sense fer servir SSML (la demo Matxa no requereix aquesta sintaxi). Llegeix les caselles, per exemple «f 3» → «efa tres», i separa pauses d'acord amb la puntuació.

La conversió s'aplica **tant a la precàrrega com a la síntesi real**, per garantir que les dues funcions consultin el mateix text i puguin reutilitzar la memòria cau d'àudio. No modifica el comentari visual ni l'àudio de reserva de la veu catalana del dispositiu.

Matxa continua essent una veu neuronal **en línia**: l'aplicació envia el text al servei de síntesi de la demo del BSC. Si falla, s'utilitza la veu catalana local quan és disponible.

## Proves

- `tests/jeropedagogia.test.js`: proves del final, de les tres jugades, dels textos sense spoilers i del rebuig a proves manipulades.
- `tests/prosodia.test.js`: pronunciació de caselles, puntuació, coherència entre precàrrega i reproducció, i mecanisme de reserva.
- `npm test -- --runInBand`: regressió general de tot El Tauler.

La millora de Matxa només es pot validar acústicament de manera definitiva en dispositius reals amb veus disponibles; les proves automàtiques cobreixen la preparació de text i el pas a les API de veu, no la qualitat acústica del servei.
