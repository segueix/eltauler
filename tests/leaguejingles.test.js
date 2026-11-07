const fs = require('fs');
const path = require('path');
const R = require('../radioambient');

// ---------------------------------------------------------------------------
// Tornades de la lliga: peces de 30 s que sonen a la pantalla entre partida i
// partida de rellotge (el compte enrere de 30 s). Es generen al dispositiu,
// com les melodies de fons: aquí es comprova que duren el compte enrere, que
// acaben amb l'acord final i en silenci, que no es repeteixen seguides i que
// el reproductor respecta el volum, l'interruptor general i el punt d'inici.
// ---------------------------------------------------------------------------
jest.setTimeout(30000);

const SR = 8000;
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function context(state = 'running') {
    const sources = [], gains = [];
    const ctx = { state, currentTime: 1, destination: {}, sources, gains,
        resume: jest.fn(async () => { ctx.state = 'running'; }), suspend: jest.fn(async () => { ctx.state = 'suspended'; }),
        close: jest.fn(async () => { ctx.state = 'closed'; }),
        createBuffer: jest.fn((channels, length) => ({ length, getChannelData: () => new Float32Array(length) })),
        createBufferSource() { const s = { connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn() }; sources.push(s); return s; },
        createGain() { const g = { connect: jest.fn(), disconnect: jest.fn(), gain: { value: 1, setTargetAtTime: jest.fn() } }; gains.push(g); return g; }
    };
    return ctx;
}
const rms = (d, a, b) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, b - a)); };

describe('les tornades', () => {
    test('cinc peces amb nom i descripció, totes diferents', () => {
        expect(R.JINGLES).toHaveLength(5);
        expect(new Set(R.JINGLES.map(j => j.id)).size).toBe(5);
        R.JINGLES.forEach(j => { expect(j.name).toBeTruthy(); expect(j.description).toBeTruthy(); });
        expect(R.JINGLE_SECONDS).toBe(30);
    });

    test.each(R.JINGLES.map(j => j.id))('%s: 30 s, volum com la resta de música, acord final abans del segon 27 i final en silenci', id => {
        const d = R.jingleSamples(id, SR, seeded());
        expect(d.length).toBe(30 * SR);
        let peak = 0;
        for (const v of d) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); }
        expect(peak).toBeLessThanOrEqual(0.7201);
        expect(rms(d, 0, d.length)).toBeGreaterThan(0.07);
        expect(rms(d, 0, d.length)).toBeLessThan(0.13);
        // Sona des del principi (no hi ha un silenci d'entrada)...
        expect(rms(d, Math.round(0.3 * SR), 2 * SR)).toBeGreaterThan(0.04);
        // ...i l'última dècima de segon ja és silenci.
        expect(rms(d, d.length - Math.round(0.1 * SR), d.length)).toBeLessThan(0.005);
        const sc = R._jingleScores[id];
        const end = sc.chords.length * sc.beat * 4;
        expect(end).toBeGreaterThan(24);
        expect(end).toBeLessThanOrEqual(27);
        (sc.melody || []).forEach(([b, t, n, dur]) => {
            expect(b).toBeLessThan(sc.chords.length);
            expect(b * sc.beat * 4 + (t + dur) * sc.beat).toBeLessThanOrEqual(end + 0.001);
            expect(n).toBeGreaterThanOrEqual(55);
            expect(n).toBeLessThanOrEqual(96);
        });
    });

    test('la versió a trossos dona exactament les mateixes mostres', async () => {
        const sync = R.jingleSamples('rumba', SR, seeded(3));
        const later = fn => fn();
        const async = await R.jingleSamplesAsync('rumba', SR, seeded(3), { later, budgetMs: 1 });
        expect(Array.from(async.slice(0, 2000))).toEqual(Array.from(sync.slice(0, 2000)));
        expect(rms(async, 0, async.length)).toBeCloseTo(rms(sync, 0, sync.length), 6);
    });

    test('mai la mateixa tornada dues transicions seguides', () => {
        for (const prev of R.JINGLES.map(j => j.id)) {
            for (let r = 0; r < 1; r += 0.1) expect(R.pickJingle(() => r, prev)).not.toBe(prev);
        }
        expect(R.jingleId('no-existeix')).toBe(R.JINGLES[0].id);
    });
});

describe('el reproductor de tornades', () => {
    const quick = () => Promise.resolve(new Float32Array(10));
    afterEach(() => R.setAllowed(true));

    test('sona una sola vegada, amb el volum de la música i des del punt del compte enrere', async () => {
        const ctx = context();
        const player = R.createJinglePlayer({ createContext: () => ctx, generate: jest.fn(quick) });
        const ok = await player.play('himne', { volume: 50, startedAt: () => 2.5 });
        expect(ok).toBe(true);
        const src = ctx.sources[0];
        expect(src.loop).toBe(false);
        expect(src.start).toHaveBeenCalledWith(0, 2.5);
        expect(ctx.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0.5 * R.JINGLE_LEVEL, 1, 0.04);
        expect(player.playing()).toBe('himne');
        player.stop(true);
        expect(src.stop).toHaveBeenCalled();
        expect(player.playing()).toBeNull();
    });

    test('sense volum o amb la música apagada no sona res', async () => {
        const ctx = context();
        const player = R.createJinglePlayer({ createContext: () => ctx, generate: jest.fn(quick) });
        expect(await player.play('funk', { volume: 0 })).toBe(false);
        R.setAllowed(false);
        expect(await player.play('funk', { volume: 40 })).toBe(false);
        expect(ctx.sources).toHaveLength(0);
    });

    test('si se n’atura una abans que acabi de generar-se, ja no sona', async () => {
        const ctx = context();
        let release;
        const generate = () => new Promise(res => { release = () => res(new Float32Array(10)); });
        const player = R.createJinglePlayer({ createContext: () => ctx, generate });
        const p = player.play('galop', { volume: 30 });
        for (let i = 0; i < 4 && !release; i++) await Promise.resolve();
        player.stop(true);
        release();
        expect(await p).toBe(false);
        expect(ctx.sources).toHaveLength(0);
    });

    test('es pausa i es reprèn amb l’app amagada; la mateixa tornada no es torna a generar', async () => {
        const ctx = context();
        const generate = jest.fn(quick);
        const player = R.createJinglePlayer({ createContext: () => ctx, generate });
        await player.play('fanfarria', { volume: 30 });
        player.pause();
        expect(ctx.suspend).toHaveBeenCalled();
        player.resume();
        expect(ctx.resume).toHaveBeenCalled();
        await player.play('fanfarria', { volume: 30 });
        expect(generate).toHaveBeenCalledTimes(1);
    });
});

describe('connexió amb la pantalla entre partides de la lliga', () => {
    const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    test('comença amb el compte enrere, es pausa amb l’app amagada i s’atura en sortir', () => {
        const show = app.slice(app.indexOf('function showLeagueInterlude('), app.indexOf('function renderLeagueInterludeCount('));
        expect(show).toContain('startLeagueInterludeMusic();');
        const tick = app.slice(app.indexOf('function tickLeagueInterlude('), app.indexOf('function stopLeagueInterludeTimer('));
        expect(tick).toMatch(/document\.hidden\) leagueJinglePlayer\.pause\(\); else leagueJinglePlayer\.resume\(\)/);
        const hide = app.slice(app.indexOf('function hideLeagueInterlude('), app.indexOf('function startLeagueRoundFromInterlude('));
        expect(hide).toContain('stopLeagueInterludeMusic();');
        expect(app).toMatch(/pickJingle\(Math\.random, last\)/);
        expect(app).toMatch(/if \(!prefs\.music \|\| !\(prefs\.volume > 0\)\) return null;/);
    });
    test('la pantalla mostra quina tornada sona', () => {
        expect(html).toContain('id="li-music"');
        expect(html).toMatch(/<symbol id="ic-music"/);
    });
});
