const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Inici: la Lliga, el mode més jugat, és un bàner gran sota «Nova partida»
// (estat de la temporada, proper rival i «Juga la jornada»), en lloc d'una de
// les tres rajoles petites.
// ---------------------------------------------------------------------------
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

describe('bàner de la lliga a l’inici', () => {
    const start = html.indexOf('<section class="home-sec home-sec--juga"');
    const sec = html.slice(start, html.indexOf('</section>', start));

    test('va just després de «Nova partida»; els altres modes són a «Més maneres de jugar»', () => {
        const hero = sec.indexOf('id="league-hero"');
        expect(hero).toBeGreaterThan(sec.indexOf('id="btn-new-game"'));
        expect(sec).not.toContain('<div class="home-modes">');
        // El botó de sempre (#btn-league) és el bàner: el tutorial i ?mode=league el fan servir.
        expect(sec).toMatch(/<button type="button" class="hb hb--lg hb--bare league-hero-main" id="btn-league">/);
        expect(sec).toContain('id="btn-league-hero-play"');
        const ms = html.indexOf('<section class="home-sec home-sec--modes"');
        const m = html.indexOf('<div class="home-modes">', ms);
        expect(m).toBeGreaterThan(ms);
        const modes = html.slice(m, html.indexOf('</div>', m));
        expect(modes).toContain('btn-positional-game');
        expect(modes).toContain('btn-antidote-game');
        expect(modes).not.toContain('btn-league');
        expect(html).toMatch(/#start-screen \.home-modes \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    });
    test('l’antic avís «Proper partit de lliga» no es duplica', () => {
        expect(html).toContain('#start-screen #league-banner { display: none !important; }');
    });
    test('es pinta amb l’estat de la temporada i el botó comença la jornada', () => {
        const render = app.slice(app.indexOf('function renderLeagueHero() {'), app.indexOf('function renderLeagueHero() {') + 1800);
        expect(render).toContain("'Es desbloqueja amb la partida inicial de calibratge'");
        expect(render).toContain('Jornada ${st.round}/${st.total}');
        expect(render).toContain('Proper rival: ${st.opp.name}');
        expect(render).toContain('Juga la jornada ${st.round}');
        const state = app.slice(app.indexOf('function leagueHeroState() {'), app.indexOf('function renderLeagueHero() {'));
        expect(state).toContain('const started = !!(me && me.pj > 0);');
        expect(app).toContain("$('#btn-league-hero-play').off('click').on('click', () => { if (guardCalibrationAccess()) startLeagueRound(); });");
        const upd = app.slice(app.indexOf('function updateLeagueBanner() {'), app.indexOf('function updateLeagueBannerData() {'));
        expect(upd).toContain('renderLeagueHero();');
    });
});
