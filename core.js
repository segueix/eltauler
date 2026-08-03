// ============================================================================
// core.js — Lògica pura i testejable d'El Tauler
// ============================================================================
// Aquest fitxer conté les funcions de lògica PURA (sense estat global, DOM ni
// xarxa): càlcul d'ELO, adaptació de dificultat, qualitat de partida i el
// sistema d'obertures (trie). app.js delega aquí mitjançant embolcalls prims,
// de manera que hi ha una ÚNICA font de veritat i els tests (Jest) proven el
// mateix codi que s'executa al navegador.
//
// Es carrega com a:
//   - Navegador: <script src="core.js"> → window.ElTaulerCore
//   - Node/Jest: require('./core') → module.exports
// ============================================================================
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.ElTaulerCore = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ----------------------------------------------------------------------
    // ELO / dificultat (matemàtica pura)
    // ----------------------------------------------------------------------

    // Arrodoneix i limita un valor d'ELO a [min, max]. Si el valor no és numèric
    // s'usa el fallback (que pot ser undefined).
    function clampElo(value, min, max, fallback) {
        const v = isNaN(value) ? fallback : value;
        return Math.round(Math.max(min, Math.min(max, v)));
    }

    // Normalitza un valor dins [min, max] a la fracció [0, 1].
    function normalize(value, min, max) {
        return Math.max(0, Math.min(1, (value - min) / (max - min)));
    }

    // Converteix l'antic rang de dificultat (5-15) al nivell ELO adaptatiu.
    function difficultyToLevel(legacyDifficulty, minLevel, maxLevel) {
        const normalized = Math.max(0, Math.min(1, ((legacyDifficulty || 8) - 5) / 10));
        return Math.round(minLevel + normalized * (maxLevel - minLevel));
    }

    // Converteix un nivell ELO adaptatiu a l'antic rang de dificultat (5-15).
    function levelToDifficulty(level, minLevel, maxLevel) {
        const normalized = Math.max(0, Math.min(1, (level - minLevel) / (maxLevel - minLevel)));
        return Math.round(5 + normalized * 10);
    }

    // Converteix un ROC (escala pròpia) a un UCI_Elo vàlid per a Stockfish.
    function rocToEngineElo(roc, engineMin, engineMax) {
        const value = isNaN(roc) ? engineMin : roc;
        return Math.round(Math.max(engineMin, Math.min(engineMax, value)));
    }

    // Profunditat de cerca segons l'ELO. Per sobre del terra del motor creix
    // 12..16; per sota escala proporcionalment ~2..12.
    function eloToSearchDepth(elo, floor, eloMax) {
        if (elo >= floor) {
            const n = Math.max(0, Math.min(1, (elo - floor) / (eloMax - floor)));
            return Math.round(12 + n * 4); // 12..16
        }
        const fraction = Math.max(0, Math.min(1, elo / floor));
        return Math.max(1, Math.round(2 + fraction * 10)); // ~2..12
    }

    // ----------------------------------------------------------------------
    // Adaptació de dificultat
    // ----------------------------------------------------------------------

    // Calcula el delta d'ELO d'una partida en mode lliure a partir del resultat,
    // la precisió, les ratxes i les partides recents. Retorna el delta ja limitat
    // a [-60, 60].
    function computeEloDelta(params) {
        const normalizedScore = params.normalizedScore;
        const consecutiveWins = params.consecutiveWins || 0;
        const consecutiveLosses = params.consecutiveLosses || 0;
        const recentGames = Array.isArray(params.recentGames) ? params.recentGames : [];
        const safePrecision = Math.max(0, Math.min(100, typeof params.precision === 'number' ? params.precision : 50));

        let eloDelta = 0;

        if (normalizedScore === 1) {
            if (safePrecision > 80) eloDelta += 50;
            else if (safePrecision >= 65) eloDelta += 35;
            else eloDelta += 15;
        } else if (normalizedScore === 0) {
            if (safePrecision > 60) eloDelta -= 15;
            else if (safePrecision >= 45) eloDelta -= 30;
            else eloDelta -= 50;
        } else {
            eloDelta += 10;
        }

        if (consecutiveWins >= 3) eloDelta += 30;
        if (consecutiveLosses >= 3) eloDelta -= 25;

        if (recentGames.length >= 5) {
            const recentSlice = recentGames.slice(-10);
            const wins = recentSlice.filter(game => game.result === 1).length;
            const winRate = recentSlice.length > 0 ? wins / recentSlice.length : 0.5;
            if (winRate > 0.60) eloDelta += 30;
            else if (winRate < 0.40) eloDelta -= 30;
        }

        return Math.max(-60, Math.min(60, eloDelta));
    }

    // Avalua la qualitat d'una partida (0..1) i si té errors, a partir de la
    // precisió, la pèrdua mitjana en centpeons i el nombre de blunders.
    function evaluateGameQuality(precision, avgCpLoss, blunders, config) {
        const safePrecision = Math.max(0, Math.min(100, typeof precision === 'number' ? precision : 0));
        const safeLoss = Math.max(0, typeof avgCpLoss === 'number' ? avgCpLoss : 180);
        const safeBlunders = Math.max(0, typeof blunders === 'number' ? blunders : 0);
        const precisionScore = safePrecision / 100;
        const lossScore = 1 - Math.min(safeLoss, 200) / 200;
        const blunderPenalty = Math.min(0.3, safeBlunders * 0.1);
        const qualityScore = Math.max(0, Math.min(1, (precisionScore * 0.6) + (lossScore * 0.4) - blunderPenalty));
        const isHighQuality = qualityScore >= config.QUALITY_HIGH;
        const hasErrors = safePrecision <= config.ERROR_PRECISION_MAX
            || safeLoss >= config.ERROR_CPLOSS_MIN
            || safeBlunders >= config.ERROR_BLUNDERS_MIN;
        return { qualityScore, isHighQuality, hasErrors };
    }

    // ----------------------------------------------------------------------
    // Obertures (trie de cerca)
    // ----------------------------------------------------------------------

    // Converteix un PGN ("1. e4 e5 2. Nf3") a una llista de moviments
    // (["e4", "e5", "Nf3"]).
    function parsePgnToMoves(pgn) {
        if (!pgn) return [];
        return pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/).filter(m => m.length > 0);
    }

    // Construeix el trie d'obertures a partir de les dades i d'una funció que
    // converteixi el PGN a moviments.
    function buildOpeningTrie(openingsData, parsePgn) {
        if (!Array.isArray(openingsData)) return null;
        const parse = parsePgn || parsePgnToMoves;
        const trie = { children: {}, openings: [] };

        for (const opening of openingsData) {
            const moves = parse(opening.pgn);
            let node = trie;
            for (const move of moves) {
                if (!node.children[move]) {
                    node.children[move] = { children: {}, openings: [] };
                }
                node = node.children[move];
            }
            node.openings.push({ eco: opening.eco, name: opening.name, moves: moves });
        }
        return trie;
    }

    // Moviments d'obertura vàlids des de la seqüència donada.
    function getValidOpeningMoves(trie, sequence) {
        if (!trie) return [];
        let node = trie;
        for (const move of sequence) {
            if (!node.children[move]) return [];
            node = node.children[move];
        }
        return Object.keys(node.children);
    }

    // Comprova si un moviment continua alguna línia d'obertura.
    function isValidOpeningMove(trie, sequence, move) {
        return getValidOpeningMoves(trie, sequence).includes(move);
    }

    // Analitza fins on una partida ha seguit la teoria d'obertures.
    function analyzeGameOpening(trie, moves) {
        if (!trie || !Array.isArray(moves) || moves.length === 0) return null;
        let node = trie;
        let depth = 0;
        let lastOpening = null;
        for (let i = 0; i < moves.length; i++) {
            const mv = moves[i];
            if (!node.children[mv]) {
                const theoryMoves = Object.keys(node.children);
                if (theoryMoves.length === 0 || depth < 2) {
                    return lastOpening
                        ? { depth, name: lastOpening.name, eco: lastOpening.eco, deviationMove: null }
                        : null;
                }
                return {
                    depth,
                    name: lastOpening ? lastOpening.name : null,
                    eco: lastOpening ? lastOpening.eco : null,
                    deviationMove: mv,
                    deviationPly: i,
                    deviationBy: (i % 2 === 0) ? 'w' : 'b',
                    theoryMoves: theoryMoves.slice(0, 3)
                };
            }
            node = node.children[mv];
            depth++;
            if (node.openings && node.openings.length) lastOpening = node.openings[0];
        }
        return {
            depth,
            name: lastOpening ? lastOpening.name : null,
            eco: lastOpening ? lastOpening.eco : null,
            deviationMove: null
        };
    }

    // ----------------------------------------------------------------------
    // Obertures (detecció per POSICIÓ — immune a transposicions)
    // ----------------------------------------------------------------------
    // El trie per seqüència de jugades (a dalt) només reconeix una obertura si
    // les jugades arriben EXACTAMENT en l'ordre del fitxer ECO. Això fa que una
    // mateixa obertura arribada per un altre ordre de jugades (transposició) es
    // classifiqui malament: p. ex. una Catalana per 1.d4 d5 2.c4 e6 3.g3 Nf6 es
    // marcava com a «Queen's Gambit Declined» amb una desviació falsa, o per
    // 1.d4 Nf6 2.c4 e6 3.Nf3 com a «Índia de Dama». Per evitar-ho, identifiquem
    // les obertures per la POSICIÓ resultant (FEN), no per la seqüència.

    // Posició inicial (clau normalitzada: col·locació + torn + enrocs).
    const START_POSITION_KEY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq';

    // Normalitza una FEN a la part que identifica la posició a efectes
    // d'obertura: col·locació de peces + torn + drets d'enroc. Ignorem el camp
    // d'en passant i els comptadors de jugades, perquè dues partides que arriben
    // a la mateixa estructura per ordres diferents han de comparar-se iguals
    // (l'en passant només importaria si hi hagués una captura al pas real, cosa
    // irrellevant per anomenar l'obertura).
    function positionKeyFromFen(fen) {
        if (!fen) return '';
        const parts = String(fen).trim().split(/\s+/);
        return parts.slice(0, 3).join(' ');
    }

    // Construeix un GRAF d'obertures indexat per posició. `fenSeqForMoves` rep
    // una llista de jugades (SAN) i ha de retornar la llista de FEN DESPRÉS de
    // cada jugada (s'injecta perquè el càlcul depèn de chess.js, que no volem
    // dins del nucli pur). Retorna:
    //   byPos:  Map(positionKey -> { eco, name, ply })   posicions amb nom
    //   theory: Map(positionKey -> Set(SAN))             continuacions teòriques
    function buildOpeningPositionGraph(openingsData, fenSeqForMoves, parsePgn) {
        if (!Array.isArray(openingsData) || typeof fenSeqForMoves !== 'function') return null;
        const parse = parsePgn || parsePgnToMoves;
        const byPos = new Map();
        const theory = new Map();
        for (const opening of openingsData) {
            const moves = parse(opening.pgn);
            if (!moves.length) continue;
            let fens;
            try { fens = fenSeqForMoves(moves); } catch (e) { fens = null; }
            if (!fens || !fens.length) continue;
            const n = Math.min(moves.length, fens.length);
            let prevKey = START_POSITION_KEY;
            for (let i = 0; i < n; i++) {
                const key = positionKeyFromFen(fens[i]);
                if (!key) { prevKey = null; break; }
                let nexts = theory.get(prevKey);
                if (!nexts) { nexts = new Set(); theory.set(prevKey, nexts); }
                nexts.add(moves[i]);
                prevKey = key;
            }
            if (!prevKey) continue;
            const ex = byPos.get(prevKey);
            // En cas d'empat de posició (transposició amb noms diferents) ens
            // quedem amb la línia més específica (més jugades).
            if (!ex || n > ex.ply) byPos.set(prevKey, { eco: opening.eco, name: opening.name, ply: n });
        }
        return { byPos, theory };
    }

    // Analitza una partida pel GRAF de posicions. `fenSeq` és la llista de FEN
    // després de cada jugada de la partida; `sanMoves` les jugades en SAN (per
    // poder informar de la jugada de desviació). Retorna el mateix format que
    // analyzeGameOpening: { depth, name, eco, deviationMove, deviationPly,
    // deviationBy, theoryMoves } o null.
    function analyzeGameOpeningByPositions(graph, fenSeq, sanMoves) {
        if (!graph || !Array.isArray(fenSeq) || fenSeq.length === 0) return null;
        const byPos = graph.byPos;
        const theory = graph.theory;
        const keys = fenSeq.map(positionKeyFromFen);
        const moves = Array.isArray(sanMoves) ? sanMoves : [];

        let lastNamed = null;        // posició amb nom més profunda (transposicions incloses)
        let lastNamedPly = 0;
        let contiguousDepth = 0;     // teoria seguida sense interrupció des de l'inici
        let brokeAt = -1;            // primer ply que abandona la teoria contigua

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const known = theory.has(key) || byPos.has(key);
            if (known) {
                if (brokeAt === -1) contiguousDepth = i + 1;
                const named = byPos.get(key);
                if (named) { lastNamed = named; lastNamedPly = i + 1; }
            } else if (brokeAt === -1) {
                brokeAt = i;
            }
        }

        if (!lastNamed) return null;

        const result = {
            depth: Math.max(contiguousDepth, lastNamedPly),
            name: lastNamed.name,
            eco: lastNamed.eco,
            deviationMove: null
        };

        // Només informem de desviació si la partida va abandonar la teoria i no
        // hi va transposar després cap a una obertura amb nom més profunda (en
        // aquest cas s'havia quedat «en llibre» per transposició).
        if (brokeAt !== -1 && brokeAt >= lastNamedPly && contiguousDepth >= 2) {
            const prevDevKey = brokeAt === 0 ? START_POSITION_KEY : keys[brokeAt - 1];
            const nexts = theory.get(prevDevKey);
            result.deviationMove = moves[brokeAt] || null;
            result.deviationPly = brokeAt;
            result.deviationBy = (brokeAt % 2 === 0) ? 'w' : 'b';
            result.theoryMoves = nexts ? Array.from(nexts).slice(0, 3) : [];
        }
        return result;
    }

    // Connexió amb el REPERTORI de l'app: troba quina obertura del repertori
    // (curatedList) ha assolit la partida, identificant-la per POSICIÓ (immune a
    // transposicions). `curatedList` = [{ index, eco, name, keys:[positionKey] }]
    // amb les claus de posició de cada línia del repertori; `gameKeys` = claus de
    // posició de la partida. Retorna la coincidència MÉS PROFUNDA amb almenys
    // `minDepth` plies (per defecte 5, prou per distingir, p. ex., una Catalana
    // d'una Nimzo-Índia, que comparteixen les 4 primeres jugades), o null.
    function findCuratedOpeningByPosition(curatedList, gameKeys, minDepth) {
        if (!Array.isArray(curatedList) || !Array.isArray(gameKeys) || gameKeys.length === 0) return null;
        const min = minDepth || 5;
        const gset = new Set(gameKeys);
        let best = null;
        for (const c of curatedList) {
            const keys = c.keys || [];
            let depth = 0;
            for (let i = 0; i < keys.length; i++) {
                if (gset.has(keys[i])) depth = i + 1; // posició del repertori més profunda assolida
            }
            if (depth >= min && (!best || depth > best.depth)) {
                best = { index: c.index, eco: c.eco, name: c.name, depth: depth };
            }
        }
        return best;
    }

    // Identifica l'obertura del REPERTORI que l'usuari ESTAVA JUGANT, mirant
    // NOMÉS les seves pròpies jugades (ignorant les del rival). Així es reconeix
    // la seva intenció encara que el rival no col·labori (p. ex. l'usuari planteja
    // la Catalana amb blanques i el rival respon ...g6). A més detecta si el rival
    // va ser el PRIMER a sortir de la línia, cosa que vol dir que el canvi
    // d'obertura va ser forçat i no és culpa de l'usuari.
    //
    // `repertoireList` = [{ index, eco, name, userColor:'w'|'b', moves:[SAN...] }]
    // (moves és la línia completa, amb les jugades dels dos colors).
    // Retorna { index, eco, name, userMatch, firstDevPly, firstDevBy,
    // deviationMove, expectedMove, forcedByOpponent } o null.
    function matchUserRepertoireOpening(gameMoves, playerColor, repertoireList, minUserMoves) {
        if (!Array.isArray(gameMoves) || !gameMoves.length || !Array.isArray(repertoireList)) return null;
        const norm = (s) => String(s || '').replace(/[+#!?]/g, '');
        const g = gameMoves.map(norm);
        const parity = playerColor === 'b' ? 1 : 0; // plies on juga l'usuari
        const min = minUserMoves || 3;

        let best = null;
        for (const op of repertoireList) {
            if (op.userColor && playerColor && op.userColor !== playerColor) continue;
            const line = (op.moves || []).map(norm);
            let userMatch = 0;
            for (let i = parity; i < Math.min(line.length, g.length); i += 2) {
                if (line[i] === g[i]) userMatch++; else break; // prefix de jugades PRÒPIES
            }
            if (userMatch >= min && (!best || userMatch > best.userMatch)) {
                best = { index: op.index, eco: op.eco, name: op.name, userMatch: userMatch };
            }
        }
        if (!best) return null;

        // Primera divergència entre la partida i la línia (de qualsevol color).
        const op = repertoireList.find((o) => o.index === best.index);
        const line = (op.moves || []).map(norm);
        let firstDevPly = -1;
        for (let i = 0; i < Math.min(line.length, g.length); i++) {
            if (line[i] !== g[i]) { firstDevPly = i; break; }
        }
        best.firstDevPly = firstDevPly;
        if (firstDevPly >= 0) {
            best.firstDevBy = (firstDevPly % 2 === 0) ? 'w' : 'b';
            best.deviationMove = gameMoves[firstDevPly];           // SAN original (amb +#)
            best.expectedMove = (op.moves || [])[firstDevPly] || null;
            best.forcedByOpponent = best.firstDevBy !== playerColor; // el rival va sortir primer
        } else {
            best.forcedByOpponent = false; // la partida va seguir tota la línia
        }
        return best;
    }

    // Totes les obertures que coincideixen amb la seqüència actual (subarbre).
    function getMatchingOpenings(trie, sequence) {
        if (!trie || sequence.length === 0) return [];
        let node = trie;
        for (const move of sequence) {
            if (!node.children[move]) return [];
            node = node.children[move];
        }
        const openings = [];
        (function collect(n) {
            openings.push(...n.openings);
            for (const child of Object.values(n.children)) collect(child);
        })(node);
        return openings;
    }

    // ----------------------------------------------------------------------
    // Jeroglífics d'OBERTURA (exercicis del repertori ja catalogat)
    // ----------------------------------------------------------------------
    // El jeroglífic de la secció d'Obertures no surt de cap partida ni de cap
    // motor: surt de les línies que l'app ja té catalogades al repertori. Es
    // juga la línia fins al TERCER o QUART moviment de l'usuari i, a partir
    // d'allà, l'exercici demana les jugades teòriques següents (fins a tres),
    // amb les respostes del rival preses de la mateixa línia. Així el jeroglífic
    // d'obertures parla d'obertures, i mai d'una tàctica de mitja partida.

    const OPENING_HIERO_CONFIG = {
        startMoveNumbers: [3, 4], // moviment (no ply) on comença l'exercici
        maxSteps: 3,              // jugades de l'usuari com a màxim
        preferredMinSteps: 2      // si es pot, l'exercici té més d'un pas
    };

    // Ply (0-based dins la llista de jugades) del moviment `moveNumber` del
    // bàndol `color`: 3r moviment de les blanques = ply 4; de les negres = ply 5.
    function openingHieroglyphicStartPly(moveNumber, color) {
        return (Math.max(1, moveNumber) - 1) * 2 + (color === 'b' ? 1 : 0);
    }

    // Identificador estable d'un exercici (per no repetir-lo tot seguit). Les
    // branques porten el seu propi identificador: dues branques de la mateixa
    // obertura comparteixen ECO i nom, i només la línia les distingeix.
    function openingHieroglyphicKey(opening, startMoveNumber) {
        if (!opening) return '';
        if (opening.lineKey) return opening.lineKey;
        return `${opening.eco || '?'}|${opening.name || '?'}|${startMoveNumber}`;
    }

    // Quina IDEA d'obertura encarna una jugada teòrica. No mira el motor: mira
    // la geometria de la jugada, que a l'obertura ja explica la seva funció.
    // Retorna una clau de motiu; app.js hi posa les paraules.
    function classifyOpeningTheoryMove(move) {
        if (!move) return 'development';
        const to = String(move.to || '');
        const file = to[0];
        const rank = Number(to[1]);
        const san = String(move.san || '');
        const flags = String(move.flags || '');
        if (flags.includes('k') || flags.includes('q')) return 'castle';
        if (san.includes('#') || san.includes('+')) return 'check';
        if (move.captured) return 'capture';
        if (move.piece === 'b' && (to === 'b2' || to === 'g2' || to === 'b7' || to === 'g7')) return 'fianchetto';
        if (move.piece === 'p' && (to === 'b3' || to === 'g3' || to === 'b6' || to === 'g6')) return 'fianchetto_prep';
        if (move.piece === 'b' && (to === 'b5' || to === 'g5' || to === 'b4' || to === 'g4')) return 'pin';
        if (move.piece === 'b' && (to === 'c4' || to === 'c5')) return 'bishop_diagonal';
        if (move.piece === 'p' && (file === 'd' || file === 'e') && (rank === 4 || rank === 5)) return 'center_pawn';
        if (move.piece === 'p' && (file === 'c' || file === 'f') && (rank === 4 || rank === 5)) return 'pawn_lever';
        if (move.piece === 'p') return 'pawn_support';
        if (move.piece === 'n') return 'knight_post';
        if (move.piece === 'b') return 'bishop_diagonal';
        if (move.piece === 'q') return 'queen_move';
        if (move.piece === 'r') return 'rook_file';
        return 'development';
    }

    // ----------------------------------------------------------------------
    // BRANQUES: molts més jeroglífics amb el mateix repertori
    // ----------------------------------------------------------------------
    // El repertori catalogat té UNA línia per obertura, i d'aquí en surten un
    // parell d'exercicis escassos. Però l'app ja carrega la base ECO sencera
    // (obertures.js), que és precisament el mapa de les BRANQUES de cada
    // obertura: les rèpliques alternatives del rival i les continuacions més
    // enllà d'on arriba la línia catalogada. Enganxant-les al repertori, cada
    // obertura passa de dos exercicis a desenes, sense escriure cap dada nova.
    //
    // Tot això treballa amb TEXT (SAN), mai amb chess.js: construir tots els
    // exercicis amb el tauler costa un minut llarg, i muntar l'índex de text en
    // costa mil·lisegons. Només l'exercici TRIAT es construeix de debò.

    const OPENING_BRANCH_CONFIG = {
        minAnchorPlies: 4,                     // mínim per identificar l'obertura
        startMoveNumbers: [3, 4, 5, 6, 7, 8],  // moviments on pot arrencar l'exercici
        minSteps: 2                            // un exercici d'una sola jugada és massa prim
    };

    // L'ÀNCORA d'una obertura: el prefix més curt que la distingeix de la resta
    // del repertori. L'Espanyola i la Italiana comparteixen 1.e4 e5 2.Nf3 Nc6, i
    // fins al cinquè o sisè ply no se sap de quina obertura es parla; una branca
    // només és seva si repeteix aquest prefix.
    function openingBranchAnchorPlies(opening, allOpenings, minPlies) {
        const moves = (opening && Array.isArray(opening.moves)) ? opening.moves : [];
        if (!moves.length) return 0;
        const min = Math.max(1, minPlies || OPENING_BRANCH_CONFIG.minAnchorPlies);
        const others = (allOpenings || []).filter(o => o && o !== opening && Array.isArray(o.moves));
        for (let k = Math.min(min, moves.length); k <= moves.length; k++) {
            const prefix = moves.slice(0, k).join(' ');
            if (!others.some(o => o.moves.slice(0, k).join(' ') === prefix)) return k;
        }
        return moves.length;
    }

    // Índex de branques: per cada obertura del repertori, totes les línies ECO
    // que en pengen, retallades a exercicis. `ecoLines` accepta tant
    // {eco, name, moves:[SAN]} com {eco, name, pgn}.
    //
    // Regla de fons: UNA POSICIÓ, UNA RESPOSTA. L'exercici demana una jugada
    // concreta, i si dues branques discrepen sobre què s'hi juga, mana la que
    // avalen més línies ECO (la principal). Sense això, l'usuari podria trobar
    // una jugada de la teoria i que li digués que no.
    function buildOpeningBranchIndex(curatedOpenings, ecoLines, options) {
        const opts = options || {};
        const curated = (Array.isArray(curatedOpenings) ? curatedOpenings : [])
            .filter(o => o && Array.isArray(o.moves) && o.moves.length);
        const byKey = new Map();
        if (!curated.length) return { slots: [], byKey };

        const parse = typeof opts.parsePgn === 'function' ? opts.parsePgn : parsePgnToMoves;
        const lines = (Array.isArray(ecoLines) ? ecoLines : [])
            .map(l => ({
                eco: l && l.eco ? l.eco : null,
                name: l && l.name ? l.name : null,
                moves: (l && Array.isArray(l.moves)) ? l.moves : parse(l && l.pgn)
            }))
            .filter(l => l.moves.length);

        // Nom de cada posició teòrica: la línia ECO que hi arriba exactament.
        // Serveix per titular l'exercici amb la variant real (no amb el nom
        // genèric de l'obertura mare).
        const nameByLine = new Map();
        lines.forEach(l => {
            const k = l.moves.join(' ');
            if (!nameByLine.has(k)) nameByLine.set(k, l);
        });

        const starts = opts.startMoveNumbers || OPENING_BRANCH_CONFIG.startMoveNumbers;
        const maxSteps = opts.maxSteps || OPENING_HIERO_CONFIG.maxSteps;
        const minSteps = opts.minSteps || OPENING_BRANCH_CONFIG.minSteps;

        curated.forEach((op, parentIndex) => {
            const anchor = openingBranchAnchorPlies(op, curated, opts.minAnchorPlies);
            const prefix = op.moves.slice(0, anchor).join(' ');
            const userColor = op.userColor === 'b' ? 'b' : 'w';
            // La línia del repertori és una branca més: la principal.
            const pool = lines.filter(l => l.moves.slice(0, anchor).join(' ') === prefix);
            pool.push({ eco: op.eco || null, name: op.name || null, moves: op.moves, main: true });

            starts.forEach(startMoveNumber => {
                const startPly = openingHieroglyphicStartPly(startMoveNumber, userColor);
                // Per fer `minSteps` passos calen les jugades de l'usuari i les
                // rèpliques que hi van entremig.
                const needed = startPly + (minSteps - 1) * 2 + 1;
                const groups = new Map();
                pool.forEach(l => {
                    if (l.moves.length < needed) return;
                    const setup = l.moves.slice(0, startPly).join(' ');
                    const g = groups.get(setup);
                    if (g) g.push(l); else groups.set(setup, [l]);
                });

                groups.forEach((group, setup) => {
                    const key = `br|${setup}`;
                    // La mateixa posició per transposició des d'una altra
                    // obertura: ja té exercici, i un de sol n'hi ha prou.
                    if (byKey.has(key)) return;

                    const support = new Map();
                    group.forEach(l => {
                        const mv = l.moves[startPly];
                        support.set(mv, (support.get(mv) || 0) + 1);
                    });
                    let bestMove = null;
                    let bestSupport = 0;
                    support.forEach((n, mv) => { if (n > bestSupport) { bestSupport = n; bestMove = mv; } });

                    // Entre les línies que juguen la jugada principal, la més
                    // llarga dona l'exercici més ric; la del repertori mana en
                    // cas d'empat (és la que porta les frases pedagògiques).
                    const withBest = group.filter(l => l.moves[startPly] === bestMove);
                    withBest.sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0) || b.moves.length - a.moves.length);
                    const chosen = withBest[0];
                    const moves = chosen.moves.slice(0, Math.min(chosen.moves.length, startPly + maxSteps * 2 - 1));

                    // Variant concreta: «Catalana» és el gènere, «Catalan
                    // Opening: Closed» és de què va AQUEST exercici. La que es
                    // pot ensenyar és la de la posició de partida, i mai una
                    // d'abans de l'àncora: allà la posició encara no ha
                    // declarat de quina obertura és, i dir-ne «Indian Defense»
                    // sota el títol «Obertura Catalana» només confondria.
                    let named = null;
                    for (let n = startPly; n >= anchor; n--) {
                        const hit = nameByLine.get(moves.slice(0, n).join(' '));
                        if (hit) { named = hit; break; }
                    }
                    // La del final de la línia sovint porta el nom de la jugada
                    // que s'ha de trobar («Exchange Variation» ja diu que la
                    // solució és una captura): es guarda per revelar-la NOMÉS
                    // quan l'exercici estigui resolt.
                    let solvedName = null;
                    for (let n = moves.length; n > Math.max(startPly, anchor - 1); n--) {
                        const hit = nameByLine.get(moves.slice(0, n).join(' '));
                        if (hit) { solvedName = hit; break; }
                    }

                    // Les frases del repertori estan lligades al ply de la seva
                    // línia: només valen mentre la branca hi coincideixi.
                    let movePhrases = null;
                    if (Array.isArray(op.movePhrases)) {
                        let common = 0;
                        while (common < moves.length && moves[common] === op.moves[common]) common++;
                        movePhrases = op.movePhrases.slice(0, common);
                    }

                    byKey.set(key, {
                        key,
                        parentIndex,
                        parentName: op.name || null,
                        parentEco: op.eco || null,
                        eco: (named && named.eco) || op.eco || chosen.eco || null,
                        name: op.name || (named && named.name) || 'Obertura',
                        variation: (named && named.name && named.name !== op.name) ? named.name : null,
                        solvedVariation: (solvedName && solvedName.name && solvedName.name !== (named && named.name)) ? solvedName.name : null,
                        solvedEco: (solvedName && solvedName.eco) || null,
                        idea: op.idea || null,
                        userColor,
                        startMoveNumber,
                        moves,
                        movePhrases,
                        support: bestSupport,
                        alternatives: support.size,
                        main: !!chosen.main
                    });
                });
            });
        });

        return { slots: Array.from(byKey.values()), byKey };
    }

    // Tria una branca de l'índex: evita les últimes vistes i, si pot, canvia
    // d'obertura respecte de l'exercici anterior (dues branques seguides de la
    // mateixa obertura fan sensació de no avançar).
    function pickOpeningBranchSlot(index, options) {
        const opts = options || {};
        const slots = (index && Array.isArray(index.slots)) ? index.slots : [];
        if (!slots.length) return null;
        const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;

        let pool = slots;
        if (opts.userColor) {
            const byColor = pool.filter(s => s.userColor === opts.userColor);
            if (byColor.length) pool = byColor;
        }
        if (Array.isArray(opts.startMoveNumbers) && opts.startMoveNumbers.length) {
            const allow = new Set(opts.startMoveNumbers);
            const narrowed = pool.filter(s => allow.has(s.startMoveNumber));
            if (narrowed.length) pool = narrowed;
        }

        const recentKeys = opts.recentKeys || [];
        const recent = new Set(recentKeys);
        const fresh = pool.filter(s => !recent.has(s.key));
        let finalPool = fresh.length ? fresh : pool;

        const recentParents = new Set();
        recentKeys.forEach(k => {
            const s = (index && index.byKey) ? index.byKey.get(k) : null;
            if (s) recentParents.add(s.parentIndex);
        });
        if (recentParents.size) {
            const varied = finalPool.filter(s => !recentParents.has(s.parentIndex));
            if (varied.length) finalPool = varied;
        }

        const idx = Math.floor(rng() * finalPool.length) % finalPool.length;
        return finalPool[Math.max(0, idx)] || finalPool[0];
    }

    function createOpeningHieroglyphicHelpers(ChessCtor) {
        // Converteix una entrada del repertori ({name, eco, idea, moves:[SAN],
        // userColor, movePhrases}) en un exercici que arrenca al moviment
        // `startMoveNumber`. Retorna null si la línia no hi arriba o si alguna
        // jugada no és legal (dada mal escrita: millor descartar-la que jugar-la).
        function buildOpeningHieroglyphic(opening, options) {
            const opts = options || {};
            if (!opening || !Array.isArray(opening.moves) || !opening.moves.length) return null;
            const userColor = opening.userColor === 'b' ? 'b' : 'w';
            const startMoveNumber = opts.startMoveNumber || OPENING_HIERO_CONFIG.startMoveNumbers[0];
            const maxSteps = opts.maxSteps || OPENING_HIERO_CONFIG.maxSteps;
            const startPly = openingHieroglyphicStartPly(startMoveNumber, userColor);
            const line = opening.moves;
            if (startPly >= line.length) return null;

            let chess;
            try { chess = new ChessCtor(); } catch (e) { return null; }

            // 1) Es juga la línia fins a la posició de partida de l'exercici. La
            //    darrera jugada d'aquesta seqüència és sempre del rival: es
            //    guarda per poder-la marcar al tauler com a última jugada seva.
            const setupSan = [];
            let lastSetupMove = null;
            for (let i = 0; i < startPly; i++) {
                let mv = null;
                try { mv = chess.move(line[i], { sloppy: true }); } catch (e) { mv = null; }
                if (!mv) return null;
                setupSan.push(mv.san);
                lastSetupMove = { from: mv.from, to: mv.to, san: mv.san, color: mv.color };
            }
            if (chess.turn() !== userColor) return null;
            const fen = chess.fen();

            // 2) A partir d'aquí, les jugades de l'usuari són la solució i les
            //    del rival, la rèplica. Un pas sense rèplica tanca l'exercici.
            const steps = [];
            const solutionSan = [];
            const solutionMoves = [];
            const replySan = [];
            const replyMoves = [];
            for (let step = 0; step < maxSteps; step++) {
                const ply = startPly + step * 2;
                if (ply >= line.length) break;
                const fenBefore = chess.fen();
                let mv = null;
                try { mv = chess.move(line[ply], { sloppy: true }); } catch (e) { mv = null; }
                if (!mv) break;
                const uci = `${mv.from}${mv.to}${mv.promotion || ''}`;
                solutionSan.push(mv.san);
                solutionMoves.push(uci);
                steps.push({
                    ply,
                    fen: fenBefore,
                    san: mv.san,
                    uci,
                    piece: mv.piece,
                    from: mv.from,
                    to: mv.to,
                    motif: classifyOpeningTheoryMove(mv),
                    phrase: Array.isArray(opening.movePhrases) ? (opening.movePhrases[ply] || null) : null
                });
                if (step === maxSteps - 1) break;
                const replyPly = ply + 1;
                if (replyPly >= line.length) break;
                let reply = null;
                try { reply = chess.move(line[replyPly], { sloppy: true }); } catch (e) { reply = null; }
                if (!reply) break; // sense resposta no hi pot haver pas següent
                replySan.push(reply.san);
                replyMoves.push(`${reply.from}${reply.to}${reply.promotion || ''}`);
            }
            if (!solutionMoves.length) return null;
            // Les rèpliques sobreres (l'última jugada de la solució no en necessita).
            const usableReplies = Math.max(0, solutionMoves.length - 1);

            return {
                key: openingHieroglyphicKey(opening, startMoveNumber),
                eco: opening.eco || null,
                name: opening.name || 'Obertura',
                idea: opening.idea || null,
                userColor,
                startMoveNumber,
                startPly,
                fen,
                setupSan,
                lastSetupMove,
                solutionSan,
                solutionMoves,
                replySan: replySan.slice(0, usableReplies),
                replyMoves: replyMoves.slice(0, usableReplies),
                bestMove: solutionMoves[0],
                bestMoveSan: solutionSan[0],
                motif: steps[0] ? steps[0].motif : 'development',
                steps,
                lineSan: line.slice()
            };
        }

        // Tots els exercicis possibles del repertori (una obertura pot donar-ne
        // un pel 3r moviment i un altre pel 4t).
        function openingHieroglyphicCandidates(openings, options) {
            const opts = options || {};
            const starts = opts.startMoveNumbers || OPENING_HIERO_CONFIG.startMoveNumbers;
            const out = [];
            (openings || []).forEach(op => {
                if (opts.userColor && (op.userColor === 'b' ? 'b' : 'w') !== opts.userColor) return;
                starts.forEach(startMoveNumber => {
                    const puzzle = buildOpeningHieroglyphic(op, { startMoveNumber, maxSteps: opts.maxSteps });
                    if (puzzle) out.push(puzzle);
                });
            });
            return out;
        }

        // Tria un exercici: evita els últims jugats i, si pot, en dona un de més
        // d'un pas (un jeroglífic d'una sola jugada és massa curt).
        function pickOpeningHieroglyphic(openings, options) {
            const opts = options || {};
            const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
            const recent = new Set(opts.recentKeys || []);
            const all = openingHieroglyphicCandidates(openings, opts);
            if (!all.length) return null;
            const fresh = all.filter(p => !recent.has(p.key));
            const pool = fresh.length ? fresh : all;
            const minSteps = opts.preferredMinSteps || OPENING_HIERO_CONFIG.preferredMinSteps;
            const rich = pool.filter(p => p.solutionMoves.length >= minSteps);
            const finalPool = rich.length ? rich : pool;
            const idx = Math.floor(rng() * finalPool.length) % finalPool.length;
            return finalPool[Math.max(0, idx)] || finalPool[0];
        }

        // Converteix una branca de l'índex en exercici de debò. Retorna null si
        // la línia no és legal o si queda massa curta: qui truca ha de poder
        // provar-ne una altra en comptes de deixar l'usuari sense exercici.
        function buildOpeningHieroglyphicFromSlot(slot, options) {
            if (!slot || !Array.isArray(slot.moves) || !slot.moves.length) return null;
            const opts = options || {};
            const puzzle = buildOpeningHieroglyphic({
                eco: slot.eco,
                name: slot.name,
                idea: slot.idea,
                userColor: slot.userColor,
                moves: slot.moves,
                movePhrases: slot.movePhrases,
                lineKey: slot.key
            }, { startMoveNumber: slot.startMoveNumber, maxSteps: opts.maxSteps });
            if (!puzzle) return null;
            const minSteps = opts.minSteps || OPENING_BRANCH_CONFIG.minSteps;
            if (puzzle.solutionMoves.length < minSteps) return null;
            puzzle.variation = slot.variation || null;
            puzzle.solvedVariation = slot.solvedVariation || null;
            puzzle.solvedEco = slot.solvedEco || null;
            puzzle.parentName = slot.parentName || null;
            puzzle.isBranch = !slot.main;
            puzzle.support = slot.support || 0;
            return puzzle;
        }

        // Tria una branca i la construeix. Si la línia triada resultés il·legal
        // (dada dolenta a la base ECO), en prova una altra.
        function pickOpeningBranchHieroglyphic(index, options) {
            const opts = options || {};
            const recentKeys = (opts.recentKeys || []).slice();
            const tried = [];
            for (let attempt = 0; attempt < 8; attempt++) {
                const pickOpts = Object.assign({}, opts, { recentKeys: recentKeys.concat(tried) });
                const slot = pickOpeningBranchSlot(index, pickOpts);
                if (!slot || tried.indexOf(slot.key) !== -1) break;
                tried.push(slot.key);
                const puzzle = buildOpeningHieroglyphicFromSlot(slot, opts);
                if (puzzle) return puzzle;
            }
            return null;
        }

        return {
            buildOpeningHieroglyphic,
            openingHieroglyphicCandidates,
            pickOpeningHieroglyphic,
            buildOpeningHieroglyphicFromSlot,
            pickOpeningBranchHieroglyphic
        };
    }

    // ----------------------------------------------------------------------
    // Ajust continu d'ELO (joc lliure) i fites
    // ----------------------------------------------------------------------

    // Limita l'ELO d'usuari amb un terra FLEXIBLE: no pot baixar de 45% del terra
    // de calibratge (ni del mínim global), ni pujar del màxim.
    function clampUserElo(value, floor, eloMin, eloMax) {
        const baseFloor = typeof floor === 'number' ? floor : eloMin;
        const flexibleFloor = Math.max(eloMin, baseFloor * 0.45);
        const minValue = Number.isFinite(flexibleFloor) ? flexibleFloor : eloMin;
        return Math.round(Math.max(minValue, Math.min(eloMax, value)));
    }

    // Ajust fi d'ELO segons el resultat d'una partida i la seva qualitat.
    function getBaselineAdjustmentDelta(resultLabel, qualityScore) {
        if (resultLabel === 'win') return qualityScore >= 0.65 ? 10 : 6;
        if (resultLabel === 'loss') return qualityScore >= 0.6 ? -10 : -18;
        return 0;
    }

    // Fites d'ELO superades en passar de previousElo a newElo que encara no
    // estaven desbloquejades. Funció pura: no muta la llista rebuda.
    function getNewlyUnlockedMilestones(previousElo, newElo, milestones, alreadyUnlocked) {
        const already = alreadyUnlocked || [];
        const unlocked = [];
        (milestones || []).forEach(milestone => {
            if (previousElo < milestone && newElo >= milestone && !already.includes(milestone)) {
                unlocked.push(milestone);
            }
        });
        return unlocked;
    }

    // ----------------------------------------------------------------------
    // Calibratge inicial (cerca adaptativa del nivell)
    // ----------------------------------------------------------------------

    function clampCalibrationRoc(roc, rocMin, rocMax) {
        return Math.max(rocMin, Math.min(rocMax, Math.round(roc)));
    }

    // ROC del proper rival de calibratge: parteix del ROC inicial i adapta segons
    // el resultat de l'última partida (guanya → puja; perd → baixa; taules → puja
    // poc) amb passos decreixents per convergir cap al nivell real.
    function getCalibrationOpponentRoc(games, config) {
        const list = Array.isArray(games) ? games : [];
        const clampRoc = (roc) => clampCalibrationRoc(roc, config.rocMin, config.rocMax);
        if (!list.length) return clampRoc(config.startRoc);

        const last = list[list.length - 1];
        let roc = typeof last.opponentElo === 'number' ? last.opponentElo : config.startRoc;
        const stepIdx = Math.min(list.length - 1, config.steps.length - 1);
        const step = config.steps[stepIdx];

        if (last.result === 'win') roc += step;            // ha guanyat → rival més fort
        else if (last.result === 'loss') roc -= step;      // ha perdut → rival més fluix
        else roc += Math.round(step * 0.2);                // taules → ajust petit a l'alça

        return clampRoc(roc);
    }

    // Qualitat (0..1) d'una partida de calibratge a partir de pèrdua, precisió i blunders.
    function getCalibrationGameQuality(game) {
        const avgLoss = typeof game.avgCpLoss === 'number' ? game.avgCpLoss : 180;
        const precisionScore = typeof game.precision === 'number' ? game.precision / 100 : 0.4;
        const lossScore = 1 - Math.min(avgLoss, 300) / 300;
        const blunderPenalty = Math.min(0.3, (game.blunders || 0) * 0.05);
        return Math.max(0, Math.min(1, (lossScore * 0.6) + (precisionScore * 0.4) - blunderPenalty));
    }

    // Rendiment global de calibratge (0..1): combina resultat (60%) i qualitat (40%).
    function getCalibrationPerformanceScore(games) {
        if (!games || !games.length) return 0.5;
        const total = games.reduce((sum, game) => {
            const resultScore = game.result === 'win' ? 1 : game.result === 'loss' ? 0 : 0.5;
            const quality = getCalibrationGameQuality(game);
            return sum + (quality * 0.4) + (resultScore * 0.6);
        }, 0);
        return total / games.length;
    }

    // ----------------------------------------------------------------------
    // Exercicis de "millor línia" (3 jugades fixades): matemàtica del filtre de
    // qualitat "clarament millor". Una avaluació {eval, evalType} es converteix
    // en una puntuació comparable (perspectiva del costat que mou; com més alt,
    // millor) i el gap entre la 1a i la 2a opció decideix si el pas és "net".
    // ----------------------------------------------------------------------

    // Converteix {eval, evalType} en un nombre comparable. El mat sempre domina
    // qualsevol cp; un mat més curt val més que un de més llarg.
    function bestLineEvalScore(e) {
        if (!e || typeof e.eval !== 'number') return null;
        if (e.evalType === 'mate') {
            const n = Math.abs(e.eval);
            const magnitude = 100000 - n * 100; // mat en 1 > mat en 8
            return e.eval >= 0 ? magnitude : -magnitude;
        }
        return e.eval; // centipawns, perspectiva del costat que mou
    }

    // Gap (en cp comparables) entre la millor opció i la segona d'una llista
    // d'alternatives ordenades (multipv 1, 2, ...). Si només n'hi ha una opció
    // (jugada forçada), retorna Infinity. Si no es pot calcular, retorna null.
    function bestLineGapCp(alternatives) {
        if (!Array.isArray(alternatives) || !alternatives.length) return null;
        const best = bestLineEvalScore(alternatives[0]);
        if (best === null) return null;
        if (alternatives.length < 2) return Infinity; // només una jugada bona
        const second = bestLineEvalScore(alternatives[1]);
        if (second === null) return Infinity;
        return best - second;
    }

    // El pas és "clarament millor" si el gap arriba al llindar (o és forçat).
    function bestLineStepQualifies(alternatives, gapCp) {
        const gap = bestLineGapCp(alternatives);
        if (gap === null) return false;
        return gap >= (typeof gapCp === 'number' ? gapCp : 150);
    }

    // ----------------------------------------------------------------------
    // Jeroglífics / puzzles tàctics (lògica PURA i testable). Cada puzzle són
    // 3 jugades del jugador amb respostes del rival entremig; aquí viu tota la
    // decisió (criteris d'acceptació, dificultat, explicació, validació pas a
    // pas, dedup). La part de Stockfish i SAN viu a app.js.
    // ----------------------------------------------------------------------
    const PUZZLE_THEME_LABELS = {
        mate: 'un mat', double_attack: 'un atac doble', fork: 'una forquilla',
        pin: 'una clavada', discovery: 'una descoberta', deflection: 'una desviació',
        attraction: 'una atracció', overload: 'una peça sobrecarregada',
        king_attack: 'un atac al rei', material: 'un guany de material',
        endgame_tactic: 'una tàctica de final', sacrifice: 'un sacrifici'
    };

    // Clau de FEN per a duplicats: només posició, torn, enroc i en passant
    // (s'ignoren els comptadors de jugada).
    function puzzleFenKey(fen) {
        return String(fen || '').split(' ').slice(0, 4).join(' ');
    }
    function puzzleIsDuplicateFen(existing, fen) {
        const key = puzzleFenKey(fen);
        if (!key || !Array.isArray(existing)) return false;
        return existing.some(p => p && puzzleFenKey(p.fen) === key);
    }

    // Criteris mínims per ACCEPTAR un puzzle: 3 jugades del jugador, la millor
    // clarament superior (marge ≥ minMargin) o mat, i final decisiu.
    function puzzleMeetsCriteria(p, cfg) {
        if (!p) return false;
        const c = cfg || {};
        const minMargin = typeof c.minMargin === 'number' ? c.minMargin : 150;
        const decisiveCp = typeof c.decisiveCp === 'number' ? c.decisiveCp : 500;
        if (!Array.isArray(p.solutionUci) || p.solutionUci.length !== 3) return false;
        const marginOk = p.endsInMate || p.bestMoveMargin === Infinity ||
            (typeof p.bestMoveMargin === 'number' && p.bestMoveMargin >= minMargin);
        if (!marginOk) return false;
        if (!p.endsInMate) {
            const fe = typeof p.finalEval === 'number' ? Math.abs(p.finalEval) : 0;
            if (fe < decisiveCp) return false; // ha d'acabar amb avantatge decisiu
        }
        // Filtre opcional de FINAL TÀCTIC: si es demanen motius concrets, el
        // puzzle ha de portar un finalMotif permès i amb confiança no baixa.
        if (Array.isArray(c.requiredFinalMotifs)) {
            if (!p.finalMotif || p.finalMotif === 'none') return false;
            if (c.requiredFinalMotifs.indexOf(p.finalMotif) === -1) return false;
            if (p.finalMotifConfidence === 'low') return false;
        }
        return true;
    }

    function puzzleDifficulty(p) {
        if (!p) return 'mitja';
        const themes = Array.isArray(p.theme) ? p.theme : [];
        const len = Array.isArray(p.solutionUci) ? p.solutionUci.length : 3;
        if (themes.includes('sacrifice')) return 'molt_dificil';
        if (p.firstMoveQuiet) return 'dificil'; // primera jugada silenciosa (ni escac ni captura)
        if (p.endsInMate && len <= 2) return 'facil';
        if ((themes.includes('mate') || themes.includes('material')) && (p.firstMoveIsCheck || p.firstMoveIsCapture) && len <= 3) return 'facil';
        return 'mitja';
    }

    function puzzleRatingEstimate(p) {
        const base = { facil: 900, mitja: 1300, dificil: 1700, molt_dificil: 2100 };
        let r = base[puzzleDifficulty(p)] || 1300;
        if (p && p.firstMoveQuiet) r += 100;
        if (p && Array.isArray(p.theme) && p.theme.includes('sacrifice')) r += 100;
        return r;
    }

    function puzzleExplanation(p) {
        const themes = (p && Array.isArray(p.theme)) ? p.theme : [];
        if (themes.includes('mate')) return 'La seqüència porta a un escac i mat forçat: cada jugada limita el rei rival fins que no té escapatòria.';
        if (themes.includes('deflection')) return 'Primer cal desviar el defensor clau; el rival queda obligat a respondre i la jugada final guanya material de manera decisiva.';
        if (themes.includes('fork') || themes.includes('double_attack')) return 'Una sola jugada amenaça dues coses alhora: el rival no les pot defensar totes i caurà material.';
        if (themes.includes('pin')) return 'Aprofita la clavada: la peça rival no es pot moure sense perdre el que protegeix al darrere.';
        if (themes.includes('discovery')) return 'En moure una peça en destapes una altra que ataca amb força: és una descoberta decisiva.';
        if (themes.includes('sacrifice')) return 'Un sacrifici correcte obre les defenses; la compensació arriba en les jugades següents.';
        if (themes.includes('king_attack')) return "L'atac al rei rival és decisiu: les jugades forcen la defensa fins a guanyar.";
        if (themes.includes('material')) return 'La combinació guanya material net de manera forçada.';
        return 'Una seqüència forçada de tres jugades que aprofita un error del rival per obtenir un avantatge decisiu.';
    }

    // Pista per nivells: 1 → tema, 2 → peça, 3 → casella/SAN.
    function puzzleHint(p, level, ctx) {
        const c = ctx || {};
        const themes = (p && Array.isArray(p.theme)) ? p.theme : [];
        if (level <= 1) return `Busca ${themes[0] ? (PUZZLE_THEME_LABELS[themes[0]] || 'una jugada forta') : 'una jugada forta'}.`;
        if (level === 2) return c.pieceName ? `Mou ${c.pieceName}.` : 'Mira quina peça pot fer la jugada clau.';
        return c.san ? `La jugada és ${c.san}.` : (c.toSquare ? `Una peça ha d'anar a ${c.toSquare}.` : 'Mira la millor jugada.');
    }

    // Màquina d'estats pura per validar la solució pas a pas.
    function puzzleInitPlay(puzzle) {
        return {
            solutionUci: (puzzle && puzzle.solutionUci) || [],
            repliesUci: (puzzle && puzzle.engineRepliesUci) || [],
            step: 0,
            solved: false
        };
    }
    function puzzleSubmitMove(state, uci) {
        const s = state || {};
        const sol = s.solutionUci || [];
        const expected = sol[s.step];
        if (!expected) return Object.assign({}, s, { result: 'solved', solved: true, reply: null });
        if (uci !== expected) return Object.assign({}, s, { result: 'incorrect' }); // NO avança de pas
        const nextStep = (s.step || 0) + 1;
        const solved = nextStep >= sol.length;
        const reply = solved ? null : ((s.repliesUci || [])[s.step] || null);
        return Object.assign({}, s, { step: nextStep, solved, reply, result: solved ? 'solved' : 'correct' });
    }

    // ----------------------------------------------------------------------
    // Rotació del banc de tàctiques: una posició resolta no es torna a servir
    // fins haver completat la resta del banc.
    // ----------------------------------------------------------------------
    // Candidates del cicle actual: les posicions del banc encara no resoltes.
    // Si les dades de recents són inconsistents (p. ex. el banc ha canviat en
    // una actualització i ja les cobreix totes), es torna el banc sencer.
    function tacticsPickPool(bank, recentFens) {
        const bankList = Array.isArray(bank) ? bank.filter(Boolean) : [];
        if (!bankList.length) return [];
        const recent = new Set(Array.isArray(recentFens) ? recentFens : []);
        const pool = bankList.filter(f => !recent.has(f));
        return pool.length ? pool : bankList.slice();
    }

    // Registra una posició resolta i retorna la nova llista de recents. Quan el
    // cicle cobreix tot el banc, es reinicia conservant només l'última resolta
    // perquè no pugui tornar a sortir immediatament.
    function tacticsRecordSolved(bank, recentFens, fen) {
        const prev = Array.isArray(recentFens) ? recentFens.filter(f => f && f !== fen) : [];
        if (!fen) return prev;
        const recent = prev.concat([fen]);
        const bankList = Array.isArray(bank) ? bank.filter(Boolean) : [];
        const covered = bankList.length > 0 && bankList.every(f => recent.includes(f));
        return covered ? [fen] : recent;
    }

    // ----------------------------------------------------------------------
    // Seqüència d'exercici a partir d'una línia ja verificada (sense motor).
    // ----------------------------------------------------------------------
    // El reproductor d'exercicis (bundle) consumeix sempre la mateixa forma:
    // step1/step2/step3 per a les jugades del jugador, opponentMove/opponentMove2
    // per a les rèpliques fixes del rival, i la línia sencera en UCI i SAN.
    // Aquí es construeix aquesta forma només amb chess.js, a partir d'una línia
    // que ja s'ha calculat abans (rebost estàtic del banc de tàctiques, PV desada
    // d'una errada pròpia...). Així un exercici es pot servir a l'instant encara
    // que el motor no arrenqui o no respongui.
    //
    // La línia s'espera alternada: [jugador, rival, jugador, rival, jugador].
    // Es talla sola quan la posició s'acaba (mat o taules), de manera que una
    // línia d'un sol moviment dona un exercici d'un sol pas — el cas dels mats
    // en 1 del banc, que amb tres passos obligatoris no es podien preparar mai.
    function createBundleSequenceHelpers(ChessCtor) {
        if (typeof ChessCtor !== 'function') return null;

        function applyUci(game, uci) {
            const raw = String(uci || '').trim().toLowerCase();
            if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(raw)) return null;
            try {
                return game.move({
                    from: raw.slice(0, 2),
                    to: raw.slice(2, 4),
                    promotion: raw.length > 4 ? raw[4] : undefined
                }) || null;
            } catch (e) { return null; }
        }

        function buildSequenceFromLine(fen, line, opts) {
            const options = opts || {};
            const maxPlayerMoves = Math.min(3, Math.max(1, options.maxPlayerMoves || 3));
            const stepMeta = Array.isArray(options.stepMeta) ? options.stepMeta : [];
            const replyMeta = Array.isArray(options.replyMeta) ? options.replyMeta : [];
            const moves = Array.isArray(line) ? line.filter(Boolean) : [];
            if (!fen || !moves.length) return null;

            let game;
            try { game = new ChessCtor(fen); } catch (e) { return null; }
            if (!game || typeof game.moves !== 'function') return null;

            const steps = [];
            const replies = [];
            const fullSequence = [];
            const fullSequenceSan = [];

            for (let i = 0; i < moves.length; i++) {
                const isPlayerMove = (i % 2 === 0);
                if (isPlayerMove && steps.length >= maxPlayerMoves) break;
                const before = game.fen();
                const mv = applyUci(game, moves[i]);
                if (!mv) break;
                fullSequence.push(moves[i]);
                fullSequenceSan.push(mv.san);
                if (isPlayerMove) steps.push({ fen: before, uci: moves[i], san: mv.san });
                else replies.push({ fen: before, uci: moves[i], san: mv.san });
                if (game.game_over()) break;
            }

            if (!steps.length) return null;
            // Cada pas del jugador (llevat de l'últim) necessita la rèplica fixa del
            // rival: sense ella el reproductor no pot avançar de pas.
            const totalSteps = Math.min(steps.length, replies.length + 1);
            steps.length = totalSteps;
            replies.length = Math.max(0, totalSteps - 1);
            const plies = totalSteps + replies.length;
            fullSequence.length = Math.min(fullSequence.length, plies);
            fullSequenceSan.length = Math.min(fullSequenceSan.length, plies);

            const seq = {
                initialFen: fen,
                totalSteps,
                fullSequence,
                fullSequenceSan
            };
            steps.forEach((s, idx) => {
                seq['step' + (idx + 1)] = Object.assign({
                    fen: s.fen,
                    playerMove: s.uci,
                    playerMoveSan: s.san,
                    playerMovePv: [],
                    alternatives: []
                }, stepMeta[idx] || {});
            });
            replies.forEach((r, idx) => {
                const key = idx === 0 ? 'opponentMove' : 'opponentMove' + (idx + 1);
                seq[key] = Object.assign({
                    fen: r.fen,
                    move: r.uci,
                    moveSan: r.san,
                    eval: 0
                }, replyMeta[idx] || {});
            });
            return seq;
        }

        return { buildSequenceFromLine };
    }

    // ----------------------------------------------------------------------
    // EL TEU BESSÓ — un rival que juga com tu (lògica PURA i testable).
    // El perfil surt de les partides pròpies: obertures reals (llibre personal
    // indexat per posició), qualitat per fase (obertura / mig joc / final) i,
    // si hi ha prou historial d'ELO, una versió del passat per mesurar el
    // progrés jugant-hi en contra. La part de Stockfish i de UI viu a app.js.
    // ----------------------------------------------------------------------
    const BESSO_CONFIG = {
        minGames: 3,          // partides pròpies necessàries per construir el bessó
        bookMaxPlies: 16,     // profunditat màxima del llibre personal (semijugades)
        pastMinDays: 21,      // antiguitat mínima perquè existeixi el "jo del passat"
        openingMaxPly: 19,    // fins a la 10a jugada és fase d'obertura
        endgameMaxPieces: 12, // amb 12 peces o menys és final
        phaseMinSamples: 8,   // jugades revisades mínimes per ajustar una fase
        phaseDeltaCpToElo: 1.2,   // conversió (cp de pèrdua) → punts d'ELO de la fase
        phaseDeltaMaxElo: 120     // límit de l'ajust per fase
    };

    function bessoPieceCountFromFen(fen) {
        const boardPart = String(fen || '').split(' ')[0];
        return (boardPart.match(/[a-zA-Z]/g) || []).length;
    }

    // Fase de la posició: obertura per número de jugada, final per material.
    function bessoPhaseOfPosition(fen, ply) {
        if ((typeof ply === 'number' ? ply : 0) <= BESSO_CONFIG.openingMaxPly) return 'opening';
        return bessoPieceCountFromFen(fen) <= BESSO_CONFIG.endgameMaxPieces ? 'endgame' : 'middlegame';
    }

    // Partides vàlides per construir el bessó: amb jugades i color del jugador.
    function bessoEligibleGames(entries) {
        return (Array.isArray(entries) ? entries : []).filter(e =>
            e && Array.isArray(e.moves) && e.moves.length >= 4
            && (e.playerColor === 'w' || e.playerColor === 'b'));
    }

    // Color amb què el jugador té més partides: el bessó jugarà amb aquest
    // color, de manera que l'usuari s'enfronti al seu propi repertori.
    function bessoDominantColor(entries) {
        let w = 0, b = 0;
        bessoEligibleGames(entries).forEach(e => { if (e.playerColor === 'b') b++; else w++; });
        return b > w ? 'b' : 'w';
    }

    const BESSO_PHASES = ['opening', 'middlegame', 'endgame'];

    function bessoEmptyPhaseStats() {
        return {
            opening: { loss: 0, n: 0 },
            middlegame: { loss: 0, n: 0 },
            endgame: { loss: 0, n: 0 }
        };
    }

    // Resum per fases d'UNA partida: sis números (pèrdua acumulada i jugades
    // comptades per fase) que surten de les revisions de les jugades pròpies.
    // Es calcula un sol cop, en acabar la partida, i es desa a l'índex lleuger
    // de l'historial: així el perfil pot mirar centenars de partides sense
    // haver de guardar-ne (ni carregar-ne) totes les revisions.
    function bessoPhaseStatsFromGame(entry) {
        const acc = bessoEmptyPhaseStats();
        if (!entry) return acc;
        (Array.isArray(entry.moveReviews) ? entry.moveReviews : []).forEach(r => {
            if (!r || r.color !== entry.playerColor) return;
            const moveNumber = +r.moveNumber || 0;
            const ply = Math.max(0, (moveNumber - 1) * 2);
            const phase = r.fen
                ? bessoPhaseOfPosition(r.fen, ply)
                : (moveNumber <= 10 ? 'opening' : 'middlegame');
            acc[phase].loss += Math.max(0, Math.min(900, +r.swing || 0));
            acc[phase].n += 1;
        });
        return acc;
    }

    // Resum per fases d'una partida: el desat si n'hi ha (partides que ja no
    // porten les revisions a la memòria), o calculat al vol si no.
    function bessoGamePhaseStats(entry) {
        const stored = entry && entry.phaseStats;
        const usable = stored && typeof stored === 'object'
            && BESSO_PHASES.every(p => stored[p] && typeof stored[p].n === 'number');
        if (!usable) return bessoPhaseStatsFromGame(entry);
        const acc = bessoEmptyPhaseStats();
        BESSO_PHASES.forEach(p => {
            acc[p].loss = Math.max(0, +stored[p].loss || 0);
            acc[p].n = Math.max(0, +stored[p].n || 0);
        });
        return acc;
    }

    // Perfil de qualitat per fases a partir de les revisions de jugades pròpies:
    // una fase jugada PITJOR que la mitjana dona un delta d'ELO negatiu (el bessó
    // hi jugarà més fluix, com tu), i una fase forta el dona positiu.
    function bessoProfileFromGames(entries) {
        const games = bessoEligibleGames(entries);
        const acc = bessoEmptyPhaseStats();
        games.forEach(e => {
            const stats = bessoGamePhaseStats(e);
            BESSO_PHASES.forEach(p => {
                acc[p].loss += stats[p].loss;
                acc[p].n += stats[p].n;
            });
        });
        const totalN = acc.opening.n + acc.middlegame.n + acc.endgame.n;
        const totalLoss = acc.opening.loss + acc.middlegame.loss + acc.endgame.loss;
        const avg = totalN ? totalLoss / totalN : 0;
        const deltaFor = (phase) => {
            const a = acc[phase];
            if (!totalN || a.n < BESSO_CONFIG.phaseMinSamples) return 0;
            const phaseAvg = a.loss / a.n;
            const d = Math.round((avg - phaseAvg) * BESSO_CONFIG.phaseDeltaCpToElo);
            return Math.max(-BESSO_CONFIG.phaseDeltaMaxElo, Math.min(BESSO_CONFIG.phaseDeltaMaxElo, d));
        };
        return {
            games: games.length,
            reviewedMoves: totalN,
            avgCpLoss: Math.round(avg),
            phaseEloDelta: {
                opening: deltaFor('opening'),
                middlegame: deltaFor('middlegame'),
                endgame: deltaFor('endgame')
            },
            phaseSamples: {
                opening: acc.opening.n,
                middlegame: acc.middlegame.n,
                endgame: acc.endgame.n
            }
        };
    }

    // Força del bessó en una fase: el seu ELO base més el desnivell de la fase.
    function bessoPhaseElo(baseElo, profile, phase) {
        const base = typeof baseElo === 'number' ? baseElo : 0;
        const delta = (profile && profile.phaseEloDelta && typeof profile.phaseEloDelta[phase] === 'number')
            ? profile.phaseEloDelta[phase] : 0;
        return Math.round(base + delta);
    }

    function bessoDaysAgoLabel(days) {
        const d = Math.max(1, Math.round(days || 0));
        if (d >= 365) { const y = Math.round(d / 365); return y === 1 ? 'fa 1 any' : `fa ${y} anys`; }
        if (d >= 55) return `fa ${Math.round(d / 30)} mesos`;
        if (d >= 28) return 'fa 1 mes';
        if (d >= 13) return `fa ${Math.round(d / 7)} setmanes`;
        return d === 1 ? 'fa 1 dia' : `fa ${d} dies`;
    }

    // Instantània del passat a partir de l'historial d'ELO ({date, elo}): la
    // més RECENT d'entre les prou antigues (minDays), o null si no n'hi ha.
    function bessoPastSnapshot(eloHistoryList, nowTs, minDays) {
        const min = typeof minDays === 'number' ? minDays : BESSO_CONFIG.pastMinDays;
        const now = typeof nowTs === 'number' ? nowTs : Date.now();
        const list = (Array.isArray(eloHistoryList) ? eloHistoryList : [])
            .filter(e => e && e.date && typeof e.elo === 'number')
            .map(e => ({ elo: e.elo, date: e.date, ts: Date.parse(e.date) }))
            .filter(e => !isNaN(e.ts) && e.ts <= now)
            .sort((a, b) => a.ts - b.ts);
        const cutoff = now - min * 86400000;
        const older = list.filter(e => e.ts <= cutoff);
        if (!older.length) return null;
        const snap = older[older.length - 1];
        const days = Math.max(min, Math.round((now - snap.ts) / 86400000));
        return { elo: snap.elo, date: snap.date, daysAgo: days, label: bessoDaysAgoLabel(days) };
    }

    // Helpers del bessó que necessiten el tauler (chess.js injectat, com al
    // classificador de jeroglífics): llibre personal i tria de jugada de llibre.
    function createBessoHelpers(ChessCtor) {
        // Llibre personal: posició (positionKeyFromFen) → { SAN → vegades jugada }.
        // Només s'hi guarden les jugades PRÒPIES (el torn era del jugador), dins
        // de les primeres bookMaxPlies semijugades de cada partida.
        function bessoBuildBook(entries, maxPlies) {
            const max = typeof maxPlies === 'number' ? maxPlies : BESSO_CONFIG.bookMaxPlies;
            const book = {};
            bessoEligibleGames(entries).forEach(e => {
                let ch;
                try { ch = new ChessCtor(); } catch (err) { return; }
                const limit = Math.min(e.moves.length, max);
                for (let i = 0; i < limit; i++) {
                    const key = positionKeyFromFen(ch.fen());
                    const isPlayerTurn = ch.turn() === e.playerColor;
                    let mv = null;
                    try { mv = ch.move(e.moves[i]); } catch (err) { mv = null; }
                    if (!mv) break; // jugada corrupta: la resta de la partida no és fiable
                    if (isPlayerTurn) {
                        const bucket = book[key] || (book[key] = {});
                        bucket[e.moves[i]] = (bucket[e.moves[i]] || 0) + 1;
                    }
                }
            });
            return book;
        }

        // Jugada del llibre per a la posició actual, ponderada per freqüència
        // (les línies més jugades surten més sovint, com faria el jugador real).
        function bessoBookMove(book, fen, rng) {
            const roll = typeof rng === 'function' ? rng : Math.random;
            const bucket = book && book[positionKeyFromFen(fen)];
            if (!bucket) return null;
            const sans = Object.keys(bucket);
            if (!sans.length) return null;
            const total = sans.reduce((sum, san) => sum + bucket[san], 0);
            let r = roll() * total;
            for (const san of sans) {
                r -= bucket[san];
                if (r <= 0) return san;
            }
            return sans[sans.length - 1];
        }

        return { bessoBuildBook, bessoBookMove };
    }

    // ----------------------------------------------------------------------
    // REPERTORI PERSONAL — què jugues de debò a l'obertura
    // ----------------------------------------------------------------------
    // Primera meitat de l'«obertura personal»: en comptes de recomanar res, es
    // llegeix l'historial i es respon la pregunta «què jugo jo, en realitat?».
    // De les partides pròpies en surt un arbre de jugades (les teves i les que
    // t'han respost) amb, a cada node, quantes vegades hi has arribat, què hi
    // has puntuat i quina precisió hi has fet. Creuant-ho amb el graf de
    // posicions d'obertures.js se sap, a més, on deixes el llibre i qui el deixa.
    //
    // No hi intervé el motor: tot surt de dades que l'app ja té. Això la fa
    // instantània i honesta —cada xifra es pot resseguir fins a partides reals.
    const REPERTOIRE_CONFIG = {
        maxPlies: 12,        // profunditat de l'arbre (6 jugades per bàndol)
        minLineGames: 2,     // partides mínimes per allargar una línia principal
        minColorGames: 8,    // partides amb un color perquè les xifres diguin res
        maxBranches: 6       // primeres jugades que s'ensenyen per color
    };

    // Resultat d'una partida des de la perspectiva del jugador, a partir de
    // l'etiqueta de resultat que desa l'historial. Font única de veritat:
    // app.js hi delega amb entryOutcome().
    function historyEntryOutcome(resultLabel) {
        const r = String(resultLabel || '').toLowerCase();
        if (r.includes('victòr') || r.includes('guany')) return 'win';
        if (r.includes('derrot') || r.includes('perd') || r.includes('rendit')) return 'loss';
        if (r.includes('tau')) return 'draw';
        return null;
    }

    // ----------------------------------------------------------------------
    // Agrupació de l'historial per antiguitat (avui, ahir, fa 2 dies...)
    // ----------------------------------------------------------------------
    // Amb moltes partides desades, la llista de l'historial es fa inacabable.
    // Aquí es calcula a quin GRUP d'antiguitat pertany cada partida, de manera
    // que app.js pugui pintar-la dins de seccions desplegables. La granularitat
    // s'obre a mesura que la data s'acosta: dia a dia la primera setmana,
    // setmanes fins al mes, mesos fins a l'any i anys a partir d'aquí.
    const HISTORY_GROUP_CONFIG = {
        dayGroupsMax: 6,       // dies solts (0 = avui ... 6 = fa 6 dies)
        weekGroupsMaxDay: 27,  // fins aquí s'agrupa per setmanes
        yearDays: 365,         // a partir d'aquí s'agrupa per anys
        autoOpenGames: 10      // partides que es deixen desplegades per defecte
    };

    // Dies de CALENDARI entre dues dates (mitjanit a mitjanit, hora local): el
    // que espera qui llegeix «ahir». Una partida de les 23:50 d'ahir és «ahir»
    // encara que no hagin passat 24 hores.
    function calendarDaysAgo(dateLike, nowTs) {
        // Ull: new Date(null) NO és una data invàlida, és l'1 de gener del 1970.
        // Les entrades velles de l'historial poden no tenir data, i han de caure
        // al grup «Sense data», no a «fa 56 anys».
        if (!dateLike && dateLike !== 0) return null;
        const then = dateLike instanceof Date ? dateLike : new Date(dateLike);
        if (!(then instanceof Date) || isNaN(then.getTime())) return null;
        const now = new Date(typeof nowTs === 'number' ? nowTs : Date.now());
        if (isNaN(now.getTime())) return null;
        const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
        const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        return Math.round((b - a) / 86400000);
    }

    // Grup d'antiguitat d'una data: { key, label, days }. `order` creix cap al
    // passat, de manera que ordenar per `order` deixa les partides recents a
    // dalt. Les dates impossibles (o del futur, per rellotge desajustat) cauen
    // a «Avui» / «Sense data» en comptes de desaparèixer de la llista.
    function historyAgeGroup(dateLike, nowTs) {
        const days = calendarDaysAgo(dateLike, nowTs);
        if (days === null) return { key: 'unknown', label: 'Sense data', days: null, order: Number.MAX_SAFE_INTEGER };
        const d = Math.max(0, days);
        if (d === 0) return { key: 'today', label: 'Avui', days: d, order: 0 };
        if (d === 1) return { key: 'yesterday', label: 'Ahir', days: d, order: 1 };
        if (d <= HISTORY_GROUP_CONFIG.dayGroupsMax) {
            return { key: `day-${d}`, label: `Fa ${d} dies`, days: d, order: d };
        }
        if (d <= HISTORY_GROUP_CONFIG.weekGroupsMaxDay) {
            const weeks = Math.floor(d / 7);
            return {
                key: `week-${weeks}`,
                label: weeks === 1 ? 'Fa 1 setmana' : `Fa ${weeks} setmanes`,
                days: d,
                order: 100 + weeks
            };
        }
        if (d < HISTORY_GROUP_CONFIG.yearDays) {
            // Mes «comercial» de 30 dies: 28-59 dies → 1 mes, 60-89 → 2 mesos...
            // Es limita a 11 perquè l'any ja té el seu propi grup.
            const months = Math.min(11, Math.max(1, Math.floor(d / 30)));
            return {
                key: `month-${months}`,
                label: months === 1 ? 'Fa 1 mes' : `Fa ${months} mesos`,
                days: d,
                order: 200 + months
            };
        }
        const years = Math.max(1, Math.floor(d / HISTORY_GROUP_CONFIG.yearDays));
        return {
            key: `year-${years}`,
            label: years === 1 ? 'Fa 1 any' : `Fa ${years} anys`,
            days: d,
            order: 300 + years
        };
    }

    // Agrupa entrades de l'historial en seccions per antiguitat, de la més
    // recent a la més antiga. Dins de cada secció les partides també van de la
    // més nova a la més vella. No modifica ni ordena la llista original.
    function groupHistoryEntriesByAge(entries, nowTs) {
        const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
        const byKey = new Map();
        list.forEach((entry, index) => {
            const group = historyAgeGroup(entry.date, nowTs);
            let bucket = byKey.get(group.key);
            if (!bucket) {
                bucket = { key: group.key, label: group.label, order: group.order, entries: [] };
                byKey.set(group.key, bucket);
            }
            const ts = Date.parse(entry.date);
            bucket.entries.push({ entry, ts: isNaN(ts) ? null : ts, index });
        });
        const groups = Array.from(byKey.values());
        groups.sort((a, b) => a.order - b.order);
        groups.forEach(group => {
            // Sense data fiable manem l'ordre original de la llista (les entrades
            // s'hi afegeixen per ordre cronològic d'arribada), invertit.
            group.entries.sort((a, b) => {
                if (a.ts !== null && b.ts !== null && a.ts !== b.ts) return b.ts - a.ts;
                return b.index - a.index;
            });
            group.count = group.entries.length;
            group.entries = group.entries.map(item => item.entry);
        });
        return groups;
    }

    // Quins grups es deixen desplegats quan encara no s'ha tocat res: els més
    // recents fins a completar `autoOpenGames` partides visibles. El primer
    // sempre s'obre (si no, la llista es veuria tota tancada) i els grups amb
    // memòria d'usuari (`userState`: clau → obert/tancat) manen sempre.
    function historyGroupsOpenState(groups, userState, autoOpenGames) {
        const budget = typeof autoOpenGames === 'number' ? autoOpenGames : HISTORY_GROUP_CONFIG.autoOpenGames;
        const state = userState && typeof userState === 'object' ? userState : {};
        let shown = 0;
        return (Array.isArray(groups) ? groups : []).map((group, i) => {
            const remembered = Object.prototype.hasOwnProperty.call(state, group.key)
                ? !!state[group.key]
                : null;
            const auto = i === 0 || shown < budget;
            const open = remembered === null ? auto : remembered;
            // Els grups oberts gasten pressupost: quan s'esgota, la resta arriba
            // plegada (i qualsevol grup que l'usuari obri fa el mateix efecte).
            if (open) shown += group.count || (group.entries ? group.entries.length : 0);
            return open;
        });
    }

    // Els mapes del graf d'obertures són Map, però acceptem també objectes
    // plans (p. ex. si algun dia es desen serialitzats).
    function mapGet(container, key) {
        if (!container) return undefined;
        if (typeof container.get === 'function') return container.get(key);
        return container[key];
    }

    function setHas(container, value) {
        if (!container) return false;
        if (typeof container.has === 'function') return container.has(value);
        if (Array.isArray(container)) return container.indexOf(value) !== -1;
        return false;
    }

    // Partides que compten per al repertori: pròpies (mai les importades d'un
    // PGN, que poden ser d'altres jugadors), d'aquell color, amb jugades de
    // debò i que siguin partides senceres (no pràctiques d'errades).
    function repertoireEligibleGames(entries, color) {
        return (Array.isArray(entries) ? entries : []).filter(e =>
            e && Array.isArray(e.moves) && e.moves.length >= 2
            && e.playerColor === color
            && e.imported !== true && e.mode !== 'imported' && e.mode !== 'bundle');
    }

    function createRepertoireHelpers(ChessCtor) {
        function newNode(san, ply, mine) {
            return {
                san: san, ply: ply, mine: mine,
                games: 0, wins: 0, draws: 0, losses: 0, rated: 0, scoreSum: 0,
                precisionSum: 0, precisionN: 0,
                inTheory: null, name: null, eco: null,
                children: {}
            };
        }

        function accumulate(node, entry, outcome) {
            node.games += 1;
            if (outcome === 'win') { node.wins += 1; node.rated += 1; node.scoreSum += 1; }
            else if (outcome === 'draw') { node.draws += 1; node.rated += 1; node.scoreSum += 0.5; }
            else if (outcome === 'loss') { node.losses += 1; node.rated += 1; }
            if (typeof entry.precision === 'number' && isFinite(entry.precision)) {
                node.precisionSum += entry.precision;
                node.precisionN += 1;
            }
        }

        // Arbre de jugades d'un color a partir de les partides pròpies.
        function buildRepertoireTree(entries, color, options) {
            const opts = options || {};
            const maxPlies = typeof opts.maxPlies === 'number' ? opts.maxPlies : REPERTOIRE_CONFIG.maxPlies;
            const theory = opts.theory || null;
            const byPos = opts.byPos || null;
            const games = repertoireEligibleGames(entries, color);
            const root = newNode(null, -1, false);
            games.forEach(entry => {
                let chess;
                try { chess = new ChessCtor(); } catch (e) { return; }
                const outcome = historyEntryOutcome(entry.result);
                let node = root;
                const limit = Math.min(entry.moves.length, maxPlies);
                for (let i = 0; i < limit; i++) {
                    const beforeKey = positionKeyFromFen(chess.fen());
                    const mine = chess.turn() === color;
                    const san = entry.moves[i];
                    let move = null;
                    try { move = chess.move(san, { sloppy: true }); } catch (e) { move = null; }
                    if (!move) break;   // jugada corrupta: la resta ja no és fiable
                    let child = node.children[san];
                    if (!child) {
                        child = newNode(san, i, mine);
                        // ¿La jugada és al llibre? Es mira al graf d'obertures: si
                        // encara no està construït queda com a desconegut (null).
                        if (theory) child.inTheory = setHas(mapGet(theory, beforeKey), san);
                        const named = byPos ? mapGet(byPos, positionKeyFromFen(chess.fen())) : null;
                        if (named) { child.name = named.name; child.eco = named.eco; }
                        node.children[san] = child;
                    }
                    accumulate(child, entry, outcome);
                    node = child;
                }
            });
            root.games = games.length;
            return root;
        }

        function sortedChildren(node) {
            return Object.keys(node.children)
                .map(san => node.children[san])
                .sort((a, b) => (b.games - a.games) || a.san.localeCompare(b.san));
        }

        function nodeSummary(node) {
            return {
                san: node.san,
                ply: node.ply,
                mine: node.mine,
                games: node.games,
                wins: node.wins,
                draws: node.draws,
                losses: node.losses,
                score: node.rated ? Math.round((node.scoreSum / node.rated) * 100) : null,
                precision: node.precisionN ? Math.round(node.precisionSum / node.precisionN) : null,
                inTheory: node.inTheory,
                name: node.name,
                eco: node.eco
            };
        }

        // Línia principal des d'un node: a cada pas, la continuació més jugada,
        // mentre hi hagi mostra suficient i no s'hagi arribat al fons de l'arbre.
        function mainLineFrom(node, minLineGames, maxPlies) {
            const min = typeof minLineGames === 'number' ? minLineGames : REPERTOIRE_CONFIG.minLineGames;
            const max = typeof maxPlies === 'number' ? maxPlies : REPERTOIRE_CONFIG.maxPlies;
            const line = [];
            let current = node;
            while (line.length < max) {
                const kids = sortedChildren(current);
                if (!kids.length) break;
                const next = kids[0];
                if (next.games < min) break;
                line.push(nodeSummary(next));
                current = next;
            }
            return line;
        }

        // Repertori d'un color: les primeres jugades més freqüents, cadascuna
        // amb la seva línia principal, el nom d'obertura més profund que s'hi
        // reconeix i el punt on la partida deixa el llibre.
        function repertoireForColor(entries, color, options) {
            const opts = options || {};
            const maxPlies = typeof opts.maxPlies === 'number' ? opts.maxPlies : REPERTOIRE_CONFIG.maxPlies;
            const minLineGames = typeof opts.minLineGames === 'number' ? opts.minLineGames : REPERTOIRE_CONFIG.minLineGames;
            const minColorGames = typeof opts.minColorGames === 'number' ? opts.minColorGames : REPERTOIRE_CONFIG.minColorGames;
            const maxBranches = typeof opts.maxBranches === 'number' ? opts.maxBranches : REPERTOIRE_CONFIG.maxBranches;
            const root = buildRepertoireTree(entries, color, opts);
            const total = root.games;
            const branches = sortedChildren(root).slice(0, maxBranches).map(child => {
                const head = nodeSummary(child);
                const line = [head].concat(mainLineFrom(child, minLineGames, maxPlies - 1));
                // Nom d'obertura: el més profund que es reconeix al llarg de la línia.
                let name = null, eco = null;
                line.forEach(step => { if (step.name) { name = step.name; eco = step.eco; } });
                // On es deixa el llibre: primera jugada de la línia que no hi és.
                let offBookPly = null, offBookBy = null, offBookSan = null;
                for (const step of line) {
                    if (step.inTheory === false) {
                        offBookPly = step.ply;
                        offBookBy = step.mine ? 'me' : 'opponent';
                        offBookSan = step.san;
                        break;
                    }
                }
                return Object.assign(head, {
                    share: total ? Math.round((child.games / total) * 100) : 0,
                    line: line,
                    name: name,
                    eco: eco,
                    offBookPly: offBookPly,
                    offBookBy: offBookBy,
                    offBookSan: offBookSan
                });
            });
            return {
                color: color,
                games: total,
                enough: total >= minColorGames,
                minColorGames: minColorGames,
                // Amb negres la primera jugada de l'arbre és del RIVAL: el
                // repertori es llegeix «contra 1.e4, jugo…».
                branchesAreMine: color === 'w',
                theoryKnown: !!opts.theory,
                branches: branches
            };
        }

        // Repertori complet: blanques i negres, amb el mateix criteri.
        function buildPersonalRepertoire(entries, options) {
            return {
                white: repertoireForColor(entries, 'w', options),
                black: repertoireForColor(entries, 'b', options)
            };
        }

        return {
            buildRepertoireTree,
            mainLineFrom,
            repertoireForColor,
            buildPersonalRepertoire
        };
    }

    // ----------------------------------------------------------------------
    // OBERTURA PERSONAL — construir el repertori, no només mirar-lo
    // ----------------------------------------------------------------------
    // Segona meitat. Del repertori real (què jugues) se'n deriva un repertori
    // PROPOSAT, amb dos criteris diferents segons de qui és el torn:
    //
    //   · A les TEVES jugades es tria. Entre les que el motor considera sòlides
    //     —pèrdua per sota d'un llindar respecte de la millor— es prefereix la
    //     que ja jugues, ponderada per quantes vegades i què hi puntues. Si la
    //     teva habitual no passa la porta, es proposa la millor i es diu per què.
    //
    //   · A les jugades del RIVAL no es tria: es COBREIX. Primer el que t'han
    //     jugat de debò (l'app en té el recompte), i com a reserva les millors
    //     del motor per a posicions on no has arribat mai. Es cobreix fins a
    //     una probabilitat acumulada, no totes les rèpliques possibles: això és
    //     el que manté el repertori memoritzable.
    //
    // La cerca s'expandeix per PROBABILITAT D'ARRIBAR-HI, de manera que el
    // pressupost de motor es gasta a les línies que et trobaràs de debò.
    // Aquest bloc és pur: rep les avaluacions ja fetes i decideix. El bucle que
    // parla amb Stockfish viu a app.js.
    const PERSONAL_OPENING_CONFIG = {
        maxPlies: 12,            // profunditat del repertori (6 jugades per bàndol)
        maxCpLoss: 40,           // porta de solidesa d'una jugada pròpia (centpeons)
        preferOwnCpLoss: 25,     // per sota d'això, la teva habitual guanya sempre
        coverage: 0.85,          // probabilitat de rèpliques que es cobreix
        maxReplies: 3,           // rèpliques màximes per posició
        minTrustedSample: 3,     // partides per fiar-se del tot d'una distribució
        minBranchProb: 0.04,     // per sota d'això la branca no val la pena
        maxPositions: 60,        // pressupost d'avaluacions de motor
        minColorGames: 8,        // partides amb un color per construir res
        engineReplyPool: 3,      // rèpliques del motor quan no hi ha dades teves
        // El MultiPV només ensenya les N millors: si la teva jugada habitual no
        // hi surt, s'avalua A PART. Sense això es descartaria per «no avaluada»
        // i el repertori acabaria essent el del motor, no el teu.
        maxCandidateChecks: 2,   // jugades pròpies que es mesuren a part per posició
        minCandidateGames: 1     // vegades mínimes jugada per merèixer la mesura
    };

    // Distribució de rèpliques del rival en una posició, a partir del que t'han
    // jugat de debò. Retorna [{san, games}] ordenat de més a menys.
    function opponentReplyCounts(bucket) {
        if (!bucket) return [];
        return Object.keys(bucket)
            .map(san => ({ san: san, games: bucket[san] }))
            .sort((a, b) => (b.games - a.games) || a.san.localeCompare(b.san));
    }

    // Rèpliques que es cobreixen en una posició.
    //
    // La distribució surt del que t'han jugat de debò, però amb una mostra molt
    // petita no ens la creiem del tot: la confiança creix amb el nombre de
    // partides fins a minTrustedSample, i la part de probabilitat que no es
    // confia se l'emporten les millors del motor. Amb prou mostra manen només
    // les teves dades; sense cap dada, només el motor.
    //
    // La cua que queda fora per la cobertura o pel sostre de rèpliques NO es
    // reparteix: són rèpliques que conscientment no es cobreixen, i inflar les
    // altres seria dir que el repertori cobreix més del que cobreix.
    function coverOpponentReplies(personalCounts, engineMoves, options) {
        const cfg = Object.assign({}, PERSONAL_OPENING_CONFIG, options || {});
        const counts = (personalCounts || []).filter(c => c && c.san && c.games > 0);
        const total = counts.reduce((sum, c) => sum + c.games, 0);
        const trust = total ? Math.min(1, total / cfg.minTrustedSample) : 0;
        const picked = [];
        let covered = 0;
        for (const c of counts) {
            if (picked.length >= cfg.maxReplies) break;
            const share = c.games / total;
            picked.push({ san: c.san, prob: share * trust, games: c.games, source: 'personal' });
            covered += share;
            if (covered >= cfg.coverage) break;
        }
        // El que no es confia a les dades pròpies (o tot, si no n'hi ha cap)
        // se'l reparteixen les millors del motor: així no queden forats a les
        // posicions on encara no has arribat mai.
        const untrusted = 1 - trust;
        if (untrusted > 0.001 && picked.length < cfg.maxReplies) {
            const already = new Set(picked.map(p => p.san));
            const pool = (engineMoves || [])
                .filter(m => m && m.san && !already.has(m.san))
                .slice(0, Math.min(cfg.engineReplyPool, cfg.maxReplies - picked.length));
            if (pool.length) {
                const share = untrusted / pool.length;
                pool.forEach(m => picked.push({ san: m.san, prob: share, games: 0, source: 'engine' }));
            } else if (picked.length) {
                // Sense reserva del motor no hi ha on posar la part no confiada:
                // es torna a les dades pròpies, que és tot el que tenim.
                const back = untrusted / picked.length;
                picked.forEach(p => { p.prob += back; });
            }
        }
        return picked;
    }

    // Pèrdua d'una jugada respecte de la millor de la posició, en centpeons i
    // sempre des del punt de vista de qui mou (les avaluacions arriben ja
    // normalitzades així). Sense avaluació, null: no s'inventa cap xifra.
    function moveCpLoss(evaluation, san) {
        if (!evaluation || !Array.isArray(evaluation.moves) || !evaluation.moves.length) return null;
        const best = evaluation.moves[0];
        const found = evaluation.moves.find(m => m && m.san === san);
        if (!found || typeof found.cp !== 'number' || typeof best.cp !== 'number') return null;
        return Math.max(0, Math.round(best.cp - found.cp));
    }

    // Tria de la jugada PRÒPIA en una posició. `personal` és [{san, games, score}]
    // ordenat com vulgui; `evaluation` és {moves:[{san, cp}]} amb la millor
    // primera. Retorna la jugada triada amb el motiu, o null si no es pot decidir.
    function choosePersonalMove(personal, evaluation, options) {
        const cfg = Object.assign({}, PERSONAL_OPENING_CONFIG, options || {});
        if (!evaluation || !Array.isArray(evaluation.moves) || !evaluation.moves.length) return null;
        const best = evaluation.moves[0];
        const mine = (personal || []).filter(p => p && p.san && p.games > 0);
        const totalGames = mine.reduce((sum, p) => sum + p.games, 0);

        // Candidates pròpies que passen la porta de solidesa.
        const sound = [];
        const rejected = [];
        mine.forEach(p => {
            const cpLoss = moveCpLoss(evaluation, p.san);
            if (cpLoss === null) { rejected.push({ san: p.san, games: p.games, cpLoss: null, why: 'unevaluated' }); return; }
            if (cpLoss > cfg.maxCpLoss) { rejected.push({ san: p.san, games: p.games, cpLoss: cpLoss, why: 'unsound' }); return; }
            sound.push({
                san: p.san, games: p.games, score: p.score, cpLoss: cpLoss,
                share: totalGames ? p.games / totalGames : 0
            });
        });

        if (sound.length) {
            // Entre les sòlides mana el que jugues i com et va: la freqüència
            // pesa, el resultat matisa i la pèrdua fa de desempat.
            sound.forEach(c => {
                const scorePart = typeof c.score === 'number' ? (c.score / 100) : 0.5;
                c.rank = c.share * (0.6 + 0.8 * scorePart) - (c.cpLoss / 1000);
            });
            sound.sort((a, b) => (b.rank - a.rank) || (a.cpLoss - b.cpLoss));
            const pick = sound[0];
            const isBest = pick.san === best.san;
            return {
                san: pick.san,
                source: 'own',
                cp: best.cp - pick.cpLoss,
                cpLoss: pick.cpLoss,
                games: pick.games,
                score: typeof pick.score === 'number' ? pick.score : null,
                share: Math.round(pick.share * 100),
                bestSan: best.san,
                // «La jugues i és bona» / «la jugues i el motor la valida»
                reason: isBest ? 'own-best' : (pick.cpLoss <= cfg.preferOwnCpLoss ? 'own-sound' : 'own-playable'),
                rejected: rejected
            };
        }

        // Cap jugada teva serveix (o no n'hi ha cap): es proposa la millor.
        const worstOwn = rejected.filter(r => typeof r.cpLoss === 'number')
            .sort((a, b) => a.cpLoss - b.cpLoss)[0] || null;
        return {
            san: best.san,
            source: 'engine',
            cp: best.cp,
            cpLoss: 0,
            games: 0,
            score: null,
            share: 0,
            bestSan: best.san,
            reason: mine.length ? (worstOwn ? 'replaces-unsound' : 'replaces-unknown') : 'new',
            replaces: worstOwn,
            rejected: rejected
        };
    }

    // Resum d'una obertura personal construïda: mida, cobertura i solidesa.
    // Serveix per ensenyar d'un cop d'ull què s'ha de memoritzar i què val.
    function summarizePersonalOpening(root) {
        const summary = {
            positions: 0, ownMoves: 0, lines: 0,
            fromOwnGames: 0, fromEngine: 0,
            avgCpLoss: null, maxCpLoss: 0,
            coverage: 0, maxDepth: 0
        };
        if (!root) return summary;
        let cpSum = 0, cpN = 0;
        (function walk(node, depth) {
            const kids = Array.isArray(node.children) ? node.children : [];
            if (depth > summary.maxDepth) summary.maxDepth = depth;
            if (!kids.length) {
                summary.lines += 1;
                summary.coverage += (typeof node.reachProb === 'number' ? node.reachProb : 0);
                return;
            }
            kids.forEach(child => {
                summary.positions += 1;
                if (child.mine) {
                    summary.ownMoves += 1;
                    if (child.source === 'own') summary.fromOwnGames += 1;
                    else summary.fromEngine += 1;
                    if (typeof child.cpLoss === 'number') {
                        cpSum += child.cpLoss; cpN += 1;
                        if (child.cpLoss > summary.maxCpLoss) summary.maxCpLoss = child.cpLoss;
                    }
                }
                walk(child, depth + 1);
            });
        })(root, 0);
        summary.avgCpLoss = cpN ? Math.round(cpSum / cpN) : null;
        summary.coverage = Math.min(100, Math.round(summary.coverage * 100));
        return summary;
    }

    // Aplana l'arbre en línies llegibles (de l'arrel a cada fulla), ordenades
    // de la més probable a la menys.
    function personalOpeningLines(root) {
        const lines = [];
        if (!root) return lines;
        (function walk(node, path) {
            const kids = Array.isArray(node.children) ? node.children : [];
            if (!kids.length) {
                if (path.length) {
                    lines.push({
                        moves: path.slice(),
                        prob: typeof node.reachProb === 'number' ? node.reachProb : 0
                    });
                }
                return;
            }
            kids.forEach(child => walk(child, path.concat([child])));
        })(root, []);
        lines.sort((a, b) => b.prob - a.prob);
        return lines;
    }

    // Constructor de l'obertura personal. Necessita el tauler (chess.js
    // injectat) i s'usa com una màquina d'estats perquè la part lenta —demanar
    // avaluacions al motor— quedi FORA d'aquest fitxer:
    //
    //   const state = builder.start(gameHistory, 'w', opts);
    //   let job; while ((job = builder.nextPosition(state))) {
    //       builder.feed(state, await avaluaAmbStockfish(job.fen));
    //   }
    //   const opening = builder.result(state);
    //
    // Així el bucle es pot aturar, ensenyar progrés i reprendre's, i els tests
    // el poden alimentar amb avaluacions inventades sense cap motor.
    function createPersonalOpeningBuilder(ChessCtor) {
        // Llibres de posició: les MEVES jugades amb el seu resultat, i les del
        // rival amb el seu recompte. Una sola passada per l'historial.
        function buildPositionBooks(entries, color, maxPlies) {
            const mine = {};
            const theirs = {};
            repertoireEligibleGames(entries, color).forEach(entry => {
                let chess;
                try { chess = new ChessCtor(); } catch (e) { return; }
                const outcome = historyEntryOutcome(entry.result);
                const limit = Math.min(entry.moves.length, maxPlies);
                for (let i = 0; i < limit; i++) {
                    const key = positionKeyFromFen(chess.fen());
                    const isMine = chess.turn() === color;
                    const san = entry.moves[i];
                    let move = null;
                    try { move = chess.move(san, { sloppy: true }); } catch (e) { move = null; }
                    if (!move) break;
                    if (isMine) {
                        const bucket = mine[key] || (mine[key] = {});
                        const cell = bucket[san] || (bucket[san] = { games: 0, rated: 0, scoreSum: 0, precisionSum: 0, precisionN: 0 });
                        cell.games += 1;
                        if (outcome === 'win') { cell.rated += 1; cell.scoreSum += 1; }
                        else if (outcome === 'draw') { cell.rated += 1; cell.scoreSum += 0.5; }
                        else if (outcome === 'loss') { cell.rated += 1; }
                        if (typeof entry.precision === 'number' && isFinite(entry.precision)) {
                            cell.precisionSum += entry.precision;
                            cell.precisionN += 1;
                        }
                    } else {
                        const bucket = theirs[key] || (theirs[key] = {});
                        bucket[san] = (bucket[san] || 0) + 1;
                    }
                }
            });
            return { mine: mine, theirs: theirs };
        }

        function personalMovesAt(books, key) {
            const bucket = books.mine[key];
            if (!bucket) return [];
            return Object.keys(bucket).map(san => {
                const cell = bucket[san];
                return {
                    san: san,
                    games: cell.games,
                    score: cell.rated ? Math.round((cell.scoreSum / cell.rated) * 100) : null,
                    precision: cell.precisionN ? Math.round(cell.precisionSum / cell.precisionN) : null
                };
            }).sort((a, b) => b.games - a.games);
        }

        // ¿Les dades pròpies ja cobreixen prou aquesta posició del rival? Si sí,
        // no cal gastar-hi motor.
        function repliesNeedEngine(counts, cfg) {
            if (!counts.length) return true;
            const total = counts.reduce((sum, c) => sum + c.games, 0);
            if (total < 2) return true;
            let covered = 0;
            for (let i = 0; i < counts.length && i < cfg.maxReplies; i++) covered += counts[i].games / total;
            return covered < cfg.coverage;
        }

        function newNode(san, ply, mine, fen, reachProb) {
            return {
                san: san, ply: ply, mine: mine, fen: fen,
                reachProb: reachProb, children: [],
                cp: null, cpLoss: null, games: 0, score: null, share: 0,
                source: null, reason: null, prob: null,
                inTheory: null, name: null, eco: null
            };
        }

        function annotateFromGraph(node, graph, beforeKey) {
            if (!graph) return;
            if (graph.theory) node.inTheory = setHas(mapGet(graph.theory, beforeKey), node.san);
            const named = graph.byPos ? mapGet(graph.byPos, positionKeyFromFen(node.fen)) : null;
            if (named) { node.name = named.name; node.eco = named.eco; }
        }

        // Estat inicial de la construcció.
        function start(entries, color, options) {
            const cfg = Object.assign({}, PERSONAL_OPENING_CONFIG, options || {});
            const games = repertoireEligibleGames(entries, color);
            const books = buildPositionBooks(entries, color, cfg.maxPlies);
            let startFen = null;
            try { startFen = new ChessCtor().fen(); } catch (e) { startFen = null; }
            const root = newNode(null, -1, false, startFen, 1);
            return {
                color: color,
                config: cfg,
                graph: (options && options.graph) || null,
                books: books,
                games: games.length,
                enough: games.length >= cfg.minColorGames,
                root: root,
                queue: startFen ? [{ node: root, ply: 0, mine: color === 'w', reachProb: 1, fen: startFen }] : [],
                pending: null,
                evaluated: 0,
                skipped: 0,
                done: !startFen
            };
        }

        // Quantes posicions queden com a molt per avaluar (per al progrés).
        function remaining(state) {
            return Math.max(0, Math.min(
                state.config.maxPositions - state.evaluated,
                state.queue.length + (state.pending ? 1 : 0)
            ));
        }

        function takeNext(state) {
            if (!state.queue.length) return null;
            let bestIdx = 0;
            for (let i = 1; i < state.queue.length; i++) {
                if (state.queue[i].reachProb > state.queue[bestIdx].reachProb) bestIdx = i;
            }
            return state.queue.splice(bestIdx, 1)[0];
        }

        // Jugades pròpies que el MultiPV no ha cobert i que val la pena mesurar
        // a part (les més jugades primer, amb sostre).
        function candidatesToMeasure(personal, evaluation, cfg) {
            const covered = new Set(((evaluation && evaluation.moves) || []).map(m => m && m.san));
            return personal
                .filter(p => p.games >= cfg.minCandidateGames && !covered.has(p.san))
                .slice(0, cfg.maxCandidateChecks)
                .map(p => p.san);
        }

        // Afegeix a l'avaluació les jugades mesurades a part i reordena: la
        // millor torna a quedar la primera, vingui d'on vingui.
        function mergeMeasured(evaluation, extra) {
            const moves = ((evaluation && evaluation.moves) || []).slice();
            Object.keys(extra || {}).forEach(san => {
                if (typeof extra[san] !== 'number') return;
                if (moves.some(m => m && m.san === san)) return;
                moves.push({ san: san, cp: extra[san], measured: true });
            });
            moves.sort((a, b) => b.cp - a.cp);
            return Object.assign({}, evaluation, { moves: moves });
        }

        function expandOwn(state, item, evaluation) {
            const cfg = state.config;
            const key = positionKeyFromFen(item.fen);
            const personal = personalMovesAt(state.books, key);
            const pick = choosePersonalMove(personal, evaluation, cfg);
            if (!pick) return;
            let chess;
            try { chess = new ChessCtor(item.fen); } catch (e) { return; }
            let move = null;
            try { move = chess.move(pick.san, { sloppy: true }); } catch (e) { move = null; }
            if (!move) return;
            const child = newNode(pick.san, item.ply, true, chess.fen(), item.reachProb);
            child.cp = pick.cp;
            child.cpLoss = pick.cpLoss;
            child.games = pick.games;
            child.score = pick.score;
            child.share = pick.share;
            child.source = pick.source;
            child.reason = pick.reason;
            if (pick.replaces) child.replaces = pick.replaces;
            annotateFromGraph(child, state.graph, key);
            item.node.children.push(child);
            state.queue.push({ node: child, ply: item.ply + 1, mine: false, reachProb: item.reachProb, fen: child.fen });
        }

        function expandOpponent(state, item, evaluation) {
            const cfg = state.config;
            const key = positionKeyFromFen(item.fen);
            const counts = opponentReplyCounts(state.books.theirs[key]);
            const engineMoves = evaluation && Array.isArray(evaluation.moves) ? evaluation.moves : [];
            const replies = coverOpponentReplies(counts, engineMoves, cfg);
            replies.forEach(reply => {
                const reach = item.reachProb * reply.prob;
                if (reach < cfg.minBranchProb) { state.skipped += 1; return; }
                let chess;
                try { chess = new ChessCtor(item.fen); } catch (e) { return; }
                let move = null;
                try { move = chess.move(reply.san, { sloppy: true }); } catch (e) { move = null; }
                if (!move) return;
                const child = newNode(reply.san, item.ply, false, chess.fen(), reach);
                child.prob = Math.round(reply.prob * 100);
                child.games = reply.games;
                child.source = reply.source;
                annotateFromGraph(child, state.graph, key);
                item.node.children.push(child);
                state.queue.push({ node: child, ply: item.ply + 1, mine: true, reachProb: reach, fen: child.fen });
            });
        }

        function expand(state, item, evaluation) {
            if (item.mine) expandOwn(state, item, evaluation);
            else expandOpponent(state, item, evaluation);
        }

        // ¿S'ha d'aturar aquesta branca abans d'expandir-la?
        function shouldStop(state, item) {
            const cfg = state.config;
            if (item.ply >= cfg.maxPlies) return true;
            if (item.reachProb < cfg.minBranchProb) return true;
            return false;
        }

        // Següent posició que necessita el motor. Les que no el necessiten
        // s'expandeixen aquí mateix, de manera que qui crida només s'ha
        // d'ocupar d'avaluar el que se li demana.
        // ¿Es pot fer aquesta jugada en aquesta posició? Una jugada que ja no és
        // legal (dades velles) no es pot demanar al motor.
        function moveIsLegal(fen, san) {
            let chess;
            try { chess = new ChessCtor(fen); } catch (e) { return false; }
            try { return !!chess.move(san, { sloppy: true }); } catch (e) { return false; }
        }

        function describeJob(pending) {
            if (pending.phase === 'candidate') {
                const san = pending.missing[0];
                return {
                    kind: 'candidate',
                    // Es demana el valor d'aquesta jugada A LA MATEIXA POSICIÓ i
                    // amb la mateixa cerca que la resta. Mesurar-la analitzant la
                    // posició de després seria comparar dues cerques diferents:
                    // les escales no coincideixen i en surten pèrdues fantasma
                    // de desenes de centpeons.
                    fen: pending.item.fen,
                    san: san,
                    ply: pending.item.ply,
                    mine: true,
                    reachProb: pending.item.reachProb
                };
            }
            return {
                kind: 'position',
                fen: pending.item.fen,
                ply: pending.item.ply,
                mine: pending.item.mine,
                reachProb: pending.item.reachProb,
                positionKey: positionKeyFromFen(pending.item.fen)
            };
        }

        function budgetLeft(state) {
            return state.evaluated < state.config.maxPositions;
        }

        // Següent posició que necessita el motor. Les que no el necessiten
        // s'expandeixen aquí mateix, de manera que qui crida només s'ha
        // d'ocupar d'avaluar el que se li demana.
        function nextPosition(state) {
            if (state.pending) {
                const job = describeJob(state.pending);
                // Una jugada que ni tan sols es pot fer no es pot mesurar.
                if (state.pending.phase === 'candidate' && !moveIsLegal(job.fen, job.san)) {
                    state.pending.missing.shift();
                    if (!state.pending.missing.length) { finishOwn(state, state.pending); }
                    return nextPosition(state);
                }
                return job;
            }
            while (state.queue.length) {
                const item = takeNext(state);
                if (shouldStop(state, item)) continue;
                const needsEngine = item.mine
                    ? true    // la porta de solidesa és tot el sentit de la tria
                    : repliesNeedEngine(opponentReplyCounts(state.books.theirs[positionKeyFromFen(item.fen)]), state.config);
                if (needsEngine && !budgetLeft(state)) {
                    // Pressupost exhaurit: la branca es queda on és, no s'endevina.
                    state.skipped += 1;
                    continue;
                }
                if (!needsEngine) { expand(state, item, null); continue; }
                state.pending = { item: item, phase: 'position', evaluation: null, missing: [], extra: {} };
                return describeJob(state.pending);
            }
            state.done = true;
            return null;
        }

        function finishOwn(state, pending) {
            expandOwn(state, pending.item, mergeMeasured(pending.evaluation, pending.extra));
            state.pending = null;
        }

        // Aplica l'avaluació demanada i continua. Amb `null` (el motor no ha
        // pogut) la branca s'atura en comptes d'inventar-se una jugada.
        function feed(state, evaluation) {
            const pending = state.pending;
            if (!pending) return false;
            state.evaluated += 1;
            const usable = evaluation && Array.isArray(evaluation.moves) && evaluation.moves.length
                && typeof evaluation.moves[0].cp === 'number';

            if (pending.phase === 'candidate') {
                const san = pending.missing.shift();
                // La mesura ve en la mateixa escala que la resta de la posició
                // (mateixa cerca, mateix bàndol), així que s'hi afegeix tal qual.
                // Ha de ser la jugada demanada: agafar-ne una altra faria passar
                // per bona una jugada que no s'ha mesurat.
                const measured = usable ? evaluation.moves.find(m => m && m.san === san) : null;
                if (measured && typeof measured.cp === 'number') pending.extra[san] = measured.cp;
                if (!pending.missing.length || !budgetLeft(state)) finishOwn(state, pending);
                return true;
            }

            if (!pending.item.mine) {
                // Posició del rival: encara que el motor falli, les dades
                // pròpies poden cobrir-la.
                expand(state, pending.item, usable ? evaluation : null);
                state.pending = null;
                return true;
            }

            if (!usable) { state.skipped += 1; state.pending = null; return true; }

            pending.evaluation = evaluation;
            const key = positionKeyFromFen(pending.item.fen);
            const personal = personalMovesAt(state.books, key);
            pending.missing = budgetLeft(state)
                ? candidatesToMeasure(personal, evaluation, state.config)
                : [];
            if (!pending.missing.length) { finishOwn(state, pending); return true; }
            pending.phase = 'candidate';
            return true;
        }

        function result(state) {
            return {
                color: state.color,
                builtAt: null,               // el posa qui ho desa
                games: state.games,
                enough: state.enough,
                evaluated: state.evaluated,
                skipped: state.skipped,
                complete: state.done && !state.pending,
                config: {
                    maxPlies: state.config.maxPlies,
                    maxCpLoss: state.config.maxCpLoss,
                    coverage: state.config.coverage,
                    maxPositions: state.config.maxPositions
                },
                summary: summarizePersonalOpening(state.root),
                root: state.root
            };
        }

        return {
            buildPositionBooks,
            personalMovesAt,
            start,
            nextPosition,
            feed,
            remaining,
            result
        };
    }

    // ----------------------------------------------------------------------
    // Classificador de FINAL TÀCTIC dels jeroglífics (PUR amb chess.js injectat)
    // ----------------------------------------------------------------------
    // Un jeroglífic només s'aprova si acaba amb una imatge tàctica clara i
    // verificable: escac i mat, escac (amb avantatge), forquilla real, clavada,
    // descoberta, promoció o guany de dama/torre. Aquest bloc rep el constructor
    // de chess.js (window.Chess al navegador, require('chess.js').Chess als
    // tests) i retorna funcions que MIREN EL TAULER de debò després de l'última
    // jugada del jugador. No accepta finals genèrics de "millor línia".

    // Finals acceptats (l'ordre no és de prioritat; la prioritat viu a
    // HIERO_MOTIF_PRIORITY). 'none' MAI no s'aprova.
    const HIERO_ALLOWED_FINAL_MOTIFS = [
        'mate', 'check', 'fork', 'pin', 'discovery', 'promotion', 'major_win'
    ];
    // Etiquetes en català visibles per a l'usuari.
    const HIERO_FINAL_MOTIF_LABELS = {
        mate: 'escac i mat',
        check: 'escac',
        fork: 'forquilla',
        pin: 'clavada',
        discovery: 'descoberta',
        promotion: 'promoció',
        major_win: 'guany de dama o torre'
    };
    // Prioritat per triar el motiu PRINCIPAL quan n'hi ha diversos: el mat mana
    // sempre; després les imatges més nítides; l'escac és l'últim recurs.
    const HIERO_MOTIF_PRIORITY = ['mate', 'promotion', 'fork', 'pin', 'discovery', 'major_win', 'check'];
    // Nom estructurat (anglès) de cada peça per als camps de dades (targets,
    // piece…) i nom en català per als textos visibles (reason).
    const HIERO_PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
    const HIERO_PIECE_NAMES_CA = { p: 'el peó', n: 'el cavall', b: "l'alfil", r: 'la torre', q: 'la dama', k: 'el rei' };
    const HIERO_PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    // Fàbrica d'ajudants del classificador. Retorna null si no hi ha chess.js.
    function createHieroglyphicMotifHelpers(ChessCtor) {
        if (typeof ChessCtor !== 'function') return null;

        function loadFen(fen) {
            try {
                const g = new ChessCtor(fen);
                return (g && typeof g.moves === 'function') ? g : null;
            } catch (e) { return null; }
        }
        function applyUci(g, uci) {
            const raw = String(uci || '').trim();
            if (!raw) return null;
            try {
                if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(raw)) {
                    return g.move({
                        from: raw.slice(0, 2).toLowerCase(),
                        to: raw.slice(2, 4).toLowerCase(),
                        promotion: raw.length > 4 ? raw[4].toLowerCase() : 'q'
                    }) || null;
                }
                return g.move(raw, { sloppy: true }) || null;
            } catch (e) { return null; }
        }
        // Mapa { casella: {type,color} } a partir del camp de peces d'una FEN.
        function boardMap(fen) {
            const boardFen = String(fen || '').split(' ')[0] || '';
            const map = {};
            const rows = boardFen.split('/');
            for (let r = 0; r < rows.length; r++) {
                let file = 0;
                for (const ch of rows[r]) {
                    if (/\d/.test(ch)) { file += parseInt(ch, 10); continue; }
                    const color = ch === ch.toUpperCase() ? 'w' : 'b';
                    const sq = String.fromCharCode(97 + file) + (8 - r);
                    map[sq] = { type: ch.toLowerCase(), color };
                    file++;
                }
            }
            return map;
        }
        function fileIdx(sq) { return sq.charCodeAt(0) - 97; }
        function rankIdx(sq) { return parseInt(sq[1], 10); }
        function sqName(f, r) { return String.fromCharCode(97 + f) + r; }
        const oppColor = c => (c === 'w' ? 'b' : 'w');
        const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

        // Caselles/peces enemigues que una peça a `from` (de color `color`)
        // ataca, tenint en compte els bloquejos per a les peces de llarg abast.
        function attacksFrom(board, from, piece, color) {
            const file = fileIdx(from), rank = rankIdx(from);
            const enemy = oppColor(color);
            const hits = [];
            const add = (f, r) => {
                if (f < 0 || f > 7 || r < 1 || r > 8) return false;
                const sq = sqName(f, r);
                const target = board[sq];
                if (target && target.color === enemy) hits.push({ square: sq, piece: target.type });
                return !target; // pot continuar lliscant si la casella era buida
            };
            const slide = dirs => dirs.forEach(([df, dr]) => {
                for (let f = file + df, r = rank + dr; f >= 0 && f <= 7 && r >= 1 && r <= 8; f += df, r += dr) { if (!add(f, r)) break; }
            });
            if (piece === 'n') [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(([df, dr]) => add(file + df, rank + dr));
            else if (piece === 'b') slide([[1, 1], [-1, 1], [1, -1], [-1, -1]]);
            else if (piece === 'r') slide([[1, 0], [-1, 0], [0, 1], [0, -1]]);
            else if (piece === 'q') slide([[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]);
            else if (piece === 'p') [[-1, color === 'w' ? 1 : -1], [1, color === 'w' ? 1 : -1]].forEach(([df, dr]) => add(file + df, rank + dr));
            else if (piece === 'k') [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([df, dr]) => add(file + df, rank + dr));
            return hits;
        }
        // La casella `sq` (ocupada per una peça de color `ownerColor`) està
        // defensada per alguna ALTRA peça del mateix color?
        function isDefendedBy(board, sq, ownerColor) {
            for (const from in board) {
                if (from === sq) continue;
                const p = board[from];
                if (!p || p.color !== ownerColor) continue;
                if (attacksFrom(board, from, p.type, ownerColor).some(h => h.square === sq)) return true;
            }
            return false;
        }
        // La casella `sq` és atacada per alguna peça de color `byColor`?
        function isAttackedBy(board, sq, byColor) {
            for (const from in board) {
                const p = board[from];
                if (!p || p.color !== byColor) continue;
                if (attacksFrom(board, from, p.type, byColor).some(h => h.square === sq)) return true;
            }
            return false;
        }
        function material(fen) {
            const map = boardMap(fen);
            const mat = { w: 0, b: 0 };
            for (const sq in map) mat[map[sq].color] += HIERO_PIECE_VALUE[map[sq].type] || 0;
            return mat;
        }

        // Reprodueix la línia i retorna els fets de cada jugada + l'última del
        // jugador. playerColor = qui mou a la FEN inicial (el que resol).
        function replayLine(initialFen, fullLineUci) {
            const g = loadFen(initialFen);
            if (!g) return null;
            const playerColor = g.turn();
            const moves = [];
            const list = Array.isArray(fullLineUci) ? fullLineUci : [];
            for (let i = 0; i < list.length; i++) {
                const beforeFen = g.fen();
                const mv = applyUci(g, list[i]);
                if (!mv) break;
                moves.push({
                    beforeFen, afterFen: g.fen(),
                    uci: (mv.from + mv.to + (mv.promotion || '')),
                    san: mv.san, color: mv.color, from: mv.from, to: mv.to,
                    piece: mv.piece, captured: mv.captured || null, promotion: mv.promotion || null,
                    inCheck: g.in_check(), inCheckmate: g.in_checkmate()
                });
            }
            if (!moves.length) return null;
            let lastPlayerIdx = -1;
            for (let i = moves.length - 1; i >= 0; i--) { if (moves[i].color === playerColor) { lastPlayerIdx = i; break; } }
            if (lastPlayerIdx < 0) return null;
            return { playerColor, moves, lastPlayerIdx, finalMove: moves[lastPlayerIdx] };
        }

        // Forquilla REAL: després de la jugada final, la peça moguda ataca dues o
        // més peces/objectius importants des de la casella d'arribada.
        function detectRealForkAfterFinalMove(beforeFinalFen, finalMoveUci, opts = {}) {
            const g = loadFen(beforeFinalFen);
            if (!g) return null;
            const mv = applyUci(g, finalMoveUci);
            if (!mv) return null;
            const color = mv.color;
            const enemy = oppColor(color);
            const to = mv.to;
            const board = boardMap(g.fen());
            const moved = board[to];
            if (!moved) return null;
            const hits = attacksFrom(board, to, moved.type, color);
            // Classifica els objectius: rei/dama/torre sempre valen; una peça
            // menor només compta si està indefensa (imatge nítida de doble atac).
            const targets = [];
            hits.forEach(h => {
                if (h.piece === 'k' || h.piece === 'q' || h.piece === 'r') {
                    targets.push({ name: HIERO_PIECE_NAMES[h.piece], type: h.piece, square: h.square });
                } else if (h.piece === 'n' || h.piece === 'b') {
                    if (!isDefendedBy(board, h.square, enemy)) targets.push({ name: HIERO_PIECE_NAMES[h.piece], type: h.piece, square: h.square });
                }
            });
            if (targets.length < 2) return null;
            const types = targets.map(t => t.type);
            const has = t => types.includes(t);
            const givesCheck = g.in_check(); // el rei és un dels objectius
            // Fals positiu: si la peça que forqueja penja (atacada i indefensa) i
            // NO dona escac, el rival la captura de franc i la forquilla s'esfuma.
            if (!givesCheck && isAttackedBy(board, to, enemy) && !isDefendedBy(board, to, color)) return null;
            let confidence = null;
            const majors = types.filter(t => t === 'q' || t === 'r').length;
            const minors = types.filter(t => t === 'n' || t === 'b').length;
            if (has('k') && (has('q') || has('r'))) confidence = 'high';
            else if (has('q') && has('r')) confidence = 'high';
            else if (majors >= 2) confidence = 'high';
            else if (has('k') && majors >= 1) confidence = 'high';
            else if (has('k') && minors >= 1) confidence = 'medium';
            else if (has('q') && minors >= 1) confidence = 'medium';
            else if (minors >= 2) confidence = opts.finalEvalClear ? 'medium' : 'low';
            else confidence = 'medium';
            const targetNames = targets.map(t => t.name);
            const targetsCa = targets.map(t => HIERO_PIECE_NAMES_CA[t.type]);
            return {
                motif: 'fork', targets: targetNames, piece: HIERO_PIECE_NAMES[moved.type], square: to,
                confidence,
                reason: `${cap(HIERO_PIECE_NAMES_CA[moved.type])} a ${to} ataca alhora ${targetsCa.join(' i ')}.`
            };
        }

        // Clavada: després de la jugada final, una peça de llarg abast (dama,
        // torre o alfil) clava una peça rival contra el rei, la dama o la torre.
        function detectPinAfterFinalMove(beforeFinalFen, finalMoveUci) {
            const g = loadFen(beforeFinalFen);
            if (!g) return null;
            const mv = applyUci(g, finalMoveUci);
            if (!mv) return null;
            const color = mv.color, enemy = oppColor(color), to = mv.to;
            const board = boardMap(g.fen());
            const moved = board[to];
            if (!moved || !['b', 'r', 'q'].includes(moved.type)) return null;
            const dirsFor = {
                b: [[1, 1], [-1, 1], [1, -1], [-1, -1]],
                r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
                q: [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]
            };
            const f0 = fileIdx(to), r0 = rankIdx(to);
            for (const [df, dr] of dirsFor[moved.type]) {
                let f = f0 + df, r = r0 + dr, pinned = null;
                while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
                    const sq = sqName(f, r), occ = board[sq];
                    if (occ) {
                        if (!pinned) {
                            if (occ.color !== enemy) break;           // bloqueig propi: no hi ha clavada
                            pinned = { square: sq, type: occ.type };
                        } else {
                            if (occ.color !== enemy) break;           // darrere hi ha peça pròpia: no clava res
                            const behind = { square: sq, type: occ.type };
                            if (behind.type === 'k') {
                                return { motif: 'pin', pinned: { square: pinned.square, piece: HIERO_PIECE_NAMES[pinned.type] }, against: { square: behind.square, piece: 'king' }, piece: HIERO_PIECE_NAMES[moved.type], square: to, confidence: 'high', reason: `${cap(HIERO_PIECE_NAMES_CA[moved.type])} a ${to} clava ${HIERO_PIECE_NAMES_CA[pinned.type]} contra el rei.` };
                            }
                            if ((behind.type === 'q' || behind.type === 'r') && (HIERO_PIECE_VALUE[behind.type] > HIERO_PIECE_VALUE[pinned.type])) {
                                const conf = behind.type === 'q' ? 'high' : 'medium';
                                return { motif: 'pin', pinned: { square: pinned.square, piece: HIERO_PIECE_NAMES[pinned.type] }, against: { square: behind.square, piece: HIERO_PIECE_NAMES[behind.type] }, piece: HIERO_PIECE_NAMES[moved.type], square: to, confidence: conf, reason: `${cap(HIERO_PIECE_NAMES_CA[moved.type])} a ${to} clava ${HIERO_PIECE_NAMES_CA[pinned.type]} contra ${HIERO_PIECE_NAMES_CA[behind.type]}.` };
                            }
                            break;
                        }
                    }
                    f += df; r += dr;
                }
            }
            return null;
        }

        // Descoberta: en moure la peça es destapa la línia d'una peça pròpia de
        // llarg abast (alfil/torre/dama) que ara ataca el rei, la dama o la torre.
        function detectDiscoveryAfterFinalMove(beforeFinalFen, finalMoveUci) {
            const g = loadFen(beforeFinalFen);
            if (!g) return null;
            const before = boardMap(beforeFinalFen);
            const mv = applyUci(g, finalMoveUci);
            if (!mv) return null;
            const color = mv.color, enemy = oppColor(color), to = mv.to, from = mv.from;
            const after = boardMap(g.fen());
            // Casella del rei enemic.
            let enemyKing = null;
            for (const sq in after) { if (after[sq].type === 'k' && after[sq].color === enemy) { enemyKing = sq; break; } }
            const isSlider = t => t === 'b' || t === 'r' || t === 'q';
            // Escac descobert: el tauler està en escac i la peça moguda NO ataca
            // el rei (l'escac ve d'una altra peça pròpia darrere).
            if (g.in_check() && enemyKing) {
                const movedAttacksKing = attacksFrom(after, to, after[to] && after[to].type, color).some(h => h.square === enemyKing);
                let discoveredBy = null;
                for (const sq in after) {
                    if (sq === to) continue;
                    const p = after[sq];
                    if (!p || p.color !== color || !isSlider(p.type)) continue;
                    if (attacksFrom(after, sq, p.type, color).some(h => h.square === enemyKing)) { discoveredBy = { square: sq, type: p.type }; break; }
                }
                if (discoveredBy && !movedAttacksKing) {
                    return { motif: 'discovery', isCheck: true, discovered: { square: discoveredBy.square, piece: HIERO_PIECE_NAMES[discoveredBy.type] }, target: { square: enemyKing, piece: 'king' }, piece: HIERO_PIECE_NAMES[mv.piece], square: to, confidence: 'high', reason: `En moure a ${to} es destapa un escac descobert de ${HIERO_PIECE_NAMES_CA[discoveredBy.type]}.` };
                }
            }
            // Atac descobert (sense escac) sobre dama o torre: una peça pròpia de
            // llarg abast que ara ataca una q/r enemiga i que ABANS no ho feia
            // (perquè la peça moguda li tapava la línia des de `from`).
            for (const sq in after) {
                if (sq === to) continue;
                const p = after[sq];
                if (!p || p.color !== color || !isSlider(p.type)) continue;
                const afterHits = attacksFrom(after, sq, p.type, color).filter(h => h.piece === 'q' || h.piece === 'r');
                if (!afterHits.length) continue;
                const beforeHits = attacksFrom(before, sq, p.type, color).filter(h => h.piece === 'q' || h.piece === 'r').map(h => h.square);
                const fresh = afterHits.filter(h => beforeHits.indexOf(h.square) === -1);
                if (fresh.length) {
                    const t = fresh[0];
                    return { motif: 'discovery', isCheck: false, discovered: { square: sq, piece: HIERO_PIECE_NAMES[p.type] }, target: { square: t.square, piece: HIERO_PIECE_NAMES[t.piece] }, piece: HIERO_PIECE_NAMES[mv.piece], square: to, confidence: 'high', reason: `En moure a ${to} es destapa un atac de ${HIERO_PIECE_NAMES_CA[p.type]} sobre ${HIERO_PIECE_NAMES_CA[t.piece]}.` };
                }
            }
            return null;
        }

        // Promoció: la jugada final del jugador corona (UCI de 5 caràcters o SAN
        // amb =Q/=R/=B/=N).
        function detectPromotionMotif(initialFen, fullLineUci) {
            const info = replayLine(initialFen, fullLineUci);
            if (!info) return null;
            const fm = info.finalMove;
            const isPromo = !!fm.promotion || /=[QRBN]/i.test(fm.san || '') || /^[a-h][1-8][a-h][1-8][qrbn]$/i.test(fm.uci || '');
            if (!isPromo) return null;
            return { motif: 'promotion', piece: 'pawn', square: fm.to, confidence: 'high', reason: `La jugada final corona un peó a ${fm.to}.` };
        }

        // Guany de dama o torre: la línia captura una q/r, o el material net que
        // guanya el bàndol que resol és com a mínim d'una torre (5 punts).
        function detectMajorWinMotif(initialFen, fullLineUci, opts = {}) {
            const info = replayLine(initialFen, fullLineUci);
            if (!info) return null;
            const player = info.playerColor, enemy = oppColor(player);
            // Captura directa de dama/torre en alguna jugada del jugador.
            const majorCapture = info.moves.some(m => m.color === player && (m.captured === 'q' || m.captured === 'r'));
            // Material net (perspectiva del jugador) entre l'inici i el final de
            // la línia.
            const before = material(info.moves[0].beforeFen);
            const finalFen = info.moves[info.lastPlayerIdx].afterFen;
            const after = material(finalFen);
            const swing = (after[player] - after[enemy]) - (before[player] - before[enemy]);
            if (majorCapture) {
                return { motif: 'major_win', swing, captured: true, confidence: 'high', reason: 'La combinació guanya una peça major (dama o torre).' };
            }
            if (swing >= 5) {
                return { motif: 'major_win', swing, captured: false, confidence: swing >= 9 ? 'high' : 'medium', reason: `La línia guanya material decisiu (${swing} punts nets).` };
            }
            return null;
        }

        // Classificador central: carrega la FEN, aplica la línia, mira el tauler
        // just DESPRÉS de l'última jugada del jugador i retorna el motiu de final.
        function classifyPuzzleFinalMotif(initialFen, fullLineUci, opts = {}) {
            const none = { motif: 'none', motifs: [], isCheck: false, isMate: false, finalFen: null, finalMoveUci: null, finalMoveSan: null, confidence: 'low', reason: 'No s’ha detectat cap final tàctic clar.' };
            const info = replayLine(initialFen, fullLineUci);
            if (!info) return none;
            const fm = info.finalMove;
            const finalFen = fm.afterFen;
            const isMate = !!fm.inCheckmate;
            const isCheck = !!fm.inCheck;
            const finalEvalClear = typeof opts.finalEval === 'number' && Math.abs(opts.finalEval) >= (typeof opts.decisiveCp === 'number' ? opts.decisiveCp : 500);
            const marginOk = opts.marginOk !== false;

            const detections = []; // { motif, confidence, reason, extra }
            if (isMate) {
                detections.push({ motif: 'mate', confidence: 'high', reason: 'La seqüència acaba en escac i mat.' });
            }
            const promo = detectPromotionMotif(initialFen, fullLineUci);
            if (promo) detections.push(promo);
            const fork = detectRealForkAfterFinalMove(fm.beforeFen, fm.uci, { finalEvalClear });
            if (fork) detections.push(fork);
            const pin = detectPinAfterFinalMove(fm.beforeFen, fm.uci);
            if (pin) detections.push(pin);
            const disc = detectDiscoveryAfterFinalMove(fm.beforeFen, fm.uci);
            if (disc) detections.push(disc);
            const major = detectMajorWinMotif(initialFen, fullLineUci, opts);
            if (major) detections.push(major);
            // Escac: només com a final vàlid si hi ha avantatge/marge clars o si
            // porta a guany material clar (que ja seria major_win). Mai decoratiu.
            if (isCheck && !isMate) {
                let checkConf = 'low';
                if (major || finalEvalClear) checkConf = (major && major.confidence === 'high') ? 'high' : 'medium';
                if (!marginOk && !major) checkConf = 'low';
                detections.push({ motif: 'check', confidence: checkConf, reason: checkConf === 'low' ? 'Escac sense avantatge clar.' : 'La jugada final dona un escac amb avantatge decisiu.' });
            }

            // Descarta les deteccions de confiança baixa per a l'aprovació.
            const solid = detections.filter(d => d.confidence === 'high' || d.confidence === 'medium');
            if (!solid.length) {
                // Un escac és sempre un fet verificable del tauler: el reportem
                // com a motiu 'check' encara que sigui decoratiu (confiança
                // baixa), de manera que el filtre d'aprovació el rebutgi però
                // el motiu quedi identificat. La resta de casos → none.
                if (isCheck && !isMate) {
                    return { motif: 'check', motifs: ['check'], isCheck: true, isMate: false, finalFen, finalMoveUci: fm.uci, finalMoveSan: fm.san, confidence: 'low', reason: 'Escac sense avantatge clar.' };
                }
                return Object.assign({}, none, { isCheck, isMate, finalFen, finalMoveUci: fm.uci, finalMoveSan: fm.san });
            }
            // Motiu principal per prioritat; el mat sempre mana.
            solid.sort((a, b) => HIERO_MOTIF_PRIORITY.indexOf(a.motif) - HIERO_MOTIF_PRIORITY.indexOf(b.motif));
            const principal = solid[0];
            const motifs = [];
            solid.forEach(d => { if (motifs.indexOf(d.motif) === -1) motifs.push(d.motif); });
            // Escac/mat impliquen escac: fem-lo constar a `motifs` (informatiu)
            // encara que l'escac no sigui el motiu principal ni una detecció
            // pròpia. El principal, però, no canvia.
            if ((isCheck || isMate) && motifs.indexOf('check') === -1) motifs.push('check');
            return {
                motif: principal.motif,
                motifs,
                isCheck, isMate,
                finalFen, finalMoveUci: fm.uci, finalMoveSan: fm.san,
                confidence: principal.confidence,
                reason: principal.reason,
                details: principal
            };
        }

        return {
            classifyPuzzleFinalMotif,
            detectRealForkAfterFinalMove,
            detectPinAfterFinalMove,
            detectDiscoveryAfterFinalMove,
            detectPromotionMotif,
            detectMajorWinMotif
        };
    }

    // Comprova el filtre de FINAL TÀCTIC sobre un puzzle que ja porta els camps
    // finalMotif/finalMotifConfidence (calculats amb el classificador). PUR:
    // no necessita chess.js perquè treballa sobre metadades ja desades.
    function hieroglyphicMeetsFinalMotifCriteria(p, cfg) {
        if (!p) return false;
        if (!puzzleMeetsCriteria(p, cfg)) return false;
        const allowed = (cfg && Array.isArray(cfg.requiredFinalMotifs)) ? cfg.requiredFinalMotifs : HIERO_ALLOWED_FINAL_MOTIFS;
        if (!p.finalMotif || p.finalMotif === 'none') return false;
        if (allowed.indexOf(p.finalMotif) === -1) return false;
        if (p.finalMotifConfidence === 'low') return false;
        return true;
    }

    // Metadades d'ORIGEN d'una VARIANT LEGAL treta d'una FEN real d'una partida.
    // PUR: no modifica ni la partida ni el candidat; només retorna els camps a
    // enganxar (origin 'game_variant' + traçabilitat a la partida original).
    function hieroglyphicVariantMeta(entry, fen, moveNumber) {
        return {
            origin: 'game_variant',
            sourceGameId: (entry && entry.id) || null,
            sourceFen: fen || null,
            sourceMoveNumber: (moveNumber === 0 || moveNumber) ? moveNumber : null,
            adaptationNote: 'Variant legal des d’una posició de la teva partida.'
        };
    }

    // ----------------------------------------------------------------------
    // Línies del motor (PV) — és forçada o només il·lustrativa?
    // ----------------------------------------------------------------------
    // Una PV de Stockfish ("Bf4 Qxh7+ Kxh7") NO és una seqüència obligada: el
    // rival pot jugar altres coses. Abans de dir "la línia guanyadora era..."
    // cal DEMOSTRAR que la resposta del rival era forçada (única jugada legal,
    // o clarament forçada pel gap MultiPV) o que la línia és un mat forçat.
    // Aquest bloc calcula aquesta demostració a partir de dades del motor
    // (MultiPV abans i després de la millor jugada) i de fets verificables amb
    // chess.js (injectat via createPvBoardHelpers, per mantenir el nucli pur).

    // Llindar (cp) perquè la resposta del rival compti com a "clarament
    // forçada": qualsevol alternativa perd almenys això més. És més exigent
    // que el llindar dels exercicis (150) perquè aquí es fa una AFIRMACIÓ
    // ("forçada") i val més quedar-se curt que mentir.
    const PV_FORCED_REPLY_GAP_CP = 200;

    // Llindar (cp) perquè la posició del rival compti com a "clarament
    // perduda" després de la millor jugada. Si fins i tot la seva MILLOR
    // resposta el deixa per sota d'això, qualsevol altra també (per definició
    // del MultiPV): la línia no és forçada, però el RESULTAT sí — es pot dir
    // que totes les respostes acabaven igual de perdudes.
    const PV_LOSING_REPLY_CP = 300;

    // Les avaluacions ja convertides (mat → ±10000 cp) es comparen com a cp;
    // les crues (evalType 'mate' amb distància de mat) passen per
    // bestLineEvalScore, que ja fa dominar el mat.
    function pvEvalEntryForGap(e) {
        if (!e || typeof e.eval !== 'number') return e;
        if (e.evalType === 'mate' && Math.abs(e.eval) >= 9000) return { eval: e.eval, evalType: 'cp' };
        return e;
    }

    // Gap (cp) entre la millor opció i la segona d'una llista MultiPV, tolerant
    // tots dos formats d'avaluació (crua o convertida).
    function pvGapCp(list) {
        if (!Array.isArray(list) || !list.length) return null;
        return bestLineGapCp(list.map(pvEvalEntryForGap));
    }

    // Fàbrica d'ajudants de tauler per a la PV. Rep el constructor de chess.js
    // (window.Chess al navegador, require('chess.js').Chess als tests) i
    // retorna funcions que comproven fets REALS sobre el tauler: jugades
    // legals, escacs, captures, mats. Retorna null si no hi ha constructor.
    function createPvBoardHelpers(ChessCtor) {
        if (typeof ChessCtor !== 'function') return null;

        function loadFen(fen) {
            try {
                const g = new ChessCtor(fen);
                // chess.js 0.10 accepta FEN corruptes en silenci: validem que hi
                // hagi tauler jugable.
                return (g && typeof g.moves === 'function') ? g : null;
            } catch (e) { return null; }
        }

        function applyMoveOn(g, move) {
            const raw = String(move || '').trim();
            if (!raw) return null;
            try {
                if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(raw)) {
                    // Coronació per defecte a dama si la UCI no la porta (mateix
                    // criteri que la resta de l'app); chess.js la ignora quan la
                    // jugada no corona.
                    return g.move({
                        from: raw.slice(0, 2).toLowerCase(),
                        to: raw.slice(2, 4).toLowerCase(),
                        promotion: raw.length > 4 ? raw[4].toLowerCase() : 'q'
                    }) || null;
                }
                return g.move(raw, { sloppy: true }) || null;
            } catch (e) { return null; }
        }

        // Fets d'un sol moviment (UCI o SAN) sobre una FEN, en un objecte pla
        // que el redactor pot convertir en text català. Retorna null si la
        // jugada no és legal.
        function moveFacts(fen, move) {
            const g = loadFen(fen);
            if (!g) return null;
            const field = String(fen || '').split(' ')[0] || '';
            const mv = applyMoveOn(g, move);
            if (!mv) return null;
            let desambigua = false;
            if (mv.piece === 'n' || mv.piece === 'b' || mv.piece === 'r' || mv.piece === 'q') {
                const letter = mv.color === 'w' ? mv.piece.toUpperCase() : mv.piece.toLowerCase();
                desambigua = (field.match(new RegExp(letter, 'g')) || []).length > 1;
            }
            return {
                peca: mv.piece,
                color: mv.color,
                origen: mv.from,
                desti: mv.to,
                captura: mv.captured || null,
                san: mv.san,
                escac: mv.san.indexOf('+') !== -1 || mv.san.indexOf('#') !== -1,
                mat: mv.san.indexOf('#') !== -1,
                enroc: mv.flags.indexOf('k') !== -1 ? 'k' : (mv.flags.indexOf('q') !== -1 ? 'q' : null),
                coronacio: mv.promotion || null,
                desambigua: desambigua
            };
        }

        // Fets verificables de la PV d'una errada: després de la primera jugada
        // (la millor del jugador), quantes respostes legals té el rival? Està en
        // escac? La resposta de la PV captura la dama? La línia acaba en mat FET
        // PEL JUGADOR? Tot surt de reproduir la línia amb chess.js.
        function pvBoardFacts(fen, pv) {
            const g = loadFen(fen);
            if (!g) return null;
            const list = Array.isArray(pv) ? pv : [];
            const facts = {
                pliesVerified: 0,
                opponentLegalReplies: null,
                opponentInCheck: null,
                replyIsOnlyLegal: null,
                pvEndsInMate: false,
                firstMoveIsCheck: false,
                firstMoveIsCapture: false,
                firstMoveCapturesQueen: false,
                replyIsCheck: false,
                replyIsCapture: false,
                replyCapturesQueen: false,
                replyCaptureUndefended: false
            };
            for (let i = 0; i < list.length; i++) {
                const mv = applyMoveOn(g, list[i]);
                if (!mv) break;
                facts.pliesVerified++;
                if (i === 0) {
                    facts.firstMoveIsCheck = g.in_check();
                    facts.firstMoveIsCapture = !!mv.captured;
                    facts.firstMoveCapturesQueen = mv.captured === 'q';
                    facts.opponentInCheck = g.in_check();
                    facts.opponentLegalReplies = g.moves().length;
                    facts.replyIsOnlyLegal = facts.opponentLegalReplies === 1;
                } else if (i === 1) {
                    facts.replyIsCheck = g.in_check();
                    facts.replyIsCapture = !!mv.captured;
                    facts.replyCapturesQueen = mv.captured === 'q';
                    // La captura era d'una peça penjada si el jugador no pot
                    // recapturar a la mateixa casella.
                    if (mv.captured) {
                        try {
                            const recaptures = g.moves({ verbose: true })
                                .filter(m => m.to === mv.to && m.captured);
                            facts.replyCaptureUndefended = recaptures.length === 0;
                        } catch (e) {}
                    }
                }
                if (g.in_checkmate()) {
                    // Mat només compta com a demostració si el fa el JUGADOR
                    // (plies parells de la línia: 1a, 3a, 5a jugada...).
                    if (i % 2 === 0) facts.pvEndsInMate = true;
                    break;
                }
            }
            return facts;
        }

        return { moveFacts: moveFacts, pvBoardFacts: pvBoardFacts };
    }

    // ----------------------------------------------------------------------
    // Navegació de línies del motor (PV) al tauler d'anàlisi
    // ----------------------------------------------------------------------
    // Aplica un moviment (UCI «e2e4»/«e7e8q» o SAN «Nc3») sobre una instància de
    // chess.js i retorna l'objecte de jugada, o null si no és legal. La coronació
    // per defecte és a dama quan la UCI no la porta (mateix criteri que la resta
    // de l'app).
    function applyPvLineMove(g, move) {
        const raw = String(move || '').trim();
        if (!raw) return null;
        try {
            if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(raw)) {
                return g.move({
                    from: raw.slice(0, 2).toLowerCase(),
                    to: raw.slice(2, 4).toLowerCase(),
                    promotion: raw.length > 4 ? raw[4].toLowerCase() : 'q'
                }) || null;
            }
            return g.move(raw, { sloppy: true }) || null;
        } catch (e) { return null; }
    }

    // Reprodueix una línia del motor des d'una FEN i retorna la llista de
    // posicions resultants. És la font ÚNICA per a la navegació de PV al tauler
    // d'anàlisi: cada element porta la SAN (per mostrar), la UCI (per reproduir
    // sense ambigüitat), les caselles origen/destí, la FEN abans i després, i la
    // numeració DERIVADA DE LA FEN (torn i número de jugada complet), de manera
    // que funciona encara que la línia comenci amb les negres o al mig de la
    // partida. Prefereix la UCI; cau a SAN. S'atura sense llançar a la primera
    // jugada il·legal (línia truncada o buida) i ho indica a `truncatedAt`.
    function buildPvPositions(ChessCtor, startFen, moves) {
        const result = { startFen: startFen || null, plies: [], truncatedAt: null };
        if (typeof ChessCtor !== 'function' || !startFen) return result;
        let g;
        try { g = new ChessCtor(startFen); } catch (e) { return result; }
        if (!g || typeof g.move !== 'function' || typeof g.fen !== 'function') return result;
        const list = Array.isArray(moves) ? moves : [];
        for (let i = 0; i < list.length; i++) {
            const fenBefore = g.fen();
            const parts = fenBefore.split(' ');
            const isWhite = parts[1] !== 'b';
            const moveNo = parseInt(parts[5], 10) || 1;
            const mv = applyPvLineMove(g, list[i]);
            if (!mv) { result.truncatedAt = i; break; }
            result.plies.push({
                index: i,
                san: mv.san,
                uci: mv.from + mv.to + (mv.promotion ? mv.promotion : ''),
                from: mv.from,
                to: mv.to,
                piece: mv.piece,
                promotion: mv.promotion || null,
                captured: mv.captured || null,
                castle: (mv.flags && mv.flags.indexOf('k') !== -1) ? 'k'
                    : ((mv.flags && mv.flags.indexOf('q') !== -1) ? 'q' : null),
                isWhite: isWhite,
                moveNo: moveNo,
                fenBefore: fenBefore,
                fenAfter: g.fen()
            });
        }
        return result;
    }

    // Numeració/format per mostrar una línia PV: per a cada ply, quin número de
    // jugada s'ha de mostrar (o cap) davant de la SAN, seguint la notació PGN
    // habitual — «4.» abans d'una blanca i «4…» només davant de la primera negra
    // de la línia (no es repeteix el número davant de cada mitja jugada).
    function pvDisplayTokens(plies) {
        return (Array.isArray(plies) ? plies : []).map(function (p, i) {
            let numberLabel = null;
            if (p.isWhite) numberLabel = p.moveNo + '.';
            else if (i === 0) numberLabel = p.moveNo + '…';
            return { index: i, numberLabel: numberLabel, san: p.san };
        });
    }

    // Etiqueta accessible (aria-label) d'un moviment de la línia, en català:
    // «Veure la posició després de 5, cavall a c3».
    function pvMoveAriaLabel(ply) {
        if (!ply) return '';
        const num = ply.moveNo;
        if (ply.castle === 'k') return `Veure la posició després de ${num}, enroc curt`;
        if (ply.castle === 'q') return `Veure la posició després de ${num}, enroc llarg`;
        const names = { p: 'peó', n: 'cavall', b: 'alfil', r: 'torre', q: 'dama', k: 'rei' };
        const piece = names[ply.piece] || 'peça';
        let label = `Veure la posició després de ${num}, ${piece} a ${ply.to}`;
        if (ply.captured) label += ', captura';
        if (ply.promotion) label += `, corona a ${names[ply.promotion] || 'dama'}`;
        return label;
    }

    // Estat de navegació d'una línia: limita l'índex de pas a l'interval vàlid
    // [0, nombre de plies]. 0 = posició inicial de l'anàlisi; N = final de la línia.
    function pvStepClamp(step, total) {
        const t = Math.max(0, total | 0);
        const s = Math.round(Number(step) || 0);
        return Math.max(0, Math.min(t, s));
    }

    // ----------------------------------------------------------------------
    // MOMENT CLAU DE LA PARTIDA
    // ----------------------------------------------------------------------
    // Selecciona la decisió MÉS important de l'usuari en una partida, per
    // rellevància PEDAGÒGICA (no per pèrdua bruta). Totes les avaluacions
    // arriben ja NORMALITZADES a la perspectiva de l'usuari (positiu = bo per a
    // l'usuari), en centipeons, amb el mat codificat com a ±10000 (conveni de
    // l'app; per comparar es fa via bestLineEvalScore, que domina qualsevol cp).
    // Les funcions són PURES i testejables; la construcció de candidats (que
    // necessita chess.js/DOM) viu a app.js.
    const KEY_MOMENT = {
        MATE_CP: 9000,     // |eval| >= això → mat (codi controlat)
        WIN: 150,          // avantatge clar (≈1,5 peons)
        DECISIVE: 600,     // avantatge decisiu (≈6 peons)
        MIN_SCORE: 22,     // llindar mínim de rellevància per mostrar un moment
        TIE: 6,            // marge de puntuació per considerar dos candidats "semblants"
        EQUIVALENT_CP: 40  // alternatives "gairebé equivalents" (mode pràctica)
    };

    function keyMomentNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

    // Cubell d'avantatge (perspectiva de l'usuari): 2 guanyada decisiva, 1
    // guanyada, 0 igualada, -1 perduda, -2 perduda decisiva. El mat (±MATE_CP)
    // cau a ±2. Serveix per detectar CANVIS D'ESTAT de la partida.
    function keyMomentBucket(cp) {
        const v = keyMomentNum(cp);
        if (v === null) return 0;
        if (v >= KEY_MOMENT.DECISIVE) return 2;
        if (v >= KEY_MOMENT.WIN) return 1;
        if (v <= -KEY_MOMENT.DECISIVE) return -2;
        if (v <= -KEY_MOMENT.WIN) return -1;
        return 0;
    }

    // Rendiments decreixents: una pèrdua pesa menys com més perduda ja estava la
    // posició ABANS de la jugada. 400cp en igualada > 600cp en una de −10.
    function keyMomentRecoverability(evalBefore) {
        const eb = keyMomentNum(evalBefore);
        if (eb === null) return 0.5;
        if (eb >= -KEY_MOMENT.WIN) return 1.0;      // igualada o millor
        if (eb >= -400) return 0.6;                 // una mica pitjor
        if (eb >= -KEY_MOMENT.DECISIVE) return 0.4; // clarament pitjor
        if (eb > -KEY_MOMENT.MATE_CP) return 0.2;   // gairebé perduda
        return 0.05;                                // ja perduda (o rebent mat)
    }

    // Pes del canvi d'estat de la partida (de bucket abans → bucket després).
    function keyMomentStateChangeScore(before, after) {
        if (after >= before) return 0;              // no ha empitjorat per a l'usuari
        const drop = before - after;                // caiguda de cubells (1..4)
        let s = drop * 8;                            // base proporcional
        if (before >= 1 && after <= 0) s += 6;       // deixar escapar avantatge
        if (before >= 0 && after <= -1) s += 8;      // passar a perdedora
        if (before === 2) s += 4;                    // partia d'avantatge decisiu
        return Math.min(30, s);
    }

    // Claredat de la millor jugada: com de superior és sobre la 2a opció (gap del
    // MultiPV, en cp comparables). Com més clar, més pedagògic; si totes les
    // alternatives valen gairebé el mateix, la lliçó és feble.
    function keyMomentClarityScore(gapCp, legalCount) {
        if (typeof legalCount === 'number' && legalCount <= 1) return 0; // jugada obligada
        if (gapCp === null || gapCp === undefined) return 0;             // sense dades
        if (gapCp === Infinity) return 12;                              // una sola jugada bona clara
        if (gapCp >= 300) return 20;
        if (gapCp >= 150) return 14;
        if (gapCp >= 80) return 8;
        return 2;                                                        // alternatives ~iguals
    }

    // Codi de motiu VERIFICABLE (de dades de Stockfish + posició), no de text d'IA.
    function keyMomentReasonCode(c) {
        const eb = keyMomentNum(c.evalBefore);
        const ea = keyMomentNum(c.evalAfter);
        const before = keyMomentBucket(eb);
        const after = keyMomentBucket(ea);
        const loss = (typeof c.cpLoss === 'number') ? c.cpLoss : ((eb !== null && ea !== null) ? eb - ea : 0);
        const flipped = after < before;
        const missedMate = eb !== null && eb >= KEY_MOMENT.MATE_CP && (ea === null || ea < KEY_MOMENT.MATE_CP);
        if (missedMate) return 'missed_win';
        if (c.phase === 'endgame' && flipped && (before >= 0 || after <= -1)) return 'endgame_turning_point';
        if (c.forcingInfo && c.forcingInfo.isLineForced === true && loss >= 200) return 'missed_tactic';
        if (before === 2 && after <= 1) return 'missed_win';
        if (before >= 1 && after === 0) return 'lost_advantage';
        if (before >= 0 && after <= -1) return 'turned_losing';
        if (loss >= 300) return 'lost_material';
        return 'strategic_error';
    }

    // Explicació LOCAL i determinista segons el codi de motiu (una capa d'IA
    // només en pot millorar l'estil, mai inventar valoracions ni jugades).
    const KEY_MOMENT_EXPLANATIONS = {
        missed_win: 'Tenies una continuació guanyadora, però la jugada de la partida va deixar escapar gran part de l’avantatge.',
        lost_advantage: 'La posició era favorable, però aquesta decisió va permetre al rival tornar a la partida.',
        turned_losing: 'La posició estava equilibrada fins que aquesta jugada va donar un avantatge clar al rival.',
        missed_tactic: 'Hi havia una combinació tàctica concreta que permetia guanyar material o atacar el rival.',
        lost_material: 'Aquesta jugada va permetre una pèrdua important de material.',
        king_safety: 'Aquesta decisió va debilitar la seguretat del teu rei.',
        endgame_turning_point: 'Aquesta decisió va canviar el resultat probable del final.',
        strategic_error: 'Aquesta decisió va deteriorar la teva posició de manera notable.'
    };
    function keyMomentExplanation(reasonCode) {
        return KEY_MOMENT_EXPLANATIONS[reasonCode] || KEY_MOMENT_EXPLANATIONS.strategic_error;
    }

    // Puntuació de rellevància pedagògica d'un candidat (jugada de l'usuari).
    //   rellevància = impacte_avaluació + canvi_estat + claredat_millor_jugada
    //               + importància_tàctica + valor_pedagògic
    //               − penalització_posició_ja_perduda − penalització_dades_incompletes
    // Retorna { score, reasonCode, components, disqualified }.
    function scoreKeyMomentCandidate(candidate, context) {
        const c = candidate || {};
        const ctx = context || {};
        const eb = keyMomentNum(c.evalBefore);
        const ea = keyMomentNum(c.evalAfter);
        // Dades incompletes: sense les dues avaluacions no es pot jutjar.
        if (eb === null || ea === null) {
            return { score: -Infinity, reasonCode: null, disqualified: true, components: null };
        }
        // Jugada obligada / amb una única opció legal: no és una "decisió".
        if (typeof c.legalCount === 'number' && c.legalCount <= 1) {
            return { score: -Infinity, reasonCode: null, disqualified: true, components: null };
        }
        // Posició ja perduda per mat abans de moure: no hi ha res a decidir.
        if (eb <= -KEY_MOMENT.MATE_CP) {
            return { score: -Infinity, reasonCode: null, disqualified: true, components: null };
        }
        const loss = (typeof c.cpLoss === 'number') ? c.cpLoss : (eb - ea);
        const before = keyMomentBucket(eb);
        const after = keyMomentBucket(ea);

        // 1. Impacte d'avaluació amb rendiments decreixents.
        const baseLoss = Math.max(0, Math.min(1000, loss));
        const recov = keyMomentRecoverability(eb);
        const impacte = (baseLoss / 20) * recov;

        // 2. Canvi d'estat de la partida.
        const estat = keyMomentStateChangeScore(before, after);

        // La claredat i el valor pedagògic només compten en proporció al que
        // COSTA de debò la jugada: una millor jugada molt clara però amb una
        // pèrdua insignificant (típic a l'obertura) NO és un moment clau.
        const lossWeight = Math.max(0, Math.min(1, loss / 200));

        // 3. Claredat de la millor jugada (gap del MultiPV).
        const gap = bestLineGapCp(Array.isArray(c.alternatives)
            ? c.alternatives.map(function (a) { return { eval: a.eval, evalType: a.evalType }; })
            : null);
        const claredat = keyMomentClarityScore(gap, c.legalCount) * lossWeight;

        // 4. Importància tàctica (mat deixat escapar, línia forçada, material).
        let tactica = 0;
        if (eb >= KEY_MOMENT.MATE_CP && ea < KEY_MOMENT.MATE_CP) tactica = 15;
        else if (c.forcingInfo && c.forcingInfo.isLineForced === true) tactica = 8;
        else if (loss >= 300) tactica = 5;
        else if (loss >= KEY_MOMENT.WIN) tactica = 2;

        // 5. Valor pedagògic (posició encara en joc + jugada clara disponible).
        let pedag = 0;
        if (before >= 0) pedag += 6;                          // podies triar bé
        if (gap !== null && gap !== undefined && gap >= 150) pedag += 4;
        pedag *= lossWeight;

        // Penalitzacions.
        const penaltyLost = before <= -1 ? (before === -1 ? 8 : 22) : 0;
        let penaltyData = 0;
        const minDepth = typeof ctx.minDepth === 'number' ? ctx.minDepth : 10;
        if (typeof c.depth === 'number' && c.depth > 0 && c.depth < minDepth) penaltyData += 8;
        if (gap === null || gap === undefined) penaltyData += 4;

        const score = impacte + estat + claredat + tactica + pedag - penaltyLost - penaltyData;
        const components = { impacte, estat, claredat, tactica, pedag, penaltyLost, penaltyData, gap, before, after, loss };
        return { score: score, reasonCode: keyMomentReasonCode(c), disqualified: loss <= 0, components: components };
    }

    // Selecciona el millor candidat (o null si cap arriba al llindar mínim).
    // Desempat: (1) més canvi d'estat de la partida, (2) millor jugada més clara,
    // (3) més recuperable, (4) el moment MÉS PRIMERENC (sovint la causa dels
    // errors posteriors) — evita que un error derivat en substitueixi l'original.
    function selectKeyMoment(candidates, context) {
        const list = Array.isArray(candidates) ? candidates : [];
        const scored = [];
        for (let i = 0; i < list.length; i++) {
            const c = list[i];
            const r = scoreKeyMomentCandidate(c, context);
            if (r.disqualified || !isFinite(r.score) || r.score < KEY_MOMENT.MIN_SCORE) continue;
            scored.push({ candidate: c, res: r });
        }
        if (!scored.length) return null;
        scored.sort(function (a, b) {
            if (Math.abs(a.res.score - b.res.score) > KEY_MOMENT.TIE) return b.res.score - a.res.score;
            const stA = a.res.components.before - a.res.components.after;
            const stB = b.res.components.before - b.res.components.after;
            if (stA !== stB) return stB - stA;                                   // més canvi de resultat
            const gA = a.res.components.gap === Infinity ? 1e9 : (a.res.components.gap || 0);
            const gB = b.res.components.gap === Infinity ? 1e9 : (b.res.components.gap || 0);
            if (gA !== gB) return gB - gA;                                       // millor jugada més clara
            const ebA = keyMomentNum(a.candidate.evalBefore) || 0;
            const ebB = keyMomentNum(b.candidate.evalBefore) || 0;
            if (ebA !== ebB) return ebB - ebA;                                   // més recuperable (menys perduda)
            const pA = keyMomentNum(a.candidate.ply); const pB = keyMomentNum(b.candidate.ply);
            if (pA !== null && pB !== null && pA !== pB) return pA - pB;         // el més primerenc
            return (a.candidate.moveNumber || 0) - (b.candidate.moveNumber || 0);
        });
        const win = scored[0];
        const c = win.candidate;
        const reasonCode = win.res.reasonCode;
        return {
            fen: c.fenBefore,
            moveNumber: c.moveNumber,
            ply: c.ply,
            playerColor: c.playerColor,
            phase: c.phase,
            playedMove: { uci: c.playedMoveUci || null, san: c.playedMoveSan || null },
            bestMove: { uci: c.bestMoveUci || null, san: c.bestMoveSan || null },
            bestPv: Array.isArray(c.bestPv) ? c.bestPv : [],
            evalBefore: keyMomentNum(c.evalBefore),
            evalAfter: keyMomentNum(c.evalAfter),
            cpLoss: (typeof c.cpLoss === 'number') ? c.cpLoss : (keyMomentNum(c.evalBefore) - keyMomentNum(c.evalAfter)),
            classification: c.classification || null,
            score: Math.round(win.res.score * 10) / 10,
            reasonCode: reasonCode,
            explanation: keyMomentExplanation(reasonCode),
            orientation: c.playerColor === 'b' ? 'black' : 'white'
        };
    }

    // Veredicte pedagògic del MODE PRÀCTICA: compara la jugada provada amb la
    // millor, les alternatives gairebé equivalents i la jugada real de la partida.
    // Totes les avaluacions en perspectiva de l'usuari (cp). PUR i testejable.
    function classifyPracticeAttempt(params) {
        const p = params || {};
        const eq = typeof p.equivalentCp === 'number' ? p.equivalentCp : KEY_MOMENT.EQUIVALENT_CP;
        const attempt = String(p.attemptUci || '');
        const best = String(p.bestUci || '');
        const played = String(p.playedGameUci || '');
        const attemptCp = keyMomentNum(p.attemptCpUser);
        const bestCp = keyMomentNum(p.bestCpUser);
        const playedCp = keyMomentNum(p.playedGameCpUser);
        const alts = Array.isArray(p.alternatives) ? p.alternatives : [];

        if (attempt && best && attempt === best) {
            return { code: 'best', text: 'Has trobat la millor jugada.' };
        }
        // Alternativa gairebé equivalent: per llista d'alternatives o per avaluació.
        const matchAlt = alts.find(function (a) { return a && String(a.uci) === attempt; });
        if (matchAlt && bestCp !== null && keyMomentNum(matchAlt.cpUser) !== null
            && (bestCp - keyMomentNum(matchAlt.cpUser)) <= eq) {
            return { code: 'equivalent', text: 'És una alternativa gairebé equivalent.' };
        }
        if (attemptCp !== null && bestCp !== null && (bestCp - attemptCp) <= eq) {
            return { code: 'equivalent', text: 'És una alternativa gairebé equivalent.' };
        }
        if (attempt && played && attempt === played) {
            return { code: 'repeated', text: 'Has repetit la jugada de la partida.' };
        }
        if (attemptCp !== null && playedCp !== null && bestCp !== null
            && attemptCp > (playedCp + eq) && (bestCp - attemptCp) > eq) {
            return { code: 'better_not_best', text: 'És millor que la jugada de la partida, però encara hi havia una opció més forta.' };
        }
        return { code: 'still_missing', text: 'Aquesta jugada continua perdent l’oportunitat.' };
    }

    // Combina les dades del motor i els fets del tauler en el forcingInfo d'una
    // errada. Convenció de veritat PRUDENT: true = demostrat; false = NO
    // demostrat (encara que potser ho sigui); null = sense dades per jutjar-ho.
    function computePvForcingInfo(data) {
        const d = data || {};
        const bestMoveGapCp = pvGapCp(d.multipvBefore);
        const legal = (typeof d.opponentLegalReplies === 'number' && isFinite(d.opponentLegalReplies))
            ? d.opponentLegalReplies : null;
        const replyIsOnlyLegal = legal === 1;
        let opponentReplyGapCp = pvGapCp(d.replyAlternatives);
        // bestLineGapCp retorna Infinity quan només hi ha UNA línia, però això
        // només demostra res si el rival té de debò una única jugada legal; si
        // en té més, el gap real és desconegut.
        if (opponentReplyGapCp === Infinity && !replyIsOnlyLegal) opponentReplyGapCp = null;
        const threshold = (typeof d.forcedReplyGapCp === 'number') ? d.forcedReplyGapCp : PV_FORCED_REPLY_GAP_CP;
        const mateForPlayer = d.mateForPlayer === true || d.pvEndsInMate === true;

        let isOpponentReplyForced = null;
        if (replyIsOnlyLegal) isOpponentReplyForced = true;
        else if (typeof opponentReplyGapCp === 'number') isOpponentReplyForced = opponentReplyGapCp >= threshold;
        else if (legal !== null && legal > 1) isOpponentReplyForced = false; // no demostrat

        let isLineForced = null;
        if (mateForPlayer || isOpponentReplyForced === true) isLineForced = true;
        else if (isOpponentReplyForced === false) isLineForced = false;

        // "Perduda igualment": encara que la línia no sigui forçada, si la
        // MILLOR resposta del rival (màxim del MultiPV, en la seva perspectiva)
        // ja el deixa clarament perdut, qualsevol resposta l'hi deixa. També es
        // pot demostrar amb evalAfterBest (perspectiva del JUGADOR: positiu i
        // gran = el rival està perdut faci el que faci).
        const losingCp = typeof d.losingReplyCp === 'number' ? d.losingReplyCp : PV_LOSING_REPLY_CP;
        let allRepliesLosing = null;
        if (Array.isArray(d.replyAlternatives) && d.replyAlternatives.length) {
            const scores = d.replyAlternatives
                .map(e => bestLineEvalScore(pvEvalEntryForGap(e)))
                .filter(s => s !== null);
            if (scores.length) allRepliesLosing = Math.max.apply(null, scores) <= -losingCp;
        }
        if (allRepliesLosing === null && typeof d.evalAfterBest === 'number') {
            allRepliesLosing = d.evalAfterBest >= losingCp;
        }
        if (allRepliesLosing === null && mateForPlayer) allRepliesLosing = true;

        return {
            bestMoveGapCp: bestMoveGapCp,
            opponentReplyGapCp: opponentReplyGapCp,
            opponentLegalReplies: legal,
            opponentInCheck: typeof d.opponentInCheck === 'boolean' ? d.opponentInCheck : null,
            replyIsOnlyLegal: legal === null ? null : replyIsOnlyLegal,
            endsInMate: mateForPlayer,
            isOpponentReplyForced: isOpponentReplyForced,
            isLineForced: isLineForced,
            allRepliesLosing: allRepliesLosing
        };
    }

    // Construeix el forcingInfo d'una errada a partir del que hi hagi: la FEN
    // de decisió i la PV (per als fets del tauler, si board no és null), el
    // MultiPV de la posició de decisió, les alternatives de resposta del rival
    // (MultiPV després de la millor jugada, si la reanàlisi profunda les ha
    // calculades) i l'avaluació prèvia (un mat a favor demostra línia forçada).
    function buildPvForcingInfo(params) {
        const p = params || {};
        const board = p.board || null;
        const facts = (board && typeof board.pvBoardFacts === 'function' && p.fen)
            ? board.pvBoardFacts(p.fen, p.bestPv || [])
            : null;
        const evalBefore = typeof p.evalBefore === 'number' ? p.evalBefore : null;
        const mateForPlayer = p.mateForPlayer === true
            || (p.evalBeforeType === 'mate' && evalBefore !== null && evalBefore > 0)
            // Avaluacions ja convertides: ±10000 és el codi de mat de l'app.
            || (evalBefore !== null && evalBefore >= 9000)
            || !!(facts && facts.pvEndsInMate);
        return computePvForcingInfo({
            multipvBefore: p.multipvBefore,
            replyAlternatives: p.replyAlternatives,
            evalAfterBest: typeof p.evalAfterBest === 'number' ? p.evalAfterBest : undefined,
            opponentLegalReplies: facts ? facts.opponentLegalReplies : null,
            opponentInCheck: facts ? facts.opponentInCheck : null,
            pvEndsInMate: facts ? facts.pvEndsInMate : null,
            mateForPlayer: mateForPlayer,
            forcedReplyGapCp: p.forcedReplyGapCp,
            losingReplyCp: p.losingReplyCp
        });
    }

    // Quin llenguatge es pot fer servir per explicar la PV d'una errada?
    //   'forced'       → demostrat: es pot dir "la seqüència forçada era..."
    //   'illustrative' → línia real del motor però NO demostrada com a forçada:
    //                    "una possible variant del motor és..."
    //   'unclear'      → sense prou dades: no s'explica la PV, només la millor
    //                    jugada.
    function classifyPvLanguage(error) {
        const e = error || {};
        const pv = (Array.isArray(e.bestPv) && e.bestPv.length) ? e.bestPv
            : ((Array.isArray(e.pv) && e.pv.length) ? e.pv
                : (Array.isArray(e.bestMovePv) ? e.bestMovePv : []));
        if (pv.length < 2) return 'unclear'; // sense línia més enllà de la millor jugada
        const fi = e.forcingInfo;
        if (!fi || typeof fi !== 'object') return 'unclear';
        if (fi.isLineForced === true) return 'forced';
        if (fi.isLineForced === false) return 'illustrative';
        return 'unclear';
    }

    // ----------------------------------------------------------------------
    // Veu de l'entrenador (estil de redacció de les ressenyes)
    // ----------------------------------------------------------------------
    // Tres registres per als MATEIXOS fets: la partida, les errades i les
    // jugades no canvien mai; només canvia la manera d'explicar-les.
    //   'casual'    → planer i amable, sense tecnicismes ni notació.
    //   'balanced'  → didàctic (per defecte), vocabulari escacístic moderat.
    //   'technical' → precís i professional, sense fer-se més llarg.
    const REVIEW_VOICE_STYLES = ['casual', 'balanced', 'technical'];

    // Qualsevol valor desconegut (o antic) cau a 'balanced'.
    function normalizeReviewVoiceStyle(style) {
        return REVIEW_VOICE_STYLES.indexOf(style) !== -1 ? style : 'balanced';
    }

    // Frase de la "continuació" segons el llenguatge permès. parts:
    //   lineText        → la línia ja descrita en llenguatge planer
    //   bestText        → la millor jugada descrita (fallback quan no es pot
    //                     explicar la línia)
    //   replyIsOnlyLegal→ si la resposta del rival era l'única legal, es diu
    //                     explícitament (és el cas més fort i és demostrat)
    //   allRepliesLosing→ la línia no és forçada, però el RESULTAT sí: fins i
    //                     tot la millor resposta del rival el deixava perdut,
    //                     així que la variant s'explica amb aquesta força extra.
    // style: la MATEIXA prudència en tres registres. Cap veu no pot dir
    // "forçat" si no està demostrat; el casual ho diu sense la paraula
    // "seqüència" i el tècnic manté la terminologia exacta.
    const PV_NARRATION_BY_STYLE = {
        casual: {
            forcedOnly: seq => 'A partir d’aquí les jugades venien soles: ' + seq + '. El rival només tenia aquesta resposta.',
            forced: seq => 'A partir d’aquí les jugades venien soles: ' + seq + '.',
            illustrativeLosing: seq => 'El motor proposava, per exemple: ' + seq + '. El rival podia jugar altres coses, però seguia perdut igualment.',
            illustrative: seq => 'El motor proposava, per exemple: ' + seq + '. El rival també tenia altres opcions.',
            bestOnly: best => 'La millor jugada era ' + best + '.'
        },
        balanced: {
            forcedOnly: seq => 'La seqüència forçada era ' + seq + '; la resposta del rival era l’única legal.',
            forced: seq => 'La seqüència forçada era ' + seq + '.',
            illustrativeLosing: seq => 'Una possible variant del motor és ' + seq + '; el rival tenia altres respostes, però totes el deixaven igual de perdut.',
            illustrative: seq => 'Una possible variant del motor és ' + seq + '.',
            bestOnly: best => 'La millor jugada era ' + best + '.'
        },
        technical: {
            forcedOnly: seq => 'La seqüència forçada era ' + seq + '; la rèplica del rival era l’única legal.',
            forced: seq => 'La seqüència forçada era ' + seq + '.',
            illustrativeLosing: seq => 'Variant il·lustrativa del motor: ' + seq + '. Cap resposta del rival evitava la posició perduda.',
            illustrative: seq => 'Variant il·lustrativa del motor (no forçada): ' + seq + '.',
            bestOnly: best => 'La millor jugada era ' + best + '.'
        }
    };
    function pvNarrationText(language, parts, style) {
        const p = parts || {};
        const t = PV_NARRATION_BY_STYLE[normalizeReviewVoiceStyle(style)];
        const seq = String(p.lineText || '').trim();
        const best = String(p.bestText || '').trim();
        if (language === 'forced' && seq) {
            return p.replyIsOnlyLegal ? t.forcedOnly(seq) : t.forced(seq);
        }
        if (language === 'illustrative' && seq) {
            return p.allRepliesLosing ? t.illustrativeLosing(seq) : t.illustrative(seq);
        }
        return best ? t.bestOnly(best) : '';
    }

    // ----------------------------------------------------------------------
    // Qualitat de la ressenya postpartida (lògica pura; app.js hi delega)
    // ----------------------------------------------------------------------

    // Norma d'una jugada per comparar-la: sense anotacions (+ # ! ?) i en
    // minúscula si és UCI, perquè "e2e4" i "E2E4" siguin la mateixa jugada.
    function normalizeMoveForKey(move) {
        const raw = String(move == null ? '' : move).trim().replace(/[+#!?]/g, '');
        return /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(raw) ? raw.toLowerCase() : raw;
    }

    // Clau única d'una errada o d'un moment clau (posició de decisió + jugada
    // feta), per no repetir la mateixa errada a "Moments clau" i a "Errades
    // comentades". Amb FEN la clau és fiable; sense FEN cau al número de jugada.
    function reviewErrorKey(err) {
        const e = err || {};
        const fen = String(e.fen || '').split(' ').slice(0, 4).join(' ');
        const played = normalizeMoveForKey(e.playerMove || e.playedUci || e.playerMoveSan || e.played);
        if (fen) return fen + '|' + played;
        return 'n:' + (e.moveNumber == null ? '?' : e.moveNumber) + '|' + played;
    }

    // Validació forta d'una errada abans de mostrar-la a la ressenya. Una
    // errada només és mostrable si té posició de decisió (FEN), un número de
    // jugada dins de la partida real, la jugada feta i la millor jugada són
    // legals sobre aquella FEN, i no són la mateixa jugada.
    //
    // opts.maxMoveNumber: nombre real de jugades (numeració completa) de la
    //   partida; si és conegut, cap errada pot dir "Jugada 15" en una partida
    //   de 4 jugades.
    // opts.applyMove(fen, move) -> booleà: diu si la jugada (UCI o SAN) és
    //   legal sobre la FEN. app.js hi injecta chess.js (amb tolerància de
    //   torn via normalizeFenTurn); els tests hi injecten un doble.
    function isRenderableReviewError(err, opts) {
        const e = err || {};
        const o = opts || {};
        if (!e.fen || String(e.fen).split(' ').length < 2) return false;
        const n = Number(e.moveNumber);
        if (!isFinite(n) || n < 1) return false;
        if (isFinite(o.maxMoveNumber) && o.maxMoveNumber > 0 && n > o.maxMoveNumber) return false;
        const played = e.playerMove || e.playerMoveSan;
        const best = e.bestMove || e.bestMoveSan;
        if (!played || !best) return false;
        // La jugada feta i la millor no poden ser la mateixa (swing fantasma).
        if (normalizeMoveForKey(e.playerMove) && normalizeMoveForKey(e.bestMove)
            && normalizeMoveForKey(e.playerMove) === normalizeMoveForKey(e.bestMove)) return false;
        if (normalizeMoveForKey(e.playerMoveSan) && normalizeMoveForKey(e.bestMoveSan)
            && normalizeMoveForKey(e.playerMoveSan) === normalizeMoveForKey(e.bestMoveSan)) return false;
        if (typeof o.applyMove === 'function') {
            if (!o.applyMove(e.fen, played)) return false;
            if (!o.applyMove(e.fen, best)) return false;
        }
        return true;
    }

    // Identitat d'una jugada de ressenya: cap moment no pot dir "Jugada 14 ·
    // Nh4" si la jugada 14 real de la partida és Ne4. Es comprova que:
    //   1. el número de jugada coincideix amb el comptador de la FEN de decisió;
    //   2. la SAN recalculada amb chess.js sobre la FEN (o.sanForMove) coincideix
    //      amb la jugada real de l'historial en aquell ply (o.historySanAt).
    // Les dependències s'injecten (com a isRenderableReviewError) per mantenir
    // el nucli pur. Sense historial o sense recalculadora, no es pot contradir
    // res i la jugada es considera coherent (partides antigues sense llista).
    function reviewMoveIdentityOk(err, opts) {
        const e = err || {};
        const o = opts || {};
        const n = Number(e.moveNumber);
        const fenN = parseInt(String(e.fen || '').split(' ')[5], 10);
        if (isFinite(n) && n > 0 && isFinite(fenN) && fenN > 0 && n !== fenN) return false;
        if (typeof o.sanForMove !== 'function' || typeof o.historySanAt !== 'function') return true;
        const realSan = o.sanForMove(e.fen, e.playerMove || e.playerMoveSan);
        if (!realSan) return true;
        const moveNo = (isFinite(n) && n > 0) ? n : ((isFinite(fenN) && fenN > 0) ? fenN : null);
        if (moveNo === null) return true;
        const ply = (moveNo - 1) * 2 + (o.playerColor === 'b' ? 1 : 0);
        const histSan = o.historySanAt(ply);
        if (!histSan) return true;
        return normalizeMoveForKey(histSan) === normalizeMoveForKey(realSan);
    }

    // ----------------------------------------------------------------------
    // Auditoria del text de ressenya segons la veu (abans de renderitzar)
    // ----------------------------------------------------------------------
    // Sobre TEXT PLA (sense HTML). Detecta el que cap veu no pot mostrar mai
    // (UCI, fletxes "la millor era →", construccions "vas jugar el cavall ...
    // va a ...", talls amb el·lipsi) i, en veu casual, la SAN nua de peça
    // (Nxf6, Qd2+, exd5, e8=Q, O-O). Les caselles soltes ("porta el cavall a
    // f7") no es marquen: són llenguatge natural.
    const RE_AUDIT_UCI = /\b[a-h][1-8][a-h][1-8][qrbn]?\b/;
    const RE_AUDIT_SAN_CASUAL = /(?:\b[KQRBN][a-h]?[1-8]?x?[a-h][1-8][+#]?|\b[a-h]x[a-h][1-8][+#]?|\b[a-h][1-8]=[QRBN][+#]?|\bO-O(?:-O)?[+#]?)/;
    const RE_AUDIT_FRASE_MAL_FORMADA = /\bvas jugar +(?:el|la|l[’'])[^.:;()]{0,60}\b(?:va|avança|captura|corona) a\b/i;
    function auditReviewVoiceText(text, style) {
        const t = String(text == null ? '' : text);
        const problems = [];
        if (RE_AUDIT_UCI.test(t)) problems.push('uci_visible');
        if (t.indexOf('→') !== -1) problems.push('fletxa_maquinal');
        if (RE_AUDIT_FRASE_MAL_FORMADA.test(t)) problems.push('frase_mal_formada');
        if (/(\.\.\.|…)\s*$/.test(t.trim())) problems.push('text_tallat');
        if (normalizeReviewVoiceStyle(style) === 'casual' && RE_AUDIT_SAN_CASUAL.test(t)) problems.push('san_en_casual');
        return { ok: problems.length === 0, problems: problems };
    }

    function plural(n, singular, pluralForm) {
        return n === 1 ? singular : pluralForm;
    }

    // Línia de fase amb el nombre de jugades i, si n'hi ha poques, un avís
    // perquè el percentatge no es llegeixi com una conclusió forta.
    // Retorna '' si la fase no té cap jugada. L'avís s'adapta a la veu.
    const LOW_DATA_NOTES = {
        casual: 'Hi ha poques jugades en aquesta fase; no en fem una conclusió forta.',
        balanced: 'Poques dades; no en traiem conclusions fortes.',
        technical: 'La mostra d’aquesta fase és massa petita per valorar-la amb fiabilitat.'
    };
    function formatPhaseLine(precision, total, style) {
        const t = Number(total) || 0;
        if (t <= 0) return '';
        const pct = (typeof precision === 'number' && isFinite(precision)) ? precision + '%' : '—';
        let line = 'correcció ' + pct + ' en ' + t + ' ' + plural(t, 'jugada', 'jugades') + '.';
        if (t < 3) line += ' ' + LOW_DATA_NOTES[normalizeReviewVoiceStyle(style)];
        return line;
    }

    // La lliçó del dia: una consigna curta i segura segons el patró dominant
    // de les errades. Surt de dades locals (el tema ja ve classificat), mai
    // d'un model de llenguatge. El tema detectat és el mateix en totes les
    // veus; només canvia la redacció.
    const LESSONS_BY_THEME = {
        casual: {
            material: 'abans de moure, mira què et pot capturar el rival.',
            king_attack: 'no ataquis el rei tot sol: primer porta-hi més peces.',
            prophylaxis: 'abans de moure, mira què et vol fer el rival.',
            opening: 'a l’obertura, treu peces i lluita pel centre abans de buscar aventures.',
            endgame: 'al final, activa el rei i no tinguis pressa.',
            general: 'abans de decidir, mira escacs, captures i amenaces.'
        },
        balanced: {
            material: 'abans de capturar, compta atacants i defensors.',
            king_attack: 'no busquis escacs solts; suma peces i calcula la seqüència.',
            prophylaxis: "abans de moure, pregunta't quina amenaça real té el rival.",
            opening: 'desenvolupa, disputa el centre i no moguis massa cops la mateixa peça.',
            endgame: "activa el rei i converteix l'avantatge sense donar contrajoc.",
            general: 'revisa escacs, captures i amenaces abans de decidir.'
        },
        technical: {
            material: 'abans de capturar, verifica l’equilibri entre atacants i defensors de la casella.',
            king_attack: 'un atac al rei només prospera amb prou peces coordinades i una seqüència calculada.',
            prophylaxis: 'identifica l’amenaça més forta del rival abans de fixar el teu pla.',
            opening: 'prioritza desenvolupament, control central i seguretat del rei abans de cap operació.',
            endgame: 'el final demana rei actiu, simplificació favorable i control del contrajoc.',
            general: 'ordena les candidates (escacs, captures, amenaces) i compara-les abans de jugar.'
        }
    };
    function lessonOfTheDay(themeKey, style) {
        const bank = LESSONS_BY_THEME[normalizeReviewVoiceStyle(style)];
        return bank[themeKey] || bank.general;
    }

    // Pla de 10 minuts: recomana repassar les 2-3 jugades més importants.
    // moveNumbers ve ordenat per importància (el primer és el més greu).
    // Les jugades recomanades són idèntiques en totes les veus.
    const TEN_MINUTE_PLANS = {
        casual: {
            none: () => "Pla de 10 minuts: torna a jugar l'obertura amb calma i mira d'arribar al mig joc amb totes les peces fora.",
            one: n => 'Pla de 10 minuts: torna a la jugada ' + n[0] + ' i busca la millor jugada sense pista fins que et surti sola.',
            two: n => 'Pla de 10 minuts: mira primer la jugada ' + n[0] + ' i després torna a la jugada ' + n[1] + ' fins que trobis la millor jugada sense pista.',
            three: n => 'Pla de 10 minuts: mira la jugada ' + n[0] + ', després la ' + n[1] + ' i acaba amb la jugada ' + n[2] + ', fins que vegis la millor jugada abans de moure.'
        },
        balanced: {
            none: () => "Pla de 10 minuts: rejuga l'obertura i comprova si pots arribar al mig joc amb totes les peces actives.",
            one: n => 'Pla de 10 minuts: repeteix la posició de la jugada ' + n[0] + ' fins que trobis la millor jugada sense pista.',
            two: n => 'Pla de 10 minuts: revisa primer la jugada ' + n[0] + ' i acaba repetint la posició de la jugada ' + n[1] + ' fins que trobis la millor jugada sense pista.',
            three: n => 'Pla de 10 minuts: revisa primer la jugada ' + n[0] + ', després la ' + n[1] + ', i acaba repetint la posició de la jugada ' + n[2] + ' fins que vegis la millor jugada abans de moure.'
        },
        technical: {
            none: () => "Pla de 10 minuts: reprodueix la fase d'obertura i verifica que completes el desenvolupament sense concessions.",
            one: n => 'Pla de 10 minuts: analitza la posició de la jugada ' + n[0] + ' fins a identificar la millor jugada sense ajuda.',
            two: n => 'Pla de 10 minuts: analitza primer la jugada ' + n[0] + ' i després la posició de la jugada ' + n[1] + ', fins a identificar la millor jugada sense ajuda.',
            three: n => 'Pla de 10 minuts: analitza la jugada ' + n[0] + ', després la ' + n[1] + ' i tanca amb la posició de la jugada ' + n[2] + ', fins a identificar la millor jugada abans de moure.'
        }
    };
    function buildTenMinutePlan(moveNumbers, style) {
        const nums = (moveNumbers || []).map(Number).filter(n => isFinite(n) && n > 0);
        const bank = TEN_MINUTE_PLANS[normalizeReviewVoiceStyle(style)];
        if (!nums.length) return bank.none();
        if (nums.length === 1) return bank.one(nums);
        if (nums.length === 2) return bank.two(nums);
        return bank.three(nums);
    }

    // Frase inicial que deixa clar amb quin color jugava l'usuari. Si la partida
    // era amb rellotge, el ritme s'integra a la mateixa frase (p. ex. "una
    // partida de Blitz 3+2 amb blanques") en lloc d'afegir-lo com una dada solta.
    const COLOR_INTROS = {
        casual: color => 'Has jugat amb ' + color + '. Aquí comentem les teves jugades.',
        balanced: color => 'Has jugat amb ' + color + '. La revisió comenta les teves decisions.',
        technical: color => 'Has jugat amb ' + color + '. L’anàlisi valora les teves decisions.'
    };
    const COLOR_RHYTHM_INTROS = {
        casual: (color, rhythm) => 'Has jugat una partida de ' + rhythm + ' amb ' + color + '. Aquí comentem les teves jugades.',
        balanced: (color, rhythm) => 'Has jugat una partida de ' + rhythm + ' amb ' + color + '. La revisió comenta les teves decisions.',
        technical: (color, rhythm) => 'Partida de ' + rhythm + ' jugada amb ' + color + '. L’anàlisi valora les teves decisions.'
    };
    function playerColorIntro(playerColor, style, rhythmLabel) {
        const color = playerColor === 'b' ? 'negres' : 'blanques';
        const s = normalizeReviewVoiceStyle(style);
        if (rhythmLabel) return COLOR_RHYTHM_INTROS[s](color, String(rhythmLabel));
        return COLOR_INTROS[s](color);
    }

    // Rival adaptatiu del calibratge per ritme de rellotge: comença al nivell
    // inicial (seed) i, a mesura que hi ha jugades avaluades, s'acosta al
    // nivell real del jugador (més precisió → rival més fort). L'ajust creix
    // amb el nombre de jugades (confiança) i queda acotat a ±250.
    function timedCalibrationOpponentElo(seedElo, goodMoves, totalMoves) {
        const seed = isNaN(seedElo) ? 800 : seedElo;
        const total = totalMoves || 0;
        if (total < 4) return Math.round(seed);
        const precision = Math.max(0, Math.min(1, (goodMoves || 0) / total));
        const confidence = Math.min(1, total / 20);
        const offset = (precision - 0.55) * 500 * confidence;
        return Math.round(seed + Math.max(-250, Math.min(250, offset)));
    }

    // Rival adaptatiu del CALIBRATGE INICIAL (la partida única obligatòria):
    // mateix patró que el calibratge per ritme (proporció de jugades bones +
    // confiança creixent), però amb TOT el rang ROC disponible en lloc de ±250.
    // Amb una sola partida, l'estimació ha de poder arribar tant a un principiant
    // (terra 200) com a un jugador expert (~1700+ abans del bonus per resultat i
    // qualitat): si el rival quedés ancorat al ROC inicial (300), cap jugador fort
    // no podria obtenir mai una primera estimació realista.
    function initialCalibrationOpponentRoc(startRoc, goodMoves, totalMoves, rocMin, rocMax) {
        const start = (typeof startRoc === 'number' && !isNaN(startRoc)) ? startRoc : 300;
        const lo = (typeof rocMin === 'number' && !isNaN(rocMin)) ? rocMin : 200;
        const hi = (typeof rocMax === 'number' && !isNaN(rocMax)) ? rocMax : 2000;
        const total = totalMoves || 0;
        if (total < 4) return Math.round(Math.max(lo, Math.min(hi, start)));
        const precision = Math.max(0, Math.min(1, (goodMoves || 0) / total));
        const confidence = Math.min(1, total / 24);
        const offset = (precision - 0.55) * 3200 * confidence;
        return Math.round(Math.max(lo, Math.min(hi, start + offset)));
    }

    // Rendiment estimat d'una única partida contra un rival de força coneguda:
    // el nivell del rival es corregeix pel resultat (±150) i per la qualitat
    // de joc 0..1 (±100). És una estimació orientativa, no un canvi de rating.
    function estimateGamePerformanceRating(opponentRating, resultScore, quality) {
        const opponent = isNaN(opponentRating) ? 800 : opponentRating;
        const result = (typeof resultScore === 'number' && !isNaN(resultScore)) ? resultScore : 0.5;
        const q = Math.max(0, Math.min(1, (typeof quality === 'number' && !isNaN(quality)) ? quality : 0.5));
        return Math.round(opponent + (result - 0.5) * 300 + (q - 0.5) * 200);
    }

    // Primera estimació d'ELO d'un ritme a partir d'una única partida de
    // calibratge. Manté el mateix model que el rendiment estimat per partida.
    function estimateTimedCalibrationElo(opponentElo, resultScore, quality) {
        return estimateGamePerformanceRating(opponentElo, resultScore, quality);
    }

    // Delta d'ELO d'una partida puntuada contra un rival de força coneguda
    // (fórmula d'Elo estàndard amb K=24 i mínim de ±8 en victòria/derrota,
    // el mateix criteri que l'ELO principal d'app.js). S'usa per als ELO
    // independents per ritme de rellotge.
    function ratedEloDelta(playerElo, opponentElo, resultScore, kFactor) {
        const k = kFactor || 24;
        const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
        const raw = k * (resultScore - expected);
        if (resultScore === 0) return Math.min(-8, Math.round(raw));
        if (resultScore === 1) return Math.max(8, Math.round(raw));
        return Math.round(raw);
    }

    // ----------------------------------------------------------------------
    // Nivell de les partides col·lectives (Catalans vs Stockfish)
    // ----------------------------------------------------------------------
    // L'exèrcit NO té cap ELO ni ROC assignat: és molta gent votant, i cadascú
    // té el seu. Qui porta el nivell és l'ELO/ROC d'STOCKFISH, que s'adapta
    // després de cada partida SEGONS EL RESULTAT: si l'exèrcit guanya, el rival
    // puja; si perd, baixa; si empaten, es queda on és (ja estan igualats).
    // L'ajust usa la mateixa fórmula Elo (K=24 i mínim de ±8) que les partides
    // generals. Com que el nivell del rival és també l'estimació del nivell de
    // l'exèrcit, la puntuació esperada abans de cada partida és 0,5.

    // Helper històric conservat per compatibilitat; el nou ajust Elo no l'usa.
    function collectiveLadderStep(gamesPlayed, opts) {
        const o = opts || {};
        const startStep = (typeof o.startStep === 'number' && !isNaN(o.startStep)) ? o.startStep : 200;
        const minStep = (typeof o.minStep === 'number' && !isNaN(o.minStep)) ? o.minStep : 40;
        const halfLife = (typeof o.stepHalfLife === 'number' && o.stepHalfLife > 0) ? o.stepHalfLife : 2;
        const n = (typeof gamesPlayed === 'number' && gamesPlayed > 0) ? gamesPlayed : 0;
        return Math.max(minStep, Math.round(startStep / (1 + n / halfLife)));
    }

    // Nova força del rival després d'una partida, segons el resultat de l'equip
    // humà (1 victòria, 0,5 taules, 0 derrota). Retorna la força limitada al
    // rang del motor, el pas aplicat i la diferència real (que pot quedar
    // escapçada pels límits).
    function adaptedRivalStrength(prevStrength, resultScore, gamesPlayed, opts) {
        const o = opts || {};
        const min = (typeof o.min === 'number' && !isNaN(o.min)) ? o.min : 200;
        const max = (typeof o.max === 'number' && !isNaN(o.max)) ? o.max : 2850;
        const prev = (typeof prevStrength === 'number' && !isNaN(prevStrength)) ? prevStrength : 1350;
        const s = (typeof resultScore === 'number' && !isNaN(resultScore)) ? Math.max(0, Math.min(1, resultScore)) : 0.5;
        const k = (typeof o.kFactor === 'number' && o.kFactor > 0) ? o.kFactor : 24;
        const delta = ratedEloDelta(prev, prev, s, k);
        const raw = prev + delta;
        const strength = Math.round(Math.max(min, Math.min(max, raw)));
        return { strength: strength, step: Math.abs(delta), delta: strength - Math.round(prev) };
    }

    // ----------------------------------------------------------------------
    // Lliga
    // ----------------------------------------------------------------------

    // ROC/ELO de referència amb què es genera una lliga, segons el rellotge de
    // la temporada: si aquell ritme ja té puntuació pròpia (la que es guanya
    // jugant-hi partides amb rellotge), mana aquella; si no —lliga sense
    // rellotge, o ritme encara sense calibrar—, la puntuació principal. Així una
    // lliga a 3+2 es genera al nivell que el jugador té A 3+2, no al de les
    // partides sense rellotge.
    function leagueBaseRating(timedRating, mainRating, minRating) {
        const floor = (typeof minRating === 'number' && !isNaN(minRating)) ? minRating : 50;
        const timed = (typeof timedRating === 'number' && !isNaN(timedRating)) ? timedRating : null;
        const main = (typeof mainRating === 'number' && !isNaN(mainRating)) ? mainRating : floor;
        return Math.max(floor, Math.round(timed !== null ? timed : main));
    }

    // Reajusta la graella d'una lliga quan se'n canvia el rellotge abans de
    // començar-la: el jugador passa a la referència nova i els rivals s'hi
    // desplacen en bloc, de manera que es conserven les diferències amb què es
    // va sortejar la lliga (el rival que anava 20 punts per sobre hi continua).
    function rebasedLeagueRatings(players, oldBase, newBase, minRating) {
        const list = Array.isArray(players) ? players : [];
        const floor = (typeof minRating === 'number' && !isNaN(minRating)) ? minRating : 50;
        const to = (typeof newBase === 'number' && !isNaN(newBase)) ? Math.round(newBase) : null;
        if (to === null) return list.slice();
        const from = (typeof oldBase === 'number' && !isNaN(oldBase)) ? Math.round(oldBase) : to;
        const delta = to - from;
        return list.map(function (p) {
            if (!p) return p;
            if (p.id === 'me') return Object.assign({}, p, { elo: Math.max(floor, to) });
            const elo = (typeof p.elo === 'number' && !isNaN(p.elo)) ? p.elo : to;
            return Object.assign({}, p, { elo: Math.max(floor, Math.round(elo + delta)) });
        });
    }

    // Quina partida guardada correspon a cada jornada de la lliga.
    //
    // Les jornades noves ja duen l'id de la partida (gameId), perquè es desa en
    // acabar-la. Les que es van jugar abans no en duen cap i s'han de
    // reconèixer: dins d'una lliga cada rival hi surt UNA sola vegada, de
    // manera que el nom del rival identifica la partida sense ambigüitat, i
    // l'ordre de joc desempata si mai es repetís. Només s'hi miren partides de
    // lliga posteriors a la creació de la temporada: les d'una lliga anterior
    // poden dur el mateix nom de rival i no són aquestes.
    //
    // Una jornada sense partida (abandonada des del botó de casa, esborrada de
    // l'historial o massa antiga) no rep cap enllaç: val més no oferir-lo que
    // obrir una partida que no és.
    function leagueRoundGameLinks(rounds, games, options) {
        const opts = options || {};
        const list = Array.isArray(games) ? games : [];
        const known = new Set();
        list.forEach(function (g) { if (g && g.id) known.add(g.id); });

        const ordered = (Array.isArray(rounds) ? rounds : [])
            .filter(function (r) { return r && typeof r.round === 'number'; })
            .slice()
            .sort(function (a, b) { return a.round - b.round; });

        const taken = new Set();
        const links = {};
        // 1) L'id desat mana, sempre que la partida encara hi sigui.
        ordered.forEach(function (r) {
            if (r.gameId && known.has(r.gameId)) { links[r.round] = r.gameId; taken.add(r.gameId); }
        });

        // 2) La resta, pel nom del rival entre les partides de lliga d'aquesta
        //    temporada, de la més antiga a la més nova.
        const since = (typeof opts.createdAt === 'number' && !isNaN(opts.createdAt)) ? opts.createdAt : null;
        const candidates = list
            .filter(function (g) {
                if (!g || !g.id || taken.has(g.id)) return false;
                if (g.mode !== 'league') return false;
                if (g.imported === true) return false;
                return since === null || leagueGameTime(g) >= since;
            })
            .sort(function (a, b) { return leagueGameTime(a) - leagueGameTime(b); });

        ordered.forEach(function (r) {
            if (links[r.round]) return;
            const name = leagueOpponentKey(r.oppName);
            if (!name) return;
            for (let i = 0; i < candidates.length; i++) {
                const g = candidates[i];
                if (taken.has(g.id)) continue;
                if (leagueOpponentKey(g.opponent && g.opponent.name) !== name) continue;
                links[r.round] = g.id;
                taken.add(g.id);
                break;
            }
        });
        return links;
    }

    function leagueGameTime(entry) {
        const raw = entry && (entry.date || entry.createdAt);
        const time = raw ? Date.parse(raw) : NaN;
        return isNaN(time) ? 0 : time;
    }

    function leagueOpponentKey(name) {
        return String(name == null ? '' : name).trim().toLowerCase();
    }

    // ----------------------------------------------------------------------
    // Temps de resposta humanitzat de l'enginy
    // ----------------------------------------------------------------------
    // La jugada que tria el motor NO canvia mai: només es modula QUAN s'aplica,
    // com si un humà del nivell marcat hi hagués dedicat el temps.
    //
    // El model està CALIBRAT amb partides reals. Font: bolcat públic de Lichess
    // (lichess_db_standard_rated_2026-06), 4.600.000 partides classificades
    // llegides, de les quals 852.248 costats de jugador amb rellotge jugada a
    // jugada en els sis ritmes de l'app. Per a cada ritme i franja d'ELO s'hi
    // van mesurar: jugades per partida, segons per jugada, fracció del rellotge
    // consumida, corba de consum jugada a jugada i percentatge de partides
    // perdudes per temps. Els resultats són a HUMAN_CLOCK_STATS.
    //
    // Tres fets de les dades manen sobre el model:
    //   1) El nombre de jugades que s'arriben a fer depèn del nivell: a 1+0 un
    //      jugador de la franja més fluixa en fa 22,2 de mitjana i un de 2400
    //      en fa 38,0. L'horitzó de jugades, doncs, NO pot ser una constant.
    //   2) La corba de consum té sempre la mateixa forma: pic de temps cap a la
    //      jugada 0,57 × (jugades esperades) i caiguda posterior. Reescalades
    //      pel seu propi pic i la seva pròpia mitjana, les 48 corbes mesurades
    //      (6 ritmes × 8 franges) col·lapsen en una de sola: HUMAN_PACE_SHAPE.
    //   3) Perdre per temps és el desenllaç NORMAL dels ritmes ràpids: a 1+0,
    //      el 74% de les partides entre jugadors de menys de 1000 s'acaben amb
    //      una bandera. Un rival que mai no cau de bandera no és humà: és una
    //      màquina amb temps infinit. Per això el model pot esgotar el rellotge
    //      del motor, amb la freqüència mesurada per al seu nivell.

    function clampNum(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Límits i soroll per ritme (la part escènica, no el pressupost):
    //  - minMs (τ_min) / maxMs: sòl físic i sostre del temps visible per jugada.
    //  - noiseMix (ρ) i sigma: pes i amplada del soroll log-normal per jugada.
    const HUMAN_TIME_PROFILES = {
        '30s':   { minMs: 120, maxMs: 4000,  noiseMix: 0.30, sigma: 0.45 },
        '1+0':   { minMs: 160, maxMs: 6000,  noiseMix: 0.30, sigma: 0.45 },
        '3+2':   { minMs: 220, maxMs: 12000, noiseMix: 0.25, sigma: 0.40 },
        '5+0':   { minMs: 300, maxMs: 15000, noiseMix: 0.25, sigma: 0.40 },
        '10+0':  { minMs: 450, maxMs: 22000, noiseMix: 0.25, sigma: 0.35 },
        '15+10': { minMs: 700, maxMs: 28000, noiseMix: 0.20, sigma: 0.35 },
        // Sense rellotge: pressupost fictici moderat perquè la resposta també
        // «respiri» segons ELO i dificultat, sense fer esperar l'usuari.
        'none':  { fixedBudgetMs: 1300, minMs: 350, maxMs: 4500, noiseMix: 0.25, sigma: 0.40 }
    };

    // Comportament humà REAL amb rellotge, per ritme i nivell (vegeu la font a
    // dalt). Per a cada ritme hi ha quatre àncores d'ELO i entre elles
    // s'interpola linealment:
    //   moves    jugades per bàndol i partida (mitjana mesurada)
    //   movesSd  desviació típica d'aquestes jugades
    //   spendMs  temps mitjà per jugada = (rellotge consumit) / (jugades)
    //   flagRate proporció de partides perdudes per temps en aquesta franja
    //   n        costats de jugador de la mostra (mida de la mostra)
    //   paceSigma  ÚNIC paràmetre no mesurat sinó AJUSTAT: dispersió del ritme
    //              entre partides. Es va calibrar cercant, per a cada fila, el
    //              valor que fa que el model reprodueixi el risc de bandera
    //              mesurat (probabilitat de caure a la jugada k havent arribat
    //              viu a k-1, acumulada sobre les 40 primeres jugades). El
    //              test «humantime» torna a comprovar aquest ajust.
    // L'ELO de referència de cada fila és l'ELO mitjà real de la franja. Per
    // sota de la primera àncora no hi ha dades públiques (Lichess amb prou
    // feines té partides sota ~600), així que el perfil es manté: és el
    // comportament més fluix que s'ha pogut MESURAR, no una extrapolació.
    const HUMAN_CLOCK_STATS = {
        '30s': [
            { elo: 840,  moves: 19.0, movesSd: 7.8,  spendMs: 1330, flagRate: 0.620, paceSigma: 0.42, deepThinkRate: 0.000, n: 374 },
            { elo: 1320, moves: 25.2, movesSd: 9.8,  spendMs: 955,  flagRate: 0.462, paceSigma: 0.42, deepThinkRate: 0.147, n: 1092 },
            { elo: 1710, moves: 30.2, movesSd: 10.5, spendMs: 815,  flagRate: 0.438, paceSigma: 0.42, deepThinkRate: 0.204, n: 4655 },
            { elo: 2410, moves: 39.1, movesSd: 14.3, spendMs: 589,  flagRate: 0.204, paceSigma: 0.42, deepThinkRate: 0.211, n: 24964 }
        ],
        '1+0': [
            { elo: 880,  moves: 22.2, movesSd: 8.2,  spendMs: 2169, flagRate: 0.395, paceSigma: 0.42, deepThinkRate: 0.036, n: 3163 },
            { elo: 1310, moves: 27.9, movesSd: 9.4,  spendMs: 1708, flagRate: 0.335, paceSigma: 0.42, deepThinkRate: 0.101, n: 10430 },
            { elo: 1700, moves: 31.7, movesSd: 10.8, spendMs: 1490, flagRate: 0.298, paceSigma: 0.42, deepThinkRate: 0.131, n: 21181 },
            { elo: 2400, moves: 38.0, movesSd: 14.4, spendMs: 1204, flagRate: 0.208, paceSigma: 0.42, deepThinkRate: 0.210, n: 19937 }
        ],
        '3+2': [
            { elo: 890,  moves: 28.2, movesSd: 15.9, spendMs: 5397, flagRate: 0.122, paceSigma: 0.42, deepThinkRate: 0.143, n: 5785 },
            { elo: 1305, moves: 31.2, movesSd: 15.5, spendMs: 5118, flagRate: 0.100, paceSigma: 0.42, deepThinkRate: 0.150, n: 16991 },
            { elo: 1700, moves: 33.9, movesSd: 15.7, spendMs: 5057, flagRate: 0.104, paceSigma: 0.42, deepThinkRate: 0.184, n: 23788 },
            { elo: 2325, moves: 38.6, movesSd: 17.2, spendMs: 5218, flagRate: 0.104, paceSigma: 0.42, deepThinkRate: 0.225, n: 6194 }
        ],
        '5+0': [
            { elo: 870,  moves: 28.7, movesSd: 14.8, spendMs: 5743, flagRate: 0.125, paceSigma: 0.42, deepThinkRate: 0.131, n: 9221 },
            { elo: 1305, moves: 33.1, movesSd: 15.5, spendMs: 5136, flagRate: 0.103, paceSigma: 0.42, deepThinkRate: 0.150, n: 19370 },
            { elo: 1700, moves: 36.0, movesSd: 15.6, spendMs: 4931, flagRate: 0.103, paceSigma: 0.42, deepThinkRate: 0.171, n: 24386 },
            { elo: 2280, moves: 39.1, movesSd: 15.7, spendMs: 5246, flagRate: 0.102, paceSigma: 0.42, deepThinkRate: 0.154, n: 1368 }
        ],
        '10+0': [
            { elo: 850,  moves: 27.4, movesSd: 16.6, spendMs: 8268, flagRate: 0.065, paceSigma: 0.42, deepThinkRate: 0.230, n: 12467 },
            { elo: 1305, moves: 31.3, movesSd: 16.4, spendMs: 7884, flagRate: 0.054, paceSigma: 0.42, deepThinkRate: 0.240, n: 19874 },
            { elo: 1700, moves: 34.3, movesSd: 16.4, spendMs: 7810, flagRate: 0.051, paceSigma: 0.42, deepThinkRate: 0.246, n: 22929 },
            { elo: 2295, moves: 39.1, movesSd: 17.3, spendMs: 8800, flagRate: 0.057, paceSigma: 0.42, deepThinkRate: 0.218, n: 1399 }
        ],
        '15+10': [
            { elo: 830,  moves: 27.1, movesSd: 16.7, spendMs: 14247, flagRate: 0.048, paceSigma: 0.42, deepThinkRate: 0.347, n: 12139 },
            { elo: 1300, moves: 31.2, movesSd: 16.7, spendMs: 17482, flagRate: 0.040, paceSigma: 0.42, deepThinkRate: 0.239, n: 12002 },
            { elo: 1695, moves: 34.0, movesSd: 16.9, spendMs: 19950, flagRate: 0.050, paceSigma: 0.42, deepThinkRate: 0.232, n: 8799 },
            { elo: 2305, moves: 40.1, movesSd: 17.0, spendMs: 22360, flagRate: 0.027, paceSigma: 0.42, deepThinkRate: 0.200, n: 451 }
        ]
    };

    // Rellotge base de cada ritme (ms), per poder projectar la corba de consum
    // sense dependre de la configuració de la partida en curs.
    const HUMAN_CLOCK_BASE_MS = {
        '30s': 30000, '1+0': 60000, '3+2': 180000,
        '5+0': 300000, '10+0': 600000, '15+10': 900000
    };

    // Forma universal del consum, mesurada: temps de la jugada k dividit pel
    // temps mitjà per jugada, en funció de k/kPic. Les 48 corbes (6 ritmes × 8
    // franges d'ELO) hi col·lapsen: el pic val ~1,47 vegades la mitjana i
    // arriba sempre cap a k = 0,57 × jugades esperades. Fora del rang mesurat
    // es manté el darrer valor (la cua real es regula amb el rellotge que
    // queda, no amb el número de jugada).
    const HUMAN_PACE_PEAK_RATIO = 0.57;
    const HUMAN_PACE_SHAPE = [
        [0.00, 0.25], [0.15, 0.43], [0.25, 0.59], [0.40, 0.84], [0.60, 1.17],
        [0.80, 1.38], [1.00, 1.47], [1.25, 1.38], [1.60, 1.09], [2.00, 0.78],
        [2.60, 0.52]
    ];

    function humanPaceShape(x) {
        const pts = HUMAN_PACE_SHAPE;
        if (!(x > 0)) return pts[0][1];
        if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
        for (let i = 0; i < pts.length - 1; i++) {
            if (x <= pts[i + 1][0]) {
                const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
                return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
            }
        }
        return pts[pts.length - 1][1];
    }

    // Perfil de rellotge d'un ritme per a un nivell donat: interpola les
    // àncores mesurades i en deriva la jugada del pic i el factor de
    // normalització (perquè la suma de la corba al llarg d'una partida típica
    // torni exactament el consum total mesurat).
    function humanClockProfile(tcId, elo) {
        const rows = HUMAN_CLOCK_STATS[tcId];
        if (!rows) return null;
        const e = clampNum(isNaN(elo) ? 1400 : elo, rows[0].elo, rows[rows.length - 1].elo);
        let lo = rows[0];
        let hi = rows[rows.length - 1];
        for (let i = 0; i < rows.length - 1; i++) {
            if (e <= rows[i + 1].elo) { lo = rows[i]; hi = rows[i + 1]; break; }
        }
        const t = hi.elo === lo.elo ? 0 : (e - lo.elo) / (hi.elo - lo.elo);
        const mix = (a, b) => a + (b - a) * t;
        const moves = mix(lo.moves, hi.moves);
        const kPeak = Math.max(4, Math.round(HUMAN_PACE_PEAK_RATIO * moves));
        let sum = 0;
        const typical = Math.max(1, Math.round(moves));
        for (let k = 1; k <= typical; k++) sum += humanPaceShape(k / kPeak);
        const spendMs = mix(lo.spendMs, hi.spendMs);
        const deepThinkRate = mix(lo.deepThinkRate, hi.deepThinkRate);
        // spendMs és el temps mitjà per jugada MESURAT, i inclou les pensades
        // llargues. El ritme de creuer, doncs, és una mica més baix: si no se'n
        // descomptessin, el motor gastaria més del que gasta una persona. El
        // descompte està acotat perquè bona part d'aquestes pensades llargues
        // ja queden retallades pel rellotge que queda (i no s'han de descomptar
        // dues vegades).
        const deepGain = clampNum(
            1 + deepThinkRate * ((HUMAN_DEEP_THINK_MIN + HUMAN_DEEP_THINK_MAX) / 2 - 1), 1, 1.30);
        return {
            moves,
            movesSd: mix(lo.movesSd, hi.movesSd),
            spendMs,
            cruiseMs: spendMs / deepGain,
            flagRate: mix(lo.flagRate, hi.flagRate),
            paceSigma: mix(lo.paceSigma, hi.paceSigma),
            deepThinkRate,
            kPeak,
            shapeNorm: sum / typical || 1,
            baseMs: HUMAN_CLOCK_BASE_MS[tcId] || 0
        };
    }

    // Temps que aquest perfil dedicaria a la jugada k a ritme de creuer (sense
    // soroll, sense pensada llarga i sense mirar el rival).
    function humanPlannedSpendMs(profile, moveNumber) {
        if (!profile) return 0;
        const k = Math.max(1, moveNumber || 1);
        return profile.cruiseMs * humanPaceShape(k / profile.kPeak) / profile.shapeNorm;
    }

    // Rellotge que hauria de quedar en arribar a la jugada k si tot va segons
    // el pla d'aquest perfil (amb el seu tarannà del dia). Serveix per saber si
    // el motor va endarrerit respecte del que ell mateix tenia previst: és
    // l'ÚNICA retroalimentació de rellotge del model, i és la que fa que una
    // partida que s'allarga més del compte acabi passant factura.
    function humanExpectedRemainingMs(profile, incMs, moveNumber, temperament) {
        if (!profile) return 0;
        const k = Math.max(1, moveNumber || 1);
        const temper = temperament > 0 ? temperament : 1;
        let spent = 0;
        for (let i = 1; i < k; i++) spent += humanPlannedSpendMs(profile, i) * temper;
        return profile.baseMs + (incMs || 0) * (k - 1) - spent;
    }

    // Perícia de GESTIÓ DEL RELLOTGE segons ELO. Un jugador fluix no només juga
    // pitjor: administra pitjor el temps. Els paràmetres van del jugador més
    // fluix mesurat (~800) al més fort (~2400):
    //   maxSpendFrac     màxim del rellotge restant que es gasta en UNA jugada.
    //   clockAwareness   quant mira el rellotge: 0 = juga al seu ritme passi el
    //                    que passi (i cau de bandera), 1 = reparteix sempre el
    //                    que li queda. És la diferència de fons entre un
    //                    principiant i un jugador fet.
    //   panicMoves       quantes jugades de marge li queden quan s'adona que va
    //                    justíssim (i comença a moure a l'acte).
    function clockManagementSkill(elo) {
        const n = clampNum(((isNaN(elo) ? 1400 : elo) - 800) / 1600, 0, 1); // 800..2400
        return {
            maxSpendFrac: 0.17 - 0.06 * n,
            clockAwareness: 0.35 + 0.40 * n,
            panicMoves: 1.0 + 2.5 * n
        };
    }

    // Sòl físic per jugada: ni decidint-se a l'acte ningú no baixa d'aquí (cal
    // veure la posició, agafar la peça i deixar-la). No és un valor inventat:
    // a la cua de les partides de 30s i 1+0 —els únics ritmes on el rellotge
    // s'arriba a esgotar de debò— el temps per jugada s'estanca a un terç
    // llarg del ritme mitjà d'aquell nivell (0,74 s per jugada a 1+0 a la
    // franja més fluixa, 0,45 s a 30s), i és aquest sòl —no cap regla
    // artificial— el que decideix quantes jugades encara es poden fer amb el
    // rellotge a punt de caure. Té sostre: per lent que sigui el ritme, ningú
    // no necessita més d'un segon per moure quan ja no li queda temps.
    const HUMAN_FLOOR_FRACTION = 0.34;
    const HUMAN_FLOOR_CAP_MS = 900;
    function humanMoveFloorMs(spendMs, absoluteMinMs) {
        return clampNum(spendMs * HUMAN_FLOOR_FRACTION, absoluteMinMs || 0, HUMAN_FLOOR_CAP_MS);
    }

    // Pensada llarga: de tant en tant una persona s'encalla en una jugada i hi
    // deixa una part gran del rellotge. És el mecanisme real que fa caure
    // banderes en els ritmes amb increment (on cap ritme mitjà no esgota mai el
    // temps) i el que precipita el final als ritmes ràpids. La freqüència
    // (deepThinkRate de HUMAN_CLOCK_STATS) és l'altre paràmetre ajustat, no
    // mesurat: es calibra perquè el model reprodueixi el risc de bandera real.
    // El sostre absolut (dos minuts) no és cap regla d'escacs: és per no deixar
    // l'usuari mirant la pantalla més estona de la que ningú espera un rival.
    const HUMAN_DEEP_THINK_MIN = 2.2;
    const HUMAN_DEEP_THINK_MAX = 7.0;
    const HUMAN_DEEP_THINK_CAP_FRAC = 1.15;
    const HUMAN_DEEP_THINK_MAX_MS = 120000;

    // Tarannà de rellotge d'AQUESTA partida: multiplicador log-normal de
    // mitjana ~1 que fa que unes partides es juguin més de pressa i altres es
    // cremin el rellotge. Es tira una vegada per partida (app.js) i es passa a
    // humanThinkTimeMs. Sense ell, el motor jugaria sempre la partida mitjana i
    // no cauria mai de bandera; amb ell, hi cau amb la freqüència mesurada.
    function rollClockTemperament(tcId, elo, random) {
        const rnd = typeof random === 'function' ? random : Math.random;
        const clock = humanClockProfile(tcId, elo);
        const sigma = clock ? clock.paceSigma : 0.4;
        const u1 = Math.max(1e-9, rnd());
        const u2 = rnd();
        const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return clampNum(Math.exp(-sigma * sigma / 2 + sigma * gauss), 0.4, 3.2);
    }

    // Matriu ELO–complexitat: els nivells baixos sobreinverteixen en posicions
    // fàcils i subinverteixen en les difícils; els alts, al revés. Files
    // ancorades al centre de cada banda; columnes a C baixa/mitjana/alta.
    const HUMAN_TIME_ELO_MATRIX = [
        { elo: 1000, mult: [1.15, 1.05, 0.95] },
        { elo: 1400, mult: [1.08, 1.00, 1.00] },
        { elo: 1800, mult: [0.95, 1.00, 1.10] },
        { elo: 2200, mult: [0.85, 0.95, 1.20] },
        { elo: 2600, mult: [0.75, 0.90, 1.30] }
    ];
    const HUMAN_TIME_C_ANCHORS = [0.16, 0.50, 0.84];

    function interpolateComplexityRow(mult, c) {
        const [c0, c1, c2] = HUMAN_TIME_C_ANCHORS;
        if (c <= c0) return mult[0];
        if (c >= c2) return mult[2];
        if (c <= c1) return mult[0] + (mult[1] - mult[0]) * ((c - c0) / (c1 - c0));
        return mult[1] + (mult[2] - mult[1]) * ((c - c1) / (c2 - c1));
    }

    // Multiplicador M(E, C): interpolació bilineal (per C dins de cada banda i
    // per ELO entre bandes) sobre la matriu.
    function eloComplexityTimeMultiplier(elo, complexity) {
        const c = clampNum(isNaN(complexity) ? 0.5 : complexity, 0, 1);
        const rows = HUMAN_TIME_ELO_MATRIX;
        const e = clampNum(isNaN(elo) ? 1400 : elo, rows[0].elo, rows[rows.length - 1].elo);
        for (let i = 0; i < rows.length - 1; i++) {
            if (e <= rows[i + 1].elo) {
                const t = (e - rows[i].elo) / (rows[i + 1].elo - rows[i].elo);
                const low = interpolateComplexityRow(rows[i].mult, c);
                const high = interpolateComplexityRow(rows[i + 1].mult, c);
                return low + (high - low) * t;
            }
        }
        return interpolateComplexityRow(rows[rows.length - 1].mult, c);
    }

    // Multiplicador de fase P(E, φ): els jugadors forts van més ràpid en
    // obertures conegudes i reserven temps per als finals delicats.
    function phaseTimeMultiplier(elo, phase) {
        const n = clampNum(((isNaN(elo) ? 1400 : elo) - 800) / 1600, 0, 1);
        if (phase === 'opening') return 1.05 - 0.35 * n;
        if (phase === 'endgame') return 0.90 + 0.25 * n;
        return 1;
    }

    // Complexitat C ∈ [0,1] a partir de proxies visibles per UCI:
    //  g escletxa 1a-2a línia, b candidates quasi equivalents, v inestabilitat
    //  del millor moviment, e volatilitat d'avaluació, q swing superficial vs
    //  profund (estrès de quiescència) i t bandera tàctica {0, 0.5, 1}.
    //  C = 0.24g + 0.16b + 0.20v + 0.18e + 0.12q + 0.10t
    function estimateMoveComplexity(input) {
        const src = input || {};
        const cands = (Array.isArray(src.candidates) ? src.candidates : [])
            .filter(c => c && typeof c.score === 'number')
            .slice()
            .sort((a, b) => b.score - a.score);
        let g = 0.35; // sense segona línia visible, incertesa neutra tirant a baixa
        let b = 0;
        if (cands.length >= 2) {
            const gapCp = Math.max(0, cands[0].score - cands[1].score);
            g = 1 - clampNum(gapCp / 120, 0, 1);
            const nearBest = cands.filter(c => cands[0].score - c.score <= 50).length;
            b = clampNum((nearBest - 1) / Math.max(1, cands.length - 1), 0, 1);
        }
        const v = clampNum((src.bestMoveChanges || 0) / 3, 0, 1);
        const samples = Array.isArray(src.evalSamples)
            ? src.evalSamples.filter(n => typeof n === 'number')
            : [];
        let e = 0;
        if (samples.length >= 2) {
            const mean = samples.reduce((sum, n) => sum + n, 0) / samples.length;
            const variance = samples.reduce((sum, n) => sum + (n - mean) * (n - mean), 0) / samples.length;
            e = clampNum(Math.sqrt(variance) / 60, 0, 1);
        }
        const q = clampNum(Math.abs(src.shallowDeepSwingCp || 0) / 80, 0, 1);
        const t = clampNum(src.tacticalFlag || 0, 0, 1);
        const score = clampNum(0.24 * g + 0.16 * b + 0.20 * v + 0.18 * e + 0.12 * q + 0.10 * t, 0, 1);
        const level = score < 0.33 ? 'low' : (score < 0.66 ? 'medium' : 'high');
        return { score, level };
    }

    // Soroll log-normal amb mitjana 1 (mu = -sigma²/2), truncat perquè cap
    // jugada surti absurdament curta ni llarga. El generador s'injecta per
    // poder fer tests deterministes.
    function truncatedLogNormalFactor(sigma, random) {
        const u1 = Math.max(1e-9, random());
        const u2 = random();
        const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return clampNum(Math.exp(-sigma * sigma / 2 + sigma * gauss), 0.45, 2.4);
    }

    // Fase de la partida a partir del FEN (sense dependre de chess.js):
    // final si queda poc material no-peó; obertura si és aviat i el material
    // segueix al tauler; migjoc en la resta de casos.
    const PHASE_PIECE_VALUES = { q: 9, r: 5, b: 3, n: 3 };
    function phaseFromFen(fen) {
        if (typeof fen !== 'string' || !fen.trim()) return 'middlegame';
        const parts = fen.trim().split(/\s+/);
        const placement = parts[0] || '';
        const fullmove = parseInt(parts[5], 10) || 1;
        let nonPawnValue = 0;
        let nonPawnCount = 0;
        for (const ch of placement) {
            const val = PHASE_PIECE_VALUES[ch.toLowerCase()];
            if (val) { nonPawnValue += val; nonPawnCount++; }
        }
        if (nonPawnValue <= 13) return 'endgame';
        if (fullmove <= 10 && nonPawnCount >= 10) return 'opening';
        return 'middlegame';
    }

    // Retard visible: del temps «pensat» se'n descompta el que la cerca real ja
    // ha trigat, perquè el rellotge del motor no pagui dues vegades.
    function visibleHumanReplyDelayMs(targetThinkMs, elapsedMs) {
        const target = Math.max(0, Number(targetThinkMs) || 0);
        const elapsed = Math.max(0, Number(elapsedMs) || 0);
        return Math.max(0, Math.round(target - elapsed));
    }

    // Temps de reflexió humanitzat (ms) per a la propera jugada de l'enginy.
    // params: { timeControlId, remainingMs, incMs, elo, complexity, phase,
    //           moveNumber, clockTemperament, humanPaceMs, paceSamples, random }
    // Amb remainingMs null (sense rellotge) s'usa el pressupost fix del perfil
    // 'none'.
    function humanThinkTimeMs(params) {
        const p = params || {};
        const profile = HUMAN_TIME_PROFILES[p.timeControlId] || HUMAN_TIME_PROFILES.none;
        const random = typeof p.random === 'function' ? p.random : Math.random;
        const phase = (p.phase === 'opening' || p.phase === 'endgame') ? p.phase : 'middlegame';
        const complexity = clampNum(typeof p.complexity === 'number' ? p.complexity : 0.5, 0, 1);
        const elo = typeof p.elo === 'number' ? p.elo : 1400;
        const incMs = Math.max(0, p.incMs || 0);
        const remainingMs = typeof p.remainingMs === 'number' ? p.remainingMs : null;
        const moveNumber = Math.max(1, p.moveNumber || 1);
        const temperament = clampNum(typeof p.clockTemperament === 'number' && p.clockTemperament > 0
            ? p.clockTemperament : 1, 0.4, 3.2);
        const clock = HUMAN_CLOCK_STATS[p.timeControlId] ? humanClockProfile(p.timeControlId, elo) : null;
        const useClock = !!clock && remainingMs !== null;
        const skill = clockManagementSkill(elo);

        let tau0;
        if (!useClock) {
            tau0 = profile.fixedBudgetMs || HUMAN_TIME_PROFILES.none.fixedBudgetMs;
        } else {
            // Dues maneres de decidir quant s'hi pensa, barrejades segons com de
            // pendent del rellotge està el nivell (clockAwareness):
            //  · a cegues: el que un humà d'aquest nivell dedica a la jugada k
            //    en aquest ritme, segons la corba mesurada. No mira el rellotge:
            //    per això una partida que s'allarga acaba en bandera.
            //  · mirant el rellotge: la MATEIXA corba però expressada com a
            //    fracció del temps que li hauria de quedar, aplicada al que
            //    realment li queda. Amb menys rellotge, menys temps per jugada.
            const planned = humanPlannedSpendMs(clock, moveNumber);
            const reference = humanExpectedRemainingMs(clock, incMs, moveNumber, 1);
            const frac = clampNum(planned / Math.max(1, reference), 0, skill.maxSpendFrac);
            const blind = planned;
            const aware = frac * remainingMs;
            const beta = skill.clockAwareness;
            tau0 = ((1 - beta) * blind + beta * aware) * temperament;
        }

        const M = eloComplexityTimeMultiplier(elo, complexity);
        const P = phaseTimeMultiplier(elo, phase);
        const deterministic = tau0 * M * P;

        const z = truncatedLogNormalFactor(profile.sigma, random);
        let tau = (1 - profile.noiseMix) * deterministic + profile.noiseMix * deterministic * z;

        // Sincronitza lleugerament el ritme escènic amb el rival humà: si el
        // jugador està movent molt ràpid, l'enginy també accelera; si està
        // jugant pausadament, l'enginy respira una mica més. És deliberadament
        // suau i queda sotmès igualment als límits del perfil i del rellotge.
        const humanPaceMs = typeof p.humanPaceMs === 'number' ? p.humanPaceMs : null;
        const paceSamples = Math.max(0, p.paceSamples || 0);
        if (humanPaceMs !== null && paceSamples > 0) {
            const paceRefMs = useClock ? clock.spendMs : 5000;
            const paceRatio = clampNum(humanPaceMs / Math.max(1, paceRefMs), 0.35, 2.5);
            const confidence = clampNum(paceSamples / 6, 0, 1);
            const paceMultiplier = 1 + (paceRatio - 1) * 0.22 * confidence;
            tau *= clampNum(paceMultiplier, 0.75, 1.2);
        }

        tau = Math.min(tau, profile.maxMs);

        let floorMs = profile.minMs;
        if (useClock) {
            floorMs = humanMoveFloorMs(clock.spendMs, profile.minMs);
            const deepRate = typeof p.deepThinkRate === 'number' ? p.deepThinkRate : clock.deepThinkRate;
            if (random() < deepRate) {
                // Pensada llarga: rara, però és la que decideix moltes partides.
                // Es menja el que calgui —fins i tot tot el rellotge— i per això
                // també es pot caure de bandera en els ritmes amb increment, on
                // cap ritme mitjà no esgotaria mai el temps.
                tau *= HUMAN_DEEP_THINK_MIN + (HUMAN_DEEP_THINK_MAX - HUMAN_DEEP_THINK_MIN) * random();
                tau = Math.min(tau, remainingMs * HUMAN_DEEP_THINK_CAP_FRAC, HUMAN_DEEP_THINK_MAX_MS);
            } else if (remainingMs <= skill.panicMoves * clock.spendMs) {
                // Emergència: quan li queden poques jugades de marge, es mou a
                // l'acte. Els nivells baixos se n'adonen molt més tard
                // (panicMoves petit), tal com passa a les partides reals.
                tau = Math.min(tau, clampNum(remainingMs / 12 + 0.35 * incMs, 80, 900));
            } else {
                // Fora d'aquests dos casos, cap jugada no es menja una part
                // desproporcionada del que queda.
                tau = Math.min(tau, remainingMs * skill.maxSpendFrac);
            }
        }

        // El sòl físic mana per damunt de tot: per sota d'aquest temps ningú no
        // arriba a moure. Quan el rellotge ja no dona ni per al sòl, el motor cau
        // de bandera, exactament com hi cau una persona.
        tau = Math.max(tau, floorMs);
        // No té sentit programar una espera molt més llarga que el rellotge que
        // queda: la bandera cau abans i la partida s'acaba allà.
        if (useClock) tau = Math.min(tau, remainingMs + 250);

        return Math.round(Math.max(0, tau));
    }


    // ----------------------------------------------------------------------
    // Premoves (jugada anticipada de les partides amb rellotge)
    // ----------------------------------------------------------------------
    // A les partides amb rellotge, l'usuari pot marcar la SEVA jugada mentre el
    // rival encara pensa: quan li torna el torn s'executa sola i el rellotge
    // gairebé no es mou. Per fer-ho cal saber quines caselles pot marcar una
    // peça en una posició on ENCARA no li toca moure, i chess.js només genera
    // jugades del bàndol que té el torn (per a la resta retorna una llista
    // buida). D'aquí aquest generador propi, que llegeix el tauler de la FEN.
    //
    // El criteri és el dels servidors d'escacs ràpids: la premove NO es valida
    // contra la posició actual sinó contra la que hi haurà, que encara no es
    // coneix. Per això s'accepten jugades avui impossibles però que la resposta
    // del rival pot fer legals:
    //   · destí ocupat per una peça PRÒPIA (la premove més típica: recapturar
    //     a la casella on el rival està a punt de menjar),
    //   · captura de peó en diagonal cap a una casella ara buida,
    //   · avanç de peó o salt de rei cap a caselles ara atacades o ocupades.
    // El que sí que es respecta és la geometria de la peça i, a les línies, la
    // primera peça del camí (que atura el raig, sigui de qui sigui). Quan
    // arriba el torn, app.js torna a validar la jugada amb chess.js: si ja no
    // és legal, la premove simplement s'anul·la.

    const PREMOVE_KNIGHT_DELTAS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
    const PREMOVE_KING_DELTAS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const PREMOVE_ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const PREMOVE_BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

    // Coordenades internes: x = columna 0-7 (a-h), y = fila 0-7 (1-8).
    function premoveSquareToXY(square) {
        const s = String(square || '').toLowerCase();
        if (!/^[a-h][1-8]$/.test(s)) return null;
        return [s.charCodeAt(0) - 97, s.charCodeAt(1) - 49];
    }

    function premoveXYToSquare(x, y) {
        if (!(x >= 0 && x <= 7 && y >= 0 && y <= 7)) return null;
        return String.fromCharCode(97 + x) + String(y + 1);
    }

    // Tauler {casella: {type, color}} a partir del primer camp de la FEN.
    // Retorna null si la FEN no descriu 8 files completes.
    function premoveBoardFromFen(fen) {
        const rows = String(fen || '').trim().split(/\s+/)[0].split('/');
        if (rows.length !== 8) return null;
        const board = {};
        for (let r = 0; r < 8; r++) {
            const y = 7 - r;
            let x = 0;
            for (const ch of rows[r]) {
                if (ch >= '1' && ch <= '8') { x += Number(ch); continue; }
                if (!/[prnbqk]/i.test(ch) || x > 7) return null;
                board[premoveXYToSquare(x, y)] = {
                    type: ch.toLowerCase(),
                    color: ch === ch.toUpperCase() ? 'w' : 'b'
                };
                x++;
            }
            if (x !== 8) return null;
        }
        return board;
    }

    // Caselles que la peça de `from` pot marcar com a destí d'una premove.
    // Llista ordenada i sense repeticions; buida si la casella no té una peça
    // del color demanat o si la FEN no és llegible.
    function premoveTargets(fen, from, color) {
        const board = premoveBoardFromFen(fen);
        const origin = premoveSquareToXY(from);
        if (!board || !origin) return [];
        const source = String(from).toLowerCase();
        const piece = board[source];
        if (!piece || piece.color !== color) return [];

        const [x, y] = origin;
        const targets = new Set();
        const add = (square) => { if (square && square !== source) targets.add(square); };
        const slide = (dirs) => {
            for (const [dx, dy] of dirs) {
                for (let step = 1; step <= 7; step++) {
                    const square = premoveXYToSquare(x + dx * step, y + dy * step);
                    if (!square) break;
                    add(square);
                    // La primera peça del camí atura el raig: si és del rival la
                    // premove seria una captura; si és pròpia, el rival encara la
                    // pot menjar i deixar la casella lliure. Més enllà, no.
                    if (board[square]) break;
                }
            }
        };

        if (piece.type === 'n') {
            for (const [dx, dy] of PREMOVE_KNIGHT_DELTAS) add(premoveXYToSquare(x + dx, y + dy));
        } else if (piece.type === 'b') {
            slide(PREMOVE_BISHOP_DIRS);
        } else if (piece.type === 'r') {
            slide(PREMOVE_ROOK_DIRS);
        } else if (piece.type === 'q') {
            slide(PREMOVE_BISHOP_DIRS.concat(PREMOVE_ROOK_DIRS));
        } else if (piece.type === 'k') {
            for (const [dx, dy] of PREMOVE_KING_DELTAS) add(premoveXYToSquare(x + dx, y + dy));
            // Enroc: només si la FEN encara en dóna el dret i el rei és a casa.
            const rights = String(fen || '').trim().split(/\s+/)[2] || '-';
            const homeRank = color === 'w' ? 0 : 7;
            if (x === 4 && y === homeRank) {
                if (rights.indexOf(color === 'w' ? 'K' : 'k') !== -1) add(premoveXYToSquare(6, homeRank));
                if (rights.indexOf(color === 'w' ? 'Q' : 'q') !== -1) add(premoveXYToSquare(2, homeRank));
            }
        } else if (piece.type === 'p') {
            const dir = color === 'w' ? 1 : -1;
            add(premoveXYToSquare(x, y + dir));
            if (y === (color === 'w' ? 1 : 6)) add(premoveXYToSquare(x, y + 2 * dir));
            // Diagonals sempre marcables: hi pot arribar una peça del rival (o
            // una captura al pas) just amb la jugada que s'està pensant.
            add(premoveXYToSquare(x - 1, y + dir));
            add(premoveXYToSquare(x + 1, y + dir));
        }

        return Array.from(targets).sort();
    }

    // Si `to` és un destí vàlid per marcar una premove des de `from`.
    function isPremoveTarget(fen, from, to, color) {
        const square = String(to || '').toLowerCase();
        if (!/^[a-h][1-8]$/.test(square)) return false;
        return premoveTargets(fen, from, color).indexOf(square) !== -1;
    }

    // Quan torna el torn: la premove marcada, ¿és una jugada legal ARA? Rep la
    // llista verbose de chess.js per a la casella d'origen (app.js té el motor
    // de regles) i la compara amb el destí i la coronació guardats.
    function premoveMatchesLegalMove(legalMoves, premove) {
        if (!Array.isArray(legalMoves) || !premove || !premove.to) return false;
        const to = String(premove.to).toLowerCase();
        const promotion = String(premove.promotion || 'q').toLowerCase();
        return legalMoves.some((mv) => mv && mv.to === to && (!mv.promotion || mv.promotion === promotion));
    }


    // ----------------------------------------------------------------------
    // Importació de PGN extern (partides d'altres plataformes o de tornejos)
    // ----------------------------------------------------------------------
    // Funcions PURES de text: separar un fitxer PGN en partides, llegir-ne
    // les capçaleres i netejar el movetext (comentaris, variants, NAGs...)
    // fins a deixar només els tokens de jugada. La validació de legalitat amb
    // chess.js es fa a app.js, que és qui té el motor de regles.

    // Separa un text PGN (possiblement amb més d'una partida) en blocs d'una
    // partida cadascun. Una partida nova comença quan apareix una línia de
    // capçalera «[Tag "…"]» després d'haver vist movetext.
    function splitPgnGames(text) {
        if (!text || typeof text !== 'string') return [];
        const lines = text.replace(/\r\n?/g, '\n').split('\n');
        const games = [];
        let current = [];
        let inMoveText = false;
        for (const line of lines) {
            const trimmed = line.trim();
            const isHeader = /^\[\s*\w+\s+"/.test(trimmed);
            if (isHeader && inMoveText) {
                if (current.join('\n').trim()) games.push(current.join('\n').trim());
                current = [];
                inMoveText = false;
            }
            if (trimmed && !isHeader) inMoveText = true;
            current.push(line);
        }
        if (current.join('\n').trim()) games.push(current.join('\n').trim());
        return games;
    }

    // Llegeix les capçaleres «[Tag "Valor"]» d'un bloc de partida i en separa
    // el movetext. Retorna { headers: {Tag: valor}, moveText: '…' }.
    function parsePgnHeaders(gameText) {
        const headers = {};
        const moveLines = [];
        if (!gameText || typeof gameText !== 'string') return { headers, moveText: '' };
        const lines = gameText.replace(/\r\n?/g, '\n').split('\n');
        for (const line of lines) {
            const m = line.trim().match(/^\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]$/);
            if (m) {
                headers[m[1]] = m[2].replace(/\\(["\\])/g, '$1');
            } else {
                moveLines.push(line);
            }
        }
        return { headers, moveText: moveLines.join('\n').trim() };
    }

    // Neteja el movetext d'un PGN i retorna només els tokens de jugada (SAN):
    // treu comentaris {…} i «;», variants (…) encara que estiguin niades,
    // NAGs ($n), números de jugada, punts suspensius, anotacions «!?» i el
    // resultat final. Normalitza l'enroc escrit amb zeros (0-0 → O-O).
    function sanitizePgnMoveText(moveText) {
        if (!moveText || typeof moveText !== 'string') return [];
        let text = moveText.replace(/\r\n?/g, '\n');
        text = text.replace(/;[^\n]*/g, ' ');
        text = text.replace(/\{[^}]*\}/g, ' ');
        // Variants entre parèntesis, possiblement niades: comptador de profunditat.
        let flat = '';
        let depth = 0;
        for (const ch of text) {
            if (ch === '(') { depth++; continue; }
            if (ch === ')') { if (depth > 0) depth--; continue; }
            if (depth === 0) flat += ch;
        }
        const RESULT_TOKENS = { '1-0': true, '0-1': true, '1/2-1/2': true, '*': true };
        const tokens = [];
        for (let raw of flat.split(/\s+/)) {
            if (!raw || RESULT_TOKENS[raw] || /^\$\d+$/.test(raw)) continue;
            raw = raw.replace(/^(\d+)\.+/, '');     // «12.», «12...» (sols o enganxats a la jugada)
            raw = raw.replace(/^\.+/, '');          // «…» separats de la jugada
            if (!raw || RESULT_TOKENS[raw] || /^\d+$/.test(raw)) continue;
            raw = raw.replace(/\$\d+$/, '');        // NAG enganxat al final de la jugada
            raw = raw.replace(/[!?]+$/, '');        // anotacions «!», «?!»…
            raw = raw.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
            if (!raw) continue;
            tokens.push(raw);
        }
        return tokens;
    }

    // Converteix l'etiqueta Result d'un PGN en l'etiqueta de resultat de
    // l'historial, segons el color del jugador. Retorna null si no se sap.
    function pgnResultToLabel(resultTag, playerColor) {
        const tag = String(resultTag || '').trim();
        const white = playerColor !== 'b';
        if (tag === '1-0') return white ? 'Victòria' : 'Derrota';
        if (tag === '0-1') return white ? 'Derrota' : 'Victòria';
        if (tag === '1/2-1/2') return 'Taules';
        return null;
    }

    // Nom llegible dels jugadors d'una partida importada, per a la llista i la
    // revisió: «Blanques – Negres» segons les capçaleres del PGN. Si el PGN no
    // duu noms, es recorre al nom del fitxer (sense extensió i amb els
    // separadors _-. convertits en espais): els fitxers de partides de grans
    // mestres solen dur-hi els jugadors. Retorna null si no hi ha res d'útil.
    function pgnPlayersLabel(headers, fileName) {
        const clean = v => {
            const s = String(v == null ? '' : v).trim();
            return s && s !== '?' ? s : null;
        };
        const white = clean(headers && headers.White);
        const black = clean(headers && headers.Black);
        if (white || black) return (white || 'Blanques') + ' – ' + (black || 'Negres');
        const file = String(fileName || '')
            .replace(/\.[^./\\]+$/, '')
            .replace(/[_\-.]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return file || null;
    }

    // Endevina amb quin color jugava l'usuari a partir de les capçaleres
    // White/Black i el seu nom d'usuari. Retorna 'w', 'b' o null si no és
    // clar (cap coincidència, o coincidència amb tots dos colors).
    function guessPlayerColorFromPgnHeaders(headers, username) {
        if (!headers) return null;
        const norm = s => String(s || '').trim().toLowerCase();
        const user = norm(username);
        if (!user) return null;
        const matches = (name) => {
            const n = norm(name);
            return !!n && n !== '?' && (n === user || n.includes(user) || user.includes(n));
        };
        const w = matches(headers.White);
        const b = matches(headers.Black);
        if (w && !b) return 'w';
        if (b && !w) return 'b';
        return null;
    }

    // ======================================================================
    // RIVAL ANTÍDOT — perfil de debilitats i selecció pedagògica de jugades
    // ======================================================================
    // La idea: Stockfish diu quines jugades són BONES; El Tauler decideix quina
    // de les bones és més ÚTIL per a aquest jugador. Tot el que hi ha aquí és
    // pur (sense DOM, worker ni estat global): app.js hi porta les candidates
    // que retorna el MultiPV del motor i el perfil que surt de l'historial.
    //
    // Cap funció d'aquest bloc no pot triar una jugada dolenta: primer passen
    // els filtres objectius (marge en centpeons, mat forçat, canvi de cubell
    // d'avantatge, material net) i NOMÉS entre les supervivents es puntua la
    // utilitat pedagògica. Si no en queda cap, es juga la millor del motor.

    const ANTIDOTE_CONFIG = {
        version: 1,

        // Ponderació del pes d'una debilitat (secció 3 de l'especificació).
        weights: {
            frequency: 0.35,
            severity: 0.30,
            recency: 0.20,
            confidence: 0.15
        },

        // Confiança estadística: amb 1-2 mostres ha de ser baixa i créixer a poc
        // a poc. confidence = n / (n + halfSample), normalitzada a fullSamples.
        confidence: {
            halfSample: 8,      // amb 8 mostres la confiança crua és 0,5
            fullSamples: 40,    // a partir d'aquí es considera confiança plena
            minOccurrences: 1   // menys d'això no genera cap registre
        },

        // Recència: una errada perd la meitat del pes cada halfLifeDays.
        recencyHalfLifeDays: 21,
        recencyMaxDays: 240,

        // Marge pedagògic màxim respecte de la millor jugada, per nivell.
        cpMargin: { beginner: 80, intermediate: 50, advanced: 30 },
        eloBands: { beginner: 1000, intermediate: 1600 },

        // Línies candidates que es demanen al motor segons el dispositiu.
        multiPv: { desktop: 6, mobile: 4, lowPower: 3 },

        // Pressupost de cerca per ritme de rellotge (ms de movetime i profunditat).
        budget: {
            none:     { depth: 16, moveTimeMs: 2600, multiPvCap: 6 },
            classic:  { depth: 15, moveTimeMs: 2000, multiPvCap: 6 },
            rapid:    { depth: 14, moveTimeMs: 1500, multiPvCap: 5 },
            blitz:    { depth: 12, moveTimeMs: 700,  multiPvCap: 4 },
            bullet:   { depth: 10, moveTimeMs: 260,  multiPvCap: 3 }
        },

        // Fórmula de selecció final (secció 7).
        score: {
            safety: 100,
            weakness: 60,
            phase: 20,
            difficulty: 15,
            novelty: 12,
            repetition: 20
        },
        tieBandScore: 6,          // candidates «pràcticament empatades»

        // Mat: quantes semijugades de més s'accepten conservant el mat forçat.
        mateExtraPlies: 2,
        mateStepCp: 5,            // cost simbòlic de cada semijugada de més

        // Sacrifici: material net perdut només s'accepta si el motor diu que la
        // jugada val pràcticament el mateix que la millor (compensació real).
        sacrificeCpTolerance: 15,

        // Semijugades de la línia principal que s'exploren per classificar.
        pvScanPlies: 6,
        // Semijugades que es PERSISTEIXEN d'una prova (prou per reconstruir-la).
        storedPvPlies: 6,
        maxStoredTests: 24,

        // Avaluació de la resposta del jugador.
        response: {
            passCpLoss: 40,
            partialCpLoss: 120,
            // Per sota d'aquest pes temàtic la candidata no genera cap prova.
            minThemeStrength: 0.35,
            // Posicions ja decidides: una pèrdua allà no és un fracàs net.
            decidedCp: 600
        },

        // Varietat: finestra de proves recents que penalitza repetir tema.
        recentWindow: 6,
        // Una prova superada rebaixa el pes de la debilitat; una de fallada el puja.
        progress: { passDamp: 0.12, failBoost: 0.10, partialDamp: 0.04, minWeightFloor: 0.15 },

        // Perfil «prim»: encara no hi ha prou dades per treure conclusions.
        thinProfile: { minGames: 4, minSamples: 12 }
    };

    // Categories de debilitat. Són les MATEIXES que ja fa servir el sistema de
    // moments clau (keyMomentReasonCode) més king_safety, que la revisió ja
    // detecta: no s'inventa cap classificació nova.
    const ANTIDOTE_WEAKNESS_IDS = [
        'missed_win',
        'lost_advantage',
        'turned_losing',
        'missed_tactic',
        'lost_material',
        'king_safety',
        'endgame_turning_point',
        'strategic_error'
    ];

    const ANTIDOTE_WEAKNESS_LABELS = {
        missed_win: 'Rematar les posicions guanyades',
        lost_advantage: 'Mantenir un avantatge',
        turned_losing: 'No perdre el fil en posicions igualades',
        missed_tactic: 'Veure les tàctiques',
        lost_material: 'No deixar material',
        king_safety: 'Defensar el teu rei',
        endgame_turning_point: 'Decidir bé als finals',
        strategic_error: 'Triar el pla correcte'
    };

    // Subtemes que sap detectar l'app sobre una candidata concreta, i a quina
    // categoria de debilitat pertany cadascun. Els identificadors coincideixen
    // amb els que ja fan servir els jeroglífics sempre que existeixen.
    const ANTIDOTE_THEME_FAMILY = {
        // Tàctica
        fork: 'missed_tactic',
        pin: 'missed_tactic',
        skewer: 'missed_tactic',
        discovered_attack: 'missed_tactic',
        double_attack: 'missed_tactic',
        deflection: 'missed_tactic',
        overload: 'missed_tactic',
        hanging_piece: 'lost_material',
        material_win: 'lost_material',
        promotion: 'endgame_turning_point',
        mate_threat: 'king_safety',
        // Rei
        king_attack: 'king_safety',
        pawn_shield_loss: 'king_safety',
        king_in_center: 'king_safety',
        castling_lost: 'king_safety',
        only_defense: 'king_safety',
        // Finals
        queen_trade: 'endgame_turning_point',
        rook_endgame: 'endgame_turning_point',
        minor_endgame: 'endgame_turning_point',
        pawn_endgame: 'endgame_turning_point',
        passed_pawn: 'endgame_turning_point',
        king_activity: 'endgame_turning_point',
        simplification: 'endgame_turning_point',
        // Estratègia
        open_file: 'strategic_error',
        weak_square: 'strategic_error',
        isolated_pawn: 'strategic_error',
        pawn_break: 'strategic_error',
        piece_activity: 'strategic_error',
        prophylaxis: 'strategic_error',
        defensive_move: 'strategic_error',
        quiet_improvement: 'strategic_error'
    };

    const ANTIDOTE_THEME_LABELS = {
        fork: 'forquilla',
        pin: 'clavada',
        skewer: 'enfilada',
        discovered_attack: 'atac descobert',
        double_attack: 'doble atac',
        deflection: 'desviació',
        overload: 'sobrecàrrega',
        hanging_piece: 'peça indefensa',
        material_win: 'guany de material',
        promotion: 'promoció',
        mate_threat: 'amenaça de mat',
        king_attack: 'atac al rei',
        pawn_shield_loss: 'pèrdua de cobertura de peons',
        king_in_center: 'rei al centre',
        castling_lost: 'enroc perdut',
        only_defense: 'defensa única',
        queen_trade: 'canvi de dames',
        rook_endgame: 'final de torres',
        minor_endgame: 'final de peces menors',
        pawn_endgame: 'final de peons',
        passed_pawn: 'peó passat',
        king_activity: 'activitat del rei',
        simplification: 'simplificació',
        open_file: 'columna oberta',
        weak_square: 'casella feble',
        isolated_pawn: 'peó aïllat',
        pawn_break: 'ruptura de peons',
        piece_activity: 'activitat de peces',
        prophylaxis: 'profilaxi',
        defensive_move: 'defensa',
        quiet_improvement: 'millora tranquil·la'
    };

    // Els temes que posen a prova la CONVERSIÓ d'un avantatge o el manteniment
    // de l'equilibri no són situacions del tauler, sinó com de viva queda la
    // posició. Per això les categories «de resultat» es puntuen per complexitat.
    const ANTIDOTE_COMPLEXITY_FAMILIES = ['missed_win', 'lost_advantage', 'turned_losing'];

    const ANTIDOTE_PHASES = ['opening', 'middlegame', 'endgame'];

    function antidoteNum(v, fallback) {
        return (typeof v === 'number' && isFinite(v)) ? v : (fallback === undefined ? 0 : fallback);
    }

    function antidoteClamp01(v) {
        const n = antidoteNum(v, 0);
        return n < 0 ? 0 : (n > 1 ? 1 : n);
    }

    function antidoteThemeLabel(id) {
        return ANTIDOTE_THEME_LABELS[id] || ANTIDOTE_WEAKNESS_LABELS[id] || String(id || '');
    }

    function antidoteWeaknessLabel(id) {
        return ANTIDOTE_WEAKNESS_LABELS[id] || 'Aspecte general';
    }

    // Categoria de debilitat a què pertany un identificador. Accepta tant un
    // subtema de candidata (`fork`, `king_attack`…) com una categoria ja
    // resolta (`missed_tactic`…), perquè les proves desades hi guarden la
    // categoria i les candidates hi porten el subtema.
    function antidoteThemeFamily(id) {
        if (ANTIDOTE_WEAKNESS_IDS.indexOf(id) !== -1) return id;
        return ANTIDOTE_THEME_FAMILY[id] || 'strategic_error';
    }

    // ----------------------------------------------------------------------
    //  Avaluacions: normalització i comparació amb mat
    // ----------------------------------------------------------------------
    // Conveni ÚNIC: tota puntuació es mira des del bàndol que MOU (el que fa
    // servir el motor a les línies MultiPV). El mat es converteix a una escala
    // pròpia, molt per sobre de qualsevol centpeó, de manera que mai no es
    // barregen aritmèticament centpeons i distàncies de mat.
    const ANTIDOTE_MATE_BASE = 100000;
    const ANTIDOTE_MATE_FLOOR = ANTIDOTE_MATE_BASE - 2000;  // mat en ≤200 jugades

    // {eval, evalType} (format d'EnrichedAnalysis) → valor comparable, o null.
    function antidoteScoreValue(entry) {
        if (entry === null || typeof entry === 'undefined') return null;
        if (typeof entry === 'number') return isFinite(entry) ? entry : null;
        const raw = entry.eval !== undefined ? entry.eval
            : (entry.score !== undefined ? entry.score : entry.cp);
        if (typeof raw !== 'number' || !isFinite(raw)) return null;
        const type = entry.evalType || entry.scoreType || 'cp';
        if (type !== 'mate') return raw;
        if (raw === 0) return null;                 // «mat en 0»: dada no fiable
        const plies = Math.min(200, Math.abs(raw));
        return raw > 0 ? (ANTIDOTE_MATE_BASE - plies * 10) : -(ANTIDOTE_MATE_BASE - plies * 10);
    }

    function antidoteIsMateValue(v) {
        return typeof v === 'number' && Math.abs(v) >= ANTIDOTE_MATE_FLOOR;
    }

    // Jugades fins al mat que representa un valor de mat (positiu = a favor).
    function antidoteMateDistance(v) {
        if (!antidoteIsMateValue(v)) return null;
        return Math.round((ANTIDOTE_MATE_BASE - Math.abs(v)) / 10);
    }

    // Pèrdua d'una candidata respecte de la millor jugada, en centpeons
    // comparables. Retorna Infinity quan la candidata és inacceptable per
    // definició (abandona un mat forçat, o es deixa matar).
    function antidoteCpLoss(bestValue, candidateValue, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        if (typeof bestValue !== 'number' || typeof candidateValue !== 'number') return null;
        const bestMate = antidoteIsMateValue(bestValue);
        const candMate = antidoteIsMateValue(candidateValue);
        // La candidata rep mat: mai.
        if (candMate && candidateValue < 0 && !(bestMate && bestValue < 0)) return Infinity;
        if (bestMate && bestValue > 0) {
            // Hi ha mat forçat a favor: només s'accepten candidates que també matin.
            if (!candMate || candidateValue < 0) return Infinity;
            const bestPlies = antidoteMateDistance(bestValue);
            const candPlies = antidoteMateDistance(candidateValue);
            if (candPlies > bestPlies + cfg.mateExtraPlies) return Infinity;
            return Math.max(0, (candPlies - bestPlies) * cfg.mateStepCp);
        }
        if (bestMate && bestValue < 0) {
            // Estem perduts per mat: com més lluny el mat, millor defensa.
            if (!candMate) return 0;
            const bestPlies = antidoteMateDistance(bestValue);
            const candPlies = antidoteMateDistance(candidateValue);
            return Math.max(0, (bestPlies - candPlies) * 20);
        }
        // La candidata dona mat i la millor no ho deia: mai és una pèrdua.
        if (candMate && candidateValue > 0) return 0;
        return Math.max(0, bestValue - candidateValue);
    }

    // Cubell d'avantatge del bàndol que mou (reutilitza els llindars dels
    // moments clau: la mateixa escala que ja fa servir tota la revisió).
    function antidoteBucket(value) {
        if (typeof value !== 'number') return 0;
        if (antidoteIsMateValue(value)) return value > 0 ? 2 : -2;
        return keyMomentBucket(value);
    }

    // Marge pedagògic segons el nivell del jugador.
    function antidoteCpMargin(elo, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const e = antidoteNum(elo, 0);
        if (e < cfg.eloBands.beginner) return cfg.cpMargin.beginner;
        if (e < cfg.eloBands.intermediate) return cfg.cpMargin.intermediate;
        return cfg.cpMargin.advanced;
    }

    // Nombre de línies candidates a demanar segons dispositiu i rellotge.
    function antidoteMultiPv(options, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const opts = options || {};
        let base = cfg.multiPv.desktop;
        if (opts.lowPower) base = cfg.multiPv.lowPower;
        else if (opts.mobile) base = cfg.multiPv.mobile;
        const budget = antidoteSearchBudget(opts.timeControlKind, config);
        return Math.max(2, Math.min(base, budget.multiPvCap));
    }

    // Pressupost de cerca segons el tipus de ritme.
    function antidoteSearchBudget(kind, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const key = String(kind || 'none');
        return cfg.budget[key] || cfg.budget.none;
    }

    // ----------------------------------------------------------------------
    //  Perfil de debilitats
    // ----------------------------------------------------------------------

    function antidoteEmptyWeakness() {
        return { weight: 0, confidence: 0, occurrences: 0, severity: 0, lastSeen: null };
    }

    function antidoteEmptyProfile() {
        const weaknesses = {};
        ANTIDOTE_WEAKNESS_IDS.forEach(id => { weaknesses[id] = antidoteEmptyWeakness(); });
        return {
            version: ANTIDOTE_CONFIG.version,
            sampleGames: 0,
            sampleMoves: 0,
            weaknesses: weaknesses,
            phaseWeaknesses: { opening: 0, middlegame: 0, endgame: 0 },
            recentTests: []
        };
    }

    // Fase d'una jugada revisada. Reutilitza el criteri del bessó (número de
    // jugada per a l'obertura, material per al final).
    function antidoteReviewPhase(review, playerColor) {
        const moveNumber = antidoteNum(review && review.moveNumber, 0);
        const ply = Math.max(0, (moveNumber - 1) * 2 + (playerColor === 'b' ? 1 : 0));
        if (review && review.fen) return bessoPhaseOfPosition(review.fen, ply);
        return moveNumber <= 10 ? 'opening' : 'middlegame';
    }

    // Categoria d'una jugada dolenta concreta. Fa servir EXACTAMENT el mateix
    // classificador que els moments clau, de manera que el perfil i la ressenya
    // parlen el mateix idioma.
    function antidoteReviewCategory(review, playerColor) {
        if (!review) return null;
        const swing = antidoteNum(review.swing, 0);
        const quality = review.quality || null;
        // Només compten les decisions realment fallades.
        if (quality === 'excel' || quality === 'good') return null;
        if (swing < 50 && quality !== 'blunder' && quality !== 'mistake') return null;
        return keyMomentReasonCode({
            evalBefore: (typeof review.evalBefore === 'number') ? review.evalBefore : null,
            evalAfter: (typeof review.evalAfter === 'number') ? review.evalAfter : null,
            cpLoss: swing,
            phase: antidoteReviewPhase(review, playerColor),
            forcingInfo: review.forcingInfo || null
        });
    }

    // Gravetat normalitzada [0,1] d'una errada, a partir de la pèrdua en cp.
    function antidoteSeverityFromSwing(swing) {
        return antidoteClamp01(antidoteNum(swing, 0) / 400);
    }

    // Resum ANTÍDOT d'UNA partida: comptes per categoria i per fase. Es calcula
    // un sol cop, en acabar la partida, i es desa a l'índex lleuger de
    // l'historial (com phaseStats del bessó): així el perfil pot mirar
    // centenars de partides sense carregar-ne cap revisió.
    function antidoteWeaknessStatsFromGame(entry) {
        const stats = { moves: 0, categories: {}, phases: { opening: 0, middlegame: 0, endgame: 0 }, phaseMoves: { opening: 0, middlegame: 0, endgame: 0 } };
        if (!entry) return stats;
        const color = entry.playerColor;
        const reviews = Array.isArray(entry.moveReviews) ? entry.moveReviews : [];
        reviews.forEach(r => {
            if (!r || (color && r.color !== color)) return;
            stats.moves += 1;
            const phase = antidoteReviewPhase(r, color);
            const swing = Math.max(0, Math.min(900, antidoteNum(r.swing, 0)));
            stats.phaseMoves[phase] = (stats.phaseMoves[phase] || 0) + 1;
            stats.phases[phase] = (stats.phases[phase] || 0) + swing;
            const category = antidoteReviewCategory(r, color);
            if (!category) return;
            const acc = stats.categories[category] || { n: 0, severity: 0 };
            acc.n += 1;
            acc.severity += antidoteSeverityFromSwing(swing);
            stats.categories[category] = acc;
        });
        return stats;
    }

    // Resum ANTÍDOT d'una partida: el desat si n'hi ha, o calculat al vol.
    function antidoteGameStats(entry) {
        const stored = entry && entry.antidoteStats;
        if (stored && typeof stored === 'object' && stored.categories && typeof stored.categories === 'object') {
            return {
                moves: Math.max(0, antidoteNum(stored.moves, 0)),
                categories: stored.categories,
                phases: Object.assign({ opening: 0, middlegame: 0, endgame: 0 }, stored.phases || {}),
                phaseMoves: Object.assign({ opening: 0, middlegame: 0, endgame: 0 }, stored.phaseMoves || {})
            };
        }
        return antidoteWeaknessStatsFromGame(entry);
    }

    // Factor de recència [0,1]: 1 avui, 0,5 al cap de recencyHalfLifeDays.
    function antidoteRecencyFactor(lastSeen, now, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const then = typeof lastSeen === 'number' ? lastSeen : Date.parse(lastSeen);
        if (!then || !isFinite(then)) return 0.35;   // sense data: mitjana prudent
        const ref = antidoteNum(now, Date.now()) || Date.now();
        const days = Math.max(0, (ref - then) / 86400000);
        if (days > cfg.recencyMaxDays) return 0;
        return Math.pow(0.5, days / Math.max(1, cfg.recencyHalfLifeDays));
    }

    // Confiança estadística per volum de mostres: baixa amb 1-2 mostres i
    // creixent, mai categòrica.
    function antidoteConfidence(occurrences, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const n = Math.max(0, antidoteNum(occurrences, 0));
        if (n <= 0) return 0;
        const raw = n / (n + cfg.confidence.halfSample);
        const full = cfg.confidence.fullSamples / (cfg.confidence.fullSamples + cfg.confidence.halfSample);
        return antidoteClamp01(raw / full);
    }

    // Pes d'una debilitat: freqüència 35% + gravetat 30% + recència 20% +
    // confiança 15%. Totes les constants viuen a ANTIDOTE_CONFIG.
    function antidoteWeaknessWeight(record, context, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const rec = record || {};
        const ctx = context || {};
        const occurrences = Math.max(0, antidoteNum(rec.occurrences, 0));
        if (occurrences <= 0) return 0;
        const totalErrors = Math.max(1, antidoteNum(ctx.totalOccurrences, occurrences));
        const frequency = antidoteClamp01(occurrences / totalErrors);
        const severity = antidoteClamp01(antidoteNum(rec.severity, 0));
        const recency = antidoteClamp01(antidoteRecencyFactor(rec.lastSeen, ctx.now, cfg));
        const confidence = antidoteClamp01(
            typeof rec.confidence === 'number' ? rec.confidence : antidoteConfidence(occurrences, cfg));
        const w = cfg.weights;
        const weight = frequency * w.frequency
            + severity * w.severity
            + recency * w.recency
            + confidence * w.confidence;
        return antidoteClamp01(weight);
    }

    // Aplica el rendiment de les proves ANTÍDOT anteriors sobre el pes cru:
    // superar-les l'abaixa progressivament, fallar-les el puja. Una sola prova
    // superada no esborra mai una debilitat consolidada (hi ha un terra).
    function antidoteApplyTestFeedback(weight, record, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const rec = record || {};
        const passed = Math.max(0, antidoteNum(rec.testsPassed, 0));
        const failed = Math.max(0, antidoteNum(rec.testsFailed, 0));
        const partial = Math.max(0, antidoteNum(rec.testsPartial, 0));
        const p = cfg.progress;
        // Rendiments decreixents: la 1a prova superada compta molt més que la 6a.
        const damp = (1 - Math.exp(-passed * p.passDamp)) + (1 - Math.exp(-partial * p.partialDamp));
        const boost = (1 - Math.exp(-failed * p.failBoost));
        const adjusted = weight * (1 - Math.min(0.6, damp)) * (1 + boost);
        // Terra: una debilitat consolidada (moltes mostres) no desapareix per
        // una ratxa curta de proves superades.
        const floor = weight * p.minWeightFloor;
        return antidoteClamp01(Math.max(failed > passed ? weight : floor, adjusted));
    }

    // Construeix el perfil de debilitats. Fonts (totes ja existents):
    //   · games        — historial (revisions o el resum lleuger antidoteStats)
    //   · savedErrors  — biblioteca d'errades desades
    //   · tests        — proves ANTÍDOT anteriors (de partides mode antidote)
    // Mai llança: davant de dades corruptes, retorna el que hagi pogut llegir.
    function buildAntidoteProfile(input, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const profile = antidoteEmptyProfile();
        const source = input || {};
        const now = antidoteNum(source.now, Date.now()) || Date.now();
        const games = Array.isArray(source.games) ? source.games : [];
        const savedErrors = Array.isArray(source.savedErrors) ? source.savedErrors : [];
        const tests = Array.isArray(source.tests) ? source.tests : [];

        const raw = {};
        ANTIDOTE_WEAKNESS_IDS.forEach(id => {
            raw[id] = { occurrences: 0, severitySum: 0, lastSeen: null, testsPassed: 0, testsPartial: 0, testsFailed: 0 };
        });
        const phaseLoss = { opening: 0, middlegame: 0, endgame: 0 };
        const phaseMoves = { opening: 0, middlegame: 0, endgame: 0 };

        games.forEach(entry => {
            if (!entry || typeof entry !== 'object') return;
            let stats;
            try { stats = antidoteGameStats(entry); } catch (e) { return; }
            if (!stats || !stats.categories) return;
            const played = Date.parse(entry.date || entry.createdAt || '') || null;
            profile.sampleGames += 1;
            profile.sampleMoves += Math.max(0, antidoteNum(stats.moves, 0));
            ANTIDOTE_PHASES.forEach(p => {
                phaseLoss[p] += Math.max(0, antidoteNum(stats.phases && stats.phases[p], 0));
                phaseMoves[p] += Math.max(0, antidoteNum(stats.phaseMoves && stats.phaseMoves[p], 0));
            });
            Object.keys(stats.categories).forEach(id => {
                if (!raw[id]) return;
                const acc = stats.categories[id];
                if (!acc || typeof acc !== 'object') return;
                const n = Math.max(0, antidoteNum(acc.n, 0));
                if (!n) return;
                raw[id].occurrences += n;
                raw[id].severitySum += Math.max(0, antidoteNum(acc.severity, 0));
                if (played && (!raw[id].lastSeen || played > raw[id].lastSeen)) raw[id].lastSeen = played;
            });
        });

        // Errades desades: reforcen les categories tàctiques i de material amb
        // la seva pròpia gravetat i data (és la biblioteca de repàs de l'app).
        savedErrors.forEach(err => {
            if (!err || typeof err !== 'object') return;
            const id = err.antidoteCategory && raw[err.antidoteCategory]
                ? err.antidoteCategory
                : (err.severity === 'high' ? 'lost_material' : 'missed_tactic');
            if (!raw[id]) return;
            raw[id].occurrences += 1;
            raw[id].severitySum += err.severity === 'high' ? 0.85 : 0.5;
            const when = Date.parse(err.date || '') || null;
            if (when && (!raw[id].lastSeen || when > raw[id].lastSeen)) raw[id].lastSeen = when;
        });

        // Proves ANTÍDOT anteriors: rendiment per categoria.
        // Compta el PRIMER intent, no el darrer. Si el jugador ha tirat la
        // jugada enrere i ha tornat a provar, el que mesura la seva força a la
        // partida de veritat és què va fer sense saber-ho; comptar el segon
        // intent faria baixar el pes d'una debilitat que continua sent-hi.
        tests.forEach(t => {
            if (!t || typeof t !== 'object') return;
            const id = raw[t.theme] ? t.theme : antidoteThemeFamily(t.theme);
            if (!raw[id]) return;
            const outcome = t.firstResult || t.result;
            if (outcome === 'passed') raw[id].testsPassed += 1;
            else if (outcome === 'partial') raw[id].testsPartial += 1;
            else if (outcome === 'failed') {
                raw[id].testsFailed += 1;
                raw[id].occurrences += 1;
                raw[id].severitySum += antidoteClamp01(antidoteNum(t.severity, 0.6));
                const when = antidoteNum(t.at, 0) || null;
                if (when && (!raw[id].lastSeen || when > raw[id].lastSeen)) raw[id].lastSeen = when;
            }
        });

        const totalOccurrences = ANTIDOTE_WEAKNESS_IDS
            .reduce((sum, id) => sum + raw[id].occurrences, 0);

        ANTIDOTE_WEAKNESS_IDS.forEach(id => {
            const r = raw[id];
            const record = profile.weaknesses[id];
            record.occurrences = r.occurrences;
            record.severity = r.occurrences ? antidoteClamp01(r.severitySum / r.occurrences) : 0;
            record.lastSeen = r.lastSeen ? new Date(r.lastSeen).toISOString() : null;
            record.confidence = antidoteConfidence(r.occurrences, cfg);
            record.testsPassed = r.testsPassed;
            record.testsPartial = r.testsPartial;
            record.testsFailed = r.testsFailed;
            const base = antidoteWeaknessWeight(record, { totalOccurrences: totalOccurrences, now: now }, cfg);
            record.weight = antidoteApplyTestFeedback(base, record, cfg);
        });

        // Debilitat per fase: pèrdua mitjana de la fase comparada amb la global.
        const totalMoves = ANTIDOTE_PHASES.reduce((s, p) => s + phaseMoves[p], 0);
        const totalLoss = ANTIDOTE_PHASES.reduce((s, p) => s + phaseLoss[p], 0);
        const globalAvg = totalMoves ? totalLoss / totalMoves : 0;
        ANTIDOTE_PHASES.forEach(p => {
            if (!phaseMoves[p] || !globalAvg) { profile.phaseWeaknesses[p] = 0; return; }
            const avg = phaseLoss[p] / phaseMoves[p];
            // 0 = com la mitjana o millor; 1 = el doble de pèrdua que la mitjana.
            profile.phaseWeaknesses[p] = antidoteClamp01((avg - globalAvg) / Math.max(1, globalAvg));
        });

        profile.recentTests = tests
            .slice(-cfg.recentWindow)
            .map(t => ({ theme: t && t.theme ? t.theme : null, result: t && t.result ? t.result : 'inconclusive' }))
            .filter(t => t.theme);
        profile.totalOccurrences = totalOccurrences;
        return profile;
    }

    // ¿El perfil encara és prim (poques dades)? La modalitat ha de poder
    // començar igualment, però el text d'introducció ha de ser un altre.
    function antidoteProfileIsThin(profile, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        if (!profile) return true;
        const games = antidoteNum(profile.sampleGames, 0);
        const moves = antidoteNum(profile.sampleMoves, 0);
        const occ = antidoteNum(profile.totalOccurrences, 0);
        return games < cfg.thinProfile.minGames || moves < cfg.thinProfile.minSamples || occ <= 0;
    }

    // Les N debilitats principals, ordenades per pes. Cada element porta el pes
    // i la confiança, perquè la introducció mai presenti conclusions
    // categòriques amb poques partides.
    function antidoteTopWeaknesses(profile, count) {
        const n = Math.max(1, antidoteNum(count, 3));
        const weaknesses = (profile && profile.weaknesses) || {};
        return ANTIDOTE_WEAKNESS_IDS
            .map(id => {
                const r = weaknesses[id] || antidoteEmptyWeakness();
                return {
                    id: id,
                    label: antidoteWeaknessLabel(id),
                    weight: antidoteClamp01(antidoteNum(r.weight, 0)),
                    confidence: antidoteClamp01(antidoteNum(r.confidence, 0)),
                    occurrences: Math.max(0, antidoteNum(r.occurrences, 0)),
                    severity: antidoteClamp01(antidoteNum(r.severity, 0))
                };
            })
            .filter(w => w.occurrences > 0 && w.weight > 0)
            .sort((a, b) => (b.weight - a.weight) || (b.occurrences - a.occurrences) || a.id.localeCompare(b.id))
            .slice(0, n);
    }

    // Etiqueta de confiança en català natural (mai categòrica amb poques dades).
    function antidoteConfidenceLabel(confidence) {
        const c = antidoteClamp01(confidence);
        if (c < 0.25) return 'indici inicial';
        if (c < 0.5) return 'tendència';
        if (c < 0.75) return 'patró clar';
        return 'patró molt marcat';
    }

    // ----------------------------------------------------------------------
    //  Filtres objectius i puntuació de candidates
    // ----------------------------------------------------------------------

    // Comprova si una candidata és acceptable per QUALITAT (res pedagògic aquí).
    // Retorna { allowed, reason, cpLoss, objectiveSafety }.
    function antidoteCandidateGuard(candidate, context, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const ctx = context || {};
        const cand = candidate || {};
        const bestValue = typeof ctx.bestValue === 'number' ? ctx.bestValue : antidoteScoreValue(ctx.best);
        const candValue = typeof cand.scoreValue === 'number' ? cand.scoreValue : antidoteScoreValue(cand);
        if (bestValue === null || candValue === null) {
            return { allowed: false, reason: 'no_eval', cpLoss: null, objectiveSafety: 0 };
        }
        const margin = antidoteNum(ctx.margin, antidoteCpMargin(ctx.playerElo, cfg));
        const cpLoss = antidoteCpLoss(bestValue, candValue, cfg);
        if (cpLoss === null || !isFinite(cpLoss)) {
            return { allowed: false, reason: 'mate_or_illegal', cpLoss: cpLoss, objectiveSafety: 0 };
        }
        if (cpLoss > margin) {
            return { allowed: false, reason: 'over_margin', cpLoss: cpLoss, objectiveSafety: 0 };
        }
        // Canvis de cubell: guanyada → igualada, o igualada → perduda, mai.
        const bestBucket = antidoteBucket(bestValue);
        const candBucket = antidoteBucket(candValue);
        if (bestBucket >= 1 && candBucket <= 0) {
            return { allowed: false, reason: 'drops_win', cpLoss: cpLoss, objectiveSafety: 0 };
        }
        if (bestBucket >= 0 && candBucket <= -1) {
            return { allowed: false, reason: 'drops_to_losing', cpLoss: cpLoss, objectiveSafety: 0 };
        }
        // Material net perdut sense compensació reconeguda pel motor.
        const materialLoss = antidoteNum(cand.materialLoss, 0);
        if (materialLoss >= 1 && cpLoss > cfg.sacrificeCpTolerance) {
            return { allowed: false, reason: 'hangs_material', cpLoss: cpLoss, objectiveSafety: 0 };
        }
        // Només una jugada evita una derrota clara: es juga aquella.
        if (ctx.onlySavingMove && cand.move !== ctx.onlySavingMove) {
            return { allowed: false, reason: 'only_saving_move', cpLoss: cpLoss, objectiveSafety: 0 };
        }
        const objectiveSafety = antidoteClamp01(1 - (cpLoss / Math.max(1, margin)));
        return { allowed: true, reason: null, cpLoss: cpLoss, objectiveSafety: objectiveSafety };
    }

    // Complexitat objectiu segons el ROC: als nivells baixos, proves més clares;
    // als alts, posicions més denses.
    function antidoteTargetComplexity(elo) {
        const e = antidoteNum(elo, 1200);
        if (e < 800) return 0.35;
        if (e < 1200) return 0.5;
        if (e < 1600) return 0.62;
        if (e < 2000) return 0.72;
        return 0.8;
    }

    // Coincidència amb el perfil: quant posa a prova aquesta candidata alguna
    // debilitat REAL del jugador. Retorna { match, themeId, family }.
    function antidoteWeaknessMatch(candidate, profile, config) {
        const cand = candidate || {};
        const themes = Array.isArray(cand.themes) ? cand.themes : [];
        const weaknesses = (profile && profile.weaknesses) || {};
        let best = { match: 0, themeId: null, family: null };
        themes.forEach(t => {
            if (!t || !t.id) return;
            const family = antidoteThemeFamily(t.id);
            const record = weaknesses[family];
            const weight = antidoteClamp01(antidoteNum(record && record.weight, 0));
            const strength = antidoteClamp01(antidoteNum(t.strength, 0));
            const match = strength * weight;
            if (match > best.match) best = { match: match, themeId: t.id, family: family };
        });
        // Categories «de resultat» (rematar, mantenir, no perdre el fil): no són
        // situacions del tauler sinó posicions vives, i es mesuren per complexitat.
        const complexity = antidoteClamp01(antidoteNum(cand.complexity, 0));
        ANTIDOTE_COMPLEXITY_FAMILIES.forEach(family => {
            const record = weaknesses[family];
            const weight = antidoteClamp01(antidoteNum(record && record.weight, 0));
            const match = complexity * weight;
            if (match > best.match) {
                best = { match: match, themeId: (cand.themes && cand.themes[0] && cand.themes[0].id) || 'quiet_improvement', family: family };
            }
        });
        return best;
    }

    // Varietat: penalitza repetir una categoria treballada fa poc, tret que
    // s'hi continuï fallant clarament.
    function antidoteRepetitionPenalty(family, profile, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        if (!family) return 0;
        const recent = (profile && Array.isArray(profile.recentTests)) ? profile.recentTests : [];
        if (!recent.length) return 0;
        const window = recent.slice(-cfg.recentWindow);
        const sameFamily = window.filter(t => antidoteThemeFamily(t.theme) === family);
        if (!sameFamily.length) return 0;
        const stillFailing = sameFamily.some(t => t.result === 'failed');
        const share = sameFamily.length / window.length;
        return stillFailing ? share * 0.25 : share;
    }

    // Puntuació final d'una candidata. Documentada i centralitzada: la qualitat
    // objectiva pesa prou perquè cap coincidència pedagògica no compensi una
    // jugada dolenta.
    function scoreAntidoteCandidate(candidate, profile, context, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const ctx = context || {};
        const cand = candidate || {};
        const guard = cand.guard || antidoteCandidateGuard(cand, ctx, cfg);
        if (!guard.allowed) {
            return {
                move: cand.move || null,
                allowed: false,
                reason: guard.reason,
                cpLoss: guard.cpLoss,
                finalScore: -Infinity,
                components: null
            };
        }
        const weaknessMatch = antidoteWeaknessMatch(cand, profile, cfg);
        const phase = ctx.phase || 'middlegame';
        const phaseMatch = antidoteClamp01(antidoteNum(profile && profile.phaseWeaknesses && profile.phaseWeaknesses[phase], 0));
        const target = antidoteTargetComplexity(ctx.playerElo);
        const complexity = antidoteClamp01(antidoteNum(cand.complexity, 0));
        const difficultyFit = antidoteClamp01(1 - Math.abs(complexity - target));
        const repetition = antidoteRepetitionPenalty(weaknessMatch.family, profile, cfg);
        const novelty = antidoteClamp01(antidoteNum(cand.novelty, 1 - repetition));
        const s = cfg.score;
        const components = {
            objectiveSafety: guard.objectiveSafety,
            weaknessMatch: weaknessMatch.match,
            phaseMatch: phaseMatch,
            difficultyFit: difficultyFit,
            novelty: novelty,
            repetitionPenalty: repetition
        };
        const finalScore =
            components.objectiveSafety * s.safety
            + components.weaknessMatch * s.weakness
            + components.phaseMatch * s.phase
            + components.difficultyFit * s.difficulty
            + components.novelty * s.novelty
            - components.repetitionPenalty * s.repetition;
        return {
            move: cand.move || null,
            san: cand.san || null,
            allowed: true,
            reason: null,
            cpLoss: guard.cpLoss,
            themeId: weaknessMatch.themeId,
            family: weaknessMatch.family,
            themeStrength: antidoteThemeStrength(cand, weaknessMatch.themeId),
            finalScore: Math.round(finalScore * 1000) / 1000,
            components: components
        };
    }

    function antidoteThemeStrength(candidate, themeId) {
        const themes = (candidate && Array.isArray(candidate.themes)) ? candidate.themes : [];
        const found = themes.find(t => t && t.id === themeId);
        return found ? antidoteClamp01(antidoteNum(found.strength, 0)) : 0;
    }

    // Tria ponderada determinista amb `rng` injectable (per defecte Math.random).
    function antidotePickWeighted(items, weightOf, rng) {
        if (!items || !items.length) return null;
        const weights = items.map((it, idx) => Math.max(0.0001, antidoteNum(weightOf(it, idx), 0)));
        const total = weights.reduce((a, b) => a + b, 0);
        const roll = (typeof rng === 'function' ? rng() : Math.random()) * total;
        let acc = 0;
        for (let i = 0; i < items.length; i++) {
            acc += weights[i];
            if (roll < acc) return items[i];
        }
        return items[items.length - 1];
    }

    // Selecció final. `candidates[0]` ha de ser la millor jugada del motor
    // (multipv 1). Retorna sempre una jugada jugable: si cap candidata
    // pedagògica supera els filtres, la millor del motor.
    function chooseAntidoteCandidate(candidates, profile, context, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const ctx = context || {};
        const list = (Array.isArray(candidates) ? candidates : []).filter(c => c && c.move);
        if (!list.length) return null;
        const best = list[0];
        const bestValue = typeof ctx.bestValue === 'number' ? ctx.bestValue : antidoteScoreValue(best);
        const baseCtx = Object.assign({}, ctx, { best: best, bestValue: bestValue });
        const fallback = {
            move: best.move,
            san: best.san || null,
            source: 'engine_best',
            test: null,
            cpLoss: 0,
            themeId: null,
            family: null,
            finalScore: null,
            components: null
        };
        if (bestValue === null) return fallback;

        const scored = list
            .map(c => ({ candidate: c, score: scoreAntidoteCandidate(c, profile, baseCtx, cfg) }))
            .filter(item => item.score.allowed);
        if (!scored.length) return fallback;

        // TOTES les candidates que passen els filtres competeixen amb la mateixa
        // fórmula, la millor jugada del motor inclosa: així una coincidència
        // pedagògica només guanya si la jugada també és objectivament bona.
        const maxScore = scored.reduce((m, item) => Math.max(m, item.score.finalScore), -Infinity);
        const tied = scored.filter(item => (maxScore - item.score.finalScore) <= cfg.tieBandScore);
        const chosen = tied.length > 1
            ? antidotePickWeighted(tied, item => (item.score.finalScore - maxScore) + cfg.tieBandScore + 1, ctx.rng)
            : tied[0];
        if (!chosen) return fallback;

        const isBest = chosen.candidate.move === best.move;
        // Només hi ha PROVA si la jugada escollida posa a prova de debò alguna
        // debilitat real: si no, és una jugada forta i prou (no s'avalua res).
        const hasTest = !!(chosen.score.themeId
            && chosen.score.themeStrength >= cfg.response.minThemeStrength
            && chosen.score.components.weaknessMatch > 0);
        return {
            move: chosen.candidate.move,
            san: chosen.candidate.san || null,
            source: hasTest ? 'antidote' : (isBest ? 'engine_best' : 'engine_alternative'),
            cpLoss: chosen.score.cpLoss,
            themeId: hasTest ? chosen.score.themeId : null,
            family: hasTest ? chosen.score.family : null,
            themeStrength: chosen.score.themeStrength,
            finalScore: chosen.score.finalScore,
            components: chosen.score.components,
            pv: Array.isArray(chosen.candidate.pv) ? chosen.candidate.pv : [],
            test: hasTest
        };
    }

    // ----------------------------------------------------------------------
    //  Proves pedagògiques
    // ----------------------------------------------------------------------

    // Crea la prova interna associada a una jugada escollida per raó pedagògica.
    // Retorna null si la selecció no en generava cap (llavors no hi ha res a
    // avaluar i la partida segueix igual).
    function antidoteCreateTest(selection, context, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const sel = selection || {};
        const ctx = context || {};
        if (!sel.test || !sel.themeId) return null;
        return {
            id: String(ctx.id || ('at_' + (ctx.ply || 0) + '_' + (sel.move || ''))),
            theme: sel.family || antidoteThemeFamily(sel.themeId),
            subtheme: sel.themeId,
            sourceFen: ctx.fen || null,
            engineMove: sel.move || null,
            engineMoveSan: sel.san || null,
            expectedPv: (Array.isArray(sel.pv) ? sel.pv : []).slice(0, cfg.storedPvPlies),
            createdAtPly: antidoteNum(ctx.ply, 0),
            moveNumber: antidoteNum(ctx.moveNumber, 0) || null,
            phase: ctx.phase || null,
            playerResponse: null,
            playerResponseSan: null,
            bestResponse: null,
            bestResponseSan: null,
            responseCpLoss: null,
            result: 'pending',
            severity: antidoteClamp01(antidoteNum(sel.themeStrength, 0.5)),
            at: antidoteNum(ctx.now, Date.now()) || Date.now()
        };
    }

    // Avalua com ha respost el jugador a una prova. Mai marca «failed» una
    // situació ambigua: en aquest cas és `inconclusive`.
    function evaluateAntidoteResponse(test, response, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const t = test || {};
        const r = response || {};
        const out = Object.assign({}, t);
        out.playerResponse = r.playerMove || null;
        out.playerResponseSan = r.playerMoveSan || null;
        out.bestResponse = r.bestMove || null;
        out.bestResponseSan = r.bestMoveSan || null;

        const cpLoss = (typeof r.cpLoss === 'number' && isFinite(r.cpLoss)) ? Math.max(0, r.cpLoss) : null;
        out.responseCpLoss = cpLoss;

        // Sense tema prou clar: la candidata no ha generat una prova de veritat.
        if (!t.theme || antidoteNum(t.severity, 0) < cfg.response.minThemeStrength) {
            out.result = 'inconclusive';
            return out;
        }
        // Sense dades d'anàlisi: no es jutja.
        if (cpLoss === null) {
            out.result = 'inconclusive';
            return out;
        }
        // Posició ja decidida abans de respondre: el que passi allà no mesura res.
        const evalBefore = (typeof r.evalBefore === 'number') ? r.evalBefore : null;
        if (evalBefore !== null && Math.abs(evalBefore) >= cfg.response.decidedCp && cpLoss > cfg.response.passCpLoss) {
            out.result = 'inconclusive';
            return out;
        }
        if (r.playerMove && r.bestMove && r.playerMove === r.bestMove) {
            out.result = 'passed';
            return out;
        }
        if (cpLoss <= cfg.response.passCpLoss) { out.result = 'passed'; return out; }
        if (cpLoss <= cfg.response.partialCpLoss) { out.result = 'partial'; return out; }
        out.result = 'failed';
        return out;
    }

    // Resum d'una partida ANTÍDOT.
    function antidoteGameSummary(tests) {
        const list = Array.isArray(tests) ? tests : [];
        const summary = { total: 0, passed: 0, partial: 0, failed: 0, inconclusive: 0, themes: {} };
        list.forEach(t => {
            if (!t || !t.theme) return;
            summary.total += 1;
            const result = t.result === 'passed' || t.result === 'partial' || t.result === 'failed'
                ? t.result : 'inconclusive';
            summary[result] += 1;
            const acc = summary.themes[t.theme] || { total: 0, passed: 0, partial: 0, failed: 0, inconclusive: 0 };
            acc.total += 1;
            acc[result] += 1;
            summary.themes[t.theme] = acc;
        });
        summary.successRate = summary.total
            ? Math.round(((summary.passed + summary.partial * 0.5) / summary.total) * 100)
            : null;
        return summary;
    }

    // Actualitza el progrés per tema sense duplicar registres: cada prova es
    // comptabilitza una sola vegada (per `id`).
    function updateAntidoteProgress(progress, tests) {
        const base = (progress && typeof progress === 'object') ? progress : {};
        const out = {
            version: ANTIDOTE_CONFIG.version,
            themes: Object.assign({}, base.themes || {}),
            seenTestIds: Array.isArray(base.seenTestIds) ? base.seenTestIds.slice() : [],
            games: Math.max(0, antidoteNum(base.games, 0)),
            passed: Math.max(0, antidoteNum(base.passed, 0)),
            partial: Math.max(0, antidoteNum(base.partial, 0)),
            failed: Math.max(0, antidoteNum(base.failed, 0)),
            total: Math.max(0, antidoteNum(base.total, 0))
        };
        const seen = new Set(out.seenTestIds.map(String));
        (Array.isArray(tests) ? tests : []).forEach(t => {
            if (!t || !t.theme || !t.id) return;
            const key = String(t.id);
            if (seen.has(key)) return;
            const result = (t.result === 'passed' || t.result === 'partial' || t.result === 'failed')
                ? t.result : null;
            if (!result) return;                 // les inconclusives no compten
            seen.add(key);
            out.seenTestIds.push(key);
            const acc = out.themes[t.theme] || { total: 0, passed: 0, partial: 0, failed: 0 };
            acc.total += 1;
            acc[result] += 1;
            out.themes[t.theme] = acc;
            out.total += 1;
            out[result] += 1;
        });
        // La llista d'identificadors vistos no pot créixer sense límit.
        if (out.seenTestIds.length > 400) out.seenTestIds = out.seenTestIds.slice(-400);
        return out;
    }

    // Evolució entre el perfil d'abans i el d'ara, en català natural i sense
    // presentar les debilitats com un defecte: són habilitats en procés.
    function antidoteEvolutionReport(profileBefore, profileAfter, tests) {
        const summary = antidoteGameSummary(tests);
        const before = (profileBefore && profileBefore.weaknesses) || {};
        const after = (profileAfter && profileAfter.weaknesses) || {};
        const improved = [];
        const active = [];
        ANTIDOTE_WEAKNESS_IDS.forEach(id => {
            const b = antidoteNum(before[id] && before[id].weight, 0);
            const a = antidoteNum(after[id] && after[id].weight, 0);
            const themeResults = summary.themes[id];
            if (!themeResults && b <= 0) return;
            const entry = {
                id: id,
                label: antidoteWeaknessLabel(id),
                weightBefore: b,
                weightAfter: a,
                delta: Math.round((a - b) * 1000) / 1000,
                confidence: antidoteClamp01(antidoteNum(after[id] && after[id].confidence, 0)),
                passed: themeResults ? themeResults.passed : 0,
                failed: themeResults ? themeResults.failed : 0
            };
            if (a < b - 0.005 || (themeResults && themeResults.passed > themeResults.failed)) improved.push(entry);
            else if (a > 0) active.push(entry);
        });
        improved.sort((x, y) => x.delta - y.delta);
        active.sort((x, y) => y.weightAfter - x.weightAfter);
        const next = active.length ? active[0] : (improved.length ? improved[0] : null);
        return {
            summary: summary,
            improved: improved,
            active: active,
            nextTheme: next ? next.id : null,
            nextLabel: next ? next.label : null,
            text: antidoteEvolutionText(improved, active, next)
        };
    }

    function antidoteEvolutionText(improved, active, next) {
        const parts = [];
        if (improved.length) {
            parts.push(`Has respost bé quan la partida t'ha posat a prova en ${improved[0].label.toLowerCase()}`);
        }
        if (active.length) {
            const tail = `encara et costa ${active[0].label.toLowerCase()}`;
            parts.push(parts.length ? tail : `De moment, ${tail}`);
        }
        if (!parts.length) return 'Encara no hi ha prou proves per dir com evoluciona el teu joc. Torna-hi i el perfil s\'anirà afinant.';
        let text = parts.join(', però ') + '.';
        if (next) {
            text += ` El pròxim Rival Antídot insistirà més en ${next.label.toLowerCase()}.`;
        }
        return text;
    }

    // ----------------------------------------------------------------------
    //  Textos de l'entrenador en viu
    // ----------------------------------------------------------------------
    // REGLA QUE MANA EN AQUEST BLOC: abans que el jugador decideixi no es pot
    // dir mai QUÈ s'està examinant. Hi ha dues habilitats en joc i no són la
    // mateixa: DETECTAR que la posició amaga una clavada (la part difícil, la
    // que falla a les partides de veritat, on ningú no t'avisa) i RESOLDRE-LA
    // un cop saps que hi és. Anunciar el tema entrena només la segona.
    //
    // I hi ha un efecte de segon ordre pitjor: el resultat de la prova
    // alimenta el perfil (antidoteApplyTestFeedback). Mesurar respostes amb
    // pista faria baixar el pes d'una debilitat que a les partides sense avís
    // continua fallant, i el perfil es tornaria sistemàticament optimista —
    // exactament el contrari del que serveix.
    //
    // Per això la consigna prèvia és CONSTANT: idèntica cada torn, hi hagi
    // prova o no. Així entrena l'hàbit d'escanejar sense delatar ni què hi ha
    // ni quins torns compten. Tot el que és específic es diu DESPRÉS de moure,
    // que és quan ensenya.

    const ANTIDOTE_SCAN_STEPS = 'Escacs · captures · amenaces · peces desprotegides';

    // Consigna del torn del jugador. No rep cap argument A PROPÒSIT: si depengués
    // de la posició o de la prova, ja seria una pista.
    function antidoteTurnPrompt() {
        return {
            kind: 'scan',
            title: '🧬 El teu torn',
            text: 'Abans de decidir, mira la posició sencera: què ha canviat amb l’última jugada i què prepara el rival.',
            guide: ANTIDOTE_SCAN_STEPS
        };
    }

    // Missatge mentre el motor pensa. Tampoc no diu res de la posició.
    function antidoteThinkingPrompt() {
        return {
            kind: 'thinking',
            title: '🧬 El rival tria la jugada',
            text: 'Stockfish compara diverses jugades fortes i es queda la que et farà treballar més.',
            guide: 'Sempre serà una jugada objectivament bona: el que canvia és el valor d’entrenament.'
        };
    }

    // Pauta d'observació per categoria. Es fa servir DESPRÉS de respondre, com
    // a «llista que t'hauria fet veure el problema».
    const ANTIDOTE_THEME_GUIDANCE = {
        missed_win: 'Busca primer escacs, captures i amenaces; pot haver-hi una continuació que decideixi la partida.',
        lost_advantage: 'Abans de simplificar o accelerar, comprova què manté la iniciativa i quines peces necessiten millorar.',
        turned_losing: 'Atura’t i revisa amenaces immediates, peces sense cobertura i canvis irreversibles.',
        missed_tactic: 'Fes l’escaneig tàctic: escacs, captures, amenaces, peces clavades i dobles atacs.',
        lost_material: 'Comprova totes les peces atacades i cobertes, especialment les que només tenen un defensor.',
        king_safety: 'Mira línies obertes, peces que apunten al rei, caselles d’escapada i possibles canvis de dames.',
        endgame_turning_point: 'Valora activitat del rei, peons passats, oposició i si el canvi de peces t’afavoreix.',
        strategic_error: 'Pregunta’t quina és la teva pitjor peça, quin pla prepara el rival i quina jugada millora la posició.'
    };

    function antidoteGuidanceForTheme(theme) {
        return ANTIDOTE_THEME_GUIDANCE[theme]
            || 'Mira què ha canviat amb l’última jugada, què amenaça el rival i quines respostes candidates tens.';
    }

    // Explicació DESPRÉS de la resposta: aquí sí que es diu el tema, la millor
    // jugada i la pauta, perquè la decisió ja s'ha pres i és quan s'aprèn.
    function antidoteResultFeedback(test) {
        const t = test || {};
        const themeLabel = antidoteWeaknessLabel(t.theme);
        const subtheme = t.subtheme ? antidoteThemeLabel(t.subtheme) : '';
        const focus = (subtheme && subtheme !== themeLabel) ? themeLabel + ' · ' + subtheme : themeLabel;
        const best = t.bestResponseSan || t.bestResponse || null;
        const loss = (typeof t.responseCpLoss === 'number' && isFinite(t.responseCpLoss))
            ? Math.round(t.responseCpLoss) : null;
        const lesson = 'La propera vegada: ' + antidoteGuidanceForTheme(t.theme);

        if (t.result === 'passed') {
            return {
                kind: 'success',
                title: '✅ Prova superada · ' + focus,
                text: 'Has vist el problema tu sol i la teva resposta ha mantingut la posició sota control'
                    + ((loss !== null && loss > 0) ? ' (només ' + loss + ' centpeons cedits).' : '.'),
                guide: lesson,
                toast: 'Prova superada',
                toastKind: 'success'
            };
        }
        if (t.result === 'partial') {
            return {
                kind: 'partial',
                title: '🟡 Prova parcial · ' + focus,
                text: 'Has vist una part del problema, però hi havia una resposta més precisa'
                    + (best ? ': ' + best + '.' : '.'),
                guide: lesson,
                toast: 'Ho has defensat parcialment',
                toastKind: 'info'
            };
        }
        if (t.result === 'failed') {
            return {
                kind: 'failed',
                title: '🔴 Patró repetit · ' + focus,
                text: 'Aquesta era la situació que el rival buscava, i ha tornat a passar'
                    + (best ? '. La resposta era ' + best + '.' : '.')
                    + ' La posició queda disponible al repàs de les teves fallades.',
                guide: lesson,
                toast: 'Aquest patró tornarà al teu entrenament',
                toastKind: 'warn'
            };
        }
        return {
            kind: 'info',
            title: '🧬 Sense conclusió · ' + focus,
            text: 'Aquí no es pot mesurar amb prou seguretat si el patró s’ha resolt.',
            guide: 'No compta ni com a encert ni com a fallada.',
            toast: null,
            toastKind: 'info'
        };
    }

    // ----------------------------------------------------------------------
    //  Persistència
    // ----------------------------------------------------------------------

    // Forma COMPACTA d'una prova per desar a l'historial: sense línies de motor
    // llargues (només les semijugades necessàries per reconstruir-la).
    function antidoteSerializeTest(test, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        if (!test || !test.theme) return null;
        return {
            id: String(test.id || ''),
            theme: test.theme,
            subtheme: test.subtheme || null,
            sourceFen: test.sourceFen || null,
            engineMove: test.engineMove || null,
            engineMoveSan: test.engineMoveSan || null,
            expectedPv: (Array.isArray(test.expectedPv) ? test.expectedPv : []).slice(0, cfg.storedPvPlies),
            createdAtPly: antidoteNum(test.createdAtPly, 0),
            moveNumber: test.moveNumber || null,
            phase: test.phase || null,
            playerResponse: test.playerResponse || null,
            playerResponseSan: test.playerResponseSan || null,
            bestResponse: test.bestResponse || null,
            bestResponseSan: test.bestResponseSan || null,
            responseCpLoss: (typeof test.responseCpLoss === 'number') ? Math.round(test.responseCpLoss) : null,
            result: test.result || 'inconclusive',
            // Resultat del PRIMER intent i marca de repetició: el resum ensenya
            // com ha acabat, però el perfil es queda amb com va començar.
            firstResult: test.firstResult || null,
            retried: !!test.retried,
            severity: Math.round(antidoteClamp01(antidoteNum(test.severity, 0)) * 100) / 100
        };
    }

    // Bloc `antidote` d'una entrada de l'historial.
    function antidoteSerializeGame(tests, extra, config) {
        const cfg = config || ANTIDOTE_CONFIG;
        const list = (Array.isArray(tests) ? tests : [])
            .map(t => antidoteSerializeTest(t, cfg))
            .filter(Boolean)
            .slice(0, cfg.maxStoredTests);
        const summary = antidoteGameSummary(list);
        const targeted = [];
        list.forEach(t => { if (t.theme && targeted.indexOf(t.theme) === -1) targeted.push(t.theme); });
        return Object.assign({
            profileVersion: cfg.version,
            tests: list,
            targetedThemes: targeted,
            passed: summary.passed,
            partial: summary.partial,
            failed: summary.failed
        }, extra || {});
    }

    // Llegeix el bloc `antidote` d'una entrada, tolerant amb dades antigues
    // (partides sense el camp) i amb dades corruptes.
    function antidoteRestoreGame(entry) {
        const raw = entry && entry.antidote;
        if (!raw || typeof raw !== 'object') return null;
        const tests = Array.isArray(raw.tests) ? raw.tests.filter(t => t && typeof t === 'object' && t.theme) : [];
        const summary = antidoteGameSummary(tests);
        return {
            profileVersion: antidoteNum(raw.profileVersion, 1),
            tests: tests,
            targetedThemes: Array.isArray(raw.targetedThemes) ? raw.targetedThemes.filter(t => typeof t === 'string') : [],
            passed: antidoteNum(raw.passed, summary.passed),
            partial: antidoteNum(raw.partial, summary.partial),
            failed: antidoteNum(raw.failed, summary.failed),
            summary: summary
        };
    }

    // Totes les proves de l'historial (per reconstruir el perfil i les
    // estadístiques). Les partides antigues sense `antidote` s'ignoren sense
    // trencar res.
    function antidoteTestsFromHistory(entries) {
        const out = [];
        (Array.isArray(entries) ? entries : []).forEach(entry => {
            const data = antidoteRestoreGame(entry);
            if (!data) return;
            const at = Date.parse(entry.date || entry.createdAt || '') || null;
            data.tests.forEach(t => {
                out.push(Object.assign({}, t, { at: at, gameId: entry.id || null }));
            });
        });
        return out;
    }

    // Estadístiques ANTÍDOT per a la pantalla d'Estadístiques.
    function antidoteStatsFromHistory(entries) {
        const games = (Array.isArray(entries) ? entries : []).filter(e => e && e.mode === 'antidote');
        const tests = antidoteTestsFromHistory(games);
        const summary = antidoteGameSummary(tests);
        const themes = Object.keys(summary.themes).map(id => {
            const t = summary.themes[id];
            const rate = t.total ? (t.passed + t.partial * 0.5) / t.total : 0;
            return {
                id: id,
                label: antidoteWeaknessLabel(id),
                total: t.total,
                passed: t.passed,
                partial: t.partial,
                failed: t.failed,
                successRate: Math.round(rate * 100)
            };
        }).sort((a, b) => b.total - a.total);
        const mostWorked = themes.length ? themes[0] : null;
        const mostImproved = themes.length
            ? themes.slice().sort((a, b) => (b.successRate - a.successRate) || (b.total - a.total))[0]
            : null;
        return {
            games: games.length,
            tests: summary.total,
            passed: summary.passed,
            partial: summary.partial,
            failed: summary.failed,
            successRate: summary.successRate,
            themes: themes,
            mostWorked: mostWorked,
            mostImproved: (mostImproved && mostImproved.total > 0) ? mostImproved : null
        };
    }

    // ----------------------------------------------------------------------
    //  Detectors: què posa a prova cada candidata
    // ----------------------------------------------------------------------
    // Model de tauler propi (matriu 8×8 des del FEN) per als atacs i les
    // defenses: chess.js 0.10 no exposa «qui ataca aquesta casella», i fer-ho
    // amb generació de jugades no veu les defenses de peces pròpies. La lògica
    // de jugades legals (i la línia principal) segueix sent de chess.js.

    const ANTIDOTE_PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    const ANTIDOTE_KNIGHT_DELTAS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
    const ANTIDOTE_KING_DELTAS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
    const ANTIDOTE_ROOK_DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    const ANTIDOTE_BISHOP_DIRS = [[1, 1], [1, -1], [-1, -1], [-1, 1]];

    function antidoteSquareName(file, rank) {
        return String.fromCharCode(97 + file) + String(rank + 1);
    }

    function antidoteSquareIndex(square) {
        const s = String(square || '');
        if (s.length < 2) return null;
        const file = s.charCodeAt(0) - 97;
        const rank = parseInt(s[1], 10) - 1;
        if (file < 0 || file > 7 || !(rank >= 0 && rank <= 7)) return null;
        return { file: file, rank: rank };
    }

    // FEN → { grid[rank][file] = {t,c}|null, turn, castling, ep, pieces }
    function antidoteParseBoard(fen) {
        const parts = String(fen || '').trim().split(/\s+/);
        const grid = [];
        for (let r = 0; r < 8; r++) grid.push([null, null, null, null, null, null, null, null]);
        const rows = String(parts[0] || '').split('/');
        let pieces = 0;
        for (let i = 0; i < rows.length && i < 8; i++) {
            const rank = 7 - i;
            let file = 0;
            const row = rows[i];
            for (let j = 0; j < row.length && file < 8; j++) {
                const ch = row[j];
                if (ch >= '1' && ch <= '8') { file += (ch.charCodeAt(0) - 48); continue; }
                const lower = ch.toLowerCase();
                if (!ANTIDOTE_PIECE_VALUE[lower]) { file++; continue; }
                grid[rank][file] = { t: lower, c: (ch === ch.toUpperCase() ? 'w' : 'b') };
                pieces++;
                file++;
            }
        }
        return {
            grid: grid,
            turn: parts[1] === 'b' ? 'b' : 'w',
            castling: parts[2] || '-',
            ep: parts[3] || '-',
            fullmove: parseInt(parts[5] || '1', 10) || 1,
            pieces: pieces
        };
    }

    function antidoteAt(grid, file, rank) {
        if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
        return grid[rank][file];
    }

    // Peces de `color` que ataquen la casella (file, rank). Compta també la
    // defensa de peces pròpies (per això no serveix la generació de jugades).
    function antidoteAttackersOf(grid, file, rank, color) {
        const out = [];
        // Peons
        const dir = color === 'w' ? -1 : 1;   // d'on ve el peó que hi ataca
        [-1, 1].forEach(df => {
            const p = antidoteAt(grid, file + df, rank + dir);
            if (p && p.c === color && p.t === 'p') out.push({ file: file + df, rank: rank + dir, t: 'p' });
        });
        // Cavalls
        ANTIDOTE_KNIGHT_DELTAS.forEach(d => {
            const p = antidoteAt(grid, file + d[0], rank + d[1]);
            if (p && p.c === color && p.t === 'n') out.push({ file: file + d[0], rank: rank + d[1], t: 'n' });
        });
        // Rei
        ANTIDOTE_KING_DELTAS.forEach(d => {
            const p = antidoteAt(grid, file + d[0], rank + d[1]);
            if (p && p.c === color && p.t === 'k') out.push({ file: file + d[0], rank: rank + d[1], t: 'k' });
        });
        // Lliscants
        const scan = (dirs, types) => {
            dirs.forEach(d => {
                let f = file + d[0];
                let r = rank + d[1];
                while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
                    const p = grid[r][f];
                    if (p) {
                        if (p.c === color && types.indexOf(p.t) !== -1) out.push({ file: f, rank: r, t: p.t });
                        break;
                    }
                    f += d[0];
                    r += d[1];
                }
            });
        };
        scan(ANTIDOTE_ROOK_DIRS, ['r', 'q']);
        scan(ANTIDOTE_BISHOP_DIRS, ['b', 'q']);
        return out;
    }

    function antidoteIsAttacked(grid, file, rank, color) {
        return antidoteAttackersOf(grid, file, rank, color).length > 0;
    }

    // Caselles que ataca la peça de (file, rank), segons el seu tipus.
    function antidoteTargetsOf(grid, file, rank) {
        const piece = antidoteAt(grid, file, rank);
        if (!piece) return [];
        const out = [];
        const push = (f, r) => { if (f >= 0 && f <= 7 && r >= 0 && r <= 7) out.push({ file: f, rank: r }); };
        if (piece.t === 'p') {
            const dir = piece.c === 'w' ? 1 : -1;
            push(file - 1, rank + dir);
            push(file + 1, rank + dir);
            return out;
        }
        if (piece.t === 'n') { ANTIDOTE_KNIGHT_DELTAS.forEach(d => push(file + d[0], rank + d[1])); return out; }
        if (piece.t === 'k') { ANTIDOTE_KING_DELTAS.forEach(d => push(file + d[0], rank + d[1])); return out; }
        const dirs = piece.t === 'r' ? ANTIDOTE_ROOK_DIRS
            : (piece.t === 'b' ? ANTIDOTE_BISHOP_DIRS : ANTIDOTE_ROOK_DIRS.concat(ANTIDOTE_BISHOP_DIRS));
        dirs.forEach(d => {
            let f = file + d[0];
            let r = rank + d[1];
            while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
                out.push({ file: f, rank: r });
                if (grid[r][f]) break;
                f += d[0];
                r += d[1];
            }
        });
        return out;
    }

    function antidoteFindKing(grid, color) {
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = grid[r][f];
                if (p && p.c === color && p.t === 'k') return { file: f, rank: r };
            }
        }
        return null;
    }

    function antidoteCountPieces(grid, color, types) {
        let n = 0;
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = grid[r][f];
                if (!p) continue;
                if (color && p.c !== color) continue;
                if (types && types.indexOf(p.t) === -1) continue;
                n++;
            }
        }
        return n;
    }

    // Parells «lliscant nostre → peça enemiga atacada», per detectar descoberts.
    function antidoteSliderAttackPairs(grid, color) {
        const pairs = new Set();
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = grid[r][f];
                if (!p || p.c !== color || ['b', 'r', 'q'].indexOf(p.t) === -1) continue;
                antidoteTargetsOf(grid, f, r).forEach(t => {
                    const target = grid[t.rank][t.file];
                    if (target && target.c !== color) {
                        pairs.add(antidoteSquareName(f, r) + '>' + antidoteSquareName(t.file, t.rank));
                    }
                });
            }
        }
        return pairs;
    }

    // Clavades i enfilades de `color` sobre l'enemic. Cada element:
    // { kind: 'pin'|'skewer', from, front, back }.
    function antidotePinsAndSkewers(grid, color) {
        const out = [];
        const enemy = color === 'w' ? 'b' : 'w';
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = grid[r][f];
                if (!p || p.c !== color || ['b', 'r', 'q'].indexOf(p.t) === -1) continue;
                const dirs = p.t === 'r' ? ANTIDOTE_ROOK_DIRS
                    : (p.t === 'b' ? ANTIDOTE_BISHOP_DIRS : ANTIDOTE_ROOK_DIRS.concat(ANTIDOTE_BISHOP_DIRS));
                dirs.forEach(d => {
                    let cf = f + d[0];
                    let cr = r + d[1];
                    let front = null;
                    while (cf >= 0 && cf <= 7 && cr >= 0 && cr <= 7) {
                        const q = grid[cr][cf];
                        if (q) {
                            if (!front) {
                                if (q.c !== enemy) break;         // topem amb una peça pròpia
                                front = { file: cf, rank: cr, t: q.t };
                            } else {
                                if (q.c !== enemy) break;         // darrere hi ha una peça nostra
                                const vFront = ANTIDOTE_PIECE_VALUE[front.t] || 0;
                                const vBack = ANTIDOTE_PIECE_VALUE[q.t] || 0;
                                if (vBack >= vFront) {
                                    out.push({
                                        kind: 'pin', from: antidoteSquareName(f, r),
                                        front: antidoteSquareName(front.file, front.rank),
                                        back: antidoteSquareName(cf, cr),
                                        value: vBack
                                    });
                                } else if (vFront > vBack && vFront >= 5) {
                                    out.push({
                                        kind: 'skewer', from: antidoteSquareName(f, r),
                                        front: antidoteSquareName(front.file, front.rank),
                                        back: antidoteSquareName(cf, cr),
                                        value: vFront
                                    });
                                }
                                break;
                            }
                        }
                        cf += d[0];
                        cr += d[1];
                    }
                });
            }
        }
        return out;
    }

    // Peces de `victimColor` atacades i no prou defensades.
    function antidoteHangingPieces(grid, victimColor) {
        const attacker = victimColor === 'w' ? 'b' : 'w';
        const out = [];
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = grid[r][f];
                if (!p || p.c !== victimColor || p.t === 'k') continue;
                const attackers = antidoteAttackersOf(grid, f, r, attacker);
                if (!attackers.length) continue;
                const defenders = antidoteAttackersOf(grid, f, r, victimColor);
                const value = ANTIDOTE_PIECE_VALUE[p.t] || 0;
                const cheapest = attackers.reduce((min, a) =>
                    Math.min(min, ANTIDOTE_PIECE_VALUE[a.t] || 0), 99);
                // Indefensa, o atacada per una peça més barata que ella.
                if (!defenders.length || cheapest < value) {
                    out.push({ square: antidoteSquareName(f, r), type: p.t, value: value, defended: defenders.length > 0 });
                }
            }
        }
        return out;
    }

    // Peons passats d'un color.
    function antidotePassedPawns(grid, color) {
        const enemy = color === 'w' ? 'b' : 'w';
        const dir = color === 'w' ? 1 : -1;
        const out = [];
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = grid[r][f];
                if (!p || p.c !== color || p.t !== 'p') continue;
                let blocked = false;
                for (let df = -1; df <= 1 && !blocked; df++) {
                    const nf = f + df;
                    if (nf < 0 || nf > 7) continue;
                    for (let nr = r + dir; nr >= 0 && nr <= 7; nr += dir) {
                        const q = grid[nr][nf];
                        if (q && q.c === enemy && q.t === 'p') { blocked = true; break; }
                    }
                }
                if (!blocked) out.push({ square: antidoteSquareName(f, r), rank: r });
            }
        }
        return out;
    }

    // Peons aïllats d'un color.
    function antidoteIsolatedPawns(grid, color) {
        const files = [0, 0, 0, 0, 0, 0, 0, 0];
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = grid[r][f];
                if (p && p.c === color && p.t === 'p') files[f]++;
            }
        }
        const out = [];
        for (let f = 0; f < 8; f++) {
            if (!files[f]) continue;
            const left = f > 0 ? files[f - 1] : 0;
            const right = f < 7 ? files[f + 1] : 0;
            if (!left && !right) out.push(f);
        }
        return out;
    }

    // Columnes sense cap peó (obertes) i sense peons propis (semiobertes).
    function antidoteFileState(grid, file) {
        let own = { w: 0, b: 0 };
        for (let r = 0; r < 8; r++) {
            const p = grid[r][file];
            if (p && p.t === 'p') own[p.c]++;
        }
        return own;
    }

    // Pressió sobre el rei enemic: atacants a la seva zona (rei + 8 veïnes).
    function antidoteKingZonePressure(grid, defenderColor) {
        const king = antidoteFindKing(grid, defenderColor);
        if (!king) return { attackers: 0, shieldPawns: 0, zone: [] };
        const attackerColor = defenderColor === 'w' ? 'b' : 'w';
        const zone = [{ file: king.file, rank: king.rank }];
        ANTIDOTE_KING_DELTAS.forEach(d => {
            const f = king.file + d[0];
            const r = king.rank + d[1];
            if (f >= 0 && f <= 7 && r >= 0 && r <= 7) zone.push({ file: f, rank: r });
        });
        const seen = new Set();
        zone.forEach(sq => {
            antidoteAttackersOf(grid, sq.file, sq.rank, attackerColor).forEach(a => {
                seen.add(antidoteSquareName(a.file, a.rank));
            });
        });
        // Coberta de peons: peons propis a les tres columnes del rei, davant seu.
        const dir = defenderColor === 'w' ? 1 : -1;
        let shieldPawns = 0;
        for (let df = -1; df <= 1; df++) {
            const f = king.file + df;
            if (f < 0 || f > 7) continue;
            for (let step = 1; step <= 2; step++) {
                const r = king.rank + dir * step;
                if (r < 0 || r > 7) break;
                const p = grid[r][f];
                if (p && p.c === defenderColor && p.t === 'p') { shieldPawns++; break; }
            }
        }
        return { attackers: seen.size, shieldPawns: shieldPawns, king: king, zone: zone };
    }

    // Detectors que necessiten jugar la línia: es construeixen amb chess.js.
    function createAntidoteDetectors(ChessCtor, config) {
        const cfg = config || ANTIDOTE_CONFIG;

        function safeChess(fen) {
            try { return fen ? new ChessCtor(fen) : new ChessCtor(); } catch (e) { return null; }
        }

        function applyUci(chess, uci) {
            if (!chess || !uci || uci.length < 4) return null;
            try {
                return chess.move({
                    from: uci.substring(0, 2),
                    to: uci.substring(2, 4),
                    promotion: uci.length > 4 ? uci[4] : 'q'
                });
            } catch (e) { return null; }
        }

        function uciToSan(fen, uci) {
            const chess = safeChess(fen);
            const move = applyUci(chess, uci);
            return move ? move.san : null;
        }

        // Pèrdua de material immediata (SEE simplificat a una recaptura), en
        // peons. Serveix per no triar mai una jugada que penja material net.
        function immediateMaterialLoss(fen, uci) {
            const chess = safeChess(fen);
            if (!chess || !applyUci(chess, uci)) return 0;
            let worst = 0;
            let replies;
            try { replies = chess.moves({ verbose: true }); } catch (e) { return 0; }
            for (const r of replies) {
                if (!r.captured) continue;
                const gain = ANTIDOTE_PIECE_VALUE[r.captured] || 0;
                let recapture = 0;
                let opp = null;
                try { opp = chess.move({ from: r.from, to: r.to, promotion: 'q' }); } catch (e) { opp = null; }
                if (opp) {
                    let canRecapture = false;
                    try {
                        canRecapture = chess.moves({ verbose: true }).some(m => m.to === r.to && m.captured);
                    } catch (e) { canRecapture = false; }
                    if (canRecapture) recapture = ANTIDOTE_PIECE_VALUE[opp.piece] || 0;
                    try { chess.undo(); } catch (e) {}
                }
                const net = gain - recapture;
                if (net > worst) worst = net;
            }
            return worst;
        }

        // Complexitat de la posició que hereta el jugador: quantes decisions
        // reals té i com de tallant és la posició.
        function positionComplexity(fen) {
            const chess = safeChess(fen);
            if (!chess) return 0.5;
            let moves;
            try { moves = chess.moves({ verbose: true }); } catch (e) { return 0.5; }
            if (!moves.length) return 0;
            const board = antidoteParseBoard(fen);
            const captures = moves.filter(m => m.captured).length;
            const checks = moves.filter(m => m.san.indexOf('+') !== -1 || m.san.indexOf('#') !== -1).length;
            const inCheck = chess.in_check();
            const mobility = antidoteClamp01((moves.length - 8) / 30);
            const tension = antidoteClamp01(captures / 8);
            const sharpness = antidoteClamp01(checks / 4);
            const density = antidoteClamp01((board.pieces - 8) / 24);
            let complexity = mobility * 0.34 + tension * 0.24 + sharpness * 0.2 + density * 0.22;
            // En escac hi ha poques jugades però la decisió és crítica.
            if (inCheck) complexity = Math.max(complexity, 0.55);
            return antidoteClamp01(complexity);
        }

        // Classifica QUÈ posa a prova una candidata. Mira la posició resultant
        // i recorre unes quantes semijugades de la línia principal.
        function classifyAntidoteCandidate(fen, uci, pv, options) {
            const opts = options || {};
            const result = {
                move: uci || null,
                san: null,
                themes: [],
                complexity: 0,
                materialLoss: 0,
                afterFen: null
            };
            const chess = safeChess(fen);
            if (!chess) return result;
            const before = antidoteParseBoard(fen);
            const moverColor = before.turn;
            const opponentColor = moverColor === 'w' ? 'b' : 'w';
            const played = applyUci(chess, uci);
            if (!played) return result;
            result.san = played.san;
            const afterFen = chess.fen();
            result.afterFen = afterFen;
            const after = antidoteParseBoard(afterFen);

            const themes = [];
            const add = (id, strength, triggerPly) => {
                const s = antidoteClamp01(strength);
                if (s <= 0) return;
                const existing = themes.find(t => t.id === id);
                if (existing) {
                    if (s > existing.strength) { existing.strength = s; existing.triggerPly = triggerPly; }
                    return;
                }
                themes.push({ id: id, strength: s, triggerPly: triggerPly });
            };

            const to = antidoteSquareIndex(played.to);
            const isQuiet = !played.captured && played.san.indexOf('+') === -1;

            // ── Tàctica ────────────────────────────────────────────────────
            if (to) {
                const targets = antidoteTargetsOf(after.grid, to.file, to.rank);
                const forked = [];
                const movedValue = ANTIDOTE_PIECE_VALUE[played.piece] || 0;
                targets.forEach(t => {
                    const victim = after.grid[t.rank][t.file];
                    if (!victim || victim.c !== opponentColor) return;
                    const value = ANTIDOTE_PIECE_VALUE[victim.t] || 0;
                    if (victim.t === 'k' || value >= movedValue) forked.push({ value: value, type: victim.t });
                });
                if (forked.length >= 2) {
                    const attackedBack = antidoteIsAttacked(after.grid, to.file, to.rank, opponentColor);
                    const defended = antidoteIsAttacked(after.grid, to.file, to.rank, moverColor);
                    // Una «forquilla» amb la peça penjada no és una forquilla.
                    if (!attackedBack || defended) {
                        const total = forked.reduce((s, x) => s + Math.min(9, x.value), 0);
                        add('fork', 0.55 + antidoteClamp01(total / 20) * 0.4, 1);
                        add('double_attack', 0.5, 1);
                    }
                }
            }

            const pinsBefore = antidotePinsAndSkewers(before.grid, moverColor)
                .map(p => p.kind + ':' + p.from + '>' + p.front + '>' + p.back);
            antidotePinsAndSkewers(after.grid, moverColor).forEach(p => {
                const key = p.kind + ':' + p.from + '>' + p.front + '>' + p.back;
                if (pinsBefore.indexOf(key) !== -1) return;
                add(p.kind === 'pin' ? 'pin' : 'skewer', 0.5 + antidoteClamp01(p.value / 18) * 0.4, 1);
            });

            const pairsBefore = antidoteSliderAttackPairs(before.grid, moverColor);
            const pairsAfter = antidoteSliderAttackPairs(after.grid, moverColor);
            let discovered = false;
            pairsAfter.forEach(pair => {
                if (pairsBefore.has(pair)) return;
                if (pair.indexOf(played.to + '>') === 0) return;   // la mateixa peça que ha mogut
                discovered = true;
            });
            if (discovered) add('discovered_attack', 0.68, 1);

            const hanging = antidoteHangingPieces(after.grid, opponentColor)
                .filter(h => h.value >= 3 || !h.defended);
            if (hanging.length) {
                const worst = hanging.reduce((m, h) => Math.max(m, h.value), 0);
                add('hanging_piece', 0.42 + antidoteClamp01(worst / 12) * 0.45, 1);
                if (worst >= 3) add('material_win', 0.45 + antidoteClamp01(worst / 12) * 0.4, 1);
                if (hanging.length >= 2) add('overload', 0.5, 1);
            }

            // Defensor sobrecarregat: una peça enemiga que defensa dues coses.
            const overloaded = antidoteFindOverloaded(after.grid, opponentColor, moverColor);
            if (overloaded) { add('overload', 0.55, 1); add('deflection', 0.5, 1); }

            // ── Rei ────────────────────────────────────────────────────────
            const pressure = antidoteKingZonePressure(after.grid, opponentColor);
            if (pressure.attackers >= 2) {
                add('king_attack', 0.4 + antidoteClamp01(pressure.attackers / 5) * 0.5, 1);
            }
            const pressureBefore = antidoteKingZonePressure(before.grid, opponentColor);
            if (pressure.shieldPawns < pressureBefore.shieldPawns && pressure.attackers >= 1) {
                add('pawn_shield_loss', 0.55 + (pressureBefore.shieldPawns - pressure.shieldPawns) * 0.15, 1);
            }
            const opponentCastled = after.castling.indexOf(opponentColor === 'w' ? 'K' : 'k') === -1
                && after.castling.indexOf(opponentColor === 'w' ? 'Q' : 'q') === -1;
            if (pressure.king && after.pieces > 14) {
                const centralFile = pressure.king.file >= 2 && pressure.king.file <= 5;
                if (centralFile && opponentCastled) {
                    add('king_in_center', 0.5 + (pressure.attackers >= 1 ? 0.25 : 0), 1);
                } else if (centralFile && !opponentCastled && pressure.attackers >= 1) {
                    add('castling_lost', 0.45, 1);
                }
            }

            let replyCount = 0;
            let inCheck = false;
            try {
                replyCount = chess.moves().length;
                inCheck = chess.in_check();
            } catch (e) {}
            if (inCheck && replyCount > 0 && replyCount <= 2) add('only_defense', 0.75, 1);
            else if (replyCount > 0 && replyCount <= 4) add('only_defense', 0.5, 1);

            // ── Línia principal: finals, promocions, simplificació ─────────
            const line = (Array.isArray(pv) ? pv : []).slice(0, cfg.pvScanPlies);
            const walker = safeChess(afterFen);
            let mateInLine = false;
            let captures = 0;
            let queenGone = false;
            let promotionInLine = false;
            let kingMoves = 0;
            let ply = 1;
            const queensAtStart = antidoteCountPieces(before.grid, null, ['q']);
            if (walker) {
                for (let i = 0; i < line.length; i++) {
                    const mv = applyUci(walker, line[i]);
                    if (!mv) break;
                    ply++;
                    if (mv.captured) captures++;
                    if (mv.captured === 'q') queenGone = true;
                    if (mv.promotion) promotionInLine = true;
                    if (mv.piece === 'k' && !(mv.flags && (mv.flags.indexOf('k') !== -1 || mv.flags.indexOf('q') !== -1))) kingMoves++;
                    if (mv.san.indexOf('#') !== -1) { mateInLine = true; break; }
                }
            }
            if (mateInLine) add('mate_threat', 0.85, ply);
            if (played.san.indexOf('#') !== -1) add('mate_threat', 1, 1);

            const endFen = walker ? walker.fen() : afterFen;
            const end = antidoteParseBoard(endFen);
            const queensAfter = antidoteCountPieces(end.grid, null, ['q']);
            if (queenGone || played.captured === 'q' || (queensAtStart > 0 && queensAfter < queensAtStart)) {
                add('queen_trade', 0.6, ply);
            }
            if (end.pieces <= 14) {
                const rooks = antidoteCountPieces(end.grid, null, ['r']);
                const minors = antidoteCountPieces(end.grid, null, ['n', 'b']);
                const pawns = antidoteCountPieces(end.grid, null, ['p']);
                if (!queensAfter && !rooks && !minors && pawns) add('pawn_endgame', 0.8, ply);
                else if (!queensAfter && rooks && !minors) add('rook_endgame', 0.7, ply);
                else if (!queensAfter && !rooks && minors) add('minor_endgame', 0.65, ply);
                if (kingMoves > 0) add('king_activity', 0.5, ply);
            }
            if (captures >= 2 || (after.pieces - end.pieces) >= 2) add('simplification', 0.55, ply);
            if (promotionInLine || played.promotion) add('promotion', 0.8, ply);

            const passedMine = antidotePassedPawns(end.grid, moverColor);
            const passedTheirs = antidotePassedPawns(end.grid, opponentColor);
            if (passedMine.length || passedTheirs.length) {
                const advanced = passedMine.concat(passedTheirs).reduce((m, p) =>
                    Math.max(m, moverColor === 'w' ? p.rank : 7 - p.rank), 0);
                add('passed_pawn', 0.4 + antidoteClamp01(advanced / 7) * 0.4, ply);
            }

            // ── Estratègia ─────────────────────────────────────────────────
            if (to) {
                const state = antidoteFileState(after.grid, to.file);
                const movedPiece = after.grid[to.rank] && after.grid[to.rank][to.file];
                if (movedPiece && (movedPiece.t === 'r' || movedPiece.t === 'q')
                    && !state.w && !state.b) {
                    add('open_file', 0.55, 1);
                } else if (movedPiece && (movedPiece.t === 'r' || movedPiece.t === 'q')
                    && !state[moverColor]) {
                    add('open_file', 0.42, 1);
                }
                if (played.piece === 'n' && to) {
                    const advanced = moverColor === 'w' ? to.rank >= 4 : to.rank <= 3;
                    const pawnDefenders = antidoteAttackersOf(after.grid, to.file, to.rank, moverColor)
                        .filter(a => a.t === 'p').length;
                    const pawnAttackers = antidoteAttackersOf(after.grid, to.file, to.rank, opponentColor)
                        .filter(a => a.t === 'p').length;
                    if (advanced && pawnDefenders > 0 && !pawnAttackers) add('weak_square', 0.55, 1);
                }
                if (played.piece === 'p') {
                    const contacts = antidoteTargetsOf(after.grid, to.file, to.rank)
                        .filter(t => {
                            const q = after.grid[t.rank][t.file];
                            return q && q.c === opponentColor && q.t === 'p';
                        }).length;
                    if (contacts > 0) add('pawn_break', 0.5, 1);
                }
            }
            const isolated = antidoteIsolatedPawns(after.grid, opponentColor);
            if (isolated.length) add('isolated_pawn', 0.35 + antidoteClamp01(isolated.length / 3) * 0.3, 1);

            if (to) {
                const mobilityAfter = antidoteTargetsOf(after.grid, to.file, to.rank).length;
                const fromSq = antidoteSquareIndex(played.from);
                const mobilityBefore = fromSq ? antidoteTargetsOf(before.grid, fromSq.file, fromSq.rank).length : 0;
                if (mobilityAfter - mobilityBefore >= 4) add('piece_activity', 0.45, 1);
            }

            // Profilaxi: jugada tranquil·la que desactiva una amenaça que hi havia.
            const threatsBefore = antidoteHangingPieces(before.grid, moverColor).length;
            const threatsAfter = antidoteHangingPieces(after.grid, moverColor).length;
            if (isQuiet && threatsBefore > threatsAfter) add('prophylaxis', 0.45, 1);

            // Defensa: la jugada crea una amenaça concreta que el jugador ha de parar.
            if (hanging.length || mateInLine || pressure.attackers >= 2) add('defensive_move', 0.4, 1);

            if (!themes.length) add('quiet_improvement', 0.4, 1);

            result.themes = themes.sort((a, b) => b.strength - a.strength).slice(0, 6);
            result.complexity = positionComplexity(afterFen);
            result.materialLoss = immediateMaterialLoss(fen, uci);
            return result;
        }

        return {
            classifyAntidoteCandidate: classifyAntidoteCandidate,
            positionComplexity: positionComplexity,
            immediateMaterialLoss: immediateMaterialLoss,
            uciToSan: uciToSan
        };
    }

    // Defensor enemic que sosté dues coses alhora (sobrecàrrega / desviació).
    function antidoteFindOverloaded(grid, defenderColor, attackerColor) {
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = grid[r][f];
                if (!p || p.c !== defenderColor || p.t === 'k') continue;
                let duties = 0;
                antidoteTargetsOf(grid, f, r).forEach(t => {
                    const q = grid[t.rank][t.file];
                    if (!q || q.c !== defenderColor) return;
                    // Defensa una peça pròpia que està atacada per l'enemic.
                    if (antidoteAttackersOf(grid, t.file, t.rank, attackerColor).length) duties++;
                });
                if (duties >= 2) return { square: antidoteSquareName(f, r), duties: duties };
            }
        }
        return null;
    }

    // ----------------------------------------------------------------------
    // TRES CAMINS — test d'opció múltiple sobre les teves pròpies jugades
    // ----------------------------------------------------------------------
    // Test de 20 preguntes construït amb jugades TEVES que no vas fer del tot
    // bé. A cada pregunta s'ensenyen les TRES MILLORS jugades de la posició
    // (A, B i C, barrejades) i la que vas jugar de veritat com a «Original»,
    // per comparar. Has de dir quina de les tres mana.
    //
    // No hi ha rellotge: el que es mesura és el criteri, no la velocitat.
    //
    // Les tres opcions surten del MultiPV que ja es desa a cada jugada
    // revisada (`multipvBefore`, tres línies), de manera que no cal cap anàlisi
    // nova ni cap distractor inventat: són sempre jugades que el motor avala
    // com a candidates, i la bona és la primera.
    //
    // La tria de les 20 preguntes s'ajusta a l'ELO/ROC del jugador per
    // DIFICULTAT: com més petita és la distància entre la millor i la segona,
    // més subtil és la decisió. Un jugador fort rep preguntes ajustades; un de
    // principiant, posicions on la bona destaca.
    const TRIA_CONFIG = {
        version: 2,
        optionCount: 3,
        testSize: 20,
        // Mínim de preguntes per poder fer un test (amb menys, no val la pena).
        minTestSize: 5,

        // Dificultat a partir de la distància entre la 1a i la 2a jugada:
        // molta distància = la bona destaca; poca = decisió subtil.
        difficulty: {
            easyGapCp: 200,   // gap ≥ això → dificultat 0 (fàcil)
            hardGapCp: 20     // gap ≤ això → dificultat 1 (difícil)
        },

        // Dificultat que es busca segons l'ELO/ROC. S'interpola entre fites.
        eloTargets: [
            { elo: 800, target: 0.15 },
            { elo: 1200, target: 0.32 },
            { elo: 1600, target: 0.50 },
            { elo: 2000, target: 0.66 },
            { elo: 2400, target: 0.80 },
            { elo: 2800, target: 0.90 }
        ],
        // Amplada de la forquilla al voltant de l'objectiu: sense una mica de
        // marge, un test de 20 seria monòton (totes les preguntes igual de
        // difícils) i s'exhauriria el fons de jugades disponibles.
        targetSpread: 0.22,

        // Perquè una jugada entri al test cal que la partida la tingui
        // revisada amb almenys tres línies de motor i que NO l'hagis encertada.
        eligibility: {
            minOptions: 3,
            // Una jugada compta com a «no 100% correcta» si no coincideix amb
            // la millor del motor. La pèrdua mínima evita colar-hi jugades
            // equivalents que el motor ordena diferent per atzar de cerca.
            minLossCp: 10,
            // D'una mateixa partida no es prenen totes les jugades: un test ha
            // de recórrer partides diferents.
            maxPerGame: 5
        },

        // Memòria entre tests. Una pregunta encertada no torna MAI; una de
        // fallada queda pendent i va tornant fins que s'encerta. Les pendents
        // tenen prioritat, però no poden omplir el test senceres: si un test de
        // vint fos tot repesca, deixaries de veure decisions noves.
        repetition: {
            maxPendingShare: 0.5
        },

        // Obertures. El fons n'és desbordant —totes les partides en tenen, i
        // sovint la MATEIXA— i, sense filtre, un test se n'ompliria de
        // variacions de les mateixes quatre jugades. Se'n deixa passar UNA per
        // posició i, en total, una quarta part del test.
        //
        // L'excepció són els errors RECURRENTS: una decisió d'obertura que has
        // fallat en partides diferents no és soroll, és un forat del repertori,
        // i aquestes passen sempre. El buit que deixi el tall s'omple amb
        // migjoc, que és on hi ha més material de veritat.
        openings: {
            onePerPosition: true,
            maxShare: 0.25,
            recurringMinGames: 2
        }
    };

    // Pèrdua en centipeons d'una candidata respecte de la millor, reaprofitant
    // l'escala de mat de l'Antídot (perdre un mat forçat no val 0 cp).
    function triaCandidateLossCp(bestEntry, candidateEntry) {
        const bestValue = antidoteScoreValue(bestEntry);
        const candValue = antidoteScoreValue(candidateEntry);
        if (bestValue === null || candValue === null) return null;
        return antidoteCpLoss(bestValue, candValue, ANTIDOTE_CONFIG);
    }

    function triaNormalizeCandidate(raw) {
        if (!raw || !raw.move) return null;
        return {
            move: String(raw.move),
            moveSan: raw.moveSan || raw.san || null,
            eval: (typeof raw.eval === 'number') ? raw.eval : null,
            evalType: raw.evalType || 'cp',
            pv: Array.isArray(raw.pv) ? raw.pv : []
        };
    }

    // Les tres candidates d'una jugada revisada. Hi ha dues formes possibles i
    // totes dues han de valer:
    //   1. `multipvBefore` sencer (tres línies crues) — el que hi ha a la
    //      partida en curs, acabada d'analitzar;
    //   2. `bestMove` + `evalBefore` (la línia 1) i `alternatives` (línies 2 i
    //      3) — el que es DESA a l'historial, on multipvBefore no viatja.
    // Sense la segona forma, el fons es limitaria a la partida del moment i el
    // test no es podria fer amb l'historial, que és d'on ha de sortir.
    function triaCandidatesFromReview(review) {
        const r = review || {};
        const raw = (Array.isArray(r.multipvBefore) ? r.multipvBefore : [])
            .map(triaNormalizeCandidate)
            .filter(Boolean);
        if (raw.length >= TRIA_CONFIG.optionCount) return raw;

        const best = r.bestMove || r.bestMoveUci;
        if (!best) return raw;
        const alts = (Array.isArray(r.alternatives) ? r.alternatives : [])
            .map(triaNormalizeCandidate)
            .filter(Boolean)
            .filter(c => String(c.move).slice(0, 4) !== String(best).slice(0, 4));
        if (!alts.length) return raw;

        const rebuilt = [{
            move: String(best),
            moveSan: r.bestMoveSan || null,
            // L'avaluació de la posició de decisió és, amb MultiPV, la de la
            // millor línia. Si no hi és, s'infereix de la primera alternativa
            // perquè la comparació segueixi tenint sentit.
            eval: (typeof r.evalBefore === 'number') ? r.evalBefore : (alts[0].eval),
            evalType: 'cp',
            pv: Array.isArray(r.bestMovePv) ? r.bestMovePv : []
        }].concat(alts);
        return rebuilt.length >= raw.length ? rebuilt : raw;
    }

    function triaSameMove(a, b) {
        if (!a || !b) return false;
        const ua = String(a.move || a || '').slice(0, 4).toLowerCase();
        const ub = String(b.move || b || '').slice(0, 4).toLowerCase();
        return !!(ua && ub && ua === ub);
    }

    // Dificultat [0,1] d'una pregunta: com més a prop van la millor i la
    // segona, més difícil és destriar-les.
    function triaQuestionDifficulty(candidates) {
        const list = (Array.isArray(candidates) ? candidates : [])
            .map(triaNormalizeCandidate)
            .filter(Boolean);
        if (list.length < 2) return 0.5;
        const gap = triaCandidateLossCp(list[0], list[1]);
        if (gap === null) return 0.5;
        const cfg = TRIA_CONFIG.difficulty;
        if (gap >= cfg.easyGapCp) return 0;
        if (gap <= cfg.hardGapCp) return 1;
        const span = cfg.easyGapCp - cfg.hardGapCp;
        return clampNum(1 - (gap - cfg.hardGapCp) / span, 0, 1);
    }

    // Dificultat que busca un jugador d'aquest ELO/ROC.
    function triaTargetDifficulty(elo) {
        const rows = TRIA_CONFIG.eloTargets;
        const e = clampNum(isNaN(elo) ? 1400 : elo, rows[0].elo, rows[rows.length - 1].elo);
        for (let i = 0; i < rows.length - 1; i++) {
            if (e <= rows[i + 1].elo) {
                const t = (e - rows[i].elo) / (rows[i + 1].elo - rows[i].elo);
                return rows[i].target + (rows[i + 1].target - rows[i].target) * t;
            }
        }
        return rows[rows.length - 1].target;
    }

    // Invers de triaTargetDifficulty: quin ELO/ROC correspon a una dificultat.
    // És el que permet dir a quin nivell estaven les preguntes d'un test, que
    // és una mitjana de veritat (cada pregunta té la seva dificultat).
    function triaDifficultyToElo(difficulty) {
        const rows = TRIA_CONFIG.eloTargets;
        const d = clampNum(isNaN(difficulty) ? 0.5 : difficulty,
            rows[0].target, rows[rows.length - 1].target);
        for (let i = 0; i < rows.length - 1; i++) {
            const lo = rows[i];
            const hi = rows[i + 1];
            if (d <= hi.target) {
                const span = hi.target - lo.target;
                const t = span === 0 ? 0 : (d - lo.target) / span;
                return Math.round(lo.elo + (hi.elo - lo.elo) * t);
            }
        }
        return rows[rows.length - 1].elo;
    }

    // Barreja determinista a partir d'una clau: la mateixa jugada ha de donar
    // sempre el mateix ordre d'opcions.
    function triaSeedFromKey(key) {
        let h = 2166136261;
        const s = String(key || '');
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h * 16777619) >>> 0;
        }
        return h >>> 0;
    }

    function triaShuffle(list, seed) {
        const out = list.slice();
        let state = (seed >>> 0) || 1;
        for (let i = out.length - 1; i > 0; i--) {
            state = (state * 1664525 + 1013904223) >>> 0;
            const j = state % (i + 1);
            const tmp = out[i];
            out[i] = out[j];
            out[j] = tmp;
        }
        return out;
    }

    // Jugades que poden entrar al test: revisades, amb tres línies de motor i
    // NO encertades (no vas jugar la millor). Es desdupliquen per posició.
    function triaEligibleMoves(reviews, options) {
        const opts = options || {};
        const cfg = TRIA_CONFIG.eligibility;
        const seen = {};
        const out = [];
        (Array.isArray(reviews) ? reviews : []).forEach(r => {
            if (!r) return;
            const fen = r.fen || r.beforeFen;
            if (!fen) return;
            const multi = triaCandidatesFromReview(r);
            if (multi.length < cfg.minOptions) return;
            const played = r.playerMove || r.playedMoveUci;
            const best = r.bestMove || r.bestMoveUci || multi[0].move;
            if (!played || !best) return;
            // Jugada 100% correcta: fora del test.
            if (triaSameMove({ move: played }, { move: best })) return;
            const loss = antidoteNum(r.cpLoss != null ? r.cpLoss : r.swing, 0);
            if (loss < cfg.minLossCp) return;
            const key = reviewErrorKey(r);
            // La MATEIXA decisió repetida (mateixa posició, mateixa jugada
            // dolenta) no genera dues preguntes, però es compta: repetir-la en
            // partides diferents és el que la converteix en un error RECURRENT,
            // i això és el que li dona dret a passar el filtre d'obertures.
            if (seen[key]) {
                seen[key].occurrences++;
                if (r.gameId) seen[key].games[String(r.gameId)] = true;
                return;
            }
            const kept = Object.assign({}, r, { occurrences: 1, games: {} });
            if (r.gameId) kept.games[String(r.gameId)] = true;
            seen[key] = kept;
            out.push(kept);
        });
        // Recurrent = fallada en més d'una partida (no dues vegades a la
        // mateixa, que sovint és la mateixa línia repetida en un dia dolent).
        out.forEach(r => {
            r.repeatedGames = Object.keys(r.games || {}).length;
            delete r.games;
        });
        return out;
    }

    // Reparteix el fons de jugades per partida, respectant el màxim per partida
    // i alternant-les perquè el test no es quedi encallat en una sola.
    //
    // El màxim per partida es reparteix al LLARG de la partida, no agafant-ne
    // les primeres jugades: les revisions vénen en ordre de joc, i quedar-se
    // amb el cap de la llista voldria dir servir sempre obertures i no arribar
    // mai al migjoc ni al final d'aquella partida.
    function triaSpreadAcrossGames(pool, maxPerGame) {
        const max = Math.max(1, antidoteNum(maxPerGame, TRIA_CONFIG.eligibility.maxPerGame));
        const byGame = new Map();
        (Array.isArray(pool) ? pool : []).forEach(item => {
            const id = String((item && item.gameId) || 'sense-partida');
            if (!byGame.has(id)) byGame.set(id, []);
            byGame.get(id).push(item);
        });
        const lists = Array.from(byGame.values()).map(list => {
            if (list.length <= max) return list;
            const picked = [];
            const step = list.length / max;
            for (let i = 0; i < max; i++) {
                picked.push(list[Math.min(list.length - 1, Math.floor(i * step))]);
            }
            return picked;
        });
        const out = [];
        let added = true;
        let round = 0;
        while (added) {
            added = false;
            lists.forEach(list => {
                if (round < list.length) { out.push(list[round]); added = true; }
            });
            round++;
        }
        return out;
    }

    // ------------------------------------------------------------------
    // Memòria entre tests
    // ------------------------------------------------------------------
    // Cada decisió té un estat: `mastered` (l'has encertada, no torna mai més)
    // o `pending` (l'has fallada i tornarà fins que l'encertis). El que no hi
    // consta encara no s'ha preguntat mai.
    function triaEmptyProgress() {
        return { version: TRIA_CONFIG.version, entries: {} };
    }

    function triaNormalizeProgress(progress) {
        const p = (progress && typeof progress === 'object') ? progress : null;
        const entries = (p && p.entries && typeof p.entries === 'object') ? p.entries : {};
        return { version: TRIA_CONFIG.version, entries: entries };
    }

    function triaProgressStatus(progress, key) {
        if (!key) return null;
        const entry = triaNormalizeProgress(progress).entries[key];
        if (!entry) return null;
        return entry.status === 'mastered' ? 'mastered' : 'pending';
    }

    // Aplica els resultats d'un test acabat. Encertar tanca la pregunta encara
    // que abans l'haguessis fallada: l'objectiu és haver-la après, no el
    // rècord d'intents.
    function triaApplyResults(progress, results, options) {
        const o = options || {};
        const now = o.now || Date.now();
        const next = triaNormalizeProgress(progress);
        const entries = Object.assign({}, next.entries);
        (Array.isArray(results) ? results : []).forEach(r => {
            if (!r || !r.key) return;
            const prev = entries[r.key] || { attempts: 0, wrong: 0, firstAt: now };
            entries[r.key] = {
                status: r.correct ? 'mastered' : 'pending',
                attempts: (prev.attempts || 0) + 1,
                wrong: (prev.wrong || 0) + (r.correct ? 0 : 1),
                firstAt: prev.firstAt || now,
                lastAt: now,
                masteredAt: r.correct ? now : (prev.masteredAt || null)
            };
        });
        return { version: TRIA_CONFIG.version, entries: entries };
    }

    function triaProgressCounts(progress) {
        const entries = triaNormalizeProgress(progress).entries;
        let pending = 0;
        let mastered = 0;
        Object.keys(entries).forEach(k => {
            if (entries[k] && entries[k].status === 'mastered') mastered++;
            else pending++;
        });
        return { pending: pending, mastered: mastered, total: pending + mastered };
    }

    // Separa un fons de jugades segons la memòria. Les encertades queden fora
    // del test; les fallades primer, i les que no s'han vist mai després.
    function triaPartitionByProgress(items, progress, keyOf) {
        const getKey = (typeof keyOf === 'function') ? keyOf : (x => x && x.key);
        const pending = [];
        const fresh = [];
        const mastered = [];
        (Array.isArray(items) ? items : []).forEach(item => {
            const status = triaProgressStatus(progress, getKey(item));
            if (status === 'mastered') mastered.push(item);
            else if (status === 'pending') pending.push(item);
            else fresh.push(item);
        });
        return { pending: pending, fresh: fresh, mastered: mastered };
    }

    // Barreja pendents i noves respectant el sostre de repesca. Les pendents
    // van primer; la resta del test l'omplen les noves i, si no n'hi ha prou,
    // més pendents.
    function triaMixPendingAndFresh(pending, fresh, size, options) {
        const o = options || {};
        const share = (typeof o.maxPendingShare === 'number')
            ? o.maxPendingShare : TRIA_CONFIG.repetition.maxPendingShare;
        const cap = Math.max(1, Math.round(size * clampNum(share, 0, 1)));
        const takenPending = pending.slice(0, Math.min(cap, pending.length));
        const room = size - takenPending.length;
        const takenFresh = fresh.slice(0, Math.max(0, room));
        const out = takenPending.concat(takenFresh);
        if (out.length < size) {
            // Sense material nou, la repesca pot passar del sostre: val més
            // repetir una pendent que servir un test escuat.
            const extra = pending.slice(takenPending.length, takenPending.length + (size - out.length));
            return out.concat(extra);
        }
        return out;
    }

    // Quantes preguntes pot donar de debò un fons, SENSE construir-les (no cal
    // chess.js): és el que ha d'anunciar el bàner. Comptar només les jugades
    // elegibles enganyaria, perquè el màxim per partida en deixa moltes fora
    // —una sola partida amb trenta decigudes fallades no fa un test de vint.
    function triaPlannedQuestionCount(reviews, options) {
        const o = options || {};
        const eligible = triaEligibleMoves(reviews, o);
        // Les ja encertades no tornen: no s'han de comptar com a disponibles.
        const usable = triaPartitionByProgress(eligible, o.progress, r => reviewErrorKey(r));
        const spread = triaSpreadAcrossGames(usable.pending.concat(usable.fresh), o.maxPerGame);
        const size = Math.max(1, antidoteNum(o.testSize, TRIA_CONFIG.testSize));
        return Math.min(size, spread.length);
    }

    // Reparteix una llista de preguntes entre OBERTURA, MIGJOC i FINAL fent
    // torns rodons: agafant-ne les primeres N, el test surt barrejat de fases
    // en comptes de quedar-se encallat a la que domini el fons (que sol ser el
    // migjoc). Dins de cada fase es conserva l'ordre que venia, de manera que
    // l'ajust de dificultat per ELO segueix manant a dins.
    const TRIA_PHASES = ['opening', 'middlegame', 'endgame'];

    function triaInterleaveByPhase(questions) {
        const buckets = { opening: [], middlegame: [], endgame: [] };
        (Array.isArray(questions) ? questions : []).forEach(q => {
            const phase = (q && buckets[q.phase]) ? q.phase : 'middlegame';
            buckets[phase].push(q);
        });
        const out = [];
        let round = 0;
        let added = true;
        while (added) {
            added = false;
            TRIA_PHASES.forEach(phase => {
                const list = buckets[phase];
                if (round < list.length) { out.push(list[round]); added = true; }
            });
            round++;
        }
        return out;
    }

    // Filtre d'obertures: una per posició i un sostre del total, tret dels
    // errors recurrents, que hi passen sempre. Les altres fases no es toquen.
    function triaFilterOpenings(questions, options) {
        const o = options || {};
        const cfg = TRIA_CONFIG.openings;
        const size = Math.max(1, antidoteNum(o.testSize, TRIA_CONFIG.testSize));
        const cap = Math.max(1, Math.round(size * clampNum(
            (typeof o.maxOpeningShare === 'number') ? o.maxOpeningShare : cfg.maxShare, 0, 1)));
        const minGames = Math.max(1, antidoteNum(o.recurringMinGames, cfg.recurringMinGames));

        const openings = [];
        const others = [];
        (Array.isArray(questions) ? questions : []).forEach(q => {
            if (q && q.phase === 'opening') openings.push(q);
            else if (q) others.push(q);
        });
        if (!openings.length) return { questions: others, overflow: [] };

        // Una per POSICIÓ: dues partides que arriben a la mateixa posició
        // d'obertura són la mateixa pregunta, encara que hi juguessis coses
        // diferents. Mana la que s'ha repetit més.
        const byPosition = new Map();
        openings.forEach(q => {
            const posKey = String(q.fen || '').split(' ')[0];
            const prev = byPosition.get(posKey);
            if (!prev || (q.repeatedGames || 1) > (prev.repeatedGames || 1)) byPosition.set(posKey, q);
        });
        const unique = cfg.onePerPosition ? Array.from(byPosition.values()) : openings;

        const recurring = [];
        const single = [];
        unique.forEach(q => {
            if ((q.repeatedGames || 1) >= minGames) recurring.push(q);
            else single.push(q);
        });
        // Les recurrents primer i senceres; les altres, fins al sostre. Les que
        // sobren no es llencen: tornen com a `overflow` per si el fons no dona
        // per omplir el test amb altres fases (un jugador que només tingui
        // partides curtes no ha de rebre un test de cinc preguntes).
        const room = Math.max(0, cap - recurring.length);
        const kept = recurring.concat(single.slice(0, room));
        return { questions: kept.concat(others), overflow: single.slice(room) };
    }

    // Quantes preguntes hi ha de cada fase (per al resum del test).
    function triaPhaseCounts(questions) {
        const counts = { opening: 0, middlegame: 0, endgame: 0 };
        (Array.isArray(questions) ? questions : []).forEach(q => {
            const phase = (q && counts[q.phase] !== undefined) ? q.phase : 'middlegame';
            counts[phase]++;
        });
        return counts;
    }

    function createTriaHelpers(ChessCtor, config) {
        const cfg = config || TRIA_CONFIG;

        function safeChess(fen) {
            try { return fen ? new ChessCtor(fen) : new ChessCtor(); } catch (e) { return null; }
        }

        function applyUci(fen, uci) {
            const chess = safeChess(fen);
            if (!chess) return null;
            const s = String(uci || '');
            if (s.length < 4) return null;
            try {
                const mv = chess.move({
                    from: s.substring(0, 2),
                    to: s.substring(2, 4),
                    promotion: s.length > 4 ? s[4] : 'q'
                });
                if (!mv) return null;
                return { move: mv, fen: chess.fen() };
            } catch (e) { return null; }
        }

        // Posició resultant d'una jugada: és el que ensenya cada tauler petit.
        // Només avança la jugada triada, mai la resposta del rival.
        function optionPosition(fen, uci) {
            const applied = applyUci(fen, uci);
            if (!applied) return null;
            return {
                fen: applied.fen,
                san: applied.move.san,
                from: applied.move.from,
                to: applied.move.to
            };
        }

        // Construeix la pregunta d'una jugada revisada, o null si no es pot.
        function buildQuestion(review, options) {
            const o = options || {};
            const r = review || {};
            const fen = r.fen || r.beforeFen;
            if (!fen) return null;

            const multi = triaCandidatesFromReview(r);
            if (multi.length < cfg.optionCount) return null;

            const top = multi.slice(0, cfg.optionCount);
            // Les tres han de ser legals i diferents entre elles.
            const positions = top.map(c => optionPosition(fen, c.move));
            if (positions.some(p => !p)) return null;
            const uniq = new Set(top.map(c => String(c.move).slice(0, 4)));
            if (uniq.size !== top.length) return null;

            const bestCandidate = top[0];
            const built = top.map((c, i) => ({
                move: c.move,
                san: positions[i].san,
                fen: positions[i].fen,
                from: positions[i].from,
                to: positions[i].to,
                lossCp: (i === 0) ? 0 : (triaCandidateLossCp(bestCandidate, c) ?? null),
                isBest: i === 0
            }));

            const key = reviewErrorKey(r);
            const shuffled = triaShuffle(built, triaSeedFromKey(key));
            const answerIndex = shuffled.findIndex(op => op.isBest);
            if (answerIndex < 0) return null;
            // Etiqueta A/B/C segons l'ordre ja barrejat.
            const letters = ['A', 'B', 'C', 'D', 'E'];
            shuffled.forEach((op, i) => { op.letter = letters[i] || String(i + 1); });

            // La jugada que vas fer de veritat: quart tauler, per comparar. No
            // es pot votar; només hi és per veure què vas triar tu.
            const playedUci = r.playerMove || r.playedMoveUci;
            const playedPos = playedUci ? optionPosition(fen, playedUci) : null;
            const original = playedPos ? {
                move: playedUci,
                san: playedPos.san,
                fen: playedPos.fen,
                from: playedPos.from,
                to: playedPos.to,
                lossCp: antidoteNum(r.cpLoss != null ? r.cpLoss : r.swing, null),
                // Si la teva jugada és una de les tres, val la pena dir-ho.
                matchesOptionLetter: (shuffled.find(op => triaSameMove(op, { move: playedUci })) || {}).letter || null
            } : null;

            return {
                key: key,
                fen: fen,
                turn: String(fen).split(' ')[1] === 'b' ? 'b' : 'w',
                moveNumber: r.moveNumber || null,
                gameId: r.gameId || null,
                gameLabel: r.gameLabel || null,
                quality: r.quality || null,
                options: shuffled,
                answerIndex: answerIndex,
                original: original,
                difficulty: triaQuestionDifficulty(multi),
                phase: phaseFromFen(fen),
                // En quantes partides diferents has fallat aquesta decisió.
                repeatedGames: Math.max(1, antidoteNum(r.repeatedGames, 1))
            };
        }

        // Munta el test sencer: agafa les jugades elegibles, en fa preguntes i
        // en tria `testSize` ajustades a l'ELO del jugador.
        function buildTest(reviews, options) {
            const o = options || {};
            const size = Math.max(1, antidoteNum(o.testSize, cfg.testSize));
            const elo = antidoteNum(o.elo, 1400);
            const target = triaTargetDifficulty(elo);

            const eligible = triaEligibleMoves(reviews, o);
            // Memòria entre tests: les encertades queden fora, les fallades
            // tenen prioritat i les noves omplen la resta.
            const split = triaPartitionByProgress(eligible, o.progress, r => reviewErrorKey(r));
            const spreadPending = triaSpreadAcrossGames(split.pending, o.maxPerGame);
            const spreadFresh = triaSpreadAcrossGames(split.fresh, o.maxPerGame);

            const toQuestions = list => {
                const out = [];
                list.forEach(r => {
                    const q = buildQuestion(r, o);
                    if (q) out.push(q);
                });
                return out;
            };
            const pendingQs = toQuestions(spreadPending).map(q => Object.assign(q, { pending: true }));
            const freshQs = toQuestions(spreadFresh);
            if (!pendingQs.length && !freshQs.length) return [];

            // Les noves s'ordenen per dificultat segons l'ELO; les pendents no
            // s'hi filtren: es deuen, vinguin de la franja que vinguin.
            const inBand = [];
            const rest = [];
            freshQs.forEach(q => {
                if (Math.abs(q.difficulty - target) <= cfg.targetSpread) inBand.push(q);
                else rest.push(q);
            });
            rest.sort((a, b) => Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target));
            // Obertures: una per posició i amb sostre, tret de les recurrents.
            // El que es talla aquí l'acaba omplint el migjoc, perquè el
            // repartiment per fases pren el que queda de cada bossa.
            const filtered = triaFilterOpenings(inBand.concat(rest), {
                testSize: size,
                maxOpeningShare: o.maxOpeningShare,
                recurringMinGames: o.recurringMinGames
            });
            // Barreja de fases: el fons real és molt més ric en obertures i
            // migjocs que en finals, i sense repartir-lo un test de vint no
            // arribaria mai a una posició de final.
            let orderedFresh = triaInterleaveByPhase(filtered.questions);
            // Si amb el sostre d'obertures no s'omple el test, es recuperen les
            // que havien sobrat: val més un test sencer d'obertures variades
            // que un de cinc preguntes.
            if (orderedFresh.length + pendingQs.length < size && filtered.overflow.length) {
                orderedFresh = orderedFresh.concat(filtered.overflow);
            }
            const orderedPending = triaInterleaveByPhase(pendingQs);
            return triaMixPendingAndFresh(orderedPending, orderedFresh, size, {
                maxPendingShare: o.maxPendingShare
            });
        }

        return { optionPosition, buildQuestion, buildTest };
    }

    // Resultat d'una resposta: verd o vermell a l'instant.
    function triaGradeAnswer(question, chosenIndex) {
        const q = question || {};
        const answered = (typeof chosenIndex === 'number' && chosenIndex >= 0);
        const correct = answered && chosenIndex === q.answerIndex;
        const chosen = (answered && Array.isArray(q.options)) ? q.options[chosenIndex] : null;
        const answer = Array.isArray(q.options) ? q.options[q.answerIndex] : null;
        return {
            key: q.key || null,
            correct: correct,
            answered: answered,
            chosenIndex: answered ? chosenIndex : -1,
            chosenLetter: chosen ? chosen.letter : null,
            answerLetter: answer ? answer.letter : null,
            // Triar la mateixa jugada que vas fer a la partida: hi has tornat.
            repeatedOwnMove: !!(chosen && q.original && triaSameMove(chosen, q.original)),
            difficulty: (typeof q.difficulty === 'number') ? q.difficulty : null,
            lostCp: chosen ? (chosen.lossCp ?? null) : null
        };
    }

    // Resum del test.
    function triaTestSummary(results, options) {
        const o = options || {};
        const list = (Array.isArray(results) ? results : []).filter(Boolean);
        const total = list.length;
        const correct = list.filter(r => r.correct).length;
        const repeated = list.filter(r => r.repeatedOwnMove).length;
        const difficulties = list.map(r => r.difficulty).filter(d => typeof d === 'number');
        const avgDifficulty = difficulties.length
            ? difficulties.reduce((s, d) => s + d, 0) / difficulties.length
            : null;
        // Centipeons regalats per les respostes errades: el cost real de
        // triar malament, en la moneda del tauler.
        const lostCp = list.reduce((s, r) => s + (r.correct ? 0 : (r.lostCp || 0)), 0);
        return {
            total: total,
            correct: correct,
            wrong: total - correct,
            accuracy: total ? Math.round((correct / total) * 100) : 0,
            phases: triaPhaseCounts(o.questions),
            repeatedOwnMove: repeated,
            avgDifficulty: (avgDifficulty === null) ? null : Math.round(avgDifficulty * 100) / 100,
            lostCp: Math.round(lostCp),
            elo: antidoteNum(o.elo, null),
            // Quines decisions han sortit: és el que permet rejugar el test
            // exactament igual des de l'historial.
            keys: list.map(r => r.key).filter(Boolean)
        };
    }

    // Historial de tests: llista curta i ordenada, prou per a la gràfica.
    const TRIA_HISTORY_MAX = 60;

    function triaAppendResult(history, summary, options) {
        const o = options || {};
        const list = (Array.isArray(history) ? history : []).slice();
        if (!summary || !summary.total) return list;
        list.push({
            at: o.now || Date.now(),
            total: summary.total,
            correct: summary.correct,
            accuracy: summary.accuracy,
            avgDifficulty: summary.avgDifficulty,
            // Nivell mitjà de les preguntes del test (de la dificultat a
            // ELO/ROC). És el que diu com d'exigent era el test.
            questionElo: (typeof summary.avgDifficulty === 'number')
                ? triaDifficultyToElo(summary.avgDifficulty) : null,
            repeatedOwnMove: summary.repeatedOwnMove || 0,
            lostCp: summary.lostCp || 0,
            elo: summary.elo == null ? null : Math.round(summary.elo),
            keys: Array.isArray(summary.keys) ? summary.keys.slice(0, 60) : []
        });
        list.sort((a, b) => (a.at || 0) - (b.at || 0));
        return list.slice(-TRIA_HISTORY_MAX);
    }

    // Files de l'historial per a la llista de sota del test: data, encert,
    // nivell mitjà de les preguntes i si es pot rejugar (cal tenir-ne les
    // claus desades; els tests antics no en tenen).
    function triaHistoryRows(history) {
        return (Array.isArray(history) ? history : [])
            .filter(Boolean)
            .slice()
            .sort((a, b) => (b.at || 0) - (a.at || 0))
            .map((r, i) => ({
                index: i,
                at: r.at || null,
                total: r.total || 0,
                correct: r.correct || 0,
                accuracy: (typeof r.accuracy === 'number') ? r.accuracy : 0,
                questionElo: (typeof r.questionElo === 'number')
                    ? r.questionElo
                    : ((typeof r.avgDifficulty === 'number') ? triaDifficultyToElo(r.avgDifficulty) : null),
                playerElo: (typeof r.elo === 'number') ? r.elo : null,
                keys: Array.isArray(r.keys) ? r.keys : [],
                replayable: Array.isArray(r.keys) && r.keys.length > 0
            }));
    }

    // Sèrie per a la gràfica d'estadístiques: encerts (%) al llarg del temps,
    // amb la mitjana mòbil de les últimes cinc per veure la tendència.
    function triaChartSeries(history, options) {
        const o = options || {};
        const window = Math.max(2, antidoteNum(o.window, 5));
        const list = (Array.isArray(history) ? history : [])
            .filter(r => r && typeof r.accuracy === 'number')
            .slice()
            .sort((a, b) => (a.at || 0) - (b.at || 0));
        return list.map((r, i) => {
            const from = Math.max(0, i - window + 1);
            const slice = list.slice(from, i + 1);
            const trend = slice.reduce((s, x) => s + x.accuracy, 0) / slice.length;
            return {
                at: r.at || null,
                accuracy: r.accuracy,
                trend: Math.round(trend),
                total: r.total || 0,
                correct: r.correct || 0,
                avgDifficulty: (typeof r.avgDifficulty === 'number') ? r.avgDifficulty : null,
                elo: (typeof r.elo === 'number') ? r.elo : null
            };
        });
    }

    return {
        splitPgnGames,
        parsePgnHeaders,
        sanitizePgnMoveText,
        pgnResultToLabel,
        pgnPlayersLabel,
        guessPlayerColorFromPgnHeaders,
        ANTIDOTE_CONFIG,
        ANTIDOTE_WEAKNESS_IDS,
        ANTIDOTE_WEAKNESS_LABELS,
        ANTIDOTE_THEME_FAMILY,
        ANTIDOTE_THEME_LABELS,
        antidoteThemeLabel,
        antidoteWeaknessLabel,
        antidoteThemeFamily,
        antidoteScoreValue,
        antidoteIsMateValue,
        antidoteMateDistance,
        antidoteCpLoss,
        antidoteBucket,
        antidoteCpMargin,
        antidoteMultiPv,
        antidoteSearchBudget,
        antidoteEmptyProfile,
        antidoteReviewPhase,
        antidoteReviewCategory,
        antidoteWeaknessStatsFromGame,
        antidoteGameStats,
        antidoteRecencyFactor,
        antidoteConfidence,
        antidoteWeaknessWeight,
        buildAntidoteProfile,
        antidoteProfileIsThin,
        antidoteTopWeaknesses,
        antidoteConfidenceLabel,
        antidoteCandidateGuard,
        antidoteTargetComplexity,
        antidoteWeaknessMatch,
        antidoteRepetitionPenalty,
        scoreAntidoteCandidate,
        chooseAntidoteCandidate,
        antidoteCreateTest,
        evaluateAntidoteResponse,
        antidoteGameSummary,
        updateAntidoteProgress,
        antidoteEvolutionReport,
        ANTIDOTE_SCAN_STEPS,
        ANTIDOTE_THEME_GUIDANCE,
        antidoteTurnPrompt,
        antidoteThinkingPrompt,
        antidoteGuidanceForTheme,
        antidoteResultFeedback,
        antidoteSerializeTest,
        antidoteSerializeGame,
        antidoteRestoreGame,
        antidoteTestsFromHistory,
        antidoteStatsFromHistory,
        antidoteParseBoard,
        antidoteAttackersOf,
        antidoteIsAttacked,
        antidoteTargetsOf,
        antidotePinsAndSkewers,
        antidoteHangingPieces,
        antidotePassedPawns,
        antidoteIsolatedPawns,
        antidoteKingZonePressure,
        createAntidoteDetectors,
        clampElo,
        bestLineEvalScore,
        bestLineGapCp,
        bestLineStepQualifies,
        PV_FORCED_REPLY_GAP_CP,
        PV_LOSING_REPLY_CP,
        pvGapCp,
        createPvBoardHelpers,
        computePvForcingInfo,
        buildPvForcingInfo,
        classifyPvLanguage,
        pvNarrationText,
        puzzleFenKey,
        puzzleIsDuplicateFen,
        puzzleMeetsCriteria,
        HIERO_ALLOWED_FINAL_MOTIFS,
        HIERO_FINAL_MOTIF_LABELS,
        HIERO_MOTIF_PRIORITY,
        createHieroglyphicMotifHelpers,
        hieroglyphicMeetsFinalMotifCriteria,
        hieroglyphicVariantMeta,
        puzzleDifficulty,
        puzzleRatingEstimate,
        puzzleExplanation,
        puzzleHint,
        puzzleInitPlay,
        puzzleSubmitMove,
        tacticsPickPool,
        tacticsRecordSolved,
        createBundleSequenceHelpers,
        BESSO_CONFIG,
        bessoPieceCountFromFen,
        bessoPhaseOfPosition,
        bessoEligibleGames,
        bessoDominantColor,
        bessoPhaseStatsFromGame,
        bessoGamePhaseStats,
        bessoProfileFromGames,
        bessoPhaseElo,
        bessoDaysAgoLabel,
        bessoPastSnapshot,
        createBessoHelpers,
        REPERTOIRE_CONFIG,
        historyEntryOutcome,
        HISTORY_GROUP_CONFIG,
        calendarDaysAgo,
        historyAgeGroup,
        groupHistoryEntriesByAge,
        historyGroupsOpenState,
        repertoireEligibleGames,
        createRepertoireHelpers,
        PERSONAL_OPENING_CONFIG,
        opponentReplyCounts,
        coverOpponentReplies,
        moveCpLoss,
        choosePersonalMove,
        summarizePersonalOpening,
        personalOpeningLines,
        createPersonalOpeningBuilder,
        normalize,
        clampUserElo,
        getBaselineAdjustmentDelta,
        getNewlyUnlockedMilestones,
        clampCalibrationRoc,
        getCalibrationOpponentRoc,
        getCalibrationGameQuality,
        getCalibrationPerformanceScore,
        difficultyToLevel,
        levelToDifficulty,
        rocToEngineElo,
        eloToSearchDepth,
        computeEloDelta,
        ratedEloDelta,
        timedCalibrationOpponentElo,
        initialCalibrationOpponentRoc,
        estimateTimedCalibrationElo,
        estimateGamePerformanceRating,
        collectiveLadderStep,
        adaptedRivalStrength,
        leagueBaseRating,
        rebasedLeagueRatings,
        leagueRoundGameLinks,
        evaluateGameQuality,
        parsePgnToMoves,
        buildOpeningTrie,
        getValidOpeningMoves,
        isValidOpeningMove,
        analyzeGameOpening,
        getMatchingOpenings,
        positionKeyFromFen,
        buildOpeningPositionGraph,
        analyzeGameOpeningByPositions,
        findCuratedOpeningByPosition,
        matchUserRepertoireOpening,
        OPENING_HIERO_CONFIG,
        openingHieroglyphicStartPly,
        openingHieroglyphicKey,
        classifyOpeningTheoryMove,
        createOpeningHieroglyphicHelpers,
        OPENING_BRANCH_CONFIG,
        openingBranchAnchorPlies,
        buildOpeningBranchIndex,
        pickOpeningBranchSlot,
        buildPvPositions,
        pvDisplayTokens,
        pvMoveAriaLabel,
        pvStepClamp,
        keyMomentBucket,
        scoreKeyMomentCandidate,
        selectKeyMoment,
        keyMomentReasonCode,
        keyMomentExplanation,
        classifyPracticeAttempt,
        reviewErrorKey,
        isRenderableReviewError,
        reviewMoveIdentityOk,
        auditReviewVoiceText,
        REVIEW_VOICE_STYLES,
        normalizeReviewVoiceStyle,
        formatPhaseLine,
        lessonOfTheDay,
        buildTenMinutePlan,
        playerColorIntro,
        HUMAN_TIME_PROFILES,
        HUMAN_CLOCK_STATS,
        HUMAN_PACE_SHAPE,
        HUMAN_PACE_PEAK_RATIO,
        humanPaceShape,
        humanClockProfile,
        humanPlannedSpendMs,
        humanExpectedRemainingMs,
        humanMoveFloorMs,
        HUMAN_FLOOR_CAP_MS,
        HUMAN_DEEP_THINK_MAX_MS,
        rollClockTemperament,
        estimateMoveComplexity,
        eloComplexityTimeMultiplier,
        phaseTimeMultiplier,
        clockManagementSkill,
        phaseFromFen,
        humanThinkTimeMs,
        visibleHumanReplyDelayMs,
        premoveTargets,
        isPremoveTarget,
        premoveMatchesLegalMove,
        TRIA_CONFIG,
        triaCandidateLossCp,
        triaCandidatesFromReview,
        triaQuestionDifficulty,
        triaTargetDifficulty,
        triaEligibleMoves,
        triaPlannedQuestionCount,
        triaEmptyProgress,
        triaProgressStatus,
        triaApplyResults,
        triaProgressCounts,
        triaPartitionByProgress,
        triaMixPendingAndFresh,
        triaInterleaveByPhase,
        triaFilterOpenings,
        triaPhaseCounts,
        triaSpreadAcrossGames,
        createTriaHelpers,
        triaGradeAnswer,
        triaTestSummary,
        triaAppendResult,
        triaChartSeries,
        triaDifficultyToElo,
        triaHistoryRows,
        START_POSITION_KEY
    };
});
