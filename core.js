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

    // Frase inicial que deixa clar amb quin color jugava l'usuari.
    const COLOR_INTROS = {
        casual: color => 'Has jugat amb ' + color + '. Aquí comentem les teves jugades.',
        balanced: color => 'Has jugat amb ' + color + '. La revisió comenta les teves decisions.',
        technical: color => 'Has jugat amb ' + color + '. L’anàlisi valora les teves decisions.'
    };
    function playerColorIntro(playerColor, style) {
        const color = playerColor === 'b' ? 'negres' : 'blanques';
        return COLOR_INTROS[normalizeReviewVoiceStyle(style)](color);
    }

    return {
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
        START_POSITION_KEY
    };
});
