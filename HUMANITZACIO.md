# Humanització dinàmica de la lliga de llegendes TV

Codi: `humanitzacio.js` (lògica pura, UMD, `window.ElTaulerHumanitzacio`), cablejat a
`stockfishtv.js` (`playerMove`, `analysisJob`, `tvLegendPlan`, `tvSlipInfo`) i `llegendes.js`
(remarca `slip`). Proves: `tests/humanitzacio*.test.js`. Simulació per lots:
`scripts/simula-humanitzacio.js`.

L'objectiu és que els dos jugadors de la lliga juguin a un nivell alt però **creïble**:
imprecisions petites i plausibles, errors greus excepcionals, remuntades possibles i
personalitat reconeixible, **sense fabricar cap guanyador**.

## Què fa i què no toca

- **Només la lliga de llegendes** (les partides amb `fixture`). El duel Stockfish–Lozza
  antic, «Fins al mat», el control manual, les partides normals dels usuaris i el seu
  nivell de dificultat **no canvien**. El rellotge i la partida en curs no es modifiquen.
- No és un motor nou ni una reducció de força: **tria entre les millors jugades que ja ha
  trobat l'anàlisi** (MultiPV). Mai no s'inventa una jugada: la triada és sempre una de les
  `MULTIPV = 8` millors línies de l'anàlisi de la posició.
- **Interruptor intern, invisible**: `TV_CONFIG.HUMANIZE.ENABLED` o `deps.humanize`
  (`false` torna al comportament anterior: perfil d'estil + defalliment programat). No hi ha
  cap element a la pantalla.

## Flux d'una jugada

1. `runLoop` analitza la posició (ara amb **MultiPV 8** en les partides humanitzades, en lloc
   de 2; la resta del comentari només llegeix les línies 1 i 2). L'anàlisi es guarda amb
   `analysis.lines` (des de qui mou).
2. El motor del jugador (Stockfish amb el seu nivell, o Lozza amb la seva profunditat) calcula
   la seva jugada habitual: és l'**àncora** (`ENGINE_ANCHOR`, mateixa bonificació per als dos).
   Amb línies d'anàlisi fiables, Stockfish ja no calcula MultiPV (abans: `STYLE_MULTIPV = 4`),
   així que no hi ha feina duplicada.
3. `humanitzacio.decide()` tria entre les candidates amb una **softmax** de la pèrdua
   d'avaluació, la precisió actual del jugador, les preferències del perfil i les
   vulnerabilitats, i en deixa un registre tècnic (`g.human.log`, intern).
4. Si no hi ha anàlisi fiable (profunditat < `MIN_RELIABLE_DEPTH`) o `decide` no pot triar,
   mana el motor i el perfil d'estil d'abans (`tvPickStyledMove`). Les 12 primeres semijugades
   preparades de l'obertura no passen pel mòdul.

La mateixa fórmula serveix per a Stockfish i Lozza (Lozza no té MultiPV: les candidates
sempre surten de l'anàlisi de Stockfish a força plena, la «vara» comuna). Les diferències de
comportament vénen només dels perfils i de la partida; les identitats, no el color ni el
motor, determinen l'aleatorietat.

## Aleatorietat i reproduïbilitat

- **Llavor per partida**: `fixture.id` (`temporada:blanques>negres`).
- **Un RNG per jugador** (`mulberry32`) derivat de `llavor + id del jugador` (no del color,
  ni del motor, ni de l'altre jugador): l'evolució de cadascú és independent i *swap* de colors
  dona la mateixa seqüència per al mateix jugador. Una altra extracció, també per jugador,
  s'usa només per triar la jugada.
- Cada pas consumeix **sempre** les mateixes extraccions, hi hagi tria o no, de manera que el
  comportament no depèn de quines posicions s'han protegit.
- Reproduïble per a les proves: mateixa llavor i mateixes entrades → mateixes jugades
  (`tests/humanitzacio.test.js`). Els motors reals, en canvi, depenen del temps de càlcul.

## Estat de precisió (fatiga i fluctuació)

Per a cada jugador i semijugada (`advance`), la precisió `q ∈ [0,08, 1]` és:

```
q = BASE_Q(perfil) + x − desgast − sot − pressió_del_rellotge
```

| Component | Model |
|---|---|
| Precisió de referència | `0,68` ± 0,015 segons el perfil: tots juguen igual de fort de base. |
| Fluctuació `x` | AR(1): `x ← ρ·x + √(1−ρ²)·σ·ε`, `ρ = 0,9`, `σ = 0,22`. Correlada en el temps: no hi ha salts absurds, i pot pujar per sobre de la base (precisió extraordinària). |
| Desgast | `+0,0014/semijugada · (0,6 + 0,8·complexitat) · (1,3 − resistència)`, amb sostre `0,16`. Moderat. |
| «Sot» | Les fases difícils (complexitat alta o desavantatge ≤ −80 cp) hi afegeixen, segons `1,2 − gestió de la pressió`; es recupera cada pas un `8 % + 28 %·recuperació`. |
| Rellotge | `ctx.clock` (0–1) resta fins a `0,16`. La TV no té rellotge de partida: queda previst i a zero. |

No hi ha cap moviment fix (`tests/humanitzacio.test.js` comprova que el punt de més baixa
precisió es reparteix per tota la partida), cap alternança d'errors i cap pèrdua simultània.
Un jugador pot mantenir-se brillant mentre l'altre passa una mala fase, i recuperar-se.
No s'usa cap reducció percentual d'ELO.

## Selecció natural entre candidates

Per a cada candidata `i` (pèrdua `ℓᵢ` en cp respecte de la millor, línies de l'anàlisi):

```
log w_i = −ℓᵢ / τ  +  preferència_perfil_i  +  vulnerabilitat_i  +  ambició_i  +  àncora_i
```

- **`τ` (temperatura, cp)** = `12 + 98·(1−q)^1,3`, multiplicada per: habilitat tàctica o
  estratègica segons el tipus de posició, finals (si és un final), pressió (si va per sota),
  posicions tancades, complexitat de la posició (`0,75 + 0,9·c`) i una rampa suau d'obertura
  (`0,3` fins a la semijugada 10, ple a la 34). La tàctica i l'estratègia es mesuren **respecte
  de la mitjana de les dues del propi perfil** (`0,9 − 0,9·(habilitat − mitjana)`): un jugador és
  millor en el que domina i pitjor en el que no, però, en conjunt, tots juguen igual de fort.
- **Pèrdua màxima** admesa: `55 + 215·c^1,3` cp (`c` = complexitat 0–1): en una posició senzilla
  no es permet cap error greu. A més: si la millor jugada és ≥ +250 cp només s'admeten
  alternatives que conserven ≥ +130 cp, i no es passa de la igualtat a ≤ −260 cp.
- **Complexitat** (0–1): densitat de captures i escacs de les jugades legals, diferència entre
  les dues millors línies («única jugada»), material a taula i nombre de línies gairebé
  iguals. Tot surt de chess.js i de l'anàlisi, no d'un centipeó interpretat.
- **Preferència del perfil**: els `weights` de `llegendes.js` (trets de `tvMoveFeatures`), amb
  `PREF_GAIN = 0,3` i topall `±1,2` perquè mai no decideixin contra l'avaluació.
- **Ambició** (contra les taules per inèrcia, sense errors forçats):
  - posicions igualades (|cp| ≤ 60): es castiguen les repeticions i tornar enrere;
  - posicions igualades (|cp| ≤ 90) a partir de la semijugada 20: es desprecien els canvis de
    peces (`CONTEMPT_TRADE`, menys com més prudent és el jugador) i es prefereix la iniciativa
    (`TENSION_BONUS`, més com més agressiu);
  - qui no va per sota (≥ −30 cp) no es llença a unes taules mortes (ofegat o falta de
    material) si l'anàlisi en dona una altra de raonable (`DEAD_DRAW_PENALTY`).
  Són biaixos entre jugades equivalents per a l'anàlisi: no impedeixen cap resultat.
- **Fase d'atac** (`risk = 1`): el pes del perfil de progrés es multiplica (`PREF_GAIN` 0,3 →
  1,2, topall 1,2 → 4,7) dins del seu marge de pèrdua (90 cp), com feia el perfil d'estil.
- Classes de pèrdua: imprecisió ≥ 30 cp, error ≥ 90 cp, error greu ≥ 200 cp.

### Vulnerabilitats per perfil (biaix sobre les jugades inferiors)

Només actuen sobre les alternatives inferiors raonables (mai obliguen) i creixen amb la
fatiga (`0,5 + (1−q)`). **Només redistribueixen** quina alternativa inferior es tria: el
factor es normalitza (mitjana ponderada = 1) perquè un perfil no erri més que un altre amb
la mateixa fatiga i posició. Sense aquesta normalització, la primera simulació completa va
mostrar que els perfils agressius/tàctics (els que juguen amb Lozza) perdien punts per
construcció: Stockfish 55,8 % i Lozza 41,4 %; amb la normalització, 51,2 % i 48,3 %. Els 10 jugadors tenen un arquetip (`PROFILES`); els perfils sense
llegenda en reben un a partir dels seus `weights` (`traitsFromWeights`).

| Arquetip | Jugadors | Més temptat per… (+) | Evita (−) |
|---|---|---|---|
| Agressiu | Morphy, Kasparov | iniciativa, risc al rei, compensació per material, **rebutjar canvis** | — |
| Defensiu | Lasker, Karpov | defensa passiva, **perdre iniciatives**, simplificar aviat | risc al rei, sacrificis |
| Posicional | Steinitz, Botvinnik | maniobres lentes quan cal acció, infravalorar el cop tàctic | empitjorar els peons |
| Tàctic | Alekhine, Fischer | continuacions complicades, la jugada vistosa abans de l'estratègicament superior; pitjor en posicions tancades | — |
| Tècnic | Capablanca, Carlsen | **perdre l'ocasió de complicar**, controlar massa; molt bons als finals | risc al rei, sacrificis |

Les etiquetes són fets de chess.js: `iniciativa` (escac, amenaça a una peça valuosa, peces que
s'acosten al rei rival, peons que avancen), `riscRei` (mou un peó d'escut o el rei sense
enrocar), `materialSac`, `simplifica` (canvi), `passiva` (retirada, rei, desfer jugada),
`complicacio`, `estructura` (més peons aïllats o doblats), i les relatives al conjunt de
candidates (`declinaCanvi`, `declinaIniciativa`, `maniobraLenta`, `temptacio`,
`declinaComplicacio`).

## Proteccions

- **Mats** (a favor o en contra) a les línies: mana el motor.
- **Finals elementals** (≤ 2 peces que no són reis): mana el motor. L'app **no té taules de
  finals** (Syzygy): la protecció de «posicions resoltes» es limita a això, als mats de
  l'anàlisi i als límits de pèrdua; els finals difícils sí que poden tenir diferències de
  precisió.
- **Obertures**: les 12 semijugades preparades no passen pel mòdul i després la rampa
  d'obertura manté la temperatura baixa; el reconeixement i el comentari d'obertures no
  canvien.
- **Regles de la partida**: la humanització no toca les taules per repetició, la regla de les
  cinquanta jugades, l'ofegat ni l'acord de taules; només penalitza *repetir* en posicions
  igualades.

## Calibratge contra les taules

Una primera versió (MultiPV 4) feia les partides massa netes i les taules **pujaven** (≈ 26–30 %
a les simulacions curtes, contra ≈ 8–10 % del comportament anterior, que decidia moltes
partides amb el defalliment programat). La causa és estructural: en una posició igualada, les
4 millors jugades valen el mateix i no hi ha cap imprecisió possible; només hi ha errors quan hi
ha candidates pitjors. Mesurat amb 160 partides humanitzades per configuració (mateixa
simulació):

| Configuració | Taules | Imprecisions /100 | Errors /100 | Greus /100 | Remuntades |
|---|---:|---:|---:|---:|---:|
| MultiPV 4, ambició suau | 26,3 % | 17,7 | 3,4 | 0,8 | 11 % |
| **MultiPV 8**, ambició suau | 18,8 % | 22,6 | 4,9 | 1,0 | 17,7 % |
| **MultiPV 8**, ambició forta | 15,6 % | 21,9 | 5,5 | 1,1 | 14,1 % |
| Ídem + vulnerabilitats normalitzades i habilitats centrades (valors actuals, 400 partides) | 24,8 % | 21,7 | 4,8 | 1,0 | 17,9 % |
| Ídem + més temperatura i ambició (400 partides, descartat: empitjora l'equitat) | 24,0 % | 23,5 | 5,8 | 0,9 | 15,8 % |

Amb 160 partides l'error de mostreig de les taules és de ±3 punts, i amb 400, de ±2: la tanda de
1.000 partides (més avall, 21,7 %) és la xifra de referència. Cost: el temps d'anàlisi de l'app és fix (900 ms), de manera que MultiPV 8 no
gasta més CPU, només arriba a menys profunditat; si en un dispositiu lent no arriba a
`MIN_RELIABLE_DEPTH` (10), la jugada cau al camí antic (perfil d'estil).

## Coexistència amb el que ja existia

- **Defalliment programat** (`tvPlanSlump`, semijugada fixa 30–60 i comentari «menys
  precisió»): amb la humanització activa **s'omet**; la fluctuació dinàmica el substitueix
  (no hi ha cap número fix i no es presenta com a real una fatiga que és del model). El camí
  antic continua amb `humanize: false`.
- **Fase d'atac** (anti-encallament): es manté; el perfil d'atac passa pel mateix mecanisme
  de selecció (amb el mateix pes del perfil base, també per a Lozza) i el seu marge de pèrdua
  és el que li correspon.
- **Perfil d'estil** (`tvPickStyledMove`): continua com a reserva si no hi ha anàlisi fiable.

## Èlia i Grau

L'Èlia i en Grau mai no diuen res de la humanització (sense motors, nivells, llavors,
probabilitats, fatiga programada ni caselles). Parlen d'errors **només si l'anàlisi els
justifica** (`tvSlipInfo` + `llegendes.remark`, tipus `slip`):

- **Classe**: per la variació real de l'avaluació entre les dues anàlisis fiables (només
  centipeons, mateix bàndol, posició no decidida, i hi ha d'haver una millor alternativa):
  imprecisió (≥ 30 cp), error (≥ 90 cp), error greu (≥ 200 cp).
- **Vincle amb l'estil**: si la jugada és compatible amb el perfil (`styleLink`), en Grau ho
  fa notar amb fets comprovats amb chess.js: «Busca la iniciativa, com és propi del seu estil,
  però l'anàlisi preferia una altra jugada». Les afirmacions sobre l'alternativa («n'hi havia
  una de més activa») només es diuen si l'alternativa ho és realment.
- **Mesura**: com a molt 3 per partida i 8 semijugades entre dos, després de la semijugada 14.

## Proves

```bash
npx jest tests/humanitzacio.test.js tests/humanitzacio-tv.test.js tests/humanitzacio-simulacio.test.js
```

- `humanitzacio.test.js` (31): llavors, independència i correlació temporal de la precisió,
  equitat entre colors, selecció monòtona amb la pèrdua, errors greus només en posicions
  complexes, proteccions, vulnerabilitats per arquetip i coherència amb els trets.
- `humanitzacio-tv.test.js` (9): integració amb la TV (MultiPV 4, sense defalliment,
  interruptor), cap comentari revela el mecanisme, classes i vincle dels comentaris.
- `humanitzacio-simulacio.test.js`: una partida real a cada configuració amb els motors de
  l'app.

## Simulació per lots

```bash
node scripts/simula-humanitzacio.js --games 1000 --workers 4 --out /ruta/de/sortida
node scripts/simula-humanitzacio.js --aggregate-only --out /ruta/de/sortida   # recalcula resum.json i resum.md
```

Juga les 90 fixtures de la lliga (cada parella, una vegada amb cada color, en temporades
successives) amb **Stockfish 19 lite i Lozza reals** en tres configuracions i les mateixes
obertures, parelles i llavors: `sense` (motors purs), `anterior` (perfil d'estil +
defalliment + fase d'atac, com abans) i `humanitzada`. Cada jugada es mesura amb la **mateixa
anàlisi** per a les tres configuracions. Els pressupostos de càlcul són molt més petits que
els de l'app (anàlisi fins a profunditat 10 amb límit de 300 ms, jugadors de Stockfish a
20 ms): serveixen per **comparar configuracions**, no per predir la mateixa taxa de taules de
l'app real.

### Resultats (1.000 partides per configuració)

Resum complet (per jugador, tipus d'error per arquetip, parelles equivalents):
`scripts/simulacions/humanitzacio/resum.md` i `resum.json`. Les configuracions «sense» i
«anterior» no depenen de `humanitzacio.js`; la «humanitzada» s'ha jugat amb el codi final.

| | Sense humanització | Comportament anterior | Humanitzada |
|---|---:|---:|---:|
| Victòries blanques | 44,4 % | 48,2 % | 42,2 % |
| Victòries negres | 37,9 % | 37,6 % | 36,1 % |
| **Taules** | 17,7 % | **14,2 %** | **21,7 %** |
| · per acord / material insuficient | 10,8 / 1,4 % | 7,2 / 2,7 % | 11,4 / 6,0 % |
| Durada mitjana (jugades) | 49,7 | 45,7 | 51,8 |
| Remuntades (partides decidides) | 25,8 % | 20,5 % | 14,0 % |
| Imprecisions / 100 jugades | 22,3 | 23,0 | 21,4 |
| Errors / 100 | 8,4 | 8,9 | 4,8 |
| Errors greus / 100 | 1,95 | 2,34 | 1,01 |
| Errors greus en posició senzilla / 1000 | 17,7 | 21,8 | 6,1 |
| Puntuació Stockfish / Lozza | 46,4 / 55,4 % | 39,7 / 65,4 % | 53,9 / 44,2 % |

### Conclusions (honestes)

- **Les taules NO baixen** respecte del comportament anterior (14,2 % → 21,7 %) ni respecte
  dels motors purs (17,7 %). Les que queden són sobretot per acord (posició igualada sense
  progrés) i per material insuficient: en una posició igualada totes les bones jugades valen
  el mateix i no hi ha imprecisió possible sense forçar errors. El comportament anterior en
  tenia menys en part pel defalliment programat, que l'especificació demanava eliminar.
  Provat sense èxit: més temperatura, més ambició (vegeu «Calibratge contra les taules»).
- **La qualitat millora**: la meitat d'errors i d'errors greus, i molts menys en posicions
  senzilles.
- **El tipus d'error segueix el perfil** (entre jugades no òptimes): l'agressiu porta més
  iniciativa (57 % contra 52 % de mitjana) i risc al rei (21 % contra 18 %); el tàctic, més
  complicació (35 % contra 29 %); el defensiu, més passivitat (29 % contra 28 %) i menys
  iniciativa (47 %); el tècnic, més simplificacions (5,4 % contra 4,7 %). Les diferències
  existeixen però són moderades: les etiquetes de chess.js són aproximades.
- **Equitat incompleta**: els jugadors de Lozza (que són els agressius i tàctics) puntuen
  ~10 punts menys. No s'ha acabat de determinar si és per perfil o per motor (la tanda amb els
  motors intercanviats, `--swap-engines`, no s'ha completat).
- Les remuntades baixen (14 % de les partides decidides): els errors greus són més rars.


## Versió 1.2: percepció per profunditat (A) i ambició segons la classificació (B)

Per imitar millor com s'equivoca un humà (vegeu el raonament a la PR):

- **A) Percepció.** El jugador no tria entre les millors línies de l'anàlisi profunda sinó entre
  les que **veu** a la seva profunditat: una fracció de la de l'anàlisi
  (`0,2 + 0,5·q`, més en el tipus de posició que domina i a l'obertura; mai la mateixa de
  l'anàlisi). Les línies de cada profunditat surten de la **mateixa** anàlisi (Stockfish les emet
  totes): no hi ha cap cerca més. Els errors són d'horitzó (bons a poca profunditat, pitjors
  a més). La pèrdua real es mesura amb l'anàlisi profunda; si la jugada no hi surt, se'n coneix
  una cota inferior, i les proteccions (límit de pèrdua, no llençar una victòria, no passar a
  perdut) s'hi apliquen igualment. Sense línies per profunditat, es torna al mètode anterior.
- **B) Ambició.** Cada jugador rep una ambició (0–1) segons la classificació
  (`applyStakes`, amb el `stakes` de `llegendes.js`): qui encara pot atrapar el líder juga per
  guanyar (0,75–1), el líder amb marge en té menys (0,3). L'ambició escala la resistència a
  simplificar, a repetir i a les taules mortes, i **l'acord de taules de la TV ara necessita que
  tots dos el vulguin** (`acceptsDraw`: qui va per sota sempre l'accepta; si no, només qui no
  necessita guanyar).

### Resultat (100 partides humanitzades, mateixa simulació)

`scripts/simulacions/humanitzacio-ab/`. La simulació no porta una lliga real: la classificació
de cada partida se simula amb una llavor (`fakeStakes`). L'error de mostreig de les taules amb
100 partides és de ±4–5 punts.

| | v1.1 (1.000 partides) | **v1.2, A+B (100 partides)** |
|---|---:|---:|
| Taules | 21,7 % | **26 %** |
| · per acord | 11,4 % | 7 % |
| · material insuficient / durada màxima / repetició | 6,0 / 1,4 / 2,5 % | 8 / 5 / 5 % |
| Imprecisions / errors / greus per 100 | 21,4 / 4,8 / 1,0 | 17,0 / 3,7 / 1,0 |
| Errors greus en posició senzilla / 1000 | 6,1 | 4,8 |
| Remuntades | 14,0 % | 14,9 % |
| Puntuació Stockfish / Lozza | 53,9 / 44,2 % | 47,9 / 53,1 % |

**Lectura honesta:** B fa baixar les taules per acord (11 → 7 %), però les partides que no
s'acorden acaben igualment en taules per altres vies (material insuficient, durada màxima,
repetició): **el total no baixa**. A no ha generat més errors a la simulació perquè l'anàlisi
de la simulació només arriba a profunditat 10 i el jugador veu a ~5–8: hi ha poc horitzó. A
l'app (profunditat 16) l'horitzó és més gran i l'efecte d'A hauria de ser més fort, però **no
s'ha pogut mesurar** aquí. L'equitat entre motors, en canvi, queda equilibrada.

## Versió 1.3: nivell de l'espectacle

Objectiu triat: **espectacle**, encara que el nivell global baixi. Un sol control,
`CONFIG.LEVEL` (0–1, per defecte **0**, el més baix de l'escala), igual per als dos jugadors:

- **Menys càlcul**: la profunditat que veu cada jugador és absoluta (no una fracció de la de
  l'anàlisi), `3 + 7·q` semijugades ± l'habilitat, multiplicada per `0,55 + 0,45·LEVEL`.
- **Més soroll de judici**: les temperatures es multipliquen per `1 + 1,5·(1 − LEVEL)`.
- **Errors reals possibles**: el límit de pèrdua admesa s'amplia (`×(1 + 2·(1 − LEVEL))`). És
  el que fa baixar el nivell de debò: amb el límit estret, baixar només el càlcul no canviava
  res (vegeu la taula). Es mantenen: **mai un error greu en una posició senzilla**
  (complexitat < 0,25), mats i finals elementals protegits, no llençar una victòria clara.

### Resultat (100 partides per nivell, mateixa simulació)

`scripts/simulacions/humanitzacio-nivell/` (nivell 0). Error de mostreig de les taules: ±3–4 punts.

| | Anterior (1.000) | v1.2 (100) | 0,6 sense ampliar el límit | 0,6 | 0,3 | **0 (per defecte)** |
|---|---:|---:|---:|---:|---:|---:|
| Taules | 14,2 % | 26 % | 22 % | 20 % | 17 % | **10 %** |
| Durada (jugades) | 45,7 | 55,8 | 53,7 | 51,7 | 48,4 | **43,5** |
| Imprecisions / errors / greus per 100 | 23,0 / 8,9 / 2,3 | 17,0 / 3,7 / 1,0 | 17,9 / 3,7 / 1,1 | 17,1 / 3,9 / 0,8 | 18,5 / 5,5 / 1,1 | **22,0 / 6,6 / 1,5** |
| Errors greus en posició senzilla / 1000 | 21,8 | 4,8 | 6,3 | 5,2 | 9,6 | **6,3** |
| Remuntades | 20,5 % | 14,9 % | 6,4 % | 12,5 % | 14,5 % | **14,4 %** |
| Victòries blanques / negres | 48,2 / 37,6 % | 38 / 36 % | 42 / 36 % | 46 / 34 % | 44 / 39 % | **47 / 43 %** |
| Puntuació Stockfish / Lozza | 39,7 / 65,4 % | 47,9 / 53,1 % | 51,3 / 48,1 % | 53,8 / 44,4 % | 52,5 / 46,3 % | **49,2 / 51,3 %** |

Amb el nivell 0, les taules baixen per sota del comportament anterior i les partides són més
curtes i decisives, amb **menys errors i menys errors greus que abans** (que venien sobretot
del defalliment programat i del soroll dels motors) i equitat entre motors. Per baixar encara
més el nivell caldria ampliar `LEVEL_CAP_WIDEN`. Mesurat només amb 100 partides: una tanda de
1.000 donaria xifres més fermes.

## Versió 1.4: forma (per sobre i per sota del propi nivell)

Cada jugador té un **nivell efectiu** que es mou al voltant del nominal (`LEVEL`) i que fan
servir el càlcul (profunditat de percepció) i el judici (temperatures); el límit de pèrdua
admesa no s'amplia per sota del nivell 0. Dues components, iguals per als dos jugadors:

- **Ratxa**: AR(1) lent i independent per jugador (`FORM_RHO = 0,97`, `FORM_SIGMA = 0,3`,
  `FORM_GAIN = 0,6`): un jugador pot passar moltes jugades inspirat o apagat.
- **Confiança**: qui guanya terreny (l'avaluació millora des de la seva jugada anterior)
  s'enfila i qui en perd s'enfonsa (`CONF_GAIN = 0,35`, memòria 0,8). Com que l'avaluació és la
  mateixa vista des dels dos costats, **un queda de pujada i l'altre de baixada**. Es pot girar:
  la ratxa és independent, la resistència a la pressió esmorteeix les caigudes i, amb un
  avantatge clar (≥ 250 cp), l'autocomplaença fa baixar la confiança.

El nivell efectiu queda entre −0,4 i 1,2. No es comenta mai (és del model, no del jugador real).

### Resultat (100 partides, nivell 0, mateixa simulació)

`scripts/simulacions/humanitzacio-forma/`.

| | Nivell 0 sense forma | **Nivell 0 amb forma** |
|---|---:|---:|
| Taules | 10 % | **9 %** |
| Durada (jugades) | 43,5 | 42,7 |
| Imprecisions / errors / greus per 100 | 22,0 / 6,6 / 1,5 | 21,3 / 6,9 / 1,7 |
| Errors greus en posició senzilla / 1000 | 6,3 | 12,4 |
| Remuntades | 14,4 % | 11,0 % |
| Stockfish / Lozza | 49,2 / 51,3 % | 50,0 / 50,0 % |

- Jugades amb el nivell efectiu clarament per sobre del nominal (+0,2): 21 %; per sota (−0,2):
  11 %. Està desplaçat cap amunt perquè les caigudes de confiança s'esmorteeixen i el nivell 0 ja
  és el mínim de l'escala.
- En el 96 % de les partides, en algun moment un jugador està clarament de pujada i l'altre
  de baixada (diferència > 0,3); en el 18 %, això es gira i el que anava de baixada passa a
  anar de pujada.
- Guanya qui ha tingut més forma de mitjana en el 76 % de les partides decidides (en part,
  perquè la confiança segueix l'avaluació).
- Els errors greus en posicions senzilles pugen (6 → 12 per 1000), encara per sota del
  comportament anterior (22). Amb 100 partides, totes aquestes diferències són orientatives.

## Limitacions i pendent

- La simulació no reprodueix el temps de càlcul de l'app (900 ms/profunditat 16 d'anàlisi);
  la taxa absoluta de taules de la TV real no s'ha pogut mesurar aquí.
- La relació entre perfils i errors s'ha mesurat amb etiquetes de chess.js sobre jugades
  reals de les simulacions; les etiquetes són aproximacions (no són una valoració del rei
  ni de l'estructura feta pel motor).
- Els paràmetres (`CONFIG` de `humanitzacio.js`) no s'han calibrat contra partides humanes:
  són raonables i comprovats amb la simulació, no ajustats.
- La pressió del rellotge (`clock`) està prevista al model però la TV no té rellotge.
- Només la lliga de llegendes usa el mòdul; estendre'l al duel antic o a les partides de
  l'usuari quedaria fora de l'abast (i de les seves regles de dificultat).
