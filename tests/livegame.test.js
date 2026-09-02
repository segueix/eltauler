const Core = require('../core.js');
const { Chess } = require('chess.js');

// ---------------------------------------------------------------------------
// Partida en viu interrompuda. app.js desa una instantània de la partida en
// curs a cada jugada; si la pestanya mor o l'app es tanca, la pàgina d'inici
// ofereix reprendre-la. Aquí es prova la part pura: quines instantànies són
// vàlides, com es rejuguen amb chess.js REAL, quan NO s'ha d'oferir res
// (massa vella, buida, corrupta, il·legal o ja acabada) i el text del bàner.
// ---------------------------------------------------------------------------

const MIN = 60 * 1000;
const H = 60 * MIN;
const DAY = 24 * H;
const T0 = 1_700_000_000_000;

function snapshot(overrides) {
    return Object.assign({
        v: 1,
        mode: 'free',
        playerColor: 'w',
        moves: ['e4', 'e5', 'Nf3'],
        savedAt: T0,
        timeControlId: 'none',
        clock: null
    }, overrides || {});
}

describe('liveGameSnapshotIsValid', () => {
    test('instantània mínima vàlida', () => {
        expect(Core.liveGameSnapshotIsValid(snapshot())).toBe(true);
        expect(Core.liveGameSnapshotIsValid(snapshot({ mode: 'positional' }))).toBe(true);
        expect(Core.liveGameSnapshotIsValid(snapshot({ mode: 'league', playerColor: 'b' }))).toBe(true);
    });

    test('rebutja versions, modes i colors desconeguts', () => {
        expect(Core.liveGameSnapshotIsValid(snapshot({ v: 2 }))).toBe(false);
        expect(Core.liveGameSnapshotIsValid(snapshot({ mode: 'bundle' }))).toBe(false);
        expect(Core.liveGameSnapshotIsValid(snapshot({ mode: 'antidote' }))).toBe(false);
        expect(Core.liveGameSnapshotIsValid(snapshot({ playerColor: 'white' }))).toBe(false);
    });

    test('rebutja dades corruptes', () => {
        expect(Core.liveGameSnapshotIsValid(null)).toBe(false);
        expect(Core.liveGameSnapshotIsValid('e4 e5')).toBe(false);
        expect(Core.liveGameSnapshotIsValid(snapshot({ moves: 'e4 e5' }))).toBe(false);
        expect(Core.liveGameSnapshotIsValid(snapshot({ moves: ['e4', 5] }))).toBe(false);
        expect(Core.liveGameSnapshotIsValid(snapshot({ moves: ['e4', ''] }))).toBe(false);
        expect(Core.liveGameSnapshotIsValid(snapshot({ savedAt: 'ahir' }))).toBe(false);
        expect(Core.liveGameSnapshotIsValid(snapshot({ savedAt: NaN }))).toBe(false);
    });

    test('el rellotge, si n\'hi ha, ha de ser coherent i no pot ser a zero', () => {
        expect(Core.liveGameSnapshotIsValid(snapshot({ clock: { white: 120000, black: 90000 } }))).toBe(true);
        expect(Core.liveGameSnapshotIsValid(snapshot({ clock: { white: 0, black: 90000 } }))).toBe(false);
        expect(Core.liveGameSnapshotIsValid(snapshot({ clock: { white: 120000, black: -5 } }))).toBe(false);
        expect(Core.liveGameSnapshotIsValid(snapshot({ clock: { white: '120000', black: 90000 } }))).toBe(false);
        expect(Core.liveGameSnapshotIsValid(snapshot({ clock: 'sí' }))).toBe(false);
    });
});

describe('liveGameReplay', () => {
    test('rejuga jugades legals i deixa la posició en viu', () => {
        const chess = Core.liveGameReplay(Chess, ['e4', 'e5', 'Nf3', 'Nc6']);
        expect(chess).not.toBeNull();
        expect(chess.history()).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
        expect(chess.turn()).toBe('w');
    });

    test('accepta SAN «sloppy» (sense símbols d\'escac ni de mat)', () => {
        const chess = Core.liveGameReplay(Chess, ['e4', 'f5', 'Qh5', 'g6', 'Qxg6', 'hxg6']);
        expect(chess).not.toBeNull();
        expect(Core.liveGameReplay(Chess, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O'])).not.toBeNull();
        // L'app desa la SAN que genera chess.js (mai zeros a l'enroc), però si
        // arribés un enroc amb zeros la instantània es descarta en lloc de
        // reprendre una partida a mitges.
        expect(Core.liveGameReplay(Chess, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', '0-0'])).toBeNull();
    });

    test('una jugada il·legal invalida la instantània sencera', () => {
        expect(Core.liveGameReplay(Chess, ['e4', 'e5', 'Ke2'])).not.toBeNull();
        expect(Core.liveGameReplay(Chess, ['e4', 'e5', 'Ke3'])).toBeNull();
        expect(Core.liveGameReplay(Chess, ['e4', 'blah'])).toBeNull();
    });

    test('entrades invàlides', () => {
        expect(Core.liveGameReplay(null, ['e4'])).toBeNull();
        expect(Core.liveGameReplay(Chess, 'e4')).toBeNull();
        expect(Core.liveGameReplay(Chess, [])).not.toBeNull();
    });
});

describe('liveGameResumeInfo', () => {
    test('descriu una partida a mig fer', () => {
        const info = Core.liveGameResumeInfo(snapshot(), T0 + 5 * MIN, Chess);
        expect(info).not.toBeNull();
        expect(info.mode).toBe('free');
        expect(info.modeLabel).toBe('Nova partida');
        expect(info.movesCount).toBe(3);
        expect(info.fullMoves).toBe(2);
        expect(info.playerColor).toBe('w');
        // Després d'e4 e5 Cf3 toca a les negres: el jugador (blanques) espera.
        expect(info.playerToMove).toBe(false);
        expect(info.fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
        expect(info.ageMs).toBe(5 * MIN);
        expect(info.timeControlId).toBe('none');
        expect(info.clock).toBeNull();
    });

    test('el torn del jugador depèn del seu color', () => {
        const info = Core.liveGameResumeInfo(snapshot({ playerColor: 'b' }), T0, Chess);
        expect(info.playerToMove).toBe(true);
    });

    test('sense chess.js encara descriu la partida (torn per paritat)', () => {
        const info = Core.liveGameResumeInfo(snapshot(), T0);
        expect(info).not.toBeNull();
        expect(info.fen).toBeNull();
        expect(info.playerToMove).toBe(false);
    });

    test('no ofereix res sense cap jugada', () => {
        expect(Core.liveGameResumeInfo(snapshot({ moves: [] }), T0, Chess)).toBeNull();
    });

    test('caduca al cap de 7 dies; un rellotge del sistema endarrerit no la mata', () => {
        expect(Core.liveGameResumeInfo(snapshot(), T0 + 6 * DAY, Chess)).not.toBeNull();
        expect(Core.liveGameResumeInfo(snapshot(), T0 + 8 * DAY, Chess)).toBeNull();
        const skewed = Core.liveGameResumeInfo(snapshot(), T0 - 2 * H, Chess);
        expect(skewed).not.toBeNull();
        expect(skewed.ageMs).toBe(0);
    });

    test('una partida ja acabada al tauler no es reprèn', () => {
        const mate = snapshot({ moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'] });
        expect(Core.liveGameResumeInfo(mate, T0, Chess)).toBeNull();
    });

    test('jugades il·legals o instantània invàlida → res', () => {
        expect(Core.liveGameResumeInfo(snapshot({ moves: ['e4', 'e4'] }), T0, Chess)).toBeNull();
        expect(Core.liveGameResumeInfo(snapshot({ v: 0 }), T0, Chess)).toBeNull();
        expect(Core.liveGameResumeInfo(null, T0, Chess)).toBeNull();
    });

    test('conserva el rellotge desat', () => {
        const info = Core.liveGameResumeInfo(
            snapshot({ timeControlId: '3+2', clock: { white: 100000, black: 85000 } }), T0, Chess);
        expect(info.clock).toEqual({ white: 100000, black: 85000 });
        expect(info.timeControlId).toBe('3+2');
    });

    test('la instantània no es modifica', () => {
        const snap = snapshot();
        const info = Core.liveGameResumeInfo(snap, T0, Chess);
        info.moves.push('Nc6');
        expect(snap.moves).toEqual(['e4', 'e5', 'Nf3']);
    });
});

describe('liveGameAgeLabel i liveGameBannerText', () => {
    test('edat llegible', () => {
        expect(Core.liveGameAgeLabel(0)).toBe('ara mateix');
        expect(Core.liveGameAgeLabel(30 * 1000)).toBe('ara mateix');
        expect(Core.liveGameAgeLabel(3 * MIN)).toBe('fa 3 min');
        expect(Core.liveGameAgeLabel(2 * H + 10 * MIN)).toBe('fa 2 h');
        expect(Core.liveGameAgeLabel(DAY)).toBe('fa 1 dia');
        expect(Core.liveGameAgeLabel(3 * DAY)).toBe('fa 3 dies');
        expect(Core.liveGameAgeLabel(NaN)).toBe('ara mateix');
    });

    test('text del bàner amb i sense rellotge', () => {
        const info = Core.liveGameResumeInfo(snapshot(), T0 + 3 * MIN, Chess);
        const text = Core.liveGameBannerText(info, null);
        expect(text.title).toBe('Tens una partida a mig fer');
        expect(text.detail).toBe('Nova partida · amb blanques · 2 jugades · toca moure al rival · fa 3 min');

        const timed = Core.liveGameResumeInfo(
            snapshot({ mode: 'league', playerColor: 'b', moves: ['e4'], timeControlId: '3+2', clock: { white: 170000, black: 180000 } }),
            T0, Chess);
        const t2 = Core.liveGameBannerText(timed, 'Blitz 3+2');
        expect(t2.detail).toBe('Lliga · amb negres · Blitz 3+2 · 1 jugada · et toca moure · ara mateix');
    });

    test('partida de calibratge', () => {
        const info = Core.liveGameResumeInfo(snapshot({ calibration: true }), T0, Chess);
        expect(Core.liveGameBannerText(info, null).title).toBe('Partida de calibratge a mig fer');
        expect(Core.liveGameBannerText(null)).toBeNull();
    });
});
