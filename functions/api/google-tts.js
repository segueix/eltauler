// Cloudflare Pages Function. Posa GOOGLE_TTS_API_KEY a Secrets (MAI al client).
// Requereix un límit de peticions al domini /api/google-tts a Cloudflare WAF
// abans d'habilitar la facturació; l'endpoint no està pensat per a ús anònim
// sense protecció de consum. GitHub Pages no executa aquesta funció.
const fail = (code, message) => new Response(message, { status: code, headers: {
    'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'
} });
export async function onRequestPost({ request, env }) {
    if (!env.GOOGLE_TTS_API_KEY) return fail(503, 'Google TTS no configurat');
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return fail(403, 'Origen no autoritzat');
    if (!/^application\/json\b/i.test(request.headers.get('Content-Type') || '')) return fail(415, 'Format');
    if (Number(request.headers.get('Content-Length')) > 2400) return fail(413, 'Text massa llarg');
    let body;
    try { body = await request.json(); } catch (_) { return fail(400, 'JSON incorrecte'); }
    const text = body && body.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 480) return fail(400, 'Text invàlid');
    // No permetre triar altres veus o idiomes des del client.
    if (body.voice !== 'ca-ES-Standard-B' || body.languageCode !== 'ca-ES') return fail(400, 'Veu no admesa');
    const speakingRate = typeof body.speakingRate === 'number' && Number.isFinite(body.speakingRate)
        ? Math.max(0.8, Math.min(1.2, body.speakingRate)) : 1;
    if (env.GOOGLE_TTS_RATE_LIMITER) {
        const cf = request.cf || {};
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const key = (cf.country || 'xx') + ':' + ip;
        const r = await env.GOOGLE_TTS_RATE_LIMITER.limit({ key });
        if (!r.success) return fail(429, 'Massa peticions');
    }
    const google = await fetch(
        'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(env.GOOGLE_TTS_API_KEY),
        { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ input: { text }, voice: { languageCode: 'ca-ES', name: 'ca-ES-Standard-B' },
                audioConfig: { audioEncoding: 'MP3', speakingRate } }) }
    ).catch(() => null);
    if (!google) return fail(502, 'Servei no disponible');
    if (!google.ok) return fail(502, 'Google TTS no disponible');
    let data;
    try { data = await google.json(); } catch (_) { return fail(502, 'Resposta incorrecta'); }
    if (!data || typeof data.audioContent !== 'string' || data.audioContent.length > 1400000) return fail(502, 'Àudio invàlid');
    let decoded;
    try { decoded = Uint8Array.from(atob(data.audioContent), c => c.charCodeAt(0)); }
    catch (_) { return fail(502, 'Àudio invàlid'); }
    return new Response(decoded, { status: 200, headers: {
        'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
    } });
}
export function onRequestGet() { return fail(405, 'Només POST'); }
