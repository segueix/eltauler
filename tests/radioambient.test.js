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
    test.each(['studio', 'theme', 'tuning'])('el so %s té energia, marge i extrems suaus per repetir-se', sound => {
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
