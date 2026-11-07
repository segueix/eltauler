const fs = require('fs');
const path = require('path');
const core = require('../core.js');

// ---------------------------------------------------------------------------
// Secció Entrena de l'inici: una sola proposta «Què toca avui?» triada segons
// el progrés (ElTaulerCore.entrenaPickToday) i la resta d'entrenaments a un
// toc, dins «Més entrenaments». Tots els botons de sempre hi continuen (el
// tutorial, les missions i els enllaços directes els fan servir).
// ---------------------------------------------------------------------------
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const tutorial = fs.readFileSync(path.join(__dirname, '../tutorial.js'), 'utf8');

describe('entrenaPickToday: prioritats', () => {
    const pick = ctx => core.entrenaPickToday(ctx);

    test('primer els repassos pendents, amb els errors nous destacats', () => {
        const p = pick({ srsDue: 3, srsNew: 3, hgNew: 5, openingDue: 4 });
        expect(p.kind).toBe('srs');
        expect(p.target).toBe('btn-srs-review');
        expect(p.reason).toMatch(/^3 errors nous de les teves partides/);
        expect(pick({ srsDue: 3, srsNew: 1 }).reason).toMatch(/^1 error nou i 2 repassos pendents/);
        expect(pick({ srsDue: 1 }).reason).toMatch(/^1 repàs pendent avui/);
    });
    test('després de dues sessions de repàs avui, toca una altra cosa', () => {
        expect(pick({ srsDue: 6, hgNew: 2, done: { srs: 1 } }).kind).toBe('srs');
        expect(pick({ srsDue: 6, hgNew: 2, done: { srs: 2 } }).kind).toBe('hiero');
    });
    test('el que és nou: jeroglífics i després la teva obertura', () => {
        expect(pick({ hgNew: 2, openingDue: 3 }).kind).toBe('hiero');
        const o = pick({ hgNew: 2, openingDue: 3, openingName: 'Galop de Gràcia', done: { hiero: 1 } });
        expect(o.kind).toBe('opening');
        expect(o.target).toBe('btn-opening');
        expect(o.reason).toContain('3 posicions de «Galop de Gràcia»');
        expect(pick({ openingDue: 1 }).reason).toContain('1 posició del teu repertori');
    });
    test('varietat: Tres camins només si el test es pot fer', () => {
        expect(pick({ triaQuestions: 4, triaMin: 10 }).kind).toBe('bullet');
        expect(pick({ triaQuestions: 12, triaMin: 10 }).kind).toBe('tria');
        expect(pick({ triaQuestions: 12, triaMin: 10, done: { tria: 1 } }).kind).toBe('bullet');
    });
    test('el pla bullet acabat o ja obert avui no es repeteix; el recurs és tàctiques', () => {
        expect(pick({ bulletComplete: true }).kind).toBe('tactics');
        expect(pick({ bulletStarted: true }).reason).toMatch(/^Acaba el pla/);
        const t = pick({ done: { bullet: 1 } });
        expect(t.kind).toBe('tactics');
        expect(t.reason).toMatch(/feina important d'avui/);
        expect(pick({ bulletComplete: true }).reason).toMatch(/^Combinacions noves/);
    });
    test('dades estranyes no el fan caure', () => {
        expect(pick(null).kind).toBe('bullet');
        expect(pick({ srsDue: -2, hgNew: 'x', done: 'no' }).kind).toBe('bullet');
        expect(pick({ srsDue: 2, srsNew: 9 }).reason).toMatch(/^2 errors nous/);
    });
    test('cada tipus té botó, icona i to', () => {
        Object.keys(core.ENTRENA_KINDS).forEach(k => {
            const info = core.ENTRENA_KINDS[k];
            expect(html).toContain(`id="${info.target}"`);
            expect(html).toContain(`<symbol id="${info.icon}"`);
            expect(html).toMatch(new RegExp(`\\.hb--${info.tone} \\{`));
            expect(core.entrenaKindForTarget(info.target)).toBe(k);
        });
        expect(core.entrenaKindForTarget('btn-entrena-today')).toBeNull();
    });
});

describe('registre del dia', () => {
    test('compta per tipus i es buida en canviar de dia', () => {
        let log = core.entrenaMarkDone(null, '2026-11-07', 'hiero');
        log = core.entrenaMarkDone(log, '2026-11-07', 'hiero');
        log = core.entrenaMarkDone(log, '2026-11-07', 'inventat');
        expect(log).toEqual({ day: '2026-11-07', done: { hiero: 2 } });
        expect(core.entrenaDayLog(log, '2026-11-08')).toEqual({ day: '2026-11-08', done: {} });
        expect(core.entrenaDayLog({ day: '2026-11-07', done: { srs: -1, x: 3 } }, '2026-11-07').done).toEqual({});
    });
});

describe('inici: proposta a dalt i la resta a un toc', () => {
    const start = html.indexOf('<section class="home-sec home-sec--entrena"');
    const sec = html.slice(start, html.indexOf('</section>', start));

    test('la proposta va primer i la llista és plegable', () => {
        expect(sec.indexOf('id="btn-entrena-today"')).toBeLessThan(sec.indexOf('<details class="entrena-more" id="entrena-more">'));
        expect(sec).toContain('Què toca avui?');
        expect(sec).toContain('Més entrenaments');
        expect(sec).not.toContain('home-tiles');
    });
    test('la llista conserva tots els botons, en ordre', () => {
        const ids = ['btn-hieroglyphic-banner', 'btn-srs-review', 'btn-tria-banner', 'btn-tactics',
            'btn-bundle-menu', 'btn-bullet-practice', 'btn-opening', 'btn-explorer'];
        const list = sec.slice(sec.indexOf('<details'));
        const at = ids.map(id => list.indexOf(`id="${id}"`));
        at.forEach(i => expect(i).toBeGreaterThan(-1));
        expect(at.slice().sort((a, b) => a - b)).toEqual(at);
        ['srs-info', 'tria-banner-meta', 'tactics-info', 'bundle-info', 'hg-banner-status', 'btn-hieroglyphic-generate', 'btn-hieroglyphic-history']
            .forEach(id => expect(list).toContain(`id="${id}"`));
    });
    test('la proposta clica el botó de la llista i el registre és a la secció', () => {
        const init = app.slice(app.indexOf('function initEntrenaToday() {'), app.indexOf('function initEntrenaToday() {') + 1600);
        expect(init).toContain("ElTaulerCore.entrenaKindForTarget(btn.id)");
        expect(init).toContain('target.click()');
        expect(init).toContain('ENTRENA_MORE_OPEN_KEY');
        expect(app).toContain("const ENTRENA_DAY_KEY = 'eltauler_entrena_day';");
        // L'estat obert/tancat és de l'aparell: fora dels prefixos que sincronitza el núvol.
        expect(app).toMatch(/const ENTRENA_MORE_OPEN_KEY = 'tauler_ui_/);
        expect(app).toContain('    initEntrenaToday();\n');
    });
    test('es repinta en tornar a l’inici i quan canvien les dades', () => {
        const back = app.slice(app.indexOf('function navGoBack() {'), app.indexOf("window.addEventListener('popstate'"));
        expect(back).toContain('scheduleEntrenaToday()');
        const banner = app.slice(app.indexOf('function renderHieroglyphicBanner() {'), app.indexOf('function renderHieroglyphicBanner() {') + 2600);
        expect(banner).toContain('scheduleEntrenaToday()');
        const tria = app.slice(app.indexOf('function refreshTriaBanner() {'), app.indexOf('function refreshTriaBanner() {') + 1200);
        expect(tria).toContain('entrenaTriaCache = { questions: questions, min: min };');
    });
    test('la guia explica la proposta i hi porta', () => {
        expect(tutorial).toContain("title: 'Què toca avui?', action: 'today'");
        expect(tutorial).toContain("'today': () => click('#btn-entrena-today')");
    });
});
