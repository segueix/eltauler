# Sincronització al núvol amb Firebase — Guia de configuració

El Tauler pot sincronitzar **totes** les teves dades (partides, errors, reptes
diaris, ELO, missions, trofeus, calibratge, lligues, obertures, tàctiques...)
entre tots els teus dispositius mitjançant Firebase.

L'app ja porta tot el codi a punt (`cloudsync.js`). Només has de crear un
projecte Firebase gratuït i enganxar-ne la configuració. Triga uns 5 minuts.

---

## 1. Crea el projecte Firebase

1. Ves a <https://console.firebase.google.com> i inicia sessió amb el teu Google.
2. Clica **«Afegeix un projecte»** (Add project) i posa-li un nom (p. ex. `eltauler`).
3. Pots **desactivar** Google Analytics (no cal). Crea el projecte.

## 2. Registra l'app web

1. Al panell del projecte, clica la icona **web** `</>` («Afegeix una app»).
2. Posa-li un sobrenom (p. ex. `El Tauler Web`) i registra-la. **No** cal Hosting.
3. Firebase et mostrarà un bloc `firebaseConfig` com aquest:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "eltauler-xxxx.firebaseapp.com",
     projectId: "eltauler-xxxx",
     storageBucket: "eltauler-xxxx.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef..."
   };
   ```

4. Copia aquests valors dins de **`cloudsync.js`**, a la constant `FIREBASE_CONFIG`
   (a dalt de tot del fitxer, on ara hi posa `OMPLE_...`).

## 3. Activa l'inici de sessió amb Google

1. Menú lateral → **Build → Authentication** → **Get started**.
2. Pestanya **Sign-in method** → activa **Google** → desa.

## 4. Activa Firestore Database

1. Menú lateral → **Build → Firestore Database** → **Create database**.
2. Tria **Production mode** i una regió propera (p. ex. `eur3`).
3. Quan estigui creada, ves a la pestanya **Rules** i enganxa exactament això:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /eltauler_users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
       // Partida col·lectiva «Catalans vs Stockfish»: document compartit.
       // Lectura PÚBLICA (qualsevol pot mirar la partida sense iniciar sessió);
       // escriptura només per a usuaris autenticats (votar i fer avançar la
       // partida requereix sessió amb Google).
       match /eltauler_catalans/{docId} {
         allow read: if true;
         allow write: if request.auth != null;
       }

       // Rànquing global: un sol document (eltauler_ranking/leaderboard) amb el
       // mapa players.{uid}. Lectura PÚBLICA; cada usuari només pot crear,
       // modificar o esborrar la SEVA entrada (players.<el seu uid>) i tocar
       // updatedAt: ningú no pot alterar l'ELO ni les estadístiques d'un altre.
       match /eltauler_ranking/{docId} {
         allow read: if true;
         allow create: if request.auth != null
           && docId == 'leaderboard'
           && request.resource.data.keys().hasOnly(['players', 'updatedAt'])
           && request.resource.data.get('updatedAt', 0) is number
           && request.resource.data.get('players', {}).keys().hasOnly([request.auth.uid])
           && rankingPlayersValid(request.resource.data.get('players', {}), request.auth.uid);
         allow update: if request.auth != null
           && docId == 'leaderboard'
           && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['players', 'updatedAt'])
           && request.resource.data.get('updatedAt', 0) is number
           && request.resource.data.get('players', {}).diff(resource.data.get('players', {})).affectedKeys().hasOnly([request.auth.uid])
           && rankingPlayersValid(request.resource.data.get('players', {}), request.auth.uid);
         allow delete: if false;
       }

       function rankingPlayersValid(players, uid) {
         return !(uid in players) || rankingEntryValid(players[uid]);
       }
       function rankingEntryValid(entry) {
         return entry is map
           && entry.keys().hasOnly(['name', 'elo', 'stars', 'games', 'hiero', 'at'])
           && entry.name is string && entry.name.size() <= 24
           && entry.elo is number && entry.elo >= 0 && entry.elo <= 4000
           && entry.stars is number && entry.stars >= 0
           && entry.games is number && entry.games >= 0
           && entry.hiero is number && entry.hiero >= 0
           && entry.at is number;
       }
     }
   }
   ```

   Així cada usuari només pot llegir i escriure les **seves pròpies** dades; la
   partida col·lectiva es pot **mirar** sense sessió, però per **votar** (i per
   fer-la avançar) cal haver iniciat sessió amb Google; i al rànquing global
   cadascú només pot tocar la seva entrada.
   Clica **Publish**.

   > ⚠️ Les regles del rànquing són **més estrictes** que les que hi havia fins
   > ara (abans, qualsevol usuari amb sessió podia reescriure tot el document,
   > ELO dels altres inclòs). El fitxer [`firestore.rules`](firestore.rules) del
   > repositori és la còpia de referència: **no es publica sol**, cal
   > enganxar-lo al panell **Rules** de la consola i clicar **Publish**.

   > ℹ️ Les **partides col·lectives pròpies** (cada equip contra Stockfish que es
   > crea des de la pantalla d'inici) viuen a la **mateixa** col·lecció
   > `eltauler_catalans` (documents `customs`, `c_<id>` i `c_<id>_h`), de manera
   > que la regla amb comodí `{docId}` ja les cobreix: no cal afegir-hi res més.

   > ⚠️ **Si veus «Error de connexió amb la partida global»**, gairebé sempre és
   > perquè aquestes regles encara no s'han publicat (Firestore denega la
   > lectura). Enganxa-les al panell **Rules** i clica **Publish**.

## 5. Autoritza el teu domini

1. **Authentication → Settings → Authorized domains**.
2. Afegeix **tots** els dominis on es publica l'app perquè l'inici de sessió amb
   Google (i, per tant, votar a les partides col·lectives) hi funcioni:
   - `eltauler.cat` (domini propi)
   - `elteunom.github.io` (GitHub Pages)
   `localhost` ja hi sol estar per a proves locals.

> ℹ️ Els enllaços de partides col·lectives (`#partida-<id>` i
> `#catalans-vs-stockfish`) són **relatius al domini actual** (hash routing), així
> que funcionen igual des de GitHub Pages i des de `eltauler.cat`. Un cop el
> domini propi està configurat (fitxer `CNAME`), GitHub redirigeix el domini
> `*.github.io` cap a `eltauler.cat`.

---

## Com s'utilitza

1. Obre l'app → **Configuració → ☁️ Sincronització al núvol**.
2. Clica **«Inicia sessió amb Google»**.
3. La primera vegada en un dispositiu que ja té dades, l'app et preguntarà si vols
   conservar les dades **del núvol** o **d'aquest dispositiu**.
4. A partir d'aquí tot se sincronitza automàticament: cada cop que jugues o
   resols un error, es puja al núvol; i si jugues en un altre dispositiu amb el
   mateix compte, les dades es baixen soles.

---

## Detalls tècnics

- **Estratègia:** instantània completa (snapshot) de tot el `localStorage` amb
  prefix `chess_` i `eltauler_`. No s'enumera clau a clau, així que qualsevol
  dada nova del joc se sincronitza automàticament sense tocar codi.
- **Conflictes:** «última escriptura guanya» per marca de temps. En temps real,
  si un altre dispositiu puja una versió més nova, s'aplica automàticament (mai
  enmig d'una partida; espera que acabis).
- **Barrera de conciliació:** amb la sessió iniciada, cap pujada ni cap fet
  irreversible guiat pel rellotge (derrota per temps d'una partida diària,
  ratxa a zero) no es resol fins que la sessió ha contrastat l'estat amb el
  SERVIDOR (no val la memòria cau). Així un aparell obert al cap de dies, amb
  dades endarrerides, no pot «fabricar» derrotes per temps ni escombrar la
  ratxa i pujar-ho per sobre de l'estat bo d'un altre aparell. En conciliar,
  el que hagi vençut de debò es resol llavors, amb la marca de temps oficial.
- **Fusió de l'estat viu:** en aplicar una instantània del núvol (i abans de
  pujar la local quan guanya), les partides diàries es fusionen partida a
  partida (guanya la versió amb més jugades) i la ratxa viatja com un parell
  {ratxa, última data de pràctica} (guanya la data més recent). La fusió és
  convergent: tots els aparells acaben amb el mateix resultat
  (`mergeSyncSnapshots` a `core.js`, provada a `tests/cloudmerge.test.js`).
- **Quan es puja:** per estalviar quota, els desats menors s'agrupen (debounce) i
  es pugen en amagar/tancar l'app; els esdeveniments valuosos (final de partida,
  error nou, exercici resolt) es pugen de seguida. En tornar a un dispositiu es
  baixa l'última versió del servidor abans de continuar. Tot i així, **jugar alhora
  en dos dispositius** sense deixar-los sincronitzar pot sobreescriure dades: deixa
  que aparegui «Sincronitzat ✓» (o prem «Sincronitza ara») abans de canviar de
  dispositiu. Vegeu [`OPTIMITZACIO_FIREBASE.md`](OPTIMITZACIO_FIREBASE.md).
- **Privadesa:** les dades viuen al teu Firestore privat, accessible només amb el
  teu compte. La clau API d'OpenAI **no** es sincronitza per seguretat (pots
  canviar-ho amb `SYNC_OPENAI_KEY = true` a `cloudsync.js`).
- **Preferències per dispositiu:** el control del tauler (Tocar/Arrossegar)
  tampoc **no** se sincronitza: cada aparell conserva la seva opció, perquè al
  mòbil sol anar millor «Tocar» i a l'ordinador «Arrossegar» (vegeu
  `EXCLUDE_KEYS` a `cloudsync.js`).
- **Offline:** si no hi ha connexió, l'app funciona igual; els canvis es pugen
  quan torna la xarxa (Firestore manté una cua local).
- **Límit:** un document de Firestore admet fins a 1 MB. L'historial de partides
  hauria de quedar molt per sota d'aquest límit en ús normal.
