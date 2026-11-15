// prosodia.js — preparació lingüística del text per a Matxa (català).
// Sense SSML: la demo de Matxa rep text pla. Aquesta capa és deterministicista,
// no modifica fets de la partida ni barreja les frases del locutor amb el DOM.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerProsodia = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const DIGITS = { 1: 'un', 2: 'dos', 3: 'tres', 4: 'quatre', 5: 'cinc',
        6: 'sis', 7: 'set', 8: 'vuit' };
    const LETTERS = { a: 'a', b: 'be', c: 'ce', d: 'de', e: 'e',
        f: 'efa', g: 'ge', h: 'hac' };
    // Matxa pronuncia més predictiblement els noms de les lletres i els
    // nombres escrits. Només transformem parelles casella (a-h + 1-8).
    function squares(text) {
        return String(text || '').replace(/\b([a-h])\s+([1-8])\b/g,
            (_, file, rank) => LETTERS[file] + ' ' + DIGITS[rank]);
    }
    function prepare(text) {
        if (typeof text !== 'string') return '';
        let t = text.trim();
        if (!t) return '';
        t = squares(t);
        // Evita una pausa artificial als dos punts i tres punts suspensius.
        // Per a la prosòdia real s'utilitzen puntuació i frases, no SSML.
        t = t.replace(/[—–]\s*/g, ', ')
            .replace(/\s*:\s*/g, ': ')
            .replace(/\.{3,}|…/g, '. ')
            .replace(/;\s*/g, '. ')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\s+([,.!?;:])/g, '$1')
            .replace(/([.!?])(?=[A-Za-zÀ-ÿ])/g, '$1 ');
        // "taules Taules" és un duplicat possible en textos de resultat.
        t = t.replace(/\b(taules)\s+taules\b/gi, (full, first) => first);
        // Després d'una pausa llarga, la frase ha de tornar a començar
        // amb majúscula: Matxa vocalitza més bé les frases separades.
        t = t.replace(/([.!?]\s+)([a-zà-ÿ])/g, (full, stop, next) => stop + next.toLocaleUpperCase('ca'));
        return t.trim();
    }

    // Director d'emissió: les categories provenen exclusivament de motius
    // prèviament validats pel narrador. MAI no afegeix fets ni canvia el text.
    // Matxa admet velocitat, però no SSML ni control fiable d'altura tonal.
    const STYLES = Object.freeze({
        calm:     Object.freeze({ rate: 1.03, pitch: 1.00, pauseMs: 850 }),
        teaching: Object.freeze({ rate: 0.96, pitch: 1.00, pauseMs: 1050 }),
        tense:    Object.freeze({ rate: 0.94, pitch: 1.05, pauseMs: 1150 }),
        surprise: Object.freeze({ rate: 0.97, pitch: 1.09, pauseMs: 1200 }),
        finale:   Object.freeze({ rate: 0.91, pitch: 1.07, pauseMs: 1350 })
    });
    function direction(comment) {
        const c = comment || {}, kind = String(c.kind || '');
        let mood = 'teaching';
        if (kind === 'mate' || kind === 'end' || kind === 'resign' ||
                kind === 'stalemate') mood = 'finale';
        else if (['missed', 'allows-mate', 'mate-threat', 'check',
                'king-pressure', 'pressure'].includes(kind)) mood = 'tense';
        else if (['fork', 'double-attack', 'doubleAttack', 'sacrifice',
                'capture-free', 'brilliant', 'blunder'].includes(kind)) mood = 'surprise';
        else if (['intro', 'describe', 'development', 'prepared',
                'opening', 'quiet'].includes(kind)) mood = 'calm';
        // Els resums i les explicacions detallades són més pausats.
        if (kind === 'summary' || c.extended && mood === 'calm') mood = 'teaching';
        return { mood, ...STYLES[mood] };
    }

    return { VERSION: 2, LETTERS, DIGITS, squares, prepare, direction };
});
