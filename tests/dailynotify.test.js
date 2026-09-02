const Core = require('../core.js');

// ---------------------------------------------------------------------------
// Avisos de les partides diàries: quan toca avisar que s'acaba el termini de
// 24 h (una vegada per torn, dins de les 2 últimes hores) i què diu cada avís.
// La mecànica del ritme (torn, terminis) ja es prova a daily.test.js.
// ---------------------------------------------------------------------------

const H = 60 * 60 * 1000;
const MIN = 60 * 1000;
const T0 = 1_700_000_000_000;

function entry(overrides) {
    return Object.assign({
        id: 'daily_1',
        playerColor: 'w',
        movesSan: [],
        turnStartedAt: T0,
        status: 'active'
    }, overrides || {});
}

describe('dailyDeadlineWarningDue', () => {
    test('avisa dins de les 2 últimes hores del termini del jugador', () => {
        expect(Core.DAILY_WARN_BEFORE_MS).toBe(2 * H);
        const e = entry();
        expect(Core.dailyDeadlineWarningDue(e, T0 + 10 * H, null)).toBe(false);
        expect(Core.dailyDeadlineWarningDue(e, T0 + 22 * H - MIN, null)).toBe(false);
        expect(Core.dailyDeadlineWarningDue(e, T0 + 22 * H, null)).toBe(true);
        expect(Core.dailyDeadlineWarningDue(e, T0 + 23 * H + 59 * MIN, null)).toBe(true);
    });

    test('un cop vençut el termini ja no avisa (és una derrota, no un avís)', () => {
        expect(Core.dailyDeadlineWarningDue(entry(), T0 + 24 * H + 1, null)).toBe(false);
    });

    test('una sola vegada per torn: el torn s\'identifica per la marca d\'inici', () => {
        const e = entry();
        expect(Core.dailyDeadlineWarningDue(e, T0 + 23 * H, T0)).toBe(false);
        expect(Core.dailyDeadlineWarningDue(e, T0 + 23 * H, T0 - 1)).toBe(true);
        expect(Core.dailyDeadlineWarningDue(e, T0 + 23 * H, String(T0))).toBe(false);
    });

    test('no avisa si no li toca moure al jugador ni si la partida és acabada', () => {
        // Toca al motor (una jugada de blanques feta, jugador blanques)
        expect(Core.dailyDeadlineWarningDue(entry({ movesSan: ['e4'] }), T0 + 23 * H, null)).toBe(false);
        expect(Core.dailyDeadlineWarningDue(entry({ status: 'finished' }), T0 + 23 * H, null)).toBe(false);
        expect(Core.dailyDeadlineWarningDue(null, T0, null)).toBe(false);
    });

    test('jugador amb negres: el torn arriba amb la primera jugada del motor', () => {
        const e = entry({ playerColor: 'b', movesSan: ['e4'] });
        expect(Core.dailyDeadlineWarningDue(e, T0 + 23 * H, null)).toBe(true);
    });
});

describe('dailyNotificationText', () => {
    test('resposta del rival', () => {
        const t = Core.dailyNotificationText('reply', entry(), { san: 'Nf3' });
        expect(t.title).toBe('🕐 Partida diària');
        expect(t.body).toBe('El rival ha respost Nf3. Tens 24 hores per fer la teva jugada.');
        expect(Core.dailyNotificationText('reply', entry()).body).toBe('El rival ha respost. Tens 24 hores per fer la teva jugada.');
    });

    test('termini a punt de vèncer', () => {
        expect(Core.dailyNotificationText('deadline', entry(), { remainingMs: 90 * MIN }).body)
            .toBe('Et queda 1 h 30 min per fer la teva jugada.');
        expect(Core.dailyNotificationText('deadline', entry(), { remainingMs: 25 * MIN }).body)
            .toBe('Et queda 25 min per fer la teva jugada.');
    });

    test('derrota per temps i finals de partida', () => {
        expect(Core.dailyNotificationText('timeout', entry()).body).toMatch(/perdut la partida per temps/);
        expect(Core.dailyNotificationText('finished', entry({ result: 'win' })).body).toBe('Has guanyat la partida diària!');
        expect(Core.dailyNotificationText('finished', entry(), { result: 'loss' }).body).toBe('Has perdut la partida diària.');
        expect(Core.dailyNotificationText('finished', entry({ result: 'draw' })).body).toBe('La partida diària ha acabat en taules.');
    });

    test('tipus desconegut: text genèric, mai undefined', () => {
        const t = Core.dailyNotificationText('???', null);
        expect(typeof t.body).toBe('string');
        expect(t.body).not.toMatch(/undefined/);
    });
});
