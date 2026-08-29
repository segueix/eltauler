const Core = require('../core.js');

// ---------------------------------------------------------------------------
// Partides diàries (correspondència contra el motor): 24 h per jugada del
// jugador i resposta del motor EXACTAMENT 3 h després de cada jugada seva.
// Aquestes proves fixen el contracte temporal del mode: qui té el torn, quan
// venç cada termini, què li toca fer al mantenidor (dailyNextAction) i com es
// mostra el compte enrere. Tot amb el temps injectat, sense rellotge real.
// ---------------------------------------------------------------------------

const H = 60 * 60 * 1000;
const MIN = 60 * 1000;
const T0 = 1_700_000_000_000; // instant arbitrari de referència

function entry(overrides) {
    return Object.assign({
        playerColor: 'w',
        movesSan: [],
        turnStartedAt: T0,
        status: 'active'
    }, overrides || {});
}

describe('configuració del ritme diari', () => {
    test('24 h per moure i 3 h de resposta del motor', () => {
        expect(Core.DAILY_CONFIG.MOVE_MS).toBe(24 * H);
        expect(Core.DAILY_CONFIG.ENGINE_REPLY_MS).toBe(3 * H);
        expect(Core.DAILY_CONFIG.MAX_ACTIVE).toBeGreaterThan(1); // se'n poden jugar vàries alhora
    });
});

describe('dailySideToMove / dailyIsPlayerTurn', () => {
    test('les blanques mouen amb un nombre parell de jugades fetes', () => {
        expect(Core.dailySideToMove(0)).toBe('w');
        expect(Core.dailySideToMove(1)).toBe('b');
        expect(Core.dailySideToMove(2)).toBe('w');
        expect(Core.dailySideToMove(7)).toBe('b');
    });

    test('valors degenerats compten com a cap jugada', () => {
        expect(Core.dailySideToMove(undefined)).toBe('w');
        expect(Core.dailySideToMove(-3)).toBe('w');
    });

    test('torn del jugador segons el seu color i les jugades fetes', () => {
        expect(Core.dailyIsPlayerTurn(entry({ playerColor: 'w', movesSan: [] }))).toBe(true);
        expect(Core.dailyIsPlayerTurn(entry({ playerColor: 'w', movesSan: ['e4'] }))).toBe(false);
        expect(Core.dailyIsPlayerTurn(entry({ playerColor: 'b', movesSan: [] }))).toBe(false);
        expect(Core.dailyIsPlayerTurn(entry({ playerColor: 'b', movesSan: ['e4'] }))).toBe(true);
    });
});

describe('terminis', () => {
    test('el jugador té 24 h des que rep el torn', () => {
        const e = entry({ playerColor: 'w', movesSan: [], turnStartedAt: T0 });
        expect(Core.dailyPlayerDeadlineMs(e)).toBe(T0 + 24 * H);
        expect(Core.dailyEngineDueMs(e)).toBeNull();
    });

    test('el motor respon 3 h després de la jugada del jugador', () => {
        const e = entry({ playerColor: 'w', movesSan: ['e4'], turnStartedAt: T0 });
        expect(Core.dailyEngineDueMs(e)).toBe(T0 + 3 * H);
        expect(Core.dailyPlayerDeadlineMs(e)).toBeNull();
    });

    test('la PRIMERA jugada del motor (jugador amb negres) no espera les 3 h', () => {
        const e = entry({ playerColor: 'b', movesSan: [], turnStartedAt: T0 });
        expect(Core.dailyEngineDueMs(e)).toBe(T0);
    });

    test('una partida acabada no té cap termini viu', () => {
        const e = entry({ status: 'finished' });
        expect(Core.dailyPlayerDeadlineMs(e)).toBeNull();
        expect(Core.dailyEngineDueMs(e)).toBeNull();
    });
});

describe('dailyNextAction', () => {
    test('dins del termini del jugador no hi ha res a fer', () => {
        const e = entry({ playerColor: 'w', movesSan: [] });
        expect(Core.dailyNextAction(e, T0 + 23 * H).kind).toBe('none');
        // El venciment exacte encara no és fora de termini (24 h justes).
        expect(Core.dailyNextAction(e, T0 + 24 * H).kind).toBe('none');
    });

    test('passades les 24 h, el jugador perd per temps', () => {
        const e = entry({ playerColor: 'w', movesSan: [] });
        const action = Core.dailyNextAction(e, T0 + 24 * H + 1);
        expect(action.kind).toBe('player_timeout');
        expect(action.at).toBe(T0 + 24 * H);
    });

    test('el motor NO mou abans de les 3 h; a partir de les 3 h mou amb marca oficial', () => {
        const e = entry({ playerColor: 'w', movesSan: ['e4'], turnStartedAt: T0 });
        expect(Core.dailyNextAction(e, T0 + 3 * H - 1).kind).toBe('none');
        const action = Core.dailyNextAction(e, T0 + 3 * H);
        expect(action.kind).toBe('engine_move');
        expect(action.at).toBe(T0 + 3 * H);
        // Encara que l'app s'obri molt més tard, la marca oficial és la del venciment.
        expect(Core.dailyNextAction(e, T0 + 30 * H).at).toBe(T0 + 3 * H);
    });

    test('jugador amb negres: la primera jugada del motor toca a l\'instant', () => {
        const e = entry({ playerColor: 'b', movesSan: [], turnStartedAt: T0 });
        const action = Core.dailyNextAction(e, T0);
        expect(action.kind).toBe('engine_move');
        expect(action.at).toBe(T0);
    });

    test('una partida acabada mai no demana res', () => {
        const e = entry({ status: 'finished', movesSan: [] });
        expect(Core.dailyNextAction(e, T0 + 100 * H).kind).toBe('none');
    });

    test('cadena sencera: jugada → resposta del motor → nou termini de 24 h', () => {
        // El jugador (blanques) mou a T0: comença l'espera del motor.
        const e = entry({ playerColor: 'w', movesSan: ['e4'], turnStartedAt: T0 });
        const engineAt = Core.dailyNextAction(e, T0 + 5 * H).at;
        expect(engineAt).toBe(T0 + 3 * H);
        // El mantenidor aplica la jugada del motor amb la marca oficial.
        e.movesSan.push('e5');
        e.turnStartedAt = engineAt;
        // El nou venciment del jugador compta des de la marca OFICIAL (T0+3h),
        // no des del moment en què l'app ha aplicat la jugada (T0+5h).
        expect(Core.dailyPlayerDeadlineMs(e)).toBe(T0 + 27 * H);
        expect(Core.dailyNextAction(e, T0 + 27 * H + 1).kind).toBe('player_timeout');
    });
});

describe('dailyCountdownLabel', () => {
    test('amb hores per davant mostra hores i minuts', () => {
        expect(Core.dailyCountdownLabel(23 * H + 40 * MIN)).toBe('23 h 40 min');
        expect(Core.dailyCountdownLabel(2 * H)).toBe('2 h');
    });

    test('per sota de l\'hora passa a minuts, i el tram final té nom propi', () => {
        expect(Core.dailyCountdownLabel(59 * MIN)).toBe('59 min');
        expect(Core.dailyCountdownLabel(30 * 1000)).toBe('1 min'); // s'arrodoneix cap amunt
        expect(Core.dailyCountdownLabel(0)).toBe('temps esgotat');
        expect(Core.dailyCountdownLabel(-5)).toBe('temps esgotat');
    });
});

describe('ordre de les miniatures a la pàgina principal', () => {
    // Tres partides on et toca moure (venciments diferents), dues esperant el
    // rival i una d'acabada: l'ordre ha de ser el de la urgència.
    function board(overrides) { return entry(overrides); }

    test('primer les teves jugades (la que venç abans), després les que esperen menys', () => {
        const games = [
            // Espera el rival: respon d'aquí a 3 h (turnStartedAt = ara).
            board({ id: 'espera-llarga', playerColor: 'w', movesSan: ['e4'], turnStartedAt: T0, createdAt: 1 }),
            // Et toca moure i et queden 20 h (va rebre el torn fa 4 h).
            board({ id: 'meu-20h', playerColor: 'w', movesSan: [], turnStartedAt: T0 - 4 * H, createdAt: 2 }),
            // Espera el rival: respon d'aquí a 1 h.
            board({ id: 'espera-curta', playerColor: 'w', movesSan: ['d4'], turnStartedAt: T0 - 2 * H, createdAt: 3 }),
            // Et toca moure i només et queden 2 h: la més urgent de totes.
            board({ id: 'meu-2h', playerColor: 'w', movesSan: [], turnStartedAt: T0 - 22 * H, createdAt: 4 })
        ];
        const order = Core.dailyOrderedGames(games, T0).map(g => g.id);
        expect(order).toEqual(['meu-2h', 'meu-20h', 'espera-curta', 'espera-llarga']);
    });

    test('les acabades queden al final, per ordre d\'acabament', () => {
        const games = [
            board({ id: 'acabada-vella', status: 'finished', finishedAt: T0 - 5 * H, createdAt: 1 }),
            board({ id: 'meva', playerColor: 'w', movesSan: [], turnStartedAt: T0, createdAt: 2 }),
            board({ id: 'acabada-nova', status: 'finished', finishedAt: T0 - 1 * H, createdAt: 3 })
        ];
        const order = Core.dailyOrderedGames(games, T0).map(g => g.id);
        expect(order).toEqual(['meva', 'acabada-vella', 'acabada-nova']);
    });

    test('amb el mateix venciment mana l\'ordre de creació (no ballen de lloc)', () => {
        const games = [
            board({ id: 'segona', playerColor: 'w', movesSan: [], turnStartedAt: T0, createdAt: 200 }),
            board({ id: 'primera', playerColor: 'w', movesSan: [], turnStartedAt: T0, createdAt: 100 })
        ];
        expect(Core.dailyOrderedGames(games, T0).map(g => g.id)).toEqual(['primera', 'segona']);
        // I repetir l'ordenació no canvia res.
        const once = Core.dailyOrderedGames(games, T0);
        expect(Core.dailyOrderedGames(once, T0).map(g => g.id)).toEqual(['primera', 'segona']);
    });

    test('no toca la llista original i tolera entrades buides', () => {
        const games = [null, board({ id: 'a', createdAt: 1 })];
        const copy = games.slice();
        expect(Core.dailyOrderedGames(games, T0).map(g => g.id)).toEqual(['a']);
        expect(games).toEqual(copy);
        expect(Core.dailyOrderedGames(undefined, T0)).toEqual([]);
    });

    test('el grup de cada partida', () => {
        expect(Core.dailyCardGroup(board({ playerColor: 'w', movesSan: [] }))).toBe(Core.DAILY_CARD_GROUP.PLAYER);
        expect(Core.dailyCardGroup(board({ playerColor: 'w', movesSan: ['e4'] }))).toBe(Core.DAILY_CARD_GROUP.ENGINE);
        expect(Core.dailyCardGroup(board({ status: 'finished' }))).toBe(Core.DAILY_CARD_GROUP.FINISHED);
    });
});

describe('carrusel de les miniatures', () => {
    test('només al mòbil i només amb MÉS de dues partides', () => {
        expect(Core.dailyUsesCarousel(1, 'mobile')).toBe(false);
        expect(Core.dailyUsesCarousel(2, 'mobile')).toBe(false);
        expect(Core.dailyUsesCarousel(3, 'mobile')).toBe(true);
        expect(Core.dailyUsesCarousel(7, 'mobile')).toBe(true);
    });

    test('mai a la tauleta ni a l\'ordinador, per moltes que n\'hi hagi', () => {
        expect(Core.dailyUsesCarousel(5, 'tablet')).toBe(false);
        expect(Core.dailyUsesCarousel(5, 'desktop')).toBe(false);
        expect(Core.dailyUsesCarousel(5, undefined)).toBe(false);
    });

    test('el llindar és el documentat', () => {
        expect(Core.DAILY_CAROUSEL_MIN_CARDS).toBe(3);
    });
});
