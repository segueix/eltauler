// ============================================================================
// expressivitat.js — català escaquístic expressiu, local i verificable
// Fase 1: lèxic, concordança i variació estructural (sense IA ni servidor).
// Fonts de referència terminològica: TERMCAT, Terminologia dels escacs
// https://www.termcat.cat/ca/diccionaris-en-linia/16
// Les frases són originals. No s'importen ni es copien definicions.
// ============================================================================
// Un candidat només s'amplia si el detector d'escacs ja n'ha certificat el
// motiu. Mai no inferim valoracions, plans, sacrificis o avantatges a partir
// de les paraules. La fase 2 incorporarà memòria narrativa entre jugades.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerExpressivitat = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = '1.0.0';
    const REGISTRES = Object.freeze(['natural', 'didactic', 'analitic']);
    const PECES = Object.freeze({
        p: { nom: 'peó', article: 'el ', genere: 'm' },
        n: { nom: 'cavall', article: 'el ', genere: 'm' },
        b: { nom: 'alfil', article: "l'", genere: 'm' },
        r: { nom: 'torre', article: 'la ', genere: 'f' },
        q: { nom: 'dama', article: 'la ', genere: 'f' },
        k: { nom: 'rei', article: 'el ', genere: 'm' }
    });
    const COLORS = Object.freeze({
        w: { grup: 'les blanques', inicial: 'Les blanques', adjectiuM: 'blanc', adjectiuF: 'blanca' },
        b: { grup: 'les negres', inicial: 'Les negres', adjectiuM: 'negre', adjectiuF: 'negra' }
    });

    // Banc de vocabulari per a futures explicacions i exercicis. Termes,
    // expressions i verbs són categories DIFERENTS; no són sinònims
    // intercanviables. Les etiquetes de matís ajuden a redactar sense calcs.
    const LEXIC = Object.freeze({
        peces: Object.freeze(['rei', 'dama', 'torre', 'alfil', 'cavall', 'peó', 'peça menor', 'peça major', 'casella', 'fila', 'columna', 'diagonal', 'flanc', 'escaquer']),
        tactica: Object.freeze(['escac', 'escac i mat', 'xarxa de mat', 'atac doble', 'forquilla', 'clavada', 'enfilada', 'atac a la descoberta', 'escac doble', 'escac a la descoberta', 'desviació', 'atracció', 'interferència', 'sobrecàrrega', 'jugada intermèdia', 'raig X', 'sacrifici', 'recaptura', 'contraatac', 'amenaça', 'eliminació del defensor', 'combinació', 'seqüència forçada', 'coronació']),
        estrategia: Object.freeze(['iniciativa', 'avantatge de desenvolupament', 'coordinació de peces', 'activitat', 'mobilitat', 'parella d’alfils', 'casella feble', 'casella forta', 'casella d’entrada', 'columna oberta', 'columna semioberta', 'diagonal oberta', 'majoria de peons', 'peó aïllat', 'peó doblat', 'peó passat', 'peó endarrerit', 'cadena de peons', 'bloqueig', 'simplificació', 'canvi de peces', 'estructura de peons', 'seguretat del rei', 'espai', 'pressió', 'tensió central', 'defensa', 'flanc de rei', 'flanc de dama', 'fianchetto']),
        finals: Object.freeze(['oposició', 'atzucac', 'triangulació', 'rei actiu', 'peó lliure', 'final de torres', 'final de peons', 'taules', 'ofegat', 'repetició de posició', 'material insuficient', 'peó de torre', 'casella de coronació', 'fortalesa']),
        accions: Object.freeze(['desenvolupar', 'activar', 'centralitzar', 'pressionar', 'defensar', 'protegir', 'neutralitzar', 'reforçar', 'restringir', 'bloquejar', 'obrir', 'tancar', 'intercanviar', 'capturar', 'recapturar', 'enrocar', 'coronar', 'desviar', 'interposar', 'retirar', 'sostenir', 'consolidar', 'coordinar', 'recuperar', 'preparar', 'disputar', 'aprofitar', 'proposar', 'amenaçar', 'simplificar']),
        connectors: Object.freeze(['d’aquesta manera', 'amb aquest moviment', 'en aquesta posició', 'en canvi', 'ara bé', 'mentrestant', 'per contra', 'al mateix temps', 'd’altra banda', 'tot seguit', 'a continuació', 'a partir d’ara', 'de moment', 'en aquest punt'])
    });

    const TERMES = Object.freeze({
        'escac i mat': { familia: 'tactica', basic: 'el rei no disposa de cap resposta legal a l’escac' },
        'atac doble': { familia: 'tactica', basic: 'dues peces rivals reben una amenaça simultània' },
        'forquilla': { familia: 'tactica', basic: 'una peça ataca simultàniament dos objectius' },
        'clavada': { familia: 'tactica', basic: 'el moviment d’una peça queda restringit per una peça al darrere' },
        'enfilada': { familia: 'tactica', basic: 'una peça atacada té una altra peça darrere a la mateixa línia' },
        'atac a la descoberta': { familia: 'tactica', basic: 'una peça es mou i deixa descoberta l’amenaça d’una altra' },
        'escac doble': { familia: 'tactica', basic: 'dues peces fan escac al mateix temps' },
        'peó passat': { familia: 'estrategia', basic: 'cap peó rival no pot barrar-li el pas a la mateixa columna ni a les veïnes' },
        'atzucac': { familia: 'finals', basic: 'qui té el torn empitjora la posició sigui quina sigui la seva jugada' },
        'xarxa de mat': { familia: 'tactica', basic: 'una combinació d’amenaces deixa el rei amb molt poques sortides' },
        'oposició': { familia: 'finals', basic: 'posició dels reis que pot determinar quin haurà de cedir terreny' },
        'columna oberta': { familia: 'estrategia', basic: 'una columna sense peons de cap dels dos bàndols' },
        'coronació': { familia: 'tactica', basic: 'un peó arriba a l’última fila i es transforma en una altra peça' }
    });

    const CAS = /^[a-h][1-8]$/;
    function casella(s) { return typeof s === 'string' && CAS.test(s) ? s : null; }
    function perfil(tier, requested) {
        if (REGISTRES.indexOf(requested) >= 0) return requested;
        if (tier === 'basic') return 'didactic';
        if (tier === 'advanced') return 'analitic';
        return 'natural';
    }
    function colorName(color, capital) {
        const c = COLORS[color];
        return c ? (capital ? c.inicial : c.grup) : null;
    }
    function nomPeca(type, color, capital, ambColor) {
        const p = PECES[type], c = COLORS[color];
        if (!p || !c) return null;
        const adj = ambColor ? ' ' + (p.genere === 'f' ? c.adjectiuF : c.adjectiuM) : '';
        const text = p.article + p.nom + adj;
        return capital ? text.charAt(0).toUpperCase() + text.slice(1) : text;
    }
    function glossari(terme) {
        const record = Object.prototype.hasOwnProperty.call(TERMES, terme) ? TERMES[terme] : null;
        return record ? { terme: terme, familia: record.familia, explicacio: record.basic } : null;
    }
    function termesDe(familia) {
        return Object.prototype.hasOwnProperty.call(LEXIC, familia) ? LEXIC[familia].slice() : [];
    }
    function sentence(s) {
        const t = String(s || '').trim().replace(/\s+/g, ' ');
        if (!t || t.length > 210 || !/[.!?]$/.test(t)) return null;
        return t;
    }

    // Matriu de realitzacions construïdes exclusivament amb:
    //  - dades de la jugada legal (move),
    //  - el tipus del candidat ja comprovat per tvCommentCandidates().
    // No es fa inferència tàctica ni s'inventa una valoració.
    function alternatives(cand, ctx) {
        const c = ctx || {}, m = c.move || {};
        const to = casella(m.to), from = casella(m.from), side = colorName(m.color, false);
        const Side = colorName(m.color, true);
        const piece = nomPeca(m.piece, m.color, false, false);
        const Piece = nomPeca(m.piece, m.color, true, true);
        const registre = perfil(c.tier, c.registre);
        if (!cand || !Array.isArray(cand.variants) || !side || !piece || !to || !from) return [];
        const kind = cand.kind;
        let base = [], didactic = [], analitic = [];
        if (kind === 'describe') {
            if (m.captured || m.promotion || /[+#]/.test(m.san || '')) return [];
            base = [
                Side + ' situen ' + piece + ' a ' + to + '.',
                Piece + ' deixa ' + from + ' i arriba a ' + to + '.',
                'Ara ' + piece + ' ocupa la casella ' + to + '.'
            ];
            didactic = [Side + ' mouen ' + piece + ' de ' + from + ' a ' + to + '.'];
            analitic = ['Moviment de ' + (PECES[m.piece] && PECES[m.piece].nom) + ': de ' + from + ' a ' + to + '.'];
        } else if (kind === 'capture' && m.captured) {
            base = [
                Side + ' capturen una peça rival a ' + to + '.',
                Piece + ' fa una captura a ' + to + '.'
            ];
            didactic = [Side + ' retiren una peça del rival amb la captura a ' + to + '.'];
            analitic = ['Captura de ' + piece + ' a ' + to + '.'];
        } else if (kind === 'development' && (m.piece === 'n' || m.piece === 'b')) {
            base = [
                Side + ' incorporen ' + piece + ' al joc.',
                Piece + ' abandona la casella inicial i entra en acció.'
            ];
            didactic = ['Amb ' + piece + ' a ' + to + ', ' + side + ' desenvolupen una peça més.'];
            analitic = ['Desenvolupament: ' + piece + ' cap a ' + to + '.'];
        } else if (kind === 'activation') {
            base = [Piece + ' entra ara en joc.', 'Moviment d’activació: ' + piece + ' a ' + to + '.'];
        } else if (kind === 'center') {
            base = ['El centre és protagonista amb ' + piece + ' a ' + to + '.'];
            didactic = ['Aquest moviment de ' + piece + ' està relacionat amb la lluita pel centre.'];
            analitic = ['La disputa central continua després de ' + piece + ' a ' + to + '.'];
        } else if (kind === 'check' && /[+#]/.test(m.san || '')) {
            base = [
                Piece + ' dona escac des de ' + to + '.',
                Side + ' fan escac amb ' + piece + '.'
            ];
            didactic = ['Hi ha escac: el rei rival ha de respondre a aquesta amenaça.'];
            analitic = ['Escac de ' + piece + ' a ' + to + '.'];
        } else if (kind === 'double-check' && /[+#]/.test(m.san || '')) {
            base = ['Escac doble: dues peces amenacen el rei rival al mateix temps.',
                'El rei rival rep dos escacs simultanis.'];
        } else if (kind === 'fork-check' && /[+#]/.test(m.san || '')) {
            base = ['Escac i atac doble en una sola jugada: ' + piece + ' a ' + to + '.',
                'Forquilla amb escac: el rei rival és un dels objectius.'];
        } else if (kind === 'fork') {
            base = ['Una forquilla obliga a vigilar dos objectius alhora.',
                'Atac doble de ' + piece + ' des de ' + to + '.'];
            didactic = ['La jugada crea una forquilla: una mateixa peça amenaça dos objectius.'];
        } else if (kind === 'pin') {
            base = ['La clavada condiciona els moviments d’una peça rival.',
                'Una nova clavada restringeix les opcions de defensa.'];
            didactic = ['La jugada provoca una clavada: darrere de la peça atacada hi ha un altre objectiu.'];
        } else if (kind === 'skewer') {
            base = ['L’enfilada situa dues peces rivals sota la pressió d’una mateixa línia.',
                'Una enfilada posa dues peces rivals en una línia d’atac.'];
        } else if (kind === 'discovered-attack') {
            base = ['Atac a la descoberta: la jugada deixa oberta una altra amenaça.',
                'En moure una peça, una altra passa a atacar.'];
            didactic = ['Això és un atac a la descoberta: la peça que es mou destapa l’acció d’una altra.'];
        } else if (kind === 'remove-defender') {
            base = ['Ha desaparegut un defensor important en aquesta posició.',
                'La captura deixa una altra peça rival amb menys protecció.'];
        } else if (kind === 'recapture' && m.captured) {
            base = [Side + ' responen a la captura amb una recaptura a ' + to + '.',
                'Recaptura immediata de ' + piece + ' a ' + to + '.'];
        } else if (kind === 'promotion' && m.promotion) {
            const promoted = PECES[m.promotion];
            if (!promoted) return [];
            base = ['Coronació a ' + to + ': el peó es transforma en ' + (promoted.genere === 'f' ? 'una ' : 'un ') + promoted.nom + '.'];
            didactic = ['El peó arriba a l’última fila i corona a ' + to + '.'];
        } else if (kind === 'castle' && (m.flags || '').match(/[kq]/)) {
            base = [Side + ' enroquen i desplacen el rei cap a un dels flancs.',
                'Enroc de ' + side + ': el rei i una torre canvien de posició.'];
        } else if (kind === 'mate' && /#$/.test(m.san || '')) {
            base = ['Escac i mat! El rei rival no té cap resposta legal.',
                'La partida acaba amb escac i mat.'];
        } else if (kind === 'passed-new') {
            base = ['Apareix un nou peó passat en aquesta posició.',
                'Un peó passat entra en els plans de la partida.'];
        } else if (kind === 'seventh') {
            base = ['Una torre s’ha instal·lat a la setena fila.',
                'La setena fila queda ocupada per una torre atacant.'];
        } else if (kind === 'king-activity' && m.piece === 'k') {
            base = ['El rei ' + (m.color === 'w' ? 'blanc' : 'negre') + ' guanya activitat amb aquest moviment.',
                'Al final, ' + piece + ' també participa en el joc.'];
        } else if (kind === 'diagonal') {
            base = ['Aquest moviment modifica l’activitat d’un alfil sobre la diagonal.'];
        } else if (kind === 'open-file') {
            base = ['Una columna oberta pren protagonisme en la posició.'];
        }
        // L'estil és una preferència de redacció, no una font de fets nous.
        // La frase original continua sent l'opció de reserva.
        const extras = registre === 'didactic' ? didactic.concat(base, analitic)
            : registre === 'analitic' ? analitic.concat(base, didactic)
                : base.concat(didactic, analitic);
        return extras.map(sentence).filter(Boolean).filter((t, i, arr) => arr.indexOf(t) === i);
    }

    function expandCandidates(candidates, ctx) {
        if (!Array.isArray(candidates)) return [];
        return candidates.map(cand => {
            if (!cand || !Array.isArray(cand.variants)) return cand;
            const original = cand.variants.filter(v => typeof v === 'string' && v.trim());
            const generated = alternatives(cand, ctx);
            const seen = new Set(original.map(t => t.trim()));
            const unique = [];
            for (const t of generated) {
                if (seen.has(t)) continue;
                seen.add(t);
                unique.push(t);
                if (unique.length >= 4) break;
            }
            return unique.length ? Object.assign({}, cand, { variants: original.concat(unique) }) : cand;
        });
    }

    return { VERSION, REGISTRES, LEXIC, TERMES, perfil, colorName, nomPeca,
        termesDe, glossari, alternatives, expandCandidates };
});
