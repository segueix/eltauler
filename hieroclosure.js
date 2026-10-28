// Finals concloents dels jeroglífics. La forma tàctica no és una prova de guany.
// Chess verifica el desenllaç; Stockfish contrasta les tries i les defenses.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerHieroClosure = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const VERSION = 1;
    const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const uci = m => m.from + m.to + (m.promotion || '');
    const play = (g, u) => typeof u === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)
        ? g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }) : null;
    const balance = (g, color) => g.board().flat().reduce((sum, p) => sum + (p ? VALUES[p.type] * (p.color === color ? 1 : -1) : 0), 0);
    function lineOf(candidate) {
        const sol = candidate.solutionMoves || [], rep = candidate.replyMoves || [], line = [];
        sol.forEach((m, i) => { line.push(m); if (i < sol.length - 1) line.push(rep[i]); });
        return line;
    }
    function matches(candidate) {
        const proof = candidate && candidate.conclusion;
        return !!(proof && proof.version === VERSION && proof.fen === candidate.fen
            && JSON.stringify(proof.line) === JSON.stringify(lineOf(candidate)));
    }
    // Un MultiPV incomplet no demostra unicitat. Tampoc dos mats de durada diferent.
    function uniqueChoice(analysis, expected, legalCount, minDepth = 14, mateNow = false) {
        const list = analysis && analysis.alternatives;
        if (!Array.isArray(list) || !list.length) return false;
        const count = Math.min(2, legalCount);
        if (count < 1 || list.length < count) return false;
        const top = list.slice(0, count);
        if (top.some(a => !a || !a.move || !Number.isFinite(a.eval) || a.depth < minDepth || !Number.isFinite(a.depth) || a.bound)) return false;
        if (top[0].move !== expected || new Set(top.map(a => a.move)).size !== count) return false;
        if (count === 2 && top[0].depth !== top[1].depth) return false;
        const best = top[0], second = top[1];
        if (best.evalType === 'mate') return best.eval > 0 && (!mateNow || best.eval === 1)
            && (!second || !(second.evalType === 'mate' && second.eval > 0 && (!mateNow || second.eval === 1)));
        if (best.evalType !== 'cp' || best.eval < 300) return false;
        if (!second) return true;
        if (second.evalType === 'mate') return second.eval < 0;
        return second.evalType === 'cp' && second.eval < 200 && best.eval - second.eval >= 150;
    }

    function createVerifier(Chess, analyze) {
        async function request(...args) {
            try { return await analyze(...args); } catch (err) { return null; }
        }
        // Una captura/coronació ha de deixar un guany JA materialitzat, fins i
        // tot després de qualsevol rèplica legal (incloses recaptures i mats).
        function endpoint(g, move, color, initialBalance) {
            if (g.in_checkmate()) return { kind: 'mate', gain: null, replies: 0 };
            if (g.game_over() || (!move.captured && !move.promotion)) return null;
            let gain = balance(g, color) - initialBalance;
            if (gain < 3) return null;
            const replies = g.moves({ verbose: true });
            for (const reply of replies) {
                g.move(reply);
                const invalid = g.game_over();
                const net = balance(g, color) - initialBalance;
                g.undo();
                if (invalid || net < 3) return null;
                gain = Math.min(gain, net);
            }
            return { kind: move.promotion ? 'promotion' : 'material', gain, replies: replies.length };
        }
        function inspect(candidate) {
            try {
                const line = lineOf(candidate);
                if (!line.length || line.length > 5 || line.some(m => !m)) return null;
                const g = new Chess(candidate.fen), color = g.turn(), initialBalance = balance(g, color);
                const positions = [];
                let last;
                for (let i = 0; i < line.length; i++) {
                    if (g.game_over()) return null;
                    positions.push(g.fen());
                    last = play(g, line[i]);
                    if (!last) return null;
                }
                const result = endpoint(g, last, color, initialBalance);
                if (!result) return null;
                const finalFen = g.fen(), finalSan = last.san;
                g.undo();
                const legal = g.moves({ verbose: true });
                const alternatives = [];
                for (const move of legal) {
                    if (uci(move) === line[line.length - 1]) continue;
                    g.move(move);
                    const other = endpoint(g, move, color, initialBalance);
                    g.undo();
                    // Mat: només una jugada fa mat ara. Material: cap altra
                    // jugada tanca el mateix guany (o fa mat).
                    if (other && (result.kind !== 'mate' || other.kind === 'mate')) return null;
                    alternatives.push(move.san);
                }
                return { ...result, line, positions, finalFen, finalSan, alternatives, color };
            } catch (err) { return null; }
        }
        async function verify(candidate, opts = {}) {
            const end = inspect(candidate);
            if (!end || typeof analyze !== 'function') return null;
            const abort = () => !!(opts.shouldAbort && opts.shouldAbort());
            const depth = Math.max(16, opts.depth || 0), stepAlternatives = [], stepEvals = [], stepPvs = [];
            let finalAnalysis = null;
            for (let i = 0; i < end.positions.length; i++) {
                if (abort()) return null;
                const fen = end.positions[i], g = new Chess(fen), player = i % 2 === 0;
                // MultiPV 2 com a mínim per a les tries del jugador; no es
                // confon una sola variant rebuda amb una sola jugada legal.
                const a = await request(fen, depth, player ? 3 : 1, opts.moveTimeMs || 8000, opts.shouldAbort || null);
                if (abort() || !a || !a.bestMove || a.bestMove.move !== end.line[i]) return null;
                if (player) {
                    if (!uniqueChoice(a, end.line[i], g.moves().length, 14, end.kind === 'mate' && i === end.positions.length - 1)) return null;
                    stepAlternatives.push(a.alternatives);
                    stepEvals.push(a.bestMove.eval);
                    stepPvs.push(a.bestMove.pv || []);
                    finalAnalysis = a;
                } else if (!Number.isFinite(a.bestMove.depth) || a.bestMove.depth < 14 || a.bestMove.bound) return null;
            }
            if (end.kind !== 'mate') {
                const a = await request(end.finalFen, depth, 1, opts.moveTimeMs || 8000, opts.shouldAbort || null);
                const best = a && a.bestMove;
                // L'avaluació és del rival, que té el torn: ha de ser NEGATIVA.
                if (abort() || !best || best.depth < 14 || !Number.isFinite(best.depth) || !Number.isFinite(best.eval) || best.bound
                    || !play(new Chess(end.finalFen), best.move)
                    || !((best.evalType === 'cp' && best.eval <= -300) || (best.evalType === 'mate' && best.eval < 0))) return null;
            }
            const alternative = finalAnalysis.alternatives[1];
            const finalPosition = new Chess(end.positions[end.positions.length - 1]);
            const altMove = alternative && play(finalPosition, alternative.move);
            const alternativeLine = [];
            const replay = new Chess(end.positions[end.positions.length - 1]);
            for (const u of (alternative && alternative.pv || []).slice(0, 4)) {
                if (replay.game_over()) break;
                const move = play(replay, u);
                if (!move) break;
                alternativeLine.push(move.san);
            }
            const explanation = end.kind === 'mate'
                ? end.finalSan + ' és escac i mat: el rei està amenaçat i el rival no té cap resposta legal.'
                : end.finalSan + ' culmina la combinació: el guany material ja s’ha produït i es conserven almenys ' + end.gain + ' punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.';
            const uniqueness = end.kind === 'mate'
                ? (end.alternatives.length ? 'S’han comprovat les altres ' + end.alternatives.length + ' jugades legals: cap no fa mat en aquesta posició.' : 'Era l’única jugada legal.')
                : 'Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.';
            return { ...candidate, stepAlternatives, stepEvals, stepPvs,
                conclusion: { version: VERSION, fen: candidate.fen, line: end.line, finalFen: end.finalFen,
                    kind: end.kind, finalSan: end.finalSan, gain: end.gain, checkedReplies: end.replies,
                    checkedAlternatives: end.alternatives.length, explanation, uniqueness,
                    alternativeSan: altMove ? altMove.san : null,
                    alternativeLine,
                    alternativeEval: alternative ? { type: alternative.evalType, value: alternative.eval } : null,
                    minDepth: 14, requestedDepth: depth }
            };
        }
        return { inspect, verify };
    }
    return { VERSION, lineOf, matches, uniqueChoice, createVerifier };
});
