# Optimització de Firebase — mantenir El Tauler dins el pla gratuït

Aquest document explica **com consumeix quota** El Tauler a Firebase, **quines
optimitzacions s'han aplicat** per mantenir-se dins el pla gratuït encara que
creixi el nombre d'usuaris, i **quines optimitzacions queden pendents** per si
en el futur cal aguantar molts més usuaris.

És el company de [`SINCRONITZACIO_FIREBASE.md`](SINCRONITZACIO_FIREBASE.md)
(configuració del projecte Firebase).

---

## 1. Com fa servir Firebase l'app

Hi ha **tres** usos de Cloud Firestore, molt diferents pel que fa al consum:

| Ús | Document | Escriptura | Lectura |
|---|---|---|---|
| **Sincronització del compte** (`cloudsync.js`) | `eltauler_users/{uid}` (privat, 1 per usuari) | Instantània completa del `localStorage` | Lectura inicial + listener del propi doc |
| **Partida col·lectiva** (`catalans.js`) | `eltauler_catalans/current` (+ `c_<id>`) — **1 doc compartit** | Un vot = una escriptura al mapa `votes[uid]` | **Sondeig** del document compartit |
| **Rànquing global** (`app.js`) | `eltauler_ranking/leaderboard` (1 doc compartit) | `merge` de la pròpia entrada (debounce + hash) | `.get()` amb cau de 3 min |

### El problema de fons (abans de les optimitzacions)

La partida col·lectiva feia servir un **listener en temps real** (`onSnapshot`)
sobre un **únic document compartit**. Amb aquest disseny:

- Cada vot (escriptura) es **reenvia a TOTS els clients connectats** → **1 lectura
  per cada espectador i per cada vot**.
- Si N persones miren la partida i es voten V moviments → **≈ N × V lectures**
  (creixement **quadràtic**), i cada lectura reenvia el **document sencer**
  (que amb molts vots + missatges pot fer desenes de KB → crema **egress**).

Aquest era el vector que podia esgotar la quota gratuïta en una sola tarda
«viral», encara que el total d'usuaris fos modest.

---

## 2. Límits del pla gratuït de Firestore

Quota **diària** (es reinicia a mitjanit hora del Pacífic) i **mensual**:

- **50.000 lectures/dia**
- **20.000 escriptures/dia**
- **20.000 esborrats/dia**
- **1 GiB** d'emmagatzematge total
- **10 GiB/mes** de tràfic sortint (egress) — ≈ 333 MiB/dia
- **Autenticació amb Google: gratuïta** i sense límit rellevant → l'auth mai és el
  coll d'ampolla.

> Des de finals del 2024 els projectes nous de Firebase necessiten el pla
> **Blaze** per activar Firestore, però Blaze **inclou aquesta mateixa franja
> gratuïta**: només pagues el que passi *per sobre* d'aquests llindars.
> Recomanació: posa un **pressupost/alerta de facturació a 0 €** a Google Cloud
> per no endur-te sorpreses.

---

## 3. Optimitzacions aplicades

### Punt 1 — Sondeig conscient de la visibilitat a la partida col·lectiva
*(`catalans.js`)*

S'ha substituït el listener en temps real del document compartit per un
**sondeig (polling) periòdic**:

- **Interval adaptatiu:** ràpid (`POLL_FAST_MS` = 10 s) quan el resultat és
  imminent (últims 2 min del torn o esperant la jugada de Stockfish) i lent
  (`POLL_SLOW_MS` = 45 s) la resta del temps.
- **En pausa quan la pestanya no és visible** (`document.hidden` / esdeveniment
  `visibilitychange`): en segon pla no es gasta cap lectura, i es refresca de
  seguida en tornar a primer pla.
- **L'historial** de partides passa de listener a **lectura puntual**
  (`loadHistoryOnce`), en obrir i quan una partida acaba.
- Les **transicions de torn** (tancar votació, moure Stockfish, nova partida)
  segueixen protegides per transacció + guard per `ply` + *jitter*; després de
  cada transició es fa un `refreshNow()` per encadenar el pas següent (abans ho
  feia el listener).

**Efecte:** les lectures passen de `N × V` (imprevisible, quadràtic) a
`N × (temps_visible / interval)` (**acotades, lineals i previsibles**),
independentment del volum de vots.

### Punt 2 — Sincronització del compte sense escriptures a cada moviment
*(`cloudsync.js`)*

- **Debounce llarg:** `PUSH_DEBOUNCE_MS` de 2,5 s → **20 s**, amb un **sostre**
  (`PUSH_MAX_WAIT_MS` = 60 s) perquè, encara que hi hagi desats continus, es pugi
  de tant en tant.
- **Flush-on-exit:** es puja el que estigui pendent en **amagar o tancar** la
  pestanya (`visibilitychange` a *hidden* i `pagehide`). Així una sessió sencera
  es resol en **poques escriptures** en comptes d'una per cada desat.
- **Guard per hash:** `snapshotHash()` calcula un hash estable de la instantània;
  si no ha canviat des de l'última pujada, **no s'escriu** (elimina pujades
  redundants). En baixar dades del núvol es fixa el hash per no re-pujar
  immediatament el que s'acaba de baixar.
- **«Sincronitza ara»** (`syncNow`) força la pujada encara que el hash coincideixi.

**Efecte:** ~75 % menys d'escriptures per sessió, sense que l'usuari noti
diferència (la sincronització entre dispositius segueix passant en obrir/enfocar
i en sortir).

### Punt 3 — Debounce + refredament del vot
*(`catalans.js`)*

- **UI optimista:** el vot es mostra **immediatament** al tauler i a la llista,
  sense escriure encara.
- **Debounce** (`VOTE_DEBOUNCE_MS` = 2,5 s): els canvis ràpids de vot s'agrupen en
  una sola escriptura.
- **Refredament** (`VOTE_COOLDOWN_MS` = 30 s): temps mínim entre escriptures de
  vot d'un mateix usuari, amb avís visible (*«S'enviarà d'aquí X s per estalviar
  quota»*).
- **Mai després del límit:** si el torn s'acaba abans, el vot s'escriu amb marge
  (3 s) perquè compti a temps.

**Efecte:** un usuari que «juga» amb el tauler ja no genera desenes d'escriptures;
cada votant fa, com a molt, una escriptura cada 30 s.

### Punt 2b — Robustesa multi-dispositiu
*(`cloudsync.js` + `app.js`)*

El debounce llarg del punt 2 estalvia quota, però eixampla la finestra en què les
dades poden quedar sense pujar entre dispositius. Per compensar-ho sense renunciar
a l'estalvi:

- **Flush imminent en esdeveniments valuosos** (`CloudSync.flushSoon`,
  `FLUSH_SOON_MS` = 3 s): el final de partida (`handleGameOver`), el desat d'un
  error nou i la resolució d'un exercici de tàctica (`completeTacticsPuzzle`)
  pugen de seguida (coalescent una ràfega en una sola escriptura), en comptes
  d'esperar el debounce llarg. Els desats menors segueixen amb el debounce de 20 s.
- **Baixada en recuperar el focus** (`pullOnFocus`, throttle
  `FOCUS_PULL_THROTTLE_MS` = 30 s): en tornar a primer pla, a més del listener en
  temps real, es llegeix del **servidor** l'última versió i s'aplica si és més
  nova. Garanteix que en tornar a un dispositiu tens l'estat més recent abans de
  continuar jugant, gastant com a molt una lectura cada 30 s.

**Nota:** segueix sent «última escriptura guanya» sobre la instantània **sencera**
(no hi ha fusió camp a camp), així que **jugar alhora en dos dispositius sense
deixar-los sincronitzar** encara pot sobreescriure dades. La fusió per seccions
seria el pas següent (vegeu la secció 4).

---

## 4. Optimitzacions pendents (per si cal escalar més)

Per ordre d'impacte, si algun dia es volen aguantar molts més usuaris:

1. **Separar els vots de l'estat del tauler.** Mantenir `current` petit (fen, ply,
   fase, deadline + recompte agregat `voteCounts{uci:n}`) i moure el detall dels
   vots (noms, missatges, ELO) a un document/subcol·lecció a part. Els espectadors
   llegirien pocs centenars de bytes; menys egress per lectura.
2. **Convertir també el registre de partides pròpies** (`customs`, encara amb
   `onSnapshot` a la pantalla d'inici) a una lectura puntual + refresc periòdic.
   Cost actual baix (canvia molt poques vegades), per això es va deixar tal qual.
3. **Aprimar la instantània de sincronització:** retallar les llistes molt grans
   (`gameHistory`, `reviewHistory`) a les últimes N entrades abans de pujar-les,
   per reduir egress i no acostar-se mai al límit d'1 MB per document.
4. **Avisos i explicacions a la UI** (secció «Com funciona» de la partida,
   Configuració → Sincronització) sobre que els vots s'actualitzen cada ~30 s i
   que la sincronització es fa periòdicament i en sortir. *(El refredament del vot
   ja mostra un avís en temps d'execució.)*
5. **Bàner reactiu** si Firestore retorna `resource-exhausted` de manera repetida:
   *«S'ha arribat a la quota gratuïta diària; torna-ho a provar més tard.»*

---

## 5. Estimacions de capacitat (pla gratuït)

Ordres de magnitud per **usuari actiu diari (DAU)** que juga una sessió real.
L'ús real varia molt; són estimacions.

**Escriptures/dia per usuari**

| Font | Abans | Ara (optimitzat) |
|---|---|---|
| Sincronització del compte | ~20 | ~5 |
| Rànquing | ~2 | ~2 |
| Vots (només ~20 % voten) | ~0,3 | ~0,3 |
| **Total ≈** | **~22** | **~7,5** |

- **Abans:** 20.000 / 22 ≈ **~900 DAU** (lligat per escriptures).
- **Ara:** 20.000 / 7,5 ≈ **~2.500 DAU**.

**Lectures/dia** — dominades per la partida col·lectiva:

- **Abans (temps real):** lectures ≈ `espectadors_concurrents × vots`. Un pic de
  **200 espectadors × 200 vots = 40.000 lectures en UN torn** → gairebé tot el
  pressupost diari.
- **Ara (sondeig):** ~20-40 lectures per espectador i sessió, **independent del
  volum de vots**. Amb ~25 % que miren la partida ≈ **~10 lectures/DAU** →
  50.000 / 10 ≈ **~5.000 DAU**.

**Egress (10 GiB/mes ≈ 333 MiB/dia):**

- **Abans:** el temps real reenviava el **document sencer** (~30-60 KB) a cada
  espectador i cada vot → podia superar els 10 GiB/mes amb facilitat (l'egress
  lligava **abans** que el comptador de lectures).
- **Ara:** amb sondeig i menys reescriptures, l'egress deixa de ser el coll
  d'ampolla fins a diversos milers de DAU. Separar els vots (secció 4) el
  reduiria encara més.

**Emmagatzematge (1 GiB):** cada doc d'usuari ~20-200 KB → **~10.000 usuaris
registrats** abans de tocar el límit (independent de l'activitat diària).

### Resum

| Escenari | Coll d'ampolla | Capacitat aproximada |
|---|---|---|
| **Disseny anterior** | Egress + lectures del temps real | Segur fins ~800-1.000 DAU, però **un pic de ~300-500 votants concurrents podia esgotar la quota en un dia** |
| **Amb les optimitzacions** | Escriptures | ~**2.000-2.500 DAU** de forma **estable i previsible**, amb marge fins ~5.000 en lectures |

El canvi clau no és només «més usuaris»: el cost passa a créixer **linealment i de
forma previsible** amb els usuaris, en comptes de **quadràticament** i amb pics
imprevistos.

---

## 6. Constants ajustables (on tocar)

| Constant | Fitxer | Valor | Què fa |
|---|---|---|---|
| `POLL_FAST_MS` | `catalans.js` | 10.000 | Interval de sondeig quan el resultat és imminent |
| `POLL_SLOW_MS` | `catalans.js` | 45.000 | Interval de sondeig normal |
| `POLL_NEAR_DEADLINE_MS` | `catalans.js` | 120.000 | Finestra final del torn on s'accelera el sondeig |
| `VOTE_DEBOUNCE_MS` | `catalans.js` | 2.500 | Agrupació de canvis ràpids de vot |
| `VOTE_COOLDOWN_MS` | `catalans.js` | 30.000 | Temps mínim entre escriptures de vot |
| `PUSH_DEBOUNCE_MS` | `cloudsync.js` | 20.000 | Debounce de la pujada de sincronització |
| `PUSH_MAX_WAIT_MS` | `cloudsync.js` | 60.000 | Sostre entre pujades sota desats continus |
| `FLUSH_SOON_MS` | `cloudsync.js` | 3.000 | Pujada imminent en esdeveniments valuosos |
| `FOCUS_PULL_THROTTLE_MS` | `cloudsync.js` | 30.000 | Freqüència màxima de baixada en recuperar el focus |
| `RANKING_CACHE_MS` | `app.js` | 180.000 | Cau de lectura del rànquing |

Pujar els intervals estalvia més quota a canvi de menys immediatesa; baixar-los
fa l'app més reactiva a canvi de més consum.
