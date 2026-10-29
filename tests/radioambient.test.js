const R = require('../radioambient');
function context(state = 'running') {
    const sources = [], gains = [];
    const ctx = { state, sampleRate: 48000, currentTime: 1, destination: {}, sources, gains,
        resume: jest.fn(async () => { ctx.state = 'running'; }), close: jest.fn(async () => { ctx.state = 'closed'; }),
        createBuffer: jest.fn((channels, length) => ({ length, getChannelData: () => new Float32Array(length) })),
        createBufferSource() { const s = { connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn() }; sources.push(s); return s; },
        createGain() { const g = { connect: jest.fn(), disconnect: jest.fn(), gain: { value: 1, setTargetAtTime: jest.fn() } }; gains.push(g); return g; }
    };
    return ctx;
}
const seeded = (seed = 11) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const enabled = { matxa: true, profile: 'radio', voiceOn: true, engine: 'neural', open: true, visible: true, hidden: false, paused: false, error: null };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('preferències i activació exclusives de Matxa Ràdio', () => {
    test('apagat per defecte, volum limitat i zero conservat', () => {
        expect(R.normalize()).toEqual({ sound: 'off', volume: 20 });
        expect(R.normalize({ sound: 'music', volume: 0 })).toEqual({ sound: 'music', volume: 0 });
        expect(R.normalize({ sound: 'invalid', volume: 200 })).toEqual({ sound: 'off', volume: 100 });
        expect(R.normalize({ sound: 'music', volume: NaN }).volume).toBe(20);
    });
    test.each(['studio', 'tuning', 'theme'])('el so antic %s ara vol dir música de fons', sound => {
        expect(R.normalize({ sound, volume: 35 })).toEqual({ sound: 'music', volume: 35 });
    });
    test('només sona amb la TV visible i en marxa i la veu Matxa Ràdio activa', () => {
        expect(R.canPlay(enabled)).toBe(true);
    });
    test.each([
        { matxa: false }, { profile: 'natural' }, { voiceOn: false },
        { engine: 'system' }, { open: false }, { visible: false }, { hidden: true },
        { paused: true }, { error: 'engine' }, { blocked: true }
    ])('silenci quan canvia una condició: %j', patch => {
        expect(R.canPlay({ ...enabled, ...patch })).toBe(false);
    });
});

describe('cinc melodies, una a l’atzar a cada partida', () => {
    test('la sintonia suau i quatre melodies noves, una d’estil oriental', () => {
        expect(R.MELODIES.map(m => m.id)).toEqual(['theme', 'oriental', 'bossa', 'vals', 'capvespre']);
        expect(R.melodyInfo('oriental').name).toBe('Jardí oriental');
        expect(R.melodyId('studio')).toBe('theme');
        expect(R.MELODY_SECONDS).toBe(32);
    });
    test('l’oriental fa servir només l’escala pentatònica japonesa in (re · mi♭ · sol · la · si♭)', () => {
        const allowed = new Set([2, 3, 7, 9, 10]);
        const { koto, flute } = R._scores.oriental;
        const notes = koto.flat().map(([, n]) => n).concat(flute.map(([, , n]) => n));
        expect(notes.length).toBeGreaterThan(60);
        notes.forEach(n => expect(allowed.has(n % 12)).toBe(true));
    });
    test('a l’atzar, totes surten i mai no es repeteix la de la partida anterior', () => {
        const random = seeded(5), seen = new Set();
        let previous = null;
        for (let i = 0; i < 200; i++) {
            const next = R.pickMelody(random, previous);
            expect(next).not.toBe(previous);
            seen.add(next); previous = next;
        }
        expect([...seen].sort()).toEqual(R.MELODIES.map(m => m.id).sort());
        expect(R.pickMelody(() => 0.999, null)).toBe('capvespre');
        expect(R.pickMelody(() => 0, 'theme')).toBe('oriental');
    });

    describe.each(R.MELODIES.map(m => m.id))('%s', melody => {
        let data;
        beforeAll(() => { data = R.samples(melody, 22050, seeded()); });
        test('32 s que es repeteixen sense cap salt ni silenci', () => {
            expect(data).toHaveLength(22050 * 32);
            // El bucle és circular: l'últim sample enllaça amb el primer.
            expect(Math.abs(data[data.length - 1] - data[0])).toBeLessThan(0.05);
            let jump = 0;
            for (let i = 1; i < data.length; i++) jump = Math.max(jump, Math.abs(data[i] - data[i - 1]));
            expect(jump).toBeLessThan(0.35);
            // Cap segon en silenci: sempre hi ha música sota la veu.
            for (let s = 0; s < 32; s++) {
                let sum = 0;
                for (let i = s * 22050; i < (s + 1) * 22050; i++) sum += data[i] * data[i];
                expect(Math.sqrt(sum / 22050)).toBeGreaterThan(0.02);
            }
        });
        test('té marge, el mateix volum que la sintonia i se sent en altaveus petits', () => {
            let sum = 0, peak = 0, high = 0, y = 0, prev = 0;
            const a = Math.exp(-2 * Math.PI * 300 / 22050);
            for (const x of data) {
                sum += x * x; peak = Math.max(peak, Math.abs(x));
                y = a * (y + x - prev); prev = x; high += y * y;
            }
            expect(peak).toBeLessThanOrEqual(0.8);
            const rms = Math.sqrt(sum / data.length);
            expect(rms).toBeGreaterThan(0.095);
            expect(rms).toBeLessThan(0.115);
            expect(high / sum).toBeGreaterThan(0.5);
        });
    });

    test('la generació a trossos dona exactament el mateix i deixa respirar la pantalla', async () => {
        const sync = R.samples('oriental', 22050, seeded(3));
        let slices = 0;
        const data = await R.samplesAsync('oriental', 22050, seeded(3), { budgetMs: 2, later: fn => { slices++; setImmediate(fn); } });
        expect(slices).toBeGreaterThan(3);
        expect(data).toHaveLength(sync.length);
        let diff = 0;
        for (let i = 0; i < sync.length; i++) diff = Math.max(diff, Math.abs(data[i] - sync[i]));
        expect(diff).toBe(0);
    });
    test('una generació cancel·lada s’atura', async () => {
        await expect(R.samplesAsync('vals', 22050, seeded(), { cancelled: () => true })).rejects.toThrow('cancelled');
    });
});

describe('reproducció sense xarxa', () => {
    test('la música baixa mentre parla la veu', () => {
        const ctx = context(), player = R.createPlayer({ createContext: () => ctx, sync: true, random: seeded() });
        player.update({ sound: 'music', volume: 50, melody: 'theme' }, true); player.unlock();
        const gain = ctx.gains[0].gain.setTargetAtTime;
        expect(gain).toHaveBeenLastCalledWith(0.5 * R.LEVEL, 1, 0.08);
        player.duck(true);
        expect(gain).toHaveBeenLastCalledWith(0.5 * R.LEVEL * R.DUCK, 1, 0.12);
        player.duck(true);
        expect(gain).toHaveBeenCalledTimes(2);
        player.duck(false);
        expect(gain).toHaveBeenLastCalledWith(0.5 * R.LEVEL, 1, 0.6);
        // Baixar el fons no crea cap altre bucle.
        expect(ctx.sources).toHaveLength(1);
        player.dispose();
    });
    test('cap context sense activació i un sol bucle en canviar el volum', () => {
        const ctx = context(), createContext = jest.fn(() => ctx), player = R.createPlayer({ createContext, sync: true });
        player.update({ sound: 'music', volume: 20, melody: 'bossa' }, true);
        expect(createContext).not.toHaveBeenCalled();
        player.unlock();
        expect(ctx.sources).toHaveLength(1);
        expect(ctx.sources[0].loop).toBe(true);
        expect(player.status()).toBe('playing');
        expect(player.playing()).toBe('bossa');
        player.update({ sound: 'music', volume: 65 }, true);
        expect(ctx.sources).toHaveLength(1);
        expect(ctx.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.65 * R.LEVEL, 1, 0.08);
        player.dispose();
        expect(ctx.sources[0].stop).toHaveBeenCalledTimes(1);
        expect(ctx.close).toHaveBeenCalledTimes(1);
    });
    test('una partida nova canvia de melodia amb un encadenat suau', () => {
        const ctx = context(), player = R.createPlayer({ createContext: () => ctx, sync: true });
        player.update({ sound: 'music', volume: 40, melody: 'theme' }, true); player.unlock();
        player.update({ sound: 'music', volume: 40, melody: 'oriental' }, true);
        expect(ctx.sources).toHaveLength(2);
        // L'anterior s'apaga i s'atura al cap de mig segon; la nova entra a poc a poc.
        expect(ctx.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.12);
        expect(ctx.sources[0].stop).toHaveBeenCalledWith(1.6);
        expect(ctx.gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.4 * R.LEVEL, 1, 0.5);
        expect(player.playing()).toBe('oriental');
        ctx.sources[0].onended();
        expect(ctx.gains[0].disconnect).toHaveBeenCalledTimes(1);
    });
    test('mentre es calcula la melodia nova continua l’anterior; després entra la nova', async () => {
        const ctx = context(), jobs = {};
        const generate = jest.fn(melody => new Promise(resolve => { jobs[melody] = () => resolve(new Float32Array(10)); }));
        const onChange = jest.fn();
        const player = R.createPlayer({ createContext: () => ctx, generate, onChange });
        player.update({ sound: 'music', volume: 20, melody: 'vals' }, true); player.unlock();
        await flush();
        expect(player.status()).toBe('waiting');
        expect(ctx.sources).toHaveLength(0);
        jobs.vals(); await flush();
        expect(ctx.sources).toHaveLength(1);
        expect(player.playing()).toBe('vals');
        expect(onChange).toHaveBeenCalled();
        player.update({ sound: 'music', volume: 20, melody: 'capvespre' }, true);
        await flush();
        expect(ctx.sources).toHaveLength(1);
        expect(player.playing()).toBe('vals');
        expect(player.melody()).toBe('capvespre');
        jobs.capvespre(); await flush();
        expect(ctx.sources).toHaveLength(2);
        expect(player.playing()).toBe('capvespre');
        expect(generate).toHaveBeenCalledTimes(2);
        player.dispose();
    });
    test('apagar la música durant el càlcul cancel·la la generació pendent', async () => {
        const ctx = context();
        let opts = null;
        const generate = jest.fn((melody, rate, random, o) => { opts = o; return new Promise(() => {}); });
        const player = R.createPlayer({ createContext: () => ctx, generate });
        player.update({ sound: 'music', volume: 20, melody: 'oriental' }, true); player.unlock();
        await flush();
        expect(opts.cancelled()).toBe(false);
        player.dispose();
        expect(opts.cancelled()).toBe(true);
    });
    test('silenciar o pausar elimina el bucle', () => {
        const ctx = context(), player = R.createPlayer({ createContext: () => ctx, sync: true });
        player.update({ sound: 'music', melody: 'theme' }, true); player.unlock();
        player.update({ sound: 'music', volume: 0 }, true);
        expect(ctx.sources[0].stop).toHaveBeenCalledTimes(1);
        expect(player.status()).toBe('off');
        player.update({ sound: 'music', volume: 20 }, true);
        expect(ctx.sources).toHaveLength(2);
        player.update({ sound: 'music', volume: 20 }, false);
        expect(ctx.sources[1].stop).toHaveBeenCalledTimes(1);
        expect(player.status()).toBe('off');
        player.update({ sound: 'off', volume: 20 }, true);
        expect(ctx.sources).toHaveLength(2);
    });
    test.each(['off', 'pause', 'dispose'])('reprendre el context tard no ressuscita el so després de %s', async action => {
        const ctx = context('suspended');
        let finishResume;
        ctx.resume = jest.fn(() => new Promise(resolve => { finishResume = () => { ctx.state = 'running'; resolve(); }; }));
        const player = R.createPlayer({ createContext: () => ctx, sync: true });
        player.update({ sound: 'music', volume: 20 }, true); player.unlock();
        if (action === 'dispose') player.dispose();
        else player.update({ sound: action === 'off' ? 'off' : 'music', volume: 20 }, action !== 'pause');
        finishResume(); await Promise.resolve(); await Promise.resolve();
        expect(ctx.sources).toHaveLength(0);
        expect(player.status()).toBe('off');
    });
    test('un error de Web Audio queda aïllat i no reintenta cada render', () => {
        const ctx = context(); ctx.createBuffer = jest.fn(() => { throw new Error('audio unavailable'); });
        const player = R.createPlayer({ createContext: () => ctx, sync: true });
        player.update({ sound: 'music' }, true); player.unlock();
        expect(player.status()).toBe('unavailable');
        expect(ctx.sources).toHaveLength(0);
        player.update({ sound: 'music' }, true);
        expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    });
    test('si el càlcul de la melodia falla, el fons queda no disponible', async () => {
        const ctx = context();
        const player = R.createPlayer({ createContext: () => ctx, generate: () => Promise.reject(new Error('boom')) });
        player.update({ sound: 'music' }, true); player.unlock();
        await flush();
        expect(player.status()).toBe('unavailable');
    });
    test('un navegador sense Web Audio no llança errors', () => {
        const player = R.createPlayer();
        player.update({ sound: 'music' }, true);
        expect(() => player.unlock()).not.toThrow();
        expect(player.status()).toBe('unavailable');
    });
    test('una negativa a reprendre l’àudio no deixa una promesa rebutjada sense gestionar', async () => {
        const ctx = context('suspended'); ctx.resume.mockRejectedValue(new Error('not allowed'));
        const player = R.createPlayer({ createContext: () => ctx, sync: true });
        player.update({ sound: 'music' }, true); player.unlock();
        await Promise.resolve(); await Promise.resolve();
        expect(player.status()).toBe('unavailable');
        expect(ctx.sources).toHaveLength(0);
    });
});
