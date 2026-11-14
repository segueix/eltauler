// Inici net (2026-11-14): a la portada només hi ha Juga (Nova partida i la
// lliga) i les partides col·lectives; la resta d'El Tauler és a «Més», en
// seccions de segon nivell que s'obren amb una rajola i tornen amb «Inici» o
// amb el botó enrere.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const home = html.slice(html.indexOf('<div class="home-sections">'), html.indexOf('<div class="sync-container">'));
const between = (text, a, b) => { const i = text.indexOf(a); return text.slice(i, text.indexOf(b, i)); };
const sectionOf = cls => between(home, `<section class="home-sec ${cls}"`, '</section>');

const VIEWS = {
    tasques: ['home-sec--avui', ['missions-list', 'missions-count', 'btn-badges', 'engagement-banner', 'home-coach-banner', 'weekly-plan-panel']],
    tactiques: ['home-sec--entrena', ['btn-entrena-today', 'btn-hieroglyphic-banner', 'btn-srs-review', 'btn-tria-banner', 'btn-tactics', 'btn-bullet-practice', 'btn-opening']],
    revisar: ['home-sec--revisar', ['btn-bundle-menu', 'btn-history', 'btn-stats', 'btn-explorer']],
    modes: ['home-sec--modes', ['btn-positional-game', 'btn-antidote-game']],
    apren: ['home-sec--apren', ['btn-sftv-banner', 'btn-tutorial-banner', 'btn-guide-banner']],
    ajustos: ['home-sec--final', ['btn-ranking', 'btn-settings']]
};

describe('inici: la portada', () => {
    const main = between(home, '<div class="home-col home-col--main">', '<div class="home-col home-col--side">');
    const side = between(home, '<div class="home-col home-col--side">', '<!-- TASQUES I ENTRENADOR');

    test('només Juga i les partides col·lectives, i «Més» al costat', () => {
        expect((main.match(/<section /g) || []).length).toBe(2);
        expect(main).toContain('<section class="home-sec home-sec--juga"');
        expect(main).toContain('<section class="home-sec home-sec--comunitat"');
        expect(main).toContain('id="home-sec-comunitat">Partides col·lectives</h2>');
        ['btn-new-game', 'league-hero', 'btn-league', 'btn-catalans', 'custom-banners', 'btn-create-custom', 'live-game-banner', 'daily-grid']
            .forEach(id => expect(main).toContain(`id="${id}"`));
        ['btn-positional-game', 'btn-ranking', 'missions-list', 'btn-tactics', 'btn-history', 'btn-settings']
            .forEach(id => expect(main).not.toContain(`id="${id}"`));
        expect((side.match(/<section /g) || []).length).toBe(1);
        expect(side).toContain('<section class="home-sec home-sec--hub"');
    });

    test('«Més»: una rajola per secció, cadascuna amb la seva', () => {
        const hub = sectionOf('home-sec--hub');
        const opens = [...hub.matchAll(/data-home-open="([a-z]+)"/g)].map(m => m[1]);
        expect(opens).toEqual(Object.keys(VIEWS));
        expect(hub).toContain('id="hub-tasques-sub"');
    });

    test('de les missions, a la portada només hi ha la ratxa i les estrelles, que obren les tasques', () => {
        const stats = between(html, '<div class="stats-row">', '<div class="home-sections">');
        expect(stats).toMatch(/<div class="stat-box" id="streak-box" role="button" tabindex="0" data-home-open="tasques"/);
        expect(stats).toMatch(/<div class="stat-box" role="button" tabindex="0" data-home-open="tasques"[^>]*>\s*<div class="stat-label">Estrelles<\/div>/);
        expect(main).not.toContain('missions-panel');
    });
});

describe('inici: les seccions de segon nivell', () => {
    test.each(Object.entries(VIEWS))('%s: hi és tot i té el botó d’inici a dalt i a baix', (view, [cls, ids]) => {
        const sec = sectionOf(cls);
        expect(sec).toContain(`data-view="${view}"`);
        // A dalt, «Inici» amb la casa; a baix, la casa daurada de les altres pantalles.
        expect(sec).toMatch(/<div class="home-sec-head"><button type="button" class="home-sec-back" data-home-back aria-label="Pàgina principal" title="Pàgina principal"><svg aria-hidden="true"><use href="#ic-home"\/><\/svg><span>Inici<\/span><\/button>/);
        const foot = sec.slice(sec.lastIndexOf('<div class="menu-buttons home-sec-foot">'));
        expect(foot).toMatch(/^<div class="menu-buttons home-sec-foot">\s*<button type="button" class="btn btn-nav-home" data-home-back aria-label="Pàgina principal" title="Pàgina principal"><svg class="btn-ic" aria-hidden="true"><use href="#ic-home"\/><\/svg><\/button>\s*<\/div>\s*$/);
        expect(sec).toMatch(/<h2 class="home-sec-title" id="home-sec-[a-z]+" tabindex="-1">/);
        ids.forEach(id => expect(sec).toContain(`id="${id}"`));
    });

    test('cada identificador hi és una sola vegada', () => {
        Object.values(VIEWS).forEach(([, ids]) => ids.forEach(id => {
            expect(html.split(`id="${id}"`).length - 1).toBe(1);
        }));
    });

    test('el CSS amaga les tancades i, amb una oberta, la portada', () => {
        expect(html).toContain('#start-screen .home-sec[data-view]:not(.is-open) { display: none !important; }');
        expect(html).toContain('#start-screen[data-home-view] .home-col { display: none !important; }');
        expect(html).toMatch(/body\.device-desktop #start-screen \.home-sec\[data-view\] \{ grid-column: 1 \/ -1;/);
    });
});

describe('inici: obrir i tancar seccions (app.js)', () => {
    const fn = name => {
        const a = app.indexOf(`function ${name}(`);
        return app.slice(a, app.indexOf('\n}\n', a) + 2);
    };
    function ctx() {
        const attrs = {};
        const sections = Object.keys(VIEWS).map(v => {
            const cls = new Set();
            return { view: v, getAttribute: () => v, classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), has: c => cls.has(c) } };
        });
        const focused = [];
        const el = name => ({ focus: () => focused.push(name) });
        const screen = {
            getAttribute: k => (k in attrs ? attrs[k] : null),
            setAttribute: (k, v) => { attrs[k] = v; },
            removeAttribute: k => { delete attrs[k]; },
            querySelectorAll: () => sections,
            querySelector: sel => el(sel)
        };
        const pushed = [];
        let backs = 0;
        const c = vm.createContext({
            document: { getElementById: id => (id === 'start-screen' ? screen : null) },
            history: { pushState: s => pushed.push(s), back: () => { backs++; } },
            screenUrl: () => '/', scrollNavigationToTop() {}, scheduleEntrenaToday() {}
        });
        vm.runInContext(`const HOME_VIEWS = ${JSON.stringify(Object.keys(VIEWS))}; let homeViewInHistory = false;`, c);
        ['getHomeView', 'setHomeView', 'closeHomeView'].forEach(n => vm.runInContext(fn(n), c));
        return { c, attrs, sections, pushed, focused, backs: () => backs };
    }

    test('obrir una secció: marca la pantalla i la secció, i afegeix un pas a l’historial', () => {
        const t = ctx();
        t.c.setHomeView('revisar', { push: true });
        expect(t.attrs['data-home-view']).toBe('revisar');
        expect(t.sections.filter(s => s.classList.has('is-open')).map(s => s.view)).toEqual(['revisar']);
        expect(t.pushed).toEqual([{ screen: 'start-screen', homeView: 'revisar' }]);
        expect(t.focused[0]).toContain('[data-view="revisar"] .home-sec-title');
    });

    test('«Inici» desfà el pas de l’historial (popstate la tanca); sense pas, la tanca directament', () => {
        const t = ctx();
        t.c.setHomeView('apren', { push: true });
        t.c.closeHomeView();
        expect(t.backs()).toBe(1);
        t.c.setHomeView('');
        expect(t.attrs['data-home-view']).toBeUndefined();
        expect(t.sections.some(s => s.classList.has('is-open'))).toBe(false);
        expect(t.focused.pop()).toContain('[data-home-open="apren"]');
        const u = ctx();
        u.c.setHomeView('modes');
        u.c.closeHomeView();
        expect(u.backs()).toBe(0);
        expect(u.attrs['data-home-view']).toBeUndefined();
    });

    test('una secció que no existeix no obre res', () => {
        const t = ctx();
        t.c.setHomeView('inventada', { push: true });
        expect(t.attrs['data-home-view']).toBeUndefined();
        expect(t.pushed).toEqual([]);
    });

    test('el botó enrere tanca la secció oberta abans de res més', () => {
        const pop = app.slice(app.indexOf("window.addEventListener('popstate'"), app.indexOf('navGoBack();\n});'));
        expect(pop).toMatch(/if \(current === 'start-screen'\) \{\s*\/\/[^\n]*\n\s*if \(getHomeView\(\)\) \{ setHomeView\(''\); return; \}/);
        expect(app).toContain('    initHomeViews();\n');
        expect(fn('updateMissionsDisplay')).toContain('updateHomeHubTasks(doneCount, todayMissions.length);');
    });
});
