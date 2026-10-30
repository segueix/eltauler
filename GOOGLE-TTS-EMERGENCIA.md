# Veu catalana de reserva de Google Cloud

La veu principal d'El Tauler continua essent **Matxa (BSC/Aina)**. Si Matxa
no respon, el reproductor pot provar **Google Cloud Text-to-Speech**
`ca-ES-Standard-B`, una veu femenina estàndard en català. Google no forma
part de la Web Speech API d'Android: cal fer la síntesi per una API autenticada.

## Per activar-la

1. Activa **Cloud Text-to-Speech API** en un projecte de Google Cloud amb
   facturació i crea una credencial autoritzada per a aquesta API.
2. Com que **El Tauler es publica amb GitHub Pages**, crea un
   **Cloudflare Worker** per interceptar només la ruta
   `eltauler.cat/api/google-tts` (el DNS ha de passar per Cloudflare).
   El repositori ja inclou `cloudflare/google-tts-worker.js` i
   `wrangler-google-tts.toml`, que importen la funció protegida
   `functions/api/google-tts.js`.
3. Configura el secret `GOOGLE_TTS_API_KEY` al Worker, mai al client.
   Amb Wrangler: `npx wrangler secret put GOOGLE_TTS_API_KEY --config wrangler-google-tts.toml`.
   Per desplegar el Worker un cop configurat el secret i els límits:
   `npx wrangler deploy --config wrangler-google-tts.toml`.
4. **Abans de publicar l'endpoint**, configura una regla Cloudflare de
   limitació de peticions a `/api/google-tts` i pressupostos/alertes de Google.
   La funció també accepta un binding opcional
   `GOOGLE_TTS_RATE_LIMITER` compatible amb `limit({ key })`.

Alternativament, amb Cloudflare Pages es pot desplegar la carpeta `functions/`
com a Pages Function. **GitHub Pages per si sol no executa cap backend.**
Sense la ruta i el secret de servidor, la reserva Google no podrà sonar:
**el codi no inventa aquesta veu ni torna a eSpeak o al sistema**.

## Música i privadesa

La reserva utilitza el mateix reproductor que Matxa. El coordinador
`musicafons.js` manté la música ambiental i en redueix el volum mentre
hi ha locució, respectant l'ajust de l'usuari. No se sent ni la veu ni la música
durant les partides amb rellotge quan l'app té aplicat el silenci.

El text de la locució s'envia al servei intermedi i després a Google Cloud
només quan es requereix la veu de reserva. El servei no desa text ni àudio;
la funció valida que la veu sigui exactament `ca-ES-Standard-B`, admet
només fragments breus, no habilita CORS d'altres orígens i no exposa la
clau al navegador. L'autenticació i la limitació d'abús de l'endpoint públic
continuen essent responsabilitat del desplegament.
