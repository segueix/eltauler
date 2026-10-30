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

    test('quan Matxa falla, Google ca-ES-Standard-B parla amb el mateix reproductor', async () => {
        const client = { synthesize: jest.fn(async () => { throw new Error('matxa-offline'); }) };
        const google = { available: () => true, synthesize: jest.fn(async () => 'blob:google-voice') };
        const { sp, audio } = speaker(client, { googleClient: google });
        const p = sp.speak('Escac al rei.', 'matxa:central:elia');
        await jest.advanceTimersByTimeAsync(1);
        expect(google.synthesize).toHaveBeenCalledWith('Escac al rei.', expect.objectContaining({ rate: undefined }));
        expect(audio.created[0].src).toBe('blob:google-voice');
        audio.created[0].end();
        await expect(p).resolves.toEqual({ spoken: true, reason: 'end' });
        expect(sp.available()).toBe(true);
        const second = sp.speak('Una altra jugada.', 'matxa:central:elia');
        await jest.advanceTimersByTimeAsync(1);
        expect(client.synthesize).toHaveBeenCalledTimes(1); // el cooldown evita repetir Matxa
        expect(audio.created[1].src).toBe('blob:google-voice');
        audio.created[1].end();
        await expect(second).resolves.toEqual({ spoken: true, reason: 'end' });
    });

    test('el client Google no exposa credencials i fixa la veu catalana', async () => {
        const fetchFn = jest.fn(async () => ({
            ok: true, headers: { get: () => 'audio/mpeg' },
            blob: async () => new Blob(['mp3'], { type: 'audio/mpeg' })
        }));
        const google = V.createGoogleEmergencyClient({
            fetch: fetchFn, createObjectURL: () => 'blob:cloud'
        });
        expect(V.GOOGLE_EMERGENCY_VOICE).toBe('ca-ES-Standard-B');
        await expect(google.synthesize('Jugada brillant!', { rate: 1.1 })).resolves.toBe('blob:cloud');
        const [url, options] = fetchFn.mock.calls[0];
        expect(url).toBe('/api/google-tts');
        expect(options.body).toContain('"voice":"ca-ES-Standard-B"');
        expect(options.body).toContain('"languageCode":"ca-ES"');
        expect(options.headers).not.toHaveProperty('Authorization');
        expect(options.credentials).toBe('same-origin');
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

// Matxa comença a parlar als primers mil·lisegons: en arrencar el so, molts
// dispositius se'n mengen la primera síl·laba. Es posa silenci al davant.
describe('silenci inicial dels WAV de Matxa', () => {
    // WAV PCM mínim: mono, 1000 Hz, amb mostres de valor 0x11.
    function wav(bits, samples, extraChunk) {
        const block = bits / 8, dataSize = samples * block;
        const extra = extraChunk ? 8 + extraChunk.length : 0;
        const buf = Buffer.alloc(44 + extra + dataSize);
        buf.write('RIFF', 0); buf.writeUInt32LE(36 + extra + dataSize, 4); buf.write('WAVE', 8);
        buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
        buf.writeUInt32LE(1000, 24); buf.writeUInt32LE(1000 * block, 28); buf.writeUInt16LE(block, 32); buf.writeUInt16LE(bits, 34);
        let off = 36;
        if (extraChunk) { buf.write('LIST', off); buf.writeUInt32LE(extraChunk.length, off + 4); extraChunk.copy(buf, off + 8); off += extra; }
        buf.write('data', off); buf.writeUInt32LE(dataSize, off + 4); buf.fill(0x11, off + 8);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    test('la configuració hi posa 250 ms', () => {
        expect(V.MATXA_CONFIG.LEAD_IN_MS).toBe(250);
    });
    test.each([16, 24])('afegeix silenci al davant d\'un WAV de %i bits i n\'actualitza les mides', (bits) => {
        const block = bits / 8;
        const out = Buffer.from(V.padWavStart(wav(bits, 10), 250));
        const pad = 250 * block;   // 1000 Hz · 0,25 s
        expect(out.length).toBe(44 + 10 * block + pad);
        expect(out.readUInt32LE(4)).toBe(out.length - 8);
        expect(out.toString('ascii', 36, 40)).toBe('data');
        expect(out.readUInt32LE(40)).toBe(10 * block + pad);
        expect(out.subarray(44, 44 + pad).every(b => b === 0)).toBe(true);
        expect(out.subarray(44 + pad).every(b => b === 0x11)).toBe(true);
    });
    test('respecta els blocs que hi ha abans de les dades', () => {
        const out = Buffer.from(V.padWavStart(wav(16, 4, Buffer.from('INFOabcd')), 10));
        expect(out.toString('ascii', 36, 40)).toBe('LIST');
        expect(out.toString('ascii', 52, 56)).toBe('data');
        expect(out.readUInt32LE(56)).toBe(8 + 20);
        expect(out.subarray(60, 80).every(b => b === 0)).toBe(true);
    });
    test('si no és un WAV PCM que s\'entengui, el deixa tal qual', () => {
        const eight = wav(8, 10);
        expect(V.padWavStart(eight, 250)).toBe(eight);
        const junk = new Uint8Array([1, 2, 3]).buffer;
        expect(V.padWavStart(junk, 250)).toBe(junk);
        const ok = wav(16, 10);
        expect(V.padWavStart(ok, 0)).toBe(ok);
    });
});
