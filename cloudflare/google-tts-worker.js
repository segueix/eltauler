// Ruta Cloudflare Worker per a eltauler.cat/api/google-tts.
// Permet mantenir la web estàtica a GitHub Pages i executar només la
// síntesi de Google Cloud en un Worker amb el secret protegit.
import { onRequestPost } from '../functions/api/google-tts.js';

export default {
    async fetch(request, env) {
        const u = new URL(request.url);
        if (u.pathname !== '/api/google-tts') return new Response('No trobat', { status: 404 });
        if (request.method !== 'POST') return new Response('Només POST', { status: 405 });
        return onRequestPost({ request, env });
    }
};
