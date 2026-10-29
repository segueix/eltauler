// ============================================================================
// veuneural.js — Veus neuronals catalanes Matxa (BSC · projecte Aina)
// ============================================================================
// Les veus del sistema en català solen ser robòtiques (o no n'hi ha cap).
// Softcatalà no publica cap servei de veu neuronal propi (el seu tts-service
// és Festival) i a la seva comparativa de síntesi lliure en català remet a
// Matxa, el model multilocutor i multidialectal del BSC (Matcha-TTS + vocoder
// alVoCat), com el model nou de referència. Aquest mòdul el fa servir a través
// de la demo pública del projecte Aina a Hugging Face (API Gradio amb CORS
// obert):
//
//   1. /gradio_api/queue/join  fn «rs_change» (accent)  → la sessió accepta
//      els parlants d'aquell accent
//   2. /gradio_api/queue/join  fn «predict» (text, accent, parlant…)
//   3. /gradio_api/queue/data  (flux SSE) → URL del WAV generat
//
// És una veu EN LÍNIA: el text que es llegeix s'envia al servidor del BSC.
// Si no hi ha xarxa, el servei dorm o triga massa, qui la fa servir torna a
// la veu del dispositiu (i durant un minut no s'hi torna a provar). Stockfish
// vs Lozza TV, en canvi, atura la partida i hi torna a provar (speak amb
// force) fins que Matxa respon; una síntesi correcta acaba la pausa.
//
// Es carrega com a:
//   - Navegador: <script src="veuneural.js"> → window.ElTaulerVeuNeural
//   - Node/Jest: require('./veuneural') → module.exports
// ============================================================================
(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.ElTaulerVeuNeural = api;
    }
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    const MATXA_CONFIG = {
        BASE_URL: 'https://projecte-aina-matxa-alvocat-tts-ca.hf.space',
        FN_PREDICT: 0,
        FN_ACCENT: 3,
        TEMPERATURE: 0.2,
        LENGTH_SCALE: 0.89,
        MAX_CHARS: 480,
        SYNTH_TIMEOUT_MS: 12000,
        COOLDOWN_MS: 60000,
        CACHE_SIZE: 40
    };

    // Les vuit veus de Matxa (dues per accent).
    const MATXA_VOICES = [
        { id: 'matxa:central:elia', accent: 'central', speaker: 'elia', name: 'Elia', accentLabel: 'central' },
        { id: 'matxa:central:grau', accent: 'central', speaker: 'grau', name: 'Grau', accentLabel: 'central' },
        { id: 'matxa:nord-occidental:emma', accent: 'nord-occidental', speaker: 'emma', name: 'Emma', accentLabel: 'nord-occidental' },
        { id: 'matxa:nord-occidental:pere', accent: 'nord-occidental', speaker: 'pere', name: 'Pere', accentLabel: 'nord-occidental' },
        { id: 'matxa:valencia:gina', accent: 'valencia', speaker: 'gina', name: 'Gina', accentLabel: 'valencià' },
        { id: 'matxa:valencia:lluc', accent: 'valencia', speaker: 'lluc', name: 'Lluc', accentLabel: 'valencià' },
        { id: 'matxa:balear:olga', accent: 'balear', speaker: 'olga', name: 'Olga', accentLabel: 'balear' },
        { id: 'matxa:balear:quim', accent: 'balear', speaker: 'quim', name: 'Quim', accentLabel: 'balear' }
    ];
    const DEFAULT_VOICE_ID = 'matxa:central:elia';

    function isNeuralVoiceId(id) { return /^matxa:/.test(String(id || '')); }
    function voiceById(id) { return MATXA_VOICES.find(v => v.id === id) || null; }
    function voiceLabel(id) {
        const v = voiceById(id);
        return v ? 'Matxa · ' + v.name + ' (' + v.accentLabel + ')' : '';
    }
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    // Ràdio és l'únic perfil de so: veu present, volum uniforme i, a sobre,
    // l'equalitzador de cinc bandes que ajusta cada usuari. Els perfils antics
    // (Natural, Càlida) es llegeixen com a Ràdio.
    const AUDIO_PROFILES = [
        { id: 'radio', name: 'Ràdio', description: 'Veu present i volum uniforme, com a la ràdio. Ajusta el to amb l’equalitzador.' }
    ];
    const EQ_MAX_DB = 12;
    const EQ_BANDS = [
        { id: 'low', label: 'Greus', type: 'lowshelf', frequency: 120 },
        { id: 'lowmid', label: 'Cos', type: 'peaking', frequency: 400 },
        { id: 'mid', label: 'Mitjans', type: 'peaking', frequency: 1200 },
        { id: 'presence', label: 'Presència', type: 'peaking', frequency: 3000 },
        { id: 'high', label: 'Aguts', type: 'highshelf', frequency: 7500 }
    ];
    function normalizeEq(value) {
        const v = value || {};
        const out = {};
        EQ_BANDS.forEach(b => {
            const n = v[b.id];
            out[b.id] = typeof n === 'number' && isFinite(n) ? Math.round(clamp(n, -EQ_MAX_DB, EQ_MAX_DB)) : 0;
        });
        return out;
    }
    function formatDb(value) {
        const n = Math.round(Number(value) || 0);
        return (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0') + ' dB';
    }
    // Lliscadors verticals (com un equalitzador de debò) només si el
    // navegador els dibuixa en vertical; si no, es queden en files.
    let verticalRange = null;
    function layoutEq(el) {
        if (!el || !el.classList) return;
        if (verticalRange === null) {
            try {
                const doc = el.ownerDocument;
                const probe = doc.createElement('input');
                probe.type = 'range';
                probe.style.cssText = 'position:absolute;visibility:hidden;writing-mode:vertical-lr;direction:rtl;';
                doc.body.appendChild(probe);
                const box = probe.getBoundingClientRect();
                probe.remove();
                verticalRange = box.height > box.width && !!(root.CSS && root.CSS.supports && root.CSS.supports('writing-mode', 'vertical-lr'));
            } catch (err) { verticalRange = false; }
        }
        el.classList.toggle('matxa-eq--vertical', verticalRange);
    }
    function normalizeEffects(value) {
        const v = value || {};
        const number = (n, fallback) => typeof n === 'number' && isFinite(n) ? clamp(n, 0, 1) : fallback;
        return {
            profile: 'radio',
            intensity: number(v.intensity, 0.6), clarity: number(v.clarity, 0.5), volume: number(v.volume, 1),
            eq: normalizeEq(v.eq)
        };
    }

    // Un únic context per reproductor. Només processa l'àudio Matxa (WAV),
    // mai speechSynthesis. Sense Web Audio o sense permís, sona l'original.
    function createAudioEffects(env) {
        const e = env || {};
        let context = null;
        function unlock() {
            try {
                if (!context || context.state === 'closed') {
                    const Ctor = root && (root.AudioContext || root.webkitAudioContext);
                    context = e.createContext ? e.createContext() : (Ctor ? new Ctor() : null);
                }
                if (context && context.state === 'suspended') {
                    const p = context.resume();
                    if (p && p.catch) p.catch(() => {});
                }
            } catch (err) {}
        }
        function attach(audio, value) {
            const s = normalizeEffects(value);
            const amount = s.intensity;
            const eqGains = EQ_BANDS.map(b => s.eq[b.id]);
            const eqFlat = eqGains.every(g => g === 0);
            if ((!amount && eqFlat && s.volume === 1) || !context || context.state !== 'running') {
                audio.volume = s.volume;
                return null;
            }
            const nodes = [];
            const disconnect = () => nodes.forEach(n => { try { n.disconnect(); } catch (err) {} });
            try {
                // Si una connexió falla després de crear la font, el caller
                // ha de recrear l'element Audio: la font ja n'ha capturat la sortida.
                const source = context.createMediaElementSource(audio);
                nodes.push(source);
                const filter = (type, frequency, gain, q) => {
                    const node = context.createBiquadFilter();
                    nodes.push(node);
                    node.type = type; node.frequency.value = frequency;
                    node.Q.value = q || 0.7; node.gain.value = gain;
                };
                let headroomDb = 0;
                if (amount) {
                    const warmth = 1.5 * amount;
                    const presence = ((s.clarity - 0.5) * 6 + 1.5) * amount;
                    filter('lowshelf', 180, warmth);
                    filter('highshelf', 4500, -0.5 * amount);
                    filter('peaking', 2400, presence);
                    headroomDb = Math.max(0, warmth) + Math.max(0, presence);
                    filter('highpass', 80, 0);
                    const compressor = context.createDynamicsCompressor();
                    nodes.push(compressor);
                    compressor.threshold.value = -24 * amount;
                    compressor.knee.value = 18;
                    compressor.ratio.value = 1 + 2.5 * amount;
                    compressor.attack.value = 0.008;
                    compressor.release.value = 0.18;
                }
                // Equalitzador després del compressor: el que mou l'usuari se
                // sent tal qual. Es reserva marge per a la banda més alta.
                if (!eqFlat) {
                    EQ_BANDS.forEach((b, i) => filter(b.type, b.frequency, eqGains[i], b.type === 'peaking' ? 1 : 0.7));
                    headroomDb += Math.max(0, ...eqGains);
                }
                const gain = context.createGain();
                nodes.push(gain);
                gain.gain.value = s.volume * Math.pow(10, -headroomDb / 20);
                audio.volume = 1;
                nodes.forEach((node, i) => node.connect(nodes[i + 1] || context.destination));
                return { disconnect: disconnect };
            } catch (err) { disconnect(); throw err; }
        }
        return { unlock: unlock, attach: attach };
    }
    // La velocitat del perfil es tradueix a la durada de Matxa (més lent =
    // fonemes més llargs), dins del rang que admet el model.
    function lengthScaleForRate(rate) {
        const r = (typeof rate === 'number' && isFinite(rate) && rate > 0) ? rate : 1;
        return Math.round(clamp(MATXA_CONFIG.LENGTH_SCALE / r, 0.8, 1.1) * 100) / 100;
    }

    // Separa un flux SSE en esdeveniments JSON («data: {...}»). Retorna també
    // el tros final incomplet perquè s'hi pugui afegir el que arribi després.
    function parseSse(buffer) {
        const parts = String(buffer || '').split(/\r?\n\r?\n/);
        const rest = parts.pop();
        const events = [];
        parts.forEach((block) => {
            const data = block.split(/\r?\n/).filter(l => l.indexOf('data:') === 0).map(l => l.slice(5).trim()).join('\n');
            if (!data) return;
            try { events.push(JSON.parse(data)); } catch (e) {}
        });
        return { events: events, rest: rest };
    }

    function randomHash() {
        return 'tauler' + Math.random().toString(36).slice(2, 12);
    }

    // ------------------------------------------------------------------
    // Client Gradio de Matxa
    // ------------------------------------------------------------------
    // env = { fetch, baseUrl }
    function createMatxaClient(env) {
        const e = env || {};
        const doFetch = e.fetch || (typeof fetch === 'function' ? fetch.bind(root) : null);
        const base = e.baseUrl || MATXA_CONFIG.BASE_URL;
        const sessions = {};

        async function readEvents(resp, eventId, signal) {
            if (resp.body && typeof resp.body.getReader === 'function') {
                const reader = resp.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                try {
                    for (;;) {
                        if (signal && signal.aborted) throw new Error('aborted');
                        const chunk = await reader.read();
                        if (chunk.done) break;
                        buffer += decoder.decode(chunk.value, { stream: true });
                        const parsed = parseSse(buffer);
                        buffer = parsed.rest;
                        for (const ev of parsed.events) {
                            if (ev.msg === 'process_completed' && (!eventId || ev.event_id === eventId)) return ev;
                        }
                    }
                } finally { try { reader.cancel(); } catch (err) {} }
                const tail = parseSse(buffer + '\n\n').events.find(ev => ev.msg === 'process_completed');
                if (tail) return tail;
                throw new Error('stream-ended');
            }
            const text = await resp.text();
            const ev = parseSse(text + '\n\n').events.find(x => x.msg === 'process_completed' && (!eventId || x.event_id === eventId));
            if (!ev) throw new Error('stream-ended');
            return ev;
        }

        async function call(sessionHash, fnIndex, data, signal) {
            const join = await doFetch(base + '/gradio_api/queue/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: data, fn_index: fnIndex, session_hash: sessionHash, event_data: null, trigger_id: null }),
                signal: signal
            });
            if (!join.ok) throw new Error('join-' + join.status);
            const joined = await join.json();
            const resp = await doFetch(base + '/gradio_api/queue/data?session_hash=' + encodeURIComponent(sessionHash), { signal: signal });
            if (!resp.ok) throw new Error('data-' + resp.status);
            const ev = await readEvents(resp, joined && joined.event_id, signal);
            if (!ev.success || !ev.output) throw new Error('failed');
            return ev.output.data;
        }

        // Una sessió per accent; les crides d'una sessió van en fila.
        function session(accent) {
            if (!sessions[accent]) {
                const s = { hash: randomHash(), chain: Promise.resolve(), ready: null };
                sessions[accent] = s;
            }
            return sessions[accent];
        }
        function enqueue(s, task) {
            const run = s.chain.then(task, task);
            s.chain = run.catch(() => {});
            return run;
        }

        async function synthesize(text, voiceId, opts) {
            const o = opts || {};
            const voice = voiceById(voiceId);
            if (!voice) throw new Error('voice');
            const clean = String(text || '').slice(0, MATXA_CONFIG.MAX_CHARS).trim();
            if (!clean) throw new Error('empty');
            const attempt = async (retry) => {
                const s = session(voice.accent);
                if (!s.ready) s.ready = enqueue(s, () => call(s.hash, MATXA_CONFIG.FN_ACCENT, [voice.accent], o.signal));
                try {
                    await s.ready;
                    const out = await enqueue(s, () => call(s.hash, MATXA_CONFIG.FN_PREDICT,
                        [clean, voice.accent, voice.speaker, MATXA_CONFIG.TEMPERATURE, lengthScaleForRate(o.rate)], o.signal));
                    const file = Array.isArray(out) ? out[0] : null;
                    const url = file && (file.url || (file.path ? base + '/gradio_api/file=' + file.path : null));
                    if (!url) throw new Error('no-audio');
                    return url;
                } catch (err) {
                    // Sessió caducada al servidor: se'n fa una de nova una vegada.
                    delete sessions[voice.accent];
                    if (retry && !(o.signal && o.signal.aborted)) return attempt(false);
                    throw err;
                }
            };
            return attempt(true);
        }

        return { synthesize: synthesize, _sessions: sessions };
    }

    // ------------------------------------------------------------------
    // Reproductor: una sola locució viva, amb temps màxim i memòria cau
    // ------------------------------------------------------------------
    // env = { client, createAudio(src), fetchAudio(url) → Promise<src>,
    //         setTimeout, clearTimeout, now, isOnline }
    function createNeuralSpeaker(env) {
        const e = env || {};
        const client = e.client || createMatxaClient({});
        const setT = e.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        const clearT = e.clearTimeout || ((id) => clearTimeout(id));
        const now = e.now || (() => Date.now());
        const isOnline = e.isOnline || (() => !(root && root.navigator && root.navigator.onLine === false));
        const createAudio = e.createAudio || ((src) => new root.Audio(src));
        const audioEffects = e.audioEffects || createAudioEffects({ createContext: e.createAudioContext });
        // Es baixa el WAV i es reprodueix des de memòria: no depèn que el
        // fitxer temporal del servidor continuï existint.
        const fetchAudio = e.fetchAudio || (async (url, signal) => {
            const resp = await fetch(url, { signal: signal });
            if (!resp.ok) throw new Error('audio-' + resp.status);
            const blob = await resp.blob();
            // El servidor l'envia com a octet-stream: es marca com a WAV.
            return URL.createObjectURL(new Blob([blob], { type: 'audio/wav' }));
        });
        const releaseSrc = e.releaseSrc || ((src) => { try { if (/^blob:/.test(src)) URL.revokeObjectURL(src); } catch (err) {} });
        const cache = new Map();   // clau → Promise<src>
        let cooldownUntil = 0;
        let current = null;

        function key(text, voiceId, rate) { return voiceId + '|' + lengthScaleForRate(rate) + '|' + text; }

        function source(text, voiceId, opts) {
            const o = opts || {};
            const k = key(text, voiceId, o.rate);
            if (cache.has(k)) {
                const hit = cache.get(k);
                cache.delete(k); cache.set(k, hit);   // LRU
                return hit;
            }
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            const timer = setT(() => { if (controller) controller.abort(); }, o.synthTimeoutMs || MATXA_CONFIG.SYNTH_TIMEOUT_MS);
            const p = client.synthesize(text, voiceId, { rate: o.rate, signal: controller ? controller.signal : undefined })
                .then(url => fetchAudio(url, controller ? controller.signal : undefined))
                .then((src) => { clearT(timer); cooldownUntil = 0; return src; }, (err) => {
                    clearT(timer);
                    cache.delete(k);
                    cooldownUntil = now() + MATXA_CONFIG.COOLDOWN_MS;
                    throw err;
                });
            cache.set(k, p);
            while (cache.size > MATXA_CONFIG.CACHE_SIZE) {
                const oldest = cache.keys().next().value;
                const old = cache.get(oldest);
                cache.delete(oldest);
                old.then(releaseSrc, () => {});
            }
            return p;
        }

        function finish(entry, spoken, reason) {
            if (!entry || current !== entry) return;
            current = null;
            clearT(entry.timer);
            if (entry.audio) { try { entry.audio.onended = null; entry.audio.onerror = null; entry.audio.pause(); } catch (err) {} }
            if (entry.effects) { try { entry.effects.disconnect(); } catch (err) {} }
            entry.resolve({ spoken: spoken, reason: reason });
        }

        const api = {
            available() { return isOnline() && now() >= cooldownUntil; },
            // La TV que espera Matxa hi torna a provar abans que s'acabi la
            // pausa d'un minut (opció force de speak).
            online() { return isOnline(); },
            // Cal cridar-ho durant el gest de l'usuari, abans d'esperar la síntesi.
            unlock() { audioEffects.unlock(); },
            // Prepara l'àudio per endavant (p. ex. mentre es veu la jugada anterior).
            prefetch(text, voiceId, opts) {
                if (!api.available() || !isNeuralVoiceId(voiceId) || !text) return;
                source(text, voiceId, opts).catch(() => {});
            },
            speak(text, voiceId, opts) {
                const o = opts || {};
                api.stop();
                if (!text) return Promise.resolve({ spoken: false, reason: 'empty' });
                if (!isNeuralVoiceId(voiceId) || !voiceById(voiceId)) return Promise.resolve({ spoken: false, reason: 'voice' });
                if (!(o.force ? isOnline() : api.available())) return Promise.resolve({ spoken: false, reason: 'unavailable' });
                audioEffects.unlock();
                return new Promise((resolve) => {
                    const entry = { resolve: resolve, timer: null, audio: null };
                    current = entry;
                    entry.timer = setT(() => finish(entry, false, 'timeout'), o.maxWaitMs || 30000);
                    source(text, voiceId, o).then((src) => {
                        if (current !== entry) return;
                        let audio;
                        try { audio = createAudio(src); } catch (err) { finish(entry, false, 'audio-error'); return; }
                        try { entry.effects = audioEffects.attach(audio, o.effects); }
                        catch (err) {
                            // Un filtre incompatible no ha de deixar la retransmissió muda.
                            try { audio.pause(); audio = createAudio(src); audio.volume = normalizeEffects(o.effects).volume; }
                            catch (err2) { finish(entry, false, 'audio-error'); return; }
                        }
                        entry.audio = audio;
                        audio.onended = () => finish(entry, true, 'end');
                        audio.onerror = () => finish(entry, false, 'audio-error');
                        let played;
                        try { played = audio.play(); } catch (err) { finish(entry, false, 'play-error'); return; }
                        if (played && typeof played.catch === 'function') {
                            played.catch((err) => finish(entry, false, err && err.name === 'NotAllowedError' ? 'not-allowed' : 'play-error'));
                        }
                    }, () => finish(entry, false, 'network'));
                });
            },
            pause() { if (current && current.audio) { try { current.audio.pause(); } catch (err) {} } },
            resume() { if (current && current.audio) { try { audioEffects.unlock(); const p = current.audio.play(); if (p && p.catch) p.catch(() => {}); } catch (err) {} } },
            isSpeaking() { return !!current; },
            stop() { if (current) finish(current, false, 'stopped'); },
            _cache: cache
        };
        return api;
    }

    let shared = null;
    function sharedSpeaker() {
        if (!shared) shared = createNeuralSpeaker({});
        return shared;
    }

    return {
        MATXA_CONFIG,
        MATXA_VOICES,
        DEFAULT_VOICE_ID,
        AUDIO_PROFILES,
        EQ_BANDS,
        EQ_MAX_DB,
        normalizeEq,
        formatDb,
        layoutEq,
        normalizeEffects,
        createAudioEffects,
        isNeuralVoiceId,
        voiceById,
        voiceLabel,
        lengthScaleForRate,
        parseSse,
        createMatxaClient,
        createNeuralSpeaker,
        sharedSpeaker
    };
});
