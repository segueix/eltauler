// ============================================================================
// visiograu.js — «La visió d'en Grau»: Stockfish vist dues o tres jugades
// endavant i explicat amb intencions, sense caselles
// ============================================================================
// Ni l'Èlia ni en Grau no diuen caselles. L'Èlia narra la jugada per la
// intenció (i, als diàlegs, què s'ha jugat); en Grau n'explica la lògica: «fer escac amb la dama», «clavar el cavall del rei negre», «fer
// fora l'alfil amb un peó», «guanyar espai al centre», «doblar les torres a
// la columna oberta». Les peces es distingeixen pel nom de sempre (el cavall
// del rei, l'alfil de la dama), els peons pel paper que fan (el peó passat,
// el peó central, un peó de l'enroc) i els llocs per zones (el centre, el
// flanc de rei, el camp rival, la gran diagonal). Mai no diu cap casella.
//
// En Grau mira la línia principal de l'anàlisi de Stockfish (la posició
// just després de la jugada, a plena força), explica què passarà en les
// properes dues o tres jugades i per què, i després confirma que s'ha
// complert la previsió o explica que un bàndol se n'ha desviat.
//
// Garanties:
//   · Cada jugada de la línia es comprova amb chess.js abans de dir-la; la
//     lectura s'atura a la primera jugada que no és legal.
//   · Les intencions (escac, forquilla, clavada, atac, defensa, columna,
//     setena fila, peó passat, rei...) són fets certs al tauler DESPRÉS de
//     la jugada.
//   · El material guanyat només es diu si la línia acaba quieta, el guany
//     es manté fins al final de la línia i la valoració no el contradiu.
//   · Res no s'atribueix als jugadors: es descriu la línia analitzada.
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

    const VERSION = '1.4.0';

    function getCore() {
        if (root && root.ElTaulerCore) return root.ElTaulerCore;
        try { if (typeof require === 'function') return require('./core'); } catch (e) {}
        return null;
    }

    const CONFIG = Object.freeze({
        // Profunditat mínima de l'anàlisi per explicar-ne la línia.
        MIN_DEPTH: 12,
        // Semijugades llegides: fins a tres de cada bàndol; si la sisena és
        // una captura, es llegeix fins a la vuitena per veure com acaba.
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
        // Pressupost del diàleg i de la variant que il·lustra la lògica.
        MAX_WORDS: { basic: 66, mid: 88, advanced: 96 },
        LINE_WORDS: { basic: 28, mid: 48, advanced: 54 },
        FOLLOW_WORDS: 46
    });

    // ------------------------------------------------------------------
    // Llengua
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
    // «Aquest cavall»: la peça de què s'acaba de parlar a la jugada anterior.
    const DEMO = { p: 'aquest peó', n: 'aquest cavall', b: 'aquest alfil', r: 'aquesta torre', q: 'aquesta dama', k: 'el rei' };

    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    function other(c) { return c === 'w' ? 'b' : 'w'; }
    function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
    function lowFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
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
    // Contraccions: de + el → del; a + el → al; per + el → pel.
    function de(phrase) {
        const p = String(phrase);
        if (/^el /.test(p)) return 'del ' + p.slice(3);
        if (/^[aeiouàèéíòóú]/i.test(p)) return 'd’' + p;
        return 'de ' + p;
    }
    function clitic(type) { return FEM[type] ? 'la' : 'lo'; }
    function pronoun(type) { return FEM[type] ? 'la' : 'el'; }
    function agree(type, masc, fem) { return FEM[type] ? fem : masc; }
    function list(items) {
        if (items.length <= 1) return items[0] || '';
        return items.slice(0, -1).join(', ') + ' i ' + items[items.length - 1];
    }
    // Comes dobles o abans d'un punt.
    function tidy(text) { return String(text).replace(/,\s*,/g, ',').replace(/,\s*([.;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim(); }

    // Verbs: infinitiu, present, condicional, subjuntiu i imperfet de
    // subjuntiu, en tercera persona del plural («les blanques fan /
    // farien / facin / fessin escac»).
    const VERBS = {
        fer: ['fer', 'fan', 'farien', 'facin', 'fessin'],
        clavar: ['clavar', 'claven', 'clavarien', 'clavin', 'clavessin'],
        apartar: ['apartar', 'aparten', 'apartarien', 'apartin', 'apartessin'],
        tapar: ['tapar', 'tapen', 'taparien', 'tapin', 'tapessin'],
        completar: ['completar', 'completen', 'completarien', 'completin', 'completessin'],
        canviar: ['canviar', 'canvien', 'canviarien', 'canviïn', 'canviessin'],
        guanyar: ['guanyar', 'guanyen', 'guanyarien', 'guanyin', 'guanyessin'],
        atacar: ['atacar', 'ataquen', 'atacarien', 'ataquin', 'ataquessin'],
        posar: ['posar', 'posen', 'posarien', 'posin', 'posessin'],
        entrar: ['entrar', 'entren', 'entrarien', 'entrin', 'entressin'],
        doblar: ['doblar', 'doblen', 'doblarien', 'doblin', 'doblessin'],
        formar: ['formar', 'formen', 'formarien', 'formin', 'formessin'],
        portar: ['portar', 'porten', 'portarien', 'portin', 'portessin'],
        empènyer: ['empènyer', 'empenyen', 'empenyerien', 'empenyin', 'empenyessin'],
        apuntar: ['apuntar', 'apunten', 'apuntarien', 'apuntin', 'apuntessin'],
        acostar: ['acostar', 'acosten', 'acostarien', 'acostin', 'acostessin'],
        plantar: ['plantar', 'planten', 'plantarien', 'plantin', 'plantessin'],
        protegir: ['protegir', 'protegeixen', 'protegirien', 'protegeixin', 'protegissin'],
        treure: ['treure', 'treuen', 'traurien', 'treguin', 'traguessin'],
        oferir: ['oferir', 'ofereixen', 'oferirien', 'ofereixin', 'oferissin'],
        obrir: ['obrir', 'obren', 'obririen', 'obrin', 'obrissin'],
        centralitzar: ['centralitzar', 'centralitzen', 'centralitzarien', 'centralitzin', 'centralitzessin'],
        activar: ['activar', 'activen', 'activarien', 'activin', 'activessin'],
        connectar: ['connectar', 'connecten', 'connectarien', 'connectin', 'connectessin'],
        replegar: ['replegar', 'repleguen', 'replegarien', 'repleguin', 'replegessin'],
        avançar: ['avançar', 'avancen', 'avançarien', 'avancin', 'avancessin'],
        enrocar: ['enrocar', 'enroquen', 'enrocarien', 'enroquin', 'enroquessin'],
        coronar: ['coronar', 'coronen', 'coronarien', 'coronin', 'coronessin'],
        capturar: ['capturar', 'capturen', 'capturarien', 'capturin', 'capturessin'],
        recuperar: ['recuperar', 'recuperen', 'recuperarien', 'recuperin', 'recuperessin'],
        tornar: ['tornar', 'tornen', 'tornarien', 'tornin', 'tornessin']
    };
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
    function isLight(sq) { const fr = fileRank(sq); return !!fr && (fr.file + fr.rank) % 2 === 1; }
    function relRank(sq, color) { const r = Number(String(sq)[1]); return color === 'w' ? r : 9 - r; }

    function board() {
        const Core = getCore();
        if (!Core || typeof Core.antidoteParseBoard !== 'function' || typeof Core.antidoteAttackersOf !== 'function' ||
                typeof Core.antidoteTargetsOf !== 'function') return null;
        return {
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
        const rel = relRank(sq, color);
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
    // Clavades noves d'una peça de llarg abast: la primera peça rival de la
    // línia no es pot moure sense deixar el rei en escac (absoluta) o una
    // peça més valuosa exposada (relativa).
    const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    function pinsFrom(grid, sq, color) {
        const p = at(grid, sq);
        const fr = fileRank(sq);
        if (!p || !fr || ['b', 'r', 'q'].indexOf(p.t) === -1) return [];
        const dirs = p.t === 'r' ? ROOK_DIRS : p.t === 'b' ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
        const out = [];
        dirs.forEach(d => {
            let f = fr.file + d[0], r = fr.rank + d[1], first = null;
            while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
                const q = grid[r][f];
                if (q) {
                    if (!first) {
                        if (q.c === color || q.t === 'k') return;
                        first = { sq: sqOf(f, r), type: q.t };
                    } else {
                        if (q.c === color) return;
                        if (q.t === 'k' || VALUE[q.t] > VALUE[first.type]) out.push({ sq: first.sq, type: first.type, behind: q.t });
                        return;
                    }
                }
                f += d[0]; r += d[1];
            }
        });
        return out;
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
    // Identitat de les peces: el cavall del rei, la torre de la dama...
    // ------------------------------------------------------------------
    // Cavalls i torres es distingeixen per l'ala on van començar; es
    // segueixen jugada a jugada. Els alfils, pel color de les caselles.
    const START_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
    function startIds() {
        return { b1: 'q', g1: 'k', a1: 'q', h1: 'k', b8: 'q', g8: 'k', a8: 'q', h8: 'k' };
    }
    function moveIds(ids, mv) {
        if (!ids || !mv) return ids || null;
        const out = Object.assign({}, ids);
        const id = out[mv.from];
        delete out[mv.from];
        delete out[mv.to];
        if (id && !mv.promotion) out[mv.to] = id;
        const flags = mv.flags || '';
        const rank = mv.color === 'w' ? '1' : '8';
        if (flags.indexOf('k') !== -1 && out['h' + rank]) { out['f' + rank] = out['h' + rank]; delete out['h' + rank]; }
        if (flags.indexOf('q') !== -1 && out['a' + rank]) { out['d' + rank] = out['a' + rank]; delete out['a' + rank]; }
        return out;
    }
    function wingOf(type, color, sq, grid, ids) {
        if (pieces(grid, color, type).length < 2) return null;
        if (type === 'b') return isLight(sq) === (color === 'w') ? 'k' : 'q';
        if ((type === 'n' || type === 'r') && ids && ids[sq]) return ids[sq];
        return null;
    }
    // Peons: pel paper que fan, mai per la casella.
    function pawnName(B, grid, sq, color) {
        if (B.passed(grid, color).has(sq)) return 'el peó passat';
        const f = sq[0];
        if ('de'.indexOf(f) !== -1) {
            const n = pieces(grid, color, 'p').filter(p => 'de'.indexOf(p.sq[0]) !== -1).length;
            return n > 1 ? 'un peó central' : 'el peó central';
        }
        const k = kingOf(grid, color);
        const flank = 'abc'.indexOf(f) !== -1 ? 'abc' : 'fgh';
        if (k && relRank(k, color) === 1 && flank.indexOf(k[0]) !== -1 && relRank(sq, color) <= 3) return 'un peó de l’enroc';
        if ('ah'.indexOf(f) !== -1) return 'el peó de torre';
        return 'un peó del flanc de ' + (flank === 'abc' ? 'dama' : 'rei');
    }
    // Nom d'una peça. o.color: afegeix el color si porta el nom de l'ala
    // («el cavall del rei negre»); o.demo: «aquest cavall».
    function pieceName(B, type, color, sq, grid, ids, o) {
        const opts = o || {};
        if (opts.demo) return DEMO[type];
        if (type === 'p') return pawnName(B, grid, sq, color);
        if (type === 'k') return 'el rei';
        const wing = type === 'q' ? null : wingOf(type, color, sq, grid, ids);
        if (!wing) return np(type);
        return np(type) + (wing === 'k' ? ' del rei' : ' de la dama') +
            (opts.color ? ' ' + (wing === 'k' ? SIDE[color].adj : SIDE[color].adjF) : '');
    }
    // Zona d'arribada, per a les jugades sense cap altre fet.
    function zoneOf(grid, sq, color) {
        const ek = kingOf(grid, other(color));
        if (ek && cheb(sq, ek) <= 2) return 'a prop del rei ' + SIDE[other(color)].adj;
        if (relRank(sq, color) >= 6) return 'al camp rival';
        if ('cdef'.indexOf(sq[0]) !== -1 && relRank(sq, color) >= 3) return 'cap al centre';
        return 'cap al flanc de ' + ('abc'.indexOf(sq[0]) !== -1 ? 'dama' : 'rei');
    }
    function onLongDiagonal(sq) { const fr = fileRank(sq); return !!fr && (fr.file === fr.rank || fr.file + fr.rank === 7); }

    // ------------------------------------------------------------------
    // Lectura d'una jugada de la línia: fets comprovats al tauler
    // ------------------------------------------------------------------
    function readStep(B, ChessCtor, fen, uci, prev, idsBefore) {
        const applied = applyUci(ChessCtor, fen, uci);
        if (!applied) return null;
        const mv = applied.move;
        const color = mv.color, opp = other(color);
        const g0 = B.parse(fen), g1 = B.parse(applied.fen);
        const type = mv.promotion || mv.piece;
        const flags = mv.flags || '';
        const castle = flags.indexOf('k') !== -1 ? 'curt' : flags.indexOf('q') !== -1 ? 'llarg' : null;
        const capSq = flags.indexOf('e') !== -1 ? mv.to[0] + mv.from[1] : mv.to;
        const endgame = B.endgame(applied.fen);
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
            // Atacs nous: una peça més valuosa o sense defensa.
            const attacks = t1.filter(sq => t0.indexOf(sq) === -1)
                .map(sq => ({ sq: sq, p: at(g1, sq) }))
                .filter(x => x.p && x.p.c === opp && x.p.t !== 'k')
                .filter(x => VALUE[x.p.t] > VALUE[type] || !B.attackers(g1, x.sq, opp).length)
                .sort((a, b) => VALUE[b.p.t] - VALUE[a.p.t]);
            if (attacks.length) f.attack = { sq: attacks[0].sq, type: attacks[0].p.t, count: attacks.length,
                loose: !B.attackers(g1, attacks[0].sq, opp).length };
            // Forquilla: dues peces (o el rei i una peça) atacades alhora.
            const king = /\+|#/.test(mv.san) ? [{ sq: kingOf(g1, opp), type: 'k' }] : [];
            const targets = king.concat(attacks.map(x => ({ sq: x.sq, type: x.p.t })).filter(x => VALUE[x.type] >= 3));
            if (targets.length >= 2) f.fork = { targets: targets.slice(0, 2) };
            // Clavada nova.
            const before = mv.piece === type ? pinsFrom(g0, mv.from, color).map(p => p.sq) : [];
            const pin = pinsFrom(g1, mv.to, color).filter(p => p.type !== 'p' && before.indexOf(p.sq) === -1)
                .sort((a, b) => (b.behind === 'k') - (a.behind === 'k') || VALUE[b.type] - VALUE[a.type])[0];
            if (pin) f.pin = pin;
            // Defenses noves d'una peça pròpia que està atacada.
            const defends = t1.map(sq => ({ sq: sq, p: at(g1, sq) }))
                .filter(x => x.p && x.p.c === color && x.p.t !== 'k' && x.sq !== mv.to)
                .filter(x => B.attackers(g1, x.sq, opp).length > 0)
                .filter(x => B.attackers(g1, x.sq, color).length > B.attackers(g0, x.sq, color).length)
                .sort((a, b) => VALUE[b.p.t] - VALUE[a.p.t]);
            if (defends.length) f.defend = { sq: defends[0].sq, type: defends[0].p.t };
            // Fugida: la peça era atacada (sense defensa o per una de més
            // barata) i a la casella nova ja no l'ataca ningú.
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
                    f.file = { open: !pawns[opp] };
                    const partner = pieces(g1, color).find(p => p.sq !== mv.to && p.sq[0] === file && (p.t === 'r' || p.t === 'q'));
                    if (partner) f.double = { partner: partner.t };
                }
                if (relRank(mv.to, color) === 7 && relRank(mv.from, color) !== 7) f.seventh = true;
            }
            if (mv.piece === 'p' && !mv.promotion && B.passed(g1, color).has(mv.to)) f.passed = { left: 8 - relRank(mv.to, color) };
            const ek = kingOf(g1, opp);
            if (ek && type !== 'p') {
                const zone = sq => cheb(sq, ek) <= 1;
                const n1 = t1.filter(zone).length, n0 = t0.filter(zone).length;
                if (n1 >= 2 && n1 > n0) f.king = { count: n1 };
            }
            if (endgame) { /* al final, el centre no és cap finalitat per si mateix */ }
            else if (['p', 'n', 'b'].indexOf(type) === -1) { /* el centre, per als peons i les peces menors */ }
            else if (CENTER.indexOf(mv.to) !== -1 && CENTER.indexOf(mv.from) === -1) f.center = 'occupy';
            else {
                const c1 = t1.filter(sq => CENTER.indexOf(sq) !== -1).length;
                const c0 = t0.filter(sq => CENTER.indexOf(sq) !== -1).length;
                if (c1 >= 2 && c1 > c0) f.center = 'control';
            }
            if ((type === 'n' || type === 'b') && isOutpost(B, g1, mv.to, color)) f.outpost = true;
            if (type === 'b' && !mv.captured) {
                const fian = color === 'w' ? { g2: 'g3', b2: 'b3' } : { g7: 'g6', b7: 'b6' };
                const pawn = fian[mv.to] && at(g1, fian[mv.to]);
                if (pawn && pawn.t === 'p' && pawn.c === color) f.fianchetto = true;
                else if (onLongDiagonal(mv.to) && !onLongDiagonal(mv.from)) f.diagonal = true;
            }
            if (!mv.captured && ['q', 'r', 'b', 'n'].indexOf(type) !== -1) {
                const hits = B.attackers(g1, mv.to, opp);
                if (hits.some(a => a.t === type) && !hits.some(a => VALUE[a.t] < VALUE[type]) &&
                        B.attackers(g1, mv.to, color).length) f.trade = type;
            }
            if (mv.piece !== 'p' && relRank(mv.to, color) < relRank(mv.from, color)) f.retreat = true;
        }
        if (!castle && mv.piece === 'k' && endgame && centerDistance(mv.to) < centerDistance(mv.from)) f.kingActive = true;
        // Sortida per al rei: un peó del davant del rei enrocat avança i la
        // casella que deixa queda lliure i sense atacar.
        if (mv.piece === 'p' && !mv.captured) {
            const k = kingOf(g1, color);
            if (k && relRank(k, color) === 1 && relRank(mv.from, color) === 2 && cheb(mv.from, k) === 1 &&
                    'abcfgh'.indexOf(k[0]) !== -1 && !B.attackers(g1, mv.from, opp).length) f.luft = true;
        }
        if (!rooksConnected(g0, color) && rooksConnected(g1, color)) f.connect = true;
        return { uci: uci, move: mv, color: color, fenBefore: fen, fen: applied.fen, gridBefore: g0, grid: g1, facts: f,
            idsBefore: idsBefore || null, ids: moveIds(idsBefore, mv), prevTo: prev && prev.move ? prev.move.to : null,
            check: /\+$/.test(mv.san), mate: /#$/.test(mv.san) };
    }

    // Importància d'una jugada de la línia (per triar-ne la jugada clau).
    function stepScore(s) {
        if (!s) return 0;
        const f = s.facts;
        if (s.mate) return 100;
        if (f.promotion) return 90;
        if (f.fork) return 86;
        if (f.capture && f.free && VALUE[f.capture.type] >= 3) return 80;
        if (f.pin) return 74;
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
        if (f.fianchetto || f.diagonal) return 28;
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
        let ids = o.ids || null;
        for (let i = 0; i < pv.length && i < limit; i++) {
            if (i >= max && !(prev && prev.move && prev.move.captured)) break;
            const step = readStep(B, ChessCtor, cur, pv[i], prev, ids);
            if (!step) break;
            step.index = i;
            steps.push(step);
            cur = step.fen;
            prev = step;
            ids = step.ids;
            if (step.mate) break;
        }
        // Un canvi: captura d'una peça del mateix valor i recaptura immediata.
        steps.forEach((s, i) => {
            const next = steps[i + 1];
            if (s.facts.capture && !s.facts.recapture && next && next.facts.recapture &&
                    VALUE[s.facts.capture.type] === VALUE[s.move.piece] && s.move.piece !== 'k') {
                s.facts.exchange = true;
                next.facts.exchangeEnd = true;
            }
        });
        const startGrid = B.parse(fen);
        const last = steps[steps.length - 1];
        const endGrid = last ? last.grid : startGrid;
        return {
            fen: fen, steps: steps, startGrid: startGrid, endGrid: endGrid, ids: o.ids || null,
            material: { start: material(startGrid), end: material(endGrid),
                stable: !!last && !last.move.captured && !last.move.promotion && !last.check }
        };
    }

    // ------------------------------------------------------------------
    // La intenció d'una jugada: el verb, de qui es parla i per a què
    // ------------------------------------------------------------------
    // o.noDemo: no es pot dir «aquest cavall» (la jugada anterior no s'ha narrat).
    function intentOf(step, opts) {
        const B = board();
        if (!B || !step) return null;
        const demoOk = !(opts && opts.noDemo);
        const f = step.facts, mv = step.move, c = step.color, o = other(c), g = step.grid;
        const type = mv.promotion || mv.piece;
        const mover = pieceName(B, type, c, mv.to, g, step.ids);
        const own = (t, sq) => pieceName(B, t, c, sq, g, step.ids);
        const rival = (t, sq) => pieceName(B, t, o, sq, g, step.ids, { color: true, demo: demoOk && step.prevTo === sq && t !== 'k' });
        const res = (key, v, obj, purpose) => ({ key: key, v: v, o: obj, purpose: purpose || null });
        const oppKing = 'al rei ' + SIDE[o].adj;
        if (step.mate) return res('mate', 'fer', 'escac i mat amb ' + mover);
        if (f.promotion) return res('promotion', 'coronar', 'el peó' + (f.promotion !== 'q' ? ' i fer-ne ' + (f.promotion === 'n' ? 'un cavall' : f.promotion === 'b' ? 'un alfil' : 'una torre') : ''));
        if (f.fork) {
            const names = f.fork.targets.map(t => t.type === 'k' ? 'el rei' : rival(t.type, t.sq));
            return res('fork', 'fer', 'una forquilla amb ' + mover + ' ' + (/^el /.test(names[0]) ? 'al ' + names[0].slice(3) : 'a ' + names[0]) +
                ' i ' + (/^el /.test(names[1]) ? 'al ' + names[1].slice(3) : 'a ' + names[1]));
        }
        // Les captures primer (amb «amb escac» si escau), després l'escac i la clavada.
        if (f.capture) {
            const victim = pieceName(B, f.capture.type, o, f.capture.sq, step.gridBefore, step.idsBefore,
                { color: true, demo: demoOk && step.prevTo === f.capture.sq });
            // «recuperar la peça amb escac», però «capturar X amb l’alfil, amb escac».
            const chk = step.check ? ' amb escac' : '';
            if (f.recapture) return f.exchangeEnd ? res('recapture', 'completar', 'el canvi' + chk)
                : res('recapture', 'recuperar', (VALUE[f.capture.type] >= 3 ? 'la peça' : 'el peó') + chk);
            if (f.exchange) return res('exchange', 'canviar', (f.capture.type === mv.piece
                ? (FEM[mv.piece] ? 'les ' : 'els ') + PLURAL[mv.piece] : mover + ' per ' + victim) + chk);
            if (f.free) return res('free', 'guanyar', victim + chk);
            return res('capture', 'capturar', victim + ' amb ' + (mv.piece === 'p' ? 'un peó' : mover) + (chk ? ',' + chk : ''));
        }
        // Una captura que fa escac es diu com a captura, «amb escac».
        if (step.check && !f.capture) return res('check', 'fer', 'escac amb ' + mover);
        if (f.pin) return res('pin', 'clavar', rival(f.pin.type, f.pin.sq) + ' amb ' + mover,
            { join: ' ', inf: f.pin.behind === 'k' ? 'contra el rei' : 'contra ' + np(f.pin.behind) });
        if (f.outOfCheck === 'king') return res('out', 'apartar', 'el rei de l’escac');
        if (f.outOfCheck === 'block') return res('block', 'tapar', 'l’escac amb ' + mover);
        // «posar la dama a recer i, de passada, atacar el cavall»: dues accions.
        if (f.escape) return res('escape', 'posar', mover + ' a recer',
            f.attack ? { join: ' i, de passada, ', coord: { v: 'atacar', o: rival(f.attack.type, f.attack.sq) } } : null);
        if (f.defend) {
            const target = own(f.defend.type, f.defend.sq);
            if (f.develop) return res('develop', 'treure', mover, { inf: 'protegir ' + target });
            return res('defend', 'protegir', target + ' amb ' + (mv.piece === 'p' ? (f.defend.type === 'p' ? 'un altre peó' : 'un peó') : mover));
        }
        if (f.attack) {
            const target = rival(f.attack.type, f.attack.sq);
            if (mv.piece === 'p' && VALUE[f.attack.type] > 1) return res('kick', 'fer', 'fora ' + target + ' amb un peó');
            return res('attack', 'atacar', target + ' amb ' + (mv.piece === 'p' ? 'un peó' : mover));
        }
        if (f.castle) return res('castle', 'enrocar', f.castle, { inf: 'posar el rei a recer' });
        if (f.seventh) return res('seventh', 'entrar', 'a la setena fila amb ' + mover);
        const column = 'a la columna ' + (f.file && f.file.open ? 'oberta' : 'semioberta');
        if (f.double) return f.double.partner === 'r' && type === 'r' ? res('double', 'doblar', 'les torres ' + column)
            : res('double', 'formar', 'una bateria de peces majors ' + column);
        if (f.file) return res('file', 'portar', mover + ' a la columna ' + (f.file.open ? 'oberta' : 'semioberta'));
        if (f.passed) return res('passed', 'empènyer', 'el peó passat',
            f.passed.left === 1 ? { join: ', ', inf: 'a una casella de coronar' } : null);
        if (f.king) return type === 'b' || type === 'r' ? res('king', 'apuntar', oppKing + ' amb ' + mover)
            : res('king', 'acostar', mover + ' ' + oppKing);
        if (f.outpost) return res('outpost', 'plantar', mover + ' en un lloc avançat');
        if (f.fianchetto) return res('fianchetto', 'fer', 'el fianchetto amb ' + mover);
        if (f.diagonal) return res('diagonal', 'plantar', mover + ' a la gran diagonal');
        if (f.trade) return res('trade', 'oferir', 'el canvi ' + de(PLURAL[f.trade]));
        if (f.luft) return res('luft', 'obrir', 'una sortida al rei');
        if (f.develop) return res('develop', 'treure', mover,
            f.develop.last ? { inf: 'completar el desenvolupament' } : f.center ? { inf: 'controlar el centre' } : null);
        if (f.center) return mv.piece === 'p' ? res('center', 'guanyar', 'espai al centre') : res('center', 'centralitzar', mover);
        if (f.kingActive) return res('king-active', 'activar', 'el rei');
        if (f.connect) return res('connect', 'connectar', 'les torres');
        if (f.retreat) return res('retreat', 'replegar', mover);
        if (mv.piece === 'p') return res('pawn', 'avançar', PAWN_FILE[mv.from[0]] +
            (Math.abs(Number(mv.to[1]) - Number(mv.from[1])) === 2 ? ' dues caselles' : ''));
        return res('move', 'portar', mover + ' ' + zoneOf(g, mv.to, c));
    }
    // Intencions que no expliquen res més enllà del moviment.
    const GENERIC = { pawn: true, move: true, retreat: true };

    // La jugada llesta per a les plantilles: totes les formes del verb.
    // o = { purpose: false (sense finalitat), noDemo, again (repeteix la
    // mateixa intenció: «tornarien a posar la dama a recer») }
    function phrase(step, o) {
        const opts = o === false ? { purpose: false } : (o || {});
        const it = intentOf(step, opts);
        if (!it) return null;
        const p = opts.purpose === false ? null : it.purpose;
        const tailFor = mood => !p ? '' : p.coord ? (p.join || ' i ') + VERBS[p.coord.v][MOOD[mood]] + ' ' + p.coord.o
            : (p.join || ' per ') + p.inf;
        const form = mood => tidy((opts.again ? VERBS.tornar[MOOD[mood]] + ' a ' + it.v : VERBS[it.v][MOOD[mood]]) + ' ' + it.o +
            tailFor(opts.again ? 'inf' : mood));
        return { step: step, key: it.key, generic: !!GENERIC[it.key], purpose: p, obj: it.o,
            inf: form('inf'), pres: form('pres'), cond: form('cond'), subj: form('subj'), past: form('past') };
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
    // (si no, una simple recaptura semblaria un guany), i el guany s'ha de
    // mantenir fins al final de tota la línia llegida.
    function subReading(reading, n, baseGrid) {
        const steps = reading.steps.slice(0, n);
        const last = steps[steps.length - 1];
        const next = reading.steps[n];
        const endGrid = last ? last.grid : reading.startGrid;
        const stable = !!last && (!last.move.captured || !!last.facts.free || !!last.facts.recapture) && !last.move.promotion &&
            !last.check && !(next && next.move.captured);
        return { fen: reading.fen, steps: steps, startGrid: reading.startGrid, endGrid: endGrid,
            endIds: last ? last.ids : reading.ids,
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
        const gain = m.full ? (fullGain === null ? 0 : (Math.sign(gainAt(m.end)) === Math.sign(fullGain)
            ? Math.sign(fullGain) * Math.min(Math.abs(gainAt(m.end)), Math.abs(fullGain)) : 0)) : gainAt(m.end);
        const found = [];
        const add = (id, score, params) => found.push({ id: id, score: score, side: S, params: params || {} });
        const rivalAt = (s, type, sq, grid, ids) => pieceName(B, type, opp, sq, grid || s.grid, ids || s.ids, { color: true });

        if (m.stable && gain >= 1 && evalSide !== opp) {
            const word = materialWord(m.start, m.full && gainAt(m.full) < gainAt(m.end) ? m.full : m.end, S);
            const caps = mine.filter(s => s.facts.capture && !s.facts.recapture)
                .sort((a, b) => VALUE[b.facts.capture.type] - VALUE[a.facts.capture.type]);
            let cause = null, victim = null;
            if (caps.length) {
                const c = caps[0];
                victim = rivalAt(c, c.facts.capture.type, c.facts.capture.sq, c.gridBefore, c.idsBefore);
                const prevGrid = c.index > 0 ? steps[c.index - 1].grid : reading.startGrid;
                if (c.facts.free) cause = 'free';
                else if (B.attackers(prevGrid, c.facts.capture.sq, S).length > B.attackers(prevGrid, c.facts.capture.sq, opp).length) cause = 'outnumbered';
            }
            // Si tot el guany és la captura que s'acaba de fer (ja la diu l'Èlia)
            // i la línia no canvia el material, no és el premi del pla.
            const afterMove = material(reading.startGrid);
            const lineGain = (m.end[S].pts - m.end[opp].pts) - (afterMove[S].pts - afterMove[opp].pts);
            const onlyTheCapture = ctx.moveCaptured && ctx.mover === S && !caps.length && lineGain === 0;
            if (!onlyTheCapture) add('material', 100 + gain, { word: word.word, cause: cause, victim: victim });
        }
        if (m.stable && gain <= -2 && evalSide === S) add('compensation', 90, { word: materialWord(m.end, m.start, S).word });

        const fork = mine.find(s => s.facts.fork);
        if (fork) add('fork', 88, { piece: pieceName(B, fork.move.promotion || fork.move.piece, S, fork.move.to, fork.grid, fork.ids) });
        // La clavada, si és el que en Grau n'ha dit (no si la jugada captura).
        const pin = mine.find(s => s.facts.pin && (intentOf(s) || {}).key === 'pin');
        if (pin) add('pin', 78, { target: rivalAt(pin, pin.facts.pin.type, pin.facts.pin.sq), type: pin.facts.pin.type,
            absolute: pin.facts.pin.behind === 'k' });

        const attackSteps = mine.filter(s => s.check || s.facts.king).length;
        const z0 = kingZoneAttackers(B, reading.startGrid, S), z1 = kingZoneAttackers(B, reading.endGrid, S);
        if ((attackSteps >= 2 && z1 >= 2) || (z1 - z0 >= 2 && z1 >= 3)) add('attack', 80, { n: z1, n0: z0 });

        const passed = mine.filter(s => s.facts.passed);
        if (passed.length) add('passed', 75, { left: passed[passed.length - 1].facts.passed.left });
        // Les columnes, si és el que fa la jugada (no si la peça fuig o defensa).
        const fileStep = s => { const it = intentOf(s); return it && ['seventh', 'double', 'file'].indexOf(it.key) !== -1; };
        const files = mine.filter(fileStep).sort((a, b) => stepScore(b) - stepScore(a))[0];
        if (files) {
            const f = files.facts;
            const kind = f.seventh ? 'seventh' : f.double ? 'double' : 'file';
            add('files', kind === 'seventh' ? 72 : kind === 'double' ? 71 : 70, { kind: kind, open: !!(f.file && f.file.open) });
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
        if (pressured.length) {
            const t = pressured[0];
            add('pressure', 68, Object.assign({ target: pieceName(B, t.type, opp, t.sq, reading.endGrid, reading.endIds, { color: true }) }, t));
        }
        const defensive = s => s.facts.defend || s.facts.escape || s.facts.outOfCheck;
        const active = s => s.check || s.facts.attack || (s.facts.capture && !s.facts.recapture);
        if (theirs.filter(defensive).length >= 2 && mine.some(active)) add('initiative', 66, {});
        // Guanyar un temps: S ataca una peça i la jugada següent del rival l'aparta.
        for (const a of mine) {
            const reply = steps[a.index + 1];
            if (a.facts.attack && VALUE[a.facts.attack.type] >= 3 && reply && reply.color === opp &&
                    reply.move.from === a.facts.attack.sq && !reply.move.captured) {
                add('tempo', 62, { type: a.facts.attack.type, target: rivalAt(a, a.facts.attack.type, a.facts.attack.sq) });
                break;
            }
        }
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
        if (outpost) add('outpost', 58, { type: outpost.move.piece,
            piece: pieceName(B, outpost.move.piece, S, outpost.move.to, outpost.grid, outpost.ids) });
        // Maniobra: la mateixa peça es mou dues vegades i guanya activitat.
        for (let i = 0; i < mine.length; i++) {
            const a = mine[i];
            if (a.move.piece === 'p' || a.move.piece === 'k' || a.facts.capture) continue;
            const b = mine.slice(i + 1).find(s => s.move.from === a.move.to && !s.facts.capture);
            if (!b) continue;
            const before = B.targets(a.index > 0 ? steps[a.index - 1].grid : reading.startGrid, a.move.from).length;
            const after = B.targets(b.grid, b.move.to).length;
            if (after > before) add('maneuver', 55, { piece: pieceName(B, b.move.piece, S, b.move.to, b.grid, b.ids), n0: before, n1: after });
            break;
        }
        if (isNum(ctx.ply) && ctx.ply < 30) {
            const castle = mine.find(s => s.facts.castle);
            const connect = mine.find(s => s.facts.connect);
            const develop = mine.find(s => s.facts.develop);
            if (castle || connect || develop)
                add('development', castle ? 56 : 54, { kind: castle ? 'castle' : connect ? 'connect' : 'develop' });
        }
        if (mine.some(s => s.facts.kingActive)) add('king-active', 52, {});
        const center = mine.find(s => s.facts.center ||
            (s.move.piece === 'p' && s.facts.attack && s.facts.attack.type === 'p' && CENTER.indexOf(s.facts.attack.sq) !== -1));
        if (center) add('center', 50, { lever: center.move.piece === 'p' && !!center.facts.attack && center.facts.attack.type === 'p' });
        if (mine.filter(s => s.facts.defend || s.facts.escape).length >= 2) add('defence', 48, {});
        const offer = mine.find(s => s.facts.trade);
        if (offer) {
            const strong = band && /-(clear|decisive)$/.test(band);
            add('trade-offer', 47, { type: offer.facts.trade,
                mood: evalSide === S && strong ? 'ahead' : evalSide === opp && strong ? 'behind' : 'equal' });
        }
        const diag = mine.find(s => s.facts.fianchetto || s.facts.diagonal);
        if (diag) add('diagonal', 46, { fianchetto: !!diag.facts.fianchetto });
        if (steps.some(s => s.facts.attack || s.facts.capture || s.check || s.facts.defend || s.facts.escape)) add('tension', 20, {});
        found.sort((a, b) => b.score - a.score);
        return found[0] || null;
    }

    // ------------------------------------------------------------------
    // Textos de l'Èlia i d'en Grau
    // ------------------------------------------------------------------
    const PROOF_QUESTIONS = [
        'Com es veuria al tauler?',
        'Amb quines jugades ho veuríem?',
        'Com s’hi arribaria?',
        'Com es concretaria aquesta idea?'
    ];
    const THEME_QUESTIONS = {
        material: ['Qui hi guanyaria material?', 'Com quedaria el balanç de material?'],
        compensation: ['Com valores la cessió de material, Grau?', 'Val la pena cedir material en aquesta línia?'],
        fork: ['On és el perill tàctic?', 'Què permetria atacar dues peces alhora?'],
        pin: ['Quin problema els planteja la clavada?', 'Quina peça quedaria lligada si juguen aquesta línia?'],
        attack: ['On es concentraria l’atac?', 'Què ens diu la línia sobre la seguretat del rei?'],
        passed: ['Quin paper hi faria el peó passat?', 'Què haurien de vigilar davant d’aquest peó passat?'],
        files: ['Per on guanyarien activitat les peces majors?', 'Per què aquesta ruta és útil a les peces majors?'],
        pressure: ['Sobre quina peça es concentraria la pressió?', 'Quina peça hauria de vigilar el bàndol que defensa?'],
        initiative: ['Qui marcaria el ritme?', 'Quin bàndol quedaria pendent de defensar-se?'],
        tempo: ['Qui guanyaria un temps amb aquesta línia?', 'Com es guanyaria temps atacant una peça?'],
        trades: ['Què canviaria si es van canviant peces?', 'Quin efecte tindrien aquests canvis?'],
        'trades-ahead': ['A qui afavoriria simplificar?', 'Per què voldria canviar peces el bàndol que va al davant?'],
        'trades-behind': ['Què hi guanyaria el bàndol que defensa si canvia peces?', 'Per què un canvi donaria aire al bàndol que defensa?'],
        'trades-queens': ['Què canviaria si desapareixen les dames?', 'Com canvia el paper del rei sense les dames?'],
        'trade-offer': ['Per què és rellevant l’oferta de canvi?', 'Què implica aquest possible canvi de peces?'],
        outpost: ['Què té d’especial aquest lloc avançat?', 'Per què costa fer fora una peça d’allà?'],
        maneuver: ['Què busca la peça movent-se dues vegades?', 'De què serviria aquesta maniobra?'],
        development: ['Quina feina queda per fer a l’obertura?', 'Què guanyen acabant el desplegament?'],
        center: ['Per què val la pena disputar el centre?', 'Què hi poden guanyar al centre?'],
        diagonal: ['Què hi guanya l’alfil en aquesta diagonal?', 'Per què importa la gran diagonal?'],
        'king-active': ['Quin paper pot fer el rei en aquest final?', 'Per què interessa acostar el rei al centre?'],
        defence: ['Per què toca defensar-se ara?', 'Què prioritza el bàndol que es defensa?']
    };
    const THEN = ['Llavors', 'Aleshores', 'Tot seguit', 'A continuació'];

    // Narració de la línia (en Grau). x.R1, x.M1... són frases de jugada.
    const LINE_OPENERS = [
        x => 'Preveig que ' + x.opp + ' ' + x.R1.subj + '. ' + x.then + ', ' + x.me + ' ' + x.M1.cond + '.',
        x => 'Si ' + x.opp + ' ' + x.R1.pres + ', ' + x.me + ' ' + x.M1.cond + '.',
        x => 'La millor resposta ' + de(x.opp) + ' és ' + x.R1.inf + '. I ' + x.me + ' ' + x.M1.cond + '.',
        x => 'Primer, ' + x.opp + ' ' + x.R1.cond + '; després, ' + x.me + ' ' + x.M1.cond + '.',
        x => 'Fixeu-vos-hi: ' + x.opp + ' ' + x.R1.pres + ' i ' + x.me + ' ' + x.M1.pres + '.',
        x => 'Jo hi veig això: ' + x.opp + ' ' + x.R1.pres + ', i ' + x.me + ' ' + x.M1.pres + '.',
        x => 'Mirant dues jugades endavant, ' + x.opp + ' ' + x.R1.pres + ' i ' + x.me + ' ' + x.M1.pres + '.',
        x => 'El més probable és que ' + x.opp + ' ' + x.R1.subj + '. ' + x.then + ', ' + x.me + ' ' + x.M1.cond + '.'
    ];
    // Per als avançats, de tant en tant, la profunditat de l'anàlisi.
    const DEPTH_OPENER = x => 'A profunditat ' + x.depth + ', preveig que ' + x.opp + ' ' + x.R1.subj + '. ' +
        x.then + ', ' + x.me + ' ' + x.M1.cond + '.';
    const LINE_SECOND = [
        x => ' Després, ' + x.opp + ' ' + x.R2.cond + ' i ' + x.me + ' ' + x.M2.cond + '.',
        x => ' I la cosa continua: ' + x.opp + ' ' + x.R2.pres + ' i ' + x.me + ' ' + x.M2.pres + '.',
        x => ' Quan ' + x.opp + ' ' + x.R2.subj + ', ' + x.me + ' ' + x.M2.cond + '.',
        x => ' A la jugada següent, ' + x.me + ' ' + x.M2.cond + ', després que ' + x.opp + ' ' + x.R2.subj + '.'
    ];
    // Segona parella compacta: només la intenció del bàndol del pla.
    const LINE_COMPACT = [
        x => ' I, a la jugada següent, ' + x.me + ' ' + x.M2.cond + '.',
        x => ' Tot seguit, ' + x.me + ' ' + x.M2.cond + '.',
        x => ' I encara més: ' + x.me + ' ' + x.M2.cond + '.'
    ];
    const LINE_THIRD = [
        x => ' I, una jugada més enllà, ' + x.me + ' ' + x.M3.cond + '.',
        x => ' Per acabar, ' + x.me + ' ' + x.M3.cond + '.'
    ];

    // Lògica estratègica per tema. p: paràmetres del tema i bàndols
    // (S/s amb majúscula o no, Opp/opp, oppAdj).
    const THEME_TEXTS = {
        material: [
            p => 'Al final de la línia, ' + p.s + ' guanyen ' + p.word + p.because + '.',
            p => 'Aquí hi ha premi: ' + p.s + ' es queden amb ' + p.word + ' de més' + p.because + '.',
            p => 'Hi veig un guany net per a ' + p.s + ': ' + p.word + p.because + '.',
            p => 'És una qüestió de comptes, i surten a favor ' + de(p.s) + ': ' + p.word + ' de més' + p.because + '.'
        ],
        compensation: [
            p => p.S + ' cedirien ' + p.word + ' i, tot i així, encara els veig amb avantatge.',
            p => 'Continuo veient millor ' + p.s + ' encara que cedeixin ' + p.word + '.',
            p => 'La línia deixa ' + p.s + ' amb menys material, ' + p.word + ' menys, i amb una posició que veig més favorable.'
        ],
        fork: [
            p => 'La forquilla és l’arma: amb una sola jugada, ' + p.piece + ' ataca dues peces alhora.',
            p => 'Dues peces atacades i una sola jugada per salvar-les: aquesta és la força de la forquilla.',
            p => 'Una forquilla de manual. ' + p.Opp + ' no poden apartar les dues peces de cop.'
        ],
        pin: [
            p => p.absolute ? capFirst(p.target) + ' queda ' + agree(p.type, 'clavat', 'clavada') + ' al rei: no es pot apartar de la línia, i ' + p.s + ' hi poden carregar més pressió.'
                : 'Una clavada molesta: si ' + p.target + ' es mou, la peça de darrere queda exposada.',
            p => 'La clavada limita els moviments de la peça. Apartar-la de la línia deixaria exposada la del darrere.',
            p => 'La clavada lliga les mans ' + de(p.opp) + ': ' + p.target + ' hi és, però no pot fer la seva feina.'
        ],
        attack: [
            p => p.S + ' sumen peces a l’atac: al final de la línia, ' + p.nWord + ' peces apunten al voltant del rei ' + p.oppAdj + '.',
            p => 'El rei ' + p.oppAdj + ' és l’objectiu. Cada jugada ' + de(p.s) + ' hi acosta una peça més.',
            p => 'És un pla d’atac: ' + p.s + ' juguen contra el rei, i ' + p.opp + ' hauran de defensar-se amb precisió.',
            p => 'Quan les peces s’apilen al voltant del rei, els escacs i les amenaces arriben sols.'
        ],
        passed: [
            p => 'Tot gira al voltant del peó passat: ' + (p.left === 1 ? 'només li falta una casella' : 'li falten ' + numWord(p.left, true) + ' caselles') + ' per coronar.',
            p => 'Un peó passat és un candidat a dama: cada pas endavant obliga ' + p.opp + ' a dedicar-li més peces.',
            p => p.S + ' empenyen el peó passat. Com més avança, més peces rivals queden lligades a aturar-lo.',
            p => 'El peó passat marca el ritme: ' + p.opp + ' l’han de vigilar mentre ' + p.s + ' el fan avançar.'
        ],
        'files-file': [
            p => 'El pla és dominar la columna ' + (p.open ? 'oberta' : 'semioberta') + ': és l’autopista de les torres cap al camp rival.',
            p => 'Qui controla una columna sense peons propis pot entrar al camp contrari. Per això ' + p.s + ' hi porten les peces majors.',
            p => 'Les torres volen columnes netes, sense peons propis al davant, i ' + p.s + ' n’han trobat una.',
            p => 'Aquesta columna és la porta d’entrada: ' + p.s + ' la volen controlar abans que ' + p.opp + '.'
        ],
        'files-double': [
            p => 'Dues peces majors a la mateixa columna multipliquen la força: és una bateria en tota regla.',
            p => 'Doblar les peces majors vol dir pressionar la columna amb el doble de força.',
            p => 'Una peça major sola pressiona; dues, alineades, poden trencar la defensa.'
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
        tempo: [
            p => p.S + ' guanyarien un temps atacant ' + p.target + ': ' + p.opp + ' gastarien la resposta a apartar-' + clitic(p.type) + '.',
            p => 'L’atac a ' + p.target + ' faria guanyar un temps a ' + p.s + '. La resposta prevista és apartar-' + clitic(p.type) + '.',
            p => p.Opp + ' apartarien ' + p.target + '. Així, ' + p.s + ' guanyarien un temps per al seu pla.'
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
            p => 'Fora les dames! Ara manen l’estructura de peons i l’activitat de les peces que queden.'
        ],
        'trade-offer-ahead': [
            p => 'Amb avantatge, ' + p.s + ' ofereixen canvis: cada peça que surt del tauler acosta un final favorable.',
            p => p.S + ' ofereixen el canvi ' + de(PLURAL[p.type]) + '. Qui va per davant vol simplificar.'
        ],
        'trade-offer-equal': [
            p => 'Si ' + p.opp + ' accepten el canvi ' + de(PLURAL[p.type]) + ', la posició se simplifica; si no, hauran de cedir terreny.',
            p => 'Oferir el canvi ' + de(PLURAL[p.type]) + ' és una pregunta al rival: canviar o retirar-se.',
            p => 'Un canvi ofert obliga a decidir: ' + p.opp + ' han de canviar o deixar el lloc a ' + p.s + '.'
        ],
        'trade-offer-behind': [
            p => p.S + ' ofereixen el canvi ' + de(PLURAL[p.type]) + ': amb menys peces rivals actives, la defensa és més senzilla.',
            p => 'Quan es pateix, canviar peces ajuda. Per això ' + p.s + ' ofereixen el canvi ' + de(PLURAL[p.type]) + '.'
        ],
        outpost: [
            p => capFirst(p.piece) + ' busca un lloc avançat on cap peó rival no ' + pronoun(p.type) + ' pot fer fora.',
            p => 'Plantat en un lloc avançat i protegit per un peó, ' + p.piece + ' és un maldecap per a ' + p.opp + '.',
            p => 'Des d’allà, ' + p.piece + ' controla el camp rival, i cap peó no ' + pronoun(p.type) + ' pot molestar.'
        ],
        maneuver: [
            p => 'És una maniobra: ' + p.piece + ' fa dues passes per trobar una casella millor. Abans controlava ' + numWord(p.n0, true) + ' caselles; ara, ' + numWord(p.n1, true) + '.',
            p => capFirst(p.piece) + ' canvia de lloc dues vegades. No té pressa: busca on serà més útil.',
            p => 'Les maniobres també són estratègia: ' + p.piece + ' fa la volta per guanyar activitat.'
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
        diagonal: [
            p => p.fianchetto ? 'Amb el fianchetto, l’alfil escombra la gran diagonal d’una punta a l’altra del tauler.'
                : 'La gran diagonal és una carretera directa cap al camp rival, i ' + p.s + ' hi planten l’alfil.',
            p => 'Un alfil a la gran diagonal pot fer mal des de molt lluny, sense ni tan sols moure’s.'
        ],
        'king-active': [
            p => 'En el final, el rei deixa de ser un problema i esdevé una peça d’atac: s’acosta al centre per donar suport als peons.',
            p => 'Amb poques peces sobre el tauler, el rei ha de jugar. ' + p.S + ' l’activen cap al centre.',
            p => 'Als finals, qui té el rei més actiu sol manar: des del centre arriba abans a tots dos flancs.',
            p => 'És una cursa de reis: el que arribi primer als peons rivals decidirà molt.'
        ],
        defence: [
            p => p.S + ' han de consolidar: primer defensen el que està atacat, i només després podran pensar a atacar.',
            p => 'És un moment defensiu per a ' + p.s + '. En aquesta línia han de consolidar la posició abans de buscar activitat.',
            p => 'Defensar bé també és jugar bé: ' + p.s + ' tapen els forats abans de buscar res més.'
        ],
        tension: [
            p => 'Aquí mana el càlcul concret: cada jugada canvia l’equilibri de la posició.',
            p => 'La posició té tensió: hi ha peces en contacte, i cada jugada ho ha de tenir en compte.',
            p => 'És un estira-i-arronsa: amenaça, resposta i una nova amenaça. Qui s’equivoqui primer ho pagarà.',
            p => 'Hi ha moltes peces en contacte. En posicions així, calcular bé val més que qualsevol pla general.'
        ],
        quiet: [
            p => 'Són jugades de maniobra: ningú no força res, i cada bàndol busca les millors caselles per a les peces.',
            p => 'Una fase tranquil·la. Els dos bàndols tenen temps per recol·locar les peces.',
            p => 'No hi ha cap cop immediat: la lluita és posicional, de peces ben situades.'
        ]
    };
    const CAUSES = {
        free: v => ', perquè ' + v + ' queda sense defensa',
        outnumbered: v => ', perquè ' + v + ' té més atacants que defensors'
    };
    // Valoració final de la línia.
    const EVAL_TEXTS = {
        equal: [() => 'Veig la posició equilibrada.', () => 'Tot i així, ho veig equilibrat.',
            () => 'No hi veig cap avantatge clar.', () => 'La balança, de moment, queda equilibrada.',
            () => 'Ara com ara, cap bàndol no en surt clarament millor.'],
        slight: [x => 'Hi veig un lleuger avantatge per a ' + x.who + x.pawns + '.',
            x => 'Al final de la línia, ' + x.who + ' quedarien una mica millor' + x.pawns + '.',
            x => 'La balança s’inclina lleugerament cap a ' + x.who + x.pawns + '.'],
        clear: [x => 'Veig ' + x.who + ' clarament millor' + x.pawns + '.',
            x => 'Hi veig un avantatge clar per a ' + x.who + x.pawns + '.',
            x => 'La valoració és clara: ' + x.who + ' estan millor' + x.pawns + '.'],
        decisive: [x => 'Diria que ' + x.who + ' ja tenen una posició guanyadora' + x.pawns + '.',
            x => 'Ara mateix veig ' + x.who + ' amb opcions clares de guanyar' + x.pawns + '.']
    };

    // Seguiment: s'ha complert la previsió.
    const HIT_QUESTIONS = [
        x => 'Grau, és la jugada que anunciaves?',
        x => 'Això ja ho havies vist venir, oi, Grau?',
        x => 'Es compleix el que havies previst?',
        x => 'És el pla que explicaves fa un moment?',
        x => 'Grau, la partida va pel camí que deies?',
        x => 'Tal com havies dit, oi?'
    ];
    const HIT_OPENERS = [
        x => 'Exacte. ',
        x => 'Sí, tal com havia previst ' + x.ago + '. ',
        x => 'Dit i fet: ',
        x => 'Sí, és la línia prevista. ',
        x => 'Efectivament. ',
        x => 'Ho veieu? '
    ];
    const HIT_SOLO = [
        x => 'Es compleix la nostra previsió.',
        x => 'Tal com s’havia anunciat ' + x.ago + '.',
        x => 'És la jugada que havíem previst.'
    ];
    // Seguiment: un bàndol se surt de la línia.
    const MISS_QUESTIONS = [
        x => 'Grau, això t’ho esperaves?',
        x => 'Canvi de guió, Grau?',
        x => capFirst(x.side) + ' se surten de la línia prevista. Què en penses, Grau?',
        x => 'Grau, quina jugada tenies prevista?',
        x => 'Sorpresa, Grau?'
    ];
    const MISS_ANSWERS = [
        x => 'Esperava que ' + x.side + ' ' + x.expectedPast + '.',
        x => capFirst(x.side) + ' trien un altre camí. Jo hi veia ' + x.expected + '.',
        x => 'Em sorprèn. Em semblava més natural ' + x.expected + '.'
    ];
    const MISS_SOLO = [
        x => capFirst(x.side) + ' se surten de la línia que havíem analitzat.',
        x => 'És diferent de la continuació que havíem previst.'
    ];
    const MISS_ASSESS = {
        equal: [x => 'La veig pràcticament igual de bona.', x => 'La valoració gairebé no canvia.',
            x => 'No passa res: és una alternativa equivalent.'],
        slight: [x => 'La valoració empitjora una mica per a ' + x.side + '.', x => 'La trobo una mica més imprecisa.'],
        clear: [x => 'I surt cara. La posició ' + de(x.side) + ' empitjora clarament' + x.pawns + '.',
            x => 'Hi veig una imprecisió clara' + x.pawns + '.']
    };
    // Continuació d'un fil de conflicte: la línia de Stockfish hi torna.
    const TAIL_TEXTS = {
        attack: [x => 'I no s’acaba aquí. Preveig que ' + x.S + ' ' + x.subj + '.',
            x => 'La pressió podria continuar. En aquesta línia, ' + x.S + ' ' + x.cond + '.'],
        capture: [x => 'Ja hi veig una captura. ' + x.S + ' ' + x.cond + '.'],
        defend: [x => 'Preveig que ' + x.S + ' ' + x.subj + '.']
    };
    const NEXT_TEXTS = [
        x => ' Ara preveig que ' + x.opp + ' ' + x.R1.subj + '.',
        x => ' I la cosa continua: ' + x.opp + ' ' + x.R1.cond + '.'
    ];
    // En Grau explica una jugada (diàlegs sobre el fet de la jugada).
    const MOVE_OPENERS = ['', 'La idea és clara: ', 'Senzill: ', 'Fixeu-vos-hi: ', ''];

    // ------------------------------------------------------------------
    // Memòria i varietat
    // ------------------------------------------------------------------
    function emptyMemory() {
        return { lastPlanPly: -100, lastColor: null, plans: 0, forecast: null, recent: {}, lastBand: null,
            lastMissPly: -100, lastFollowPly: -100, ids: null, prevIds: null };
    }
    function normalize(m) {
        const base = emptyMemory();
        if (!m || typeof m !== 'object') return base;
        const out = Object.assign(base, m);
        out.recent = Object.assign({}, m.recent || {});
        out.forecast = m.forecast ? JSON.parse(JSON.stringify(m.forecast)) : null;
        return out;
    }
    function pick(mem, family, items, seed, accept) {
        const recent = mem.recent[family] || [];
        const keep = Math.min(3, Math.max(0, items.length - 1));
        const start = ((seed % items.length) + items.length) % items.length;
        let chosen = -1;
        for (let pass = 0; pass < 2 && chosen < 0; pass++) {
            for (let i = 0; i < items.length; i++) {
                const id = (start + i) % items.length;
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
    // ctx = { ChessCtor, fenBefore, fenAfter, move, prevMove, after, ply, tier,
    //         gameId, moveText (el fet de la jugada que diu l'Èlia), prepared, end }
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
        const reading = readLine(c.ChessCtor, c.fenAfter, c.after.pv, { prev: c.move, ids: mem.ids });
        if (!B || !reading || reading.steps.length < CONFIG.MIN_PLIES) return null;
        const steps = reading.steps;
        if (steps.slice(0, 2).some(s => s.mate)) return null;
        const tier = ['basic', 'mid', 'advanced'].indexOf(c.tier) !== -1 ? c.tier : 'mid';
        const band = bandOf(c.after.best);
        const seed = hash((c.gameId || '') + ':' + c.ply + ':' + mem.plans);
        const names = { me: SIDE[me].pl, opp: SIDE[opp].pl };

        // --- Narració de la línia, amb pressupost de paraules ---
        const R1 = phrase(steps[0]), M1 = phrase(steps[1]);
        if (!R1 || !M1) return null;
        // La mateixa intenció amb la mateixa frase: «tornarien a…».
        const repeat = (a, b) => !!(a && b && a.key === b.key && a.obj === b.obj);
        let M2 = phrase(steps[3]);
        if (repeat(M1, M2)) M2 = phrase(steps[3], { again: true });
        const R2 = phrase(steps[2]);
        // Sense la resposta rival narrada, no es pot dir «aquest cavall».
        const M2bare = steps[3] ? phrase(steps[3], { noDemo: true, again: repeat(M1, M2) }) : null;
        const M3 = phrase(steps[5], { noDemo: true });
        const openerId = pick(mem, 'opener', LINE_OPENERS, seed);
        const thenWord = THEN[(seed >> 3) % THEN.length];
        const useDepth = tier === 'advanced' && mem.plans % 3 === 1;
        const base = Object.assign({}, names, { then: thenWord, depth: c.after.depth });
        const secondId = R2 && M2 ? pick(mem, 'second', LINE_SECOND, seed >> 2,
            id => !((openerId === 3 && id === 0) || (openerId === 0 && id === 2) || (openerId === 1 && id === 2))) : 0;
        const thirdId = M3 ? pick(mem, 'third', LINE_THIRD, seed >> 4) : 0;
        const compactId = M2 ? pick(mem, 'compact', LINE_COMPACT, seed >> 9) : 0;
        const opener = x => useDepth ? DEPTH_OPENER(x) : LINE_OPENERS[openerId](x);
        // De més a menys complet: es queda la primera que cap. La segona
        // parella es diu sencera si la resposta rival explica alguna cosa;
        // si no, només amb la intenció del bàndol del pla.
        const configs = [];
        const wantSecond = tier !== 'basic' && R2 && M2 && !M2.generic;
        const wantThird = tier === 'advanced' && M3 && !M3.generic && stepScore(steps[5]) >= 40;
        if (wantSecond && wantThird) configs.push({ n: 6 });
        if (wantSecond && !R2.generic) configs.push({ n: 4 });
        if (wantSecond) configs.push({ n: 4, compact: true });
        configs.push({ n: 2 });
        let line = null, narrated = 2;
        // Abans de passar a la versió compacta, es proven les altres maneres
        // de dir la segona parella (n'hi ha de més curtes).
        const secondOrder = [secondId].concat(LINE_SECOND.map((f, i) => i).filter(i => i !== secondId &&
            !((openerId === 3 && i === 0) || (openerId === 0 && i === 2) || (openerId === 1 && i === 2))));
        for (const cfg of configs) {
            const x = Object.assign({}, base, { R1: R1, M1: M1, R2: R2, M2: cfg.compact ? M2bare : M2, M3: M3 });
            const seconds = cfg.n >= 4 && !cfg.compact ? secondOrder : [null];
            for (const id of seconds) {
                let text = opener(x);
                if (cfg.n >= 4) text += cfg.compact ? LINE_COMPACT[compactId](x) : LINE_SECOND[id](x);
                if (cfg.n >= 6) text += LINE_THIRD[thirdId](x);
                if (wordCount(text) <= CONFIG.LINE_WORDS[tier]) { line = tidy(text); narrated = cfg.n; break; }
            }
            if (line) break;
        }
        if (!line) return null;
        const said = [R1, M1, R2, M2, null, M3].slice(0, narrated).filter(ph => ph && !ph.generic);

        // --- Tema: només amb les jugades que s'han explicat ---
        const told = steps.slice(0, narrated);
        const baseGrid = c.move.captured && c.fenBefore ? B.parse(c.fenBefore) : null;
        const sub = subReading(reading, narrated, baseGrid);
        const themeCtx = { band: band, ply: c.ply, moveCaptured: !!c.move.captured, mover: me };
        const mineTheme = themeFor(B, sub, me, themeCtx);
        const theirTheme = themeFor(B, sub, opp, themeCtx);
        const theme = (theirTheme && (!mineTheme || theirTheme.score > mineTheme.score)) ? theirTheme
            : (mineTheme || { id: 'quiet', score: 10, side: me, params: {} });
        // Sense una idea concreta, la variant ja es pot llegir a la pantalla.
        if (!said.length || ['quiet', 'tension'].includes(theme.id)) return null;
        const S = theme.side;

        // --- Lògica estratègica i valoració ---
        const p = Object.assign({}, theme.params, { S: SIDE[S].Pl, s: SIDE[S].pl, Opp: SIDE[other(S)].Pl, opp: SIDE[other(S)].pl,
            oppAdj: SIDE[other(S)].adj });
        let family = theme.id;
        if (theme.id === 'files') family = 'files-' + theme.params.kind;
        if (theme.id === 'trades') family = 'trades-' + theme.params.mood;
        if (theme.id === 'trade-offer') family = 'trade-offer-' + theme.params.mood;
        if (theme.id === 'material') p.because = theme.params.cause && theme.params.victim ? CAUSES[theme.params.cause](theme.params.victim) : '';
        if (theme.id === 'attack') p.nWord = numWord(theme.params.n, true);
        if (theme.id === 'pressure') {
            const t = theme.params;
            p.clitic = clitic(t.type);
            p.nWord = numWord(t.n, true);
            p.nMasc = numWord(t.n, false);
            p.defClause = t.d ? 'i ' + pronoun(t.type) + ' defensen ' + numWord(t.d, true) : 'i ningú no ' + pronoun(t.type) + ' defensa';
            p.dMasc = t.d ? numWord(t.d, false) + (t.d === 1 ? ' defensor' : ' defensors') : 'cap defensor';
        }
        const texts = THEME_TEXTS[family] || THEME_TEXTS.quiet;
        const attackAccept = theme.id === 'attack' && theme.params.n <= theme.params.n0 ? (id => id !== 1) : null;
        const logic = texts[pick(mem, family, texts, seed >> 1, attackAccept)](p);
        let evalText = '';
        if (band) {
            const showEval = tier === 'advanced' || band !== mem.lastBand ||
                ['material', 'compensation', 'trades'].indexOf(theme.id) !== -1;
            if (showEval && !(tier === 'basic' && band === 'equal' && mem.lastBand === null)) {
                const level = band === 'equal' ? 'equal' : band.slice(2);
                const who = band === 'equal' ? '' : SIDE[band[0]].pl;
                const pawns = tier === 'advanced' && band !== 'equal' ? ' (uns ' + pawnsText(c.after.best.value) + ' peons)' : '';
                const evals = EVAL_TEXTS[level];
                const sample = i => evals[i]({ who: who, pawns: pawns });
                const echo = i => /Al final de la línia/.test(logic) && /Al final de la línia/.test(sample(i));
                evalText = sample(pick(mem, 'eval-' + level, evals, seed >> 5, id => !echo(id)));
            }
        }

        // --- Torns ---
        const questions = THEME_QUESTIONS[family] || THEME_QUESTIONS[theme.id];
        if (!questions) return null;
        const question = questions[pick(mem, 'question-' + family, questions, seed >> 6)];
        const moveText = String(c.moveText || '').trim();
        const q1 = moveText ? moveText + ' ' + question : question;
        const solo = (moveText ? moveText + ' ' : '') + 'Mirem com podria continuar.';
        const max = CONFIG.MAX_WORDS[tier];
        const answer = /^(Al final de la línia|En aquesta línia|Hi veig)\b/.test(logic) ? logic : 'En aquesta línia, ' + lowFirst(logic);
        const ask = { role: 'presenter', text: q1, solo: solo };
        const grau = text => ({ role: 'analyst', text: text });
        const proof = { role: 'presenter', text: PROOF_QUESTIONS[pick(mem, 'proof', PROOF_QUESTIONS, seed >> 8)],
            solo: 'Vegem-ho al tauler.' };
        const options = [];
        if (tier !== 'basic') {
            if (evalText) options.push([ask, grau(answer), proof, grau(line + ' ' + evalText)]);
            options.push([ask, grau(answer), proof, grau(line)]);
        }
        if (evalText) options.push([ask, grau(answer + ' ' + line + ' ' + evalText)]);
        options.push([ask, grau(answer + ' ' + line)]);
        // Si la demostració sencera només hi cap a la pantalla, conservem l'explicació.
        options.push([ask, grau(answer)]);
        const turns = options.find(t => wordCount(t.map(x => x.text).join(' ')) <= max);
        if (!turns) return null;

        // --- Previsió per al seguiment: la jugada clau ja dita del bàndol S ---
        const ofS = told.filter(s => s.color === S);
        const key = ofS.slice().sort((a, b) => stepScore(b) - stepScore(a) || a.index - b.index)[0] || told[1];
        if (turns.some(turn => turn.text.includes(line))) {
            mem.forecast = { ply: c.ply, color: me, side: S, line: told.map(s => s.uci), keyIndex: key.index,
                theme: theme.id, matched: 0 };
        }
        mem.lastPlanPly = c.ply;
        mem.lastColor = me;
        mem.plans += 1;
        if (evalText && turns.some(turn => turn.text.includes(evalText))) mem.lastBand = band;
        return {
            kind: 'plan', theme: theme.id, side: S, turns: turns,
            forecast: { from: c.ply + 1, san: sanLine(c.fenAfter, told), uci: told.map(s => s.uci) },
            memory: mem
        };
    }

    // ------------------------------------------------------------------
    // Seguiment (a cada semijugada): identitat de les peces i previsió
    // ------------------------------------------------------------------
    function track(ctx, memory) {
        const c = ctx || {};
        const mem = normalize(memory);
        if (!c.move || !Number.isInteger(c.ply)) return { event: null, memory: mem };
        // Les peces es reconeixen des de la posició inicial; si la partida
        // comença en una altra posició, cavalls i torres van sense ala.
        if (!mem.ids && c.ply === 0 && String(c.fenBefore || '').split(' ')[0] === START_PLACEMENT) mem.ids = startIds();
        mem.prevIds = mem.ids;
        mem.ids = moveIds(mem.ids, c.move);
        const f = mem.forecast;
        if (!f) return { event: null, memory: mem };
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

    // La intenció d'una jugada concreta (la feta o una alternativa) des de fen.
    // opts = { prev (moviment anterior), ids (identitats abans de la jugada) }
    function intentAt(ChessCtor, fen, uci, opts) {
        const B = board();
        const o = opts || {};
        if (!B || typeof ChessCtor !== 'function') return null;
        const step = readStep(B, ChessCtor, fen, uci, o.prev ? { move: o.prev } : null, o.ids || null);
        return step ? phrase(step, { noDemo: !!o.noDemo }) : null;
    }

    // En Grau explica la jugada que s'acaba de fer, en present i sense
    // caselles. null si no hi ha cap intenció més enllà del moviment.
    function explainMove(ctx, memory) {
        const c = ctx || {};
        const mem = normalize(memory);
        if (!c.move || !c.ChessCtor || !c.fenBefore) return null;
        const ph = intentAt(c.ChessCtor, c.fenBefore, moveUci(c.move), { prev: c.prevMove, ids: mem.prevIds });
        if (!ph || ph.generic) return null;
        const seed = hash((c.gameId || '') + ':move:' + c.ply);
        const opener = MOVE_OPENERS[pick(mem, 'move-opener', MOVE_OPENERS, seed)];
        const sentence = capFirst(SIDE[c.move.color].pl) + ' ' + ph.pres + '.';
        return { text: tidy(opener ? opener + lowFirst(sentence) : sentence), memory: mem };
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
        const lead = c.moveText ? String(c.moveText).trim() + ' ' : '';
        let turns;
        if (event.kind === 'hit') {
            const ph = intentAt(c.ChessCtor, c.fenBefore, moveUci(c.move), { prev: c.prevMove, ids: mem.prevIds, noDemo: true });
            if (!ph) return null;
            const x = { ago: agoText(c.ply - event.ply) };
            const opener = HIT_OPENERS[pick(mem, 'hit-opener', HIT_OPENERS, seed)](x);
            const fact = capFirst(side) + ' ' + ph.pres + '.';
            let answer = opener + (/: $/.test(opener) ? lowFirst(fact) : fact);
            // I la mirada endavant continua: la resposta que ara espera Stockfish.
            if (eligible(c)) {
                const next = readLine(c.ChessCtor, c.fenAfter, c.after.pv, { plies: 1, extend: 1, prev: c.move, ids: mem.ids });
                const R1 = next && next.steps[0] ? phrase(next.steps[0]) : null;
                if (R1 && !R1.generic) {
                    const extra = NEXT_TEXTS[pick(mem, 'next', NEXT_TEXTS, seed >> 2)]({ opp: SIDE[other(c.move.color)].pl, R1: R1 });
                    if (wordCount(answer + extra) <= CONFIG.FOLLOW_WORDS - 10) answer += extra;
                }
            }
            const q = lead + HIT_QUESTIONS[pick(mem, 'hit-question', HIT_QUESTIONS, seed >> 1)]({});
            const solo = lead + HIT_SOLO[pick(mem, 'hit-solo', HIT_SOLO, seed >> 3)](x);
            turns = [{ role: 'presenter', text: q, solo: solo }, { role: 'analyst', text: tidy(answer) }];
        } else if (event.kind === 'miss') {
            const a = c.before, b = c.after;
            const reliable = a && b && a.reliable && b.reliable && a.best && b.best && a.best.type === 'cp' && b.best.type === 'cp';
            const loss = reliable ? (a.best.value - b.best.value) * (c.move.color === 'w' ? 1 : -1) : null;
            const notable = isNum(loss) && loss >= CONFIG.MISS_NOTABLE_CP;
            if (!notable && c.ply - mem.lastMissPly < CONFIG.MISS_GAP_PLIES) return null;
            const ex = intentAt(c.ChessCtor, c.fenBefore, event.expected, { prev: c.prevMove, ids: mem.prevIds, noDemo: true });
            if (!ex) return null;
            const x = { side: side, expected: ex.inf, expectedPast: ex.past, pawns: '' };
            let answer = MISS_ANSWERS[pick(mem, 'miss-answer', MISS_ANSWERS, seed)](x);
            if (isNum(loss)) {
                const level = loss <= CONFIG.MISS_EQUAL_CP ? 'equal' : loss < CONFIG.MISS_CLEAR_CP ? 'slight' : 'clear';
                if (level === 'clear' && c.tier === 'advanced') x.pawns = ', d’uns ' + pawnsText(loss) + ' peons';
                const items = MISS_ASSESS[level];
                answer += ' ' + items[pick(mem, 'miss-' + level, items, seed >> 2)](x);
            }
            const q = lead + MISS_QUESTIONS[pick(mem, 'miss-question', MISS_QUESTIONS, seed >> 1)]({ side: side });
            const solo = lead + MISS_SOLO[pick(mem, 'miss-solo', MISS_SOLO, seed >> 3)](x);
            if (wordCount(q + ' ' + answer) > CONFIG.FOLLOW_WORDS + 6) return null;
            turns = [{ role: 'presenter', text: q, solo: solo }, { role: 'analyst', text: tidy(answer) }];
            mem.lastMissPly = c.ply;
        } else return null;
        mem.lastFollowPly = c.ply;
        return { kind: event.kind === 'hit' ? 'forecast-hit' : 'forecast-miss', turns: turns, memory: mem };
    }

    // Frase final per a un fil de conflicte: la primera jugada de la línia
    // de Stockfish que torna a la mateixa casella (l'ataca, la captura o la
    // defensa). Retorna null si la línia no hi diu res.
    function tail(ctx, square, memory) {
        const c = ctx || {};
        if (!eligible(c) || !square) return null;
        const mem = normalize(memory);
        const reading = readLine(c.ChessCtor, c.fenAfter, c.after.pv, { plies: 2, extend: 2, prev: c.move, ids: mem.ids });
        if (!reading) return null;
        const seed = hash((c.gameId || '') + ':tail:' + c.ply);
        for (const s of reading.steps) {
            const f = s.facts;
            const kind = f.capture && f.capture.sq === square ? 'capture'
                : f.attack && f.attack.sq === square ? 'attack'
                : f.defend && f.defend.sq === square ? 'defend' : null;
            if (!kind) continue;
            const ph = phrase(s, { purpose: false, noDemo: s.index > 0 });
            if (!ph) return null;
            const items = TAIL_TEXTS[kind];
            const text = items[pick(mem, 'tail-' + kind, items, seed)]({ S: SIDE[s.color].pl, subj: ph.subj, cond: ph.cond });
            return { text: tidy(text), memory: mem };
        }
        return null;
    }

    // ------------------------------------------------------------------
    // La veu de l'Èlia: el fet de la jugada, també sense caselles
    // ------------------------------------------------------------------
    // L'Èlia anuncia la jugada amb la seva intenció: «Les blanques treuen el
    // cavall del rei per controlar el centre.»
    function sayMove(ctx, memory) {
        const c = ctx || {};
        const mem = normalize(memory);
        if (!c.move || !c.ChessCtor || !c.fenBefore) return null;
        const ph = intentAt(c.ChessCtor, c.fenBefore, moveUci(c.move), { prev: c.prevMove, ids: mem.prevIds, noDemo: true });
        return ph ? tidy(capFirst(SIDE[c.move.color].pl) + ' ' + ph.pres + '.') : null;
    }

    // Què s'ha jugat, sense caselles ni intenció (per a les preguntes de
    // l'Èlia als diàlegs: la intenció l'explica en Grau). Els peons, pels
    // noms clàssics: el peó de rei, el peó d'alfil de dama...
    const PAWN_FILE = { a: 'el peó de torre de dama', b: 'el peó de cavall de dama', c: 'el peó d’alfil de dama', d: 'el peó de dama',
        e: 'el peó de rei', f: 'el peó d’alfil de rei', g: 'el peó de cavall de rei', h: 'el peó de torre de rei' };
    function describeMove(ctx, memory) {
        const c = ctx || {};
        const B = board();
        const mem = normalize(memory);
        if (!B || !c.move || !c.ChessCtor || !c.fenBefore) return null;
        const step = readStep(B, c.ChessCtor, c.fenBefore, moveUci(c.move), c.prevMove ? { move: c.prevMove } : null, mem.prevIds);
        if (!step) return null;
        const mv = step.move, f = step.facts, color = step.color, side = SIDE[color].Pl;
        const type = mv.promotion || mv.piece;
        const mover = mv.piece === 'p' ? 'un peó' : pieceName(B, type, color, mv.to, step.grid, step.ids);
        const chk = step.mate ? ', amb escac i mat' : step.check ? ', amb escac' : '';
        let text;
        if (f.castle) text = side + ' enroquen ' + f.castle + chk;
        else if (mv.promotion) text = side + ' coronen un peó' + chk;
        else if (f.capture) {
            const victim = pieceName(B, f.capture.type, other(color), f.capture.sq, step.gridBefore, step.idsBefore, { color: true });
            text = side + ' capturen ' + victim + ' amb ' + mover + chk;
        } else if (step.check) text = side + ' fan escac amb ' + mover;
        else if (mv.piece === 'p') text = side + ' avancen ' + PAWN_FILE[mv.from[0]] +
            (Math.abs(Number(mv.to[1]) - Number(mv.from[1])) === 2 ? ' dues caselles' : '');
        else if (f.develop) text = side + ' treuen ' + mover;
        else if (f.retreat && mv.piece !== 'k') text = side + ' repleguen ' + mover;
        else text = side + ' porten ' + mover + ' ' + zoneOf(step.grid, mv.to, color);
        return tidy(text + '.');
    }

    // Traducció dels fets verificats que porten caselles: cada peça es diu
    // pel seu nom al tauler («el peó d'e5» → «el peó central negre»), les
    // caselles de destinació desapareixen i les columnes van sense lletra.
    // Retorna null si alguna casella no es pot treure amb seguretat.
    const TYPE_OF = { 'peó': 'p', 'cavall': 'n', 'alfil': 'b', 'torre': 'r', 'dama': 'q', 'rei': 'k' };
    const FILE_PAWN = { a: 'de torre', h: 'de torre', b: 'de cavall', g: 'de cavall', c: 'd’alfil', f: 'd’alfil', d: 'de dama', e: 'de rei' };
    const SQ_RE = /\b[a-h][1-8]\b/;
    function colorAdj(type, color) { return FEM[type] ? SIDE[color].adjF : SIDE[color].adj; }
    function namedPiece(B, K, type, sq, colorHint) {
        let grid = K.after, ids = K.ids, p = grid && at(grid, sq);
        if (!p || (type && p.t !== type)) { grid = K.before; ids = K.prevIds; p = grid && at(grid, sq); }
        if (!p || (type && p.t !== type)) return null;
        const t = p.t, color = p.c;
        if (t === 'p') {
            const name = pawnName(B, grid, sq, color);
            if (!colorHint) return name;
            return /(passat|central)$/.test(name) ? name + ' ' + SIDE[color].adj : name.replace(/peó/, 'peó ' + SIDE[color].adj);
        }
        const name = pieceName(B, t, color, sq, grid, ids, { color: true });
        return name === np(t) || name === 'el rei' ? (colorHint ? name + ' ' + colorAdj(t, color) : name) : name;
    }
    function withPrep(prep, name) {
        const p = String(prep || '').toLowerCase().replace(/’/g, '\'');
        if (/^(del |de la |de l')$/.test(p)) return de(name);
        if (/^(al |a la |a l')$/.test(p)) return /^el /.test(name) ? 'al ' + name.slice(3) : 'a ' + name;
        if (/^(pel |per la |per l')$/.test(p)) return /^el /.test(name) ? 'pel ' + name.slice(3) : 'per ' + name;
        return name;
    }
    function clean(text, ctx, memory) {
        const B = board();
        const c = ctx || {};
        if (!B || !text) return text ? String(text) : null;
        const mem = normalize(memory);
        const K = { after: c.fenAfter ? B.parse(c.fenAfter) : null, before: c.fenBefore ? B.parse(c.fenBefore) : null,
            ids: mem.ids, prevIds: mem.prevIds };
        let t = String(text);
        const upper = s => /^[A-ZÀ-Ý]/.test(s);
        t = t.replace(/\bpeó passat( (?:blanc|negre))? de la columna [a-h]\b/g, (m, adj) => 'peó passat' + (adj || ''));
        t = t.replace(/\bpeó( (?:blanc|negre))? de la columna ([a-h])\b/g, (m, adj, f) => 'peó' + (adj || '') + ' ' + FILE_PAWN[f]);
        t = t.replace(/\b(la|una) casella central [a-h][1-8]\b/gi, (m, art) => (upper(art) ? 'Una' : 'una') + ' casella central');
        t = t.replace(/\b(les caselles centrals),?(?: [a-h][1-8],?)*(?: i [a-h][1-8]),?/gi, '$1');
        t = t.replace(/ a ([a-h][1-8]), la casella de coronació/g, ' a la casella de coronació');
        t = t.replace(/, que arriba a [a-h][1-8]/g, '');
        t = t.replace(/\bpot capturar a ([a-h][1-8])\b/g, (m, sq) => { const n = namedPiece(B, K, null, sq, true); return n ? 'pot capturar ' + n : 'pot capturar'; });
        t = t.replace(/(\b(?:del |al |pel |el |la |l['’]|de la |de l['’]|a la |a l['’]|per la |per l['’]))?\b(peó|cavall|alfil|torre|dama|rei)((?: (?:blanc|negre|blanca|negra|passat))*) (?:de |d['’])([a-h][1-8])\b/gi,
            (m, prep, noun, adjs, sq) => {
                const type = TYPE_OF[noun.toLowerCase()];
                const hint = /blanc|negr/i.test(adjs || '') || null;
                const name = namedPiece(B, K, type, sq, hint) || (np(type) + (adjs || ''));
                const out = withPrep(prep, name);
                return prep && upper(prep) ? capFirst(out) : out;
            });
        t = t.replace(/\bsobre ([a-h][1-8])\b/g, (m, sq) => { const n = namedPiece(B, K, null, sq, true); return n ? 'sobre ' + n : m; });
        t = t.replace(/\b(?:fins a|cap a) [a-h][1-8]\b/g, '');
        t = t.replace(/\bdes (?:de |d['’])[a-h][1-8]\b/g, '');
        t = t.replace(/ a la columna [a-h]\b/g, '');
        t = t.replace(/\bcolumna [a-h]\b/g, 'columna');
        t = t.replace(/,? a [a-h][1-8]\b/g, '');
        t = t.replace(/\s+([,.;:!?])/g, '$1').replace(/:\s*([.;])/g, '$1').replace(/,\s*,/g, ',').replace(/,\s*([.;:!?])/g, '$1')
            .replace(/\s{2,}/g, ' ').trim();
        // Una preposició òrfena o una frase de dues paraules: millor no dir-ho.
        if (SQ_RE.test(t) || /(?:^|\s)(de|d['’]|a|al|del|amb)\s*[.,;:]/i.test(t) || wordCount(t) < 3) return null;
        return t;
    }

    return {
        VERSION: VERSION,
        CONFIG: CONFIG,
        emptyMemory: emptyMemory,
        readLine: readLine,
        intentOf: intentOf,
        intentAt: intentAt,
        phrase: phrase,
        stepScore: stepScore,
        sanLine: sanLine,
        eligible: eligible,
        plan: plan,
        track: track,
        follow: follow,
        tail: tail,
        explainMove: explainMove,
        sayMove: sayMove,
        describeMove: describeMove,
        clean: clean,
        TEXTS: {
            THEME_QUESTIONS: THEME_QUESTIONS, PROOF_QUESTIONS: PROOF_QUESTIONS,
            LINE_OPENERS: LINE_OPENERS, LINE_SECOND: LINE_SECOND, LINE_COMPACT: LINE_COMPACT, LINE_THIRD: LINE_THIRD,
            THEME_TEXTS: THEME_TEXTS, EVAL_TEXTS: EVAL_TEXTS, HIT_QUESTIONS: HIT_QUESTIONS, HIT_OPENERS: HIT_OPENERS,
            MISS_QUESTIONS: MISS_QUESTIONS, MISS_ANSWERS: MISS_ANSWERS, MISS_ASSESS: MISS_ASSESS, TAIL_TEXTS: TAIL_TEXTS,
            MOVE_OPENERS: MOVE_OPENERS
        }
    };
});
