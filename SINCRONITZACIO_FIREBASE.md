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
     }
   }
   ```

   Així cada usuari només pot llegir i escriure les **seves pròpies** dades.
   Clica **Publish**.

## 5. Autoritza el teu domini

1. **Authentication → Settings → Authorized domains**.
2. Afegeix el domini on publiques l'app (p. ex. `elteunom.github.io`).
   `localhost` ja hi sol estar per a proves locals.

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
- **Privadesa:** les dades viuen al teu Firestore privat, accessible només amb el
  teu compte. La clau API d'OpenAI **no** es sincronitza per seguretat (pots
  canviar-ho amb `SYNC_OPENAI_KEY = true` a `cloudsync.js`).
- **Offline:** si no hi ha connexió, l'app funciona igual; els canvis es pugen
  quan torna la xarxa (Firestore manté una cua local).
- **Límit:** un document de Firestore admet fins a 1 MB. L'historial de partides
  hauria de quedar molt per sota d'aquest límit en ús normal.
