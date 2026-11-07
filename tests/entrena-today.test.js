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
            expect(html).toContain(`<symbol id="${info.icon}"`);
            expect(html).toMatch(new RegExp(`\\.hb--${info.tone} \\{`));
            if (k === 'weak') { expect(info.target).toBeNull(); return; }   // la proposta l'obre directament
            expect(html).toContain(`id="${info.target}"`);
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

describe('tema feble', () => {
    const pick = ctx => core.entrenaPickToday(ctx);
    const weak = extra => Object.assign({ theme: 'fork', label: 'Forquilles', count: 7, total: 24, source: 'tactics' }, extra);

    test('només amb dades clares i sense comptar «general»', () => {
        expect(core.entrenaWeakFocus({ fork: 7, general: 12, pin: 2 }, 24)).toEqual({ theme: 'fork', count: 7, total: 24 });
        expect(core.entrenaWeakFocus({ fork: 3 }, 4)).toBeNull();          // massa poques errades
        expect(core.entrenaWeakFocus({ fork: 2, pin: 1 }, 6)).toBeNull();  // cap tema amb 3
        expect(core.entrenaWeakFocus({ fork: 3, general: 30 }, 33)).toBeNull(); // menys del 20 %
        expect(core.entrenaWeakFocus({ general: 9 }, 9)).toBeNull();
        expect(core.entrenaWeakFocus({ pin: 4, fork: 4 }, 10).theme).toBe('fork'); // empat: ordre estable
    });
    test('font: jeroglífic del motiu, tàctiques, obertura o errades', () => {
        expect(core.entrenaWeakSource('fork', { hieroByMotif: { fork: 2 }, tactics: 5 })).toEqual({ source: 'hiero', motif: 'fork' });
        expect(core.entrenaWeakSource('king_attack', { hieroByMotif: { check: 1 } })).toEqual({ source: 'hiero', motif: 'check' });
        expect(core.entrenaWeakSource('king_attack', { hieroByMotif: { mate: 1, check: 1 } }).motif).toBe('mate');
        expect(core.entrenaWeakSource('pin', { hieroByMotif: {}, tactics: 3, errors: 2 })).toEqual({ source: 'tactics' });
        expect(core.entrenaWeakSource('opening', { errors: 4 })).toEqual({ source: 'opening' });
        expect(core.entrenaWeakSource('center', { errors: 4 })).toEqual({ source: 'errors' });
        expect(core.entrenaWeakSource('center', {})).toBeNull();
        Object.keys(core.ENTRENA_WEAK_MOTIFS).forEach(t => core.ENTRENA_WEAK_MOTIFS[t]
            .forEach(m => expect(html).toContain(`<option value="${m}">`)));
    });
    test('un jeroglífic del tema passa davant del jeroglífic genèric', () => {
        const p = pick({ hgNew: 3, weak: weak({ source: 'hiero', motif: 'fork' }) });
        expect(p.kind).toBe('weak');
        expect(p.title).toBe('Tema feble: Forquilles');
        expect(p.reason).toBe('És on falles més: 7 errors dels 24 que has comès. Jeroglífic que acaba en forquilla.');
        expect(p).toMatchObject({ theme: 'fork', source: 'hiero', motif: 'fork', target: null });
        expect(pick({ hgNew: 3, weak: weak({ source: 'hiero', motif: 'fork' }), done: { hiero: 1 } }).kind).not.toBe('weak');
    });
    test('els repassos pendents van primer; després, el tema feble abans de la varietat', () => {
        expect(pick({ srsDue: 2, weak: weak() }).kind).toBe('srs');
        expect(pick({ hgNew: 3, weak: weak() }).kind).toBe('hiero');
        const t = pick({ triaQuestions: 20, triaMin: 10, weak: weak() });
        expect(t.kind).toBe('weak');
        expect(t.reason).toMatch(/Tàctiques d'aquest tema/);
        expect(pick({ triaQuestions: 20, triaMin: 10, weak: weak(), done: { weak: 1 } }).kind).toBe('tria');
        expect(pick({ weak: weak({ source: 'errors' }) }).reason).toMatch(/Torna a les teves posicions/);
        expect(pick({ weak: weak({ theme: 'opening', source: 'opening' }), done: { opening: 1 } }).kind).toBe('bullet');
    });
    test('l’app calcula el tema, la font i obre l’exercici', () => {
        expect(app).toContain('ElTaulerCore.entrenaWeakFocus(w.theme, w.total)');
        expect(app).toContain('weak: entrenaWeakContext(done)');
        const start = app.slice(app.indexOf('function startWeakThemeSession('), app.indexOf('function startWeakThemeSession(') + 700);
        expect(start).toContain("void hgPlayNext({ pref: motif || 'any' })");
        expect(start).toContain('startTacticsPuzzle({ theme })');
        expect(start).toContain('startWeaknessTraining(theme)');
        // hgPlayNext accepta un final per a aquest cop sense tocar la preferència desada.
        expect(app).toContain("const pref = opts.pref || hieroglyphicPreferredFinalMotif || 'any';");
    });
    test('tàctiques per tema: el tema es manté amb «Una altra tàctica» i es perd des del menú', () => {
        const st = app.slice(app.indexOf('function startTacticsPuzzle(opts = {}) {'), app.indexOf('function startTacticsPuzzle(opts = {}) {') + 600);
        expect(st).toContain("tacticsThemeFocus = opts.theme || null");
        expect(st).toContain('else if (!(opts && opts.continueFocus)) tacticsThemeFocus = null;');
        expect(app).toContain("startTacticsPuzzle({ continueFocus: true }); });");
        const pickFen = app.slice(app.indexOf('function pickTacticsFen() {'), app.indexOf('function pickTacticsFen() {') + 300);
        expect(pickFen).toContain('tacticsFensForTheme(tacticsThemeFocus)');
    });
});

describe('la biblioteca d’errors no es buida en obrir un jeroglífic', () => {
    test('netejarErrorsPerJeroglific no toca savedErrors', () => {
        const body = app.slice(app.indexOf('function netejarErrorsPerJeroglific() {'), app.indexOf('function netejarErrorsPerJeroglific() {') + 1200);
        expect(body).not.toMatch(/savedErrors\s*=/);
        expect(body).toContain('matchErrorQueue = []');
    });
});
