const R = require('../radioambient');
function context(state = 'running') {
    const sources = [], gains = [];
    const ctx = { state, sampleRate: 48000, currentTime: 1, destination: {}, sources, gains,
        resume: jest.fn(async () => { ctx.state = 'running'; }), close: jest.fn(async () => { ctx.state = 'closed'; }),
        createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
        createBufferSource() { const s = { connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn() }; sources.push(s); return s; },
        createGain() { const g = { connect: jest.fn(), disconnect: jest.fn(), gain: { value: 1, setTargetAtTime: jest.fn() } }; gains.push(g); return g; }
    };
    return ctx;
}
const enabled = { matxa: true, profile: 'radio', voiceOn: true, engine: 'neural', open: true, visible: true, hidden: false, paused: false, error: null };

describe('preferències i activació exclusives de Matxa Ràdio', () => {
    test('apagat per defecte, volum limitat i zero conservat', () => {
        expect(R.normalize()).toEqual({ sound: 'off', volume: 20 });
        expect(R.normalize({ sound: 'theme', volume: 0 })).toEqual({ sound: 'theme', volume: 0 });
        expect(R.normalize({ sound: 'invalid', volume: 200 })).toEqual({ sound: 'off', volume: 100 });
        expect(R.normalize({ sound: 'studio', volume: NaN }).volume).toBe(20);
    });
    test('només sona amb la TV visible i en marxa i la veu Matxa Ràdio activa', () => {
        expect(R.canPlay(enabled)).toBe(true);
    });
    test.each([
        { matxa: false }, { profile: 'natural' }, { profile: 'warm' }, { voiceOn: false },
        { engine: 'system' }, { open: false }, { visible: false }, { hidden: true },
        { paused: true }, { error: 'engine' }, { blocked: true }
    ])('silenci quan canvia una condició: %j', patch => {
        expect(R.canPlay({ ...enabled, ...patch })).toBe(false);
    });
});

describe('generació i reproducció sense xarxa', () => {
    test.each(['studio', 'tuning'])('el so %s té energia, marge i extrems suaus per repetir-se', sound => {
        let seed = 7;
        const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const data = R.samples(sound, 22050, random);
        expect(data).toHaveLength(352800);
        expect(Math.abs(data[0])).toBe(0);
        expect(Math.abs(data[data.length - 1])).toBe(0);
        let sum = 0, peak = 0;
        for (const sample of data) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
        expect(Number.isFinite(sum)).toBe(true);
        expect(sum / data.length).toBeGreaterThan(0.0001);
        expect(peak).toBeLessThanOrEqual(0.8);
    });
    describe('sintonia suau: música de fons per a la ràdio', () => {
        let data;
        beforeAll(() => {
            let seed = 11;
            const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
            data = R.samples('theme', 22050, random);
        });
        test('vuit compassos (32 s) que es repeteixen sense cap salt ni silenci', () => {
            expect(data).toHaveLength(22050 * R.THEME_SECONDS);
            expect(R.THEME_SECONDS).toBe(32);
            // El bucle és circular: l'últim sample enllaça amb el primer.
            expect(Math.abs(data[data.length - 1] - data[0])).toBeLessThan(0.05);
            let jump = 0;
            for (let i = 1; i < data.length; i++) jump = Math.max(jump, Math.abs(data[i] - data[i - 1]));
            expect(jump).toBeLessThan(0.35);
            // Cap segon en silenci: sempre hi ha música sota la veu.
            for (let s = 0; s < R.THEME_SECONDS; s++) {
                let sum = 0;
                for (let i = s * 22050; i < (s + 1) * 22050; i++) sum += data[i] * data[i];
                expect(Math.sqrt(sum / 22050)).toBeGreaterThan(0.02);
            }
        });
        test('té marge i se sent en altaveus petits (la major part per sobre de 300 Hz)', () => {
            let sum = 0, peak = 0, high = 0, y = 0, prev = 0;
            const a = Math.exp(-2 * Math.PI * 300 / 22050);
            for (const x of data) {
                sum += x * x; peak = Math.max(peak, Math.abs(x));
                y = a * (y + x - prev); prev = x; high += y * y;
            }
            expect(peak).toBeLessThanOrEqual(0.8);
            expect(Math.sqrt(sum / data.length)).toBeGreaterThan(0.06);
            expect(high / sum).toBeGreaterThan(0.5);
        });
    });
    test('la sintonia té més marge que l’aire filtrat i baixa mentre parla la veu', () => {
        const ctx = context(), player = R.createPlayer({ createContext: () => ctx, random: () => 0.5 });
        player.update({ sound: 'theme', volume: 50 }, true); player.unlock();
        const gain = ctx.gains[0].gain.setTargetAtTime;
        expect(gain).toHaveBeenLastCalledWith(0.5 * R.LEVELS.theme, 1, 0.08);
        player.duck(true);
        expect(gain).toHaveBeenLastCalledWith(0.5 * R.LEVELS.theme * R.DUCK, 1, 0.12);
        player.duck(true);
        expect(gain).toHaveBeenCalledTimes(2);
        player.duck(false);
        expect(gain).toHaveBeenLastCalledWith(0.5 * R.LEVELS.theme, 1, 0.6);
        // Baixar el fons no crea cap altre bucle.
        expect(ctx.sources).toHaveLength(1);
        player.dispose();
    });
    test('cap context sense activació i un sol bucle en canviar el volum', () => {
        const ctx = context(), createContext = jest.fn(() => ctx), player = R.createPlayer({ createContext });
        player.update({ sound: 'studio', volume: 20 }, true);
        expect(createContext).not.toHaveBeenCalled();
        player.unlock();
        expect(ctx.sources).toHaveLength(1);
        expect(ctx.sources[0].loop).toBe(true);
        expect(player.status()).toBe('playing');
        player.update({ sound: 'studio', volume: 65 }, true);
        expect(ctx.sources).toHaveLength(1);
        expect(ctx.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.65 * 0.18, 1, 0.08);
        player.dispose();
        expect(ctx.sources[0].stop).toHaveBeenCalledTimes(1);
        expect(ctx.close).toHaveBeenCalledTimes(1);
    });
    test('canviar de so desconnecta l’anterior i silenciar o pausar elimina el bucle', () => {
        const ctx = context(), player = R.createPlayer({ createContext: () => ctx });
        player.update({ sound: 'studio' }, true); player.unlock();
        player.update({ sound: 'theme', volume: 50 }, true);
        expect(ctx.sources).toHaveLength(2);
        expect(ctx.sources[0].stop).toHaveBeenCalledTimes(1);
        expect(ctx.gains[0].disconnect).toHaveBeenCalledTimes(1);
        player.update({ sound: 'theme', volume: 0 }, true);
        expect(ctx.sources[1].stop).toHaveBeenCalledTimes(1);
        expect(player.status()).toBe('off');
        player.update({ sound: 'theme', volume: 20 }, true);
        expect(ctx.sources).toHaveLength(3);
        player.update({ sound: 'theme', volume: 20 }, false);
        expect(ctx.sources[2].stop).toHaveBeenCalledTimes(1);
        expect(player.status()).toBe('off');
    });
    test.each(['off', 'pause', 'dispose'])('reprendre el context tard no ressuscita el so després de %s', async action => {
        const ctx = context('suspended');
        let finishResume;
        ctx.resume = jest.fn(() => new Promise(resolve => { finishResume = () => { ctx.state = 'running'; resolve(); }; }));
        const player = R.createPlayer({ createContext: () => ctx });
        player.update({ sound: 'theme', volume: 20 }, true); player.unlock();
        if (action === 'dispose') player.dispose();
        else player.update({ sound: action === 'off' ? 'off' : 'theme', volume: 20 }, action !== 'pause');
        finishResume(); await Promise.resolve(); await Promise.resolve();
        expect(ctx.sources).toHaveLength(0);
        expect(player.status()).toBe('off');
    });
    test('un error de Web Audio queda aïllat i no reintenta cada render', () => {
        const ctx = context(); ctx.createBuffer = jest.fn(() => { throw new Error('audio unavailable'); });
        const player = R.createPlayer({ createContext: () => ctx });
        player.update({ sound: 'theme' }, true); player.unlock();
        expect(player.status()).toBe('unavailable');
        expect(ctx.sources[0].disconnect).toHaveBeenCalledTimes(1);
        player.update({ sound: 'theme' }, true);
        expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    });
    test('un navegador sense Web Audio no llança errors', () => {
        const player = R.createPlayer();
        player.update({ sound: 'theme' }, true);
        expect(() => player.unlock()).not.toThrow();
        expect(player.status()).toBe('unavailable');
    });
    test('una negativa a reprendre l’àudio no deixa una promesa rebutjada sense gestionar', async () => {
        const ctx = context('suspended'); ctx.resume.mockRejectedValue(new Error('not allowed'));
        const player = R.createPlayer({ createContext: () => ctx });
        player.update({ sound: 'theme' }, true); player.unlock();
        await Promise.resolve(); await Promise.resolve();
        expect(player.status()).toBe('unavailable');
        expect(ctx.sources).toHaveLength(0);
    });
});
