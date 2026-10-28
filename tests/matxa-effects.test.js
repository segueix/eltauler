const V = require('../veuneural');

function context() {
    const nodes = [];
    const node = kind => {
        const n = { kind, connect: jest.fn(), disconnect: jest.fn() };
        ['frequency', 'Q', 'gain', 'threshold', 'knee', 'ratio', 'attack', 'release'].forEach(k => n[k] = { value: 0 });
        nodes.push(n);
        return n;
    };
    return { nodes, state: 'running', destination: {}, resume: jest.fn(() => Promise.resolve()),
        createMediaElementSource: jest.fn(() => node('source')),
        createBiquadFilter: () => node('filter'), createGain: () => node('gain'),
        createDynamicsCompressor: () => node('compressor') };
}

describe('perfils de so exclusius de Matxa', () => {
    test('normalitza preferències antigues, corruptes i límits, incloent el silenci', () => {
        expect(V.normalizeEffects()).toEqual({ profile: 'natural', intensity: 0.6, clarity: 0.5, volume: 1 });
        expect(V.normalizeEffects({ profile: 'unknown', intensity: 9, clarity: -2, volume: 0 }))
            .toEqual({ profile: 'natural', intensity: 1, clarity: 0, volume: 0 });
        expect(V.normalizeEffects({ intensity: NaN, clarity: Infinity, volume: '0' }))
            .toEqual(V.normalizeEffects());
    });

    test.each([{ profile: 'natural' }, { profile: 'radio', intensity: 0 }])('el so original no passa per filtres: %j', settings => {
        const ctx = context(), fx = V.createAudioEffects({ createContext: () => ctx });
        fx.unlock();
        expect(fx.attach({}, settings)).toBeNull();
        expect(ctx.nodes).toHaveLength(0);
    });

    test('Càlida suavitza aguts i reserva marge per no saturar', () => {
        const ctx = context(), fx = V.createAudioEffects({ createContext: () => ctx });
        fx.unlock();
        const handle = fx.attach({}, { profile: 'warm', intensity: 1, clarity: 1, volume: 0.8 });
        expect(ctx.nodes.filter(n => n.kind === 'filter').map(n => [n.type, n.gain.value]))
            .toEqual([['lowshelf', 3.5], ['highshelf', -3], ['peaking', 3]]);
        expect(ctx.nodes.at(-1).gain.value).toBeCloseTo(0.8 * Math.pow(10, -6.5 / 20));
        expect(ctx.nodes.at(-1).connect).toHaveBeenCalledWith(ctx.destination);
        handle.disconnect();
        ctx.nodes.forEach(n => expect(n.disconnect).toHaveBeenCalledTimes(1));
    });

    test('Ràdio afegeix compressió moderada i el volum zero és silenci', () => {
        const ctx = context(), fx = V.createAudioEffects({ createContext: () => ctx });
        fx.unlock();
        fx.attach({}, { profile: 'radio', intensity: 0.6, volume: 0 });
        const compressor = ctx.nodes.find(n => n.kind === 'compressor');
        expect(compressor.ratio.value).toBe(2.5);
        expect(compressor.threshold.value).toBeCloseTo(-14.4);
        expect(ctx.nodes.at(-1).gain.value).toBe(0);
    });

    test.each(['unsupported', 'suspended', 'resume-rejected'])('si Web Audio no està disponible es conserva la reproducció: %s', mode => {
        const ctx = context();
        ctx.state = 'suspended';
        if (mode === 'resume-rejected') ctx.resume.mockImplementation(() => Promise.reject(new Error('blocked')));
        const fx = V.createAudioEffects({ createContext: () => mode === 'unsupported' ? null : ctx });
        fx.unlock();
        const audio = {};
        expect(fx.attach(audio, { profile: 'radio', volume: 0.7 })).toBeNull();
        expect(audio.volume).toBe(0.7);
        expect(ctx.nodes).toHaveLength(0);
    });

    test('comparteix el context i pot reactivar-lo després de suspendre’s', () => {
        const ctx = context(), createContext = jest.fn(() => ctx);
        const fx = V.createAudioEffects({ createContext });
        fx.unlock(); fx.unlock(); ctx.state = 'suspended'; fx.unlock();
        expect(createContext).toHaveBeenCalledTimes(1);
        expect(ctx.resume).toHaveBeenCalledTimes(1);
    });
});

describe('reproducció amb filtres, memòria cau i errors', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    function setup(ctx) {
        const audios = [], synthesize = jest.fn(async () => 'https://audio.test/voice.wav');
        const sp = V.createNeuralSpeaker({ client: { synthesize },
            createAudioContext: () => ctx, isOnline: () => true,
            fetchAudio: async () => 'blob:voice', releaseSrc: () => {},
            createAudio: src => {
                const a = { src, play: jest.fn(() => Promise.resolve()), pause: jest.fn() };
                audios.push(a); return a;
            } });
        return { sp, audios, synthesize };
    }
    test.each(['end', 'stop', 'error'])('desconnecta els filtres quan acaba: %s', async reason => {
        const ctx = context(), { sp, audios } = setup(ctx);
        const p = sp.speak('Escac.', V.DEFAULT_VOICE_ID, { effects: { profile: 'radio' } });
        await jest.advanceTimersByTimeAsync(1);
        if (reason === 'end') audios[0].onended();
        else if (reason === 'error') audios[0].onerror();
        else sp.stop();
        expect((await p).spoken).toBe(reason === 'end');
        ctx.nodes.forEach(n => expect(n.disconnect).toHaveBeenCalledTimes(1));
        expect(audios[0].pause).toHaveBeenCalled();
    });

    test('una connexió que falla recrea l’àudio original sense perdre la locució', async () => {
        const ctx = context(), create = ctx.createMediaElementSource;
        ctx.createMediaElementSource = jest.fn(audio => {
            const n = create(audio); n.connect.mockImplementation(() => { throw new Error('not supported'); }); return n;
        });
        const { sp, audios } = setup(ctx);
        const p = sp.speak('Escac.', V.DEFAULT_VOICE_ID, { effects: { profile: 'radio', volume: 0.8 } });
        await jest.advanceTimersByTimeAsync(1);
        expect(audios).toHaveLength(2);
        expect(audios[0].play).not.toHaveBeenCalled();
        expect(audios[1].volume).toBe(0.8);
        expect(audios[1].play).toHaveBeenCalledTimes(1);
        ctx.nodes.forEach(n => expect(n.disconnect).toHaveBeenCalledTimes(1));
        audios[1].onended();
        await expect(p).resolves.toEqual({ spoken: true, reason: 'end' });
    });

    test('canviar de perfil reutilitza el WAV i aplica filtres nous', async () => {
        const ctx = context(), { sp, audios, synthesize } = setup(ctx);
        for (const profile of ['natural', 'warm', 'radio']) {
            const p = sp.speak('Escac.', V.DEFAULT_VOICE_ID, { effects: { profile } });
            await jest.advanceTimersByTimeAsync(1);
            audios.at(-1).onended(); await p;
        }
        expect(synthesize).toHaveBeenCalledTimes(1);
        expect(audios).toHaveLength(3);
        expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(2);
    });
});
