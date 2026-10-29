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
        t = t.replace(/\btaules\s+taules\b/gi, 'taules');
        return t.trim();
    }
    return { VERSION: 1, LETTERS, DIGITS, squares, prepare };
});
