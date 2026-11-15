// ============================================================================
// visiograu.js — «La visió d'en Grau»: Stockfish vist dues o tres jugades
// endavant i explicat amb lògica a Stockfish vs Lozza TV
// ============================================================================
// L'Èlia presenta la jugada i pregunta; en Grau mira la línia principal de
// l'anàlisi de Stockfish (la posició just després de la jugada, a plena
// força) i explica què hi passarà en les properes dues o tres jugades i per
// què. Després, quan la partida arriba a la jugada clau, en Grau confirma
// que s'ha complert la previsió o explica que un bàndol se n'ha desviat.
//
// Garanties (les mateixes que la resta de la retransmissió):
//   · Cada jugada de la línia es comprova amb chess.js abans de dir-la; la
//     lectura s'atura a la primera jugada que no és legal.
//   · Les finalitats («per defensar el peó d'e5», «per ocupar la columna d»)
//     només es diuen si el fet és cert al tauler DESPRÉS d'aquella jugada:
//     atacs, defenses, columnes, setena fila, peó passat, rei, centre...
//   · El material guanyat només es diu si la línia acaba en una posició
//     quieta (sense cap captura, coronació ni escac pendent) i la valoració
//     de Stockfish no contradiu el guany.
//   · Res no s'atribueix als jugadors: tot és «la línia de Stockfish».
//   · Mats, posicions decidides, jugades preparades i anàlisis poc
//     profundes no generen plans.
//
// Es carrega com a:
//   - Navegador: <script src="visiograu.js"> → window.ElTaulerVisioGrau
//   - Node/Jest: require('./visiograu') → module.exports
// ============================================================================
(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.ElTaulerVisioGrau = api;
    }
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    const VERSION = '1.0.0';

    function getCore() {
        if (root && root.ElTaulerCore) return root.ElTaulerCore;
        try { if (typeof require === 'function') return require('./core'); } catch (e) {}
        return null;
    }

    const CONFIG = Object.freeze({
        // Profunditat mínima de l'anàlisi per explicar-ne la línia.
        MIN_DEPTH: 12,
        // Semijugades llegides: resposta, continuació... fins a tres de cada
        // bàndol. Si la sisena és una captura, es llegeix fins a la vuitena
        // per veure com acaba el canvi.
        MIN_PLIES: 3,
        LINE_PLIES: 6,
        EXTEND_PLIES: 8,
        // Amb una posició decidida no es fan plans (el ritme s'accelera).
        DECIDED_CP: 600,
        // Entre dos plans. Si tornaria a parlar del mateix bàndol, s'espera més.
        GAP_PLIES: 6,
        SAME_SIDE_GAP_PLIES: 8,
        // Una desviació petita només es comenta de tant en tant.
        MISS_GAP_PLIES: 10,
        MISS_NOTABLE_CP: 60,
        MISS_EQUAL_CP: 35,
        MISS_CLEAR_CP: 110,
        // Paraules: tot el diàleg i només la narració de la línia.
        // La narració de la línia té prioritat: dues jugades de cada bàndol
        // (tres per als avançats) abans que la lògica i la valoració.
        MAX_WORDS: { basic: 72, mid: 92, advanced: 100 },
        LINE_WORDS: { basic: 32, mid: 48, advanced: 56 },
        FOLLOW_WORDS: 52
    });

    // ------------------------------------------------------------------
    // Llengua: peces, bàndols, articles i contraccions
    // ------------------------------------------------------------------
    const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const NAME = { p: 'peó', n: 'cavall', b: 'alfil', r: 'torre', q: 'dama', k: 'rei' };
    const PLURAL = { p: 'peons', n: 'cavalls', b: 'alfils', r: 'torres', q: 'dames', k: 'reis' };
    const FEM = { r: true, q: true };
    const SIDE = {
        w: { pl: 'les blanques', Pl: 'Les blanques', adj: 'blanc', adjF: 'blanca' },
        b: { pl: 'les negres', Pl: 'Les negres', adj: 'negre', adjF: 'negra' }
    };
    const HOME = { w: { b1: 'n', g1: 'n', c1: 'b', f1: 'b' }, b: { b8: 'n', g8: 'n', c8: 'b', f8: 'b' } };
    const CENTER = ['d4', 'e4', 'd5', 'e5'];
    const NUM = { 1: ['un', 'una'], 2: ['dos', 'dues'], 3: ['tres', 'tres'], 4: ['quatre', 'quatre'], 5: ['cinc', 'cinc'],
        6: ['sis', 'sis'], 7: ['set', 'set'], 8: ['vuit', 'vuit'], 9: ['nou', 'nou'], 10: ['deu', 'deu'] };

    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    function other(c) { return c === 'w' ? 'b' : 'w'; }
    function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
    function wordCount(t) { return String(t || '').trim().split(/\s+/).filter(Boolean).length; }
    function numWord(n, fem) { const w = NUM[n]; return w ? w[fem ? 1 : 0] : String(n); }
    function hash(text) {
        let h = 7;
        const s = String(text || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
        return h;
    }
    // «el cavall», «la torre», «l’alfil».
    function np(type) {
        const name = NAME[type];
        return (FEM[type] ? 'la ' : (/^[aeiou]/.test(name) ? 'l’' : 'el ')) + name;
    }
    function npColor(type, color) { return np(type) + ' ' + (FEM[type] ? SIDE[color].adjF : SIDE[color].adj); }
    // «d’e4», «de d4»: s'apostrofa davant de les lletres que sonen amb vocal.
    function deSq(sq) { return (/^[aefh]/.test(sq) ? 'd’' : 'de ') + sq; }
    function on(type, sq) { return np(type) + ' ' + deSq(sq); }
    // Contraccions: de + el → del; a + el → al; amb no es contrau.
    function de(phrase) {
        const p = String(phrase);
        if (/^el /.test(p)) return 'del ' + p.slice(3);
        if (/^[aeiouàèéíòóú]/i.test(p)) return 'd’' + p;
        return 'de ' + p;
    }
    function per(phrase) { return /^el /.test(String(phrase)) ? 'pel ' + String(phrase).slice(3) : 'per ' + phrase; }
    function clitic(type) { return FEM[type] ? 'la' : 'lo'; }
    function pronoun(type) { return FEM[type] ? 'la' : 'el'; }
    function agree(type, masc, fem) { return FEM[type] ? fem : masc; }

    // Verbs de les accions: infinitiu, present, condicional i subjuntiu
    // (tercera persona del plural: «les blanques porten / portarien / portin»).
    const VERBS = {
        portar: ['portar', 'porten', 'portarien', 'portin', 'portessin'],
        capturar: ['capturar', 'capturen', 'capturarien', 'capturin', 'capturessin'],
        avançar: ['avançar', 'avancen', 'avançarien', 'avancin', 'avancessin'],
        enrocar: ['enrocar', 'enroquen', 'enrocarien', 'enroquin', 'enroquessin'],
        coronar: ['coronar', 'coronen', 'coronarien', 'coronin', 'coronessin'],
        tornar: ['tornar', 'tornen', 'tornarien', 'tornin', 'tornessin'],
        retirar: ['retirar', 'retiren', 'retirarien', 'retirin', 'retiressin'],
        desenvolupar: ['desenvolupar', 'desenvolupen', 'desenvoluparien', 'desenvolupin', 'desenvolupessin']
    };
    // past: imperfet de subjuntiu («Stockfish esperava que les negres portessin...»).
    const MOOD = { inf: 0, pres: 1, cond: 2, subj: 3, past: 4 };

    // ------------------------------------------------------------------
    // Tauler (core.js) i jugades (chess.js)
    // ------------------------------------------------------------------
    function fileRank(sq) {
        const f = 'abcdefgh'.indexOf(String(sq || '').charAt(0));
        const r = parseInt(String(sq || '').charAt(1), 10) - 1;
        return (f < 0 || !(r >= 0 && r <= 7)) ? null : { file: f, rank: r };
    }
    function sqOf(f, r) { return 'abcdefgh'.charAt(f) + (r + 1); }
    function cheb(a, b) {
        const x = fileRank(a), y = fileRank(b);
        return x && y ? Math.max(Math.abs(x.file - y.file), Math.abs(x.rank - y.rank)) : 99;
    }
    function centerDistance(sq) { return Math.min.apply(null, CENTER.map(c => cheb(sq, c))); }

    function board() {
        const Core = getCore();
        if (!Core || typeof Core.antidoteParseBoard !== 'function' || typeof Core.antidoteAttackersOf !== 'function' ||
                typeof Core.antidoteTargetsOf !== 'function') return null;
        return {
            Core: Core,
            parse: fen => Core.antidoteParseBoard(fen).grid,
            attackers(grid, sq, color) {
                const fr = fileRank(sq);
                return fr ? Core.antidoteAttackersOf(grid, fr.file, fr.rank, color).map(a => ({ sq: sqOf(a.file, a.rank), t: a.t })) : [];
            },
            targets(grid, sq) {
                const fr = fileRank(sq);
                return fr ? Core.antidoteTargetsOf(grid, fr.file, fr.rank).map(t => sqOf(t.file, t.rank)) : [];
            },
            passed(grid, color) {
                return new Set(typeof Core.antidotePassedPawns === 'function'
                    ? Core.antidotePassedPawns(grid, color).map(p => p.square) : []);
            },
            endgame(fen) {
                if (typeof Core.phaseFromFen === 'function' && Core.phaseFromFen(fen) === 'endgame') return true;
                return (String(fen || '').split(' ')[0].match(/[nbrqNBRQ]/g) || []).length <= 4;
            }
        };
    }
    function at(grid, sq) { const fr = fileRank(sq); return fr ? grid[fr.rank][fr.file] : null; }
    function pieces(grid, color, type) {
        const out = [];
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
            const p = grid[r][f];
            if (p && p.c === color && (!type || p.t === type)) out.push({ sq: sqOf(f, r), t: p.t });
        }
        return out;
    }
    function kingOf(grid, color) { const k = pieces(grid, color, 'k')[0]; return k ? k.sq : null; }
    function fileCounts(grid, file) {
        const f = 'abcdefgh'.indexOf(file);
        const c = { w: 0, b: 0 };
        for (let r = 0; r < 8; r++) { const p = grid[r][f]; if (p && p.t === 'p') c[p.c]++; }
        return c;
    }
    function rooksConnected(grid, color) {
        const rank = color === 'w' ? 0 : 7;
        const files = [];
        for (let f = 0; f < 8; f++) { const p = grid[rank][f]; if (p && p.c === color && p.t === 'r') files.push(f); }
        if (files.length !== 2) return false;
        for (let f = files[0] + 1; f < files[1]; f++) if (grid[rank][f]) return false;
        return true;
    }
    function minorsHome(grid, color) {
        return Object.keys(HOME[color]).filter(sq => { const p = at(grid, sq); return p && p.c === color && p.t === HOME[color][sq]; }).length;
    }
    function material(grid) {
        const m = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, pts: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, pts: 0 } };
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
            const p = grid[r][f];
            if (p && p.t !== 'k') { m[p.c][p.t]++; m[p.c].pts += VALUE[p.t]; }
        }
        return m;
    }
    // Un lloc avançat: quarta a sisena fila, defensat per un peó propi i sense
    // cap peó rival a les columnes veïnes que hi pugui arribar a atacar.
    function isOutpost(B, grid, sq, color) {
        const fr = fileRank(sq);
        if (!fr) return false;
        const rel = color === 'w' ? fr.rank + 1 : 8 - fr.rank;
        if (rel < 4 || rel > 6) return false;
        if (!B.attackers(grid, sq, color).some(a => a.t === 'p')) return false;
        const enemy = other(color);
        for (const df of [-1, 1]) {
            const f = fr.file + df;
            if (f < 0 || f > 7) continue;
            for (let r = 0; r < 8; r++) {
                const p = grid[r][f];
                if (!p || p.t !== 'p' || p.c !== enemy) continue;
                if (color === 'w' ? r > fr.rank : r < fr.rank) return false;
            }
        }
        return true;
    }
    function applyUci(ChessCtor, fen, uci) {
        if (!uci || uci.length < 4) return null;
        try {
            const g = new ChessCtor(fen);
            const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' });
            return mv ? { move: mv, fen: g.fen() } : null;
        } catch (e) { return null; }
    }
    function moveUci(mv) { return mv ? mv.from + mv.to + (mv.promotion || '') : ''; }

    // ------------------------------------------------------------------
    // Lectura d'una jugada de la línia: fets comprovats al tauler
    // ------------------------------------------------------------------
    function readStep(B, ChessCtor, fen, uci, prev) {
        const applied = applyUci(ChessCtor, fen, uci);
        if (!applied) return null;
        const mv = applied.move;
        const color = mv.color, opp = other(color);
        const g0 = B.parse(fen), g1 = B.parse(applied.fen);
        const type = mv.promotion || mv.piece;
        const flags = mv.flags || '';
        const castle = flags.indexOf('k') !== -1 ? 'curt' : flags.indexOf('q') !== -1 ? 'llarg' : null;
        const capSq = flags.indexOf('e') !== -1 ? mv.to[0] + mv.from[1] : mv.to;
        const f = {};
        const king0 = kingOf(g0, color);
        if (king0 && B.attackers(g0, king0, opp).length)
            f.outOfCheck = mv.piece === 'k' ? 'king' : (mv.captured ? 'capture' : 'block');
        if (mv.captured) {
            f.capture = { type: mv.captured, sq: capSq };
            if (prev && prev.move && prev.move.captured && prev.move.to === mv.to) f.recapture = true;
            else if (!B.attackers(g1, mv.to, opp).length) f.free = true;
        }
        if (mv.promotion) f.promotion = mv.promotion;
        if (castle) f.castle = castle;
        const t0 = castle ? [] : B.targets(g0, mv.from);
        const t1 = castle ? [] : B.targets(g1, mv.to);
        if (!castle && type !== 'k') {
            // Atacs nous de la peça moguda: una peça més valuosa o sense defensa.
            const attacks = t1.filter(sq => t0.indexOf(sq) === -1)
                .map(sq => ({ sq: sq, p: at(g1, sq) }))
                .filter(x => x.p && x.p.c === opp && x.p.t !== 'k')
                .filter(x => VALUE[x.p.t] > VALUE[type] || !B.attackers(g1, x.sq, opp).length)
                .sort((a, b) => VALUE[b.p.t] - VALUE[a.p.t]);
            if (attacks.length) f.attack = { sq: attacks[0].sq, type: attacks[0].p.t, count: attacks.length,
                loose: !B.attackers(g1, attacks[0].sq, opp).length };
            // Defenses noves d'una peça pròpia que està atacada.
            const defends = t1.map(sq => ({ sq: sq, p: at(g1, sq) }))
                .filter(x => x.p && x.p.c === color && x.p.t !== 'k' && x.sq !== mv.to)
                .filter(x => B.attackers(g1, x.sq, opp).length > 0)
                .filter(x => B.attackers(g1, x.sq, color).length > B.attackers(g0, x.sq, color).length)
                .sort((a, b) => VALUE[b.p.t] - VALUE[a.p.t]);
            if (defends.length) f.defend = { sq: defends[0].sq, type: defends[0].p.t };
            // Fugida: la peça era atacada (sense defensa o per una de més barata)
            // i a la casella nova ja no l'ataca ningú.
            const att0 = B.attackers(g0, mv.from, opp);
            if (!mv.captured && att0.length) {
                const cheaper = att0.some(a => VALUE[a.t] < VALUE[mv.piece]);
                const defended = B.attackers(g0, mv.from, color).length > 0;
                if ((cheaper || !defended) && !B.attackers(g1, mv.to, opp).length) f.escape = true;
            }
            if (HOME[color][mv.from] === mv.piece) f.develop = { last: minorsHome(g1, color) === 0 };
            if (type === 'r' || type === 'q') {
                const file = mv.to[0];
                const pawns = fileCounts(g1, file);
                if (mv.from[0] !== file && !pawns[color]) {
                    f.file = { file: file, open: !pawns[opp] };
                    const partner = pieces(g1, color).find(p => p.sq !== mv.to && p.sq[0] === file && (p.t === 'r' || p.t === 'q'));
                    if (partner) f.double = { file: file, partner: partner.t };
                }
                const seventh = color === 'w' ? '7' : '2';
                if (mv.to[1] === seventh && mv.from[1] !== seventh) f.seventh = true;
            }
            if (mv.piece === 'p' && !mv.promotion && B.passed(g1, color).has(mv.to)) {
                const rank = Number(mv.to[1]);
                f.passed = { left: color === 'w' ? 8 - rank : rank - 1 };
            }
            const ek = kingOf(g1, opp);
            if (ek && type !== 'p') {
                const zone = sq => cheb(sq, ek) <= 1;
                const n1 = t1.filter(zone).length, n0 = t0.filter(zone).length;
                if (n1 >= 2 && n1 > n0) f.king = { count: n1 };
            }
            const endgame = B.endgame(applied.fen);
            if (endgame) { /* al final, el centre no és cap finalitat per si mateix */ }
            else if (['p', 'n', 'b'].indexOf(type) === -1) { /* el centre, per als peons i les peces menors */ }
            else if (CENTER.indexOf(mv.to) !== -1 && CENTER.indexOf(mv.from) === -1) f.center = 'occupy';
            else {
                const c1 = t1.filter(sq => CENTER.indexOf(sq) !== -1).length;
                const c0 = t0.filter(sq => CENTER.indexOf(sq) !== -1).length;
                if (c1 >= 2 && c1 > c0) f.center = 'control';
            }
            if ((type === 'n' || type === 'b') && isOutpost(B, g1, mv.to, color)) f.outpost = true;
            if (!mv.captured && ['q', 'r', 'b', 'n'].indexOf(type) !== -1) {
                const hits = B.attackers(g1, mv.to, opp);
                if (hits.some(a => a.t === type) && !hits.some(a => VALUE[a.t] < VALUE[type]) &&
                        B.attackers(g1, mv.to, color).length) f.trade = type;
            }
            const back = color === 'w' ? Number(mv.to[1]) < Number(mv.from[1]) : Number(mv.to[1]) > Number(mv.from[1]);
            if (back && mv.piece !== 'p') f.retreat = true;
        }
        if (!castle && mv.piece === 'k' && B.endgame(applied.fen) && centerDistance(mv.to) < centerDistance(mv.from)) f.kingActive = true;
        // Sortida per al rei: un peó del davant del rei enrocat avança i la
        // casella que deixa queda lliure i sense atacar.
        if (mv.piece === 'p' && !mv.captured) {
            const k = kingOf(g1, color);
            const home = color === 'w' ? '1' : '8', second = color === 'w' ? '2' : '7';
            if (k && k[1] === home && mv.from[1] === second && cheb(mv.from, k) === 1 && 'abcfgh'.indexOf(k[0]) !== -1 &&
                    !B.attackers(g1, mv.from, opp).length) f.luft = true;
        }
        if (!rooksConnected(g0, color) && rooksConnected(g1, color)) f.connect = true;
        return { uci: uci, move: mv, color: color, fenBefore: fen, fen: applied.fen, grid: g1, facts: f,
            check: /\+$/.test(mv.san), mate: /#$/.test(mv.san) };
    }

    // Importància d'una jugada de la línia (per triar-ne la jugada clau).
    function stepScore(s) {
        if (!s) return 0;
        const f = s.facts;
        if (s.mate) return 100;
        if (f.promotion) return 90;
        if (f.capture && f.free && VALUE[f.capture.type] >= 3) return 80;
        if (f.capture && !f.recapture && VALUE[f.capture.type] > VALUE[s.move.piece]) return 72;
        if (f.attack && VALUE[f.attack.type] >= 3) return 64;
        if (f.capture && !f.recapture) return 56;
        if (f.passed) return 54;
        if (f.attack) return 52;
        if (f.seventh) return 50;
        if (f.double) return 48;
        if (s.check) return 46;
        if (f.king) return 45;
        if (f.file) return 44;
        if (f.outpost) return 42;
        if (f.defend) return 40;
        if (f.escape) return 38;
        if (f.castle) return 35;
        if (f.trade) return 34;
        if (f.capture) return 32;
        if (f.center) return 30;
        if (f.kingActive) return 30;
        if (f.luft) return 25;
        if (f.connect) return 24;
        if (f.develop) return 22;
        return 0;
    }

    function readLine(ChessCtor, fen, pv, opts) {
        const B = board();
        if (!B || typeof ChessCtor !== 'function' || !fen || !Array.isArray(pv)) return null;
        const o = opts || {};
        const max = o.plies || CONFIG.LINE_PLIES;
        const limit = o.extend || CONFIG.EXTEND_PLIES;
        const steps = [];
        let cur = fen;
        let prev = o.prev ? { move: o.prev } : null;
        for (let i = 0; i < pv.length && i < limit; i++) {
            if (i >= max && !(prev && prev.move && prev.move.captured)) break;
            const step = readStep(B, ChessCtor, cur, pv[i], prev);
            if (!step) break;
            step.index = i;
            steps.push(step);
            cur = step.fen;
            prev = step;
            if (step.mate) break;
        }
        const startGrid = B.parse(fen);
        const last = steps[steps.length - 1];
        const endGrid = last ? last.grid : startGrid;
        return {
            fen: fen, steps: steps, startGrid: startGrid, endGrid: endGrid,
            material: { start: material(startGrid), end: material(endGrid),
                stable: !!last && !last.move.captured && !last.move.promotion && !last.check }
        };
    }

    // ------------------------------------------------------------------
    // Frases d'una jugada: acció conjugada, nom i finalitat comprovada
    // ------------------------------------------------------------------
    function disambiguated(mv) { return /^[NBRQK]([a-h]|[1-8]|[a-h][1-8])x?[a-h][1-8]/.test(mv.san || ''); }

    function actionOf(step) {
        const mv = step.move, f = step.facts;
        const chk = step.mate ? ' amb escac i mat' : step.check ? ' amb escac' : '';
        if (f.castle) return { verb: 'enrocar', obj: f.castle, chk: chk };
        if (mv.promotion) return { verb: 'coronar', obj: 'el peó a ' + mv.to, chk: chk };
        const who = mv.piece === 'p' ? 'el peó ' + deSq(mv.from) : np(mv.piece) + (disambiguated(mv) ? ' ' + deSq(mv.from) : '');
        if (mv.captured) {
            // «amb l’alfil, amb escac»: no s'encadenen dos «amb».
            const cchk = chk ? ',' + chk : '';
            if (f.recapture) return { verb: 'tornar', obj: 'a capturar a ' + mv.to + ' amb ' + who, chk: cchk };
            // «capturar el peó d’f4, que no estava defensat, amb el rei».
            const free = f.free ? ', que no estava ' + agree(mv.captured, 'defensat', 'defensada') + ',' : '';
            return { verb: 'capturar', obj: on(mv.captured, f.capture.sq) + free + ' amb ' + who, chk: cchk };
        }
        if (mv.piece === 'p') return { verb: 'avançar', obj: 'el peó a ' + mv.to, chk: chk };
        const target = who + ' a ' + mv.to;
        if (f.develop) return { verb: 'desenvolupar', obj: target, chk: chk };
        if (f.retreat && f.escape) return { verb: 'retirar', obj: target, chk: chk };
        return { verb: 'portar', obj: target, chk: chk };
    }
    function conj(action, mood) { return VERBS[action.verb][MOOD[mood]] + ' ' + action.obj + action.chk; }

    // Nom de la jugada: «el cavall a f6», «la captura a d5», «l’enroc curt».
    function nominal(step) {
        const mv = step.move, f = step.facts;
        const chk = step.mate ? ' amb escac i mat' : step.check ? ' amb escac' : '';
        if (f.castle) return 'l’enroc ' + f.castle + ' ' + de(SIDE[step.color].pl) + chk;
        if (mv.promotion) return 'la coronació a ' + mv.to + chk;
        if (f.recapture) return 'la recaptura a ' + mv.to + chk;
        if (mv.captured) return 'la captura a ' + f.capture.sq + chk;
        if (mv.piece === 'p') return 'el peó a ' + mv.to + chk;
        return np(mv.piece) + ' a ' + mv.to + chk;
    }

    // Finalitat de la jugada, en infinitiu, només amb fets comprovats.
    function purposeOf(step) {
        const f = step.facts, mv = step.move, color = step.color, opp = other(color);
        const type = mv.promotion || mv.piece;
        if (f.outOfCheck === 'block') return { key: 'block', inf: 'tapar l’escac' };
        if (f.outOfCheck === 'king') return { key: 'out', inf: 'sortir de l’escac' };
        if (f.capture) {
            // La captura lliure ja es diu a l'acció; compta com a fet explicat.
            if (f.free && !f.recapture) return { key: 'free', inf: null };
            return null;
        }
        if (f.defend) return { key: 'defend', inf: 'defensar ' + on(f.defend.type, f.defend.sq) };
        if (f.escape) return { key: 'escape', inf: 'posar-' + clitic(type) + ' fora de perill' };
        if (f.attack) return { key: 'attack', inf: 'atacar ' + on(f.attack.type, f.attack.sq) };
        if (f.seventh) return { key: 'seventh', inf: 'entrar a la setena fila' };
        if (f.double) return { key: 'double', inf: f.double.partner === 'r' && type === 'r'
            ? 'doblar les torres a la columna ' + f.double.file : 'formar una bateria a la columna ' + f.double.file };
        if (f.file) return { key: 'file', inf: 'ocupar la columna ' + f.file.file + (f.file.open ? ', que és oberta' : ', que és semioberta') };
        if (f.passed) return { key: 'passed', inf: f.passed.left === 1 ? 'deixar el peó passat a una casella de coronar'
            : 'acostar el peó passat a la coronació' };
        if (f.king) return { key: 'king', inf: 'apuntar al rei ' + SIDE[opp].adj };
        if (f.outpost) return { key: 'outpost', inf: 'instal·lar-' + clitic(type) + ' en un lloc avançat' };
        if (f.castle) return { key: 'castle', inf: 'posar el rei a recer' };
        if (f.luft) return { key: 'luft', inf: 'obrir una sortida al rei' };
        if (f.develop && f.develop.last) return { key: 'develop', inf: 'completar el desenvolupament' };
        if (f.connect) return { key: 'connect', inf: 'connectar les torres' };
        if (f.trade) return { key: 'trade', inf: 'oferir el canvi ' + de(PLURAL[f.trade]) };
        if (f.center) return { key: 'center', inf: f.center === 'occupy' ? (mv.piece === 'p' ? 'guanyar espai al centre' : 'ocupar el centre')
            : 'controlar el centre' };
        if (f.kingActive) return { key: 'king-active', inf: 'activar-lo' };
        return null;
    }
    function perText(p) { return p && p.inf ? ' per ' + p.inf : ''; }
    // Comes dobles o abans d'un punt (per les notes entre comes).
    function tidy(text) { return String(text).replace(/,\s*,/g, ',').replace(/,\s*([.;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim(); }

    // Una jugada llesta per a les plantilles.
    function phrase(step, withPurpose) {
        if (!step) return null;
        const a = actionOf(step);
        const p = withPurpose === false ? null : purposeOf(step);
        return {
            step: step,
            inf: conj(a, 'inf'), pres: conj(a, 'pres'), cond: conj(a, 'cond'), subj: conj(a, 'subj'), past: conj(a, 'past'),
            nom: nominal(step), per: perText(p), purpose: p
        };
    }

    // ------------------------------------------------------------------
    // Temes estratègics de la línia (per al bàndol S)
    // ------------------------------------------------------------------
    function kingZoneAttackers(B, grid, color) {
        const ek = kingOf(grid, other(color));
        if (!ek) return 0;
        return pieces(grid, color).filter(p => p.t !== 'k' && p.t !== 'p')
            .filter(p => B.targets(grid, p.sq).some(sq => cheb(sq, ek) <= 1)).length;
    }
    function materialWord(start, end, S) {
        const opp = other(S);
        const diff = {};
        ['p', 'n', 'b', 'r', 'q'].forEach(t => { diff[t] = (end[S][t] - end[opp][t]) - (start[S][t] - start[opp][t]); });
        const pts = (end[S].pts - end[opp].pts) - (start[S].pts - start[opp].pts);
        const minor = diff.n + diff.b;
        let word = 'material';
        if (diff.r === 1 && minor === -1 && !diff.q) word = 'la qualitat';
        else if (diff.q >= 1 && pts >= 8) word = 'la dama';
        else if (diff.r >= 1 && pts >= 4 && !diff.q) word = 'una torre';
        else if (minor >= 1 && pts >= 2 && !diff.r && !diff.q) word = 'una peça';
        else if (pts === 1) word = 'un peó';
        else if (pts === 2 && diff.p === 2) word = 'dos peons';
        else if (pts === 3 && diff.p === 3) word = 'tres peons';
        return { pts: pts, word: word };
    }
    // La part de la línia que en Grau explica: els temes només en parlen.
    // El material es compara amb el d'abans de la jugada si era una captura
    // (si no, una simple recaptura semblaria un guany).
    function subReading(reading, n, baseGrid) {
        const steps = reading.steps.slice(0, n);
        const last = steps[steps.length - 1];
        const next = reading.steps[n];
        const endGrid = last ? last.grid : reading.startGrid;
        const stable = !!last && (!last.move.captured || !!last.facts.free || !!last.facts.recapture) && !last.move.promotion &&
            !last.check && !(next && next.move.captured);
        // El guany s'ha de mantenir fins al final de tota la línia llegida: una
        // peça penjada a mitja línia no és material guanyat.
        return { fen: reading.fen, steps: steps, startGrid: reading.startGrid, endGrid: endGrid,
            material: { start: material(baseGrid || reading.startGrid), end: material(endGrid), stable: stable,
                full: reading.material.end, fullStable: reading.material.stable } };
    }
    function bandOf(scoreW) {
        if (!scoreW || scoreW.type !== 'cp' || !isNum(scoreW.value)) return null;
        const a = Math.abs(scoreW.value), side = scoreW.value > 0 ? 'w' : 'b';
        if (a < 60) return 'equal';
        if (a < 150) return side + '-slight';
        if (a < 350) return side + '-clear';
        return side + '-decisive';
    }

    // Retorna el millor tema per al bàndol S, o null.
    function themeFor(B, reading, S, ctx) {
        const steps = reading.steps;
        const mine = steps.filter(s => s.color === S);
        const theirs = steps.filter(s => s.color !== S);
        const opp = other(S);
        const band = ctx.band;
        const evalSide = band && band !== 'equal' ? band[0] : null;
        const m = reading.material;
        const gainAt = end => (end[S].pts - end[opp].pts) - (m.start[S].pts - m.start[opp].pts);
        const fullGain = m.full && m.fullStable ? gainAt(m.full) : null;
        // Sense la línia sencera estable, el guany parcial no es dona per bo.
        const gain = m.full ? (fullGain === null ? 0 : (Math.sign(gainAt(m.end)) === Math.sign(fullGain)
            ? Math.sign(fullGain) * Math.min(Math.abs(gainAt(m.end)), Math.abs(fullGain)) : 0)) : gainAt(m.end);
        const found = [];
        const add = (id, score, params) => found.push({ id: id, score: score, side: S, params: params || {} });

        // Material: només amb la línia quieta i sense contradir la valoració.
        if (m.stable && gain >= 1 && evalSide !== opp) {
            const word = materialWord(m.start, m.full && gainAt(m.full) < gainAt(m.end) ? m.full : m.end, S);
            const caps = mine.filter(s => s.facts.capture && !s.facts.recapture)
                .sort((a, b) => VALUE[b.facts.capture.type] - VALUE[a.facts.capture.type]);
            let cause = null, victim = null;
            if (caps.length) {
                const c = caps[0];
                victim = on(c.facts.capture.type, c.facts.capture.sq);
                const prevGrid = c.index > 0 ? steps[c.index - 1].grid : reading.startGrid;
                if (c.facts.free) cause = 'free';
                else if (B.attackers(prevGrid, c.facts.capture.sq, S).length > B.attackers(prevGrid, c.facts.capture.sq, opp).length) cause = 'outnumbered';
            }
            add('material', 100 + gain, { word: word, cause: cause, victim: victim });
        }
        if (m.stable && gain <= -2 && evalSide === S) add('compensation', 90, { word: materialWord(m.end, m.start, S) });

        const attackSteps = mine.filter(s => s.check || s.facts.king).length;
        const z0 = kingZoneAttackers(B, reading.startGrid, S), z1 = kingZoneAttackers(B, reading.endGrid, S);
        if ((attackSteps >= 2 && z1 >= 2) || (z1 - z0 >= 2 && z1 >= 3)) add('attack', 80, { n: z1, n0: z0 });

        const passed = mine.filter(s => s.facts.passed);
        if (passed.length) {
            const last = passed[passed.length - 1];
            add('passed', 75, { sq: last.move.to, left: last.facts.passed.left });
        }
        // Les columnes, si és el que fa la jugada (no si la peça fuig o defensa).
        const fileStep = s => { const p = purposeOf(s); return p && ['seventh', 'double', 'file'].indexOf(p.key) !== -1; };
        const files = mine.filter(fileStep).sort((a, b) => stepScore(b) - stepScore(a))[0];
        if (files) {
            const f = files.facts;
            const kind = f.seventh ? 'seventh' : f.double ? 'double' : 'file';
            add('files', kind === 'seventh' ? 72 : kind === 'double' ? 71 : 70,
                { kind: kind, file: (f.double || f.file || { file: files.move.to[0] }).file, open: !!(f.file && f.file.open) });
        }
        // Pressió sobre una mateixa peça rival.
        const targets = {};
        mine.forEach(s => { if (s.facts.attack) targets[s.facts.attack.sq] = (targets[s.facts.attack.sq] || 0) + 1; });
        const pressured = Object.keys(targets).map(sq => {
            const p = at(reading.endGrid, sq);
            if (!p || p.c !== opp || p.t === 'k') return null;
            const n = B.attackers(reading.endGrid, sq, S).length, d = B.attackers(reading.endGrid, sq, opp).length;
            return (targets[sq] >= 2 || n >= 2) ? { sq: sq, type: p.t, n: n, d: d } : null;
        }).filter(Boolean).sort((a, b) => VALUE[b.type] - VALUE[a.type] || b.n - a.n);
        if (pressured.length) add('pressure', 68, pressured[0]);

        const defensive = s => s.facts.defend || s.facts.escape || s.facts.outOfCheck;
        const active = s => s.check || s.facts.attack || (s.facts.capture && !s.facts.recapture);
        if (theirs.filter(defensive).length >= 2 && mine.some(active)) add('initiative', 66, {});

        const captures = steps.filter(s => s.facts.capture).length + (ctx.moveCaptured ? 1 : 0);
        if (m.stable && captures >= 2 && Math.abs(gain) < 1 && steps.some(s => s.facts.recapture)) {
            const queens = m.start.w.q + m.start.b.q > 0 && m.end.w.q + m.end.b.q === 0;
            const lead = m.end[S].pts - m.end[opp].pts;
            const strong = band && /-(clear|decisive)$/.test(band);
            const mood = queens ? 'queens' : ((evalSide === S && strong) || (lead >= 1 && evalSide !== opp)) ? 'ahead'
                : (evalSide === opp && strong) ? 'behind' : 'equal';
            add('trades', 60, { mood: mood });
        }
        const outpost = mine.find(s => s.facts.outpost);
        if (outpost) add('outpost', 58, { type: outpost.move.piece, sq: outpost.move.to });

        // Maniobra: la mateixa peça es mou dues vegades i guanya activitat.
        for (let i = 0; i < mine.length; i++) {
            const a = mine[i];
            if (a.move.piece === 'p' || a.move.piece === 'k' || a.facts.capture) continue;
            const b = mine.slice(i + 1).find(s => s.move.from === a.move.to && !s.facts.capture);
            if (!b) continue;
            const before = B.targets(a.index > 0 ? steps[a.index - 1].grid : reading.startGrid, a.move.from).length;
            const after = B.targets(b.grid, b.move.to).length;
            if (after > before) add('maneuver', 55, { type: a.move.piece, path: [a.move.from, a.move.to, b.move.to], n0: before, n1: after });
            break;
        }
        if (isNum(ctx.ply) && ctx.ply < 30) {
            const castle = mine.find(s => s.facts.castle);
            const connect = mine.find(s => s.facts.connect);
            const develop = mine.find(s => s.facts.develop);
            if (castle || connect || develop)
                add('development', castle ? 56 : 54, { kind: castle ? 'castle' : connect ? 'connect' : 'develop' });
        }
        const king = mine.find(s => s.facts.kingActive);
        if (king) add('king-active', 52, {});
        const center = mine.find(s => s.facts.center ||
            (s.move.piece === 'p' && s.facts.attack && s.facts.attack.type === 'p' && CENTER.indexOf(s.facts.attack.sq) !== -1));
        if (center) add('center', 50, { lever: center.move.piece === 'p' && !!center.facts.attack && center.facts.attack.type === 'p' });
        if (mine.filter(s => s.facts.defend || s.facts.escape).length >= 2) add('defence', 48, {});
        // Guanyar un temps: S ataca una peça i la jugada següent del rival
        // l'ha d'apartar.
        for (const a of mine) {
            const reply = steps[a.index + 1];
            if (a.facts.attack && VALUE[a.facts.attack.type] >= 3 && reply && reply.color === opp &&
                    reply.move.from === a.facts.attack.sq && !reply.move.captured) {
                add('tempo', 62, { type: a.facts.attack.type, sq: a.facts.attack.sq });
                break;
            }
        }
        const offer = mine.find(s => s.facts.trade);
        if (offer) {
            const strong = band && /-(clear|decisive)$/.test(band);
            add('trade-offer', 47, { type: offer.facts.trade,
                mood: evalSide === S && strong ? 'ahead' : evalSide === opp && strong ? 'behind' : 'equal' });
        }
        // Atacs o captures a la línia sense cap altre tema: hi ha tensió.
        if (steps.some(s => s.facts.attack || s.facts.capture || s.check || s.facts.defend || s.facts.escape)) add('tension', 20, {});
        found.sort((a, b) => b.score - a.score);
        return found[0] || null;
    }

    // ------------------------------------------------------------------
    // Textos de l'Èlia i d'en Grau
    // ------------------------------------------------------------------
    // Preguntes de l'Èlia sobre el que ve. x = { me, opp, Me, Opp, move }.
    const PLAN_QUESTIONS = [
        x => 'Grau, què veu Stockfish per a les properes jugades?',
        x => 'Cap a on va la partida, Grau?',
        x => 'Quin pla tenen ' + x.me + ' a partir d’aquí?',
        x => 'Què diu l’anàlisi de Stockfish, dues jugades endavant?',
        x => 'Grau, com hauria de continuar la partida?',
        x => 'Si mirem dues o tres jugades endavant, què hi veus?',
        x => 'Com haurien de respondre ' + x.opp + ', segons Stockfish?',
        x => 'Quina idea amaga aquesta jugada, Grau?',
        x => 'Grau, fins on arriba aquesta jugada?',
        x => 'Què s’està coent sobre el tauler?',
        x => 'On és la clau de la posició, Grau?',
        x => 'Grau, quin és el pla de fons?',
        x => 'I ara, què prepara Stockfish per a ' + x.me + '?',
        x => 'Grau, què ve ara?'
    ];
    // Lectura en solitari (sense duet): la jugada i una entrada.
    const SOLO_LEADS = ['Mirem què preveu Stockfish.', 'Anem dues jugades endavant.', 'Vegem la línia de Stockfish.',
        'Mirem una mica més enllà.', 'Què hi veu Stockfish?'];
    // Segona pregunta de l'Èlia: la lògica. S = bàndol del pla.
    const WHY_QUESTIONS = [
        x => 'I quina és la idea de fons?',
        x => 'I per què aquest camí?',
        x => 'Quina lògica hi ha darrere?',
        x => 'I què hi guanyen ' + x.S + '?',
        x => 'On és la clau, doncs?',
        x => 'I tot plegat, cap a on porta?',
        x => 'Què busquen ' + x.S + ', exactament?',
        x => 'I això per què és important?',
        x => 'Grau, explica’ns la lògica.',
        x => 'I quin és l’objectiu?'
    ];
    const THEN = ['Llavors', 'Aleshores', 'Tot seguit', 'A continuació'];

    // Narració de la línia (en Grau). x.R1, x.M1... són frases de jugada.
    const LINE_OPENERS = [
        x => 'Stockfish espera que ' + x.opp + ' ' + x.R1.subj + x.R1.per + '. ' + x.then + ', ' + x.me + ' ' + x.M1.cond + x.M1.per + '.',
        x => 'Si ' + x.opp + ' ' + x.R1.pres + x.R1.per + ', com proposa Stockfish, ' + x.me + ' ' + x.M1.cond + x.M1.per + '.',
        x => 'Segons Stockfish, la millor resposta ' + de(x.opp) + ' és ' + x.R1.inf + x.R1.per + '. ' + x.then + ', ' + x.me + ' ' + x.M1.cond + x.M1.per + '.',
        x => 'Primer, ' + x.opp + ' ' + x.R1.cond + x.R1.per + '; després, ' + x.me + ' ' + x.M1.cond + x.M1.per + '.',
        x => 'La línia de Stockfish és clara: ' + x.opp + ' ' + x.R1.pres + x.R1.per + ' i ' + x.me + ' ' + x.M1.pres + x.M1.per + '.',
        x => 'Mirant dues jugades endavant, Stockfish veu que ' + x.opp + ' ' + x.R1.pres + x.R1.per + ' i que ' + x.me + ' ' + x.M1.pres + x.M1.per + '.',
        x => 'Stockfish proposa per a ' + x.opp + ' ' + x.R1.inf + x.R1.per + '. I la resposta ' + de(x.me) + ' seria ' + x.M1.inf + x.M1.per + '.',
        x => 'El més probable, segons Stockfish, és que ' + x.opp + ' ' + x.R1.subj + x.R1.per + '. ' + x.then + ', ' + x.me + ' ' + x.M1.cond + x.M1.per + '.'
    ];
    // Per als avançats, de tant en tant, la profunditat de l'anàlisi.
    const DEPTH_OPENER = x => 'Stockfish, a profunditat ' + x.depth + ', espera que ' + x.opp + ' ' + x.R1.subj + x.R1.per + '. ' +
        x.then + ', ' + x.me + ' ' + x.M1.cond + x.M1.per + '.';
    const LINE_SECOND = [
        x => ' Després, ' + x.opp + ' ' + x.R2.cond + x.R2.per + ' i ' + x.me + ' ' + x.M2.cond + x.M2.per + '.',
        x => ' La línia continua: ' + x.opp + ' ' + x.R2.pres + x.R2.per + ' i ' + x.me + ' ' + x.M2.pres + x.M2.per + '.',
        x => ' Més endavant, quan ' + x.opp + ' ' + x.R2.subj + x.R2.per + ', ' + x.me + ' ' + x.M2.cond + x.M2.per + '.',
        x => ' A la jugada següent, després que ' + x.opp + ' ' + x.R2.subj + x.R2.per + ', ' + x.me + ' ' + x.M2.cond + x.M2.per + '.'
    ];
    // Segona parella compacta: la resposta rival, només amb el nom.
    const LINE_COMPACT = [
        x => ' Després ' + de(x.R2.nom) + ', ' + x.me + ' ' + x.M2.cond + x.M2.per + '.',
        x => ' Si ' + x.opp + ' ' + x.R2.pres + ', ' + x.me + ' ' + x.M2.cond + x.M2.per + '.',
        x => ' I, després ' + de(x.R2.nom) + ', ' + x.me + ' ' + x.M2.cond + x.M2.per + '.'
    ];
    const LINE_THIRD = [
        x => ' I, una jugada més enllà, ' + x.me + ' ' + x.M3.cond + x.M3.per + '.',
        x => ' Al final de la línia, ' + x.me + ' ' + x.M3.cond + x.M3.per + '.'
    ];

    // Lògica estratègica per tema. p = paràmetres del tema i bàndols:
    // S/s (bàndol del pla, amb majúscula o no), Opp/opp (l'altre) i oppAdj.
    const THEME_TEXTS = {
        material: [
            p => 'Al final de la línia, ' + p.s + ' guanyen ' + p.word + p.because + '.',
            p => 'La clau és material: si tot va així, ' + p.s + ' es queden amb ' + p.word + ' de més' + p.because + '.',
            p => 'Stockfish hi veu un guany net per a ' + p.s + ': ' + p.word + ' de més' + p.because + '.',
            p => 'És una qüestió de comptes: ' + p.s + ' acaben amb ' + p.word + ' de més' + p.because + '.'
        ],
        compensation: [
            p => p.S + ' cedeixen ' + p.word + ', però Stockfish creu que l’activitat de les peces ho compensa.',
            p => 'És un sacrifici: ' + p.s + ' donen ' + p.word + ' a canvi d’iniciativa, i Stockfish continua veient-les millor.',
            p => 'El material no ho és tot. ' + p.S + ' perden ' + p.word + ', però la posició, segons Stockfish, les afavoreix.',
            p => 'Stockfish accepta perdre ' + p.word + ': a canvi, ' + p.s + ' tenen les peces més actives.'
        ],
        attack: [
            p => p.S + ' sumen peces a l’atac: al final de la línia, ' + p.nWord + ' peces apunten a les caselles del voltant del rei ' + p.oppAdj + '.',
            p => 'El rei ' + p.oppAdj + ' és l’objectiu. Cada jugada ' + de(p.s) + ' hi acosta una peça més.',
            p => 'És un pla d’atac: ' + p.s + ' juguen contra el rei, i ' + p.opp + ' hauran de defensar-se amb precisió.',
            p => 'Quan les peces s’apilen al voltant del rei, els escacs i les amenaces arriben sols. Al final de la línia, en són ' + p.nWord + '.'
        ],
        passed: [
            p => 'Tot gira al voltant del peó passat: a ' + p.sq + (p.left === 1 ? ' només li falta una casella' : ' li falten ' + numWord(p.left, true) + ' caselles') + ' per coronar.',
            p => 'Un peó passat és un candidat a dama: cada pas endavant obliga ' + p.opp + ' a dedicar-li més peces.',
            p => p.S + ' empenyen el peó passat. Com més avança, més peces rivals queden lligades a aturar-lo.',
            p => 'El peó ' + deSq(p.sq) + ' marca el ritme: ' + p.opp + ' l’han de vigilar mentre ' + p.s + ' el fan avançar.'
        ],
        'files-file': [
            p => 'El pla és dominar la columna ' + p.file + ': una columna ' + (p.open ? 'oberta' : 'semioberta') + ' és el camí natural de les torres cap al camp rival.',
            p => 'Qui controla la columna ' + p.file + ' pot entrar al camp contrari. Per això ' + p.s + ' hi porten les peces majors.',
            p => 'Les torres volen columnes sense peons propis al davant, i la columna ' + p.file + ' n’és una.',
            p => 'La columna ' + p.file + ' és la porta d’entrada: ' + p.s + ' la volen controlar abans que ' + p.opp + '.'
        ],
        'files-double': [
            p => 'Dues peces majors a la mateixa columna multipliquen la força: és la bateria ' + de(p.s) + ' a la columna ' + p.file + '.',
            p => 'Doblar les peces majors a la columna ' + p.file + ' vol dir pressionar-la amb el doble de força.',
            p => 'Una peça major sola pressiona; dues, alineades a la columna ' + p.file + ', poden trencar la defensa.'
        ],
        'files-seventh': [
            p => 'La setena fila és el gran objectiu de les peces majors: des d’allà acostumen a atacar els peons pel costat i a tancar el rei.',
            p => 'Una peça major a la setena fila sol ser un mal de cap: hi ha peons per atacar i el rei hi queda més tancat.',
            p => 'Entrar a la setena fila és un clàssic dels escacs: és on les torres i la dama fan més mal.'
        ],
        pressure: [
            p => 'L’objectiu és ' + p.target + ': al final de la línia, l’ataquen ' + p.nWord + ' peces ' + p.defClause + '.',
            p => p.S + ' concentren el foc sobre ' + p.target + '. És una qüestió de números: ' + p.nMasc + ' atacants contra ' + p.dMasc + '.',
            p => 'Tot el pla gira al voltant ' + de(p.target) + ': com més peces l’ataquen, més difícil és mantenir-' + p.clitic + '.'
        ],
        initiative: [
            p => p.S + ' porten la iniciativa: plantegen amenaces i ' + p.opp + ' van responent, sense temps per als seus plans.',
            p => 'Qui ataca marca el ritme, i aquí són ' + p.s + ': ' + p.opp + ' es limiten a defensar-se.',
            p => 'Fixem-nos que ' + p.opp + ' només reaccionen. La iniciativa és ' + de(p.s) + '.',
            p => 'Cada jugada ' + de(p.s) + ' obliga ' + p.opp + ' a respondre. Això és tenir la iniciativa.'
        ],
        'trades-ahead': [
            p => 'Qui va per davant busca canvis: amb menys peces sobre el tauler, l’avantatge ' + de(p.s) + ' pesa més.',
            p => p.S + ' simplifiquen. Amb avantatge, cada canvi acosta la partida a un final favorable.',
            p => 'Canviar peces quan es va per davant és de manual: el rival té menys recursos per complicar-ho.'
        ],
        'trades-equal': [
            p => 'Els canvis simplifiquen la posició: amb menys peces, cada detall, com el rei o els peons, compta més.',
            p => 'Després dels canvis, la partida s’acosta al final, i l’estructura de peons hi tindrà molt a dir.',
            p => 'Canvi rere canvi, la posició es buida. Ara comptaran les peces que quedin més ben situades.'
        ],
        'trades-behind': [
            p => 'Els canvis alleugen la pressió sobre ' + p.s + ': menys peces rivals vol dir menys perill.',
            p => 'Quan es pateix, canviar peces ajuda: ' + p.s + ' es treuen de sobre els atacants.',
            p => 'Per a qui defensa, cada canvi és un respir: ' + p.opp + ' tenen menys peces per atacar.'
        ],
        'trades-queens': [
            p => 'Sense dames, la partida canvia de caràcter: el rei ja no corre tant de perill i pot entrar en joc.',
            p => 'Amb el canvi de dames, l’atac perd força i guanya pes el final: el rei, els peons i les peces menors.',
            p => 'Fora les dames! Ara mana l’estructura de peons i l’activitat de les peces que queden.'
        ],
        outpost: [
            p => capFirst(np(p.type)) + ' busca ' + p.sq + ': és un lloc avançat on cap peó rival no ' + pronoun(p.type) + ' pot fer fora.',
            p => 'Una peça a ' + p.sq + ', protegida per un peó i sense peons rivals que la puguin expulsar, és molt forta.',
            p => 'Des ' + deSq(p.sq) + ', ' + np(p.type) + ' controla el camp rival, i cap peó no ' + pronoun(p.type) + ' pot molestar.'
        ],
        maneuver: [
            p => 'És una maniobra: ' + np(p.type) + ' passa per ' + p.path[1] + ' per arribar a ' + p.path[2] + ', on controla ' + numWord(p.n1, true) + ' caselles; a ' + p.path[0] + ' en controlava ' + numWord(p.n0, true) + '.',
            p => capFirst(np(p.type)) + ' canvia de lloc dues vegades, ' + deSq(p.path[0]) + ' a ' + p.path[1] + ' i d’allà a ' + p.path[2] + '. Busca una casella més activa.',
            p => 'Les maniobres també són estratègia: ' + np(p.type) + ' fa el camí ' + p.path[0] + ', ' + p.path[1] + ', ' + p.path[2] + ' per guanyar activitat.'
        ],
        development: [
            p => 'Encara som a l’obertura: ' + p.s + ' volen totes les peces en joc i el rei a recer abans d’obrir la lluita.',
            p => 'Primer, les peces a lloc. Una peça que no ha sortit de casa és una peça que no juga.',
            p => p.kind === 'castle' ? 'L’enroc és prioritari: amb el rei al centre, obrir línies seria perillós.'
                : 'Desenvolupar abans d’atacar: és la primera llei de l’obertura.',
            p => p.kind === 'connect' ? 'Amb les torres connectades, el desenvolupament ' + de(p.s) + ' queda complet.'
                : 'Cada temps compta a l’obertura: qui acaba abans el desenvolupament pren la iniciativa.'
        ],
        center: [
            p => 'La batalla és pel centre: qui el domina té més espai i les peces es mouen amb més llibertat.',
            p => p.S + ' reforcen el centre. Des d’allà, les peces arriben ràpidament a tots dos flancs.',
            p => p.lever ? 'És una ruptura: el peó desafia el centre rival per obrir línies.'
                : 'El centre és el cor del tauler, i ' + p.s + ' el volen controlar abans de passar a l’acció.'
        ],
        'king-active': [
            p => 'En el final, el rei deixa de ser un problema i esdevé una peça d’atac: s’acosta al centre per donar suport als peons.',
            p => 'Amb poques peces sobre el tauler, el rei ha de jugar. ' + p.S + ' l’activen cap al centre.',
            p => 'Als finals, qui té el rei més actiu sol manar: des del centre arriba abans a tots dos flancs.',
            p => 'És una cursa de reis: el que arribi primer als peons rivals decidirà molt.'
        ],
        defence: [
            p => p.S + ' han de consolidar: primer defensen el que està atacat, i només després podran pensar a atacar.',
            p => 'És un moment defensiu per a ' + p.s + '. Stockfish prioritza la solidesa abans que l’activitat.',
            p => 'Defensar bé també és jugar bé: ' + p.s + ' tapen els forats abans de buscar res més.'
        ],
        tempo: [
            p => p.S + ' guanyen un temps: ataquen ' + on(p.type, p.sq) + ' i ' + p.opp + ' han de gastar la jugada a apartar-' + clitic(p.type) + '.',
            p => 'Atacar ' + on(p.type, p.sq) + ' no és només una amenaça: obliga ' + p.opp + ' a moure-' + clitic(p.type) + ', i ' + p.s + ' guanyen una jugada per al seu pla.',
            p => 'És una jugada amb temps: mentre ' + p.opp + ' salven ' + np(p.type) + ', ' + p.s + ' avancen en el seu pla.',
            p => 'En escacs, el temps també és material: cada jugada que el rival gasta a fugir és una jugada guanyada per a ' + p.s + '.'
        ],
        'trade-offer-ahead': [
            p => 'Amb avantatge, ' + p.s + ' ofereixen canvis: cada peça que surt del tauler acosta un final favorable.',
            p => p.S + ' ofereixen el canvi ' + de(PLURAL[p.type]) + '. Qui va per davant vol simplificar.'
        ],
        'trade-offer-equal': [
            p => 'Si ' + p.opp + ' accepten el canvi ' + de(PLURAL[p.type]) + ', la posició se simplifica; si no, hauran de cedir la casella.',
            p => 'Oferir el canvi ' + de(PLURAL[p.type]) + ' és una pregunta al rival: canviar o retirar-se.',
            p => 'Un canvi ofert obliga a decidir: ' + p.opp + ' han de canviar o deixar a ' + p.s + ' la casella.'
        ],
        'trade-offer-behind': [
            p => p.S + ' ofereixen el canvi ' + de(PLURAL[p.type]) + ': amb menys peces rivals actives, la defensa és més senzilla.',
            p => 'Quan es pateix, canviar peces ajuda. Per això ' + p.s + ' ofereixen el canvi ' + de(PLURAL[p.type]) + '.'
        ],
        tension: [
            p => 'Aquí mana el càlcul concret: cada jugada canvia l’equilibri de la posició.',
            p => 'La posició té tensió: hi ha peces en contacte, i cada jugada ho ha de tenir en compte.',
            p => 'És un estira-i-arronsa: amenaça, resposta i una nova amenaça. Qui s’equivoqui primer ho pagarà.',
            p => 'Hi ha moltes peces en contacte. En posicions així, calcular bé val més que qualsevol pla general.'
        ],
        quiet: [
            p => 'Són jugades de maniobra: ningú no força res, i cada bàndol busca les millors caselles per a les peces.',
            p => 'Una fase tranquil·la. Stockfish recol·loca les peces sense pressa, a l’espera del moment oportú.',
            p => 'No hi ha cap cop immediat: la lluita és posicional, de caselles i de peces ben situades.'
        ]
    };
    const CAUSES = {
        free: v => ', perquè ' + v + ' queda sense defensa',
        outnumbered: v => ', perquè ' + v + ' té més atacants que defensors'
    };
    // Valoració final de la línia (punt de vista blanc → bàndol).
    const EVAL_TEXTS = {
        equal: [() => 'Per a Stockfish, la posició queda equilibrada.', () => 'Tot i així, Stockfish ho veu equilibrat.',
            () => 'Stockfish no hi veu cap avantatge clar.', () => 'La balança, de moment, queda equilibrada.',
            () => 'Ara com ara, cap bàndol no en surt clarament millor.'],
        slight: [x => 'Stockfish hi dona un lleuger avantatge a ' + x.who + x.pawns + '.',
            x => 'Al final de la línia, ' + x.who + ' estan una mica millor, segons Stockfish' + x.pawns + '.',
            x => 'La balança s’inclina lleugerament cap a ' + x.who + x.pawns + '.'],
        clear: [x => 'Stockfish veu ' + x.who + ' clarament millor' + x.pawns + '.',
            x => 'El balanç de Stockfish: avantatge clar per a ' + x.who + x.pawns + '.',
            x => 'La valoració és clara: ' + x.who + ' estan millor' + x.pawns + '.'],
        decisive: [x => 'Per a Stockfish, ' + x.who + ' ja tenen una posició guanyadora' + x.pawns + '.',
            x => 'A hores d’ara, ' + x.who + ' tenen la partida a la mà' + x.pawns + '.']
    };

    // Seguiment: s'ha complert la previsió.
    const HIT_QUESTIONS = [
        x => 'Grau, és la jugada que anunciaves?',
        x => 'Això ja ho havies vist venir, oi, Grau?',
        x => 'Es compleix la previsió de Stockfish?',
        x => 'És el pla que explicaves fa un moment?',
        x => 'Grau, la partida va pel camí que deies?',
        x => 'Tal com havies dit, oi?'
    ];
    const HIT_OPENERS = [
        x => 'Exacte. ',
        x => 'Sí, tal com preveia Stockfish ' + x.ago + '. ',
        x => 'Ho anunciava Stockfish ' + x.ago + ': ',
        x => 'Sí, és la línia prevista. ',
        x => 'Efectivament. '
    ];
    const HIT_SOLO = [
        x => 'Es compleix la previsió de Stockfish.',
        x => 'Tal com s’havia anunciat ' + x.ago + '.',
        x => 'És la jugada que preveia Stockfish.'
    ];
    // Seguiment: un bàndol se surt de la línia.
    const MISS_QUESTIONS = [
        x => 'Grau, això no és el que esperava Stockfish, oi?',
        x => 'Canvi de guió, Grau?',
        x => capFirst(x.side) + ' se surten de la línia prevista. Què en penses, Grau?',
        x => 'No era aquesta la jugada que preveia Stockfish?',
        x => 'Sorpresa, Grau?'
    ];
    const MISS_ANSWERS = [
        x => 'No. Stockfish esperava que ' + x.side + ' ' + x.expectedPast + '.',
        x => capFirst(x.side) + ' trien un altre camí: Stockfish proposava ' + x.expected + '.',
        x => 'És una desviació: la línia de Stockfish passava ' + per(x.expectedNom) + '.'
    ];
    const MISS_SOLO = [
        x => capFirst(x.side) + ' se surten de la línia que preveia Stockfish.',
        x => 'No és la jugada que esperava Stockfish.'
    ];
    const MISS_ASSESS = {
        equal: [x => 'Per a Stockfish, és pràcticament igual de bona.', x => 'La valoració gairebé no canvia.',
            x => 'No passa res: és una alternativa equivalent.'],
        slight: [x => 'La valoració empitjora una mica per a ' + x.side + '.', x => 'Stockfish la considera una mica més imprecisa.'],
        clear: [x => 'I surt cara: segons Stockfish, la posició ' + de(x.side) + ' empitjora clarament' + x.pawns + '.',
            x => 'Stockfish hi veu una imprecisió clara' + x.pawns + '.']
    };
    // Continuació d'un fil de conflicte: la línia hi torna.
    const TAIL_TEXTS = {
        attack: [x => 'Però Stockfish preveu que ' + x.S + ' hi tornin amb ' + x.nom + '.',
            x => 'La pressió continuarà: Stockfish proposa per a ' + x.S + ' ' + x.inf + '.'],
        capture: [x => 'I Stockfish ja hi veu la captura: ' + x.inf + '.'],
        defend: [x => 'Stockfish preveu que ' + x.S + ' ' + x.pron + ' reforcin amb ' + x.nom + '.']
    };
    const NEXT_TEXTS = [
        x => ' Ara, Stockfish espera que ' + x.opp + ' ' + x.R1.subj + x.R1.per + '.',
        x => ' I la línia continua: ' + x.opp + ' ' + x.R1.cond + x.R1.per + '.'
    ];

    // ------------------------------------------------------------------
    // Memòria i varietat
    // ------------------------------------------------------------------
    function emptyMemory() {
        return { lastPlanPly: -100, lastColor: null, plans: 0, forecast: null, recent: {}, lastBand: null,
            lastMissPly: -100, lastFollowPly: -100 };
    }
    function normalize(m) {
        const base = emptyMemory();
        if (!m || typeof m !== 'object') return base;
        const out = Object.assign(base, m);
        out.recent = Object.assign({}, m.recent || {});
        out.forecast = m.forecast ? JSON.parse(JSON.stringify(m.forecast)) : null;
        return out;
    }
    // Tria una variant que no s'hagi dit fa poc dins de la mateixa família.
    function pick(mem, family, list, seed, accept) {
        const recent = mem.recent[family] || [];
        const keep = Math.min(3, Math.max(0, list.length - 1));
        const start = ((seed % list.length) + list.length) % list.length;
        let chosen = -1;
        for (let pass = 0; pass < 2 && chosen < 0; pass++) {
            for (let i = 0; i < list.length; i++) {
                const id = (start + i) % list.length;
                if (pass === 0 && recent.slice(0, keep).indexOf(id) !== -1) continue;
                if (accept && !accept(id)) continue;
                chosen = id;
                break;
            }
        }
        if (chosen < 0) chosen = start;
        mem.recent[family] = [chosen].concat(recent.filter(id => id !== chosen)).slice(0, 3);
        return chosen;
    }
    function agoText(plies) {
        const moves = Math.max(1, Math.ceil(plies / 2));
        return moves === 1 ? 'fa una jugada' : 'fa ' + numWord(moves, true) + ' jugades';
    }
    function pawnsText(cp) { return (Math.round(Math.abs(cp) / 10) / 10).toFixed(1).replace('.', ','); }

    // Línia SAN numerada per a la pantalla: «14…Cf6 15.Te1 O-O».
    function sanLine(fen, steps) {
        const parts = String(fen || '').split(' ');
        let num = parseInt(parts[5], 10) || 1;
        let out = '';
        steps.forEach((s, i) => {
            if (s.color === 'w') out += (out ? ' ' : '') + num + '.' + s.move.san;
            else {
                out += (i === 0 ? num + '…' : ' ') + s.move.san;
                num++;
            }
        });
        return out;
    }

    // ------------------------------------------------------------------
    // Pla: la pregunta de l'Èlia i la lectura d'en Grau
    // ------------------------------------------------------------------
    // ctx = { ChessCtor, fenAfter, move, prevMove, after, ply, tier, gameId,
    //         moveText (descripció breu de la jugada), prepared, end }
    function eligible(ctx) {
        const c = ctx || {};
        const a = c.after;
        if (!c.move || !c.ChessCtor || !c.fenAfter || c.prepared || c.end || !Number.isInteger(c.ply)) return false;
        if (!a || !a.reliable || !isNum(a.depth) || a.depth < CONFIG.MIN_DEPTH || a.fen !== c.fenAfter) return false;
        if (!a.best || a.best.type !== 'cp' || !isNum(a.best.value) || Math.abs(a.best.value) >= CONFIG.DECIDED_CP) return false;
        return Array.isArray(a.pv) && a.pv.length >= CONFIG.MIN_PLIES;
    }

    function plan(ctx, memory) {
        const c = ctx || {};
        const mem = normalize(memory);
        if (!eligible(c)) return null;
        const me = c.move.color, opp = other(me);
        const gap = c.ply - mem.lastPlanPly;
        if (gap < (mem.lastColor === me ? CONFIG.SAME_SIDE_GAP_PLIES : CONFIG.GAP_PLIES)) return null;
        const B = board();
        const reading = readLine(c.ChessCtor, c.fenAfter, c.after.pv, { prev: c.move });
        if (!B || !reading || reading.steps.length < CONFIG.MIN_PLIES) return null;
        const steps = reading.steps;
        if (steps.slice(0, 2).some(s => s.mate)) return null;
        const tier = ['basic', 'mid', 'advanced'].indexOf(c.tier) !== -1 ? c.tier : 'mid';
        const band = bandOf(c.after.best);
        const seed = hash((c.gameId || '') + ':' + c.ply + ':' + mem.plans);
        const names = { me: SIDE[me].pl, opp: SIDE[opp].pl, Me: SIDE[me].Pl, Opp: SIDE[opp].Pl };

        // --- Narració de la línia, amb pressupost de paraules ---
        const R1 = phrase(steps[0]), M1 = phrase(steps[1]);
        const R2 = phrase(steps[2]), M2 = phrase(steps[3]);
        const M3 = phrase(steps[5]);
        if (!R1 || !M1) return null;
        const openerId = pick(mem, 'opener', LINE_OPENERS, seed);
        const thenWord = THEN[(seed >> 3) % THEN.length];
        const useDepth = tier === 'advanced' && mem.plans % 3 === 1;
        const base = Object.assign({}, names, { then: thenWord, depth: c.after.depth });
        // Dues frases seguides no comencen igual («després… Després…»).
        const secondId = R2 && M2 ? pick(mem, 'second', LINE_SECOND, seed >> 2,
            id => !((openerId === 3 && id === 0) || (openerId === 4 && id === 1))) : 0;
        const thirdId = M3 ? pick(mem, 'third', LINE_THIRD, seed >> 4) : 0;
        const compactId = R2 && M2 ? pick(mem, 'compact', LINE_COMPACT, seed >> 9,
            id => !(openerId === 1 && id === 1)) : 0;
        const bare = p => p ? Object.assign({}, p, { per: '', purpose: null }) : p;
        const opener = x => useDepth ? DEPTH_OPENER(x) : LINE_OPENERS[openerId](x);
        // De més a menys complet: es queda la primera que cap.
        const configs = [];
        const wantSecond = tier !== 'basic' && R2 && M2;
        const wantThird = tier === 'advanced' && M3 && stepScore(steps[5]) >= 40;
        if (wantSecond && wantThird) configs.push({ R1: R1, M1: M1, R2: R2, M2: M2, M3: M3, n: 6 });
        if (wantSecond) configs.push({ R1: R1, M1: M1, R2: R2, M2: M2, n: 4 },
            { R1: R1, M1: M1, R2: bare(R2), M2: M2, n: 4, compact: true },
            { R1: bare(R1), M1: M1, R2: bare(R2), M2: M2, n: 4, compact: true },
            { R1: bare(R1), M1: bare(M1), R2: bare(R2), M2: M2, n: 4, compact: true });
        configs.push({ R1: R1, M1: M1, n: 2 }, { R1: bare(R1), M1: M1, n: 2 }, { R1: bare(R1), M1: bare(M1), n: 2 });
        let line = null, narrated = 2, said = [];
        for (const cfg of configs) {
            const x = Object.assign({}, base, cfg);
            let text = opener(x);
            if (cfg.n >= 4) text += cfg.compact ? LINE_COMPACT[compactId](x) : LINE_SECOND[secondId](x);
            if (cfg.n >= 6) text += LINE_THIRD[thirdId](x);
            if (wordCount(text) <= CONFIG.LINE_WORDS[tier]) {
                line = tidy(text);
                narrated = cfg.n;
                said = [cfg.R1, cfg.M1, cfg.R2, cfg.M2, null, cfg.M3].filter(ph => ph && ph.purpose);
                break;
            }
        }
        if (!line) return null;

        // --- Tema: només amb les jugades que s'han explicat ---
        const told = steps.slice(0, narrated);
        const baseGrid = c.move.captured && c.fenBefore ? B.parse(c.fenBefore) : null;
        const sub = subReading(reading, narrated, baseGrid);
        const themeCtx = { band: band, ply: c.ply, moveCaptured: !!c.move.captured };
        const mineTheme = themeFor(B, sub, me, themeCtx);
        const theirTheme = themeFor(B, sub, opp, themeCtx);
        const theme = (theirTheme && (!mineTheme || theirTheme.score > mineTheme.score)) ? theirTheme
            : (mineTheme || { id: 'quiet', score: 10, side: me, params: {} });
        // Una llista de jugades sense cap motiu ni cap tema no explica res.
        if (!said.length && theme.id === 'quiet') return null;
        if (said.length < 2 && theme.id === 'quiet' && tier !== 'basic') return null;
        const S = theme.side;

        // --- Lògica estratègica i valoració ---
        const p = Object.assign({}, theme.params, { S: SIDE[S].Pl, s: SIDE[S].pl, Opp: SIDE[other(S)].Pl, opp: SIDE[other(S)].pl,
            oppAdj: SIDE[other(S)].adj });
        let family = theme.id;
        if (theme.id === 'files') family = 'files-' + theme.params.kind;
        if (theme.id === 'trades') family = 'trades-' + theme.params.mood;
        if (theme.id === 'trade-offer') family = 'trade-offer-' + theme.params.mood;
        if (theme.id === 'material') {
            p.word = theme.params.word.word;
            p.because = theme.params.cause && theme.params.victim ? CAUSES[theme.params.cause](theme.params.victim) : '';
        }
        if (theme.id === 'compensation') p.word = theme.params.word.word;
        if (theme.id === 'attack') p.nWord = numWord(theme.params.n, true);
        if (theme.id === 'pressure') {
            const t = theme.params;
            p.target = on(t.type, t.sq);
            p.clitic = clitic(t.type);
            p.nWord = numWord(t.n, true);
            p.nMasc = numWord(t.n, false);
            p.defClause = t.d ? 'i ' + pronoun(t.type) + ' defensen ' + numWord(t.d, true) : 'i ningú no ' + pronoun(t.type) + ' defensa';
            p.dMasc = t.d ? numWord(t.d, false) + (t.d === 1 ? ' defensor' : ' defensors') : 'cap defensor';
        }
        const list = THEME_TEXTS[family] || THEME_TEXTS.quiet;
        const attackAccept = theme.id === 'attack' && theme.params.n <= theme.params.n0 ? (id => id !== 1) : null;
        const logic = list[pick(mem, family, list, seed >> 1, attackAccept)](p);
        let evalText = '';
        if (band) {
            const showEval = tier === 'advanced' || band !== mem.lastBand ||
                ['material', 'compensation', 'trades'].indexOf(theme.id) !== -1;
            if (showEval && !(tier === 'basic' && band === 'equal' && mem.lastBand === null)) {
                const level = band === 'equal' ? 'equal' : band.slice(2);
                const who = band === 'equal' ? '' : SIDE[band[0]].pl;
                const pawns = tier === 'advanced' && band !== 'equal' ? ' (uns ' + pawnsText(c.after.best.value) + ' peons)' : '';
                const evals = EVAL_TEXTS[level];
                // Si ja s'ha anomenat Stockfish dues vegades, la valoració no ho repeteix.
                const busy = ((line + ' ' + logic).match(/Stockfish/g) || []).length >= 2;
                const sample = i => evals[i]({ who: who, pawns: pawns });
                const plain = evals.map((fn, i) => i).filter(i => !/Stockfish/.test(sample(i)));
                // Tampoc no repeteix «Al final de la línia» si la lògica ja ho diu.
                const echo = i => /Al final de la línia/.test(logic) && /Al final de la línia/.test(sample(i));
                const accept = id => !echo(id) && (!busy || !plain.length || plain.indexOf(id) !== -1);
                evalText = evals[pick(mem, 'eval-' + level, evals, seed >> 5, accept)]({ who: who, pawns: pawns });
            }
        }

        // --- Torns ---
        const qId = pick(mem, 'question', PLAN_QUESTIONS, seed >> 6);
        const question = PLAN_QUESTIONS[qId](names);
        // L'Èlia sempre diu primer la jugada (o el fet que s'hi ha vist): qui
        // només escolta ha de saber de quina jugada es parla.
        const moveText = String(c.moveText || '').trim();
        const q1 = moveText ? moveText + ' ' + question : question;
        const solo = (moveText ? moveText + ' ' : '') + SOLO_LEADS[pick(mem, 'solo', SOLO_LEADS, seed >> 7)];
        const max = CONFIG.MAX_WORDS[tier];
        const logicFull = logic + (evalText ? ' ' + evalText : '');
        const ask = { role: 'presenter', text: q1, solo: solo };
        const grau = text => ({ role: 'analyst', text: text });
        const options = [];
        if (tier !== 'basic' && theme.id !== 'quiet') {
            // «Què hi guanyen?» només quan el tema és un guany concret.
            const gainy = ['material', 'compensation', 'files', 'pressure', 'outpost', 'passed', 'attack', 'tempo'].indexOf(theme.id) !== -1;
            const why = { role: 'presenter', text: WHY_QUESTIONS[pick(mem, 'why', WHY_QUESTIONS, seed >> 8, id => gainy || id !== 3)]({ S: SIDE[S].pl }) };
            options.push([ask, grau(line), why, grau(logicFull)], [ask, grau(line), why, grau(logic)]);
        }
        // Sense la segona pregunta, en Grau parla en dos torns: la línia i la lògica.
        options.push([ask, grau(line), grau(logicFull)], [ask, grau(line), grau(logic)]);
        if (evalText) options.push([ask, grau(line + ' ' + evalText)]);
        options.push([ask, grau(line)]);
        const turns = options.find(list => wordCount(list.map(t => t.text).join(' ')) <= max) || null;
        if (!turns) return null;

        // --- Previsió per al seguiment: la jugada clau ja dita del bàndol S ---
        const ofS = told.filter(s => s.color === S);
        const key = ofS.slice().sort((a, b) => stepScore(b) - stepScore(a) || a.index - b.index)[0] || told[1];
        mem.forecast = { ply: c.ply, color: me, side: S, line: told.map(s => s.uci), keyIndex: key.index,
            theme: theme.id, matched: 0 };
        mem.lastPlanPly = c.ply;
        mem.lastColor = me;
        mem.plans += 1;
        if (band) mem.lastBand = band;
        return {
            kind: 'plan', theme: theme.id, side: S, turns: turns,
            forecast: { from: c.ply + 1, san: sanLine(c.fenAfter, told), uci: told.map(s => s.uci) },
            memory: mem
        };
    }

    // ------------------------------------------------------------------
    // Seguiment de la previsió (a cada semijugada)
    // ------------------------------------------------------------------
    function track(ctx, memory) {
        const c = ctx || {};
        const mem = normalize(memory);
        const f = mem.forecast;
        if (!f || !c.move || !Number.isInteger(c.ply)) return { event: null, memory: mem };
        const idx = c.ply - f.ply - 1;
        if (idx < 0 || idx >= f.line.length || f.matched !== idx) { mem.forecast = null; return { event: null, memory: mem }; }
        if (moveUci(c.move) === f.line[idx]) {
            f.matched = idx + 1;
            if (idx === f.keyIndex) {
                mem.forecast = null;
                return { event: { kind: 'hit', ply: f.ply, index: idx, side: f.side, theme: f.theme }, memory: mem };
            }
            if (f.matched >= f.line.length) mem.forecast = null;
            return { event: null, memory: mem };
        }
        mem.forecast = null;
        if (idx > f.keyIndex) return { event: null, memory: mem };
        return { event: { kind: 'miss', ply: f.ply, index: idx, expected: f.line[idx], side: c.move.color }, memory: mem };
    }

    // Diàleg de seguiment: encert o desviació. ctx com a plan(), amb
    // fenBefore i les anàlisis before/after de la jugada actual.
    function follow(ctx, event, memory) {
        const c = ctx || {};
        const mem = normalize(memory);
        const B = board();
        if (!event || !B || !c.move || !c.ChessCtor || !c.fenBefore || !Number.isInteger(c.ply)) return null;
        const seed = hash((c.gameId || '') + ':follow:' + c.ply);
        const side = SIDE[c.move.color].pl;
        const prev = c.prevMove ? { move: c.prevMove } : null;
        const lead = c.moveText ? String(c.moveText).trim() + ' ' : '';
        let turns;
        if (event.kind === 'hit') {
            const step = readStep(B, c.ChessCtor, c.fenBefore, moveUci(c.move), prev);
            if (!step) return null;
            const ph = phrase(step);
            const x = { ago: agoText(c.ply - event.ply) };
            const opener = HIT_OPENERS[pick(mem, 'hit-opener', HIT_OPENERS, seed)](x);
            const fact = tidy(capFirst(side) + ' ' + ph.pres + ph.per + '.');
            let answer = opener + (/: $/.test(opener) ? fact.charAt(0).toLowerCase() + fact.slice(1) : fact);
            // I la mirada endavant continua: la resposta que ara espera Stockfish.
            if (eligible(c)) {
                const next = readLine(c.ChessCtor, c.fenAfter, c.after.pv, { plies: 1, extend: 1, prev: c.move });
                const R1 = next && next.steps[0] ? phrase(next.steps[0]) : null;
                if (R1 && R1.purpose && R1.purpose.inf) {
                    const extra = NEXT_TEXTS[pick(mem, 'next', NEXT_TEXTS, seed >> 2)]({ opp: SIDE[other(c.move.color)].pl, R1: R1 });
                    if (wordCount(answer + extra) <= CONFIG.FOLLOW_WORDS - 8) answer = tidy(answer + extra);
                }
            }
            const q = lead + HIT_QUESTIONS[pick(mem, 'hit-question', HIT_QUESTIONS, seed >> 1)]({});
            const solo = lead + HIT_SOLO[pick(mem, 'hit-solo', HIT_SOLO, seed >> 3)](x);
            turns = [{ role: 'presenter', text: q, solo: solo }, { role: 'analyst', text: answer }];
        } else if (event.kind === 'miss') {
            const a = c.before, b = c.after;
            const reliable = a && b && a.reliable && b.reliable && a.best && b.best && a.best.type === 'cp' && b.best.type === 'cp';
            const loss = reliable ? (a.best.value - b.best.value) * (c.move.color === 'w' ? 1 : -1) : null;
            const notable = isNum(loss) && loss >= CONFIG.MISS_NOTABLE_CP;
            if (!notable && c.ply - mem.lastMissPly < CONFIG.MISS_GAP_PLIES) return null;
            const expected = readStep(B, c.ChessCtor, c.fenBefore, event.expected, prev);
            if (!expected) return null;
            const ex = phrase(expected, false);
            const x = { side: side, expected: ex.inf, expectedPast: ex.past, expectedNom: ex.nom, pawns: '' };
            let answer = MISS_ANSWERS[pick(mem, 'miss-answer', MISS_ANSWERS, seed)](x);
            if (isNum(loss)) {
                const level = loss <= CONFIG.MISS_EQUAL_CP ? 'equal' : loss < CONFIG.MISS_CLEAR_CP ? 'slight' : 'clear';
                if (level === 'clear' && c.tier === 'advanced') x.pawns = ', d’uns ' + pawnsText(loss) + ' peons';
                const list = MISS_ASSESS[level];
                answer += ' ' + list[pick(mem, 'miss-' + level, list, seed >> 2)](x);
            }
            const q = lead + MISS_QUESTIONS[pick(mem, 'miss-question', MISS_QUESTIONS, seed >> 1)]({ side: side });
            const solo = lead + MISS_SOLO[pick(mem, 'miss-solo', MISS_SOLO, seed >> 3)](x);
            if (wordCount(q + ' ' + answer) > CONFIG.FOLLOW_WORDS) return null;
            turns = [{ role: 'presenter', text: q, solo: solo }, { role: 'analyst', text: answer }];
            mem.lastMissPly = c.ply;
        } else return null;
        mem.lastFollowPly = c.ply;
        return { kind: event.kind === 'hit' ? 'forecast-hit' : 'forecast-miss', turns: turns, memory: mem };
    }

    // Frase final per a un fil de conflicte: la primera jugada de cada bàndol
    // a la línia de Stockfish torna a la mateixa casella (l'ataca, la captura
    // o la defensa). Retorna null si la línia no hi diu res.
    function tail(ctx, square, memory) {
        const c = ctx || {};
        if (!eligible(c) || !square) return null;
        const mem = normalize(memory);
        const reading = readLine(c.ChessCtor, c.fenAfter, c.after.pv, { plies: 2, extend: 2, prev: c.move });
        if (!reading) return null;
        const seed = hash((c.gameId || '') + ':tail:' + c.ply);
        for (const s of reading.steps) {
            const f = s.facts;
            const kind = f.capture && f.capture.sq === square ? 'capture'
                : f.attack && f.attack.sq === square ? 'attack'
                : f.defend && f.defend.sq === square ? 'defend' : null;
            if (!kind) continue;
            const ph = phrase(s, false);
            const piece = at(reading.startGrid, square);
            const list = TAIL_TEXTS[kind];
            const text = list[pick(mem, 'tail-' + kind, list, seed)]({ S: SIDE[s.color].pl, inf: ph.inf, nom: ph.nom,
                pron: piece ? pronoun(piece.t) : 'el' });
            return { text: text, memory: mem };
        }
        return null;
    }

    return {
        VERSION: VERSION,
        CONFIG: CONFIG,
        emptyMemory: emptyMemory,
        readLine: readLine,
        purposeOf: purposeOf,
        phrase: phrase,
        stepScore: stepScore,
        sanLine: sanLine,
        eligible: eligible,
        plan: plan,
        track: track,
        follow: follow,
        tail: tail,
        TEXTS: {
            PLAN_QUESTIONS: PLAN_QUESTIONS, WHY_QUESTIONS: WHY_QUESTIONS, SOLO_LEADS: SOLO_LEADS,
            LINE_OPENERS: LINE_OPENERS, LINE_SECOND: LINE_SECOND, LINE_COMPACT: LINE_COMPACT, LINE_THIRD: LINE_THIRD, THEME_TEXTS: THEME_TEXTS,
            EVAL_TEXTS: EVAL_TEXTS, HIT_QUESTIONS: HIT_QUESTIONS, HIT_OPENERS: HIT_OPENERS, MISS_QUESTIONS: MISS_QUESTIONS,
            MISS_ANSWERS: MISS_ANSWERS, MISS_ASSESS: MISS_ASSESS, TAIL_TEXTS: TAIL_TEXTS
        }
    };
});
