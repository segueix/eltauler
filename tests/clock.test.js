const Core = require('../core.js');

// ---------------------------------------------------------------------------
// Comptabilitat del rellotge de partida (core.js: clockTickDeltaMs,
// clockMoveSpendMs) i la seva invariant central: en un ritme SENSE increment,
// el rellotge d'un jugador no pot pujar mai, faci el que faci. L'error que
// motiva aquestes proves: la jugada que acabava el torn no pagava el tram des
// de l'últim tic (es reiniciava lastTs i prou), de manera que qualsevol jugada
// més ràpida que el tic (200 ms) sortia GRATIS i una ràfega de premoves
// jugava mig bullet amb el rellotge aturat.
// ---------------------------------------------------------------------------

// Rèplica fidel de la comptabilitat d'app.js (clockChargeActive, clockTick i
// clockOnMove), amb el temps injectat com a paràmetre per poder guionar la
// línia temporal: tics periòdics que cobren el bàndol actiu, i el pagament de
// la jugada que acaba el torn (residu del tram final + regles del nucli).
function createClockSim(baseMs, incMs) {
    return {
        white: baseMs,
        black: baseMs,
        inc: incMs || 0,
        active: 'w',
        lastTs: 0,
        turnSpentMs: 0,
        charge(now) {
            const delta = Core.clockTickDeltaMs(now, this.lastTs);
            // Com a app.js: el punter només avança; si el temps rebut recula,
            // moure'l enrere faria recobrar dues vegades el mateix tram.
            this.lastTs = Math.max(this.lastTs, now);
            if (this.active === 'w') this.white -= delta;
            else this.black -= delta;
            this.turnSpentMs += delta;
        },
        tick(now) { this.charge(now); },
        move(now, opts) {
            this.charge(now);
            const owedMs = Core.clockMoveSpendMs(this.turnSpentMs, opts || {});
            const shortfallMs = owedMs - this.turnSpentMs;
            if (shortfallMs > 0) {
                if (this.active === 'w') this.white -= shortfallMs;
                else this.black -= shortfallMs;
                this.turnSpentMs += shortfallMs;
            }
            // La bandera mana sobre l'increment (mateixa regla que app.js).
            const moverMs = this.active === 'w' ? this.white : this.black;
            if (this.inc > 0 && moverMs > 0) {
                if (this.active === 'w') this.white += this.inc;
                else this.black += this.inc;
            }
            this.active = this.active === 'w' ? 'b' : 'w';
            this.turnSpentMs = 0;
        }
    };
}

describe('clockTickDeltaMs', () => {
    test('un tic normal cobra el temps passat', () => {
        expect(Core.clockTickDeltaMs(1200, 1000)).toBe(200);
        expect(Core.clockTickDeltaMs(1000.5, 1000)).toBeCloseTo(0.5, 6);
    });

    test('un rellotge de sistema que recula no regala temps: delta 0, mai negatiu', () => {
        // Amb Date.now() això passa de debò (ajust NTP, canvi d'hora): restar
        // un delta negatiu SUMARIA temps al bàndol actiu.
        expect(Core.clockTickDeltaMs(900, 1000)).toBe(0);
        expect(Core.clockTickDeltaMs(1000, 1000)).toBe(0);
    });

    test('valors corruptes no rebenten ni regalen: 0', () => {
        expect(Core.clockTickDeltaMs(NaN, 1000)).toBe(0);
        expect(Core.clockTickDeltaMs(1000, undefined)).toBe(0);
        expect(Core.clockTickDeltaMs(null, null)).toBe(0);
        expect(Core.clockTickDeltaMs(Infinity, 0)).toBe(0);
    });
});

describe('clockMoveSpendMs', () => {
    test('una jugada normal paga exactament el temps real del torn', () => {
        expect(Core.clockMoveSpendMs(470)).toBe(470);
        expect(Core.clockMoveSpendMs(470.4)).toBe(470);
        expect(Core.clockMoveSpendMs(0)).toBe(0);
    });

    test('temps negatiu o corrupte val 0: cap jugada no pot APUJAR el rellotge', () => {
        expect(Core.clockMoveSpendMs(-350)).toBe(0);
        expect(Core.clockMoveSpendMs(NaN)).toBe(0);
        expect(Core.clockMoveSpendMs(undefined)).toBe(0);
    });

    test('una premove mai no és gratis: paga el mínim fix de 0,1 s', () => {
        expect(Core.CLOCK_PREMOVE_SPEND_MS).toBe(100);
        expect(Core.clockMoveSpendMs(0, { premove: true })).toBe(100);
        expect(Core.clockMoveSpendMs(3, { premove: true })).toBe(100);
        expect(Core.clockMoveSpendMs(99, { premove: true })).toBe(100);
        // Si el torn ha durat més que el mínim, es paga el temps real.
        expect(Core.clockMoveSpendMs(350, { premove: true })).toBe(350);
    });

    test('la compensació de latència queda topada pel sostre I pel temps real', () => {
        expect(Core.CLOCK_LAG_COMP_MAX_MS).toBe(200);
        // Dins del sostre: es descompta el que es demana.
        expect(Core.clockMoveSpendMs(500, { lagCompMs: 150 })).toBe(350);
        // Una compensació desorbitada queda al sostre (200 ms), no més.
        expect(Core.clockMoveSpendMs(500, { lagCompMs: 5000 })).toBe(300);
        // I mai per sobre del temps transcorregut: no es pot «tornar» més
        // temps del que s'ha gastat, així que el cost no baixa de zero.
        expect(Core.clockMoveSpendMs(80, { lagCompMs: 200 })).toBe(0);
        expect(Core.clockMoveSpendMs(80, { lagCompMs: -50 })).toBe(80);
        // La premove paga el mínim encara que la compensació la deixés a res.
        expect(Core.clockMoveSpendMs(40, { lagCompMs: 200, premove: true })).toBe(100);
    });
});

describe('ràfega de premoves consecutives (bullet 1+0, sense increment)', () => {
    // L'escenari de la denúncia: el jugador encadena premoves (torns de ~2 ms
    // de màquina) contra un rival que pensa ~1,15 s per jugada. Amb la
    // comptabilitat antiga el jugador pagava 0 ms per TOTA la partida.
    test('cada premove costa exactament el mínim i el rellotge només baixa', () => {
        const sim = createClockSim(60000, 0); // 1+0; blanc = jugador
        const PREMOVES = 25;
        const ENGINE_THINK_MS = 1150;
        let t = 0;
        let maxWhite = sim.white;
        let prevWhite = sim.white;

        for (let i = 0; i < PREMOVES; i++) {
            // Torn del jugador: la premove s'executa 2 ms després de rebre el
            // torn; cap tic (200 ms) no arriba a caure dins d'una finestra tan
            // curta, que és exactament el forat que abans la feia gratuïta.
            t += 2;
            sim.move(t, { premove: true });
            expect(prevWhite - sim.white).toBe(Core.CLOCK_PREMOVE_SPEND_MS);
            prevWhite = sim.white;
            maxWhite = Math.max(maxWhite, sim.white);

            // Torn del rival: cinc tics de 200 ms i el residu de 150 ms es
            // paga amb la jugada (abans, aquell residu també es perdonava).
            for (let k = 0; k < 5; k++) { t += 200; sim.tick(t); }
            t += ENGINE_THINK_MS - 5 * 200;
            sim.move(t, {});
            maxWhite = Math.max(maxWhite, sim.white);
        }

        // El jugador ha pagat 25 × 100 ms, ni un mil·lisegon menys.
        expect(sim.white).toBe(60000 - PREMOVES * Core.CLOCK_PREMOVE_SPEND_MS);
        // I el rival, TOT el temps que ha pensat, residu inclòs.
        expect(sim.black).toBe(60000 - PREMOVES * ENGINE_THINK_MS);
        // Sense increment, el rellotge del jugador no ha pujat mai.
        expect(maxWhite).toBe(60000);
    });

    test('ni un salt enrere del rellotge del sistema no fa pujar el marcador', () => {
        const sim = createClockSim(60000, 0);
        sim.tick(1000);         // tic normal: cobra 1 s al jugador
        expect(sim.white).toBe(59000);
        sim.tick(500);          // el rellotge de paret recula 500 ms
        expect(sim.white).toBe(59000); // delta negatiu = 0: cap regal
        sim.move(600, { premove: true }); // la jugada arriba «abans» del punter
        // Tampoc no es recobra res (el punter no ha reculat) ni cal el sòl de
        // la premove: el torn ja duia 1 s apuntat, més que el mínim.
        expect(sim.white).toBe(59000);
        expect(sim.black).toBe(60000);
        // I en tornar el temps a lloc, només es cobra el tram nou de debò.
        sim.tick(1200);
        expect(sim.black).toBe(59800);
    });

    test('una ràfega de premoves amb el rellotge al límit fa caure la bandera', () => {
        // 250 ms al marcador i tres premoves: la tercera no arriba viva.
        const sim = createClockSim(60000, 0);
        sim.white = 250;
        let t = 0;
        for (let i = 0; i < 3; i++) {
            t += 2;
            sim.move(t, { premove: true });   // torn del jugador
            t += 300;
            sim.move(t, {});                  // resposta del rival
        }
        expect(sim.white).toBeLessThanOrEqual(0);
    });
});

describe('increment: l\'únic camí legítim amunt', () => {
    test('amb increment, el rellotge puja NOMÉS per l\'increment en completar la jugada', () => {
        const sim = createClockSim(180000, 2000); // 3+2
        let t = 0;
        for (let k = 0; k < 25; k++) { t += 200; sim.tick(t); }
        sim.move(t, {}); // jugada de 5 s
        expect(sim.white).toBe(180000 - 5000 + 2000);
    });

    test('la bandera mana sobre l\'increment: pagar la jugada tard no cobra els 2 s', () => {
        const sim = createClockSim(180000, 2000);
        sim.white = 50; // li queden 50 ms i triga 80 ms a moure
        sim.move(80, {});
        expect(sim.white).toBe(-30); // caigut: sense increment de rescat
    });

    test('la premove també paga el mínim als ritmes amb increment', () => {
        const sim = createClockSim(180000, 2000);
        sim.move(2, { premove: true });
        expect(sim.white).toBe(180000 - 100 + 2000);
    });
});
