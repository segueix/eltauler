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
    // Temps de resposta humanitzat de l'enginy
    // ----------------------------------------------------------------------
    // Basat en l'informe «Control de temps humanitzat per Stockfish»: la jugada
    // que tria el motor NO canvia mai; només es modula QUAN es mostra, com si
    // un humà del nivell marcat hi hagués dedicat el temps. El model segueix
    // l'algorisme híbrid de l'informe: pressupost base per ritme (temps restant
    // dividit per un horitzó de jugades + fracció de l'increment), multiplicador
    // per ELO i complexitat (matriu de l'informe), multiplicador de fase,
    // soroll log-normal truncat perquè el patró no sigui mecànic, i mode
    // d'emergència perquè el retard escènic no faci mai perdre per bandera.

    function clampNum(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Paràmetres per ritme (taula de l'informe, adaptada):
    //  - horizon: jugades restants estimades [obertura, migjoc, final]; el
    //    pressupost base és tempsRestant/horitzó, així el gast decau suaument.
    //  - reserveMs (R_min): reserva d'emergència que mai es toca.
    //  - incShare (λ_I): fracció de l'increment tractada com a renda per jugada.
    //  - minMs (τ_min) / maxMs: sòl i sostre del temps visible per jugada.
    //  - capFrac: cap jugada pot gastar més d'aquesta fracció del temps útil.
    //  - noiseMix (ρ) i sigma: pes i amplada del soroll log-normal.
    const HUMAN_TIME_PROFILES = {
        '30s':   { horizon: [34, 24, 15], reserveMs: 2200, incShare: 0,    minMs: 120, maxMs: 4000,  capFrac: 0.14, noiseMix: 0.30, sigma: 0.45 },
        '1+0':   { horizon: [34, 24, 15], reserveMs: 2500, incShare: 0,    minMs: 160, maxMs: 6000,  capFrac: 0.14, noiseMix: 0.30, sigma: 0.45 },
        '3+2':   { horizon: [36, 26, 16], reserveMs: 1800, incShare: 0.30, minMs: 220, maxMs: 12000, capFrac: 0.16, noiseMix: 0.25, sigma: 0.40 },
        '5+0':   { horizon: [36, 26, 16], reserveMs: 3500, incShare: 0,    minMs: 300, maxMs: 15000, capFrac: 0.14, noiseMix: 0.25, sigma: 0.40 },
        '10+0':  { horizon: [38, 28, 17], reserveMs: 5000, incShare: 0,    minMs: 450, maxMs: 22000, capFrac: 0.14, noiseMix: 0.25, sigma: 0.35 },
        '15+10': { horizon: [40, 30, 18], reserveMs: 4000, incShare: 0.45, minMs: 700, maxMs: 28000, capFrac: 0.16, noiseMix: 0.20, sigma: 0.35 },
        // Sense rellotge: pressupost fictici moderat perquè la resposta també
        // «respiri» segons ELO i dificultat, sense fer esperar l'usuari.
        'none':  { fixedBudgetMs: 1300, minMs: 350, maxMs: 4500, noiseMix: 0.25, sigma: 0.40 }
    };

    // Matriu ELO–complexitat de l'informe: els nivells baixos sobreinverteixen
    // en posicions fàcils i subinverteixen en les difícils; els alts, al revés.
    // Files ancorades al centre de cada banda; columnes a C baixa/mitjana/alta.
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
    // per ELO entre bandes) sobre la matriu de l'informe.
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

    // Perícia de GESTIÓ DEL RELLOTGE segons ELO. Un jugador fluix no només juga
    // pitjor: administra malament el temps. Per sota de ~1400 (i sobretot cap a
    // ~400), el motor sobreinverteix per jugada (spendBias), guarda una reserva
    // d'emergència mínima (reserveFactor) i s'acosta a la bandera molt més
    // (flagGuardMs, el marge antibandera que usa app.js). A ROC baix el motor
    // pot arribar a perdre per temps, com li passaria a un humà del seu nivell;
    // a ROC alt manté la disciplina d'abans i no perd mai per bandera.
    function clockManagementSkill(elo) {
        const n = clampNum(((isNaN(elo) ? 1400 : elo) - 400) / 1000, 0, 1); // 400..1400
        return {
            spendBias: 1.4 - 0.4 * n,          // ×1.4 a ROC ≤400 → ×1.0 a ≥1400
            reserveFactor: 0.2 + 0.8 * n,      // 20% de la reserva → 100%
            flagGuardMs: Math.round(100 + 300 * n) // marge antibandera 100 → 400 ms
        };
    }

    // Complexitat C ∈ [0,1] a partir de proxies visibles per UCI (informe):
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

    // Temps de pensament humanitzat (ms) per a la propera jugada de l'enginy.
    // params: { timeControlId, remainingMs, incMs, elo, complexity, phase,
    //           moveNumber, random }. Amb remainingMs null (sense rellotge)
    // s'usa el pressupost fix del perfil 'none'.
    function visibleHumanReplyDelayMs(targetThinkMs, elapsedMs) {
        const target = Math.max(0, Number(targetThinkMs) || 0);
        const elapsed = Math.max(0, Number(elapsedMs) || 0);
        return Math.max(0, Math.round(target - elapsed));
    }

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
        const useClock = !profile.fixedBudgetMs && remainingMs !== null;
        // La gestió del rellotge (sobreinversió i reserva) depèn del nivell.
        const skill = clockManagementSkill(elo);

        let tau0;
        let capMs = profile.maxMs;
        if (!useClock) {
            tau0 = profile.fixedBudgetMs || HUMAN_TIME_PROFILES.none.fixedBudgetMs;
        } else {
            const phaseIdx = phase === 'opening' ? 0 : (phase === 'endgame' ? 2 : 1);
            const horizon = profile.horizon[phaseIdx];
            const overheadMs = 50; // marge de GUI/repintat per jugada
            const reserveMs = profile.reserveMs * skill.reserveFactor;
            const effectiveMs = Math.max(1, remainingMs - reserveMs - (2 + horizon) * overheadMs);
            tau0 = (effectiveMs / horizon) * skill.spendBias + profile.incShare * incMs;
            capMs = Math.min(profile.maxMs, profile.capFrac * effectiveMs * skill.spendBias + 0.6 * incMs);
        }

        const M = eloComplexityTimeMultiplier(elo, complexity);
        const P = phaseTimeMultiplier(elo, phase);
        // Les primeres jugades «de llibre» surten ràpid, com fan els humans.
        const bookRamp = clampNum(0.12 + 0.11 * (moveNumber - 1), 0.12, 1);
        const deterministic = tau0 * M * P * bookRamp;

        const z = truncatedLogNormalFactor(profile.sigma, random);
        let tau = (1 - profile.noiseMix) * deterministic + profile.noiseMix * deterministic * z;

        // Sincronitza lleugerament el ritme escènic amb el rival humà: si el
        // jugador està movent molt ràpid, l'enginy també accelera; si està
        // jugant pausadament, l'enginy respira una mica més. És deliberadament
        // suau i queda sotmès igualment als límits del perfil i del rellotge.
        const humanPaceMs = typeof p.humanPaceMs === 'number' ? p.humanPaceMs : null;
        const paceSamples = Math.max(0, p.paceSamples || 0);
        if (humanPaceMs !== null && paceSamples > 0) {
            const paceRefMs = profile.fixedBudgetMs ? 5000 : (remainingMs !== null ? remainingMs / Math.max(18, profile.horizon[1]) : 5000);
            const paceRatio = clampNum(humanPaceMs / Math.max(1, paceRefMs), 0.35, 2.5);
            const confidence = clampNum(paceSamples / 6, 0, 1);
            const paceMultiplier = 1 + (paceRatio - 1) * 0.22 * confidence;
            tau *= clampNum(paceMultiplier, 0.75, 1.2);
        }

        tau = clampNum(tau, profile.minMs, Math.max(profile.minMs, capMs));

        if (useClock) {
            // Mode d'emergència: amb el rellotge sota mínims es respon a l'acte.
            // El llindar escala amb el nivell: els ROC baixos triguen molt més a
            // adonar-se que van justos de temps.
            const panicAtMs = profile.reserveMs * skill.reserveFactor * 1.8;
            if (remainingMs <= panicAtMs) {
                tau = clampNum(remainingMs / 16 + 0.35 * incMs, 80, 500);
            }
            // Cap jugada escènica pot gastar més de la meitat del temps restant.
            tau = Math.min(tau, Math.max(60, remainingMs * 0.5 - 150));
        }
        return Math.round(Math.max(0, tau));
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

    return {
        splitPgnGames,
        parsePgnHeaders,
        sanitizePgnMoveText,
        pgnResultToLabel,
        pgnPlayersLabel,
        guessPlayerColorFromPgnHeaders,
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
        estimateMoveComplexity,
        eloComplexityTimeMultiplier,
        phaseTimeMultiplier,
        clockManagementSkill,
        phaseFromFen,
        humanThinkTimeMs,
        visibleHumanReplyDelayMs,
        START_POSITION_KEY
    };
});
