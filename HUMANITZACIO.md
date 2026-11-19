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
  `MULTIPV = 4` millors línies de l'anàlisi de la posició.
- **Interruptor intern, invisible**: `TV_CONFIG.HUMANIZE.ENABLED` o `deps.humanize`
  (`false` torna al comportament anterior: perfil d'estil + defalliment programat). No hi ha
  cap element a la pantalla.

## Flux d'una jugada

1. `runLoop` analitza la posició (ara amb **MultiPV 4** en les partides humanitzades, en lloc
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
  estratègica del perfil segons el tipus de posició, habilitat de finals, gestió de la pressió
  si va per sota, posicions tancades (jugadors més tàctics), complexitat de la posició
  (`0,75 + 0,9·c`) i una rampa suau d'obertura (`0,3` fins a la semijugada 10, ple a la 34).
- **Pèrdua màxima** admesa: `55 + 215·c^1,3` cp (`c` = complexitat 0–1): en una posició senzilla
  no es permet cap error greu. A més: si la millor jugada és ≥ +250 cp només s'admeten
  alternatives que conserven ≥ +130 cp, i no es passa de la igualtat a ≤ −260 cp.
- **Complexitat** (0–1): densitat de captures i escacs de les jugades legals, diferència entre
  les dues millors línies («única jugada»), material a taula i nombre de línies gairebé
  iguals. Tot surt de chess.js i de l'anàlisi, no d'un centipeó interpretat.
- **Preferència del perfil**: els `weights` de `llegendes.js` (trets de `tvMoveFeatures`), amb
  `PREF_GAIN = 0,3` i topall `±1,2` perquè mai no decideixin contra l'avaluació.
- **Ambició**: en posicions igualades (|cp| ≤ 60) es castiguen les repeticions i tornar enrere
  (menys taules per repetició sense forçar res), i qui no va per sota (≥ −30 cp) no es llença
  a unes taules mortes (ofegat o falta de material) si l'anàlisi en dona una altra de raonable
  (`DEAD_DRAW_PENALTY`: es desprecien, no s'impedeixen).
- **Fase d'atac** (`risk = 1`): el pes del perfil de progrés es multiplica (`PREF_GAIN` 0,3 →
  1,2, topall 1,2 → 4,7) dins del seu marge de pèrdua (90 cp), com feia el perfil d'estil.
- Classes de pèrdua: imprecisió ≥ 30 cp, error ≥ 90 cp, error greu ≥ 200 cp.

### Vulnerabilitats per perfil (biaix sobre les jugades inferiors)

Només actuen sobre les alternatives inferiors raonables (mai obliguen) i creixen amb la
fatiga (`0,5 + (1−q)`). Els 10 jugadors tenen un arquetip (`PROFILES`); els perfils sense
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

RESULTATS_PENDENTS

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
