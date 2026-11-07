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

    test('cada estil fa servir tots els seus solistes i variants', () => {
        STYLES.forEach(st => {
            const leads = new Set(), variants = new Set();
            for (let seed = 1; seed <= 400; seed++) { const sp = R.composeJingle(st, seed); leads.add(sp.lead); variants.add(sp.variant); }
            expect(leads.size).toBe(R._jingleStyles[st].leads.length);
            expect(variants.size).toBe(R._jingleStyles[st].variants);
        });
    });

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
            expect(end).toBeGreaterThanOrEqual(24.4);
            expect(end).toBeLessThanOrEqual(26.6);
            // Tempo tranquil, per acompanyar les partides (mai més de 106 ppm).
            expect(60 / sp.beat).toBeLessThanOrEqual(106);
            expect(60 / sp.beat).toBeGreaterThanOrEqual(70);
            expect(sp.chords.length).toBeGreaterThanOrEqual(7);
            expect(sp.chords.length).toBeLessThanOrEqual(12);
            // Solista i variant d'acompanyament, dins de les opcions de l'estil.
            expect(style.leads).toContain(sp.lead);
            expect(sp.variant).toBeGreaterThanOrEqual(0);
            expect(sp.variant).toBeLessThan(style.variants);
            // Cadència: l'últim acord abans del final és la dominant.
            expect(sp.degrees[sp.degrees.length - 1]).toBe(4);
            expect(R.jingleTitle(sp)).toMatch(/ · (do|do♯|re|mi♭|mi|fa|fa♯|sol|la♭|la|si♭|si) (major|menor) · [a-zà-ú ]+$/);
            expect(R.jingleTitle(sp).endsWith(R._leadNames[sp.lead])).toBe(true);
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
        // En bucle: sense final, sona fins que comença la partida.
        expect(app).toMatch(/spec = R\.composeJingle\(style, seed, \{ loop: true \}\);/);
        expect(app).toMatch(/registerComposition\(\{ where: 'lliga', style: spec\.style, seed: spec\.seed, loop: true \}\)/);
        expect(app).toMatch(/if \(seen\.indexOf\(fp\) < 0\) break;/);
        expect(app).toMatch(/if \(!prefs\.music \|\| !\(prefs\.volume > 0\)\) return null;/);
    });
    test('la pantalla mostra quina tornada sona', () => {
        expect(html).toContain('id="li-music"');
        expect(html).toMatch(/<symbol id="ic-music"/);
    });
});

describe('música composta a la TV Stockfish vs Lozza', () => {
    test('a cada partida, un bucle compost de 32 s exactes, sense cop final', () => {
        const id = R.composeMelodyId(seeded(5), null);
        const p = R.parseComposedId(id);
        expect(p).not.toBeNull();
        expect(R.melodyId(id)).toBe(id);
        const sp = R.composedLoopSpec(id);
        expect(sp.loop).toBe(true);
        expect(sp.chords.length * sp.beat * 4).toBeCloseTo(R.MELODY_SECONDS, 6);
        // L'últim compàs és la dominant: torna a la tònica en començar de nou.
        expect(sp.degrees[sp.degrees.length - 1]).toBe(4);
        const info = R.melodyInfo(id);
        expect(info.composed).toBe(true);
        expect(info.name).toBe(R.jingleTitle(sp));
        expect(info.description).toBe('composta ara per l’app');
        const d = R.samples(id, SR, seeded());
        expect(d.length).toBe(R.MELODY_SECONDS * SR);
        // Sense esvaïment: el bucle continua sonant fins a l'últim instant.
        expect(rms(d, d.length - Math.round(0.5 * SR), d.length)).toBeGreaterThan(0.02);
    });
    test('estil diferent de la partida anterior; identificadors dolents, a la melodia per defecte', () => {
        let prev = R.composeMelodyId(seeded(1), null);
        for (let k = 0; k < 20; k++) {
            const next = R.composeMelodyId(Math.random, prev);
            expect(R.parseComposedId(next).style).not.toBe(R.parseComposedId(prev).style);
            prev = next;
        }
        expect(R.parseComposedId('c:no-existeix:5')).toBeNull();
        expect(R.melodyId('c:no-existeix:5')).toBe(R.MELODIES[0].id);
        expect(R.melodyId('bossa')).toBe('bossa');
    });
    test('la TV fa servir el compositor i desa al registre el que sona', () => {
        const tv = fs.readFileSync(path.join(__dirname, '../stockfishtv.js'), 'utf8');
        expect(tv).toMatch(/api\.composeMelodyId\(Math\.random, melody\)/);
        expect(tv).toMatch(/api\.registerComposition\(\{ where: 'tv'/);
    });
});

describe('registre de la música composta', () => {
    function memory() {
        const data = {};
        return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
    }
    test('desa estil i llavor, sense duplicats; la peça es torna a generar igual', () => {
        const st = memory();
        R.registerComposition({ where: 'lliga', style: 'rumba', seed: 12, at: 1 }, st);
        R.registerComposition({ where: 'tv', style: 'himne', seed: 7, loop: true, at: 2 }, st);
        R.registerComposition({ where: 'lliga', style: 'rumba', seed: 12, at: 3 }, st);
        const list = R.registryList(st);
        expect(list.map(e => R.registryKey(e))).toEqual(['rumba:12:t', 'himne:7:b']);
        expect(list[0].at).toBe(3);
        expect(R.registrySpec(list[1])).toEqual(R.composeJingle('himne', 7, { loop: true }));
        // També les tornades antigues (sense bucle) es tornen a generar en bucle.
        expect(R.registrySpec(list[0])).toEqual(R.composeJingle('rumba', 12, { loop: true }));
        expect(R.registerComposition({ style: 'no-existeix', seed: 1 }, st)).toBeNull();
    });
    test('es guarden les 200 darreres (ocupen molt poc) i totes les preferides', () => {
        const st = memory();
        R.registerComposition({ where: 'lliga', style: 'funk', seed: 1, at: 0 }, st);
        expect(R.toggleFavourite('funk:1:t', st)).toBe(true);
        for (let k = 2; k <= 230; k++) R.registerComposition({ where: 'lliga', style: 'galop', seed: k, at: k }, st);
        const list = R.registryList(st);
        expect(list.filter(e => !e.fav)).toHaveLength(200);
        // Unes desenes de bytes per peça: 200 peces no arriben a 20 kB.
        expect(st.data[R.REGISTRY_KEY].length).toBeLessThan(20000);
        expect(list.find(e => R.registryKey(e) === 'funk:1:t').fav).toBe(true);
        // Tornar-la a sentir no li treu la marca de preferida.
        R.registerComposition({ where: 'lliga', style: 'funk', seed: 1, at: 99 }, st);
        expect(R.registryList(st)[0]).toMatchObject({ style: 'funk', fav: true, at: 99 });
        expect(R.toggleFavourite('funk:1:t', st)).toBe(false);
    });
    test('Configuració mostra el registre amb escolta i preferides', () => {
        const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
        const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        expect(html).toContain('id="composed-music-list"');
        // Sense el número de la llavor a la vista: no aporta res a qui escolta.
        expect(app).not.toMatch(/núm\. \$\{(spec|e)\.seed/);
        expect(app).toMatch(/data-cm-play=/);
        expect(app).toMatch(/data-cm-fav=/);
        expect(app).toMatch(/registerComposition\(\{ where: 'lliga'/);
    });
});

describe('peces en bucle, sense final', () => {
    test('el reproductor fa sonar en bucle les peces en bucle i el punt d’inici dona la volta', async () => {
        const ctx = context();
        const player = R.createJinglePlayer({ createContext: () => ctx, generate: jest.fn(() => Promise.resolve(new Float32Array(22050 * 32))) });
        const sp = R.composeJingle('rumba', 3, { loop: true });
        expect(await player.play(sp, { volume: 40, startedAt: () => 40 })).toBe(true);
        expect(ctx.sources[0].loop).toBe(true);
        expect(ctx.sources[0].start).toHaveBeenCalledWith(0, 8);
    });
    test('cap estil falla en compondre un bucle (abans fallava 1 de cada 6 rumbes)', () => {
        for (const st of R.JINGLES.map(j => j.id)) {
            for (let seed = 1; seed <= 1500; seed++) {
                const sp = R.composeJingle(st, seed, { loop: true });
                expect(sp.chords.length * sp.beat * 4).toBeCloseTo(R.MELODY_SECONDS, 6);
                expect(sp.degrees[sp.degrees.length - 1]).toBe(4);
            }
        }
    });
});

describe('historial ordenat', () => {
    const day = 86400000, now = new Date(2026, 10, 7, 18, 0).getTime();
    const e = (seed, at, fav) => ({ where: 'lliga', style: 'funk', seed, loop: true, at, fav: !!fav });
    test('les 5 darreres a la vista, les preferides i l’arxiu per dies, cada peça en un sol lloc', () => {
        const list = [e(1, now), e(2, now - 1), e(3, now - 2), e(4, now - 3), e(5, now - 4, true),
            e(6, now - 5, true), e(7, now - 6), e(8, now - day), e(9, now - 3 * day), e(10, now - 3 * day - 1)];
        const g = R.registryGroups(list, now);
        expect(g.latest.map(x => x.seed)).toEqual([1, 2, 3, 4, 5]);
        expect(g.favs.map(x => x.seed)).toEqual([6]);
        expect(g.days.map(d => [d.label, d.items.map(x => x.seed)])).toEqual([
            ['Avui', [7]], ['Ahir', [8]], [null, [9, 10]]]);
        expect(g.days[2].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(R.registryGroups([], now)).toEqual({ latest: [], favs: [], days: [] });
    });
});

describe('baixada en MP3', () => {
    test('quatre voltes del bucle i un esvaïment curt només al final del fitxer', async () => {
        const cycle = new Float32Array(100).fill(0.5);
        const out = await R.exportSamples(R.composeJingle('himne', 4, { loop: true }), { cycles: 4, fadeSeconds: 0.001, generate: () => Promise.resolve(cycle) });
        expect(out.length).toBe(400);
        expect(out[0]).toBe(0.5);
        expect(out[350]).toBe(0.5);
        expect(Math.abs(out[399])).toBeLessThan(0.1);
    });
    test('una tornada antiga també es baixa en bucle', async () => {
        const gen = jest.fn(() => Promise.resolve(new Float32Array(10)));
        await R.exportSamples(R.composeJingle('galop', 4), { generate: gen });
        expect(gen.mock.calls[0][0].loop).toBe(true);
    });
    test('codifica a trossos amb lamejs (mono, 22.050 Hz, 64 kbps) i informa del progrés', async () => {
        const calls = [];
        const lame = { Mp3Encoder: function (ch, rate, kbps) {
            calls.push([ch, rate, kbps]);
            this.encodeBuffer = pcm => new Int8Array(Math.ceil(pcm.length / 10));
            this.flush = () => new Int8Array(3);
        } };
        const progress = [];
        const samples = new Float32Array(1152 * 130).fill(2);   // fora de rang: es retalla
        const parts = await R.encodeMp3(samples, lame, { onProgress: p => progress.push(p) });
        expect(calls).toEqual([[1, 22050, 64]]);
        expect(parts.length).toBe(131);
        expect(progress[progress.length - 1]).toBe(1);
        expect(progress.length).toBeGreaterThan(1);
        await expect(R.encodeMp3(samples, null)).rejects.toThrow('no-encoder');
    });
    test('nom del fitxer llegible i sense caràcters prohibits', () => {
        const name = R.mp3FileName(R.composeJingle('rumba', 123, { loop: true }));
        expect(name).toMatch(/^El Tauler - Rumba de la classificacio - .+ - .+\.mp3$/);
        // Només ASCII: amb accents alguns navegadors el canvien per «download».
        expect(name).toMatch(/^[\x20-\x7e]+$/);
        expect(name).not.toMatch(/[\\/:*?"<>|]/);
        for (const st of R.JINGLES.map(j => j.id)) for (let k = 1; k < 40; k++) expect(R.mp3FileName(R.composeJingle(st, k, { loop: true }))).toMatch(/^[\x20-\x7e]+\.mp3$/);
    });
    test('Configuració té el botó de baixada i l’historial ordenat', () => {
        const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
        const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        expect(app).toMatch(/data-cm-dl=/);
        expect(app).toContain("const LAMEJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';");
        expect(app).toContain('R.registryGroups(list)');
        expect(app).toContain('R.exportSamples(spec, { cycles: 4 })');
        expect(html).toMatch(/<symbol id="ic-download"/);
        // L'MP3 no es carrega amb la pàgina, només quan es baixa una peça.
        expect(html).not.toMatch(/<script[^>]+lame/);
    });
});

describe('«Atura» de Configuració', () => {
    test('atura la prova de veu, la música de fons i la peça composta que s’escolti', () => {
        const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
        expect(app).toContain("$('#tts-stop-preview').off('click').on('click', () => stopSettingsAudioPreview());");
        const fn = app.slice(app.indexOf('function stopSettingsAudioPreview() {'), app.indexOf('function stopReviewTts() {'));
        expect(fn).toContain('stopReviewTts();');
        expect(fn).toContain('coord.stopMusic()');
        expect(fn).toContain('composedPreviewPlayer.stop(true)');
    });
});
