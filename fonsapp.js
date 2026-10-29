// fonsapp.js — cinc fons foscos per a tota l'aplicació El Tauler.
// El color aleatori es tria UNA vegada per càrrega; la selecció manual persisteix.
// Els modes dia i ePaper conserven el seu tema, sense alterar taulers ni peces.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.ElTaulerFonsApp = api;
        api.start(root);
    }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    const VERSION = '1.0.0';
    // Clau local al dispositiu: no interferim amb la sincronització de partides.
    const MODE_KEY = 'chess_app_background_mode';
    const LAST_KEY = 'chess_app_background_last';
    const COLORS = Object.freeze([
        Object.freeze({ id: 'blau', name: 'Blau fort', hex: '#10337f' }),
        Object.freeze({ id: 'granat', name: 'Granat', hex: '#501b30' }),
        Object.freeze({ id: 'verd', name: 'Verd fosc', hex: '#123f30' }),
        Object.freeze({ id: 'lila', name: 'Lila', hex: '#493076' }),
        Object.freeze({ id: 'groc', name: 'Groc fosc', hex: '#574314' })
    ]);
    const IDS = COLORS.map(c => c.id);
    const LABELS = Object.freeze(Object.fromEntries(COLORS.map(c => [c.id, c.name])));
    const BY_ID = Object.freeze(Object.fromEntries(COLORS.map(c => [c.id, c])));

    function normalizeMode(value) {
        return value === 'aleatori' || IDS.includes(value) ? value : 'aleatori';
    }
    function pickRandom(previous, random) {
        const choices = IDS.filter(c => c !== previous);
        const pool = choices.length ? choices : IDS;
        const value = typeof random === 'function' ? random() : Math.random();
        const unit = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999999, value)) : 0;
        return pool[Math.floor(unit * pool.length)];
    }
    function safeGet(storage, key) {
        try { return storage && storage.getItem(key); }
        catch (err) { return null; }
    }
    function safeSet(storage, key, value) {
        try { if (storage) storage.setItem(key, value); }
        catch (err) { /* Mode local restringit: l'aplicació encara funciona. */ }
    }
    function resolve(mode, previous, random) {
        const selected = normalizeMode(mode);
        return selected === 'aleatori' ? pickRandom(previous, random) : selected;
    }
    function start(host) {
        const w = host || {};
        const doc = w.document;
        if (!doc || !doc.documentElement) return null;
        let storage;
        try { storage = w.localStorage; } catch (err) { storage = null; }
        let mode = normalizeMode(safeGet(storage, MODE_KEY));
        let current = resolve(mode, safeGet(storage, LAST_KEY), () =>
            (w.Math && typeof w.Math.random === 'function' ? w.Math.random() : Math.random()));
        const random = () => (w.Math && typeof w.Math.random === 'function' ? w.Math.random() : Math.random());

        function paint() {
            doc.documentElement.setAttribute('data-app-bg', current);
            const select = doc.getElementById('app-bg-select');
            if (select) select.value = mode;
            const preview = doc.getElementById('app-bg-preview');
            if (preview) {
                preview.style.backgroundColor = BY_ID[current].hex;
                preview.title = LABELS[current];
            }
            const status = doc.getElementById('app-bg-status');
            if (status) status.textContent = mode === 'aleatori'
                ? 'Actualment: ' + LABELS[current] + '. Canviarà quan tornis a obrir l’app.'
                : 'Color fix: ' + LABELS[current] + '.';
        }
        // A la capçalera, abans de renderitzar el CSS i la primera pantalla.
        paint();
        if (mode === 'aleatori') safeSet(storage, LAST_KEY, current);

        function selectMode(next) {
            const normalized = normalizeMode(next);
            // En activar «Aleatori», no deixem el color manual anterior
            // amb l'aspecte d'una selecció aleatòria sense canviar res.
            if (normalized === 'aleatori') current = pickRandom(current, random);
            else current = normalized;
            mode = normalized;
            safeSet(storage, MODE_KEY, mode);
            safeSet(storage, LAST_KEY, current);
            paint();
            return current;
        }
        function mount() {
            const select = doc.getElementById('app-bg-select');
            if (select && !select.dataset.appBgReady) {
                select.dataset.appBgReady = '1';
                select.addEventListener('change', function () { selectMode(select.value); });
            }
            paint();
        }
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount);
        else mount();

        // Quan una pàgina es recupera de la bfcache, es considera una
        // obertura nova; canviar de secció o pestanya NO altera el color.
        if (typeof w.addEventListener === 'function') {
            w.addEventListener('pageshow', function (event) {
                if (event && event.persisted && mode === 'aleatori') {
                    current = pickRandom(current, random);
                    safeSet(storage, LAST_KEY, current);
                    paint();
                }
            });
        }
        return Object.freeze({
            getMode: () => mode,
            getColor: () => current,
            selectMode,
            refreshUI: mount
        });
    }

    return Object.freeze({
        VERSION, MODE_KEY, LAST_KEY, COLORS, IDS, LABELS,
        normalizeMode, pickRandom, resolve, start
    });
});
