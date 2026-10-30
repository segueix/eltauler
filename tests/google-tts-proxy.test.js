const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../functions/api/google-tts.js'), 'utf8')
    .replace(/export async function /g, 'async function ')
    .replace(/export function /g, 'function ');

function handler(upstream) {
    const sandbox = { Response, URL, Uint8Array, atob, fetch: upstream };
    vm.runInNewContext(source + '\nthis.handler = onRequestPost;', sandbox);
    return sandbox.handler;
}

function request(body, opts = {}) {
    const headers = new Headers({ 'content-type': 'application/json',
        origin: opts.origin || 'https://eltauler.cat' });
    return {
        url: 'https://eltauler.cat/api/google-tts', headers,
        json: async () => body
    };
}

test('mai no fa una petició a Google sense el secret de servidor', async () => {
    const upstream = jest.fn();
    const post = handler(upstream);
    const res = await post({ request: request({ text: 'Bon dia' }), env: {} });
    expect(res.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
});

test('rebutja un origen extern i un canvi de veu', async () => {
    const upstream = jest.fn();
    const post = handler(upstream);
    const env = { GOOGLE_TTS_API_KEY: 'secret' };
    const foreign = await post({ request: request({}, { origin: 'https://malicious.invalid' }), env });
    expect(foreign.status).toBe(403);
    const wrong = await post({ request: request({
        text: 'Bon dia', voice: 'es-ES-Standard-A', languageCode: 'es-ES'
    }), env });
    expect(wrong.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
});

test('fa servir exactament la veu catalana femenina, i només retorna MP3', async () => {
    const upstream = jest.fn(async () => ({
        ok: true, json: async () => ({ audioContent: Buffer.from('MP3').toString('base64') })
    }));
    const post = handler(upstream);
    const res = await post({ request: request({
        text: 'Bon dia', voice: 'ca-ES-Standard-B', languageCode: 'ca-ES',
        speakingRate: 1
    }), env: { GOOGLE_TTS_API_KEY: 'secret', GOOGLE_TTS_RATE_LIMITER: { limit: async () => ({ success: true }) } } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const [url, opts] = upstream.mock.calls[0];
    expect(url).toContain('text:synthesize?key=secret');
    expect(JSON.parse(opts.body).voice).toEqual({ languageCode: 'ca-ES', name: 'ca-ES-Standard-B' });
    expect(await res.text()).toBe('MP3');
});

test('sense limitador la funció no factura síntesi', async () => {
    const upstream = jest.fn();
    const post = handler(upstream);
    const res = await post({ request: request({
        text: 'Bon dia', voice: 'ca-ES-Standard-B', languageCode: 'ca-ES'
    }), env: { GOOGLE_TTS_API_KEY: 'secret' } });
    expect(res.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
});

test('aplica el limitador de peticions si està configurat', async () => {
    const upstream = jest.fn();
    const post = handler(upstream);
    const res = await post({ request: request({
        text: 'Bon dia', voice: 'ca-ES-Standard-B', languageCode: 'ca-ES'
    }), env: {
        GOOGLE_TTS_API_KEY: 'secret',
        GOOGLE_TTS_RATE_LIMITER: { limit: async () => ({ success: false }) }
    } });
    expect(res.status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
});
