# Català expressiu d'El Tauler — fase 1

Aquesta fase incorpora **expressivitat.js**, un mòdul local reutilitzable per a Stockfish vs Lozza TV i, en les fases següents, els jeroglífics i l'entrenador.

## Objectius

- Augmentar la varietat real de frases i construccions catalanes, no només substituir sinònims.
- Conservar les frases originals com a reserva i no alterar el resultat ni la valoració de cap jugada.
- Mantenir la generació dins del navegador, sense servidor, API externa ni model de pagament.
- Preparar un vocabulari revisable i fàcil d'ampliar.

## Arquitectura

1. Stockfish TV detecta fets de la posició amb les regles del tauler i Stockfish.
2. tvCommentCandidates produeix candidats amb motiu, prioritat i frases originals.
3. ElTaulerExpressivitat.expandCandidates amplia només els motius ja certificats i únicament si té dades suficients de la jugada.
4. tvSelectComment continua triant segons prioritat, novetat i ritme. Les variants noves segueixen les mateixes normes contra la repetició.
5. El locutor, els motors de joc i l'analista no es modifiquen.

## Repertori

LEXIC agrupa 126 entrades de peces, tàctica, estratègia, finals, accions i connectors. TERMES ofereix explicacions breus de motius seleccionats. Com a referència terminològica s'ha consultat la [Terminologia dels escacs del TERMCAT](https://www.termcat.cat/ca/diccionaris-en-linia/16). Les frases i explicacions del programa són originals.

Hi ha tres registres disponibles per API, seleccionats automàticament segons el nivell de l'espectador: didactic (principiants), natural (intermedi) i analitic (avançat).

## Contracte de fiabilitat

- Cap frase nova afirma que hi hagi victòria, sacrifici, avantatge decisiu o una jugada òptima si el detector no ho ha verificat.
- Captura, coronació, escac i mat es descriuen només quan la jugada aporta dades verificables.
- No es modifica la prioritat dels candidats ni la lògica dels escacs.
- Sense el mòdul, la TV manté les frases anteriors sense interrupcions.
- En posicions sense dades fiables no es creen variants addicionals.

## Proves

Executar: npm test -- --runInBand

El fitxer tests/expressivitat.test.js cobreix glossari, morfologia, apostrofació, registres, afirmacions no verificades i integració amb TV.

## Fases següents

- Fase 2: memòria narrativa de plans i conflictes entre jugades.
- Fase 3: explicacions pedagògiques dels jeroglífics i prosòdia de Matxa.
- Fase 4: proves de partides completes, qualitat, monotonia i rendiment.
