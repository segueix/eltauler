### Resultats i durada

| | Sense humanització | Comportament anterior | Humanitzada |
|---|---:|---:|---:|
| Partides | 1000 | 1000 | 1000 |
| Victòries blanques (%) | 44.4 | 48.2 | 42.2 |
| Victòries negres (%) | 37.9 | 37.6 | 36.1 |
| Taules (%) | 17.7 | 14.2 | 21.7 |
| Durada mitjana (jugades) | 49.67 | 45.74 | 51.81 |
| Remuntades (% de partides decidides) | 25.8 | 20.5 | 14 |
| Final: agreed (%) | 10.8 | 7.2 | 11.4 |
| Final: checkmate (%) | 2.9 | 3.4 | 1.1 |
| Final: insufficient (%) | 1.4 | 2.7 | 6 |
| Final: length (%) | 2.7 | 1.3 | 1.4 |
| Final: repetition (%) | 2.7 | 3 | 2.5 |
| Final: resign (%) | 79.4 | 82.4 | 77.2 |
| Final: stalemate (%) | 0.1 | 0 | 0.4 |

### Qualitat de les jugades (mesurada amb la mateixa anàlisi per a totes)

| | Sense humanització | Comportament anterior | Humanitzada |
|---|---:|---:|---:|
| Jugades mesurades | 90610 | 82877 | 93984 |
| Bones (< 30 cp) per 100 | 67.32 | 65.8 | 72.79 |
| Imprecisions (30–89 cp) per 100 | 22.31 | 23 | 21.37 |
| Errors (90–199 cp) per 100 | 8.42 | 8.86 | 4.82 |
| Errors greus (≥ 200 cp) per 100 | 1.95 | 2.34 | 1.01 |
| Posicions senzilles (n) | 77449 | 70923 | 31339 |
| Errors greus en posició senzilla (per 1000) | 17.66 | 21.77 | 6.06 |
| Errors o pitjor en posició senzilla (per 1000) | 100.04 | 107.99 | 54.66 |
| Jugades en final elemental (n) | 1314 | 1039 | 2803 |
| Errors en final elemental (n) | 139 | 10 | 38 |
| Decisions humanitzades / % que canvien la jugada del motor | — | — | 94388 / 52.1 % |

### Diferències entre jugadors (per 100 jugades) i puntuació

| Jugador | Arquetip | Sense humanització: imprec. / errors / greus / punts % | Comportament anterior: imprec. / errors / greus / punts % | Humanitzada: imprec. / errors / greus / punts % |
|---|---|---:|---:|---:|
| alekhine | tactic | 20.1 / 7.42 / 2.05 / 55 | 20.25 / 7.39 / 2.15 / 65.5 | 23.08 / 4.92 / 1.23 / 39.25 |
| botvinnik | posicional | 24.5 / 9.76 / 1.93 / 46 | 25.09 / 9.91 / 2.35 / 39 | 19.03 / 4.98 / 0.92 / 55.25 |
| capablanca | tecnic | 23.63 / 8.9 / 1.77 / 47 | 24.74 / 10.05 / 2.56 / 40.5 | 20.79 / 4.67 / 0.88 / 55 |
| carlsen | tecnic | 22.66 / 9.18 / 1.83 / 43.75 | 25.24 / 9.8 / 2.29 / 41.75 | 21.89 / 4.87 / 0.98 / 48.75 |
| fischer | tactic | 25.22 / 8.97 / 1.97 / 47 | 24.95 / 9.98 / 2.62 / 35.25 | 21.06 / 4.91 / 0.93 / 49.75 |
| karpov | defensiu | 22.78 / 9.31 / 1.81 / 45.25 | 25.64 / 10.42 / 2.66 / 41 | 20.88 / 5.11 / 0.88 / 58.25 |
| kasparov | agressiu | 19.85 / 7.19 / 2.41 / 58 | 20.19 / 7.6 / 2.1 / 68.5 | 22.27 / 4.98 / 1.15 / 44.75 |
| lasker | defensiu | 19.76 / 7.23 / 2.02 / 50.75 | 19.52 / 6.47 / 2.18 / 64.75 | 21.03 / 3.89 / 0.9 / 53.75 |
| morphy | agressiu | 21.21 / 7.64 / 1.94 / 58 | 20.25 / 7.28 / 2.26 / 63 | 23.93 / 5.08 / 1.16 / 39 |
| steinitz | posicional | 23.66 / 8.78 / 1.78 / 49.25 | 24.72 / 10.01 / 2.3 / 40.75 | 19.9 / 4.84 / 1.1 / 56.25 |

### Coherència entre el tipus d'error i el perfil

Entre les jugades NO òptimes (imprecisió o pitjor), percentatge que porten cada etiqueta (una jugada pot portar-ne diverses).

**Sense humanització**

| Arquetip | n | iniciativa | riscRei | materialSac | simplifica | passiva | complicacio | estructura |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| agressiu | 5446 | 51.36 | 16.98 | 0.79 | 6.52 | 27.47 | 28.37 | 2.81 |
| defensiu | 5746 | 49.27 | 16.05 | 0.77 | 5.95 | 28.73 | 25.5 | 2.25 |
| posicional | 6223 | 49.77 | 15.94 | 1.14 | 5.01 | 29.05 | 26.05 | 2.35 |
| tactic | 6088 | 49.62 | 16.33 | 0.87 | 5.9 | 29.75 | 27 | 2.18 |
| tecnic | 6112 | 50.52 | 16.26 | 1.16 | 4.97 | 29.56 | 28.08 | 2.08 |
| tots | 29615 | 50.09 | 16.3 | 0.95 | 5.65 | 28.95 | 26.98 | 2.32 |

**Comportament anterior**

| Arquetip | n | iniciativa | riscRei | materialSac | simplifica | passiva | complicacio | estructura |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| agressiu | 5075 | 53.85 | 15.65 | 0.95 | 7.65 | 25.14 | 31.13 | 2.82 |
| defensiu | 5604 | 52.73 | 15.85 | 0.86 | 6.64 | 26.25 | 28.21 | 2.68 |
| posicional | 6126 | 52.27 | 16.49 | 0.93 | 6.63 | 24.53 | 28.21 | 2.53 |
| tactic | 5496 | 55.44 | 15.37 | 1.56 | 6.77 | 23.98 | 32.79 | 2.71 |
| tecnic | 6040 | 53.28 | 14.95 | 1.04 | 6.77 | 25.55 | 29.74 | 2.47 |
| tots | 28341 | 53.47 | 15.67 | 1.07 | 6.87 | 25.09 | 29.95 | 2.63 |

**Humanitzada**

| Arquetip | n | iniciativa | riscRei | materialSac | simplifica | passiva | complicacio | estructura |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| agressiu | 5396 | 57.43 | 21.15 | 1.69 | 4.37 | 26.35 | 31.23 | 1.78 |
| defensiu | 5062 | 46.84 | 16.93 | 0.89 | 4.72 | 29.22 | 26.37 | 1.98 |
| posicional | 4776 | 49.33 | 18.28 | 1.13 | 4.48 | 28.04 | 26.59 | 1.63 |
| tactic | 5330 | 55.83 | 18.07 | 1.31 | 4.73 | 27.35 | 34.63 | 2.01 |
| tecnic | 5009 | 51.17 | 16.99 | 0.92 | 5.41 | 28.55 | 26.67 | 2.1 |
| tots | 25573 | 52.26 | 18.32 | 1.2 | 4.74 | 27.87 | 29.22 | 1.9 |

### Equilibri entre oponents amb perfils equivalents

Puntuació (%) del primer jugador de la parella (ordre alfabètic) i de les blanques, jugant les dues vegades amb cada color.

**Sense humanització**

| Parella | Partides | Puntuació del primer | Puntuació de les blanques |
|---|---:|---:|---:|
| alekhine–fischer | 22 | 50 | 50 |
| botvinnik–steinitz | 22 | 68.18 | 45.45 |
| capablanca–carlsen | 22 | 50 | 40.91 |
| karpov–lasker | 22 | 29.55 | 34.09 |
| kasparov–morphy | 22 | 54.55 | 50 |

**Comportament anterior**

| Parella | Partides | Puntuació del primer | Puntuació de les blanques |
|---|---:|---:|---:|
| alekhine–fischer | 22 | 90.91 | 54.55 |
| botvinnik–steinitz | 22 | 63.64 | 63.64 |
| capablanca–carlsen | 22 | 56.82 | 47.73 |
| karpov–lasker | 22 | 27.27 | 40.91 |
| kasparov–morphy | 22 | 68.18 | 54.55 |

**Humanitzada**

| Parella | Partides | Puntuació del primer | Puntuació de les blanques |
|---|---:|---:|---:|
| alekhine–fischer | 22 | 43.18 | 43.18 |
| botvinnik–steinitz | 22 | 47.73 | 61.36 |
| capablanca–carlsen | 22 | 56.82 | 61.36 |
| karpov–lasker | 22 | 61.36 | 52.27 |
| kasparov–morphy | 22 | 65.91 | 43.18 |

### Equilibri entre motors (puntuació %)

| | Stockfish | Lozza |
|---|---:|---:|
| Sense humanització | 46.38 | 55.44 |
| Comportament anterior | 39.71 | 65.44 |
| Humanitzada | 53.88 | 44.19 |
