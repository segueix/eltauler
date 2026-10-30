# Veu catalana de reserva de Google Cloud

La veu principal d'El Tauler continua essent **Matxa (BSC/Aina)**. Si Matxa
no respon, el reproductor pot provar **Google Cloud Text-to-Speech**
`ca-ES-Standard-B`, una veu femenina estàndard en català. Google no forma
part de la Web Speech API d'Android: cal fer la síntesi per una API autenticada.

## Per activar-la

1. Activa **Cloud Text-to-Speech API** en un projecte de Google Cloud amb
   facturació i crea una credencial autoritzada per a aquesta API.
2. Desplega El Tauler a **Cloudflare Pages** amb el directori `functions/`
   inclòs. La funció `functions/api/google-tts.js` queda disponible a
   `/api/google-tts`. **GitHub Pages no executa funcions de servidor.**
3. A Cloudflare Pages → Settings → Variables and Secrets crea
   `GOOGLE_TTS_API_KEY` com a **secret**, no com a variable pública.
   No copiïs aquesta clau a `index.html`, `veuneural.js` ni al repositori.
4. **Abans de posar-lo en producció**, estableix una regla de limitació de
   peticions/cost al domini i concretament a `/api/google-tts`. La funció
   permet integrar-hi opcionalment un binding
   `GOOGLE_TTS_RATE_LIMITER` compatible amb `limit({ key })`.
   Configura també pressupostos i alertes a Google Cloud.

Si el lloc es publica només amb GitHub Pages, cal desplegar un proxy equivalent
darrere el mateix domini o canviar a un allotjament que executi la funció.
Sense això la reserva de Google no podrà sonar: **el codi no inventa ni
emula aquesta veu**, ni torna a eSpeak ni al sistema.

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
