const L = require('../tvleague');
const TV = require('../stockfishtv');
const fs = require('fs');
const path = require('path');

describe('Campionat local Stockfish vs Lozza', () => {
    test('comptador històric separat per configuració de motor, ratxes i taules', () => {
        const s = L.normalize(null);
        L.record(s, 'classic:skill', { id: 'a', winner: 'stockfish' });
        L.record(s, 'classic:skill', { id: 'b', winner: 'stockfish' });
        L.record(s, 'classic:skill', { id: 'c', winner: 'draw' });
        L.record(s, 'classic:skill', { id: 'd', winner: 'lozza' });
        L.record(s, 'sf19:elo', { id: 'e', winner: 'lozza' });
        expect(L.stats(s, 'classic:skill')).toMatchObject({
            total: 4, wins: { stockfish: 2, lozza: 1, draw: 1 },
            streak: { winner: 'lozza', count: 1 }, best: { stockfish: 2, lozza: 1 },
            remaining: 6, nextMilestone: 10
        });
        expect(L.stats(s, 'sf19:elo')).toMatchObject({
            total: 1, wins: { stockfish: 0, lozza: 1, draw: 0 }
        });
        // No dobla partides ni accepta guanyadors inventats.
        L.record(s, 'classic:skill', { id: 'd', winner: 'lozza' });
        L.record(s, 'classic:skill', { id: 'f', winner: 'player' });
        expect(L.stats(s, 'classic:skill').total).toBe(4);
    });
    test('el pronòstic queda reservat per al duel següent, sense punts ni diners', () => {
        let s = L.predict(L.normalize(null), 'classic', 'lozza');
        expect(L.stats(s, 'classic').pending).toBe('lozza');
        const picked = L.claim(s, 'classic');
        s = picked.state;
        expect(picked.choice).toBe('lozza');
        expect(L.stats(s, 'classic').pending).toBeNull();
        L.record(s, 'classic', { id: 'j1', winner: 'lozza', prediction: picked.choice });
        expect(L.stats(s, 'classic').forecasts).toEqual({ total: 1, correct: 1 });
        L.record(s, 'classic', { id: 'j2', winner: 'draw', prediction: null });
        expect(L.stats(s, 'classic').forecasts).toEqual({ total: 1, correct: 1 });
        L.record(s, 'classic', { id: 'j3', winner: 'stockfish', prediction: 'lozza' });
        expect(L.stats(s, 'classic').forecasts).toEqual({ total: 2, correct: 1 });
        expect(L.stats(s, 'classic').lastForecast.correct).toBe(false);
        expect(L.predict(s, 'classic', 'malament')).toEqual(L.normalize(s));
    });
    test('migració conservadora de les últimes vuit partides; persistència independent', () => {
        const recent = [
            { sig: 'v1', winner: 'stockfish' },
            { sig: 'v2', winner: 'lozza' },
            { sig: 'v1', winner: 'draw' }
        ];
        const first = L.fromRecent(L.normalize(null), 'v1', recent);
        expect(L.stats(first, 'v1').total).toBe(2);
        expect(L.stats(L.fromRecent(first, 'v1', recent), 'v1').total).toBe(2);
        const normalized = L.normalize(JSON.parse(JSON.stringify(first)));
        expect(L.stats(normalized, 'v1').wins.draw).toBe(1);
        expect(L.stats(normalized, 'v2').total).toBe(0);
        expect(L.KEY).toBe('tauler_tv_league_v1');
    });
    test('el nom visible no canvia però la veu diu Stock fish', () => {
        expect(TV.tvSpeechText('Stockfish contra Lozza. STOCKFISH guanya.')).toBe(
            'Stock fish contra Lozza. Stock fish guanya.');
    });
    test('integració: només puntuen duels automàtics complets i es poden fer pronòstics', () => {
        const js = fs.readFileSync(path.join(__dirname, '../stockfishtv.js'), 'utf8');
        const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        const ui = fs.readFileSync(path.join(__dirname, '../tvleague-ui.js'), 'utf8');
        expect(js).toContain('recorded: !!g.recorded');
        expect(js).toContain('hadManualControl: !!g.hadManualControl');
        expect(js).toContain('ElTaulerTvLeagueUI.update(state)');
        expect(ui).toContain('game.end && game.recorded && !game.hadManualControl');
        expect(html).toContain('id="sftv-predict"');
        expect(html).toContain('tvleague-ui.js?v=1.0.0');
        // Importa els mòduls abans de la TV sense fixar una versió de cache-busting.
        const leagueScript = html.indexOf('<script src="tvleague.js?v=');
        const leagueUiScript = html.indexOf('<script src="tvleague-ui.js?v=');
        const tvScript = html.indexOf('<script src="stockfishtv.js?v=');
        expect(leagueScript).toBeGreaterThanOrEqual(0);
        expect(leagueUiScript).toBeGreaterThan(leagueScript);
        expect(tvScript).toBeGreaterThan(leagueUiScript);
    });
});
