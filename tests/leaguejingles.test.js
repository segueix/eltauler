const fs = require('fs');
const path = require('path');
const R = require('../radioambient');

// ---------------------------------------------------------------------------
// Tornades de la lliga: peces de 30 s que sonen a la pantalla entre partida i
// partida de rellotge (el compte enrere de 30 s). L'app les COMPON cada
// vegada (tonalitat, tempo, acords i melodia) sobre cinc estils: aquí es
// comprova que la música compleix les regles (escala, notes de l'acord als
// temps forts, cadència i final a la tònica), que duren el compte enrere, que
// cada llavor dona una peça diferent i que el reproductor respecta el volum,
// l'interruptor general i el punt d'inici.
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

describe('l’app compon les tornades', () => {
    const STYLES = R.JINGLES.map(j => j.id);
    const SEEDS = [1, 2, 3, 77, 1234, 98765, 4000000000];

    test('cinc estils amb nom i descripció', () => {
        expect(R.JINGLES).toHaveLength(5);
        expect(new Set(STYLES).size).toBe(5);
        R.JINGLES.forEach(j => { expect(j.name).toBeTruthy(); expect(j.description).toBeTruthy(); });
        expect(R.JINGLE_SECONDS).toBe(30);
    });

    test('la mateixa llavor dona la mateixa peça; llavors diferents, peces diferents', () => {
        STYLES.forEach(st => {
            expect(R.composeJingle(st, 42)).toEqual(R.composeJingle(st, 42));
            const fps = new Set();
            for (let seed = 1; seed <= 300; seed++) fps.add(R.jingleFingerprint(R.composeJingle(st, seed)));
            // Pràcticament totes diferents (la memòria de l'app descarta les repetides).
            expect(fps.size).toBeGreaterThan(290);
        });
    });

    test.each(STYLES)('%s: estructura, tempo, escala i final a la tònica', st => {
        const style = R._jingleStyles[st];
        SEEDS.forEach(seed => {
            const sp = R.composeJingle(st, seed);
            const bar = sp.beat * 4, end = sp.chords.length * bar;
            // El cop final arriba entre el segon 24 i el 27 del compte enrere.
            expect(end).toBeGreaterThanOrEqual(23.9);
            expect(end).toBeLessThanOrEqual(27);
            expect(sp.chords).toHaveLength(style.bars);
            // Cadència: l'últim acord abans del final és la dominant.
            expect(sp.degrees[sp.degrees.length - 1]).toBe(4);
            expect(R.jingleTitle(sp)).toMatch(/ · (do|do♯|re|mi♭|mi|fa|fa♯|sol|la♭|la|si♭|si) (major|menor)$/);
            expect(sp.final.notes[0] % 12).toBe(sp.tonic);
            expect(sp.final.top % 12).toBe(sp.tonic);
            if (st === 'galop') { expect(sp.patterns).toHaveLength(sp.chords.length); return; }
            const scale = R._scales[sp.mode].map(i => (sp.tonic + i) % 12);
            expect(sp.melody.length).toBeGreaterThan(sp.chords.length * 2);
            sp.melody.forEach(([b, t, n, d]) => {
                expect(n).toBeGreaterThanOrEqual(style.mel[0]);
                expect(n).toBeLessThanOrEqual(style.mel[1]);
                expect(b * bar + (t + d) * sp.beat).toBeLessThanOrEqual(end + 1e-6);
                const chord = sp.chords[b];
                // Cada nota és de l'escala o de l'acord (la sensible a la dominant).
                expect(scale.includes(n % 12) || chord.pcs.includes(n % 12)).toBe(true);
                // Als temps forts, sempre una nota de l'acord.
                if (t === 0 || t === 2) expect(chord.pcs.includes(n % 12)).toBe(true);
            });
        });
    });

    test.each(STYLES)('%s: 30 s, volum com la resta de música i final en silenci', st => {
        const d = R.jingleSamples(R.composeJingle(st, 2026), SR, seeded());
        expect(d.length).toBe(30 * SR);
        let peak = 0;
        for (const v of d) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); }
        expect(peak).toBeLessThanOrEqual(0.7201);
        expect(rms(d, 0, d.length)).toBeGreaterThan(0.07);
        expect(rms(d, 0, d.length)).toBeLessThan(0.13);
        expect(rms(d, Math.round(0.3 * SR), 2 * SR)).toBeGreaterThan(0.04);
        expect(rms(d, d.length - Math.round(0.1 * SR), d.length)).toBeLessThan(0.005);
    });

    test('la versió a trossos dona exactament les mateixes mostres', async () => {
        const sp = R.composeJingle('rumba', 9);
        const sync = R.jingleSamples(sp, SR, seeded(3));
        const later = fn => fn();
        const async = await R.jingleSamplesAsync(sp, SR, seeded(3), { later, budgetMs: 1 });
        expect(Array.from(async.slice(0, 2000))).toEqual(Array.from(sync.slice(0, 2000)));
        expect(rms(async, 0, async.length)).toBeCloseTo(rms(sync, 0, sync.length), 6);
    });

    test('mai el mateix estil dues transicions seguides', () => {
        for (const prev of STYLES) {
            for (let r = 0; r < 1; r += 0.1) expect(R.pickJingle(() => r, prev)).not.toBe(prev);
        }
        expect(R.jingleId('no-existeix')).toBe(STYLES[0]);
    });
});

describe('el reproductor de tornades', () => {
    const quick = () => Promise.resolve(new Float32Array(10));
    afterEach(() => R.setAllowed(true));

    test('sona una sola vegada, amb el volum de la música i des del punt del compte enrere', async () => {
        const ctx = context();
        const player = R.createJinglePlayer({ createContext: () => ctx, generate: jest.fn(quick) });
        const sp = R.composeJingle('himne', 5);
        const ok = await player.play(sp, { volume: 50, startedAt: () => 2.5 });
        expect(ok).toBe(true);
        const src = ctx.sources[0];
        expect(src.loop).toBe(false);
        expect(src.start).toHaveBeenCalledWith(0, 2.5);
        expect(ctx.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0.5 * R.JINGLE_LEVEL, 1, 0.04);
        expect(player.playing()).toBe('himne');
        expect(player.current()).toBe(sp);
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
        const sp = R.composeJingle('fanfarria', 8);
        await player.play(sp, { volume: 30 });
        player.pause();
        expect(ctx.suspend).toHaveBeenCalled();
        player.resume();
        expect(ctx.resume).toHaveBeenCalled();
        await player.play(sp, { volume: 30 });
        expect(generate).toHaveBeenCalledTimes(1);
        await player.play(R.composeJingle('fanfarria', 9), { volume: 30 });
        expect(generate).toHaveBeenCalledTimes(2);
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
        // Peça composta ara, amb una llavor que no repeteixi cap de les darreres.
        expect(app).toMatch(/spec = R\.composeJingle\(style, seed\);/);
        expect(app).toMatch(/if \(seen\.indexOf\(fp\) < 0\) break;/);
        expect(app).toMatch(/if \(!prefs\.music \|\| !\(prefs\.volume > 0\)\) return null;/);
    });
    test('la pantalla mostra quina tornada sona', () => {
        expect(html).toContain('id="li-music"');
        expect(html).toMatch(/<symbol id="ic-music"/);
    });
});
