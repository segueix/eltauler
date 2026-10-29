// jeropedagogia.js — explicació comprovable dels jeroglífics de tres jugades.
// No infereix intencions ni inventa tàctiques. Tot prové d'una línia legal i
// d'un certificat ElTaulerHieroClosure validat per Stockfish.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerJeroPedagogia = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const PIECES = { p: 'un peó', n: 'un cavall', b: 'un alfil', r: 'una torre', q: 'una dama', k: 'el rei' };
    const PHASES = ['Primer moviment', 'Segon moviment', 'Tercer moviment'];
    const ARTICLES = { p: 'El peó', n: 'El cavall', b: "L'alfil", r: 'La torre', q: 'La dama', k: 'El rei' };
    const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
    const SQUARE = /^[a-h][1-8]$/;
    const MOTIFS = {
        mate: 'La combinació culmina amb escac i mat.',
        fork: 'El desenllaç conté una forquilla verificada: una peça ataca dos objectius alhora.',
        pin: 'El desenllaç inclou una clavada verificada: una peça queda restringida per allò que té al darrere.',
        skewer: 'El desenllaç conté una enfilada verificada: dues peces comparteixen una línia d’atac.',
        promotion: 'La tercera jugada corona un peó.',
        material: 'La combinació es tanca amb un guany material comprovat.',
        discovery: 'El desenllaç inclou un atac a la descoberta: una peça destapa l’acció d’una altra.',
        major_win: 'La combinació culmina amb la captura verificada d’una peça major.',
        check: 'L’escac final forma part del desenllaç comprovat.'
    };
    function play(g, u) {
        if (typeof u !== 'string' || !UCI.test(u)) return null;
        return g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    }
    function isCertified(candidate, H) {
        return !!(candidate && H && typeof H.matches === 'function' && H.matches(candidate));
    }
    function summarizeMove(m, i, last) {
        const lines = [];
        if (m.captured) lines.push((ARTICLES[m.piece] || 'La peça') + ' captura ' + (PIECES[m.captured] || 'una peça') + ' a ' + m.to + '.');
        else if (m.promotion) lines.push('El peó arriba a ' + m.to + ' i corona.');
        else lines.push((ARTICLES[m.piece] || 'La peça') + ' es mou a ' + m.to + '.');
        // Una coronació amb captura és simultàniament captura i promoció.
        if (m.captured && m.promotion) lines.push('En arribar a l’última fila, el peó corona.');
        if (/#$/.test(m.san)) {
            lines.push('És escac i mat: el rei rival no té cap resposta legal.');
        } else if (/\+$/.test(m.san)) {
            lines.push('És escac: el rival ha de respondre a aquesta amenaça.');
        } else if (!last) {
            lines.push(i === 0 ? 'Ara cal observar la resposta del rival.' : 'Encara queda una resposta del rival abans de l’última jugada.');
        }
        return lines.join(' ');
    }
    function build(candidate, Chess, H) {
        if (!isCertified(candidate, H) || typeof Chess !== 'function') return null;
        const proof = candidate.conclusion;
        const line = H.lineOf(candidate);
        if (!Array.isArray(line) || line.length !== 5 || !line.every(u => UCI.test(u))) return null;
        try {
            const g = new Chess(candidate.fen);
            const steps = [];
            for (let i = 0; i < 3; i++) {
                const mv = play(g, line[i * 2]);
                if (!mv) return null;
                const reply = i < 2 ? play(g, line[i * 2 + 1]) : null;
                if (i < 2 && !reply) return null;
                steps.push({
                    number: i + 1,
                    title: PHASES[i],
                    san: mv.san,
                    text: summarizeMove(mv, i, i === 2),
                    replySan: reply ? reply.san : null,
                    reply: reply ? 'El rival respon amb ' + reply.san + '.' : null
                });
            }
            if (proof.finalFen !== g.fen()) return null;
            const isMate = g.in_checkmate();
            if (proof.kind === 'mate' && !isMate) return null;
            if (proof.kind === 'material' && (isMate || !Number.isFinite(proof.gain) || proof.gain < 3)) return null;
            if (proof.kind !== 'mate' && proof.kind !== 'material' && proof.kind !== 'promotion') return null;
            // El desenllaç de material ha de correspondre a una diferència
            // real de peces, mai a una etiqueta textual manipulada.
            if (proof.kind === 'material') {
                const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
                const side = candidate.fen.split(' ')[1];
                const balance = chess => chess.board().flat().reduce((sum, piece) =>
                    sum + (piece ? values[piece.type] * (piece.color === side ? 1 : -1) : 0), 0);
                const baseline = balance(new Chess(candidate.fen));
                const actualGain = balance(g) - baseline;
                if (actualGain < proof.gain) return null;
            }
            const outcome = proof.kind === 'mate'
                ? 'A la tercera jugada arriba l’escac i mat. No hi ha cap resposta legal.'
                : 'La tercera jugada culmina un guany de ' + proof.gain
                    + ' punts de material, conservat després de qualsevol resposta immediata legal.';
            const alternatives = Number.isInteger(proof.checkedAlternatives)
                ? 'S’han contrastat ' + proof.checkedAlternatives + ' alternatives legals a la jugada final.'
                : null;
            const fromMotif = typeof candidate.finalMotif === 'string'
                ? (MOTIFS[candidate.finalMotif] || null) : null;
            const learn = fromMotif || (proof.kind === 'mate'
                ? 'Comprova sempre quines caselles de sortida li queden al rei abans de calcular un mat.'
                : 'Comprova les recaptures i les defenses abans de donar per guanyada una peça.');
            return { version: 1, steps, outcome, alternatives, learn, verified: true,
                finalKind: proof.kind };
        } catch (err) { return null; }
    }
    function solvedStep(candidate, step, Chess, H) {
        if (!Number.isInteger(step) || step < 1 || step > 2) return null;
        const p = build(candidate, Chess, H);
        return p ? p.steps[step - 1].text : null;
    }
    return { VERSION: 1, build, solvedStep };
});
