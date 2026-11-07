// ============================================================================
// tallerobertures.js — «La teva obertura»: el taller d'obertures d'un sol tauler
// ============================================================================
// Tota la secció d'Obertures cap en un tauler. Tries color i jugues:
//
//   · A cada posició NOVA decideixes tu la jugada. Stockfish 19 la valida
//     (si és dubtosa, et diu per què i la tornes a provar) i queda desada al
//     teu repertori: UNA posició, UNA jugada (les transposicions compten com
//     la mateixa posició).
//   · El teu PLA surt de les teves decisions: on va cada peça la primera
//     vegada que la mous (cavall a f3, alfil a g2, peó a d4, enroc curt...).
//     Si una jugada nova contradiu el pla sense un motiu concret que
//     Stockfish 19 confirmi, t'ho diem i tries: mantens el pla o el canvies.
//     Així el repertori és coherent: les mateixes idees contra totes les
//     respostes del rival.
//   · A les posicions que ja tens decidides has de RECORDAR la teva jugada.
//     Cada posició té un repàs espaiat (com les targetes de memòria) i el
//     rival tria les respostes de la teoria —filtrades per Stockfish 19— que
//     et porten allà on et toca repassar o on encara no has decidit res.
//   · Mentre jugues, el nom de l'obertura (en català) canvia a cada jugada, i
//     quan surts del llibre la línia passa a ser teva.
//
// La LÒGICA PURA (llibre per posició, noms en català, pla, coherència, repàs,
// tria del rival, lectura de l'UCI) s'exporta també a Node perquè els tests la
// comprovin amb chess.js real. La interfície només s'activa al navegador.
//
//   - Navegador: <script src="tallerobertures.js"> → window.ElTaulerOpeningLab
//   - Node/Jest: require('./tallerobertures') → module.exports
// ============================================================================
(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerOpeningLab = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    const STORE_KEY = 'chess_openingWorkshop_v1';
    // Memòria cau de les anàlisis de Stockfish 19: local (prefix
    // eltauler_cloud_, que la sincronització no puja) perquè no infli el núvol.
    const EVALS_KEY = 'eltauler_cloud_openingEvals';
    const START_KEY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq';
    const DEPTH_OPTIONS = [6, 8, 10, 12];
    const DEFAULT_DEPTH = 8;
    const MAX_EVALS = 700;
    const MAX_NAMED = 40;
    const MAX_NAME = 60;
    const MAX_DECLINED = 200;

    // Llindars de Stockfish 19 (centipeons perduts respecte de la millor).
    const VERDICTS = [
        { id: 'excellent', max: 20, label: 'Excel·lent', ok: true },
        { id: 'good', max: 50, label: 'Sòlida', ok: true },
        { id: 'playable', max: 90, label: 'Jugable', ok: true },
        { id: 'dubious', max: Infinity, label: 'Dubtosa', ok: false }
    ];
    // Una alternativa al pla només es considera justificada si la jugada del
    // pla és clarament pitjor (o il·legal) en aquesta posició.
    const PLAN_EXCEPTION_CP = 30;
    // Repetir peça o treure la dama aviat: només sense motiu si perd més d'això.
    const PRINCIPLE_TOLERANCE_CP = 20;

    // Repàs espaiat per caixes (Leitner). Caixa 0 = ara; 6 = un mes llarg.
    const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
    const SRS_INTERVALS = [0, 10 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];
    const MASTERED_BOX = 3;

    // ------------------------------------------------------------------
    // Utilitats de posició i de PGN
    // ------------------------------------------------------------------
    // Col·locació + torn + enrocs: dues línies que arriben a la mateixa
    // posició per ordres diferents són la mateixa entrada del repertori.
    function positionKey(fen) {
        if (!fen) return '';
        return String(fen).trim().split(/\s+/).slice(0, 3).join(' ');
    }

    function parsePgn(pgn) {
        if (!pgn) return [];
        return String(pgn).replace(/\{[^}]*\}/g, ' ').split(/\s+/)
            .filter(t => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t))
            .map(t => t.replace(/^\d+\.+/, ''))
            .filter(Boolean);
    }

    // ------------------------------------------------------------------
    // Noms d'obertura en català
    // ------------------------------------------------------------------
    const FAMILY_CA = {
        'Sicilian Defense': 'Defensa Siciliana',
        'Ruy Lopez': 'Obertura Espanyola',
        'French Defense': 'Defensa Francesa',
        'Italian Game': 'Obertura Italiana',
        "Queen's Gambit": 'Gambit de Dama',
        "Queen's Gambit Declined": 'Gambit de Dama Refusat',
        "Queen's Gambit Accepted": 'Gambit de Dama Acceptat',
        'English Opening': 'Obertura Anglesa',
        "King's Gambit": 'Gambit de Rei',
        "King's Gambit Accepted": 'Gambit de Rei Acceptat',
        "King's Gambit Declined": 'Gambit de Rei Refusat',
        "King's Indian Defense": 'Defensa Índia de Rei',
        "King's Indian Attack": 'Atac Índi de Rei',
        'Caro-Kann Defense': 'Defensa Caro-Kann',
        'Nimzo-Indian Defense': 'Defensa Nimzo-Índia',
        'Dutch Defense': 'Defensa Holandesa',
        'Semi-Slav Defense': 'Defensa Semieslava',
        'Semi-Slav Defense Accepted': 'Defensa Semieslava Acceptada',
        'Benoni Defense': 'Defensa Benoni',
        "Queen's Pawn Game": 'Joc del Peó de Dama',
        "King's Pawn Game": 'Joc del Peó de Rei',
        "King's Pawn Opening": 'Obertura del Peó de Rei',
        "King's Knight Opening": 'Obertura del Cavall de Rei',
        'Grünfeld Defense': 'Defensa Grünfeld',
        'Neo-Grünfeld Defense': 'Defensa Neo-Grünfeld',
        'Alekhine Defense': 'Defensa Alekhine',
        'Scotch Game': 'Obertura Escocesa',
        'Indian Defense': 'Defensa Índia',
        'Old Indian Defense': 'Defensa Índia Antiga',
        'East Indian Defense': 'Defensa Índia Oriental',
        'Slav Defense': 'Defensa Eslava',
        'Slav Indian': 'Eslava Índia',
        "Petrov's Defense": 'Defensa Petrov',
        "Queen's Indian Defense": 'Defensa Índia de Dama',
        "Queen's Indian Accelerated": 'Índia de Dama Accelerada',
        'Bogo-Indian Defense': 'Defensa Bogo-Índia',
        'Zukertort Opening': 'Obertura Zukertort',
        'Four Knights Game': 'Partida dels Quatre Cavalls',
        'Three Knights Opening': 'Obertura dels Tres Cavalls',
        'Scandinavian Defense': 'Defensa Escandinava',
        'Philidor Defense': 'Defensa Philidor',
        'Nimzowitsch Defense': 'Defensa Nimzowitsch',
        'Nimzo-Larsen Attack': 'Atac Nimzowitsch-Larsen',
        'Vienna Game': 'Obertura de Viena',
        "Bishop's Opening": "Obertura de l'Alfil",
        'Modern Defense': 'Defensa Moderna',
        'Pterodactyl Defense': 'Defensa Pterodàctil',
        'Réti Opening': 'Obertura Réti',
        'Catalan Opening': 'Obertura Catalana',
        'Bird Opening': 'Obertura Bird',
        'Pirc Defense': 'Defensa Pirc',
        'Tarrasch Defense': 'Defensa Tarrasch',
        'Polish Opening': 'Obertura Polonesa',
        'Polish Defense': 'Defensa Polonesa',
        'Hungarian Opening': 'Obertura Hongaresa',
        'Center Game': 'Partida del Centre',
        'Center Game Accepted': 'Partida del Centre Acceptada',
        'Latvian Gambit': 'Gambit Letó',
        'Ponziani Opening': 'Obertura Ponziani',
        'Rat Defense': 'Defensa de la Rata',
        'Trompowsky Attack': 'Atac Trompowsky',
        'Torre Attack': 'Atac Torre',
        'Englund Gambit': 'Gambit Englund',
        'Owen Defense': 'Defensa Owen',
        'Richter-Veresov Attack': 'Atac Richter-Veresov',
        'English Defense': 'Defensa Anglesa',
        'Danish Gambit': 'Gambit Danès',
        'London System': 'Sistema Londres',
        'Colle System': 'Sistema Colle',
        'Elephant Gambit': "Gambit de l'Elefant",
        'Hippopotamus Defense': "Defensa de l'Hipopòtam",
        'Kangaroo Defense': 'Defensa Cangur',
        'Portuguese Opening': 'Obertura Portuguesa',
        'Mexican Defense': 'Defensa Mexicana',
        'Australian Defense': 'Defensa Australiana',
        'Czech Defense': 'Defensa Txeca',
        'Dresden Opening': 'Obertura de Dresden',
        'Irish Gambit': 'Gambit Irlandès',
        'Lion Defense': 'Defensa del Lleó',
        'Saragossa Opening': 'Obertura de Saragossa',
        'Valencia Opening': 'Obertura de València',
        'Blackmar-Diemer Gambit': 'Gambit Blackmar-Diemer',
        'Benko Gambit': 'Gambit Benko',
        'Grob Opening': 'Obertura Grob',
        'Van Geet Opening': 'Obertura Van Geet',
        'Rubinstein Opening': 'Obertura Rubinstein',
        'Rapport-Jobava System': 'Sistema Rapport-Jobava',
        'Formation': 'Formació',
        'English Orangutan': 'Orangutan',
        'Blumenfeld Countergambit': 'Contragambit Blumenfeld',
        'Duras Gambit': 'Gambit Duras',
        'Vienna Gambit, with Max Lange Defense': 'Gambit de Viena amb la defensa Max Lange'
    };
    // Adjectius freqüents (masculí, femení).
    const ADJ_CA = {
        'Classical': ['clàssic', 'clàssica'], 'Modern': ['modern', 'moderna'],
        'Closed': ['tancat', 'tancada'], 'Open': ['obert', 'oberta'],
        'Old': ['antic', 'antiga'], 'Accelerated': ['accelerat', 'accelerada'],
        'Normal': ['normal', 'normal'], 'English': ['anglès', 'anglesa'],
        'Italian': ['italià', 'italiana'], 'Spanish': ['espanyol', 'espanyola'],
        'French': ['francès', 'francesa'], 'Russian': ['rus', 'russa'],
        'Dutch': ['holandès', 'holandesa'], 'Polish': ['polonès', 'polonesa'],
        'Scotch': ['escocès', 'escocesa'], 'Hungarian': ['hongarès', 'hongaresa'],
        'Exchange': ['del canvi', 'del canvi'], 'Advance': ["de l'avanç", "de l'avanç"],
        'Fianchetto': ['del fianchetto', 'del fianchetto'], 'Main': ['principal', 'principal'],
        'Symmetrical': ['simètric', 'simètrica'], 'Reversed': ['invertit', 'invertida'],
        'Delayed': ['diferit', 'diferida'], 'Deferred': ['diferit', 'diferida'],
        'Two Knights': ['dels dos cavalls', 'dels dos cavalls'],
        'Four Knights': ['dels quatre cavalls', 'dels quatre cavalls'],
        'Three Knights': ['dels tres cavalls', 'dels tres cavalls'],
        'London': ['Londres', 'Londres'], 'Vienna': ['de Viena', 'de Viena'],
        'Catalan': ['catalana', 'catalana'], 'Indian': ['índia', 'índia'],
        'Queen\'s Indian': ['índia de dama', 'índia de dama'], 'King\'s Indian': ['índia de rei', 'índia de rei']
    };
    // Substantiu final → [paraula catalana, gènere ('m'/'f')].
    const HEAD_CA = {
        'Variation': ['variant', 'f'], 'Attack': ['atac', 'm'], 'Gambit': ['gambit', 'm'],
        'Countergambit': ['contragambit', 'm'], 'Defense': ['defensa', 'f'],
        'System': ['sistema', 'm'], 'Line': ['línia', 'f'], 'Opening': ['obertura', 'f'],
        'Game': ['partida', 'f'], 'Trap': ['parany', 'm'], 'Formation': ['formació', 'f'],
        'Setup': ['esquema', 'm'], 'Complex': ['complex', 'm'], 'Countermove': ['contrajugada', 'f'],
        'Variations': ['variants', 'fp'], 'Lines': ['línies', 'fp'], 'Attacks': ['atacs', 'mp']
    };
    // Complements de nom («Modern Bishop's Opening» → «obertura de l'alfil moderna»).
    const COMPLEMENT_CA = { "Bishop's": "de l'alfil", "Knight's": 'del cavall' };
    // Plural d'un adjectiu català (moderna → modernes, clàssica → clàssiques).
    function pluralCa(word, fem) {
        const w = String(word || '');
        if (!w || w.indexOf(' ') >= 0) return w;
        if (fem) {
            if (/ca$/.test(w)) return w.replace(/ca$/, 'ques');
            if (/ga$/.test(w)) return w.replace(/ga$/, 'gues');
            if (/a$/.test(w)) return w.replace(/a$/, 'es');
        }
        if (/s$/.test(w)) return w;
        return w + 's';
    }

    function translateWords(text, gender) {
        const plural = gender === 'fp' || gender === 'mp';
        if (plural) {
            const one = translateWords(text, gender[0]);
            return one === text ? text : one.split(' ').map(w => pluralCa(w, gender === 'fp')).join(' ');
        }
        const idx = gender === 'f' ? 1 : 0;
        if (ADJ_CA[text]) return ADJ_CA[text][idx];
        // Diversos mots: només es tradueixen si tots són coneguts; si no, és un
        // nom propi («West Indian», «King's English») i es deixa tal qual.
        const words = String(text).split(' ');
        if (words.every(w => ADJ_CA[w])) return words.map(w => ADJ_CA[w][idx]).join(' ');
        // Nom propi + adjectius purs («Accelerated Panov» → «Panov accelerat»).
        const pure = words.filter(w => PURE_ADJ.indexOf(w) >= 0);
        if (pure.length && pure.length < words.length) {
            return words.filter(w => PURE_ADJ.indexOf(w) < 0).map(w => COMPLEMENT_CA[w] || w).join(' ') + ' ' + pure.map(w => ADJ_CA[w][idx]).join(' ');
        }
        if (words.every(w => COMPLEMENT_CA[w])) return words.map(w => COMPLEMENT_CA[w]).join(' ');
        return text;
    }
    // Adjectius que no són gentilicis: es poden posar darrere d'un nom propi.
    const PURE_ADJ = ['Classical', 'Modern', 'Closed', 'Open', 'Old', 'Accelerated', 'Normal', 'Symmetrical', 'Reversed', 'Delayed', 'Deferred', 'Exchange', 'Advance'];

    function translateSegment(seg) {
        const s = String(seg || '').trim();
        if (!s) return '';
        if (s === 'Main Line' || s === 'Mainline') return 'línia principal';
        if (s === 'Accepted') return 'acceptat';
        if (s === 'Declined') return 'refusat';
        let m = s.match(/^(.*?)\s*Gambit (Accepted|Declined)$/);
        if (m) return 'gambit ' + (m[1] ? translateWords(m[1], 'm') + ' ' : '') + (m[2] === 'Accepted' ? 'acceptat' : 'refusat');
        m = s.match(/^(.*?)\s*(Variations|Variation|Attacks|Attack|Gambit|Countergambit|Defense|System|Lines|Line|Opening|Game|Trap|Formation|Setup|Complex|Countermove)$/);
        if (m && HEAD_CA[m[2]]) {
            const [head, gender] = HEAD_CA[m[2]];
            if (!m[1]) return head;
            return head + ' ' + translateWords(m[1], gender);
        }
        if (ADJ_CA[s]) return ADJ_CA[s][1];
        return s;
    }

    function translateFamily(fam) {
        const f = String(fam || '').trim();
        if (FAMILY_CA[f]) return FAMILY_CA[f];
        // «London System, with Bd3» → «Sistema Londres, amb Bd3».
        const comma = f.indexOf(', ');
        if (comma > 0) {
            const tail = f.slice(comma + 2).replace(/^with /, 'amb ');
            return translateFamily(f.slice(0, comma)) + ', ' + translateSegment(tail);
        }
        const acc = f.match(/^(.*) (Accepted|Declined)$/);
        if (acc && FAMILY_CA[acc[1]]) {
            const base = FAMILY_CA[acc[1]];
            const fem = /^(Defensa|Obertura|Partida)/.test(base);
            return base + (acc[2] === 'Accepted' ? (fem ? ' Acceptada' : ' Acceptat') : (fem ? ' Refusada' : ' Refusat'));
        }
        const seg = translateSegment(f);
        return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : f;
    }

    // «Sicilian Defense: Najdorf Variation, English Attack» →
    // «Defensa Siciliana: variant Najdorf, atac anglès».
    function translateOpeningName(name) {
        const n = String(name || '').trim();
        if (!n) return '';
        const colon = n.indexOf(':');
        if (colon < 0) return translateFamily(n);
        const fam = translateFamily(n.slice(0, colon));
        const rest = n.slice(colon + 1).split(',').map(translateSegment).filter(Boolean).join(', ');
        return rest ? fam + ': ' + rest : fam;
    }

    // ------------------------------------------------------------------
    // Llibre d'obertures: arbre de seqüències amb pes + graf per posició
    // ------------------------------------------------------------------
    // L'ARBRE (sense chess.js, instantani) dona les continuacions de la base
    // amb un pes: el nombre de línies que hi passen, una aproximació a quant
    // es juga cada resposta. El GRAF per posició (byPos/theory, el mateix que
    // l'app construeix en segon pla per anomenar obertures) cobreix les
    // transposicions. ctx = { trie, graph }; qualsevol dels dos pot faltar.
    function stripSan(san) { return String(san || '').replace(/[+#?!]+$/, ''); }

    function buildSequenceTrie(openingsData) {
        const rootNode = { kids: new Map(), count: 0, ops: [] };
        (Array.isArray(openingsData) ? openingsData : []).forEach(op => {
            const moves = parsePgn(op && op.pgn);
            if (!moves.length) return;
            let n = rootNode;
            n.count++;
            for (const mv of moves) {
                const k0 = stripSan(mv);
                let k = n.kids.get(k0);
                if (!k) { k = { san: mv, kids: new Map(), count: 0, ops: [] }; n.kids.set(k0, k); }
                k.count++;
                n = k;
            }
            n.ops.push({ eco: op.eco || '', name: op.name || '', ply: moves.length });
        });
        return rootNode;
    }

    function trieAt(trie, sans) {
        let n = trie || null;
        for (const san of (sans || [])) {
            if (!n) return null;
            n = n.kids.get(stripSan(san)) || null;
        }
        return n;
    }

    function graphKnows(graph, key) {
        if (!graph) return false;
        return !!((graph.byPos && graph.byPos.has(key)) || (graph.theory && graph.theory.has(key)) || (graph.next && graph.next.has(key)));
    }

    // Jugades de llibre: [{ san, count }] de més a menys jugada.
    function bookMoves(ctx, sans, key) {
        const c = ctx || {};
        const n = trieAt(c.trie, sans);
        if (n && n.kids.size) {
            return Array.from(n.kids.values()).map(k => ({ san: k.san, count: k.count })).sort((a, b) => b.count - a.count);
        }
        const theory = c.graph && (c.graph.theory || c.graph.next);
        const set = theory && key ? theory.get(key) : null;
        if (set) return Array.from(set.keys ? set.keys() : set).map(san => ({ san, count: 1 }));
        return [];
    }

    // Nom de la posició amb nom MÉS PROFUNDA de la línia (transposicions
    // incloses si hi ha graf). Retorna { eco, name, nameCa, ply, inBook, leftAt }
    // (leftAt = primera jugada fora del llibre, o null).
    function lineName(ctx, sans, keys) {
        const c = ctx || {};
        const out = { eco: '', name: '', nameCa: '', ply: 0, inBook: true, leftAt: null };
        const list = Array.isArray(sans) ? sans : [];
        let node = c.trie || null;
        list.forEach((san, i) => {
            node = node ? (node.kids.get(stripSan(san)) || null) : null;
            const key = keys ? keys[i] : null;
            const hit = (c.graph && c.graph.byPos && key) ? c.graph.byPos.get(key) : null;
            let named = hit || null;
            if (!named && node && node.ops.length) {
                named = node.ops.reduce((best, op) => (!best || op.ply > best.ply) ? op : best, null);
            }
            if (named) { out.eco = named.eco; out.name = named.name; out.ply = i + 1; }
            const known = !!node || graphKnows(c.graph, key);
            if (out.leftAt === null && !known) out.leftAt = i + 1;
            // Una transposició pot tornar a portar la línia al llibre.
            out.inBook = known;
        });
        // Posició sense nom propi (1.e4 e6, per exemple): si gairebé totes les
        // continuacions de la base són d'una mateixa obertura, ja la diem.
        if (list.length && node && out.ply < list.length) {
            const dom = dominantFamily(node);
            if (dom && dom.share >= 0.6 && dom.family !== String(out.name).split(':')[0]) {
                out.name = dom.family; out.eco = dom.eco; out.ply = list.length;
            }
        }
        out.nameCa = translateOpeningName(out.name);
        return out;
    }

    // Variant cap on va una jugada: el nom «família: primera variant» més
    // freqüent entre les línies de la base que passen pel node, si n'és una
    // part prou gran (35%). Serveix per distingir jugades que encara tenen el
    // mateix nom (2.d4 i 2.Nc3 a la Caro-Kann, per exemple).
    function dominantVariation(node) {
        if (!node) return null;
        if (node._var !== undefined) return node._var;
        const tally = new Map();
        let total = 0;
        const stack = [node];
        while (stack.length) {
            const n = stack.pop();
            n.ops.forEach(op => {
                const parts = String(op.name).split(':');
                if (parts.length < 2) return;
                const v = parts[0] + ': ' + parts[1].split(',')[0].trim();
                tally.set(v, (tally.get(v) || 0) + 1);
                total++;
            });
            n.kids.forEach(k => stack.push(k));
        }
        let best = null;
        tally.forEach((n, v) => { if (!best || n > best.n) best = { v, n }; });
        node._var = best && total && best.n / total >= 0.35 ? best.v : null;
        return node._var;
    }

    // ------------------------------------------------------------------
    // Opcions de la pista: un color per a cada obertura possible
    // ------------------------------------------------------------------
    // Colors que no es confonen amb la marca de la darrera jugada (daurat i
    // blau cel) ni amb els de correcció (verd, vermell, ambre).
    const OPTION_COLORS = [
        { hex: '#8b5cf6', name: 'lila' }, { hex: '#f97316', name: 'taronja' },
        { hex: '#ec4899', name: 'rosa' }, { hex: '#1d4ed8', name: 'blau' },
        { hex: '#0d9488', name: 'turquesa' }, { hex: '#9f1239', name: 'granat' }
    ];
    const OPTION_COLOR_OTHER = { hex: '#6b7280', name: 'gris' };

    // options = [{ san, from, to, label, ... }] → grups per obertura (label),
    // en l'ordre en què apareixen, cadascun amb el seu color.
    function groupOptions(options) {
        const groups = [];
        const byLabel = new Map();
        (options || []).forEach(o => {
            if (!o || !o.san) return;
            const label = o.label || 'Línia pròpia';
            let g = byLabel.get(label);
            if (!g) {
                const color = OPTION_COLORS[groups.length] || OPTION_COLOR_OTHER;
                g = { label, color: color.hex, colorName: color.name, moves: [] };
                byLabel.set(label, g);
                groups.push(g);
            }
            if (!g.moves.some(m => m.san === o.san)) g.moves.push(o);
        });
        return groups;
    }

    // Caselles a pintar: { casella: [{ color, role: 'to'|'from' }] }. Si un
    // grup està en focus, només aquell. El destí té prioritat sobre l'origen.
    function optionSquareMarks(groups, focus) {
        const out = {};
        const add = (sq, color, role) => {
            if (!sq) return;
            const list = out[sq] || (out[sq] = []);
            if (!list.some(x => x.color === color && x.role === role)) list.push({ color, role });
        };
        (groups || []).forEach((g, i) => {
            if (focus !== null && focus !== undefined && focus !== i) return;
            g.moves.forEach(m => { add(m.to, g.color, 'to'); add(m.from, g.color, 'from'); });
        });
        Object.keys(out).forEach(sq => out[sq].sort((a, b) => (a.role === b.role ? 0 : a.role === 'to' ? -1 : 1)));
        return out;
    }

    // box-shadow d'una casella: anells concèntrics (un per color) i, al destí,
    // un vel del color perquè es vegi fins i tot amb la peça a sobre.
    function hexToRgba(hex, alpha) {
        const h = String(hex || '').replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + alpha + ')';
    }
    function optionShadow(marks) {
        if (!marks || !marks.length) return '';
        const layers = [];
        let width = 0;
        marks.forEach(m => {
            width += m.role === 'to' ? 5 : 3;
            layers.push('inset 0 0 0 ' + width + 'px ' + m.color);
        });
        const fill = marks.find(m => m.role === 'to');
        if (fill) layers.push('inset 0 0 0 100px ' + hexToRgba(fill.color, 0.3));
        return layers.join(', ');
    }

    // Família d'obertura majoritària entre les línies que passen per un node.
    function dominantFamily(node) {
        if (!node) return null;
        if (node._dom !== undefined) return node._dom;
        const tally = new Map();
        let total = 0;
        const stack = [node];
        while (stack.length) {
            const n = stack.pop();
            n.ops.forEach(op => {
                const fam = String(op.name).split(':')[0];
                const e = tally.get(fam) || { n: 0, eco: op.eco, ply: op.ply };
                e.n++;
                if (op.ply < e.ply) { e.ply = op.ply; e.eco = op.eco; }
                tally.set(fam, e);
                total++;
            });
            n.kids.forEach(k => stack.push(k));
        }
        let best = null;
        tally.forEach((e, fam) => { if (!best || e.n > best.n) best = { family: fam, eco: e.eco, n: e.n }; });
        node._dom = best && total ? { family: best.family, eco: best.eco, share: best.n / total } : null;
        return node._dom;
    }

    // ------------------------------------------------------------------
    // Anotació d'una línia: quina peça (per casella d'origen) fa cada jugada
    // ------------------------------------------------------------------
    const PIECE_CA = { p: 'peó', n: 'cavall', b: 'alfil', r: 'torre', q: 'dama', k: 'rei' };
    const PIECE_SAN = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

    function initialOrigins(g) {
        const map = {};
        const files = 'abcdefgh';
        for (let r = 1; r <= 8; r++) {
            for (let f = 0; f < 8; f++) {
                const sq = files[f] + r;
                if (g.get(sq)) map[sq] = sq;
            }
        }
        return map;
    }

    // Aplica una jugada verbose al mapa casella→origen. `moved` = orígens que
    // ja s'han mogut a la línia (l'enroc no compta com a moviment de torre).
    function applyOrigins(origins, moved, mv) {
        const o = origins[mv.from] || mv.from;
        const first = !moved.has(o);
        moved.add(o);
        delete origins[mv.from];
        if (mv.flags && mv.flags.indexOf('e') >= 0) delete origins[mv.to[0] + mv.from[1]];
        origins[mv.to] = o;
        if (mv.flags && mv.flags.indexOf('k') >= 0) {
            const r = mv.color === 'w' ? '1' : '8';
            origins['f' + r] = origins['h' + r] || ('h' + r);
            delete origins['h' + r];
        } else if (mv.flags && mv.flags.indexOf('q') >= 0) {
            const r = mv.color === 'w' ? '1' : '8';
            origins['d' + r] = origins['a' + r] || ('a' + r);
            delete origins['a' + r];
        }
        return { origin: o, first };
    }

    function castleOf(mv) {
        if (!mv || !mv.flags) return null;
        if (mv.flags.indexOf('k') >= 0) return 'k';
        if (mv.flags.indexOf('q') >= 0) return 'q';
        return null;
    }

    function moveInfo(mv, meta, ply, inCheckBefore) {
        return {
            san: mv.san, uci: mv.from + mv.to + (mv.promotion || ''), from: mv.from, to: mv.to,
            piece: mv.piece, color: mv.color, origin: meta.origin, first: meta.first,
            capture: !!mv.captured, castle: castleOf(mv), check: /[+#]$/.test(mv.san),
            inCheckBefore: !!inCheckBefore, ply
        };
    }

    // Reprodueix una línia (SAN) i en torna l'estat: claus, informació de
    // cada jugada i el mapa d'orígens final (per anotar la jugada següent).
    function annotateLine(Chess, sans) {
        const g = new Chess();
        const origins = initialOrigins(g);
        const moved = new Set();
        const moves = [];
        const keys = [];
        for (let i = 0; i < (sans || []).length; i++) {
            const inCheck = g.in_check();
            const mv = g.move(sans[i], { sloppy: true });
            if (!mv) break;
            const meta = applyOrigins(origins, moved, mv);
            moves.push(moveInfo(mv, meta, i + 1, inCheck));
            keys.push(positionKey(g.fen()));
        }
        return { game: g, moves, keys, origins, moved };
    }

    // Informació d'una jugada candidata (verbose) en l'estat d'una línia.
    function candidateInfo(lineState, mv) {
        const o = lineState.origins[mv.from] || mv.from;
        return moveInfo(mv, { origin: o, first: !lineState.moved.has(o) }, lineState.moves.length + 1, lineState.game.in_check());
    }

    // ------------------------------------------------------------------
    // El PLA: on va cada peça la primera vegada que la mous
    // ------------------------------------------------------------------
    function planTarget(info) {
        if (!info) return null;
        if (info.castle === 'k') return 'O-O';
        if (info.castle === 'q') return 'O-O-O';
        return info.to;
    }

    function planVotes(info) {
        return !!(info && info.first && !info.capture && !info.inCheckBefore);
    }

    // nodes = { clau: node } d'un color. Retorna { origen: { to, count, total,
    // ply, piece, others } } amb el destí majoritari de cada peça.
    function computeScheme(nodes, excludeKey) {
        const tally = {};
        Object.keys(nodes || {}).forEach(k => {
            if (k === excludeKey) return;
            const n = nodes[k];
            if (!planVotes(n)) return;
            const target = planTarget(n);
            const t = tally[n.origin] || (tally[n.origin] = { piece: n.piece, targets: {} });
            const e = t.targets[target] || (t.targets[target] = { count: 0, plySum: 0, created: Infinity });
            e.count++;
            e.plySum += n.ply || 0;
            e.created = Math.min(e.created, n.created || 0);
        });
        const scheme = {};
        Object.keys(tally).forEach(origin => {
            const entries = Object.entries(tally[origin].targets);
            entries.sort((a, b) => (b[1].count - a[1].count) || (a[1].created - b[1].created));
            const [to, e] = entries[0];
            const total = entries.reduce((s, x) => s + x[1].count, 0);
            scheme[origin] = {
                to, count: e.count, total, piece: tally[origin].piece,
                ply: e.count ? e.plySum / e.count : 0,
                others: entries.slice(1).map(x => x[0])
            };
        });
        return scheme;
    }

    // Com encaixa una jugada amb el pla i amb els principis d'obertura.
    //   kind: 'plan' (segueix el pla), 'new' (peça encara sense pla: el crea),
    //         'conflict' (la peça té un altre destí al pla), 'concrete'
    //         (captura o escac per respondre: no compta per al pla),
    //         'repeat' (torna a moure una peça sense capturar),
    //         'queen-early' (dama abans de la 5a jugada sense capturar).
    function planCheck(scheme, info) {
        if (!info) return { kind: 'concrete' };
        if (info.capture || info.inCheckBefore) return { kind: 'concrete' };
        if (!info.first) return { kind: 'repeat' };
        const s = scheme ? scheme[info.origin] : null;
        const target = planTarget(info);
        if (s && s.to !== target) return { kind: 'conflict', expected: planLabel(info.origin, s), piece: s.piece, count: s.count };
        if (info.piece === 'q' && info.ply <= 9 && !s) return { kind: 'queen-early' };
        return { kind: s ? 'plan' : 'new' };
    }

    // Estat de coherència d'un node desat respecte del pla actual.
    function nodeCoherence(node, scheme) {
        if (!node) return { ok: false, kind: 'missing' };
        if (node.unverified) return { ok: false, kind: 'unverified' };
        const c = planCheck(scheme, node);
        if (c.kind === 'conflict') {
            if (node.justified) return { ok: true, kind: 'exception', expected: c.expected };
            return { ok: false, kind: 'conflict', expected: c.expected };
        }
        if (c.kind === 'repeat' || c.kind === 'queen-early') {
            if (node.inBook || node.justified || (typeof node.loss === 'number' && node.loss <= PRINCIPLE_TOLERANCE_CP)) {
                return { ok: true, kind: 'concrete' };
            }
            return { ok: false, kind: c.kind };
        }
        return { ok: true, kind: c.kind };
    }

    // Jugades legals que segueixen el pla en aquesta posició (peces encara
    // per moure que tenen destí al pla), ordenades com les jugues habitualment.
    function planMoves(scheme, lineState) {
        if (!scheme || !lineState) return [];
        const out = [];
        lineState.game.moves({ verbose: true }).forEach(mv => {
            const info = candidateInfo(lineState, mv);
            if (!info.first || info.capture) return;
            const s = scheme[info.origin];
            if (s && s.to === planTarget(info)) out.push({ san: mv.san, uci: info.uci, ply: s.ply, count: s.count });
        });
        return out.sort((a, b) => a.ply - b.ply || b.count - a.count);
    }

    // La jugada del pla per a una peça concreta (per comparar amb una que el trenca).
    function planMoveForOrigin(scheme, lineState, origin) {
        const s = scheme && scheme[origin];
        if (!s) return null;
        const mv = lineState.game.moves({ verbose: true }).find(m => {
            const info = candidateInfo(lineState, m);
            return info.origin === origin && info.first && planTarget(info) === s.to;
        });
        return mv ? { san: mv.san, uci: mv.from + mv.to + (mv.promotion || '') } : null;
    }

    function planLabel(origin, entry) {
        if (!entry) return '';
        if (entry.to === 'O-O' || entry.to === 'O-O-O') return entry.to;
        return (PIECE_SAN[entry.piece] || '') + entry.to;
    }

    // ------------------------------------------------------------------
    // Explicació d'una jugada (per què té sentit)
    // ------------------------------------------------------------------
    function describeMove(info) {
        if (!info) return '';
        const white = info.color === 'w';
        const rank = info.to ? info.to[1] : '';
        let text;
        if (info.castle === 'k') text = 'Enroc curt: el rei queda a recer i la torre entra en joc.';
        else if (info.castle === 'q') text = 'Enroc llarg: el rei s’amaga al flanc de dama i la torre ocupa la columna d.';
        else if (info.capture) text = 'Captura a ' + info.to + '.';
        else if (!info.first) text = 'Torna a moure ' + (info.piece === 'p' ? 'el peó' : 'la mateixa peça') + ': té sentit només per un motiu concret.';
        else if (info.piece === 'p') {
            const file = info.to[0];
            const centre = ['d4', 'e4', 'd5', 'e5'].indexOf(info.to) >= 0;
            if (centre) text = 'Ocupa el centre amb un peó.';
            else if ((file === 'c' || file === 'f') && (rank === (white ? '4' : '5'))) text = 'Lluita pel centre des del flanc.';
            else if ((file === 'g' || file === 'b') && (rank === (white ? '3' : '6'))) text = 'Prepara el fianchetto: l’alfil anirà a la diagonal llarga.';
            else if (['d', 'e', 'c'].indexOf(file) >= 0) text = 'Sosté el centre i obre camí a les peces.';
            else if (file === 'h' || file === 'a') text = 'Jugada profilàctica: guanya una casella i evita clavades.';
            else text = 'Guanya espai al flanc.';
        } else if (info.piece === 'n') {
            const good = ['c3', 'f3', 'd2', 'e2', 'c6', 'f6', 'd7', 'e7'].indexOf(info.to) >= 0;
            text = good ? 'Desenvolupa el cavall cap al centre.' : 'Desenvolupa el cavall per una ruta poc habitual.';
        } else if (info.piece === 'b') {
            const fianchetto = ['g2', 'b2', 'g7', 'b7'].indexOf(info.to) >= 0;
            text = fianchetto ? 'Fianchetto: l’alfil domina la diagonal llarga.' : 'Desenvolupa l’alfil a una diagonal activa.';
        } else if (info.piece === 'q') text = 'Activa la dama (compte: aviat pot rebre atacs).';
        else if (info.piece === 'r') text = 'Porta la torre a una columna útil.';
        else text = 'Mou el rei.';
        if (info.check) text += ' Fa escac.';
        return text;
    }

    function planCheckText(check) {
        if (!check) return '';
        switch (check.kind) {
            case 'plan': return 'Segueix el teu pla.';
            case 'new': return 'Nova peça al teu pla.';
            case 'conflict': return 'Trenca el teu pla (a les altres línies: ' + check.expected + ').';
            case 'repeat': return 'Torna a moure una peça.';
            case 'queen-early': return 'Dama aviat.';
            default: return 'Jugada concreta.';
        }
    }

    // ------------------------------------------------------------------
    // Stockfish 19: puntuació, veredicte i lectura de l'UCI
    // ------------------------------------------------------------------
    function scoreToCp(type, value) {
        const v = Number(value) || 0;
        if (type === 'mate') return v > 0 ? 10000 - v : -10000 - v;
        return v;
    }

    function parseInfoLine(line) {
        const s = String(line || '');
        if (s.indexOf('info ') !== 0 || s.indexOf(' pv ') < 0) return null;
        if (/ (lowerbound|upperbound)( |$)/.test(s)) return null;
        const depth = s.match(/ depth (\d+)/);
        const score = s.match(/ score (cp|mate) (-?\d+)/);
        if (!depth || !score) return null;
        const mpv = s.match(/ multipv (\d+)/);
        const pv = s.slice(s.indexOf(' pv ') + 4).trim().split(/\s+/).filter(Boolean);
        if (!pv.length) return null;
        return {
            depth: Number(depth[1]), multipv: mpv ? Number(mpv[1]) : 1,
            scoreType: score[1], score: Number(score[2]), cp: scoreToCp(score[1], score[2]),
            uci: pv[0], pv
        };
    }

    function verdictFor(loss) {
        const l = Math.max(0, Number(loss) || 0);
        return VERDICTS.find(v => l <= v.max) || VERDICTS[VERDICTS.length - 1];
    }

    function judgeMove(bestCp, playedCp) {
        const loss = Math.max(0, Math.round((Number(bestCp) || 0) - (Number(playedCp) || 0)));
        const v = verdictFor(loss);
        return { loss, verdict: v.id, label: v.label, ok: v.ok };
    }

    function formatCp(cp) {
        if (typeof cp !== 'number' || !isFinite(cp)) return '—';
        if (cp >= 9000) return 'mat';
        if (cp <= -9000) return 'mat en contra';
        const v = cp / 100;
        return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ',');
    }

    function formatLoss(loss) {
        const v = Math.max(0, Number(loss) || 0) / 100;
        return v.toFixed(2).replace('.', ',') + ' peons';
    }

    // ------------------------------------------------------------------
    // Repàs espaiat
    // ------------------------------------------------------------------
    function srsAfter(node, outcome, now) {
        const t = typeof now === 'number' ? now : Date.now();
        const box = Math.max(0, Math.min(SRS_INTERVALS.length - 1, Number(node && node.box) || 0));
        let nb;
        if (outcome === 'ok') nb = Math.min(SRS_INTERVALS.length - 1, box + 1);
        else if (outcome === 'hinted') nb = Math.max(1, box);
        else nb = 1;
        return { box: nb, due: t + SRS_INTERVALS[nb] };
    }

    function isDue(node, now) {
        return !!node && (Number(node.due) || 0) <= (typeof now === 'number' ? now : Date.now());
    }

    // ------------------------------------------------------------------
    // Tria de la resposta del rival
    // ------------------------------------------------------------------
    // book = [{ san, count }]; engine = [{ san, cp }] (millor primer, des del
    // punt de vista del rival); nodeAfter(san) = node de l'usuari a la posició
    // resultant (o null). Retorna [{ san, weight, source }].
    function rivalCandidates(opts) {
        const o = opts || {};
        const book = Array.isArray(o.book) ? o.book : [];
        const engine = Array.isArray(o.engine) ? o.engine.filter(e => e && e.san) : [];
        const now = typeof o.now === 'number' ? o.now : Date.now();
        const nodeAfter = typeof o.nodeAfter === 'function' ? o.nodeAfter : () => null;
        const bookMargin = typeof o.bookMargin === 'number' ? o.bookMargin : 70;
        let cands = [];
        if (engine.length) {
            const best = engine[0].cp;
            const bySan = new Map(engine.map(e => [e.san, e]));
            book.forEach(b => {
                const e = bySan.get(b.san);
                if (e && e.cp >= best - bookMargin) cands.push({ san: b.san, weight: Math.pow(Math.max(1, b.count), 0.75), source: 'book', cp: e.cp });
            });
            if (!cands.length) {
                engine.filter(e => e.cp >= best - 25).slice(0, 3).forEach((e, i) => {
                    cands.push({ san: e.san, weight: 3 - i, source: 'engine', cp: e.cp });
                });
            }
        } else {
            cands = book.map(b => ({ san: b.san, weight: Math.pow(Math.max(1, b.count), 0.75), source: 'book' }));
        }
        // Repàs: més pes a les posicions que toca repassar i a les encara noves.
        cands.forEach(c => {
            const n = nodeAfter(c.san);
            if (n) c.weight *= isDue(n, now) ? 3 : 0.6;
            else c.weight *= 1.4;
        });
        return cands.filter(c => c.weight > 0);
    }

    function pickWeighted(cands, rng) {
        const list = (cands || []).filter(c => c && c.weight > 0);
        if (!list.length) return null;
        const r = (typeof rng === 'function' ? rng() : Math.random());
        const total = list.reduce((s, c) => s + c.weight, 0);
        let acc = r * total;
        for (const c of list) {
            acc -= c.weight;
            if (acc <= 0) return c;
        }
        return list[list.length - 1];
    }

    // ------------------------------------------------------------------
    // Magatzem (localStorage, viatja amb la sincronització: prefix chess_)
    // ------------------------------------------------------------------
    function emptySide() { return { name: '', nodes: {}, named: [], declined: [] }; }
    function emptyStore() {
        return { v: 1, prefs: { color: 'w', depth: DEFAULT_DEPTH }, sides: { w: emptySide(), b: emptySide() }, evals: {} };
    }

    function normalizeStore(raw) {
        const s = emptyStore();
        if (!raw || typeof raw !== 'object') return s;
        if (raw.prefs) {
            s.prefs.color = raw.prefs.color === 'b' ? 'b' : 'w';
            s.prefs.depth = DEPTH_OPTIONS.indexOf(Number(raw.prefs.depth)) >= 0 ? Number(raw.prefs.depth) : DEFAULT_DEPTH;
        }
        ['w', 'b'].forEach(c => {
            const side = raw.sides && raw.sides[c];
            if (!side) return;
            s.sides[c].name = typeof side.name === 'string' ? side.name.slice(0, 60) : '';
            const nodes = side.nodes && typeof side.nodes === 'object' ? side.nodes : {};
            Object.keys(nodes).forEach(k => {
                const n = nodes[k];
                if (n && typeof n.san === 'string' && typeof n.origin === 'string') s.sides[c].nodes[k] = n;
            });
            (Array.isArray(side.named) ? side.named : []).forEach(o => {
                if (o && typeof o.name === 'string' && o.name.trim() && Array.isArray(o.sans) && typeof o.leftKey === 'string') {
                    s.sides[c].named.push(Object.assign({}, o, { name: o.name.trim().slice(0, MAX_NAME) }));
                }
            });
            s.sides[c].named = s.sides[c].named.slice(0, MAX_NAMED);
            s.sides[c].declined = (Array.isArray(side.declined) ? side.declined : []).filter(k => typeof k === 'string').slice(-MAX_DECLINED);
        });
        if (raw.evals && typeof raw.evals === 'object') s.evals = raw.evals;
        return s;
    }

    function rememberEval(store, key, entry) {
        if (!store || !key || !entry) return;
        if (store.evals[key]) delete store.evals[key];
        store.evals[key] = entry;
        const keys = Object.keys(store.evals);
        for (let i = 0; i < keys.length - MAX_EVALS; i++) delete store.evals[keys[i]];
    }

    // ------------------------------------------------------------------
    // Informe del repertori: coherència, domini i repàs
    // ------------------------------------------------------------------
    function repertoireReport(side, now) {
        const nodes = (side && side.nodes) || {};
        const scheme = computeScheme(nodes);
        const keys = Object.keys(nodes);
        const t = typeof now === 'number' ? now : Date.now();
        let coherent = 0, mastered = 0, due = 0;
        const issues = [];
        keys.forEach(k => {
            const n = nodes[k];
            const c = nodeCoherence(n, scheme);
            if (c.ok) coherent++;
            else issues.push({ key: k, node: n, kind: c.kind, expected: c.expected || null });
            if ((Number(n.box) || 0) >= MASTERED_BOX) mastered++;
            if (isDue(n, t)) due++;
        });
        const total = keys.length;
        issues.sort((a, b) => (a.node.ply || 0) - (b.node.ply || 0));
        return {
            total, coherent, mastered, due, scheme, issues,
            coherencePct: total ? Math.round(coherent / total * 100) : 100,
            masteryPct: total ? Math.round(mastered / total * 100) : 0
        };
    }

    // ------------------------------------------------------------------
    // Les teves obertures amb nom
    // ------------------------------------------------------------------
    // Una SORTIDA PRÒPIA és una línia completa on ets tu qui surt del llibre.
    // S'identifica per la posició just després de la teva jugada nova (leftKey):
    // qualsevol línia que hi passi és aquella obertura, sigui quina sigui la
    // resposta del rival després.
    function namedOpeningFor(named, keys) {
        let best = null;
        (named || []).forEach(o => {
            const i = (keys || []).indexOf(o.leftKey);
            if (i >= 0 && (!best || i < best.idx)) best = { opening: o, idx: i };
        });
        return best ? best.opening : null;
    }

    // Es pot proposar de posar-li nom si: la línia surt del llibre i hi fas
    // almenys una jugada teva fora de la teoria, totes les teves jugades de la
    // línia són al repertori i són coherents (pla i Stockfish 19), i no és ja
    // una obertura teva ni l'has descartada.
    // Retorna { ok, reason, leftKey, leftPly, leftSan, bookPly }.
    function namingCandidate(opts) {
        const o = opts || {};
        const side = o.side || emptySide();
        const sans = Array.isArray(o.sans) ? o.sans : [];
        const keys = Array.isArray(o.keys) ? o.keys : [];
        const color = o.color === 'b' ? 'b' : 'w';
        const leftAt = o.leftAt;
        if (!leftAt || leftAt > sans.length) return { ok: false, reason: 'book' };
        // La primera jugada TEVA fora del llibre (pot ser la que en surt o, si
        // en surt el rival, la teva resposta) és el que fa la sortida teva.
        let ownPly = leftAt;
        while (ownPly <= sans.length && (ownPly % 2 === 1 ? 'w' : 'b') !== color) ownPly++;
        if (ownPly > sans.length) return { ok: false, reason: 'no-own-move' };
        const leftKey = keys[ownPly - 1];
        if (!leftKey) return { ok: false, reason: 'book' };
        if (namedOpeningFor(side.named, keys)) return { ok: false, reason: 'known' };
        if ((side.declined || []).indexOf(leftKey) >= 0) return { ok: false, reason: 'declined' };
        const scheme = computeScheme(side.nodes);
        for (let i = 0; i < sans.length; i++) {
            if ((i % 2 === 0 ? 'w' : 'b') !== color) continue;
            const before = i === 0 ? START_KEY : keys[i - 1];
            const node = side.nodes ? side.nodes[before] : null;
            if (!node || stripSan(node.san) !== stripSan(sans[i])) return { ok: false, reason: 'missing' };
            if (!nodeCoherence(node, scheme).ok) return { ok: false, reason: 'incoherent' };
        }
        return { ok: true, leftKey, leftPly: ownPly, leftSan: sans[ownPly - 1], bookPly: leftAt };
    }

    function addNamedOpening(side, data) {
        if (!side || !data) return null;
        const name = String(data.name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
        if (!name || !data.leftKey || !Array.isArray(data.sans)) return null;
        if (!Array.isArray(side.named)) side.named = [];
        if (side.named.some(o => o.leftKey === data.leftKey)) return null;
        if (side.named.length >= MAX_NAMED) return null;
        const now = typeof data.now === 'number' ? data.now : Date.now();
        const entry = {
            id: 'o' + now.toString(36) + Math.floor(Math.random() * 1e4).toString(36),
            name, sans: data.sans.slice(), leftKey: data.leftKey, leftPly: data.leftPly || 0,
            base: data.base || '', eco: data.eco || '', created: now, practiced: 0, lastPracticed: 0
        };
        side.named.push(entry);
        if (Array.isArray(side.declined)) side.declined = side.declined.filter(k => k !== data.leftKey);
        return entry;
    }

    // ------------------------------------------------------------------
    // L'arbre genealògic del repertori
    // ------------------------------------------------------------------
    // Totes les línies del repertori d'un color (la línia de cada decisió més
    // la jugada) formen un arbre. Es comprimeix en BRANQUES: un tram de jugades
    // fins que el rival té més d'una resposta (o la línia s'acaba). Les branques
    // de primer nivell són les FAMÍLIES; les de sota, les VARIANTS.
    // nameOf(path) → { label, mine, own } posa nom a cada branca (opcional).
    // Cada branca: { moves:[{san, ply, user, node}], path, startPly, children,
    //   label, mine, own, positions, mastered, issues, lines }.
    function familyTree(side, color, nameOf) {
        const nodes = (side && side.nodes) || {};
        const c = color === 'b' ? 'b' : 'w';
        const root = { kids: new Map() };
        Object.keys(nodes).forEach(k => {
            const n = nodes[k];
            if (!n || typeof n.san !== 'string') return;
            const seq = (Array.isArray(n.line) ? n.line : []).concat([n.san]);
            let t = root;
            seq.forEach((san, i) => {
                let kid = t.kids.get(san);
                if (!kid) {
                    kid = { kids: new Map(), san, ply: i + 1, user: (i % 2 === 0 ? 'w' : 'b') === c, node: null };
                    t.kids.set(san, kid);
                }
                t = kid;
            });
            if (t.user) t.node = n;
        });
        const scheme = computeScheme(nodes);
        function branch(start, path) {
            const moves = [];
            const p = path.slice();
            let t = start;
            for (;;) {
                moves.push({ san: t.san, ply: t.ply, user: t.user, node: t.node });
                p.push(t.san);
                if (t.kids.size !== 1) break;
                t = t.kids.values().next().value;
            }
            const children = Array.from(t.kids.values()).map(k => branch(k, p));
            children.sort((a, b) => b.lines - a.lines || a.path.join(' ').localeCompare(b.path.join(' ')));
            const own = moves.filter(m => m.user && m.node);
            const sum = f => children.reduce((acc, ch) => acc + ch[f], 0);
            const out = {
                moves, path: p, startPly: moves[0].ply, children,
                positions: own.length + sum('positions'),
                mastered: own.filter(m => (Number(m.node.box) || 0) >= MASTERED_BOX).length + sum('mastered'),
                issues: own.filter(m => !nodeCoherence(m.node, scheme).ok).length + sum('issues'),
                lines: children.length ? sum('lines') : 1,
                label: '', mine: false, own: false
            };
            if (typeof nameOf === 'function') {
                const nm = nameOf(p) || {};
                out.label = nm.label || '';
                out.mine = !!nm.mine;
                out.own = !!nm.own;
            }
            return out;
        }
        const families = Array.from(root.kids.values()).map(k => branch(k, []));
        families.sort((a, b) => b.lines - a.lines);
        const total = f => families.reduce((acc, x) => acc + x[f], 0);
        return { families, positions: total('positions'), lines: total('lines'), issues: total('issues'), mastered: total('mastered') };
    }

    // «1.e4 c5 2.Nf3» / «1...c5 2.Nf3»: numeració d'un tram que comença a la mitja jugada startPly.
    function formatMoves(moves) {
        return (moves || []).map((m, i) => {
            const white = m.ply % 2 === 1;
            const num = Math.ceil(m.ply / 2);
            if (white) return num + '.' + m.san;
            return (i === 0 ? num + '...' : '') + m.san;
        }).join(' ');
    }

    // Nombre de jugades de l'usuari en una línia (per allargar la pràctica
    // fins al final de l'obertura desada).
    function userMovesIn(sans, color) {
        return (sans || []).filter((_, i) => (i % 2 === 0 ? 'w' : 'b') === color).length;
    }

    function schemeList(scheme) {
        return Object.keys(scheme || {}).map(origin => ({ origin, entry: scheme[origin] }))
            .sort((a, b) => a.entry.ply - b.entry.ply)
            .map(x => ({ origin: x.origin, label: planLabel(x.origin, x.entry), count: x.entry.count, total: x.entry.total, piece: x.entry.piece }));
    }

    const api = {
        STORE_KEY, EVALS_KEY, START_KEY, DEPTH_OPTIONS, DEFAULT_DEPTH, VERDICTS, SRS_INTERVALS, MASTERED_BOX,
        PLAN_EXCEPTION_CP, PRINCIPLE_TOLERANCE_CP,
        positionKey, parsePgn, translateOpeningName, translateSegment,
        buildSequenceTrie, trieAt, bookMoves, lineName,
        annotateLine, candidateInfo, planTarget, computeScheme, planCheck, nodeCoherence,
        planMoves, planMoveForOrigin, planLabel, schemeList, describeMove, planCheckText,
        scoreToCp, parseInfoLine, judgeMove, verdictFor, formatCp, formatLoss,
        srsAfter, isDue, rivalCandidates, pickWeighted,
        emptyStore, normalizeStore, rememberEval, repertoireReport, PIECE_CA,
        namedOpeningFor, namingCandidate, addNamedOpening, userMovesIn, MAX_NAMED,
        familyTree, formatMoves,
        dominantVariation, OPTION_COLORS, groupOptions, optionSquareMarks, optionShadow, hexToRgba
    };

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        Object.assign(api, createUi(api));
    }
    return api;

    // ======================================================================
    // INTERFÍCIE (només navegador)
    // ======================================================================
    function createUi(L) {
        const PIECE_THEME = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png';
        // Força de l'anàlisi: prou per jutjar obertures en un mòbil sense fer esperar.
        const PARAMS = {
            decide: { multipv: 4, depth: 14, movetime: 1400 },
            rival: { multipv: 5, depth: 13, movetime: 1100 },
            after: { multipv: 1, depth: 12, movetime: 800 }
        };
        const RIVAL_MIN_MS = 450;
        const cfg = { stockfishUrl: 'stockfish-19-lite-single.js', getGraph: null, onHiero: null, onHome: null };
        const ui = {
            store: null, trie: null, board: null, game: null, sans: [], marks: [],
            color: 'w', depth: L.DEFAULT_DEPTH, phase: 'idle', token: 0,
            visit: null, hintLevel: 0, tapFrom: null, lastMove: null, expected: null, hintSquares: null,
            pending: null, forceDecideKey: null, reviewNote: '', feedback: '', rivalNote: '',
            lineStats: null, lastName: '', orientation: null, wired: false, engine: null,
            follow: null, namePrompt: null, optionMarks: null,
            storeVersion: 0, treeKey: '', treePaths: [],
            evalMem: new Map(), inflight: new Map(), saveTimer: null
        };

        // ---------------- utilitats ----------------
        const $ = () => root.jQuery;
        const ChessCtor = () => root.Chess;
        const byId = id => document.getElementById(id);
        const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        function controlModeNow() {
            try { return (typeof controlMode !== 'undefined' && controlMode) ? controlMode : null; } catch (e) { return null; }
        }
        function graph() {
            try { return typeof cfg.getGraph === 'function' ? cfg.getGraph() : null; } catch (e) { return null; }
        }
        function ctx() {
            if (!ui.trie && typeof OPENINGS_DATA !== 'undefined') {
                try { ui.trie = L.buildSequenceTrie(OPENINGS_DATA); } catch (e) { ui.trie = null; }
            }
            return { trie: ui.trie, graph: graph() };
        }
        function side() { return ui.store.sides[ui.color]; }
        function moveNo(ply) { return Math.ceil(ply / 2); }
        function moveLabel(ply, san) { return moveNo(ply) + (ply % 2 ? '.' : '...') + san; }
        function userPlies() { return L.userMovesIn(ui.sans, ui.color); }
        // Practicant una obertura desada, la línia arriba com a mínim al seu final.
        function lineDepth() { return ui.follow ? Math.max(ui.depth, L.userMovesIn(ui.follow.sans, ui.color)) : ui.depth; }
        function followNext() {
            const f = ui.follow;
            if (!f || f.sans.length <= ui.sans.length) return null;
            for (let i = 0; i < ui.sans.length; i++) if (f.sans[i] !== ui.sans[i]) return null;
            return f.sans[ui.sans.length];
        }
        function namedHere() {
            return L.namedOpeningFor(side().named, L.annotateLine(ChessCtor(), ui.sans).keys);
        }

        // ---------------- magatzem ----------------
        function loadStore() {
            let raw = null;
            try { raw = JSON.parse(localStorage.getItem(L.STORE_KEY) || 'null'); } catch (e) { raw = null; }
            ui.store = L.normalizeStore(raw);
            try {
                const evals = JSON.parse(localStorage.getItem(L.EVALS_KEY) || 'null');
                if (evals && typeof evals === 'object') ui.store.evals = evals;
            } catch (e) {}
            ui.color = ui.store.prefs.color;
            ui.depth = ui.store.prefs.depth;
        }
        function saveStore(now) {
            ui.storeVersion++;
            if (ui.saveTimer) { clearTimeout(ui.saveTimer); ui.saveTimer = null; }
            const write = () => {
                const { evals, ...rest } = ui.store;
                try { localStorage.setItem(L.STORE_KEY, JSON.stringify(rest)); } catch (e) {}
                try { localStorage.setItem(L.EVALS_KEY, JSON.stringify(evals || {})); } catch (e) {}
            };
            if (now) write(); else ui.saveTimer = setTimeout(write, 400);
        }

        // ---------------- Stockfish 19 ----------------
        function createEngine(url) {
            let worker = null, ready = null, queue = Promise.resolve(), dead = false;
            function dispose() {
                if (worker) { try { worker.terminate(); } catch (e) {} }
                worker = null; ready = null;
            }
            function boot() {
                if (ready) return ready;
                ready = new Promise(resolve => {
                    try { worker = new Worker(url); } catch (e) { resolve(false); return; }
                    const w = worker;
                    const done = ok => {
                        clearTimeout(timer);
                        try { w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); } catch (e) {}
                        resolve(ok);
                    };
                    const onMsg = e => { if (typeof e.data === 'string' && e.data.trim() === 'readyok') done(true); };
                    const onErr = () => done(false);
                    const timer = setTimeout(() => done(false), 15000);
                    w.addEventListener('message', onMsg);
                    w.addEventListener('error', onErr);
                    try { w.postMessage('uci'); w.postMessage('setoption name Hash value 16'); w.postMessage('isready'); }
                    catch (e) { done(false); }
                }).then(ok => { if (!ok) { dead = true; dispose(); } return ok; });
                return ready;
            }
            function run(fen, p) {
                return new Promise(resolve => {
                    const w = worker;
                    const lines = new Map();
                    let depth = 0, finished = false, stopTimer = null;
                    const finish = () => {
                        if (finished) return;
                        finished = true;
                        clearTimeout(timer); clearTimeout(stopTimer);
                        try { w.removeEventListener('message', onMsg); } catch (e) {}
                        resolve({ depth, lines: Array.from(lines.values()).sort((a, b) => a.multipv - b.multipv) });
                    };
                    const onMsg = e => {
                        const s = e.data;
                        if (typeof s !== 'string') return;
                        if (s.indexOf('info') === 0) {
                            const info = L.parseInfoLine(s);
                            if (info) { lines.set(info.multipv, info); depth = Math.max(depth, info.depth); }
                        } else if (s.indexOf('bestmove') === 0) finish();
                    };
                    const timer = setTimeout(() => {
                        try { w.postMessage('stop'); } catch (e) {}
                        stopTimer = setTimeout(finish, 900);
                    }, p.movetime + 4000);
                    w.addEventListener('message', onMsg);
                    try {
                        w.postMessage('setoption name MultiPV value ' + p.multipv);
                        w.postMessage('position fen ' + fen);
                        w.postMessage('go depth ' + p.depth + ' movetime ' + p.movetime);
                    } catch (e) { finish(); }
                });
            }
            function analyze(fen, p) {
                const task = queue.then(async () => {
                    if (dead) return null;
                    const ok = await boot();
                    if (!ok || !worker) return null;
                    return run(fen, p);
                });
                queue = task.catch(() => null);
                return task;
            }
            return { analyze, dispose, isDead: () => dead, revive: () => { dead = false; } };
        }
        function engine() {
            if (!ui.engine) ui.engine = createEngine(cfg.stockfishUrl);
            return ui.engine;
        }
        function linesWithSan(fen, raw) {
            const Chess = ChessCtor();
            const out = [];
            raw.forEach(l => {
                try {
                    const g = new Chess(fen);
                    const m = g.move({ from: l.uci.slice(0, 2), to: l.uci.slice(2, 4), promotion: l.uci[4] || undefined });
                    if (m) out.push({ uci: l.uci, san: m.san, cp: l.cp });
                } catch (e) {}
            });
            return out;
        }
        function analysis(fen, kind) {
            const p = PARAMS[kind];
            const key = L.positionKey(fen);
            const good = r => r && r.multipv >= p.multipv && r.depth >= p.depth - 2 && r.lines.length;
            const mem = ui.evalMem.get(key);
            if (good(mem)) return Promise.resolve(mem);
            const stored = ui.store.evals[key];
            if (stored && Array.isArray(stored.l)) {
                const r = { depth: stored.d, multipv: stored.m, lines: linesWithSan(fen, stored.l.map(x => ({ uci: x[0], cp: x[1] }))) };
                if (good(r)) { ui.evalMem.set(key, r); return Promise.resolve(r); }
            }
            const flightKey = key + '|' + kind;
            if (ui.inflight.has(flightKey)) return ui.inflight.get(flightKey);
            const task = engine().analyze(fen, p).then(res => {
                ui.inflight.delete(flightKey);
                if (!res || !res.lines.length) return null;
                const r = { depth: res.depth, multipv: p.multipv, lines: linesWithSan(fen, res.lines) };
                if (!r.lines.length) return null;
                ui.evalMem.set(key, r);
                L.rememberEval(ui.store, key, { d: r.depth, m: r.multipv, l: r.lines.map(x => [x.uci, x.cp]) });
                saveStore();
                return r;
            }, () => { ui.inflight.delete(flightKey); return null; });
            ui.inflight.set(flightKey, task);
            return task;
        }
        // Valor d'una jugada (punt de vista de qui la fa) i, si cal analitzar la
        // posició resultant, la millor resposta del rival (per explicar errors).
        async function moveEval(fenBefore, uci, an) {
            const hit = an && an.lines.find(l => l.uci === uci);
            if (hit) return { cp: hit.cp, reply: null };
            const g = new (ChessCtor())(fenBefore);
            const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
            if (!m) return null;
            if (g.in_checkmate()) return { cp: 10000, reply: null };
            if (g.game_over()) return { cp: 0, reply: null };
            const after = await analysis(g.fen(), 'after');
            if (!after || !after.lines.length) return null;
            return { cp: -after.lines[0].cp, reply: after.lines[0].san };
        }
        async function evaluateMove(fenBefore, uci) {
            const an = await analysis(fenBefore, 'decide');
            if (!an || !an.lines.length) return null;
            const me = await moveEval(fenBefore, uci, an);
            if (!me) return null;
            const best = an.lines[0];
            return { bestCp: best.cp, bestSan: best.san, bestUci: best.uci, playedCp: me.cp, reply: me.reply, depth: an.depth, lines: an.lines };
        }

        // ---------------- tauler ----------------
        function squareEl(sq) { const jq = $(); return jq ? jq('#olab-board .square-' + sq) : null; }
        function paintMarks() {
            const jq = $();
            if (!jq) return;
            jq('#olab-board .square-55d63').removeClass('tap-selected tap-move mark-from mark-to olab-expected olab-hint-sq').each(function () {
                if (this.style.boxShadow) this.style.boxShadow = '';
            });
            // Opcions de la pista: el color de cada obertura possible.
            if (ui.optionMarks && ui.phase === 'user' && ui.optionMarks.key === currentKey()) {
                const marks = L.optionSquareMarks(ui.optionMarks.groups, ui.optionMarks.focus);
                Object.keys(marks).forEach(sq => { const el = squareEl(sq); if (el && el[0]) el[0].style.boxShadow = L.optionShadow(marks[sq]); });
            }
            // Última jugada: la marca de jugada única de l'app (origen daurat, destí blau cel).
            if (ui.lastMove) {
                const f = squareEl(ui.lastMove.from), t = squareEl(ui.lastMove.to);
                if (f) f.addClass('mark-from');
                if (t) t.addClass('mark-to');
            }
            if (ui.expected) { [ui.expected.from, ui.expected.to].forEach(sq => { if (sq) { const el = squareEl(sq); if (el) el.addClass('olab-expected'); } }); }
            if (ui.hintSquares) ui.hintSquares.forEach(sq => { const el = squareEl(sq); if (el) el.addClass('olab-hint-sq'); });
            if (ui.tapFrom) {
                const el = squareEl(ui.tapFrom);
                if (el) el.addClass('tap-selected');
                ui.game.moves({ square: ui.tapFrom, verbose: true }).forEach(m => { const t = squareEl(m.to); if (t) t.addClass('tap-move'); });
            }
        }
        function syncBoard(animate) {
            if (!ui.board || !ui.game) return;
            try { ui.board.position(ui.game.fen(), !!animate); } catch (e) {}
            setTimeout(paintMarks, animate ? 260 : 0);
        }
        function canTouch(piece) {
            if (ui.phase !== 'user' || !ui.game) return false;
            if (ui.game.turn() !== ui.color) return false;
            return !piece || piece.charAt(0) === ui.color;
        }
        function buildBoard() {
            const jq = $();
            if (!jq || typeof root.Chessboard !== 'function' || !byId('olab-board')) return;
            if (ui.board) { try { ui.board.destroy(); } catch (e) {} ui.board = null; }
            const tap = controlModeNow() === 'tap';
            ui.orientation = ui.color;
            ui.board = root.Chessboard('olab-board', {
                position: ui.game ? ui.game.fen() : 'start',
                orientation: ui.color === 'b' ? 'black' : 'white',
                draggable: !tap,
                pieceTheme: PIECE_THEME,
                onDragStart: (source, piece) => canTouch(piece),
                onDrop: (source, target) => {
                    if (source === target) return 'snapback';
                    return tryUserMove(source, target) ? undefined : 'snapback';
                },
                onSnapEnd: () => syncBoard(false)
            });
            jq('#olab-board').off('click.olab').on('click.olab', '.square-55d63', function () {
                if (controlModeNow() === 'tap') onSquareTap(jq(this).attr('data-square'));
            });
            resize();
        }
        function onSquareTap(sq) {
            if (!sq || ui.phase !== 'user' || !ui.game) return;
            if (ui.tapFrom) {
                if (sq === ui.tapFrom) { ui.tapFrom = null; paintMarks(); return; }
                const legal = ui.game.moves({ square: ui.tapFrom, verbose: true }).some(m => m.to === sq);
                if (legal) {
                    const from = ui.tapFrom;
                    ui.tapFrom = null;
                    if (!tryUserMove(from, sq)) syncBoard(false);
                    else paintMarks();
                    return;
                }
            }
            const p = ui.game.get(sq);
            if (p && p.color === ui.color && canTouch(p.color + p.type) && ui.game.moves({ square: sq }).length) ui.tapFrom = sq;
            else ui.tapFrom = null;
            paintMarks();
        }
        function resize() {
            const wrap = byId('olab-board-wrap');
            const el = byId('olab-board');
            if (!wrap || !el || !ui.board) return;
            const screen = byId('opening-screen');
            if (screen && screen.style.display === 'none') return;
            const w = wrap.clientWidth - 2;
            const desktop = document.body.classList.contains('device-desktop');
            const maxH = Math.max(260, root.innerHeight - (desktop ? 170 : 220));
            const size = Math.max(220, Math.floor(Math.min(w, maxH, desktop ? 600 : 620) / 8) * 8);
            el.style.width = size + 'px';
            try { ui.board.resize(); } catch (e) {}
            paintMarks();
        }

        // ---------------- flux d'una línia ----------------
        function currentKey() { return L.positionKey(ui.game.fen()); }
        function currentNode() {
            const key = currentKey();
            if (ui.forceDecideKey === key) return null;
            return side().nodes[key] || null;
        }
        function startLine(opts) {
            const o = opts || {};
            ui.token++;
            ui.game = new (ChessCtor())();
            ui.sans = []; ui.marks = [];
            ui.pending = null; ui.expected = null; ui.hintSquares = null; ui.tapFrom = null; ui.lastMove = null;
            ui.forceDecideKey = null; ui.reviewNote = ''; ui.rivalNote = '';
            ui.feedback = o.feedback || '';
            ui.lineStats = { newCount: 0, recallOk: 0, recallTotal: 0 };
            ui.follow = o.follow || null;
            ui.namePrompt = null;
            if (Array.isArray(o.line)) {
                for (const san of o.line) {
                    const m = ui.game.move(san, { sloppy: true });
                    if (!m) break;
                    ui.sans.push(m.san);
                    ui.marks.push(m.color === ui.color ? 'ok' : 'rival');
                    ui.lastMove = { from: m.from, to: m.to };
                }
            }
            if (!ui.board || ui.orientation !== ui.color) buildBoard();
            else syncBoard(false);
            if (ui.game.turn() === ui.color) userTurn(); else rivalTurn();
        }
        function userTurn() {
            ui.phase = 'user';
            ui.visit = { key: currentKey(), failed: false, hinted: false, counted: false };
            ui.hintLevel = 0; ui.hintSquares = null; ui.expected = null; ui.optionMarks = null;
            if (ui.game.game_over()) { finishLine('gameover'); return; }
            if (!currentNode()) analysis(ui.game.fen(), 'decide');
            render();
            paintMarks();
        }
        function applyMove(m) {
            const mv = ui.game.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
            if (!mv) return null;
            ui.sans.push(mv.san);
            ui.lastMove = { from: mv.from, to: mv.to };
            return mv;
        }
        function undoMove() {
            ui.game.undo();
            ui.sans.pop();
            ui.marks.length = ui.sans.length;
            const h = ui.game.history({ verbose: true });
            const last = h[h.length - 1];
            ui.lastMove = last ? { from: last.from, to: last.to } : null;
        }
        // Retorna true si la peça s'ha de quedar on l'han deixada.
        function tryUserMove(from, to) {
            if (ui.phase !== 'user' || !ui.game || ui.game.turn() !== ui.color) return false;
            const probe = new (ChessCtor())(ui.game.fen());
            const mv = probe.move({ from, to, promotion: 'q' });
            if (!mv) return false;
            ui.expected = null; ui.hintSquares = null; ui.optionMarks = null;
            const node = currentNode();
            if (node) return recall(node, mv);
            void decide(mv);
            return true;
        }

        function recall(node, mv) {
            const key = currentKey();
            if (L.positionKey(ui.game.fen()) !== key) return false;
            if (mv.san.replace(/[+#]$/, '') === node.san.replace(/[+#]$/, '')) {
                applyMove(mv);
                const outcome = ui.visit.failed ? 'fail' : (ui.visit.hinted ? 'hinted' : 'ok');
                if (!ui.visit.counted) {
                    Object.assign(node, L.srsAfter(node, outcome));
                    node.seen = (node.seen || 0) + 1;
                    if (outcome === 'ok') node.ok = (node.ok || 0) + 1;
                    node.updated = Date.now();
                    ui.visit.counted = true;
                    ui.lineStats.recallTotal++;
                    if (outcome === 'ok') ui.lineStats.recallOk++;
                    saveStore();
                }
                ui.marks[ui.sans.length - 1] = outcome === 'ok' ? 'ok' : 'retry';
                ui.feedback = '<div class="olab-fb olab-fb--ok"><span class="olab-pill olab-pill--good">✓ La teva jugada</span> <b>' + esc(moveLabel(ui.sans.length, mv.san)) + '</b> — ' + esc(L.describeMove(node)) +
                    (outcome === 'ok' ? '' : ' <span class="olab-muted">La repassaràs aviat.</span>') + '</div>';
                afterUserMove();
                return true;
            }
            if (!ui.visit.failed) ui.visit.failed = true;
            if (!ui.visit.counted) {
                Object.assign(node, L.srsAfter(node, 'fail'));
                node.seen = (node.seen || 0) + 1;
                node.updated = Date.now();
                ui.visit.counted = true;
                ui.lineStats.recallTotal++;
                saveStore();
            }
            ui.expected = { from: node.from, to: node.to };
            ui.pending = { swap: { from: mv.from, to: mv.to, san: mv.san } };
            ui.feedback = '<div class="olab-fb olab-fb--bad"><span class="olab-pill olab-pill--dubious">✗ No és la teva</span> Aquí jugues <b>' + esc(node.san) + '</b> (marcada al tauler): ' + esc(L.describeMove(node)) +
                ' Fes-la per continuar.<div class="olab-fb-actions"><button type="button" class="btn btn-secondary olab-btn-sm" data-olab-act="swap">Canvia-la per ' + esc(mv.san) + '</button></div></div>';
            render();
            setTimeout(paintMarks, 30);
            return false;
        }

        async function decide(mv) {
            const tok = ui.token;
            const Chess = ChessCtor();
            const fenBefore = ui.game.fen();
            const keyBefore = L.positionKey(fenBefore);
            const sansBefore = ui.sans.slice();
            const lineBefore = L.annotateLine(Chess, sansBefore);
            const info = L.candidateInfo(lineBefore, mv);
            const inBook = L.bookMoves(ctx(), sansBefore, keyBefore).some(b => b.san.replace(/[+#]$/, '') === mv.san.replace(/[+#]$/, ''));
            const played = applyMove(mv);
            if (!played) return;
            ui.phase = 'judging';
            ui.feedback = '<div class="olab-fb olab-fb--wait"><span class="olab-spinner" aria-hidden="true"></span> Stockfish 19 analitza <b>' + esc(moveLabel(ui.sans.length, mv.san)) + '</b>…</div>';
            render();
            syncBoard(false);
            const ev = await evaluateMove(fenBefore, info.uci);
            if (tok !== ui.token) return;
            let judged;
            if (ev) judged = L.judgeMove(ev.bestCp, ev.playedCp);
            else judged = inBook ? { ok: true, verdict: 'book', label: 'Teoria', loss: 0 } : { ok: true, verdict: 'unverified', label: 'Sense validar', loss: null };
            if (!judged.ok) {
                undoMove();
                syncBoard(true);
                ui.phase = 'user';
                // Bones opcions, amb les del teu pla al davant.
                const planSans = new Set(L.planMoves(L.computeScheme(side().nodes), lineBefore).map(p => p.san));
                const good = ev.lines.filter(l => ev.bestCp - l.cp <= 50)
                    .sort((a, b) => (planSans.has(b.san) ? 1 : 0) - (planSans.has(a.san) ? 1 : 0))
                    .map(l => '<b>' + esc(l.san) + '</b>' + (planSans.has(l.san) ? ' <span class="olab-muted">(el teu pla)</span>' : ''));
                ui.feedback = '<div class="olab-fb olab-fb--bad"><span class="olab-pill olab-pill--dubious">✗ Dubtosa</span> <b>' + esc(mv.san) + '</b> perd ' + esc(L.formatLoss(judged.loss)) +
                    ' segons Stockfish 19' + (ev.reply ? ': el rival respondria <b>' + esc(ev.reply) + '</b>' : '') + '.' +
                    (good.length ? ' Bones opcions: ' + good.join(', ') + '.' : '') + ' Torna-ho a provar: aquesta no entra al teu repertori.</div>';
                render();
                return;
            }
            const sch = L.computeScheme(side().nodes, keyBefore);
            const check = L.planCheck(sch, info);
            let justified = false, justifyNote = '';
            if (check.kind === 'conflict') {
                const pm = L.planMoveForOrigin(sch, lineBefore, info.origin);
                if (!pm) { justified = true; justifyNote = 'Aquí ' + check.expected + ' no és possible.'; }
                else if (ev) {
                    const pmEval = await moveEval(fenBefore, pm.uci, ev);
                    const pmCp = pmEval ? pmEval.cp : null;
                    if (tok !== ui.token) return;
                    if (pmCp == null || pmCp < ev.playedCp - L.PLAN_EXCEPTION_CP) {
                        justified = true;
                        justifyNote = 'Aquí ' + pm.san + ' (el teu pla) perd ' + L.formatLoss(ev.playedCp - (pmCp == null ? ev.playedCp - 100 : pmCp)) + ' més segons Stockfish 19.';
                    } else {
                        ui.phase = 'conflict';
                        ui.pending = { conflict: { mv, info, ev, judged, inBook, fenBefore, keyBefore, sansBefore, pm, pmCp, check } };
                        ui.feedback = '<div class="olab-fb olab-fb--warn"><span class="olab-pill olab-pill--playable">⚠ Pla</span> <b>' + esc(mv.san) + '</b> és ' + esc(judged.label.toLowerCase()) +
                            ', però trenca el teu pla: a les altres línies jugues <b>' + esc(check.expected) + '</b>, i aquí <b>' + esc(pm.san) + '</b> també és bona (Stockfish 19: ' + esc(L.formatCp(pmCp)) + ' contra ' + esc(L.formatCp(ev.playedCp)) + ').' +
                            '<div class="olab-fb-actions"><button type="button" class="btn btn-primary olab-btn-sm" data-olab-act="keep-plan">Juga ' + esc(pm.san) + ' (mantén el pla)</button>' +
                            '<button type="button" class="btn btn-secondary olab-btn-sm" data-olab-act="change-plan">Mantén ' + esc(mv.san) + ' (canvia el pla)</button></div></div>';
                        render();
                        return;
                    }
                }
            } else if ((check.kind === 'repeat' || check.kind === 'queen-early') && (inBook || (ev && judged.loss <= L.PRINCIPLE_TOLERANCE_CP))) {
                justified = true;
            }
            commitDecision({ mv, info, ev, judged, inBook, keyBefore, sansBefore, justified, justifyNote, check });
        }

        function commitDecision(d) {
            const now = Date.now();
            const keysAfter = L.annotateLine(ChessCtor(), ui.sans).keys;
            const named = L.lineName(ctx(), ui.sans, keysAfter);
            const node = Object.assign({}, d.info, {
                line: d.sansBefore, name: named.name, eco: named.eco,
                verdict: d.judged.verdict, label: d.judged.label, loss: d.judged.loss,
                cp: d.ev ? d.ev.playedCp : null, bestSan: d.ev ? d.ev.bestSan : null, bestCp: d.ev ? d.ev.bestCp : null,
                depth: d.ev ? d.ev.depth : null, inBook: !!d.inBook, justified: !!d.justified, justifyNote: d.justifyNote || '',
                unverified: d.judged.verdict === 'unverified', planChange: !!d.planChange,
                box: 1, due: now + L.SRS_INTERVALS[1], seen: 0, ok: 0, created: now, updated: now
            });
            side().nodes[d.keyBefore] = node;
            if (ui.forceDecideKey === d.keyBefore) { ui.forceDecideKey = null; ui.reviewNote = ''; }
            saveStore(true);
            ui.lineStats.newCount++;
            ui.marks[ui.sans.length - 1] = 'new';
            const sch = L.computeScheme(side().nodes);
            const coh = L.nodeCoherence(node, sch);
            // «Nova peça al pla» es decideix amb el pla d'ABANS d'aquesta jugada.
            const before = L.planCheck(L.computeScheme(side().nodes, d.keyBefore), node);
            if (coh.kind === 'plan' && before.kind === 'new') coh.kind = 'new';
            const pillClass = { excellent: 'excellent', good: 'good', playable: 'playable', book: 'good', unverified: 'playable' }[d.judged.verdict] || 'good';
            let sf = '';
            if (d.ev) {
                sf = 'Stockfish 19: ' + esc(L.formatCp(d.ev.playedCp));
                if (d.judged.loss >= 15 && d.ev.bestSan && d.ev.bestSan !== node.san) sf += ' · la millor era <b>' + esc(d.ev.bestSan) + '</b> (' + esc(L.formatCp(d.ev.bestCp)) + ')';
                sf += '.';
            } else if (d.judged.verdict === 'book') sf = 'Jugada de teoria (Stockfish 19 no ha respost).';
            else sf = 'Stockfish 19 no ha respost: la validarem més endavant.';
            let planTxt = '';
            if (coh.kind === 'plan') planTxt = 'Segueix el teu pla.';
            else if (coh.kind === 'new') planTxt = 'Nova peça al teu pla: ' + esc(L.planLabel(node.origin, { to: L.planTarget(node), piece: node.piece })) + '.';
            else if (coh.kind === 'exception') planTxt = 'Excepció justificada: ' + esc(d.justifyNote || 'motiu concret.');
            else if (coh.kind === 'conflict') planTxt = '<span class="olab-warn">Trenca el pla (' + esc(coh.expected) + ').</span>';
            else if (coh.kind === 'repeat') planTxt = '<span class="olab-warn">Torna a moure una peça sense motiu clar.</span>';
            else if (coh.kind === 'queen-early') planTxt = '<span class="olab-warn">Dama massa aviat.</span>';
            else if (coh.kind === 'concrete') planTxt = 'Jugada concreta.';
            const fixBtn = coh.ok ? '' : '<div class="olab-fb-actions"><button type="button" class="btn btn-secondary olab-btn-sm" data-olab-act="redo">Prova’n una altra</button></div>';
            ui.feedback = '<div class="olab-fb olab-fb--ok"><span class="olab-pill olab-pill--' + pillClass + '">' + esc(d.judged.label) + '</span> <b>' + esc(moveLabel(ui.sans.length, node.san)) + '</b> — ' + esc(L.describeMove(node)) +
                '<div class="olab-fb-sub">' + sf + ' ' + planTxt + ' <span class="olab-muted">Desada al teu repertori.</span></div>' + fixBtn + '</div>';
            afterUserMove();
        }

        function afterUserMove() {
            ui.pending = null;
            syncBoard(false);
            if (ui.game.game_over()) { finishLine('gameover'); return; }
            if (userPlies() >= lineDepth()) { finishLine('depth'); return; }
            rivalTurn();
        }

        async function rivalTurn() {
            const tok = ui.token;
            ui.phase = 'rival';
            ui.rivalNote = '';
            render();
            const started = Date.now();
            const fen = ui.game.fen();
            const key = L.positionKey(fen);
            const Chess = ChessCtor();
            const legal = san => { try { return !!new Chess(fen).move(san, { sloppy: true }); } catch (e) { return false; } };
            let pick = null;
            // Practicant una obertura desada, el rival en segueix la línia.
            const fl = followNext();
            if (fl && legal(fl)) pick = { san: fl, source: 'follow' };
            else {
                const book = L.bookMoves(ctx(), ui.sans, key).filter(b => legal(b.san));
                const an = await analysis(fen, 'rival');
                if (tok !== ui.token) return;
                const engineLines = an ? an.lines.map(l => ({ san: l.san, cp: l.cp })) : [];
                const nodeAfter = san => {
                    try { const g = new Chess(fen); if (!g.move(san, { sloppy: true })) return null; return side().nodes[L.positionKey(g.fen())] || null; } catch (e) { return null; }
                };
                // Normalitza el SAN del llibre amb el de chess.js (escacs inclosos).
                const bookNorm = book.map(b => { const g = new Chess(fen); const m = g.move(b.san, { sloppy: true }); return { san: m.san, count: b.count }; });
                const cands = L.rivalCandidates({ book: bookNorm, engine: engineLines, nodeAfter });
                pick = L.pickWeighted(cands);
                if (!pick) { finishLine(engineLines.length || book.length ? 'nomoves' : 'noengine'); return; }
            }
            const wait = RIVAL_MIN_MS - (Date.now() - started);
            if (wait > 0) await sleep(wait);
            if (tok !== ui.token) return;
            const mv = ui.game.move(pick.san, { sloppy: true });
            if (!mv) { finishLine('nomoves'); return; }
            ui.sans.push(mv.san);
            ui.marks[ui.sans.length - 1] = 'rival';
            ui.lastMove = { from: mv.from, to: mv.to };
            ui.rivalNote = 'Rival: <b>' + esc(moveLabel(ui.sans.length, mv.san)) + '</b> <span class="olab-muted">(' + (pick.source === 'book' ? 'teoria' : pick.source === 'follow' ? 'la teva obertura «' + esc(ui.follow.name) + '»' : 'Stockfish 19, fora de llibre') + ')</span>';
            syncBoard(true);
            userTurn();
        }

        function finishLine(reason) {
            ui.phase = 'done';
            ui.pending = null;
            const rep = L.repertoireReport(side());
            const s = ui.lineStats || { newCount: 0, recallOk: 0, recallTotal: 0 };
            const why = reason === 'gameover' ? 'La partida s’ha acabat.' : reason === 'noengine' ? 'Fora de llibre i sense Stockfish 19: la línia s’acaba aquí.' : reason === 'nomoves' ? 'El rival no té resposta preparada.' : 'Línia completada.';
            let practiced = '';
            if (ui.follow && reason !== 'noengine') {
                const f = side().named.find(o => o.id === ui.follow.id);
                if (f) { f.practiced = (f.practiced || 0) + 1; f.lastPracticed = Date.now(); practiced = ' Has practicat «' + esc(f.name) + '» (' + f.practiced + (f.practiced === 1 ? ' cop' : ' cops') + ').'; }
            }
            ui.feedback = (ui.feedback || '') + '<div class="olab-fb olab-fb--done"><b>' + esc(why) + '</b> Noves decisions: <b>' + s.newCount + '</b> · Recordades: <b>' + s.recallOk + '/' + s.recallTotal + '</b> · Coherència del repertori: <b>' + rep.coherencePct + '%</b>.' + practiced +
                '<div class="olab-fb-actions"><button type="button" class="btn btn-primary olab-btn-sm" data-olab-act="new">Una altra línia</button>' +
                (ui.follow ? '<button type="button" class="btn btn-secondary olab-btn-sm" data-olab-practice="' + esc(ui.follow.id) + '">Torna-la a practicar</button>' : '') + '</div></div>';
            if (reason === 'depth' || reason === 'nomoves') offerName();
            saveStore(true);
            render();
            paintMarks();
        }

        // Sortida pròpia, coherent i nova: demana-li un nom.
        function offerName() {
            const Chess = ChessCtor();
            const keys = L.annotateLine(Chess, ui.sans).keys;
            const nm = L.lineName(ctx(), ui.sans, keys);
            const cand = L.namingCandidate({ side: side(), sans: ui.sans, keys, leftAt: nm.leftAt, color: ui.color });
            if (!cand.ok) return;
            const base = L.lineName(ctx(), ui.sans.slice(0, cand.bookPly - 1), keys.slice(0, cand.bookPly - 1));
            const suggestion = (base.nameCa ? base.nameCa.split(':')[0] + ', ' : '') + 'variant ' + cand.leftSan;
            ui.namePrompt = { cand, sans: ui.sans.slice(), base: base.nameCa || '', eco: base.eco || '', suggestion };
            ui.feedback += '<div class="olab-fb olab-fb--name" id="olab-name-prompt"><div class="olab-hint-title">✨ Has creat una sortida pròpia i coherent</div>' +
                (cand.leftPly === cand.bookPly
                    ? 'Amb <b>' + esc(moveLabel(cand.leftPly, cand.leftSan)) + '</b> surts de la teoria' + (base.nameCa ? ' (' + esc(base.nameCa) + ')' : '')
                    : 'Fora de la teoria' + (base.nameCa ? ' (' + esc(base.nameCa) + ')' : '') + ', <b>' + esc(moveLabel(cand.leftPly, cand.leftSan)) + '</b> és la teva primera jugada pròpia') +
                ' i totes les teves jugades segueixen el pla. Posa-li un nom: la guardarem amb les teves obertures, el tauler la reconeixerà i la podràs practicar.' +
                '<div class="olab-name-form"><input type="text" class="olab-input" id="olab-newname" maxlength="60" placeholder="' + esc(suggestion) + '" aria-label="Nom de la teva obertura">' +
                '<button type="button" class="btn btn-primary olab-btn-sm" data-olab-act="save-name">Desa-la</button>' +
                '<button type="button" class="btn btn-secondary olab-btn-sm" data-olab-act="decline-name">Ara no</button></div></div>';
            setTimeout(() => { const el = byId('olab-newname'); if (el && document.body.classList.contains('device-desktop')) el.focus(); }, 50);
        }
        function saveName() {
            const p = ui.namePrompt;
            if (!p) return;
            const input = byId('olab-newname');
            const name = (input && input.value.trim()) || p.suggestion;
            const entry = L.addNamedOpening(side(), { name, sans: p.sans, leftKey: p.cand.leftKey, leftPly: p.cand.leftPly, base: p.base, eco: p.eco });
            ui.namePrompt = null;
            ui.feedback = ui.feedback.replace(/<div class="olab-fb olab-fb--name" id="olab-name-prompt">[\s\S]*$/, '');
            if (entry) {
                saveStore(true);
                ui.feedback += '<div class="olab-fb olab-fb--ok"><span class="olab-pill olab-pill--excellent">Desada</span> «<b>' + esc(entry.name) + '</b>» ja és a <b>Les teves obertures</b>. Quan una línia hi passi, el tauler la reconeixerà, i la pots practicar quan vulguis.' +
                    '<div class="olab-fb-actions"><button type="button" class="btn btn-secondary olab-btn-sm" data-olab-practice="' + esc(entry.id) + '">Practica-la ara</button></div></div>';
            }
            render();
        }
        function declineName() {
            const p = ui.namePrompt;
            if (!p) return;
            side().declined.push(p.cand.leftKey);
            ui.namePrompt = null;
            saveStore(true);
            ui.feedback = ui.feedback.replace(/<div class="olab-fb olab-fb--name" id="olab-name-prompt">[\s\S]*$/, '');
            render();
        }
        function practice(id) {
            const o = side().named.find(x => x.id === id);
            if (!o) return;
            startLine({
                follow: { id: o.id, name: o.name, sans: o.sans.slice() },
                feedback: '<div class="olab-fb olab-fb--hint">Practiques «<b>' + esc(o.name) + '</b>»: el rival seguirà la teva línia i tu has de recordar les teves jugades.</div>'
            });
            const top = byId('opening-lab');
            if (top && top.scrollIntoView) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function undo() {
            if (!ui.game || !ui.sans.length) return;
            ui.token++;
            ui.pending = null; ui.expected = null; ui.hintSquares = null; ui.tapFrom = null;
            ui.forceDecideKey = null; ui.reviewNote = ''; ui.rivalNote = ''; ui.namePrompt = null;
            undoMove();
            while (ui.sans.length && ui.game.turn() !== ui.color) undoMove();
            ui.feedback = '';
            syncBoard(true);
            if (ui.game.turn() === ui.color) userTurn(); else rivalTurn();
        }

        function hint() {
            if (ui.phase !== 'user') return;
            const node = currentNode();
            if (node) {
                ui.visit.hinted = true;
                ui.hintLevel = Math.min(2, ui.hintLevel + 1);
                ui.hintSquares = ui.hintLevel === 1 ? [node.from] : [node.from, node.to];
                ui.feedback = '<div class="olab-fb olab-fb--hint">💡 ' + (ui.hintLevel === 1 ? 'Mou la peça marcada.' : 'La teva jugada: <b>' + esc(node.san) + '</b>. ' + esc(L.describeMove(node))) + '</div>';
                render();
                paintMarks();
                return;
            }
            renderDecisionHint();
        }

        // Pista d'una posició nova: cada obertura possible té un color, i les
        // jugades que hi porten es marquen al tauler amb aquell color (marc prim
        // a l'origen, marc gruixut i vel al destí).
        function renderDecisionHint() {
            const Chess = ChessCtor();
            const fen = ui.game.fen();
            const key = currentKey();
            const c = ctx();
            const st = L.annotateLine(Chess, ui.sans);
            const curName = L.lineName(c, ui.sans, st.keys).nameCa;
            const sch = L.computeScheme(side().nodes);
            const plan = L.planMoves(sch, st).slice(0, 3);
            const legalMove = san => { try { return new Chess(fen).move(san, { sloppy: true }); } catch (e) { return null; } };
            const book = L.bookMoves(c, ui.sans, key).filter(b => legalMove(b.san)).slice(0, 6);
            const mem = ui.evalMem.get(key);
            const sfLines = mem && mem.lines.length ? mem.lines.slice(0, 3).filter(l => mem.lines[0].cp - l.cp <= 90) : [];
            const label = san => {
                const sans2 = ui.sans.concat([san]);
                const nm = L.lineName(c, sans2, L.annotateLine(Chess, sans2).keys);
                if (!nm.inBook) return 'Fora de la teoria';
                let name = nm.nameCa;
                if (!name || name === curName) {
                    const v = L.dominantVariation(L.trieAt(c.trie, sans2));
                    if (v) name = L.translateOpeningName(v);
                }
                return name || curName || 'Teoria';
            };
            const opts = [];
            const addOpt = (san, tag) => {
                const m = legalMove(san);
                if (!m) return;
                let o = opts.find(x => x.san === m.san);
                if (!o) { o = { san: m.san, from: m.from, to: m.to, tags: [] }; opts.push(o); }
                if (tag && o.tags.indexOf(tag) < 0) o.tags.push(tag);
            };
            book.forEach(b => addOpt(b.san, 'teoria'));
            plan.forEach(p => addOpt(p.san, 'pla'));
            sfLines.forEach(l => addOpt(l.san, null));
            opts.forEach(o => {
                o.label = label(o.san);
                const sf = sfLines.find(l => l.san === o.san);
                if (sf) o.cp = sf.cp;
            });
            const groups = L.groupOptions(opts);
            const keep = ui.optionMarks && ui.optionMarks.key === key ? ui.optionMarks.focus : null;
            ui.optionMarks = { key, groups, focus: keep !== null && keep < groups.length ? keep : null };
            const focus = ui.optionMarks.focus;
            const moveHtml = o => '<span class="olab-opt-move"><b>' + esc(o.san) + '</b>' +
                ((o.tags.indexOf('pla') >= 0 || typeof o.cp === 'number')
                    ? '<small>' + [o.tags.indexOf('pla') >= 0 ? 'el teu pla' : '', typeof o.cp === 'number' ? L.formatCp(o.cp) : ''].filter(Boolean).map(esc).join(' · ') + '</small>' : '') + '</span>';
            const list = groups.map((g, i) => '<li class="olab-opt' + (focus !== null && focus !== i ? ' is-dim' : '') + (focus === i ? ' is-focus' : '') + '" data-olab-opt="' + i + '" role="button" tabindex="0" aria-pressed="' + (focus === i ? 'true' : 'false') + '">' +
                '<span class="olab-swatch" style="background:' + g.color + '" title="' + esc(g.colorName) + '" aria-hidden="true"></span>' +
                '<span class="olab-opt-body"><span class="olab-opt-name">' + esc(g.label) + ' <span class="olab-muted">(' + esc(g.colorName) + ')</span></span>' +
                '<span class="olab-opt-moves">' + g.moves.map(moveHtml).join('') + '</span></span></li>').join('');
            if (!sfLines.length) analysis(fen, 'decide').then(() => { if (ui.phase === 'user' && currentKey() === key && !currentNode() && ui.optionMarks && ui.optionMarks.key === key) renderDecisionHint(); });
            ui.feedback = '<div class="olab-fb olab-fb--hint"><div class="olab-hint-title">💡 Opcions per decidir</div>' +
                (groups.length
                    ? '<div class="olab-muted">Cada color és una obertura: al tauler, marc prim a la casella d’origen i marc gruixut a la de destí. Toca’n una per veure només aquella.</div><ul class="olab-opts-list">' + list + '</ul>'
                    : '<div class="olab-muted">Fora de llibre i sense jugades del teu pla: aquí decideixes tu.</div>') +
                (plan.length ? '' : '<div class="olab-muted">Encara no tens pla per a cap peça que es pugui moure aquí: la jugada que triïs el començarà.</div>') +
                (sfLines.length ? '' : '<div class="olab-muted">Stockfish 19 encara pensa…</div>') + '</div>';
            render();
            paintMarks();
        }

        // ---------------- accions dels botons ----------------
        function onAction(act) {
            if (act === 'new') { startLine(); return; }
            if (act === 'save-name') { saveName(); return; }
            if (act === 'decline-name') { declineName(); return; }
            if (act === 'swap' && ui.pending && ui.pending.swap && ui.phase === 'user') {
                const sw = ui.pending.swap;
                ui.forceDecideKey = currentKey();
                ui.pending = null;
                tryUserMove(sw.from, sw.to);
                return;
            }
            if (act === 'redo') {
                // Treu la darrera decisió (i la resposta del rival, si n'hi ha) i torna a decidir.
                if (!ui.sans.length) return;
                ui.token++;
                if (ui.game.turn() === ui.color) undoMove();
                if (!ui.sans.length) return;
                undoMove();
                delete side().nodes[currentKey()];
                saveStore(true);
                ui.feedback = '';
                syncBoard(true);
                userTurn();
                return;
            }
            const c = ui.pending && ui.pending.conflict;
            if (!c || ui.phase !== 'conflict') return;
            if (act === 'keep-plan') {
                undoMove();
                const g = new (ChessCtor())(c.fenBefore);
                const pmv = g.move(c.pm.san);
                if (!pmv) { ui.pending = null; commitDecision(Object.assign({}, c, { justified: true, justifyNote: 'El pla no era possible.' })); return; }
                const judged = L.judgeMove(c.ev.bestCp, c.pmCp);
                applyMove(pmv);
                syncBoard(true);
                const lineBefore = L.annotateLine(ChessCtor(), c.sansBefore);
                const info = L.candidateInfo(lineBefore, pmv);
                ui.pending = null;
                commitDecision({ mv: pmv, info, ev: Object.assign({}, c.ev, { playedCp: c.pmCp }), judged: judged.ok ? judged : Object.assign({}, judged, { ok: true }), inBook: false, keyBefore: c.keyBefore, sansBefore: c.sansBefore, justified: false, check: { kind: 'plan' } });
            } else if (act === 'change-plan') {
                ui.pending = null;
                commitDecision(Object.assign({}, c, { planChange: true }));
            }
        }

        function reviewIssue(key) {
            const node = side().nodes[key];
            if (!node) return;
            startLine({ line: node.line });
            ui.forceDecideKey = key;
            const rep = L.repertoireReport(side());
            const issue = rep.issues.find(i => i.key === key);
            ui.reviewNote = 'Revisant: abans hi jugaves <b>' + esc(node.san) + '</b>' + (issue && issue.expected ? ' (el pla diu <b>' + esc(issue.expected) + '</b>)' : '') + '. Decideix de nou.';
            ui.feedback = '';
            userTurn();
            const top = byId('opening-lab');
            if (top && top.scrollIntoView) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // ---------------- pintat ----------------
        function render() {
            if (!byId('opening-lab') || !ui.game) return;
            renderTop();
            renderName();
            renderMoves();
            renderGuide();
            renderStats();
            renderNamed();
            renderTree();
            renderControls();
        }
        function renderTop() {
            document.querySelectorAll('[data-olab-color]').forEach(b => {
                const on = b.getAttribute('data-olab-color') === ui.color;
                b.classList.toggle('is-on', on);
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            const sel = byId('olab-depth');
            if (sel && String(sel.value) !== String(ui.depth)) sel.value = String(ui.depth);
            const nameInput = byId('olab-rep-name');
            if (nameInput && document.activeElement !== nameInput) nameInput.value = side().name || '';
            const title = byId('olab-title');
            if (title) title.textContent = side().name || (ui.color === 'w' ? 'La teva obertura amb blanques' : 'La teva defensa amb negres');
        }
        function renderName() {
            const el = byId('olab-name');
            if (!el) return;
            const keys = L.annotateLine(ChessCtor(), ui.sans).keys;
            const nm = L.lineName(ctx(), ui.sans, keys);
            const mine = L.namedOpeningFor(side().named, keys);
            let text = nm.nameCa || (ui.sans.length ? 'Obertura sense nom' : 'Posició inicial');
            let chip;
            let html;
            if (mine) {
                // La línia passa per una obertura teva: el nom és el teu.
                text = mine.name;
                chip = '<span class="olab-chip olab-chip--mine">La teva obertura</span>';
                html = '<span class="olab-name-text">' + esc(text) + (mine.base ? '<span class="olab-name-base">a partir de ' + esc(mine.base) + '</span>' : '') + '</span>' + chip;
            } else {
                if (!ui.sans.length) chip = '<span class="olab-chip">Comença</span>';
                else if (nm.inBook) chip = '<span class="olab-chip olab-chip--book">Teoria</span>';
                else chip = '<span class="olab-chip olab-chip--own">Línia pròpia des de la jugada ' + moveNo(nm.leftAt || ui.sans.length) + '</span>';
                html = (nm.eco ? '<span class="olab-eco">' + esc(nm.eco) + '</span>' : '') + '<span class="olab-name-text">' + esc(text) + '</span>' + chip;
            }
            if (el.innerHTML !== html) {
                el.innerHTML = html;
                if (text !== ui.lastName) {
                    el.classList.remove('olab-name--flash');
                    void el.offsetWidth;
                    el.classList.add('olab-name--flash');
                    ui.lastName = text;
                }
            }
        }
        function renderMoves() {
            const el = byId('olab-moves');
            if (!el) return;
            if (!ui.sans.length) { el.innerHTML = '<span class="olab-muted">Les jugades de la línia sortiran aquí.</span>'; return; }
            let html = '';
            ui.sans.forEach((san, i) => {
                if (i % 2 === 0) html += '<span class="olab-mvno">' + (i / 2 + 1) + '.</span>';
                const mark = ui.marks[i] || 'rival';
                html += '<span class="olab-mv olab-mv--' + mark + '">' + esc(san) + '</span>';
            });
            el.innerHTML = html;
            el.scrollLeft = el.scrollWidth;
        }
        function renderGuide() {
            const fb = byId('olab-feedback');
            const guide = byId('olab-guide');
            if (fb) fb.innerHTML = ui.feedback || '';
            if (!guide) return;
            let html = '';
            if (ui.rivalNote && (ui.phase === 'user' || ui.phase === 'judging')) html += '<div class="olab-rival">' + ui.rivalNote + '</div>';
            if (ui.reviewNote) html += '<div class="olab-review">' + ui.reviewNote + '</div>';
            if (ui.phase === 'user') {
                const node = currentNode();
                if (node) {
                    html += '<div class="olab-now olab-now--recall"><b>Recorda la teva jugada.</b> Aquesta posició ja és al teu repertori' + (node.seen ? ' (encerts en repassos: ' + (node.ok || 0) + '/' + node.seen + ')' : '') + '.</div>';
                } else {
                    const st = L.annotateLine(ChessCtor(), ui.sans);
                    const plan = L.planMoves(L.computeScheme(side().nodes), st).slice(0, 2);
                    html += '<div class="olab-now olab-now--decide"><b>Posició nova: decideix.</b> Tria la teva jugada; Stockfish 19 la validarà i quedarà al teu repertori.' +
                        (plan.length ? ' <span class="olab-plan-tip">El teu pla aquí: <b>' + plan.map(p => esc(p.san)).join('</b> o <b>') + '</b>.</span>' : '') + '</div>';
                }
            } else if (ui.phase === 'rival') {
                html += '<div class="olab-now olab-muted"><span class="olab-spinner" aria-hidden="true"></span> El rival tria una resposta de la teoria…</div>';
            } else if (ui.phase === 'conflict') {
                html += '<div class="olab-now">Tria: mantenir el pla o canviar-lo.</div>';
            }
            const pct = Math.min(100, Math.round(userPlies() / ui.depth * 100));
            const bar = byId('olab-progress-bar');
            if (bar) bar.style.width = pct + '%';
            const prog = byId('olab-progress-text');
            if (prog) prog.textContent = userPlies() + '/' + ui.depth + ' jugades teves';
            guide.innerHTML = html;
        }
        function renderStats() {
            const el = byId('olab-stats');
            if (!el) return;
            const rep = L.repertoireReport(side());
            const cohClass = rep.total === 0 ? '' : rep.coherencePct === 100 ? ' olab-stat--ok' : ' olab-stat--warn';
            el.innerHTML =
                '<div class="olab-stat' + cohClass + '"><span class="olab-stat-v">' + (rep.total ? rep.coherencePct + '%' : '—') + '</span><span class="olab-stat-l">Coherència</span></div>' +
                '<div class="olab-stat"><span class="olab-stat-v">' + rep.total + '</span><span class="olab-stat-l">Posicions</span></div>' +
                '<div class="olab-stat"><span class="olab-stat-v">' + (rep.total ? rep.masteryPct + '%' : '—') + '</span><span class="olab-stat-l">Dominades</span></div>' +
                '<div class="olab-stat"><span class="olab-stat-v">' + rep.due + '</span><span class="olab-stat-l">Per repassar</span></div>';
            const planEl = byId('olab-plan');
            if (planEl) {
                const list = L.schemeList(rep.scheme);
                planEl.innerHTML = list.length
                    ? '<span class="olab-plan-label">El teu pla:</span>' + list.map(p => '<span class="olab-plan-chip' + (p.count < p.total ? ' olab-plan-chip--mixed' : '') + '" title="' + p.count + ' de ' + p.total + ' línies">' + esc(p.label) + (p.total > 1 ? '<small>×' + p.count + '</small>' : '') + '</span>').join('')
                    : '<span class="olab-muted">El teu pla apareixerà aquí a mesura que decideixis on va cada peça.</span>';
            }
            const issuesEl = byId('olab-issues');
            if (issuesEl) {
                if (!rep.issues.length) { issuesEl.innerHTML = ''; issuesEl.hidden = true; }
                else {
                    issuesEl.hidden = false;
                    const txt = i => {
                        const n = i.node;
                        const lbl = moveLabel((n.line || []).length + 1, n.san);
                        if (i.kind === 'conflict') return lbl + ' trenca el pla (' + i.expected + ')';
                        if (i.kind === 'repeat') return lbl + ': torna a moure una peça sense motiu clar';
                        if (i.kind === 'queen-early') return lbl + ': dama massa aviat';
                        if (i.kind === 'unverified') return lbl + ': pendent de validar amb Stockfish 19';
                        return lbl;
                    };
                    issuesEl.innerHTML = '<div class="olab-issues-title">Per arribar al 100%:</div>' + rep.issues.slice(0, 6).map(i =>
                        '<div class="olab-issue"><span>' + esc(txt(i)) + '</span><button type="button" class="btn btn-secondary olab-btn-sm" data-olab-review="' + esc(i.key) + '">Revisa</button></div>').join('') +
                        (rep.issues.length > 6 ? '<div class="olab-muted">…i ' + (rep.issues.length - 6) + ' més.</div>' : '');
                }
            }
        }
        function renderNamed() {
            const el = byId('olab-named');
            if (!el) return;
            const list = side().named || [];
            if (!list.length) { el.hidden = true; el.innerHTML = ''; return; }
            el.hidden = false;
            const current = ui.follow ? ui.follow.id : null;
            el.innerHTML = '<div class="olab-named-title">Les teves obertures</div>' + list.map(o => {
                const meta = 'des de ' + moveLabel(o.leftPly, o.sans[o.leftPly - 1] || '') + (o.practiced ? ' · practicada ' + o.practiced + (o.practiced === 1 ? ' cop' : ' cops') : ' · encara sense practicar');
                return '<div class="olab-named-row' + (o.id === current ? ' is-current' : '') + '">' +
                    '<div class="olab-named-info"><b>' + esc(o.name) + '</b><span class="olab-muted">' + esc(meta) + '</span></div>' +
                    '<div class="olab-named-btns"><button type="button" class="btn btn-primary olab-btn-sm" data-olab-practice="' + esc(o.id) + '">Practica</button>' +
                    '<button type="button" class="btn btn-secondary olab-btn-sm" data-olab-rename="' + esc(o.id) + '" aria-label="Canvia el nom de ' + esc(o.name) + '" title="Canvia el nom"><svg class="btn-ic" aria-hidden="true"><use href="#ic-pencil"/></svg></button>' +
                    '<button type="button" class="btn btn-secondary olab-btn-sm" data-olab-delete="' + esc(o.id) + '" aria-label="Esborra ' + esc(o.name) + '" title="Esborra-la"><svg class="btn-ic" aria-hidden="true"><use href="#ic-trash"/></svg></button></div></div>';
            }).join('');
        }
        // L'arbre genealògic: es construeix només amb el plegable obert i quan
        // el repertori (o el color) ha canviat.
        function treeNameOf(path) {
            const Chess = ChessCtor();
            const keys = L.annotateLine(Chess, path).keys;
            const mine = L.namedOpeningFor(side().named, keys);
            if (mine) return { label: mine.name, mine: true };
            const nm = L.lineName(ctx(), path, keys);
            return { label: nm.nameCa || 'Línia pròpia', own: !nm.inBook };
        }
        function renderTree() {
            const wrap = byId('olab-tree-wrap');
            const box = byId('olab-tree');
            const count = byId('olab-tree-count');
            const total = Object.keys(side().nodes).length;
            if (count) count.textContent = total ? '· ' + total + (total === 1 ? ' posició' : ' posicions') : '';
            if (!wrap || !box || !wrap.open) return;
            const key = ui.color + '|' + ui.storeVersion + '|' + side().named.length;
            if (key === ui.treeKey) return;
            ui.treeKey = key;
            const tree = L.familyTree(side(), ui.color, treeNameOf);
            ui.treePaths = [];
            if (!tree.families.length) {
                box.innerHTML = '<div class="olab-muted">Encara no hi ha res: cada jugada que decideixis farà créixer l’arbre.</div>';
                return;
            }
            const kindOf = depth => ui.color === 'w'
                ? (depth === 0 ? 'Tronc' : depth === 1 ? 'Família' : 'Variant')
                : (depth === 0 ? 'Família' : 'Variant');
            const movesHtml = moves => {
                const txt = L.formatMoves(moves).split(' ');
                // Les jugades teves en negreta, les del rival normals.
                let mi = 0;
                return txt.map(tok => {
                    const isNum = /^\d+\.+$/.test(tok);
                    const m = moves[mi];
                    const numMatch = tok.match(/^(\d+\.+)(.*)$/);
                    const san = numMatch ? numMatch[2] : tok;
                    const num = numMatch ? numMatch[1] : '';
                    if (isNum) return esc(tok);
                    mi++;
                    return esc(num) + (m && m.user ? '<b class="olab-tn-mine">' + esc(san) + '</b>' : esc(san));
                }).join(' ');
            };
            const meta = b => {
                const bits = [b.lines + (b.lines === 1 ? ' línia' : ' línies'), b.positions + (b.positions === 1 ? ' posició teva' : ' posicions teves')];
                if (b.positions) bits.push(b.mastered + (b.mastered === 1 ? ' dominada' : ' dominades'));
                return esc(bits.join(' · ')) + (b.issues ? ' · <span class="olab-warn">⚠ ' + b.issues + ' trenca' + (b.issues === 1 ? '' : 'n') + ' el pla</span>' : '');
            };
            const node = (b, depth, parentLabel) => {
                const idx = ui.treePaths.push({ path: b.path, label: b.label }) - 1;
                const same = parentLabel && b.label === parentLabel;
                // Una variant hereta el nom de la família: només se n'ensenya la part pròpia.
                const fam = String(parentLabel || '').split(':')[0];
                const shown = !b.mine && fam && b.label.indexOf(fam + ': ') === 0 ? b.label.slice(fam.length + 2) : b.label;
                const name = same ? '<span class="olab-muted">mateixa obertura</span>'
                    : (b.mine ? '✨ ' : '') + esc(shown) + (b.own && !b.mine ? ' <span class="olab-chip olab-chip--own">pròpia</span>' : '');
                return '<li class="olab-tn olab-tn--d' + Math.min(depth, 3) + '"><div class="olab-tn-row">' +
                    '<div class="olab-tn-head"><span class="olab-tn-kind">' + kindOf(depth) + '</span><span class="olab-tn-name">' + name + '</span></div>' +
                    '<div class="olab-tn-moves">' + movesHtml(b.moves) + '</div>' +
                    '<div class="olab-tn-foot"><span class="olab-tn-meta">' + meta(b) + '</span>' +
                    '<button type="button" class="btn btn-secondary olab-btn-sm" data-olab-tree-play="' + idx + '">Juga-la</button></div></div>' +
                    (b.children.length ? '<ul>' + b.children.map(ch => node(ch, depth + 1, b.label)).join('') + '</ul>' : '') + '</li>';
            };
            box.innerHTML = '<div class="olab-tree-sum">' + tree.lines + (tree.lines === 1 ? ' línia' : ' línies') + ' · ' + tree.positions + ' posicions teves' +
                (tree.issues ? ' · <span class="olab-warn">⚠ ' + tree.issues + '</span>' : '') + '</div>' +
                '<ul class="olab-tree-root">' + tree.families.map(f => node(f, 0, '')).join('') + '</ul>';
        }
        function playTreeBranch(i) {
            const b = ui.treePaths[i];
            if (!b) return;
            startLine({
                follow: { id: null, name: b.label || 'aquesta variant', sans: b.path.slice() },
                feedback: '<div class="olab-fb olab-fb--hint">Jugues la branca «<b>' + esc(b.label || L.formatMoves([])) + '</b>» de l’arbre: el rival la segueix fins al final i després tria com sempre.</div>'
            });
            const top = byId('opening-lab');
            if (top && top.scrollIntoView) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        function renderControls() {
            const undoBtn = byId('olab-undo');
            if (undoBtn) undoBtn.disabled = !ui.sans.length || (ui.sans.length === 1 && ui.color === 'b');
            const hintBtn = byId('olab-hint');
            if (hintBtn) hintBtn.disabled = ui.phase !== 'user';
            const forget = byId('olab-forget');
            if (forget) forget.hidden = !(ui.phase === 'user' && side().nodes[currentKey()]);
        }

        // ---------------- obertura de la secció ----------------
        function wire() {
            if (ui.wired) return;
            const jq = $();
            if (!jq) return;
            ui.wired = true;
            jq(document).on('click', '[data-olab-color]', function () {
                const c = this.getAttribute('data-olab-color') === 'b' ? 'b' : 'w';
                if (c === ui.color) return;
                ui.color = c;
                ui.store.prefs.color = c;
                saveStore(true);
                startLine();
            });
            jq(document).on('click', '#opening-lab [data-olab-act]', function () { onAction(this.getAttribute('data-olab-act')); });
            jq(document).on('click', '#opening-lab [data-olab-review]', function () { reviewIssue(this.getAttribute('data-olab-review')); });
            const focusOption = el => {
                if (!ui.optionMarks || ui.phase !== 'user') return;
                const i = Number(el.getAttribute('data-olab-opt'));
                ui.optionMarks.focus = ui.optionMarks.focus === i ? null : i;
                renderDecisionHint();
            };
            jq(document).on('click', '#opening-lab [data-olab-opt]', function () { focusOption(this); });
            jq(document).on('keydown', '#opening-lab [data-olab-opt]', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusOption(this); } });
            jq(document).on('click', '#opening-lab [data-olab-tree-play]', function () { playTreeBranch(Number(this.getAttribute('data-olab-tree-play'))); });
            jq('#olab-tree-wrap').on('toggle', () => renderTree());
            jq(document).on('click', '#opening-lab [data-olab-practice]', function () { practice(this.getAttribute('data-olab-practice')); });
            jq(document).on('click', '#opening-lab [data-olab-rename]', function () {
                const o = side().named.find(x => x.id === this.getAttribute('data-olab-rename'));
                if (!o) return;
                const name = root.prompt('Nou nom per a la teva obertura', o.name);
                if (name == null) return;
                const clean = String(name).replace(/\s+/g, ' ').trim().slice(0, 60);
                if (!clean) return;
                o.name = clean;
                if (ui.follow && ui.follow.id === o.id) ui.follow.name = clean;
                saveStore(true);
                render();
            });
            jq(document).on('click', '#opening-lab [data-olab-delete]', function () {
                const id = this.getAttribute('data-olab-delete');
                const o = side().named.find(x => x.id === id);
                if (!o || !root.confirm('Segur que vols esborrar «' + o.name + '» de les teves obertures? Les jugades es queden al repertori.')) return;
                side().named = side().named.filter(x => x.id !== id);
                if (ui.follow && ui.follow.id === id) ui.follow = null;
                saveStore(true);
                render();
            });
            jq(document).on('keydown', '#olab-newname', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveName(); } });
            jq('#olab-undo').on('click', () => undo());
            jq('#olab-hint').on('click', () => hint());
            jq('#olab-new').on('click', () => startLine());
            jq('#olab-depth').on('change', function () {
                const d = Number(this.value);
                if (L.DEPTH_OPTIONS.indexOf(d) < 0) return;
                ui.depth = d;
                ui.store.prefs.depth = d;
                saveStore(true);
                render();
            });
            jq('#olab-rep-name').on('input', function () {
                side().name = String(this.value || '').slice(0, 60);
                saveStore();
                renderTop();
            });
            jq('#olab-forget').on('click', () => {
                const key = currentKey();
                if (!side().nodes[key]) return;
                delete side().nodes[key];
                saveStore(true);
                ui.feedback = '<div class="olab-fb olab-fb--hint">Jugada oblidada: torna a decidir aquesta posició.</div>';
                userTurn();
            });
            jq('#olab-reset').on('click', () => {
                const label = ui.color === 'w' ? 'amb blanques' : 'amb negres';
                if (!root.confirm('Segur que vols esborrar tot el teu repertori ' + label + ', també les obertures amb nom? No es pot desfer.')) return;
                side().nodes = {};
                side().named = [];
                side().declined = [];
                saveStore(true);
                startLine({ feedback: '<div class="olab-fb olab-fb--hint">Repertori ' + label + ' esborrat (jugades i obertures amb nom). Comença de nou.</div>' });
            });
            jq('#olab-hiero').on('click', () => { if (typeof cfg.onHiero === 'function') cfg.onHiero(); });
            root.addEventListener('resize', () => resize());
            root.addEventListener('pagehide', () => { if (ui.engine) ui.engine.dispose(); });
            // Allibera el motor quan la secció fa estona que no es veu.
            setInterval(() => {
                const screen = byId('opening-screen');
                const lab = byId('opening-lab');
                const visible = screen && screen.style.display !== 'none' && lab && !lab.hidden;
                if (!visible && ui.engine) { ui.token++; ui.engine.dispose(); ui.engine = null; ui.evalMem.clear(); ui.inflight.clear(); }
            }, 60000);
        }

        function configure(options) { Object.assign(cfg, options || {}); }

        function open() {
            if (!byId('opening-lab') || !ChessCtor()) return;
            if (!ui.store) loadStore();
            ctx();
            wire();
            if (ui.engine && ui.engine.isDead()) ui.engine.revive();
            // En tornar a la secció es reprèn la línia que hi havia, si en queda.
            if (!ui.game || ui.phase === 'idle') startLine();
            else {
                buildBoard();
                // Una anàlisi que es va quedar a mitges en sortir es reprèn de zero.
                if (ui.phase === 'rival') { ui.token++; rivalTurn(); }
                else if (ui.phase === 'judging' || ui.phase === 'conflict') { ui.token++; undoMove(); ui.pending = null; ui.feedback = ''; syncBoard(false); userTurn(); }
                else render();
            }
            setTimeout(resize, 60);
        }

        function refresh() {
            if (!ui.game) { open(); return; }
            setTimeout(resize, 30);
            render();
        }

        return {
            configure, open, refresh,
            _state: () => ui,
            _startLine: startLine
        };
    }
});
