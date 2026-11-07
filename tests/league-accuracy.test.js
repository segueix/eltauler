const fs = require('fs');
const path = require('path');
const core = require('../core.js');

// ---------------------------------------------------------------------------
// Lliga amb rellotge: la finestra del compte enrere entre partides mostra
// l'encert de la partida que s'acaba de jugar i la mitjana de les partides
// d'aquesta lliga (ElTaulerCore.leagueAccuracySummary).
// ---------------------------------------------------------------------------
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

describe('leagueAccuracySummary', () => {
    const sum = (games, current) => core.leagueAccuracySummary(games, current);

    test('la partida actual i la mitjana de la lliga', () => {
        const games = [{ id: 'a', precision: 70 }, { id: 'b', precision: 81 }];
        expect(sum(games, { id: 'b', precision: 81 })).toEqual({ last: 81, avg: 76, n: 2 });
    });
    test('si la partida actual encara no és a la llista, s’hi suma una sola vegada', () => {
        expect(sum([{ id: 'a', precision: 60 }], { id: 'c', precision: 90 })).toEqual({ last: 90, avg: 75, n: 2 });
        expect(sum([{ id: 'a', precision: 60 }], { precision: 90 })).toEqual({ last: 90, avg: 75, n: 2 });
        expect(sum([], { id: 'x', precision: 55 })).toEqual({ last: 55, avg: 55, n: 1 });
    });
    test('les partides sense cap jugada pròpia no compten', () => {
        const games = [{ id: 'a', precision: 0, playerMoves: 0 }, { id: 'b', precision: 64, playerMoves: 20 }];
        expect(sum(games, { id: 'c', precision: 0, playerMoves: 0 })).toEqual({ last: null, avg: 64, n: 1 });
        expect(sum(games, { id: 'c', precision: 0, playerMoves: 3 })).toEqual({ last: 0, avg: 32, n: 2 });
    });
    test('dades estranyes', () => {
        expect(sum(null, null)).toEqual({ last: null, avg: null, n: 0 });
        expect(sum([{ precision: 'x' }, null, { precision: NaN }], { precision: 140 })).toEqual({ last: 100, avg: 100, n: 1 });
        expect(sum([{ id: 'a', precision: 66.6 }, { id: 'b', precision: 70.2 }], null)).toEqual({ last: null, avg: 68, n: 2 });
    });
});

describe('finestra entre partides', () => {
    test('té els dos indicadors, amagats fins que hi ha dades', () => {
        const n = html.indexOf('id="league-interlude"');
        const card = html.slice(n, html.indexOf('class="li-actions"', n));
        expect(card).toContain('<div class="li-acc" id="li-acc" style="display:none;">');
        expect(card).toContain("Encert d'aquesta partida");
        expect(card).toContain('Mitjana de la lliga');
        expect(card).toContain('id="li-acc-last"');
        expect(card).toContain('id="li-acc-avg"');
        expect(card.indexOf('id="li-clock"')).toBeLessThan(card.indexOf('id="li-acc"'));
    });
    test('l’app hi passa l’encert de la partida i les partides de la lliga', () => {
        const show = app.slice(app.indexOf('function showLeagueInterlude('), app.indexOf('function showLeagueInterlude(') + 1500);
        expect(show).toContain('renderLeagueInterludeAccuracy(ci);');
        expect(app).toContain('precision: finalPrecision, playerMoves: totalPlayerMoves,');
        const acc = app.slice(app.indexOf('function leagueInterludeAccuracy('), app.indexOf('function leagueInterludeAccuracy(') + 800);
        expect(acc).toContain('currentLeagueGameLinks()');
        expect(acc).toContain('ElTaulerCore.leagueAccuracySummary(games, current)');
    });
});
