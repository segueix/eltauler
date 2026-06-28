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

    return {
        clampElo,
        bestLineEvalScore,
        bestLineGapCp,
        bestLineStepQualifies,
        puzzleFenKey,
        puzzleIsDuplicateFen,
        puzzleMeetsCriteria,
        puzzleDifficulty,
        puzzleRatingEstimate,
        puzzleExplanation,
        puzzleHint,
        puzzleInitPlay,
        puzzleSubmitMove,
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
        START_POSITION_KEY
    };
});
