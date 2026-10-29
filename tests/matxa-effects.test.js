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

const FLAT = { low: 0, lowmid: 0, mid: 0, presence: 0, high: 0 };

describe('Ràdio, l’únic perfil de so de Matxa, i l’equalitzador', () => {
    test('normalitza preferències antigues, corruptes i límits, incloent el silenci', () => {
        expect(V.AUDIO_PROFILES.map(p => p.id)).toEqual(['radio']);
        expect(V.normalizeEffects()).toEqual({ profile: 'radio', intensity: 0.6, clarity: 0.5, volume: 1, eq: FLAT });
        expect(V.normalizeEffects({ profile: 'unknown', intensity: 9, clarity: -2, volume: 0 }))
            .toEqual({ profile: 'radio', intensity: 1, clarity: 0, volume: 0, eq: FLAT });
        expect(V.normalizeEffects({ intensity: NaN, clarity: Infinity, volume: '0' }))
            .toEqual(V.normalizeEffects());
    });

    test.each(['natural', 'warm'])('el perfil antic %s es llegeix com a Ràdio', profile => {
        expect(V.normalizeEffects({ profile, intensity: 0.3 })).toMatchObject({ profile: 'radio', intensity: 0.3 });
    });

    test('l’equalitzador té cinc bandes de -12 a +12 dB, en passos d’1 dB', () => {
        expect(V.EQ_BANDS.map(b => [b.id, b.type, b.frequency])).toEqual([
            ['low', 'lowshelf', 120], ['lowmid', 'peaking', 400], ['mid', 'peaking', 1200],
            ['presence', 'peaking', 3000], ['high', 'highshelf', 7500]]);
        expect(V.normalizeEq({ low: 30, lowmid: -40, mid: 2.6, presence: 'x', high: NaN, extra: 5 }))
            .toEqual({ low: 12, lowmid: -12, mid: 3, presence: 0, high: 0 });
        expect([V.formatDb(4), V.formatDb(-3), V.formatDb(0)]).toEqual(['+4 dB', '−3 dB', '0 dB']);
    });

    test.each([{ intensity: 0 }, { profile: 'natural', intensity: 0, eq: { low: 0 } }])('sense filtre, equalitzador pla ni volum, no hi ha cap node: %j', settings => {
        const ctx = context(), fx = V.createAudioEffects({ createContext: () => ctx });
        fx.unlock();
        expect(fx.attach({}, settings)).toBeNull();
        expect(ctx.nodes).toHaveLength(0);
    });

    test('Ràdio fa la veu present, comprimeix i reserva marge per no saturar', () => {
        const ctx = context(), fx = V.createAudioEffects({ createContext: () => ctx });
        fx.unlock();
        const handle = fx.attach({}, { profile: 'warm', intensity: 1, clarity: 1, volume: 0.8 });
        expect(ctx.nodes.filter(n => n.kind === 'filter').map(n => [n.type, n.gain.value]))
            .toEqual([['lowshelf', 1.5], ['highshelf', -0.5], ['peaking', 4.5], ['highpass', 0]]);
        expect(ctx.nodes.filter(n => n.kind === 'compressor')).toHaveLength(1);
        expect(ctx.nodes.at(-1).gain.value).toBeCloseTo(0.8 * Math.pow(10, -6 / 20));
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

    test('l’equalitzador va després del compressor, amb les cinc bandes, i en descompta el guany màxim', () => {
        const ctx = context(), fx = V.createAudioEffects({ createContext: () => ctx });
        fx.unlock();
        fx.attach({}, { intensity: 0.6, clarity: 0.5, volume: 1, eq: { low: 6, presence: -4, high: 3 } });
        const kinds = ctx.nodes.map(n => n.kind);
        const eqNodes = ctx.nodes.slice(kinds.indexOf('compressor') + 1, -1);
        expect(eqNodes.map(n => [n.type, n.frequency.value, n.gain.value])).toEqual([
            ['lowshelf', 120, 6], ['peaking', 400, 0], ['peaking', 1200, 0], ['peaking', 3000, -4], ['highshelf', 7500, 3]]);
        // Marge del perfil Ràdio (0,9 + 0,9 dB) més la banda més alta (+6 dB).
        expect(ctx.nodes.at(-1).gain.value).toBeCloseTo(Math.pow(10, -(0.9 + 0.9 + 6) / 20));
    });

    test('amb el filtre a zero, l’equalitzador funciona sol', () => {
        const ctx = context(), fx = V.createAudioEffects({ createContext: () => ctx });
        fx.unlock();
        fx.attach({}, { intensity: 0, eq: { mid: -5 } });
        expect(ctx.nodes.map(n => n.kind)).toEqual(['source', 'filter', 'filter', 'filter', 'filter', 'filter', 'gain']);
        expect(ctx.nodes.at(-1).gain.value).toBe(1);
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

    test('canviar els ajustos reutilitza el WAV i aplica filtres nous', async () => {
        const ctx = context(), { sp, audios, synthesize } = setup(ctx);
        for (const effects of [{ intensity: 0 }, { intensity: 0.6 }, { intensity: 0, eq: { low: 4 } }]) {
            const p = sp.speak('Escac.', V.DEFAULT_VOICE_ID, { effects });
            await jest.advanceTimersByTimeAsync(1);
            audios.at(-1).onended(); await p;
        }
        expect(synthesize).toHaveBeenCalledTimes(1);
        expect(audios).toHaveLength(3);
        expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(2);
    });

    test('després d’una fallada, force hi torna a provar abans del minut i un èxit acaba la pausa', async () => {
        let now = 1000;
        const audios = [], synthesize = jest.fn()
            .mockRejectedValueOnce(new Error('sleeping'))
            .mockResolvedValue('https://audio.test/voice.wav');
        const sp = V.createNeuralSpeaker({ client: { synthesize }, now: () => now, isOnline: () => true,
            fetchAudio: async () => 'blob:voice', releaseSrc: () => {},
            audioEffects: { unlock() {}, attach: () => null },
            createAudio: src => { const a = { src, play: jest.fn(() => Promise.resolve()), pause: jest.fn() }; audios.push(a); return a; } });
        const first = await sp.speak('Escac.', V.DEFAULT_VOICE_ID);
        expect(first).toEqual({ spoken: false, reason: 'network' });
        expect(sp.available()).toBe(false);
        now += 5000;
        expect(await sp.speak('Escac.', V.DEFAULT_VOICE_ID)).toEqual({ spoken: false, reason: 'unavailable' });
        const forced = sp.speak('Escac.', V.DEFAULT_VOICE_ID, { force: true });
        await jest.advanceTimersByTimeAsync(1);
        audios[0].onended();
        expect(await forced).toEqual({ spoken: true, reason: 'end' });
        expect(sp.available()).toBe(true);
    });

    test('force no prova res sense connexió', async () => {
        const synthesize = jest.fn();
        const sp = V.createNeuralSpeaker({ client: { synthesize }, isOnline: () => false });
        expect(await sp.speak('Escac.', V.DEFAULT_VOICE_ID, { force: true })).toEqual({ spoken: false, reason: 'unavailable' });
        expect(synthesize).not.toHaveBeenCalled();
    });
});
