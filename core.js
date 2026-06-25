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

    return {
        clampElo,
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
        START_POSITION_KEY
    };
});
