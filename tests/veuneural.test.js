// Veus neuronals Matxa (veuneural.js): protocol Gradio de la demo del BSC
// (amb fetch SIMULAT: aquí no hi ha xarxa) i reproductor sense cues, amb
// memòria cau, temps màxim i pausa de seguretat quan el servei falla.
const V = require('../veuneural');

function sseResponse(events) {
    const body = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('');
    return { ok: true, status: 200, text: async () => body, body: null };
}

// Servidor Gradio fals: recorda les peticions i respon com la demo real.
function fakeGradio(opts) {
    const o = opts || {};
    const log = [];
    let seq = 0;
    const pending = {};
    const fetchFn = async (url, init) => {
        log.push({ url, body: init && init.body ? JSON.parse(init.body) : null });
        if (o.offline) throw new Error('offline');
        if (url.indexOf('/gradio_api/queue/join') !== -1) {
            const b = JSON.parse(init.body);
            const id = 'ev' + (++seq);
            pending[b.session_hash] = { id, body: b };
            return { ok: true, status: 200, json: async () => ({ event_id: id }) };
        }
        if (url.indexOf('/gradio_api/queue/data') !== -1) {
            const sh = decodeURIComponent(url.split('session_hash=')[1]);
            const job = pending[sh];
            if (job.body.fn_index === 3) {
                return sseResponse([{ msg: 'estimation' }, { msg: 'process_completed', event_id: job.id, success: true, output: { data: [{ choices: [] }] } }]);
            }
            const fail = typeof o.failPredict === 'function' ? o.failPredict(job) : false;
            return sseResponse([{ msg: 'process_starts', event_id: job.id },
                fail ? { msg: 'process_completed', event_id: job.id, success: false, output: { error: 'x' } }
                    : { msg: 'process_completed', event_id: job.id, success: true, output: { data: [{ url: 'https://x.hf.space/gradio_api/file=/tmp/' + job.id + '.wav' }] } },
                { msg: 'close_stream' }]);
        }
        throw new Error('url ' + url);
    };
    return { fetchFn, log };
}

describe('veus i paràmetres', () => {
    test('vuit veus, dues per accent, i identificadors propis', () => {
        expect(V.MATXA_VOICES).toHaveLength(8);
        ['central', 'nord-occidental', 'valencia', 'balear'].forEach(a => expect(V.MATXA_VOICES.filter(v => v.accent === a)).toHaveLength(2));
        expect(V.isNeuralVoiceId('matxa:central:elia')).toBe(true);
        expect(V.isNeuralVoiceId('Google català')).toBe(false);
        expect(V.voiceLabel('matxa:valencia:lluc')).toBe('Matxa · Lluc (valencià)');
        expect(V.voiceById(V.DEFAULT_VOICE_ID).speaker).toBe('elia');
    });

    test('la velocitat es converteix en durada de Matxa dins del rang admès', () => {
        expect(V.lengthScaleForRate(1)).toBe(0.89);
        expect(V.lengthScaleForRate(0.5)).toBe(1.1);
        expect(V.lengthScaleForRate(2)).toBe(0.8);
        expect(V.lengthScaleForRate(undefined)).toBe(0.89);
    });

    test('parseSse separa esdeveniments i guarda el tros incomplet', () => {
        const r = V.parseSse('data: {"msg":"a"}\n\ndata: {"msg":"b"}\n\ndata: {"ms');
        expect(r.events.map(e => e.msg)).toEqual(['a', 'b']);
        expect(r.rest).toBe('data: {"ms');
    });
});

describe('client Gradio de Matxa (fetch simulat)', () => {
    test('primer fixa l\'accent a la sessió i després sintetitza amb la mateixa sessió', async () => {
        const g = fakeGradio();
        const client = V.createMatxaClient({ fetch: g.fetchFn, baseUrl: 'https://x.hf.space' });
        const url = await client.synthesize('Escac al rei negre.', 'matxa:central:grau', { rate: 1 });
        expect(url).toMatch(/\.wav$/);
        const joins = g.log.filter(l => l.url.indexOf('/queue/join') !== -1).map(l => l.body);
        expect(joins[0]).toEqual(expect.objectContaining({ fn_index: 3, data: ['central'] }));
        expect(joins[1]).toEqual(expect.objectContaining({ fn_index: 0, data: ['Escac al rei negre.', 'central', 'grau', 0.2, 0.89] }));
        expect(joins[0].session_hash).toBe(joins[1].session_hash);
        // La sessió ja té l'accent: la segona frase no el torna a demanar.
        await client.synthesize('Altra frase.', 'matxa:central:elia');
        expect(g.log.filter(l => l.url.indexOf('/queue/join') !== -1)).toHaveLength(3);
    });

    test('sessió caducada: es refà una vegada; si torna a fallar, error', async () => {
        let n = 0;
        const g = fakeGradio({ failPredict: () => (++n === 1) });
        const client = V.createMatxaClient({ fetch: g.fetchFn, baseUrl: 'https://x.hf.space' });
        await expect(client.synthesize('Hola.', 'matxa:balear:quim')).resolves.toMatch(/\.wav$/);
        const sessions = new Set(g.log.filter(l => l.body).map(l => l.body.session_hash));
        expect(sessions.size).toBe(2);
        const always = V.createMatxaClient({ fetch: fakeGradio({ failPredict: () => true }).fetchFn, baseUrl: 'https://x.hf.space' });
        await expect(always.synthesize('Hola.', 'matxa:balear:quim')).rejects.toThrow();
    });

    test('veu desconeguda o text buit: error immediat', async () => {
        const client = V.createMatxaClient({ fetch: fakeGradio().fetchFn });
        await expect(client.synthesize('Hola', 'matxa:x:y')).rejects.toThrow('voice');
        await expect(client.synthesize('   ', 'matxa:central:elia')).rejects.toThrow('empty');
    });
});

// Àudio fals: play() comença; ended() l'acaba.
function fakeAudioFactory() {
    const created = [];
    const createAudio = (src) => {
        const a = { src, paused: true, onended: null, onerror: null,
            play() { a.paused = false; return Promise.resolve(); }, pause() { a.paused = true; },
            end() { if (a.onended) a.onended(); } };
        created.push(a);
        return a;
    };
    return { created, createAudio };
}

describe('reproductor neuronal', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function speaker(clientImpl, extra) {
        const audio = fakeAudioFactory();
        const sp = V.createNeuralSpeaker(Object.assign({
            client: clientImpl,
            createAudio: audio.createAudio,
            fetchAudio: async (url) => 'blob:' + url,
            releaseSrc: () => {},
            isOnline: () => true
        }, extra || {}));
        return { sp, audio };
    }

    test('parla, acaba i memoritza: preparar per endavant no sintetitza dues vegades', async () => {
        const calls = [];
        const client = { synthesize: async (t, id, o) => { calls.push([t, id, o.rate]); return 'https://x/' + calls.length + '.wav'; } };
        const { sp, audio } = speaker(client);
        sp.prefetch('Escac al rei negre.', 'matxa:central:elia', { rate: 1 });
        const p = sp.speak('Escac al rei negre.', 'matxa:central:elia', { rate: 1 });
        await jest.advanceTimersByTimeAsync(1);
        expect(calls).toHaveLength(1);
        expect(audio.created).toHaveLength(1);
        expect(audio.created[0].src).toBe('blob:https://x/1.wav');
        audio.created[0].end();
        await expect(p).resolves.toEqual({ spoken: true, reason: 'end' });
    });

    test('mai no s\'acumulen locucions i aturar és immediat', async () => {
        const client = { synthesize: async (t) => 'https://x/' + encodeURIComponent(t) };
        const { sp, audio } = speaker(client);
        const a = sp.speak('Primera.', 'matxa:central:elia');
        await jest.advanceTimersByTimeAsync(1);
        const b = sp.speak('Segona.', 'matxa:central:elia');
        await expect(a).resolves.toEqual({ spoken: false, reason: 'stopped' });
        expect(audio.created[0].paused).toBe(true);
        await jest.advanceTimersByTimeAsync(1);
        expect(sp.isSpeaking()).toBe(true);
        sp.stop();
        await expect(b).resolves.toEqual({ spoken: false, reason: 'stopped' });
        expect(audio.created[1].paused).toBe(true);
        expect(sp.isSpeaking()).toBe(false);
    });

    test('servei caigut: falla de seguida, i durant un minut no s\'hi torna a provar', async () => {
        const client = { synthesize: async () => { throw new Error('down'); } };
        const { sp } = speaker(client);
        await expect(sp.speak('Hola.', 'matxa:central:elia')).resolves.toEqual({ spoken: false, reason: 'network' });
        expect(sp.available()).toBe(false);
        await expect(sp.speak('Hola.', 'matxa:central:elia')).resolves.toEqual({ spoken: false, reason: 'unavailable' });
        jest.advanceTimersByTime(V.MATXA_CONFIG.COOLDOWN_MS + 1);
        expect(sp.available()).toBe(true);
    });

    test('síntesi penjada: el temps màxim la talla', async () => {
        const client = { synthesize: () => new Promise(() => {}) };
        const { sp } = speaker(client);
        const p = sp.speak('Hola.', 'matxa:central:elia', { maxWaitMs: 5000 });
        jest.advanceTimersByTime(5000);
        await expect(p).resolves.toEqual({ spoken: false, reason: 'timeout' });
    });

    test('sense connexió: no s\'intenta', async () => {
        const client = { synthesize: jest.fn() };
        const { sp } = speaker(client, { isOnline: () => false });
        expect(sp.available()).toBe(false);
        await expect(sp.speak('Hola.', 'matxa:central:elia')).resolves.toEqual({ spoken: false, reason: 'unavailable' });
        expect(client.synthesize).not.toHaveBeenCalled();
    });

    test('la memòria cau té un límit', async () => {
        const client = { synthesize: async (t) => 'https://x/' + t };
        const { sp } = speaker(client);
        for (let i = 0; i < V.MATXA_CONFIG.CACHE_SIZE + 10; i++) sp.prefetch('frase ' + i, 'matxa:central:elia');
        await jest.advanceTimersByTimeAsync(1);
        expect(sp._cache.size).toBe(V.MATXA_CONFIG.CACHE_SIZE);
    });
});
